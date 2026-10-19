# NyanDou · ニャンドゥ

图片转拼豆图纸的网页工作台。使用严格类型的 TypeScript + Vite；不使用 React，不上传图片，不加载外部服务或追踪统计。构建工具只在开发时使用，访问者无需安装依赖。项目名称：`NyanDou`；显示名称：`ニャンドゥ`。现有目录 `/mnt/Storage/Repos/NekoBeads/` 和内部服务名称保留。

## 启动

需要 Node.js ≥ 22.12.0。在本目录运行：

```bash
npm ci
npm start
```

浏览器打开 <http://127.0.0.1:4174>。请使用现代 Chrome、Edge、Firefox 或 Safari。由于使用 ES modules 和 Web Worker，请不要直接双击 `index.html`。开发服务器只监听本机，不用作公网部署。

生产构建和本机预览：

```bash
npm run build
npm run preview
```

`src/` 包含 TypeScript 源码。`npm run check` 执行严格类型检查。

| 模块 | 内容 |
| --- | --- |
| `app.ts` | 页面控制：读取图片、调度生成、预览、导出 |
| `ui.ts` | 页面元素的类型化引用 |
| `image-source.ts` | 图纸尺寸、缩小采样、缩略图 |
| `quantize-job.ts` / `worker.ts` | 生成 Worker 的调用端与 Worker 本体 |
| `export.ts` / `export-worker.ts` | 下载文件导出（Worker 或主线程回退） |
| `worker-job.ts` | 单次 Worker 任务：超时、崩溃与结束处理 |
| `stylize.ts` | 轮廓优先：每颗豆 4×4 采样 |
| `quantize.ts` | 直方图、median-cut、k-means、色卡匹配 |
| `color.ts` | sRGB / CIELAB 转换与颜色距离 |
| `chart.ts` | 带编号网格与 PNG 图纸 |
| `beads.ts` | 熨烫前后的拼豆效果 |
| `preview.ts` / `palette-list.ts` | 预览画布与用豆清单 |
| `png.ts` / `csv.ts` / `download.ts` | 8bit 索引 PNG、CSV 与下载 |
| `mard.ts` | MARD 标准 221 色数据 |
| `types.ts` / `constants.ts` / `format.ts` / `canvas.ts` / `demo.ts` | 共享类型、常量、格式化、画布释放、示例图 |Vite 将两个 Worker 分别打包，生成带内容版本号的 JS、CSS 和图标；`dist/` 是唯一发布内容，包含 gzip 预压缩文件，不包含源码映射、测试或开发工具。

## 同 Wi-Fi 手机访问

安装 Python 3，先执行 `npm run build`。在本机运行，将 `192.168.3.78` 替换为当前电脑的 Wi-Fi IPv4 地址：

```bash
python3 serve.py --bind 192.168.3.78 --port 4176
```

手机连接同一个 Wi-Fi 后，打开 `http://192.168.3.78:4176/`。服务器仅监听指定 Wi-Fi 地址，只提供应用需要的文件，不提供目录列表、测试或部署配置。图片仍在手机浏览器内处理，不上传。

终端需保持运行，电脑不能休眠。Wi-Fi 地址变化后需要重新启动服务器。如果手机无法连接，检查设备是否在同一局域网、是否使用了访客 Wi-Fi / AP 隔离，以及电脑防火墙是否允许局域网访问 TCP 4176。此方式不修改远程部署、DNS 或路由器端口转发。

## 使用

1. 上传或拖入图片，支持浏览器可解码的 PNG、JPG、WebP、GIF 首帧等格式，最大 25 MB。
2. 默认 **横向 32 颗、清晰萌化（轮廓优先）、MARD 标准 221 色**。可选择「原图优先」或自动提取参考配色，并调整横向豆数和颜色上限。保持原图比例，长边最多 160 颗；极端宽高比会受到至少一格的限制。
3. 切换原图、像素效果、拼豆效果与带编号网格。图纸使用 **10 格深分割线、5 格浅分割线**，下载图纸也一样。默认适应窗口，窗口变化或切换预览模式时自动更新比例；手动调整缩放后保留选择，点击「适应窗口」恢复自动适应。放大至每格 12px 及以上可显示网格编号。
   拖动豆数和颜色上限时，图纸、像素和拼豆预览随生成结果自动更新，无需松手或切换模式。快速输入合并到 60ms 的固定窗口；生成较慢时只运行一个 Worker，完成后绘制结果并继续处理最新设置，最终结果就绪前禁止导出。原图对照仍显示原始图片。
4. 下载带坐标、编号及用豆清单的 PNG 图纸、真正的 8bit 索引色 PNG 或 CSV 用豆清单。

## 配色规则与限制

- 轮廓优先使用每颗豆 4×4 个细采样，把局部颜色分为两组，保留有连续支持的深色细节（如轮廓、眼睛、嘴巴），抑制单个杂点；低对比纹理取平均，高对比色块选择主要颜色。选定的颜色只取远离另一组的一半采样，避免边缘混色（如黄脸上的橄榄色豆）。颜色在 CIELAB 中把彩度提高到 1.2 倍、亮度不变，使浅蓝头发、橘猫等在色卡中不被匹配成灰色或棕色。配色后，周围没有同色豆、且与周围主色差别小（CIE76 < 25）的单颗豆改为周围颜色，眼睛等高对比单颗细节保留。不会裁剪图片或凭空补画五官，不调用 AI，也不上传图片。
- 该模式允许适度加粗轮廓、强化细线，而非只追求逐像素还原。对简单图标和插画更有帮助；复杂照片、文字、拥挤场景以及小于一颗豆的特征仍可能丢失。32×32 只用 1,024 颗，64×64 用 4,096 颗，不能保证前者保留后者的所有细节。需要更贴近原图时选择「原图优先」，需要更多细节时增加豆数。
- 轮廓优先中，覆盖至少一半的格子放一颗实色豆（使用图形本身的颜色，不与白底混合），不足一半留空，以去掉白色毛边和淡阴影；原图优先保持浏览器原有缩小方式，半透明颜色按白底处理。完全透明区域始终留空。
- 图片先按豆数缩小，再提取加权颜色直方图。
- 默认匹配 MARD 标准 221 色，仅使用 A/B/C/D/E/F/G/H/M 系列，不包含 291 色扩展系列。若直接最近色匹配的用色数不超过上限，则直接匹配；否则使用 median-cut 初始化、最多 8 次加权 k-means，并将每次更新后的颜色限制在色卡内。按 CIELAB / CIE76 距离匹配，不保证全局最优，也不能补回缩小丢失的细节。
- MARD 色号在预览网格、图纸、清单和 CSV 中保持一致，排序按本图颗数，不会把色号重新编成 `001`。切换为自动提取时保留原来的自由配色算法与 `001` 等图纸编号。
- 不使用抖动，避免为了视觉混色而产生零散杂色豆子。
- MARD 模式颜色上限为 2–221，自动提取模式为 2–256；实际颜色可能更少。8bit 指每个像素使用 8 位调色板索引，不是 RGB 三通道各 8 位。
- 全透明像素留空，不计入用豆数量。半透明像素按白底合成。缩小时边缘可能产生半透明像素，因此可能出现白底边缘。
- 存在空格时，索引 PNG 留出一个透明色位置，最多 255 个实际拼豆颜色。
- MARD RGB 来自开源 [maxcleme/beadcolors](https://github.com/maxcleme/beadcolors/blob/f97ff4283d03cef5cd7e1071a86f5892e0c0c61b/raw/mard.csv)，固定版本 `f97ff4283d03cef5cd7e1071a86f5892e0c0c61b`，贡献者 Asher，MIT 许可声明保留在 `src/mard.ts` 中。它是社区屏幕参考色，并非厂家实测值；不同店家、批次、光线和显示器均可能导致色差，购买前请核对店家实物色卡。
- 自动提取模式的 `001` 等编号只对当前图纸有效，不对应品牌色号，颜色未必存在对应实物拼豆。
- 示例风景由浏览器绘制，用于立即体验，用户上传后会替换示例。
- 拼豆效果与像素图纸使用同一份颜色、位置和空格数据。熨烫前模拟带孔圆豆、间隙及轻微立体光影；熨烫后模拟相连的圆角色块与较小珠孔，只在相邻非空格之间连接。
- 拼豆渲染是外观示意，不是塑料热熔的物理模拟，也不保证实物色差、熨烫程度或熨烫后尺寸。切换渲染状态不会改变图纸编号、颗数及导出文件。

## 测试

使用已安装的 Node.js ≥ 22.12.0：

```bash
npm test
npm run check
npm run test:browser
# 启动 npm run preview 后，真实 Chrome 下载验证：
npm run test:smoke
```

测试覆盖颜色上限、计数、透明处理、确定性、感知颜色转换和索引 PNG 数据。包含自适应配色相对固定配色的误差实验。

浏览器测试命令先创建独立 `.test-dist/` 构建，然后临时启动本机测试服务器和无头 Chrome，通过浏览器调试接口自动检查结果。默认使用 `/usr/bin/google-chrome`，其他路径可设置 `CHROME_BIN`。测试不进入正式 `dist/`。运行 `npm start` 后也可打开 <http://127.0.0.1:4174/tests/browser.html> 手动测试。它使用合成图片验证真实上传、预览、快速调整、图纸导出、CSV、PNG 解码、失败恢复、读取图片期间改设置和内存上限，不会实际下载文件。

`npm run test:smoke -- https://dou.love765.me/` 验证正式站点的真实 PNG 下载及下载后继续操作，下载文件保存在独立临时目录。自动浏览器测试不等同于实际 iPhone/Android 测试。迁移与优化实验记录见 `reports/typescript-and-site-optimization.md`。

打开 `/tests/pixel-experiment.html` 查看合成小猫、小兔和风景的「原算法 32 格 / 轮廓优先 32 格 / 原算法 64 格」对照。完整对照截图位于 `.openchamber/screenshots/32-grid-comparison.png`。这验证细线对比度的改善，不证明所有照片的识别质量或主观可爱程度。

图纸导出在独立 Worker 的 OffscreenCanvas 中完成，不占用主线程逐格绘制；不支持时回退到每 4 行让出一次主线程的分批绘制。导出与图片生成的状态分开，完成、失败、超时后恢复按钮，禁止重复导出，但仍可调整图纸和切换预览。导出按点击时的图纸快照完成，不会因后续设置变化混用颜色、尺寸或文件名。导出画布限制为 800 万像素，大图会适度降低每格导出像素，并在编码后释放画布内存。

预览也限制为 800 万像素；极大缩放时降低内部画布分辨率，保持显示尺寸和图纸数据不变。像素预览缓存随新图纸更新，重复缩放不再创建像素缓冲。生成设有 45 秒超时，失败后不会导出过期图纸。手机主要按钮至少 44px 高，表单焦点可见；提供跳到画布的键盘入口、画布键盘滚动、易读滑块值、可关闭错误提示和禁用脚本说明。基础 SEO 包含 canonical、Open Graph、robots.txt 和 sitemap.xml，没有第三方追踪。

## 私有部署

部署目标：SSH 别名 `TCSFrontEnd`，目录 `/home/ubuntu/Repos/NekoBeads/`。独立 nginx 实例由 `nekobeads.service` 管理，仅监听 `127.0.0.1:4173`，开机自动启动。不会修改服务器现有的 nginx 站点、DNS 或公网防火墙。

```bash
bash deploy/deploy.sh
```

需要本机 Node.js、已安装的构建依赖、`ssh` 和 `rsync`；目标机已安装 nginx，`ubuntu` 用户具备免密码 sudo。脚本先构建，再上传带版本号的资源，最后原子替换 HTML。页面每次访问重新验证，带版本号资源缓存一年；nginx 自动选择 gzip 预压缩版本。保留旧资源以支持已打开页面，发布失败恢复旧 HTML 和后端配置，备份路径会打印到终端。迁移前固定名称的 JS/CSS 也暂时保留兼容，不覆盖或删除。

通过 SSH 隧道访问：

```bash
ssh -N -L 127.0.0.1:4175:127.0.0.1:4173 TCSFrontEnd
```

保持终端运行，打开 <http://127.0.0.1:4175>。如果本机 4175 端口已占用，改用其他本地端口。图片仍在浏览器本机处理，不会传到服务器。

服务检查：

```bash
ssh TCSFrontEnd systemctl status nekobeads.service --no-pager
```

## 正式部署 · HTTPS

正式地址：**https://dou.love765.me/**。Namecheap 的 A 记录指向 `TCSFrontEnd`，公开 nginx 仅为该域名单独添加站点，反向代理到现有 `127.0.0.1:4173` 后端；后端仍不直接对公网监听。图片处理和下载文件生成仍在访问者浏览器内完成。

```bash
bash deploy/deploy-public.sh
```

脚本先更新应用，再设置该域名的 HTTP ACME 验证入口，使用 Let's Encrypt 签发证书并启用 HTTPS。HTTP 自动 301 跳转到 HTTPS；支持 TLS 1.2/1.3、HTTP/2 和 HSTS。不修改其他站点或 DNS；如果目标位置已有非本项目的配置则停止，不覆盖。修改前保存站点备份，设置失败时恢复该站点并重新加载 nginx。

- 公开配置：`/etc/nginx/sites-available/dou.love765.me`，由同名 `sites-enabled` 符号链接启用。
- 证书：`/etc/letsencrypt/live/dou.love765.me/`，私钥仅存于服务器，由 root 管理，不复制到项目或公开目录。
- ACME 验证目录：`/var/www/nyandou-acme`，仅通过 `/.well-known/acme-challenge/` 提供验证文件。
- 自动续期：现有 `certbot.timer`。该证书的部署钩子 `/usr/local/lib/nyandou/certbot-deploy` 在续期后检查并重新加载 nginx。
- 首次签发的证书有效至 2027-01-04；后续以实际证书为准。已通过正式 HTTPS 校验和包含部署钩子的续期演练。
- 公开路径不提供源码工具、测试、实验报告、部署文件或目录列表，POST 请求被拒绝。

检查与续期演练：

```bash
ssh TCSFrontEnd sudo nginx -t
ssh TCSFrontEnd systemctl status nginx certbot.timer --no-pager
ssh TCSFrontEnd sudo certbot renew --cert-name dou.love765.me --dry-run --run-deploy-hooks --no-random-sleep-on-renew
```

只发布最新应用内容时，运行 `bash deploy/deploy.sh` 即可；无需重新申请证书。同 Wi-Fi 本地访问和 SSH 私有预览仍保留。
