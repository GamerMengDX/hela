# 第三方组件与许可

本工程**原创代码**采用 **AGPL-3.0-only**（见 [LICENSE](LICENSE)）。37 张牌面**不是原创素材**：
它们是上游 [lietxia/mahjong_graphic](https://github.com/lietxia/mahjong_graphic) 的矢量图，
按上游声明的 **M+ 字型授權條款**使用，**不按 AGPL-3.0-only、也不按 MIT 授权**。下面每一类第三方
组件都保留它自己的许可：我们不把整个仓库笼统标成某一个第三方许可，也不替第三方改写许可。
本清单是分发准备材料，**不构成对全部权利或法律合规的保证**，也不替代你自己的法律判断：
开源本项目的首要目的就是把实际用到的依赖、识别模型与资源的许可、来源、修改声明和对应源码讲清楚，
而不是靠一个 LICENSE 文件宣称整体合规。

“许可正文位置”列出的文件都实际随包提供，不是链接替代品。
牌面的固定提交、逐张哈希与来源链见 [LICENSES/MAHJONG-GRAPHIC-NOTICE.md](LICENSES/MAHJONG-GRAPHIC-NOTICE.md)。

## 运行依赖

| 组件 | 版本 | 许可 | 用途 | 许可正文 |
| --- | --- | --- | --- | --- |
| `@kobalab/majiang-core` | 1.4.1 | MIT | 和牌判定与算点（`src/engine.js` 依赖） | [LICENSES/MAJIANG-CORE-MIT.txt](LICENSES/MAJIANG-CORE-MIT.txt) |
| `fflate` | 0.8.3 | MIT | 识别模型分段的流式解压 | [LICENSES/FFLATE-MIT.txt](LICENSES/FFLATE-MIT.txt) |
| `onnxruntime-web` | 1.30.0 | MIT | 识别推理运行时（WebGL） | [LICENSES/ONNXRUNTIME-MIT.txt](LICENSES/ONNXRUNTIME-MIT.txt) |
| `long` | 5.3.2（经 onnxruntime 传递） | Apache-2.0 | protobuf int64 | 正文见 [LICENSES/RUNTIME-THIRD-PARTY-NOTICES.txt](LICENSES/RUNTIME-THIRD-PARTY-NOTICES.txt) |

## 构建依赖

| 组件 | 版本 | 许可 | 用途 | 许可正文 |
| --- | --- | --- | --- | --- |
| `esbuild` | 0.28.2 | MIT | 小程序端与浏览器端打包 | [LICENSES/ESBUILD-MIT.md](LICENSES/ESBUILD-MIT.md) |
| `vite` | ^8.0.12 | MIT | 小黑盒端 `hb-sdk build` | [LICENSES/VITE-MIT.md](LICENSES/VITE-MIT.md) |
| `sharp` | 0.35.5 | Apache-2.0 | 仅用于栅格化牌面（`npm run assets:tiles`）与合成品牌封面图（`npm run assets:icons`） | [LICENSES/SHARP-APACHE-2.0.txt](LICENSES/SHARP-APACHE-2.0.txt) |
| `@heybox/hb-sdk` | 0.9.1 | ISC（包声明） | 小黑盒端构建与运行时握手 | [LICENSES/HB-SDK-ISC.md](LICENSES/HB-SDK-ISC.md) |

`@heybox/hb-sdk` 的依赖闭包由它自带的 `THIRD_PARTY_NOTICES.md` 覆盖，安装后可在
`heybox-miniprogram/node_modules/@heybox/hb-sdk/THIRD_PARTY_NOTICES.md` 查看。

## 识别模型（与代码许可分开）

| 对象 | 许可 | 说明 |
| --- | --- | --- |
| 雀魂截图模板（`majsoul` 模板） | MIT | 保留上游固定提交与文件哈希，正文 [LICENSES/MAJSOUL-TEMPLATES-MIT.txt](LICENSES/MAJSOUL-TEMPLATES-MIT.txt) |
| Mahjong-YOLO 转换后的权重（`heybox-miniprogram/src/vision/generated/`） | **AGPL-3.0** | 权重单独声明许可，不与上面的 MIT 混为一谈；来源、固定 commit、校验和、转换脚本与运行时补丁见 [docs/VISION-MODEL.md](docs/VISION-MODEL.md) 与 `heybox-miniprogram/public/vision/VISION-MODEL-NOTICE.md` |
| ONNX Runtime WebGL 源码构建（`vendor/ort-webgl-1.30.0/`） | MIT | 上游源码 + 项目补丁 + 校验清单一并提供，正文 [LICENSES/ONNXRUNTIME-MIT.txt](LICENSES/ONNXRUNTIME-MIT.txt) |

上游 Mahjong-YOLO 仓库代码本身是 MIT，转换后的权重与产物按 AGPL-3.0 标注；模型训练数据的权利
边界没有经过独立的法务审查。

雀魂默认牌面纹理参考的上游仓库标注 MIT，这**不等于**其包含的游戏美术素材在其他用途下也已获授权：
我们只保留上游许可、固定提交与文件哈希，不据此扩张任何权利，也不在运行时打包原始模板图片。

## 牌面矢量图（与代码许可分开）

| 对象 | 许可 | 说明 |
| --- | --- | --- |
| `assets/tiles/*.svg`（37 张牌面）与由它栅格化的 `*.png`、示例牌条 | **M+ 字型授權條款**（上游声明），SPDX 无对应标识 | 来自 [lietxia/mahjong_graphic](https://github.com/lietxia/mahjong_graphic) 固定提交 `3e275804ff58325306710bef3a7406860444bc6a` 的 `Vectors 矢量图/SVG/`。正文：[LICENSES/MAHJONG-GRAPHIC-M-PLUS-LICENSE.txt](LICENSES/MAHJONG-GRAPHIC-M-PLUS-LICENSE.txt)（上游 `LICENSE` 原文）；来源、逐张哈希与来源链：[LICENSES/MAHJONG-GRAPHIC-NOTICE.md](LICENSES/MAHJONG-GRAPHIC-NOTICE.md)；上游 `readme.md` 原文：[LICENSES/MAHJONG-GRAPHIC-UPSTREAM-README.md](LICENSES/MAHJONG-GRAPHIC-UPSTREAM-README.md) |

这套牌面**不是本项目原创**，也**不按 AGPL-3.0-only 或 MIT 分发**——只有本工程自己的代码是 AGPL-3.0-only。
图形本身一处都没改（没有重画、改色、简化路径或换字体），唯一差异是行尾：上游 LF，本工程副本 CRLF；
把 CRLF 归一化为 LF 后 git blob sha 与上游完全一致，37 张逐张记录在
[assets/tiles/art-provenance.json](assets/tiles/art-provenance.json)。`npm run check:assets` 与
`npm run check:public` 都会重算这些哈希，换图即失败。

上游 README 自述其中部分图形来自「一点麻将」I.Mahjong（<https://github.com/SyaoranHinata/I.Mahjong>，
范围为一万至九万、东南西北白发中、其中一种一索、其中一种一筒），而 I.Mahjong 又是用 GL-MahjongTile
修改而来。上游没有为这两者单独提供许可正文；本工程如实保留这条来源链与上游给出的条款，不据此扩张权利。

## 品牌素材

| 对象 | 来源 | 说明 |
| --- | --- | --- |
| `assets/platform-icon-mochi.png` | 本工程选定的品牌图标方案 01 | 由项目方提供的素材集中选定，仅携带选中资源；sha256 见 `scripts/public-scan.mjs` 的固定值 |
| `assets/app-icon-buddies.webp` | 本工程选定的品牌图标方案 03 | 同上，作为应用内图标 |
| 微信小程序图标 `wechat-miniprogram/assets/app-icon.png` | 本工程品牌图标 | 微信端头像 |

品牌名称“和啦 / Helā”与上述图标的重用条款由项目方保留；fork 者若替换品牌，请同时替换图标。

## 下载包中的许可材料

把浏览器版打成可下载归档时（`npm run release:prepare`），上面这些正文会被**一并放进归档**，
而不是只在仓库里：

- `hela-<版本>-web.zip`（完整浏览器版，含本机照片识别）：`LICENSE`、`LICENSES/**`（含牌面的
  M+ 条款与来源说明、`LICENSES/vision/` 的权重许可、上游来源、ONNX Runtime 与纹理参考正文）、
  `THIRD_PARTY_NOTICES.md`；
- `hela-<版本>-offline.zip`（离线单文件版）：同样的许可材料；
- `hela-<版本>-source.zip`：完整源码 + 牌面来源清单（`assets/tiles/art-provenance.json`）+ 模型转换/分段脚本
  + ONNX Runtime 上游源码与补丁 + 逐文件哈希清单。

打包脚本把"必需许可文件缺失"和"归档里出现依赖/VCS 目录或符号链接"当作**构建失败**，
因此不会出现"发了包但没有许可"或"发了包但漏了权重说明"的情况。
权威清单见 [docs/RELEASE.md](docs/RELEASE.md) 与归档内的 `README-DOWNLOAD.md` / `README-OFFLINE.md`。

## 刻意不含的内容

- 早期工作区里那些没有许可声明的历史牌面素材——公开副本只用上面这套上游 M+ 牌面。
- 上游仓库里的其它目录（`.ai` 矢量源文件、PNG 位图、雀魂样式目录、扁平风格目录、花牌/季节牌）——
  只取了 `Vectors 矢量图/SVG/` 下用到的 37 个文件。
- 用户照片、验收截图、识别诊断日志、内部实验目录与候选模型变体。
- 任何真实 AppID / miniProgramId / 凭据（公开副本只有占位值）。
- 已提审小程序包与本地私有开发设置（`project.private.config.json`）。
