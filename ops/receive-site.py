#!/usr/bin/env python3
"""Restricted SSH command: receive one site tarball and atomically activate it."""
import datetime
import os
from pathlib import Path
import re
import shutil
import sys
import tarfile
import uuid

root = Path("/srv/paperenjoyer/site")
releases = root / "releases"
release = releases / (datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ-") + uuid.uuid4().hex[:8])
release.mkdir()
try:
    total = 0
    with tarfile.open(fileobj=sys.stdin.buffer, mode="r|gz") as archive:
        for member in archive:
            target = (release / member.name).resolve()
            if not target.is_relative_to(release) or not (member.isfile() or member.isdir()):
                raise ValueError("Unsafe archive member")
            total += member.size
            if total > 1024 ** 3:
                raise ValueError("Website exceeds 1 GiB")
            archive.extract(member, release, filter="data")
    if not (release / "index.html").is_file() or not (release / "en/index.html").is_file():
        raise ValueError("Incomplete website build")
    link = root / ("current-" + uuid.uuid4().hex)
    link.symlink_to(Path("releases") / release.name)
    os.replace(link, root / "current")
except BaseException:
    if release.resolve().parent == releases.resolve():
        shutil.rmtree(release)
    raise
for old in sorted(releases.iterdir(), reverse=True)[3:]:
    if re.fullmatch(r"\d{8}T\d{6}Z-[a-f0-9]{8}", old.name) and old.is_dir() and not old.is_symlink() and old != release:
        shutil.rmtree(old)
print("Activated website " + release.name)
