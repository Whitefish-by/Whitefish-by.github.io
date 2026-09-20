# 官网和安装包服务器维护

服务器：`ubuntu@1.13.22.252`，Ubuntu 24.04，Nginx + Certbot。官网构建需要 Node 22.19+，服务器运行静态站点和系统 Python 3，不需要 Node 常驻进程。

## 初始化和部署

将本目录上传到服务器后，以已有管理员账号运行 `sudo sh install.sh`。脚本保留原 Nginx 配置，使用现有域名证书，创建独立的 `paper-web`（站点部署）和 `paper-sync`（镜像同步）账号。执行前需确保云防火墙允许 80/443、DNS 已指向此服务器且域名证书已经签发。

使用专用 Ed25519 部署密钥，私钥保存在官网仓库的 `WEBSITE_SSH_KEY` Secret，服务器主机指纹保存在 `WEBSITE_SSH_KNOWN_HOSTS` Secret；不要把密钥写入 Git。把公钥上传到服务器，执行 `sudo python3 install-deploy-key.py /path/to/public-key.pub`。强制命令只接收站点 tar 包，并校验归档路径。

正常发布：推送官网 `main`，等待 **Check and publish website** 成功。手工发布时先执行官网检查、测试和构建，然后：

```sh
tar -czf site.tar.gz -C dist .
ssh -T -i /path/to/website_key -o StrictHostKeyChecking=yes paper-web@1.13.22.252 < site.tar.gz
```

`/srv/paperenjoyer/site/releases` 保存最近三个站点构建，`current` 是原子切换的软链接。回滚时以管理员身份选择该目录中已验证的构建，创建临时软链接，再用 `mv -Tf` 替换 `current`；无需重新加载 Nginx。不要把构建缓存、源码或密钥上传到站点目录。

## 镜像管理

```sh
systemctl status paperenjoyer-sync.timer
journalctl -u paperenjoyer-sync.service -n 80 --no-pager
sudo systemctl start paperenjoyer-sync.service
curl -fsS https://paperenjoyer.com/downloads/latest.json
```

镜像位于 `/srv/paperenjoyer/mirror`：`staging` 是尚未公开的下载，`releases/vX.Y.Z` 保存已校验的版本，`current` 指向最新完整版本。任务锁阻止并发执行，systemd 限制任务只能写镜像目录。首次同步和大版本发布耗时取决于 GitHub 下载速度，期间继续提供上一版本。日志中的下载失败、磁盘不足或校验失败不会改变线上版本。

公开接口：最新清单 `/downloads/latest.json`，固定清单 `/downloads/vX.Y.Z/release.json`，固定文件 `/downloads/vX.Y.Z/<文件名>`，无 JavaScript 入口 `/download/windows`、`/download/mac`、`/download/linux`。固定入口使用稳定文件名，文件内版本与最新清单一致。发布后的同版本文件不允许静默替换；修复安装包应发布新版本。

已完成且已验证的镜像版本如需回滚，同样原子调整 `current`，并在调查期间停止 timer。恢复 timer 后，正式最新版本会重新同步。不要删除仍由 `current` 指向的版本。

## 验证

```sh
python3 ops/test_sync.py
sudo nginx -t
sudo certbot renew --dry-run
curl -I https://paperenjoyer.com/
curl -I https://www.paperenjoyer.com/
curl -H 'Range: bytes=0-15' -I https://paperenjoyer.com/download/windows
```

Nginx 日志：`/var/log/nginx/paperenjoyer-access.log` 和 `paperenjoyer-error.log`。公网 HTTPS 不通但服务器回环地址正常时，检查云防火墙的 443 入站规则和 Cloudflare 回源设置。
