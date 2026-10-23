# 素材

## 牌面（上游 mahjong_graphic，按 M+ 字型授權條款）

`tiles/*.svg`（37 张）是**上游矢量图，不是本项目原创**：来自
[`lietxia/mahjong_graphic`](https://github.com/lietxia/mahjong_graphic) 固定提交
`3e275804ff58325306710bef3a7406860444bc6a` 的 `Vectors 矢量图/SVG/` 目录，
按上游声明的 **M+ 字型授權條款**使用——**不按 AGPL-3.0-only、也不按 MIT 授权**。
只有本工程自己的代码是 AGPL-3.0-only。

| 需要的材料 | 位置 |
| --- | --- |
| 许可正文（上游 `LICENSE` 逐字节原文） | [`../LICENSES/MAHJONG-GRAPHIC-M-PLUS-LICENSE.txt`](../LICENSES/MAHJONG-GRAPHIC-M-PLUS-LICENSE.txt) |
| 上游 `readme.md` 逐字节原文（同一份条款 + 来源链自述） | [`../LICENSES/MAHJONG-GRAPHIC-UPSTREAM-README.md`](../LICENSES/MAHJONG-GRAPHIC-UPSTREAM-README.md) |
| 固定提交、逐张哈希、来源链、复现方法 | [`../LICENSES/MAHJONG-GRAPHIC-NOTICE.md`](../LICENSES/MAHJONG-GRAPHIC-NOTICE.md) |
| 机器可读的来源记录 | [`tiles/art-provenance.json`](tiles/art-provenance.json) |
| 产出文件的 sha256 | [`tiles/art-manifest.json`](tiles/art-manifest.json) |

### 图形没有被改动

37 个 SVG 与上游同名文件**内容逐字节相同**，唯一差异是行尾：上游 LF，本副本 CRLF。
把 CRLF 归一化为 LF 后 git blob sha 与上游一致——37 张逐张记录在 `tiles/art-provenance.json`，
`npm run check:assets` 与 `npm run check:public` 都会重算。没有重画、没有改色、没有简化路径、
没有替换字体；`viewBox="0 0 19 26"` 原样保留。

### 生成流程（`scripts/generate-tile-art.mjs`）

```bash
npm run assets:tiles     # 校验 37 个 SVG → 生成两端 PNG 与示例牌条 → 写 art-manifest.json
npm run check:assets     # 只校验，不写：SVG 未被替换 + 已提交产物与生成结果逐字节一致
```

该脚本**不再绘制牌面**。它做四件事：

1. 逐张核对 `tiles/*.svg` 的 sha256 与 `tiles/art-provenance.json` 一致，并把 CRLF 归一化后的
   git blob sha 与上游固定提交的值比对——换成别的图、改颜色、改路径都会直接失败；
2. 用 `sharp`（已有的 devDependency，没有新增依赖）把 SVG 栅格化成 PNG，尺寸是 viewBox 的整数倍
   （19×7 = 133 宽、26×7 = 182 高），**不拉伸原宽高比**；
3. 用同一批 SVG 合成 14 张的示例牌条（`assets/examples/hand-demo.png`）；
4. 把产出的每一个字节的 sha256 写进 `tiles/art-manifest.json`，`build:mini` 再按它校验。

栅格参数固定在脚本顶部（`PNG_OPTIONS` / `TILE_SCALE`）。体积预算：37 张 PNG 合计约 153 KiB，
脚本自身在超过 155 KiB 时**直接失败**；微信端全部图片仍在 200,000 B 预算内（`build:mini` 会复查）。

## 品牌图标（项目方提供）

| 文件 | 用途 | sha256 |
| --- | --- | --- |
| `app-icon-buddies.webp` | 应用内图标（选定方案 03，128×128） | `5b6d70a3…f34f78` |
| `platform-icon-mochi.png` | 平台图标（选定方案 01，200×200） | `348fcf97…b15e8` |

两者是项目方品牌素材集中选定的资源，仅携带选中版本，原始大图与探索轮次不随包分发；
它们**不属于**上面那套上游牌面，也没有被本次牌面恢复改动。
`scripts/public-scan.mjs` 会校验这两个哈希，替换即失败（换品牌时请同时更新固定值）。
`heybox-miniprogram/assets/cover-home.webp` 由 `npm run assets:icons` 用这两个图标与 `tiles/*.svg`
合成（牌面缩略图同样按 viewBox 的整数倍 19×4 × 26×4 渲染，不拉伸）。

## 示例牌

`wechat-miniprogram/assets/examples/hand-demo.png`（以及小黑盒端的同名文件）是同一次栅格化产出的
**合成**牌例条（14 张牌面拼在一张绿底图上，1106×152），用于「用示例图试识别」。
它不是用户照片，也不是任何真实拍摄或截图。
