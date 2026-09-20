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


def fixture(version='1.2.3'):
    tag = 'v' + version
    names = mirror.names(version)
    payloads = {name: name.encode() for name in [*names.values(), names['windows']+'.blockmap', 'latest.yml']}
    for platform, name in names.items():
        payloads[f'SHA256SUMS-{platform}.txt'] = f'{hashlib.sha256(payloads[name]).hexdigest()}  {name}\n'.encode()
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
            name=mirror.names('1.2.3')['windows']
            (seed/name).write_bytes(b'bad')
            with self.assertRaises(ValueError): mirror.sync(root,seed)
            self.assertFalse((root/'current').exists())
            (seed/name).write_bytes(payloads[name])
            mirror.sync(root,seed)
            self.assertEqual((root/'current/windows').read_bytes(),payloads[name])

    def test_only_complete_stable_releases(self):
        data,_=fixture()
        self.assertEqual(mirror.validate_release(data)['version'],'1.2.3')
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
                self.assertEqual(json.loads((root/'current/release.json').read_text())['version'],'1.2.3')
                mirror.sync(root)
                data,payloads=fixture('1.2.4')
                with patch.object(mirror,'download',side_effect=OSError('network failure')):
                    with self.assertRaises(OSError): mirror.sync(root)
                self.assertEqual(json.loads((root/'current/release.json').read_text())['version'],'1.2.3')
                mirror.sync(root)
                self.assertEqual((root/'current/windows').read_bytes(),payloads[mirror.names('1.2.4')['windows']])
                data,payloads=fixture('1.2.2')
                with self.assertRaises(ValueError): mirror.sync(root)


if __name__=='__main__': unittest.main()
