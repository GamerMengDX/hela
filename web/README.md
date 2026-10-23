# 和啦 · 独立网页版（B 执行器）

浏览器原生应用，与两个小程序共享同一份算点/教学/i18n 核心（`../src`），自带浏览器平台适配器，不依赖小黑盒 SDK、握手或预览模式。

## 命令

```bash
npm run build:web     # → dist/web/  完整静态目录（ESM + 按需分块，含本机照片识别）
npm run build:single  # → dist/hela.html 离线单文件（不含照片识别/模型）
npm run dev           # 仅用于本机查看 dist/web（node scripts/serve-web.mjs --port 4173）
```

构建脚本从不启动常驻服务；`dev` 只是把已构建的静态目录按 Pages 的相对路径规则提供出来。

## 两种产物

| 产物 | 内容 | 识别 |
| --- | --- | --- |
| `dist/web/` | `index.html` + `main.js` + `main.css` + `chunks/` + `assets/`，全部相对路径，可放在任意 GitHub Pages 子目录 | 照片页、ORT WebGL 运行库与 107 个模型分段都是按需分块；首次识别才下载 |
| `dist/hela.html` | 单个 HTML：IIFE bundle、CSS、37 张牌面与 2 个图标全部内联，`</script`/`</style` 转义 | 编译期把 `photo-slot.js` 换成禁用工厂，入口按钮隐藏、直接导航拦截；输入图无 vision/vendor/model |

两个构建都会留下 metafile（`dist/web/metafile.json`、`dist/single-metafile.json`），并在构建时自检：完整图不得引入 HB SDK/入口/Gate，单文件图不得出现任何识别、运行库或模型输入，产物不得有运行时 `import()`/`fetch()`/Worker 或外部地址。

## 启动可见性（0.6.1）

`index.html` 模板自带三样东西，两种产物都保留（由 `scripts/web-build-lib.mjs` 的 `auditBootContract()` 与 `test/web-boot/web-build` 锁定）：

- `#app` 内的静态 `#startup-note`：中日英三段打开说明（保存到本机、用常规浏览器打开、完整 Web 版需本地静态服务器、离线版不需要联网）。脚本没运行时它就是页面内容，所以不会白屏。
- `<noscript>`：脚本被禁用时补一句原因。
- `<script data-hela-startup-guard>`：主脚本之前的极小经典脚本，在首页渲染成功前把净化后的可读错误写进 `body` 末尾的 `#hela-startup-status`（类别 `[error]`/`[load]`/`[rejection]`/`[startup]` + `build web|single <版本>` 标记 + 截断到 140 字的摘要，不含路径/URL/堆栈），8 秒未就绪给中性提示；不调用 `preventDefault`，不谎称就绪。

`src/app.js` 首屏渲染成功后置 `<html data-hela-ready="true">` 并派发 `hela:ready`，guard 随即移除状态条：之后任何异常都不再写入界面，也不会清掉已录入的手牌。构建会把 `<meta name="hela-build" content="web|single <版本>">` 写进产物，状态条上的 `build …` 即来自它。

## 浏览器适配器（`src/platform.js`）

- `ready()` 立即完成：没有握手、没有 Gate、没有预览标志。
- 存储统一加独立前缀 `hela-web-v1:`；`read` 区分「缺失 → undefined」与「存了 JSON null → null」。
- 写入成功才更新内存与回读值；写入失败抛 `STORAGE_WRITE_FAILED`，界面保留上一次保存的状态。
- 探测写失败（隐私模式/禁用存储）进入临时会话模式：内存可写、界面明确提示「只在当前标签页」。
- 跨标签：`storage` 事件到达即标记陈旧并抛出 `STORAGE_STALE_SNAPSHOT`，禁止旧快照覆盖；用户选择重新载入后恢复写入。
- 剪贴板：失败抛 `CLIPBOARD_FAILED`/`CLIPBOARD_UNAVAILABLE`，界面改为可选中文本手动复制。
- 安全区用 CSS `env(safe-area-inset-*)`，不需要 JS 量测；`onShow`/`onViewport`/`dispose` 的取消监听都是幂等的。

## 三语 / 三主题

界面文案来自 `../src/i18n`（中/日/英三份完整目录），浏览器专属提示（临时会话、跨标签、手动复制、离线版说明）在 `src/web-strings.js` 里同样三语；主题仍是月影/雾银/昭和三套，切换写入本地记录。正常界面不含小程序安装、扫码或「测试版」提示。

## 校验

```bash
npm test
```

Web 相关用例：`test/web-platform.test.mjs`（适配器与仓储）、`test/web-i18n.test.mjs`（文案键覆盖、30 教学×三语数值一致）、`test/web-build.test.mjs`（单文件重建与 metafile/内容审计、目录版分块与相对路径）、`test/web-boot.test.mjs`（在最小 DOM shim 中真实启动离线 bundle 与 `dist/web/main.js`，检查九宫格、三语切换、图鉴/练习/牌桌/历史）。

DOM shim 只验证启动与渲染路径，**不代表**真实浏览器/手机验收：布局、像素、真机识别、iOS 安全区、断网 `file://` 仍需人工浏览器 QA。

## 源同步

`PROVENANCE.md` 记录 `web/src/**` 每个文件的来源路径与 sha256，以及改写说明；小程序 UI 更新后按该表逐项同步。
