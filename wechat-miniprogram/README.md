# 和啦 · 微信小程序端

原生微信小程序（CommonJS）。录牌算点、役种图鉴、30 个教学示例与组牌练习、算点练习、历史记录与
本地四人点棒表；照片识别在本机完成，图片不上传。业务逻辑来自上一级的共享核心 `../src/`，
本端只保留页面、组件与平台适配。

- 许可：**本项目原创代码**为 AGPL-3.0-only（见 `../LICENSE`）。37 张牌面**不是原创素材**：
  它们是上游 `lietxia/mahjong_graphic` 的矢量图，按上游 **M+ 字型授權條款**使用，
  **不按 AGPL 或 MIT 授权**——见 `../LICENSES/MAHJONG-GRAPHIC-M-PLUS-LICENSE.txt`（正文）与
  `../LICENSES/MAHJONG-GRAPHIC-NOTICE.md`（固定提交、逐张哈希、来源链）
- 第三方：`@kobalab/majiang-core`（MIT，见 `MAJIANG-LICENSE.txt`）、识别权重（AGPL-3.0，见
  `VISION-MODEL-AGPL.txt` 与 `VISION-MODEL-NOTICE.md`）、雀魂纹理参考（MIT，见
  `MAJSOUL-TEMPLATES-LICENSE.txt`）

## 打开与预览

1. 用微信开发者工具「导入项目」，目录选本目录（`wechat-miniprogram/`）。
2. **先绑定你自己的 AppID**：`project.config.json` 里的 `appid` 目前是占位值 `touristappid`，
   改成你自己的 AppID（或直接用开发者工具的测试号）。
3. 构建一次共享核心产物（在包根目录，也就是本目录的上一级执行）：

```bash
cd ..            # 回到包根目录
npm ci
npm run build:mini
```

`npm run build:mini` 会把 `../src/` 打包成 `utils/core.js`（算点 + 教学 + 手牌输入）与
`utils/i18n-core.js`（三语目录 + 展示器），并复制 majiang-core 的许可正文。它同时会：

- 校验 37 张牌面 PNG 与 `../assets/tiles/art-manifest.json` 的哈希一致；
- 校验分包 < 1,500,000 B、主包 < 1,500,000 B、图片合计 < 200,000 B、总计 < 30 MiB。

## 结构

| 路径 | 说明 |
| --- | --- |
| `app.js` / `app.json` / `app.wxss` | 入口、页面与分包声明、全局样式 |
| `pages/` | 首页、算点、图鉴、历史、识别、练习、本地牌桌、教学 |
| `components/` | 牌面组件、页头 |
| `utils/` | 平台适配（存储、主题、导航、拍照）与**构建产物** `core.js`、`i18n-core.js` |
| `assets/tiles/` | 37 张牌面 PNG（由 `../assets/tiles/*.svg` 栅格化的生成产物） |
| `vision-part-01…14`、`vision-aux-01…04` | 识别模型的权重分包（每包一个空页面以进入分包） |
| `styles/themes.wxss` | 三套主题变量 |

`utils/core.js` 与 `utils/i18n-core.js` 是生成文件，不要手改——改 `../src/` 后重新构建。

## 识别模型分包

权重以 18 个分包承载（14 个主模型 + 4 个辅助模型），单个 `weights.bin` 通过
`project.config.json` 的 `packOptions.include` 显式纳入，便于规避单包体积上限。推理在设备本地
完成：不请求服务器、不上传照片、不把用户图片写入相册。

## 隐私

- 记录、主题与语言设置只写入微信本地存储。
- 识别过程把用户选择的照片读入内存，用完即弃；不落盘、不上传。
- 无第三方统计 SDK、无远程字体、无外部 CDN 依赖。

## 与内部版本的关系

本目录是从内部 1.3.3 基线导出的公开副本，差异仅限：AppID 换成占位值、牌面与示例图换成本工程
原创素材、补充元数据与文档、移除本机私有开发设置（`project.private.config.json`）。业务逻辑未改，
详见包根的 [SOURCE_MANIFEST.md](../SOURCE_MANIFEST.md)。
