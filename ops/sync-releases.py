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
    return {"windows": f"PaperEnjoyer-{version}-Setup.exe",
            "mac": f"PaperEnjoyer-{version}-macOS-arm64.dmg",
            "linux": f"PaperEnjoyer-{version}-Linux-amd64.deb"}


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
            atomic_json(temporary / "release.json", manifest)
            for platform, filename in names(manifest["version"]).items():
                (temporary / platform).symlink_to(filename)
            os.replace(temporary, destination)
        finally:
            if temporary.exists():
                shutil.rmtree(temporary)
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
