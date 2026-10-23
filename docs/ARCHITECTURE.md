# 架构

目标：一套业务核心（算点、役种、教学、练习、三语）驱动三个平台端，平台差异只出现在薄薄一层
适配器里；构建产物各自独立、可离线复现，且不把平台绑定、用户数据或第三方素材混进源码。

## 分层

```text
                        src/  （共享业务核心，纯 ES 模块，无平台 API、无 DOM）
   ┌───────────────┬──────────────────────────┬───────────────────────────┐
   │ 算点           │ 教学 / 练习              │ 三语                      │
   │ engine.js     │ teaching*.js             │ i18n/catalogs*.js         │
   │ data.js       │ practice.js              │ i18n/presenters.js        │
   │ hand-input.js │ examples.js              │ i18n/runtime.js           │
   │ examples.js   │                          │ i18n/locale-store.js      │
   └───────────────┴──────────────────────────┴───────────────────────────┘
                                   ▲
        ┌──────────────────────────┼───────────────────────────┐
        │                          │                           │
 wechat-miniprogram/        heybox-miniprogram/          web/
 utils/*.js（CommonJS）      src/*.js（Vite ES 模块）     src/*（浏览器 adapter）
 平台：wx.*                 平台：@heybox/hb-sdk          平台：DOM + Web Storage
```

`src/` 不 import 任何平台 API，也不 import 任一端的代码；三端都只是“调用者”。小程序的相对
路径天然指向共享核心：

- `wechat-miniprogram/utils/core.js`、`i18n-core.js` 是**构建产物**（`npm run build:mini` 由
  `src/miniprogram-core.js` 与 `src/i18n/native-entry.js` 打包得到），运行时不依赖 npm 包。
- `heybox-miniprogram/src/**` 里的 `../../src/...`、`../../../src/...` 解析到本包的 `src/`；
  同一份共享源码既是它构建时的输入，也是它校验的对象（`i18n-source-manifest.json`）。

## 共享核心

| 模块 | 职责 |
| --- | --- |
| `src/data.js` | 43 役数据、番符与点数常量、牌名等静态数据 |
| `src/engine.js` | 牌记法解析、手牌/副露校验、`calculate()` 算点、`validTile`、`inventory` 等 |
| `src/hand-input.js` | 手牌录入状态机（含和牌张同步） |
| `src/examples.js` | 算点示例与内置牌例 |
| `src/teaching-examples.js` | 30 个教学示例的牌型、目标役与翻符说明 |
| `src/teaching-model.js` | 教学状态、目标役判定、结果呈现 |
| `src/teaching-exercise.js` | 组牌练习（含副露编辑）状态机 |
| `src/teaching.js` | 教学门面（浏览器侧封装） |
| `src/practice.js` | 算点练习出题与判题（可注入确定性 rng） |
| `src/i18n/catalogs/*.js` | 三语目录：`native.*`（小程序原生）、`heybox.*`（小黑盒）、`shared.*`（共用语义） |
| `src/i18n/presenters.js` | 把业务结果（役、符、支付、副露）转成可本地化文本引用 |
| `src/miniprogram-core.js` | 微信端的核心再导出入口（只 re-export，不重写逻辑） |

三语设计：目录条目是 `[zh-CN, ja, en]` 三元组，`validateCatalogs()` 校验键名语义、占位符在三语
之间一致、无重复键；`presenters.js` 再保证“算点结果 → 展示文本”的映射不散落在各端。

## 平台适配

| 端 | 存储 | 剪贴板 | 其他 |
| --- | --- | --- | --- |
| 微信 | `wx.setStorage` 等 | `wx.setClipboardData` | 原生页面 + 分包模型 |
| 小黑盒 | `hbSDK.storage` | `hbSDK.device.setClipboard` | 平台握手 Gate、视口安全区 |
| 浏览器 | Web Storage，独立前缀 `hela-web-v1:` | `navigator.clipboard`（失败时给可手选文本） | `env(safe-area-inset-*)`，存储禁用时明示“仅本次会话” |

适配器约定：`read()` 缺失返回 `undefined`（允许 JSON `null`），`write()` 只在写入成功后通知内存
更新；跨标签变化提示刷新并阻止旧状态覆盖，但不宣称跨标签事务。

## 识别流水线（小黑盒端 / 完整浏览器目录版）

1. **权重**：从上游 Mahjong-YOLO 导出的 FP16 ONNX，经 `scripts/prepare-heybox-vision.py` 展开为
   FP32 并按 `scripts/split_vision_model.py` 的拓扑策略切分成子图，产物提交在
   `heybox-miniprogram/src/vision/generated/`（每段一个 JS 模块，内容是 base64 gzip）。
2. **运行时**：`vendor/ort-webgl-1.30.0` 由 onnxruntime-web 1.30.0 源码 + 资源生命周期补丁在本地
   构建成 WebGL-only bundle（`src/vision/vendor-webgl.js`），不使用 npm 里现成的 dist bundle。
3. **推理**：`staged-runner.js` 逐段加载 → 跑 → 下载边界输出到 CPU → 释放 GPU 会话；
   `scheduler.js` 让出帧、`memory-policy.js` 限制图片尺寸、`diagnostics.js` 只在本地记录进度。
4. **复核**：识别结果进入 `review.js` 的人工校正界面，校正后再交给共享 `engine.js` 算点。
   **图片不上传**，只在内存与 GPU 纹理里存在。
5. **门禁**：`npm run prepare:vision`（`scripts/verify-vision.mjs`）逐段校验 gzip 与解压后的
   sha256、候选与 `vision-selection.json` 一致、vendor 上游文件与已安装包一致；冷构建不需要 Python。

## 构建产物

| 命令 | 产物 | 说明 |
| --- | --- | --- |
| `npm run build:web` | `dist/web/` | 完整浏览器目录版（按需求加载识别分块），相对路径，可部署到任意子目录 |
| `npm run build:single` | `dist/hela.html` | 离线单文件版：照片工厂编译期替换为禁用实现，不含模型与运行库 |
| `npm run release:prepare` | `dist/releases/*.zip`、`hela-<版本>.html`、`SHA256SUMS`、`release-manifest.json` | 在已有构建产物上打包下载件；缺产物/缺许可/清单漂移都直接失败，见 [RELEASE.md](RELEASE.md) |
| `npm run build:mini` | `wechat-miniprogram/utils/{core,i18n-core}.js` + 复用 `utils/*.js` | 校验牌面哈希、分包 <1.5 MB、图片合计 <200,000 B、主包 <1.5 MB、总计 <30 MiB |
| `cd heybox-miniprogram && npm run build` | `heybox-miniprogram/dist/` | 校验共享源码与识别资源 → `hb-sdk build` → `verify-dist.mjs` 审计 |

两种浏览器产物功能不同：单文件版**没有**照片识别，也不应被称作“完整目录版的单文件版”。
发布时两者分别打包（`hela-<版本>-web.zip` 与 `hela-<版本>-offline.zip`），并附对应源码归档
`hela-<版本>-source.zip`；归档内容与校验规则见 [RELEASE.md](RELEASE.md)。

## 发布流水线

```text
src/ + web/  ──build:web──▶  dist/web/  ─┐
                                        ├─release:prepare─▶ dist/releases/
src/ + web/  ──build:single──▶ dist/hela.html ─┘        ├ hela-<v>-web.zip
                                        │                ├ hela-<v>-offline.zip
SOURCE_MANIFEST.json ──manifest──▶ 逐文件哈希 ─┘          ├ hela-<v>-source.zip
                                                         ├ hela-<v>.html
                                                         ├ SHA256SUMS
                                                         └ release-manifest.json
```

打包脚本的硬约束（任一不满足即失败）：构建产物必须存在；`dist/web/index.html` 不得有根绝对路径；
完整版必须真的携带模型分段；必需许可/来源文件必须齐全；源码清单必须与工作树一致；
归档内不得出现依赖/VCS 目录或符号链接。归档条目时间戳固定，相同输入得到相同字节。

## 防回归

| 检查 | 作用 |
| --- | --- |
| `npm test` | 共享核心、30 个教学算分、练习判题、三语目录完整性 |
| `npm run check:assets` | 37 张 SVG 与 `assets/tiles/art-provenance.json`（含上游 git blob sha）一致，且两端 PNG/示例牌条与 `scripts/generate-tile-art.mjs` 的产物逐字节一致 |
| `npm run check:public` | 无平台绑定、个人绝对路径、凭据、私有素材；许可证文件齐全；品牌素材未被替换；牌面及其上游许可正文哈希未被替换 |
| `node scripts/source-manifest.mjs` | 随包文件与 `SOURCE_MANIFEST.json` 一致 |
| `heybox-miniprogram/scripts/verify-vision.mjs` | 识别分段、候选选择、vendor 溯源一致 |

## 不承诺的能力

- 没有服务端、没有账号、没有跨设备同步、没有 PWA 安装、没有遥测。
- 不保证算点规则覆盖所有地方役（标准规则集内），也不保证识别模型在任意拍摄条件下都准确；
  识别结果始终可人工校正。
