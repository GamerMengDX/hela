# 和啦 · 小黑盒小程序端

小黑盒（Heybox）小程序的 Web 技术栈版本：Vite + `@heybox/hb-sdk`，界面与本机识别都在小程序容器内
运行。业务逻辑来自上一级的共享核心 `../src/`；本端保留平台适配、识别流水线与 UI。

- 许可：**本项目原创代码**为 AGPL-3.0-only（见 `../LICENSE`）。37 张牌面**不是原创素材**：
  它们是上游 `lietxia/mahjong_graphic` 的矢量图，按上游 **M+ 字型授權條款**使用，
  **不按 AGPL 或 MIT 授权**——见 `../LICENSES/MAHJONG-GRAPHIC-M-PLUS-LICENSE.txt`（正文）与
  `../LICENSES/MAHJONG-GRAPHIC-NOTICE.md`（固定提交、逐张哈希、来源链）
- 第三方：`@heybox/hb-sdk`（ISC）、`fflate`（MIT）、`onnxruntime-web`（MIT）、
  onnxruntime 源码补丁、识别权重（AGPL-3.0，单独标注）。见
  [../THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) 与 `public/vision/`。

## 绑定你自己的小程序

公开副本**没有绑定任何小程序 ID**。要发布到自己的账号：

1. 在 `package.json` 的 `heybox` 段填入你自己的 `miniProgramId`（目前是空字符串），
   并按需修改 `icon`、`coverImages`、`permissions`。
2. `assets/hela-icon-mochi.png`、`assets/cover-home.webp` 是项目方的品牌素材；请替换成你自己的图标
   与封面（`npm run assets:icons` 会用 `../assets/tiles/*.svg` 的上游牌面 + 选定图标重新合成一张封面）。
3. 平台入口 Gate（握手状态）与 SDK 约束保持不变：识别、存储、剪贴板都经 `src/platform.js`
   的适配器，没有去掉平台门控。

## 构建

```bash
cd heybox-miniprogram
npm ci            # 需要网络：hb-sdk 及其依赖（含 vite、onnxruntime-web）
npm run build     # 校验共享源码 + 教学示例 + 识别资源 → hb-sdk build → 审计 dist/
```

`npm run build` 依次执行：

| 步骤 | 作用 |
| --- | --- |
| `prepare:i18n` | 校验 `../src/` 的共享模块与 `i18n-source-manifest.json` 的 sha256 一致（`--write` 可重记） |
| `prepare:teaching` | 校验共享教学模块可加载，且恰好 30 个示例、id 唯一 |
| `prepare:vision` | 逐段校验识别资源（gzip / 解压后 sha256、候选选择、vendor 溯源） |
| `hb-sdk build` | Vite 构建到 `dist/`（含平台清单） |
| `verify-dist.mjs` | 审计 `dist/` 没有开发期产物、模型资源与已选候选完全一致 |

开发预览：`npm run dev`（`hb-sdk dev --no-open`）。

## 结构

| 路径 | 说明 |
| --- | --- |
| `index.html` | 容器入口（`#app` + `src/main.js`） |
| `vite.config.cjs` | 故意用 CommonJS 配置：Vite 的 ESM 配置加载器会写临时目录，CommonJS 不会 |
| `src/app.js`、`src/ui.js`、`src/*.css` | 视图层与三套主题 |
| `src/calculator.js`、`local-table.js`、`teaching-view.js` | 算点、本地点棒表、教学视图 |
| `src/platform.js` | 平台适配器（`hbSDK` 存储 / 剪贴板 / 视口） |
| `src/vision/` | 识别流水线：分段执行、调度、内存策略、人工复核、WebGL 运行时 |
| `src/vision/generated/` | **提交进仓库的模型分段**（约 37 MB，gzip 后约 27 MB） |
| `vendor/ort-webgl-1.30.0/` | ONNX Runtime WebGL 的上游源码、项目补丁与 sha256 清单 |
| `public/vision/` | 模型许可、来源说明与分段清单的公开副本 |
| `public/assets/` | 牌面 PNG（由 `../assets/tiles/*.svg` 栅格化）与应用内图标 |
| `assets/` | 平台图标与封面（`hela-icon-mochi.png`、`cover-home.webp`） |

`src/**` 里的 `../../src/...`、`../../../src/...` 指向本包 `src/`，不存在第二份共享源码副本。

## 识别模型

分段权重已提交，所以**冷构建不需要 Python**：`npm ci && npm run build` 只要 Node。
重新生成分段（需要 `onnx` / `numpy`）见 [../docs/VISION-MODEL.md](../docs/VISION-MODEL.md)：

```bash
npm run vendor:build     # 由 vendor/ 源码重建 WebGL-only 运行时 bundle
npm run vision:rebuild   # 重新转换 + 分段，并更新 generated/ 与 manifest
```

权重许可是 **AGPL-3.0**，与代码的其他 MIT 组件分开记录；上游仓库、固定提交、源文件校验和与
转换脚本都在 `public/vision/VISION-MODEL-NOTICE.md` 与 `src/vision/generated/manifest.json` 里。

## 隐私

- 照片只在本机 GPU / 内存中解码与推理，不上传、不落盘、不进任何请求。
- 无遥测、无远程字体、无外部 CDN 运行时依赖；运行时依赖只有随包代码与本地模型。
- 存储只写本机；平台握手失败时按原逻辑提示重新进入。

## 与内部版本的关系

本目录是从内部 0.3.13 活动候选导出的白名单副本。差异：`miniProgramId` 清空、牌面与封面换成
原创素材、同步脚本改为“校验而不是镜像复制”、新增 `verify-vision.mjs` 冷构建门禁、修正规范源路径、
移除仅开发期使用的目录与脚本（`src/dev/`、`test/`、GPU 对比页与候选模型比较脚本）。
业务判断与推理策略未改，详见包根 [SOURCE_MANIFEST.md](../SOURCE_MANIFEST.md)。
