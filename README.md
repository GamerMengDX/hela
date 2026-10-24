# 和啦 · 立直麻将算点

日本麻将（立直麻将）算点工具，**以浏览器版为主**：录牌算点、43 种役种图鉴、30 个教学示例与组牌练习、
算点练习、本地四人点棒记分，中日英三语、三套主题。所有计算在本机完成，没有账号、没有服务器、没有遥测。

A browser-first Japanese mahjong score calculator: hand entry and scoring, a 43-yaku reference,
30 teaching examples with a tile-building exercise, score practice, and a local four-player table.
Chinese / Japanese / English, three themes, everything computed locally.

许可证 / Licence：**AGPL-3.0-only**（仅本项目原创代码）。37 张牌面是上游
[lietxia/mahjong_graphic](https://github.com/lietxia/mahjong_graphic) 的矢量图，按上游声明的
**M+ 字型授權條款**使用，**不按 AGPL 或 MIT 授权**。第三方组件各自保留原许可，见
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)、[LICENSES/](LICENSES/) 与
[LICENSES/MAHJONG-GRAPHIC-NOTICE.md](LICENSES/MAHJONG-GRAPHIC-NOTICE.md)。
Licence: AGPL-3.0-only for our own code only. The 37 tile faces are upstream mahjong_graphic
vector artwork, used under the upstream M+ font licence — not AGPL, not MIT.

---

## 一、下载即用（普通用户）

下载 **v0.6.2 已构建版本**，**不需要安装 Node.js，也不需要联网才能算点**：

| 下载 | 打开方式 | 照片识别 |
| --- | --- | --- |
| [完整版 ZIP](https://github.com/GamerMengDX/hela/archive/refs/heads/0.6.2-web.zip) | 解压后用**本地静态服务器**打开（见下），或上传到任意静态托管 / GitHub Pages | **有**（本机 WebGL，模型随包约 28 MB） |
| [离线版 ZIP](https://github.com/GamerMengDX/hela/archive/refs/heads/0.6.2-offline.zip)（内含 `hela-0.6.2.html`） | 解压后**双击**那个 html 文件即可 | **没有**（单文件版不含识别模型与运行库，也没有识别入口） |

单 HTML 位于离线版 ZIP 内。
[完整对应源码 ZIP](https://github.com/GamerMengDX/hela/archive/refs/heads/0.6.2-source.zip)。
每个网页下载包都附有 `FILES_SHA256SUMS` 文件级校验清单和 `SOURCE.md` 对应源码说明；
源码包附有 `SOURCE_MANIFEST.json`。

当前通过独立下载分支提供 ZIP：`0.6.2-web` / `0.6.2-offline` 内是已经构建好的应用，
`0.6.2-source` 保留对应源码。GitHub Releases 页面尚未上架，以上链接可以直接下载。

两种包都包含：算点、43 役图鉴、30 个教学示例、组牌与算点练习、本地四人点棒表、三语、三主题，
以及完整许可与来源材料（`LICENSE`、`LICENSES/`、`THIRD_PARTY_NOTICES.md`）。

### 打开浏览器完整版

浏览器出于安全限制，不允许从 `file://` 加载 ES 模块和识别模型，所以**完整版请用本地静态服务器**，
不要双击 `index.html`：

```bash
cd hela-0.6.2-web            # 解压出来的目录
python3 -m http.server 8080 --bind 127.0.0.1  # Windows 可用：py -m http.server 8080 --bind 127.0.0.1
# 然后浏览器访问 http://localhost:8080/
```

放到 GitHub Pages 或任意子目录时，把这个目录的内容原样上传即可：所有资源都是相对路径，
`index.html` 里没有任何以 `/` 开头的绝对资源路径。

### 打开离线单文件版

解压 `hela-0.6.2-offline.zip`，双击 `hela-0.6.2.html`。它把算点、图鉴、教学、练习、点棒表、
三语与主题全部内联在一个文件里，断网可用；因为裁掉了照片识别整块（不是隐藏按钮，而是编译期
替换成禁用实现），所以它不含约 40 MB 的模型，也不会在运行时去加载任何模型。

**两种包不能互相替代**：单文件版没有照片识别；完整版需要服务器或静态托管。

### 隐私边界（两个包一致）

- 照片只在本机浏览器里解码与推理：不上传、不写盘、不进入任何网络请求。
- 无遥测、无远程字体、无外部 CDN 运行依赖、无服务端。
- 记录与设置只写入本机 `localStorage`（前缀 `hela-web-v1:`）；存储被禁用时会明确提示“仅本次会话”。
- **没有账号、没有云同步**：换设备或清理浏览器数据后记录不会跟着走。

### 校验下载

解压网页下载包后，在该目录校验文件内容：

```bash
shasum -a 256 -c FILES_SHA256SUMS   # macOS / Linux
```

GitHub 按需生成 ZIP，压缩字节可能变化，因此这里校验的是解压后的文件内容。
构建脚本生成的本地 Release 包仍另附 `SHA256SUMS` 整包校验，见 [发布说明](docs/RELEASE.md)。

---

## 二、功能

- 九宫格/键盘录牌、副露与和牌张、场风自风、立直/一发/岭上/海底等条件，标准规则算番算符与支付
- 43 役图鉴：番数、类别、说明
- 30 个教学示例：每例给出牌型、目标役、实际翻符与点数，附组牌练习与判题
- 算点练习：随机出题（基础/普通/进阶），逐项判番、符、各家支付与合计
- 本地四人点棒表：同一设备记录四家点数与供托，含历史记录
- 中日英三语、三套主题（mist / moon / retro）

---

## 三、源码与构建（开发者）

```bash
npm ci                 # 安装构建依赖（仅根目录）
npm test               # 共享核心、30 教学算分、练习、三语目录、发布打包
npm run build:web      # 构建完整浏览器目录 → dist/web/
npm run build:single   # 构建离线单文件 → dist/hela.html
npm run dev            # 本地预览完整目录版
npm run release:prepare  # 在已有 dist/web 与 dist/hela.html 上生成 dist/releases/ 下载包
```

- `npm run release:prepare` 需要 `dist/web` 与 `dist/hela.html` 都已存在；缺任何一个都会**直接失败**
  并提示该跑哪条构建命令，不会生成空包或占位页面。产物与校验值见 [docs/RELEASE.md](docs/RELEASE.md)。
- 环境：Node.js ≥ 20。只有**重新生成**识别模型分段时才需要 Python 3 + `onnx`/`numpy`，见
  [docs/VISION-MODEL.md](docs/VISION-MODEL.md)；冷构建与发布打包都不需要 Python。

目录（浏览器版为主线）：

| 目录 | 说明 |
| --- | --- |
| `web/` | 浏览器端入口与平台适配（构建 `dist/web/` 与 `dist/hela.html`） |
| `src/` | 共享业务核心：算点、役种数据、教学、练习、三语目录；纯 ES 模块，无平台 API |
| `assets/` | 37 张牌面 SVG（上游 mahjong_graphic，M+ 条款）、来源记录与选定品牌图标 |
| `scripts/` | 构建、素材生成、来源清单、公开导出扫描、发布打包 |
| `test/` | Node 内置测试（`node --test`） |
| `docs/` | 架构、发布、模型与许可说明 |
| `wechat-miniprogram/`、`heybox-miniprogram/` | 两款小程序端（辅助，见第六节） |

---

## 四、素材与许可：这里才是开源义务的重点

本项目开源的首要目的是把**实际用到的开源依赖、识别模型与资源**的许可、来源、修改声明和
对应源码讲清楚、给到位，而不是放一个 LICENSE 就宣称合规。

| 对象 | 许可 | 你需要知道的事 |
| --- | --- | --- |
| 本项目原创代码 | AGPL-3.0-only | 完整正文 `LICENSE` / `LICENSES/AGPL-3.0.txt`；本仓库与 release 的 `hela-0.6.2-source.zip` 提供对应源码；具体分发与网络使用义务见许可证正文 |
| 37 张牌面 | **M+ 字型授權條款**（上游声明），非 AGPL、非 MIT | 来自 [lietxia/mahjong_graphic](https://github.com/lietxia/mahjong_graphic) 固定提交 `3e275804ff58325306710bef3a7406860444bc6a` 的 `Vectors 矢量图/SVG/`；图形未改动（仅行尾 LF→CRLF），逐张哈希与上游 git blob sha 见 [LICENSES/MAHJONG-GRAPHIC-NOTICE.md](LICENSES/MAHJONG-GRAPHIC-NOTICE.md) 与 `assets/tiles/art-provenance.json`；正文在 `LICENSES/MAHJONG-GRAPHIC-M-PLUS-LICENSE.txt` |
| `@kobalab/majiang-core` 1.4.1 | MIT | 和牌判定与算点，正文 `LICENSES/MAJIANG-CORE-MIT.txt` |
| `fflate` 0.8.3 | MIT | 模型分段解压，正文 `LICENSES/FFLATE-MIT.txt` |
| `onnxruntime-web` 1.30.0 | MIT | 识别运行时；**我们改动过**——项目内源码构建 + 资源生命周期补丁，上游源码、补丁与逐文件校验清单都在 `heybox-miniprogram/vendor/ort-webgl-1.30.0/` |
| `long` 5.3.2（传递依赖） | Apache-2.0 | 正文随 `LICENSES/RUNTIME-THIRD-PARTY-NOTICES.txt` 提供 |
| 识别权重（Mahjong-YOLO 转换） | **AGPL-3.0 单独标注** | 上游仓库、固定 commit、源文件 sha256、转换脚本 `scripts/prepare-heybox-vision.py`、分段脚本 `scripts/split_vision_model.py`、运行时补丁全部随包；权重不与上面任何 MIT 组件混为一谈 |
| 雀魂默认牌面纹理参考 | MIT（上游仓库标注） | 固定 commit 与文件哈希随包；**上游仓库的 MIT 声明不等于其中所有游戏美术在其他用途下也已获授权**，我们不据此扩张任何权利 |
| `esbuild` / `vite` / `sharp` / `@heybox/hb-sdk` | MIT / MIT / Apache-2.0 / ISC（包声明） | 构建期依赖，正文在 `LICENSES/` |

这些清单是工程分发材料，**不构成对全部权利或法律合规的保证**，也不替代你自己的法律判断。
品牌名称与选定图标的重用条款由项目方保留；fork 者请替换品牌素材。

`npm run check:public` 会扫描平台绑定、个人绝对路径、凭据与私有素材，并逐张核对牌面哈希与
上游许可正文；`node scripts/source-manifest.mjs` 会核对逐文件哈希。

---

## 五、校验与文档

```bash
npm run check:assets      # 牌面 SVG 未被替换（对照上游 git blob sha）+ 已提交产物逐字节一致
npm run check:public      # 无平台绑定 / 个人绝对路径 / 凭据 / 私有素材；许可文件齐全；牌面哈希匹配
npm run manifest          # 重写 SOURCE_MANIFEST.json（改动文件后必须）
npm run release:verify    # 校验 dist/releases 的 SHA256SUMS、清单与归档内容
npm run verify            # check:assets + check:public + test
```

- [docs/RELEASE.md](docs/RELEASE.md) — 下载包内容、构建与校验、静态托管说明
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — 分层、数据流、构建与发布流水线
- [docs/VISION-MODEL.md](docs/VISION-MODEL.md) — 识别权重来源、许可、分段与复现
- [SOURCE_MANIFEST.md](SOURCE_MANIFEST.md) — 导出范围、来源与哈希校验
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) — 第三方组件与许可正文位置

---

## 六、辅助：两款小程序（非主线）

同一套共享核心也驱动微信小程序与小黑盒小程序。它们属于辅助产物：公开工程不含真实平台绑定，
需要绑定到你自己的账号后才能预览/发布。

```bash
# 微信（原生小程序）
npm run build:mini            # src/ → wechat-miniprogram/utils/{core,i18n-core}.js
# 然后用微信开发者工具导入 wechat-miniprogram/，并把 project.config.json 的 appid 从占位
# touristappid 换成你自己的 AppID

# 小黑盒（Vite + hb-sdk）
npm run build:heybox          # 需要网络安装 hb-sdk；先把自己的 miniProgramId 填进
                              # heybox-miniprogram/package.json 的 heybox 段
```

两端细节见 [wechat-miniprogram/README.md](wechat-miniprogram/README.md)、
[heybox-miniprogram/README.md](heybox-miniprogram/README.md)。小程序端的照片识别同样在本机完成，
图片不上传；小程序的体积预算与图片上限由构建脚本强制检查。

---

## 七、明确的边界

- 不做服务端、不做账号体系、不做跨设备同步、不做 PWA 安装、没有遥测。
- 完整浏览器版需要静态服务器或静态托管（`file://` 下浏览器不允许加载模块与模型）；
  只有单文件离线版可以双击打开，而它不含照片识别。
- 算点覆盖标准规则集，不承诺覆盖所有地方役；识别结果始终可以人工校正。
- 具体 GitHub 仓库地址、推送与公开发布由维护者确认后执行，本仓库不包含远端配置。
