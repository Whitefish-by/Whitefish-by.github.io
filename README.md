# PaperEnjoyer 官网

PaperEnjoyer 的中英文宣传与下载网站。中文 `/`，英文 `/en/`，主域名 **https://paperenjoyer.com**。

Astro 静态输出，TypeScript 与原生 CSS；无后端、无前端令牌、无访问统计脚本。官网仓库与桌面软件源码、安装包发行仓库独立。

## 本地预览

使用 **Node.js 22.19 或更新的 Node 22 LTS 补丁版**。

```powershell
npm ci
npm run dev
```

访问 `http://127.0.0.1:4321`。生成与预览正式产物：

```powershell
npm run check
npm test
npm run build
npm run preview
```

若电脑仍在使用旧版 Node，可临时使用项目缓存中的 Node 22，不修改全局安装：

```powershell
npm exec --yes --package=node@22 -c "npm run dev"
```

浏览器验收（构建后）：

```powershell
npx playwright install chromium webkit
npm run test:e2e
```

检查中英文与三种宽度、真实图片、下载更新与失败回退、键盘导航、图片放大、减少动态效果及无 JavaScript 使用。截图与失败追踪位于 `test-results/`。

## 发布到官方服务器

官网由新加坡服务器 `43.160.220.8` 上的 Nginx 提供静态文件，正式地址为 https://paperenjoyer.com；`www` 和 HTTP 自动跳转到主域名 HTTPS。Cloudflare 保留为域名入口，服务器使用 Certbot 证书及自动续期。

推送 `main` 或从 `main` 手动运行 **Check and publish website** 时，GitHub Actions 完成格式、类型、单元测试、构建和 Chromium/WebKit 验证，再通过专用受限 SSH 账号上传静态产物。PR 仅检查，不部署。官网不再通过 GitHub Pages 发布。

仓库 Secrets：`WEBSITE_SSH_KEY` 与 `WEBSITE_SSH_KNOWN_HOSTS`。部署账号 `paper-web` 的密钥只允许运行静态站点接收脚本，不能执行任意 SSH 命令、端口转发或取得 sudo 权限。每次完整上传后原子切换，保留最近三个站点版本。

## 安装包与自动同步

唯一发行源是 [PaperEnjoyer-Releases](https://github.com/watericetangcw/PaperEnjoyer-Releases/releases/latest)。服务器的 systemd 定时任务每五分钟检查正式版，下载三平台安装包、Windows 更新文件及 SHA256SUMS，核对大小与 SHA-256 后一次性发布完整版本。失败保留上一个可用版本；保留最近三个完整版本。

页面从 `/downloads/latest.json` 读取最新已同步版本及双源地址。普通点击时先对对应 GitHub 安装包执行最多五秒的 HEAD 连通性探测，网络失败或超时便自动使用服务器上的同版本文件。探测不传输安装包内容；GitHub 可用时用户安装包流量不经过本服务器。浏览器跨域规则使网页无法接管原生下载启动后的中途失败，已开始的下载由浏览器处理。

JavaScript 不可用或版本清单暂时读取失败时，`/download/windows`、`/download/mac`、`/download/linux` 直接提供服务器最新完整包。固定版本路径为 `/downloads/vX.Y.Z/<文件名>`，支持 Range；版本清单禁用缓存。新 Release 无需修改官网版本号或重新构建页面，通常在一次检查周期加下载校验时间后可用。同步时长受服务器到 GitHub 的带宽影响。

服务器初始化、手动部署、回滚、日志和同步排错见 [服务器维护](ops/README.md)。服务器同步不需要 GitHub Token，浏览器和安装包不包含部署凭据。

## 内容与界面素材

`src/data/copy.ts` 集中维护中英文文案；`src/components/Landing.astro` 为共享页面；`src/styles/global.css` 管理布局、配色、响应式与动效。`astro.config.mjs`、页面 SEO、站点地图使用 `.com` 主域名。

截图来自实际 PaperEnjoyer 界面，论文、译文、笔记与 Agent 对话是用于展示的独立演示资料，不代表线上模型输出或用户数据。英文官网沿用软件当前的中文界面截图，不暗示桌面软件已有英文界面。

维护者可从已构建的软件仓库重新生成素材：

```powershell
npm run capture:product -- --app-path E:/PaperEnjoyer
npm run optimize:images
node scripts/social-card.mjs
```

截图脚本要求软件仓库存在 `dist/`、其现有依赖，以及 `.cache/fixtures/nerf.pdf` 和 `nerf-parsed.json` 演示文件。缺少时应先准备这些演示夹具；普通官网构建及 CI **不需要**访问软件源码或这些文件。

脚本仅在官网 `.cache/product-demo/` 创建独立资料库，不修改软件源码或个人资料库，也不调用付费模型。PNG 原图保存在 `.cache/product-originals/`，站点使用 WebP；压缩四张界面图总计约 0.7 MB。书本图标沿用软件现有品牌素材。

画面参考论文：Mildenhall 等人的 [NeRF](https://arxiv.org/abs/2003.08934)、Barron 等人的 [Mip-NeRF](https://arxiv.org/abs/2103.13415)、Kerbl 等人的 [3D Gaussian Splatting](https://arxiv.org/abs/2308.04079)。相关论文标题与画面用于说明阅读功能，不表示作者背书。

## 当前产品边界

提供 Windows x64、macOS Apple Silicon，以及 Ubuntu 22.04 / 24.04 / 26.04 LTS x64（amd64）安装包。Ubuntu 使用 DEB，通过 `sudo apt install ./PaperEnjoyer-<version>-Linux-amd64.deb` 安装或升级。基础阅读可独立使用；AI 功能需相应账号或模型服务；MinerU 云解析会上传 PDF。当前安装包的签名状态和安装说明按现有发行配置撰写，未来启用正式签名/公证后应同步更新中英文 FAQ。

## 首屏交互快照

首屏嵌入 PaperEnjoyer 当前源码编译的真实界面。浅色模式展示本机的 Attention Is All You Need、已有段落精读和 Self-Attention 问答；发现页提供预填 transformer 的固定论文目录。浏览、翻页、精读展开、搜索和聊天输入可交互，发送及数据修改操作禁用。刷新恢复初始状态。

界面文案沿用桌面版。主图右上角提供重置和独立打开两个图标按钮，底部不附加控制栏或演示说明。

在本目录更新本地快照：

```powershell
npm run snapshot:product
```

默认使用相邻的 PaperEnjoyer 源码及软件配置指向的本机资料库。需要覆盖路径时：

```powershell
node scripts/snapshot-product.mjs --app-path E:/PaperEnjoyer --library-root E:/MyLibrary
```

需要 Node 22.19+、两个项目已安装的依赖及 Playwright Chromium。Windows PowerShell 传递 npm 参数可使用 npm.cmd。现有截图命令 capture:product 继续用于下方四张静态场景图。

更新命令只生成并替换 public/demo；不提交、不推送、不部署，也不自动修改官网页面。发布由维护者手动触发。public/demo 应与官网一起提交，普通官网构建及 CI 只校验、使用这些产物，无需软件源码或个人数据库。

演示入口为 /demo/index.html，首页嵌入 /demo/app/index.html（显式路径同时兼容开发服务器与 GitHub Pages）。无法加载或关闭 JavaScript 时保留同画面的 poster.webp。manifest.json 包含源码版本、生成时间、数据和资源哈希；npm test 校验快照完整性，浏览器测试覆盖首屏交互。

详细维护说明见软件仓库 docs/interactive-demo.md。导出会校验素材完整性；失败时保留上一份可用快照，部分完成的精读保留真实进度。
