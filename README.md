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

## 发布到 GitHub Pages

1. 将本目录内容提交并推送到 `Whitefish-by/Whitefish-by.github.io` 的 `main` 分支。
2. 在仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
3. 打开 **Actions → Check and publish website**。若首次推送时 Pages 尚未启用，启用后重新运行工作流，或点击 **Run workflow**。
4. 工作流会完成检查、构建、Chromium/WebKit 验收和部署。后续推送 `main` 自动发布；PR 只检查，不部署。
5. 未绑定自定义域名时，访问 **https://whitefish-by.github.io**，其中 `-by` 是账号名的一部分。

首次提交示例（先检查 `git status`，确保只包含官网文件）：

```powershell
git add .
git commit -m "Build PaperEnjoyer official website"
git push -u origin main
```

若 Git 提示未设置作者，使用自己的姓名与邮箱配置作者信息。工作流仅发布 `dist/`；依赖、演示资料库和测试输出均在 `.gitignore` 中。

## 接入 paperenjoyer.com

域名仍由阿里云管理，本次只接入 `.com`。按以下顺序配置：

1. 在 GitHub **个人 Settings → Pages → Add a domain** 中添加 `paperenjoyer.com`。将页面给出的 TXT 主机记录与值加入阿里云 DNS，回 GitHub 完成验证，保留这条 TXT。
2. 在**官网仓库 Settings → Pages → Custom domain** 填入 `paperenjoyer.com` 并保存。
3. 在阿里云域名解析中配置以下网站记录。检查并替换 `@`、`www` 原有的冲突网站记录，保留邮箱及其他用途记录。

| 类型  | 主机记录 | 记录值                 |
| ----- | -------- | ---------------------- |
| A     | @        | 185.199.108.153        |
| A     | @        | 185.199.109.153        |
| A     | @        | 185.199.110.153        |
| A     | @        | 185.199.111.153        |
| CNAME | www      | whitefish-by.github.io |

记录值不包含 `https://` 或路径；TTL 使用默认值即可。若已有 `@` 的 AAAA 记录指向其他主机，应一并处理，避免 IPv6 访问到错误位置。

4. 等待 GitHub 的 DNS 检查及证书签发生效，然后勾选 **Enforce HTTPS**。GitHub 提示证书尚在准备时，稍后检查。
5. 验证 `https://paperenjoyer.com/`、`https://paperenjoyer.com/en/`、`https://www.paperenjoyer.com/` 及默认 GitHub 地址，确认访问与跳转、图片和下载链接正常。

本项目使用 Actions 发布，自定义域名以 **Pages 设置** 为准，不依赖 `CNAME` 文件。绑定后，GitHub 默认地址及正确配置的 `www` 会指向主域名。

`paperenjoyer.cn` 按本次约定暂不修改。日后接入时，需使用支持 **HTTPS 入口的 HTTP 301 跳转服务**；仅增加 DNS 记录不等于重定向。阿里云自带 URL 转发目前不支持 HTTPS 入口。

参考：[GitHub 自定义域名](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)、[Actions 与 CNAME](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/troubleshooting-custom-domains-and-github-pages)、[阿里云 URL 转发](https://help.aliyun.com/zh/dns/pubz-explicit-url-implicit-url-forwarding-faq)。

## 下载如何保持更新

唯一发行源为 [watericetangcw/PaperEnjoyer-Releases](https://github.com/watericetangcw/PaperEnjoyer-Releases/releases/latest)。

- 页面加载、从后台或浏览器历史恢复页面，以及每次普通点击下载时，访问公开 GitHub 最新正式版 API。请求禁用缓存并附带时间戳；同一时间的查询合并，重复点击不会重复下载。
- 版本号、发布日期、文件大小和所有下载按钮来自同一次实时响应。按版本匹配 `PaperEnjoyer-<version>-Setup.exe` 与 `PaperEnjoyer-<version>-macOS-arm64.dmg`，仅接受已上传完成的非空附件，排除 `.blockmap` 和元数据。下载使用 API 返回且校验过的官方地址。
- API 超时（6 秒）、限流或不可用时，清除过期的版本和附件信息，下载按钮转到官方 `/releases/latest` 页面；不再回退到固定的旧版安装包。未启用 JavaScript 时也使用最新发行页入口。
- 新版本缺少某平台安装包时，该平台改为发行页入口并显示缺失提示，不猜测附件地址。
- 下载发生在用户点击链接之后。页面没有 GitHub Token，也不会通过本站转发数百 MB 的安装包。
- 构建不访问发行 API，也不保存版本快照。发布新软件版本后，无需修改版本号或重新部署官网。
- 网页校验的是发行标签和附件信息，无法判断安装包内部的应用版本或功能。若发行附件本身打包错误，需要在软件发行流程中重新构建并发布正确的安装包。

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

仅承诺 Windows x64 与 macOS Apple Silicon 安装包。基础阅读可独立使用；AI 功能需相应账号或模型服务；MinerU 云解析会上传 PDF。当前安装包的签名状态和安装说明按现有发行配置撰写，未来启用正式签名/公证后应同步更新中英文 FAQ。

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
