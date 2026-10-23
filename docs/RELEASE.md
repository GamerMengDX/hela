# 下载包（release 产物）

本页说明发布页上的下载包**是什么、怎么用、怎么生成、怎么校验**。
生成脚本：`scripts/release-packages.mjs`（`npm run release:prepare` / `npm run release:verify`）。

产物目录：`dist/releases/`（已被 `.gitignore` 忽略，属于构建产物，不提交）。

| 文件 | 用途 |
| --- | --- |
| `hela-<版本>-web.zip` | **完整浏览器版**：已构建的静态网站 + 许可与来源材料 + 启动说明 |
| `hela-<版本>-offline.zip` | **离线单文件版**：可双击的 `hela-<版本>.html` + 许可与来源材料 |
| `hela-<版本>-source.zip` | **对应源码**：逐文件哈希清单里列出的完整公开源码树 |
| `hela-<版本>.html` | 单文件版本身，便于直接下载/分享 |
| `hela-<版本>-SOURCE.md` | 对应源码说明（指向源码归档与其 sha256，适用义务见许可证正文） |
| `SHA256SUMS` | 上述每个文件的 sha256 |
| `release-manifest.json` | 版本、输入、产物大小/哈希、许可清单、两种产物差异、固定时间戳说明 |

## 一、两种产物到底差什么

| | 完整浏览器版 `web.zip` | 离线单文件版 `offline.zip` |
| --- | --- | --- |
| 打开方式 | 本地静态服务器，或任意静态托管（子目录也可以） | 双击 html |
| 照片识别 | 有（本机 WebGL；模型分段随包，约 28–38 MB） | **无**（编译期把照片工厂替换为禁用实现，入口隐藏且直接导航被拦，不含模型与运行库） |
| 算点 / 43 役 / 30 教学 / 练习 / 点棒表 / 三语 / 三主题 | 有 | 有 |
| 联网需求 | 无 | 无 |

完整版**不能双击**：浏览器不允许从 `file://` 加载 ES 模块与识别模型。这不是配置问题，也不是
"隐藏了按钮"，而是文件协议的限制。单文件版则相反：它**没有**识别能力，不能当作完整版的离线副本。

## 二、怎么打开完整版

```bash
cd hela-<版本>-web
python3 -m http.server 8080 --bind 127.0.0.1        # Windows: py -m http.server 8080 --bind 127.0.0.1
# 打开 http://localhost:8080/
```

部署到 GitHub Pages 或任意子目录时，把该目录内容原样上传即可。归档内的 `index.html` 只使用相对路径
（打包脚本会拒绝任何以 `/` 开头的资源引用，避免"本地能用、子目录 404"）。

## 三、归档里有什么

每个归档都**自带给它用的许可与来源材料**（打包脚本把缺失的许可文件当作构建失败，不会静默漏发）：

```text
LICENSE                                  AGPL-3.0 正文（仅本项目原创代码）
LICENSES/AGPL-3.0.txt                    同上（便于按目录引用）
LICENSES/MAHJONG-GRAPHIC-M-PLUS-LICENSE.txt  37 张牌面的上游许可正文（M+ 字型授權條款，非 AGPL/MIT）
LICENSES/MAHJONG-GRAPHIC-UPSTREAM-README.md  上游 readme.md 逐字节原文（含同一份条款与来源链）
LICENSES/MAHJONG-GRAPHIC-NOTICE.md       牌面固定提交、逐张哈希、来源链与复现方法
LICENSES/MAJIANG-CORE-MIT.txt            和牌判定与算点库
LICENSES/FFLATE-MIT.txt                  gzip 解压库
LICENSES/ONNXRUNTIME-MIT.txt             推理运行时
LICENSES/RUNTIME-THIRD-PARTY-NOTICES.txt 运行时第三方正文（含 long 的 Apache-2.0）
LICENSES/MAJSOUL-TEMPLATES-MIT.txt       雀魂纹理参考（MIT，上游仓库声明）
LICENSES/VITE-MIT.md, LICENSES/ESBUILD-MIT.md, LICENSES/SHARP-APACHE-2.0.txt, LICENSES/HB-SDK-ISC.md
LICENSES/vision/VISION-MODEL-AGPL.txt    识别权重许可（单独标注，不与 MIT 组件混同）
LICENSES/vision/VISION-MODEL-NOTICE.md   权重来源、固定 commit、校验和、转换说明
LICENSES/vision/VISION-UPSTREAM-MIT.txt  上游代码许可
LICENSES/vision/MAJSOUL-TEMPLATES-*.md   纹理参考许可与来源说明
LICENSES/vision/RUNTIME-THIRD-PARTY-NOTICES.txt
THIRD_PARTY_NOTICES.md                   全部第三方组件与本项目许可的总览
README-DOWNLOAD.md / README-OFFLINE.md   对应包的启动与使用说明
```

`web.zip` 另含实际构建出的应用（`index.html`、`main.js`、`main.css`、`chunks/`、`assets/`、
`metafile.json`）；`source.zip` 另含完整源码（见下）。

## 四、对应源码（AGPL 义务）

`hela-<版本>-source.zip` 是构建该产物所用的**完整公开源码**，不是链接：

- 内容 = `SOURCE_MANIFEST.json` 里列出的每一个文件 + 清单自身，逐字节一致；
- 含牌面校验与栅格脚本 `scripts/generate-tile-art.mjs` 与牌面来源记录 `assets/tiles/art-provenance.json`；
- 含模型转换与分段脚本 `scripts/prepare-heybox-vision.py`、`scripts/split_vision_model.py`
  以及固定版本依赖 `scripts/heybox-vision-requirements.txt`；
- 含 ONNX Runtime 源码构建材料：`heybox-miniprogram/vendor/ort-webgl-1.30.0/`
  （上游源码、`patches/0001-resource-lifecycle.patch`、`PATCHES.md`、逐文件 sha256 清单）；
- 含随包提交的识别模型分段（`heybox-miniprogram/src/vision/generated/`）与两个小程序副本；
- **不含** `node_modules/`、`dist/`、`.git/`、用户照片、诊断日志或本机私有设置。

还原与校验：

```bash
unzip hela-<版本>-source.zip -d hela-src && cd hela-src
npm ci
npm test
node scripts/source-manifest.mjs        # 逐文件哈希与 SOURCE_MANIFEST.json 一致
npm run build:web && npm run build:single
npm run release:prepare                 # 重新产出本页描述的下载包
```

## 五、怎么生成一次发布

```bash
npm ci
npm test
npm run build:web        # 需要先有 dist/web
npm run build:single     # 需要先有 dist/hela.html
npm run manifest         # 记录源码哈希（改动文件后必须重跑）
npm run release:prepare  # 或直接 npm run release（上面三者的串联）
npm run release:verify   # 校验 SHA256SUMS、清单与归档内容
```

打包脚本的硬性检查（任一不满足就失败，不产出"看起来成功"的包）：

| 检查 | 失败信息指向 |
| --- | --- |
| `dist/web/index.html` 是否存在 | `Run npm run build:web first … No archive was written.` |
| `dist/hela.html` 是否存在 | `Run npm run build:single first …` |
| `index.html` 是否有根绝对路径 | 列出 offending 路径，要求改成 `./` 相对路径 |
| 完整版是否真的带模型分段 | 少于阈值时报 `silently lost photo recognition` |
| 必需许可/来源文件是否齐全 | 列出缺失文件 |
| `SOURCE_MANIFEST.json` 是否与工作树一致 | 列出 added/changed/removed，要求 `npm run manifest` |
| 归档内是否出现依赖/VCS 目录或符号链接 | 直接拒绝打包 |
| 归档条目内容与清单是否一致 | `release:verify` 报缺文件或多文件 |

归档条目时间戳固定为 `2026-10-22T00:00:00Z`，**相同输入重跑得到相同字节**，便于复现与比对。

## 六、校验下载

```bash
shasum -a 256 -c SHA256SUMS                 # macOS / Linux
certutil -hashfile hela-<版本>-web.zip SHA256   # Windows
```

`release-manifest.json` 里也记录了每个产物的 `bytes` 与 `sha256`，
两份记录互为交叉校验；`npm run release:verify` 会同时检查两者与归档内部内容。

## 七、发布范围

本仓库不包含远端配置、不执行推送。GitHub 仓库地址、Release 上传与公开部署由维护者在成果验收后
另行确认；`dist/releases/` 是本地构建产物，可按需上传到已确认的 release。

页面帮助中可展开查看本项目原创代码 AGPL 及 majiang-core MIT 完整正文，两种构建均在构建期内嵌；
下载包另附完整第三方许可（含牌面的 M+ 条款与来源说明）与对应源码说明。
