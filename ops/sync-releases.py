#!/usr/bin/env python3
"""Publish a verified, atomic local mirror of the public GitHub stable release."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

REPOSITORY = "watericetangcw/PaperEnjoyer-Releases"
ORIGIN = "https://paperenjoyer.com"
API = f"https://api.github.com/repos/{REPOSITORY}/releases/latest"
TAG = re.compile(r"v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)\Z")


def version_tuple(tag):
    match = TAG.fullmatch(tag)
    if not match or any(int(n) > 65535 for n in match.groups()):
        raise ValueError("Invalid stable version")
    return tuple(map(int, match.groups()))


def names(version):
    result = {"windows": f"PaperEnjoyer-{version}-Setup.exe",
            "mac": f"PaperEnjoyer-{version}-macOS-arm64.dmg",
            "linux": f"PaperEnjoyer-{version}-Linux-amd64.deb"}
    if version_tuple('v' + version) >= (0, 4, 4):
        result['android'] = f"PaperEnjoyer-{version}-Android.apk"
    return result


def validate_release(data):
    tag = data["tag_name"]
    version_tuple(tag)
    if data.get("draft") or data.get("prerelease"):
        raise ValueError("Not a published stable release")
    if data.get("html_url") != f"https://github.com/{REPOSITORY}/releases/tag/{tag}":
        raise ValueError("Unexpected release repository")
    datetime.datetime.fromisoformat(data["published_at"].replace("Z", "+00:00"))
    platform_names = names(tag[1:])
    expected = [*platform_names.values(), platform_names["windows"] + ".blockmap", "latest.yml",
                *[f"SHA256SUMS-{p}.txt" for p in platform_names]]
    if 'android' in platform_names:
        expected.append('android-build-proof.json')
    files = {}
    for name in expected:
        matches = [a for a in data["assets"] if a.get("name") == name]
        if len(matches) != 1:
            raise ValueError(f"Missing or duplicate asset: {name}")
        asset = matches[0]
        url = f"https://github.com/{REPOSITORY}/releases/download/{tag}/{name}"
        if (asset.get("state") != "uploaded" or type(asset.get("size")) is not int or asset["size"] <= 0
                or asset.get("browser_download_url") != url
                or not re.fullmatch(r"sha256:[a-f0-9]{64}", asset.get("digest") or "")):
            raise ValueError(f"Incomplete or invalid asset: {name}")
        files[name] = {"name": name, "size": asset["size"], "sha256": asset["digest"][7:],
                       "githubUrl": url, "url": f"{ORIGIN}/downloads/{tag}/{name}"}
    return {"schemaVersion": 1, "version": tag[1:], "publishedAt": data["published_at"],
            "pageUrl": data["html_url"], "files": files,
            "assets": {p: files[n] for p, n in platform_names.items()}}


def request(url, headers=None, method='GET'):
    return urllib.request.urlopen(urllib.request.Request(url, headers={
        "User-Agent": "PaperEnjoyer-release-mirror", **(headers or {})}, method=method), timeout=30)


def check_redirect(url):
    final = urllib.parse.urlparse(url)
    if final.scheme != 'https' or not (final.hostname == 'github.com' or
            final.hostname.endswith('.githubusercontent.com') or
            final.hostname.endswith('.blob.core.windows.net')):
        raise ValueError('Unexpected download redirect')


def download_ranges(asset, destination):
    """Bounded parallel ranges avoid very slow single TCP streams to GitHub's CDN."""
    with request(asset['githubUrl'], method='HEAD') as response:
        target = response.url
        check_redirect(target)
    chunk_size = 8 * 1024 * 1024
    ranges = [(start, min(start + chunk_size, asset['size']) - 1) for start in range(0, asset['size'], chunk_size)]
    with tempfile.TemporaryDirectory(prefix='.ranges-', dir=destination.parent) as temporary:
        def part(bounds):
            start, end = bounds
            path = Path(temporary) / str(start)
            for attempt in range(3):
                try:
                    with request(target, {'Range': f'bytes={start}-{end}'}) as response, path.open('wb') as output:
                        check_redirect(response.url)
                        if response.status != 206 or response.headers.get('Content-Range') != f'bytes {start}-{end}/{asset["size"]}':
                            raise ValueError('Invalid GitHub byte range response')
                        size = 0
                        while chunk := response.read(256 * 1024):
                            size += len(chunk)
                            if size > end - start + 1:
                                raise ValueError('Range exceeds expected size')
                            output.write(chunk)
                        if size != end - start + 1:
                            raise ValueError('Incomplete byte range')
                    return path
                except Exception:
                    if attempt == 2:
                        raise
                    time.sleep(2 ** attempt)
        with ThreadPoolExecutor(max_workers=8) as pool:
            parts = list(pool.map(part, ranges))
        digest = hashlib.sha256()
        with destination.open('wb') as output:
            for path in parts:
                with path.open('rb') as source:
                    while chunk := source.read(1024 * 1024):
                        output.write(chunk)
                        digest.update(chunk)
        if destination.stat().st_size != asset['size'] or digest.hexdigest() != asset['sha256']:
            raise ValueError('Reassembled asset checksum mismatch')


def download(asset, destination):
    for attempt in range(3):
        try:
            if asset['size'] > 16 * 1024 * 1024:
                download_ranges(asset, destination)
                return
            digest, size = hashlib.sha256(), 0
            with request(asset["githubUrl"]) as response, destination.open("wb") as output:
                check_redirect(response.url)
                while chunk := response.read(1024 * 1024):
                    size += len(chunk)
                    if size > asset["size"]:
                        raise ValueError("Asset exceeds advertised size")
                    output.write(chunk)
                    digest.update(chunk)
            if size != asset["size"] or digest.hexdigest() != asset["sha256"]:
                raise ValueError("Asset checksum mismatch")
            return
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)


def verify_sums(directory, manifest):
    for platform, name in names(manifest["version"]).items():
        found = {}
        for line in (directory / f"SHA256SUMS-{platform}.txt").read_text().splitlines():
            match = re.fullmatch(r"([a-f0-9]{64})  ([A-Za-z0-9._-]+)", line)
            if not match or match[2] in found or match[2] not in manifest["files"]:
                raise ValueError("Invalid SHA256SUMS file")
            if manifest["files"][match[2]]["sha256"] != match[1]:
                raise ValueError("Conflicting release checksums")
            found[match[2]] = match[1]
        if name not in found:
            raise ValueError("Missing installer checksum")
        if platform == 'android' and 'android-build-proof.json' not in found:
            raise ValueError('Missing Android build proof checksum')


ANDROID_CHECKS = {'import-reading-pdf-return-marks-chat-citations', 'background-lock-network-exit-force-stop',
                 'checkpoint-edits-usage-deduplication', 'offline-edit-sync-legacy-cross-device',
                 'portrait-landscape-dark-font-keyboard-talkback', 'visible-copy-review'}


def verify_android(directory, manifest, identity=None):
    filename = names(manifest['version']).get('android')
    if not filename:
        return
    if identity is None:
        identity = json.loads(Path(__file__).with_name('android-release-identity.json').read_text())
    certificate = identity.get('certificateSha256') or ''
    if identity.get('applicationId') != 'com.paperenjoyer.android' or not re.fullmatch(r'[a-f0-9]{64}', certificate):
        raise ValueError('The existing Android release certificate must be pinned before mirroring')
    proof_file = directory / 'android-build-proof.json'
    if proof_file.stat().st_size > 2 * 1024 * 1024:
        raise ValueError('Android build proof exceeds limit')
    proof = json.loads(proof_file.read_text())
    apk = proof['apk']
    major, minor, patch = version_tuple('v' + manifest['version'])
    if (proof.get('platform') != 'android' or proof.get('version') != manifest['version']
            or proof.get('dirty') is not False or not re.fullmatch(r'[a-f0-9]{40}', proof.get('sourceSha') or '')
            or apk.get('applicationId') != identity['applicationId'] or apk.get('version') != manifest['version']
            or apk.get('versionCode') != major * 1000000 + minor * 1000 + patch
            or apk.get('minSdk') != 29 or apk.get('targetSdk') != 36 or apk.get('debuggable') is not False
            or apk.get('certificateSha256') != certificate or not all(apk.get(s) is True for s in ['v1', 'v2', 'v3'])
            or apk.get('sha256') != manifest['files'][filename]['sha256'] or apk.get('size') != manifest['files'][filename]['size']):
        raise ValueError('Android build identity or provenance differs from the release')
    for kind, api in [('emulator', 29), ('emulator', 36), ('physical', None)]:
        report = next((r for r in proof.get('acceptance', []) if r.get('kind') == kind and (api is None or r.get('api') == api)), None)
        if (not report or report.get('api', 0) < 29 or report.get('emulated') is not (kind == 'emulator')
                or report.get('applicationId') != identity['applicationId'] or report.get('version') != manifest['version']
                or report.get('apkSha256') != apk['sha256'] or report.get('certificateSha256') != certificate
                or report.get('sourceSha') != proof['sourceSha'] or not re.fullmatch(r'[a-f0-9]{16}', report.get('deviceHash') or '')
                or 'install-open-import-offline-force-stop-upgrade' not in report.get('checks', [])):
            raise ValueError('Android installation acceptance is missing or belongs to another APK')
        datetime.datetime.fromisoformat(report['completedAt'].replace('Z', '+00:00'))
        if kind == 'physical' and (not (report.get('operator') or '').strip() or not ANDROID_CHECKS.issubset(report['checks'])):
            raise ValueError('Android physical device acceptance is incomplete')
    target = directory / filename
    with target.open('rb') as stream:
        if hashlib.file_digest(stream, 'sha256').hexdigest() != apk['sha256']:
            raise ValueError('Mirrored Android APK checksum differs from its build proof')
    signature = subprocess.run(['apksigner', 'verify', '--verbose', '--print-certs', '--min-sdk-version', '23',
                                '--max-sdk-version', '36', str(target)], check=True, capture_output=True, text=True).stdout
    certs = re.findall(r'Signer #\d+ certificate SHA-256 digest: ([a-f0-9]+)', signature, re.I)
    if certs != [certificate] or not all(re.search(r'Verified using ' + s + r' scheme.*true', signature) for s in ['v1', 'v2', 'v3']):
        raise ValueError('Mirrored Android APK signature differs from the pinned release key')
    badging = subprocess.run(['aapt', 'dump', 'badging', str(target)], check=True, capture_output=True, text=True).stdout
    expected = f"package: name='{identity['applicationId']}' versionCode='{apk['versionCode']}' versionName='{manifest['version']}'"
    if (expected not in badging or "sdkVersion:'29'" not in badging or "targetSdkVersion:'36'" not in badging
            or re.search(r'^application-debuggable', badging, re.M)):
        raise ValueError('Mirrored Android APK manifest differs from the verified build')


def atomic_json(path, value):
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def sync(root, seed_dir=None):
    releases, staging = root / "releases", root / "staging"
    releases.mkdir(parents=True, exist_ok=True)
    staging.mkdir(exist_ok=True)
    headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    state = root / "state.json"
    current_path = root / "current" / "release.json"
    current = json.loads(current_path.read_text()) if current_path.exists() else None
    if current and state.exists():
        etag = json.loads(state.read_text()).get("etag")
        if etag:
            headers["If-None-Match"] = etag
    try:
        with request(API, headers) as response:
            raw = response.read(1024 * 1024 + 1)
            if len(raw) > 1024 * 1024:
                raise ValueError("Release metadata exceeds limit")
            manifest = validate_release(json.loads(raw))
            etag = response.headers.get("ETag")
    except urllib.error.HTTPError as error:
        if error.code == 304:
            print("Latest release unchanged", flush=True)
            return
        raise
    tag = "v" + manifest["version"]
    if current and version_tuple(tag) < version_tuple("v" + current["version"]):
        raise ValueError("Refusing to downgrade the published mirror")
    destination = releases / tag
    if destination.exists():
        existing = json.loads((destination / "release.json").read_text())
        if existing != manifest or any(not (destination / name).is_file() or
                (destination / name).stat().st_size != asset["size"] for name, asset in manifest["files"].items()):
            raise ValueError("Refusing to overwrite an existing version; publish a new tag")
    else:
        if shutil.disk_usage(root).free < sum(a["size"] for a in manifest["files"].values()) + max(a['size'] for a in manifest['files'].values()) + 1024 ** 3:
            raise OSError("Insufficient space; existing mirror retained")
        temporary = Path(tempfile.mkdtemp(prefix=tag + "-", dir=staging))
        try:
            temporary.chmod(0o755)
            for asset in manifest["files"].values():
                print(f"Preparing {asset['name']} ({asset['size']} bytes)", flush=True)
                seed = seed_dir / asset['name'] if seed_dir else None
                if seed and seed.is_file():
                    if seed.stat().st_size != asset['size']:
                        raise ValueError('Seed size mismatch')
                    with seed.open('rb') as source:
                        if hashlib.file_digest(source, 'sha256').hexdigest() != asset['sha256']:
                            raise ValueError('Seed checksum mismatch')
                    shutil.copyfile(seed, temporary / asset['name'])
                else:
                    download(asset, temporary / asset["name"])
            verify_sums(temporary, manifest)
            verify_android(temporary, manifest)
            atomic_json(temporary / "release.json", manifest)
            for platform, filename in names(manifest["version"]).items():
                (temporary / platform).symlink_to(filename)
            os.replace(temporary, destination)
        finally:
            if temporary.exists():
                shutil.rmtree(temporary)
    verify_android(destination, manifest)
    link = root / "current.next"
    link.unlink(missing_ok=True)
    link.symlink_to(Path("releases") / tag)
    os.replace(link, root / "current")
    atomic_json(state, {"etag": etag, "version": manifest["version"],
                        "checkedAt": datetime.datetime.now(datetime.timezone.utc).isoformat()})
    versions = sorted([p for p in releases.iterdir() if p.is_dir() and not p.is_symlink() and TAG.fullmatch(p.name)],
                      key=lambda p: version_tuple(p.name), reverse=True)
    for old in versions[3:]:
        if old != destination and old.resolve().parent == releases.resolve():
            shutil.rmtree(old)
    print(f"Published verified mirror {tag}", flush=True)


if __name__ == "__main__":
    import fcntl
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path("/srv/paperenjoyer/mirror"))
    parser.add_argument('--seed-dir', type=Path, help='Optional verified local files for initial bootstrap')
    args = parser.parse_args()
    args.root.mkdir(parents=True, exist_ok=True)
    with (args.root / ".sync.lock").open("w") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit("Another synchronization is already running")
        sync(args.root, args.seed_dir)
