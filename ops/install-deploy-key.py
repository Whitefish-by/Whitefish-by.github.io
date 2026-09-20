#!/usr/bin/env python3
"""Run as root with a deployment public key; never accepts a private key."""
import os
from pathlib import Path
import pwd
import sys
account = pwd.getpwnam('paper-web')
public = Path(sys.argv[1]).read_text().strip()
if not public.startswith('ssh-ed25519 ') or '\n' in public:
    raise ValueError('Expected one Ed25519 public key')
directory = Path(account.pw_dir) / '.ssh'
directory.mkdir(mode=0o700, exist_ok=True)
os.chown(directory, account.pw_uid, account.pw_gid)
target = directory / 'authorized_keys'
line = 'restrict,command="/usr/local/lib/paperenjoyer/receive-site.py" ' + public
existing = target.read_text().splitlines() if target.exists() else []
if line not in existing:
    target.write_text('\n'.join([*existing, line]) + '\n')
target.chmod(0o600)
os.chown(target, account.pw_uid, account.pw_gid)
print('Installed restricted website deployment key')
