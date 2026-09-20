#!/bin/sh
# Optional first-time bootstrap using independently verified local copies.
set -eu
if [ "$#" -ne 1 ]; then echo 'Usage: seed-mirror.sh /absolute/path/to/release-files.tar' >&2; exit 2; fi
systemctl stop paperenjoyer-sync.timer
trap 'systemctl start paperenjoyer-sync.timer' EXIT
systemctl stop paperenjoyer-sync.service
install -d -m 755 /srv/paperenjoyer/seed
tar --no-same-owner -xf "$1" -C /srv/paperenjoyer/seed
runuser -u paper-sync -- python3 /usr/local/lib/paperenjoyer/sync-releases.py --seed-dir /srv/paperenjoyer/seed
