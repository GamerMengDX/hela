# 导出范围、来源与哈希校验

本文件说明这个公开工程**包含什么、从哪来、如何校验**。逐文件哈希在
[SOURCE_MANIFEST.json](SOURCE_MANIFEST.json) 里，由 `scripts/source-manifest.mjs` 生成与核对：

```bash
npm run manifest                # 重写清单
node scripts/source-manifest.mjs   # 校验当前工作树与清单一致
```

清单记录每个随包文件的 `sha256` 与字节数，并列出被排除的类别。任何改动都会让校验失败，因此
“文档说改了什么”与“实际发了什么”不会各说各话。

清单同时是**源码下载包**的唯一依据：`npm run release:prepare` 产出的
`hela-<版本>-source.zip` 内容 = 清单列出的每个文件 + 清单自身，逐字节一致（打包前会先校验工作树
与清单一致，不一致直接失败并提示 `npm run manifest`）。详见 [docs/RELEASE.md](docs/RELEASE.md)。

## 收录规则

- **包含隐藏目录**：`.github/`（CI、issue 模板等）与其他点目录属于公开源码，会被收录；
  只有下面列出的目录被排除。
- **拒绝符号链接**：工作树里出现任何 symlink 都会让清单生成与打包失败，而不是跟随它去读包外文件
  （例如本机父仓库）。这条规则同样适用于"看起来在包内、实际指向包外"的链接。
- **拒绝依赖/VCS 路径**：清单与归档都不允许出现 `node_modules/`、`dist/`、`.git/`。

## 来源

本工程是从一个只读的内部开发树导出的白名单快照，**不是**内部仓库的完整历史。内部仓库里的
实验目录、候选打包、验收截图与提审包都不在这里。

| 本工程路径 | 内部来源（相对路径） | 同步方式 |
| --- | --- | --- |
| `src/**` | `<内部仓库>/src`（排除旧网页入口 `app.js`、`tiles.js`、`index.html`、`styles.css`、`favicon.svg`、`assets/`） | 逐文件精确复制；共享源码哈希记录在 `heybox-miniprogram/i18n-source-manifest.json` |
| `wechat-miniprogram/**` | `<内部仓库>/wechat-miniprogram`（微信小程序 1.3.3 基线） | 复制后按下方“导出改动”修改 |
| `heybox-miniprogram/**` | `<内部仓库>/experiments/heybox-vision-refactor/heybox-miniprogram`（小黑盒 0.3.13 候选白名单） | 白名单复制后按下方“导出改动”修改 |
| `assets/tiles/*.svg`（37 张） | 上游 `lietxia/mahjong_graphic` 固定提交 `3e275804ff58325306710bef3a7406860444bc6a` 的 `Vectors 矢量图/SVG/`；M+ 字型授權條款 | 与内部仓库 `<内部仓库>/src/assets/tiles/` 逐字节一致（图形未改动，仅行尾 LF→CRLF）；上游路径与 git blob sha 逐张记录在 `assets/tiles/art-provenance.json` |
| 两端的 `assets/tiles/*.png`、`assets/examples/hand-demo.png` | 由上面的 SVG 栅格化/合成 | `scripts/generate-tile-art.mjs`（sharp，133×182 = viewBox 19:26 的 7 倍，不拉伸）；哈希记入 `assets/tiles/art-manifest.json` |
| `assets/app-icon-buddies.webp` | 内部品牌素材选定方案 03 | 复制，sha256 固定在 `scripts/public-scan.mjs` |
| `assets/platform-icon-mochi.png` | 内部品牌素材选定方案 01 | 复制，sha256 固定在 `scripts/public-scan.mjs` |
| `scripts/prepare-heybox-vision.py`、`scripts/split_vision_model.py`、`scripts/heybox-vision-requirements.txt` | `<内部仓库>/experiments/heybox-vision-refactor/scripts` | 精确复制（模型转换与分段工具） |

## 导出改动（相对内部来源）

微信端：

1. `project.config.json` 的 `appid` 由真实值改为占位 `touristappid`；删除 `project.private.config.json`。
2. `assets/tiles/*.png`（37 张）与 `assets/examples/hand-demo.png` 重新由 `assets/tiles/*.svg`
   （上游 mahjong_graphic，M+ 条款）栅格化/合成。
3. `package.json` 补充名称、版本、许可与说明；`README.md` 重写为公开使用说明。
4. 未包含 `node_modules`、`dist`、任何用户照片或诊断文件。

小黑盒端：

1. `package.json` 的 `heybox.miniProgramId` 清空（未绑定），补充许可与构建脚本。
2. `scripts/sync-i18n.mjs` 与 `scripts/sync-teaching.mjs` 改为**校验**共享源码而不是从父目录镜像复制
   （公开包只有一份共享源码，不存在“镜像”）；`scripts/verify-vision.mjs` 新增为离线识别资源门禁。
3. `scripts/build-vision.mjs`、`scripts/sync-online-vision.mjs` 的规范源路径改为包内相对路径。
4. `public/assets/tiles/*.png`、`public/assets/examples/hand-demo.png` 重新由 `assets/tiles/*.svg`
   （上游 mahjong_graphic，M+ 条款）栅格化；
   `assets/cover-home.webp` 由 `npm run assets:icons` 用同一批牌面与选定图标重新合成。
5. 删除仅开发期使用的 `src/dev/`、`test/`、`scripts/build-dev-gpu.mjs`、`serve-dev.mjs`、
   `build-vision-candidates.mjs`、`vision-select.mjs`、`vision-candidates.json`、`dev-*` 目录、
   `.vite-cache`、`IMPLEMENTATION-*.md`；候选模型比较集不属于公开分发面。
6. 保留 `vendor/ort-webgl-1.30.0/` 的上游源码、项目补丁、`PATCHES.md` 与校验清单。

## 排除项

- 依赖与构建产物：`node_modules/`、`dist/`（含 `dist/releases/` 下载包）、`heybox-miniprogram/.vite-cache/`、`.venv*/`、`coverage/`
- 本机私有：`wechat-miniprogram/project.private.config.json`、`.DS_Store`
- 用户数据：照片、验收截图、识别诊断日志、`*.f32` 中间结果
- 模型源权重 `*.onnx`（只在本地重新生成分段时需要；随包提供的是已校验的分段产物）
- 内部实验目录、历史原型、提审包、候选模型变体

## 与内部原件的隔离

导出只读取内部工作树，没有修改它。内部仓库的受保护文件清单（1663 个源文件/小程序/活动候选/
冻结实验文件）在导出前后逐一比对哈希，保持完全一致；公开工程的构建、素材替换与依赖安装都在
自己的目录内进行，不改动内部原件、根 `package.json`、根 `node_modules` 或任何已提审包。

公开副本的后续质量修复：图鉴的宝牌/赤宝牌/里宝牌标签按每张1番显示；Web增加损坏业务记录恢复与所有页面的临时/跨标签提示。以上仅作用于本公开工程，原已提审版本不变。

牌面恢复（0.6.2）：公开副本放弃早期手绘牌面，改用内部仓库 `src/assets/tiles/` 里的 37 张原牌面
（源头为上游 mahjong_graphic 固定提交，M+ 字型授權條款）。图形逐字节未改，只把内部副本的 CRLF 行尾
原样带过来；`scripts/generate-tile-art.mjs` 从“绘制”改为“校验 + 栅格化 + 合成”，
`assets/tiles/art-provenance.json` 记录逐张上游路径与 git blob sha。内部原件未做任何修改。
