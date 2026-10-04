import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('mirror', Path(__file__).with_name('sync-releases.py'))
mirror = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mirror)


def fixture(version='0.4.3'):
    tag = 'v' + version
    names = mirror.names(version)
    payloads = {name: name.encode() for name in [*names.values(), names['windows']+'.blockmap', 'latest.yml']}
    if 'android' in names:
        apk = {'applicationId':'com.paperenjoyer.android', 'version':version, 'versionCode':4004,
               'minSdk':29,'targetSdk':36,'debuggable':False,'v1':True,'v2':True,'v3':True,
               'certificateSha256':'c'*64,'sha256':hashlib.sha256(payloads[names['android']]).hexdigest(),
               'size':len(payloads[names['android']])}
        reports = [{'kind':kind,'api':api,'emulated':kind=='emulator','applicationId':apk['applicationId'],
                    'version':version,'apkSha256':apk['sha256'],'certificateSha256':apk['certificateSha256'],
                    'sourceSha':'b'*40,'deviceHash':'d'*16,'completedAt':'2026-10-04T09:00:00Z','operator':'tester',
                    'checks':['install-open-import-offline-force-stop-upgrade',*mirror.ANDROID_CHECKS]}
                   for kind,api in [('emulator',29),('emulator',36),('physical',35)]]
        payloads['android-build-proof.json'] = json.dumps({'platform':'android','version':version,'dirty':False,
                                                        'sourceSha':'b'*40,'apk':apk,'acceptance':reports}).encode()
    for platform, name in names.items():
        payloads[f'SHA256SUMS-{platform}.txt'] = f'{hashlib.sha256(payloads[name]).hexdigest()}  {name}\n'.encode()
        if platform == 'android':
            payloads[f'SHA256SUMS-{platform}.txt'] += f"{hashlib.sha256(payloads['android-build-proof.json']).hexdigest()}  android-build-proof.json\n".encode()
    release = {'tag_name': tag, 'draft':False, 'prerelease':False, 'published_at':'2026-09-20T00:00:00Z',
               'html_url':f'https://github.com/{mirror.REPOSITORY}/releases/tag/{tag}', 'assets':[]}
    for name, value in payloads.items():
        release['assets'].append({'name':name, 'size':len(value), 'state':'uploaded',
            'digest':'sha256:'+hashlib.sha256(value).hexdigest(),
            'browser_download_url':f'https://github.com/{mirror.REPOSITORY}/releases/download/{tag}/{name}'})
    return release,payloads


class MirrorTests(unittest.TestCase):
    def test_parallel_ranges_preserve_exact_bytes(self):
        payload=b'12345678' * (2 * 1024 * 1024 + 1)
        asset={'githubUrl':'https://github.com/asset','size':len(payload),'sha256':hashlib.sha256(payload).hexdigest()}
        seen=[]
        def response(url, headers=None, method='GET'):
            if method=='HEAD':
                r=io.BytesIO();r.url='https://release-assets.githubusercontent.com/asset';return r
            start,end=map(int,headers['Range'].split('=')[1].split('-'))
            seen.append((start,end))
            r=io.BytesIO(payload[start:end+1]);r.url=url;r.status=206
            r.headers={'Content-Range':f'bytes {start}-{end}/{len(payload)}'}
            return r
        with tempfile.TemporaryDirectory() as temp, patch.object(mirror,'request',response):
            target=Path(temp)/'installer'
            mirror.download_ranges(asset,target)
            self.assertEqual(target.read_bytes(),payload)
            self.assertEqual(len(seen),3)

    def test_seed_is_checked_before_publication(self):
        data,payloads=fixture()
        def response(*args):
            r=io.BytesIO(json.dumps(data).encode());r.headers={};return r
        with tempfile.TemporaryDirectory() as temp, patch.object(mirror,'request',response):
            root=Path(temp)/'mirror';root.mkdir()
            seed=Path(temp)/'seed';seed.mkdir()
            for name,value in payloads.items(): (seed/name).write_bytes(value)
            name=mirror.names('0.4.3')['windows']
            (seed/name).write_bytes(b'bad')
            with self.assertRaises(ValueError): mirror.sync(root,seed)
            self.assertFalse((root/'current').exists())
            (seed/name).write_bytes(payloads[name])
            mirror.sync(root,seed)
            self.assertEqual((root/'current/windows').read_bytes(),payloads[name])

    def test_only_complete_stable_releases(self):
        data,_=fixture()
        self.assertEqual(mirror.validate_release(data)['version'],'0.4.3')
        for field,value in [('draft',True),('prerelease',True),('tag_name','v1.2.3-beta'),('tag_name','v01.2.3')]:
            with self.assertRaises(ValueError): mirror.validate_release({**data,field:value})
        data['assets'].pop()
        with self.assertRaises(ValueError): mirror.validate_release(data)

    def test_bad_checksum_never_publishes_download(self):
        data,_=fixture()
        asset=next(iter(mirror.validate_release(data)['files'].values()))
        def response(*args):
            r=io.BytesIO(b'bad');r.url=asset['githubUrl'];return r
        with tempfile.TemporaryDirectory() as temp, patch.object(mirror,'request',response), patch.object(mirror.time,'sleep'):
            with self.assertRaises(ValueError): mirror.download(asset,Path(temp)/'file')

    def test_atomic_publish_failure_retention_and_no_downgrade(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            data,payloads=fixture()
            def response(*args):
                r=io.BytesIO(json.dumps(data).encode());r.headers={};return r
            def download(asset,destination): destination.write_bytes(payloads[asset['name']])
            with patch.object(mirror,'request',response), patch.object(mirror,'download',download):
                mirror.sync(root)
                self.assertEqual(json.loads((root/'current/release.json').read_text())['version'],'0.4.3')
                mirror.sync(root)
                data,payloads=fixture('0.4.4')
                with patch.object(mirror,'download',side_effect=OSError('network failure')):
                    with self.assertRaises(OSError): mirror.sync(root)
                self.assertEqual(json.loads((root/'current/release.json').read_text())['version'],'0.4.3')
                with self.assertRaises(ValueError): mirror.sync(root)
                self.assertEqual(json.loads((root/'current/release.json').read_text())['version'],'0.4.3')
                data,payloads=fixture('0.4.2')
                with self.assertRaises(ValueError): mirror.sync(root)

    def test_android_signature_identity_and_full_acceptance_precede_publication(self):
        data,payloads=fixture('0.4.4')
        manifest=mirror.validate_release(data)
        identity={'applicationId':'com.paperenjoyer.android','certificateSha256':'c'*64}
        signature='Signer #1 certificate SHA-256 digest: '+ 'c'*64 + '\n' + '\n'.join('Verified using '+s+' scheme: true' for s in ['v1','v2','v3'])
        badging="package: name='com.paperenjoyer.android' versionCode='4004' versionName='0.4.4'\nsdkVersion:'29'\ntargetSdkVersion:'36'"
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            for name,value in payloads.items(): (root/name).write_bytes(value)
            mirror.verify_sums(root,manifest)
            with patch.object(mirror.subprocess,'run',side_effect=[type('Result',(),{'stdout':signature})(),type('Result',(),{'stdout':badging})()]) as commands:
                mirror.verify_android(root,manifest,identity)
                self.assertEqual(commands.call_args_list[0].args[0][0],'apksigner')
            with self.assertRaises(ValueError): mirror.verify_android(root,manifest,{**identity,'certificateSha256':'e'*64})
            proof=json.loads(payloads['android-build-proof.json'])
            proof['acceptance']=[r for r in proof['acceptance'] if r['kind'] != 'physical']
            (root/'android-build-proof.json').write_text(json.dumps(proof))
            with self.assertRaises(ValueError): mirror.verify_android(root,manifest,identity)


if __name__=='__main__': unittest.main()
