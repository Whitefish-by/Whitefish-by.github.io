#!/bin/sh
set -eu
cd "$(dirname "$0")"
id paper-sync >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin paper-sync
id paper-web >/dev/null 2>&1 || useradd --system --create-home --home-dir /var/lib/paper-web --shell /bin/sh paper-web
install -d -m 755 /srv/paperenjoyer /usr/local/lib/paperenjoyer /var/www/letsencrypt /var/backups/paperenjoyer
install -d -m 755 -o paper-sync -g www-data /srv/paperenjoyer/mirror
install -d -m 755 -o paper-web -g www-data /srv/paperenjoyer/site /srv/paperenjoyer/site/releases
install -m 755 sync-releases.py receive-site.py /usr/local/lib/paperenjoyer/
install -m 644 paperenjoyer-sync.service paperenjoyer-sync.timer /etc/systemd/system/
backup="/var/backups/paperenjoyer/nginx-$(date +%Y%m%dT%H%M%S).conf"
cp /etc/nginx/conf.d/default.conf "$backup"
install -m 644 nginx.conf /etc/nginx/conf.d/default.conf
if ! nginx -t; then cp "$backup" /etc/nginx/conf.d/default.conf; exit 1; fi
systemctl reload nginx
systemctl daemon-reload
systemctl enable --now paperenjoyer-sync.timer
systemctl start --no-block paperenjoyer-sync.service
