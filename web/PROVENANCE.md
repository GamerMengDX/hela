# Web 源文件出处与改动（B 执行器）

本目录是当前 HB 0.3.13 候选 UI 的浏览器副本。逐文件出处与 sha256 如下，便于后续把小程序的新改动同步过来。

- 读取来源（只读）：`opensource/hela/heybox-miniprogram/src/…`，相对路径与 `web/src/…` 一一对应。
- 共享核心：`web/src/*.js` 内 `../../src/…` 直接指向 `opensource/hela/src/`（合同允许的相对路径，不复制共享代码）。
- 模型/运行库：`vision/shared.js`、`vision/vendor-webgl.js`、`vision/generated/{main,aux}.js` 是薄 facade（re-export），不复制权重；`vision/generated/manifest.json` 为逐字相同的元数据副本。
- 与小程序副本的差异只允许出现在上表“按浏览器需要改写/新增”的条目里；其余文件逐字相同，可直接覆盖同步。

| web/src 文件 | 状态 | web sha256 | 源 sha256 | 改动 |
| --- | --- | --- | --- | --- |
| `app.js` | 按浏览器需要改写 | `bbc4532619195048d51f625f464667b77825ca510d1d77907a790afac8788318` | `63af3016d5820d56c615d3fe27f03c90df2ff04dfddd6e00ab92caa8b6e24240` | 浏览器平台接入：移除 HB DEV 预览分支、package.json 导入与静态 PhotoPage；改用 photo-slot 动态工厂、web-strings 提示、手动复制回退、跨标签提示与直接导航拦截；版本号由构建注入。 另修复损坏业务记录后的临时恢复与各页面常驻提示；图鉴宝牌标签为每张1番。 冲突后重载整个页面，从最新记录重建controller；帮助内嵌完整AGPL与引擎MIT正文。 0.6.1 追加 `markReady()`：首屏渲染成功后置 `data-hela-ready` 并派发 `hela:ready`，与 `web/index.html` 的启动 guard 联动。 |
| `application.css` | 逐字相同 | `edb83d3cb0771f7a1d35c6c354abffa50b75c3beafb79ab51b6ad8d399bbf63b` | `edb83d3cb0771f7a1d35c6c354abffa50b75c3beafb79ab51b6ad8d399bbf63b` | — |
| `assets.js` | 新增（B 自有） | `e089b679568b864d2110fc8108f69c5f3b680854b2973a1325edd4d80ef82735` | `—` | — |
| `calculator.js` | 按浏览器需要改写 | `d19af7ba4298511829686ee60c2e303a72871e44f84726fd2ddfa56cda2a17ab` | `ba6fb190d0a94de33da3b35dfe2194407e944f465f37597c2305af4f1add265b` | 牌面 URL 统一走 assets.js；没有 onPhoto 时隐藏照片入口（离线版 UI 不显示该按钮）。 |
| `local-table.js` | 逐字相同 | `333029ecaade8d18bcc178797c8a127a9dc848c72912138126dd1ab7691e88bc` | `333029ecaade8d18bcc178797c8a127a9dc848c72912138126dd1ab7691e88bc` | — |
| `legal.js` | 新增（Web许可展示） | `dc15f2724d8fa69d72a342954d6417d509edbaedd85dd72dc10cf2ee2623c6ca` | `—` | 构建期内嵌AGPL与majiang-core MIT，源码包名使用同版本号；不在运行时读取网络。 |
| `locale.js` | 按浏览器需要改写 | `679f70857340fb4c82ee7ff3ec20649d32c662aea55589c7967ba8eb263dfd61` | `1c143e18ef5f8e81cfc574dae1cf5354261ad146c5cde4c07548b49490d9bc0d` | 删除 HB 预览存储适配器（createPreviewAdapter/previewStorageKey），保留语言适配器、uiError 与错误文案映射。 |
| `main.js` | 按浏览器需要改写 | `059206322c0a904e4b3111ff333d6c4b9ef1474a5e3f04e6f2d02c8aec12ff2c` | `24e1ac85cc04b05d1d720b9c009e8372f6339f9da523205d44c49dacfa44208a` | 浏览器入口：按顺序引入 styles/application/teaching/web 样式与 app.js（photo.css 由照片工厂按需引入）。 |
| `photo-slot.js` | 新增（B 自有） | `9ebee249eca4f53d8eeffff9083219737dc1b5e9e32665a52ac0a0889a754a94` | `—` | — |
| `platform.js` | 按浏览器需要改写 | `c8b34447199e4739855f52044995bd9a237fbe4b9e7723a17d2a7e0a1a6ce852` | `56718992be72450a45d1621e49c355ea4a37b53d05ba733b7063d67a2b3e4687` | 新增浏览器适配器：立即 ready、独立前缀、缺失/null 区分、写失败保留旧状态、临时会话模式、跨标签阻止旧快照、剪贴板失败错误码、幂等取消监听。 结构损坏记录降级时只清理会话缓存，保留真实本机存储字节。 |
| `repository.js` | 按浏览器需要改写 | `b7bd7767c65f86bafbc03fa07c00a096fadaccafeb996f81672dbd74e7661b8f` | `9e2b4b6f683b2737f7f55c950ec81c4eb94cacb466ce186ee791818d842f9e37` | 存储键由内部测试键改为 hela_web_state_v1；浏览器适配器再统一加 hela-web-v1: 前缀。 |
| `styles.css` | 逐字相同 | `627b55634412cee46f6952739bf542e9246042e6ffd4ea485e1e3d94f64e2c87` | `627b55634412cee46f6952739bf542e9246042e6ffd4ea485e1e3d94f64e2c87` | — |
| `table-state.js` | 逐字相同 | `55127b6b0fe85af453fa4af35e0c2c9bc6f777a0615ba9b8126a61fa109854e8` | `55127b6b0fe85af453fa4af35e0c2c9bc6f777a0615ba9b8126a61fa109854e8` | — |
| `teaching-view.js` | 按浏览器需要改写 | `a3201ed7de15a304b85caf73f7d01994ae180f88265dbaac1bf081fa30648e52` | `9a9572e243e81e06b06a18efd658606305ed3383c5d7701a142c3ea953041cf6` | 教学示例条的牌面 URL 统一走 assets.js。 保留notices回调与提示槽。 |
| `teaching.css` | 逐字相同 | `7af05ec9be0e4d50edbd0f272842e5da25602190b7d0dd5eb1589ab64b483b5a` | `7af05ec9be0e4d50edbd0f272842e5da25602190b7d0dd5eb1589ab64b483b5a` | — |
| `themes.js` | 逐字相同 | `7e56a9e0730859419c29b988a0100652cfa9f02d2c4fcf20681c2d28c48db66b` | `7e56a9e0730859419c29b988a0100652cfa9f02d2c4fcf20681c2d28c48db66b` | — |
| `ui.js` | 按浏览器需要改写 | `7788807642f3e74b782fac6a27f4ed61f927569ed17d55f5829fddeffa495ffc` | `2f0848b680919056db41b38e4e993c61d97c9b9949c942a405d4658ed721ca70` | 牌面 URL 统一走 assets.js。 |
| `version.js` | 新增（B 自有） | `c876339e6e8b8eb14ddc936ee7dd659f2aa70a894e5fd25b6db8cbbb9191ce20` | `—` | — |
| `web-strings.js` | 新增（B 自有） | `ee8834b153fafb4e118ddafa27f00e7056b017d97c8bb249acbb31591351f0e9` | `—` | — 补充三语许可摘要与安全占位符插值。 |
| `web.css` | 新增（B 自有） | `bf9439cfef2af5d1bd387fbff4300c5195968d0c33ac75b8cb609f8afd6f1341` | `—` | — 窄屏日文标题采用平衡换行。 补充默认折叠的可滚动许可证正文样式。 |
| `vision/diagnostics.js` | 逐字相同 | `4de6bd6acfda7a498ce38435e638b9bdf0f9f8709c5053aacee04b06eb3e3410` | `4de6bd6acfda7a498ce38435e638b9bdf0f9f8709c5053aacee04b06eb3e3410` | — |
| `vision/memory-policy.js` | 逐字相同 | `23a6eba68af66ba548d4765a7776783c44521fe0bd8cc0bb01cc923dc58887d2` | `23a6eba68af66ba548d4765a7776783c44521fe0bd8cc0bb01cc923dc58887d2` | — |
| `vision/paired-infer.js` | 逐字相同 | `bc73f5c980011df7c020a3c1bed326e336b8d2a381f8e0e1369dd4ee7187222f` | `bc73f5c980011df7c020a3c1bed326e336b8d2a381f8e0e1369dd4ee7187222f` | — |
| `vision/photo-locale.js` | 逐字相同 | `e92211a38358f04a3ed2282ea594a75b142e68c1869c78573b5ee8b0268cde35` | `e92211a38358f04a3ed2282ea594a75b142e68c1869c78573b5ee8b0268cde35` | — |
| `vision/photo-page.js` | 按浏览器需要改写 | `e32e11a86867c9c28308bddd72d7a8ca7ac0683b5cfe4a64d05f903283250218` | `a655a58278dc7bc151d58a89b9afea044fae6149b0b178c6dc37720cca1e2c66` | 删除 HB“测试版/版本号”提示行（保留真实的首次加载模型提示）；其余识别与人工校正逻辑逐字保留。 保留照片页常驻提示槽。 |
| `vision/photo-source.js` | 逐字相同 | `a2ec4077c9017e7222bcf13cdbf22b834c8e840af58400fdb366b4b360e09fdf` | `a2ec4077c9017e7222bcf13cdbf22b834c8e840af58400fdb366b4b360e09fdf` | — |
| `vision/photo.css` | 逐字相同 | `b27787af54800721a46d02a89f83a72fa813599bea0a9709a87dc0b2a4fcb9c6` | `b27787af54800721a46d02a89f83a72fa813599bea0a9709a87dc0b2a4fcb9c6` | — |
| `vision/recognizer.js` | 逐字相同 | `ed1a702dad42391c6214f592aabe5d1487eab3eecdbaf31ca5d36063ae6af2d2` | `ed1a702dad42391c6214f592aabe5d1487eab3eecdbaf31ca5d36063ae6af2d2` | — |
| `vision/review.js` | 逐字相同 | `797a6796d2d41ec7612ce850fe61bf7acb50f05d7995772b63356ca509ce75dd` | `797a6796d2d41ec7612ce850fe61bf7acb50f05d7995772b63356ca509ce75dd` | — |
| `vision/scheduler.js` | 逐字相同 | `94ac6d906ca2960c445f28e56e07aea2cef5430a2e942b61380a2317661bc567` | `94ac6d906ca2960c445f28e56e07aea2cef5430a2e942b61380a2317661bc567` | — |
| `vision/shared.js` | 按浏览器需要改写 | `2d01b1448003fc57cbcfdda82f0f1fea2a7d8141774a999def34b902da2db9df` | `0e56ecddb090af809ce54c456c87b57010a55e09cad6646e45080352b5e0bdcc` | 薄 facade：复用 P/heybox 的平台中立识别与后处理代码，不复制 40MB 权重。 |
| `vision/staged-runner.js` | 逐字相同 | `ff85b4da4c479c55229984b88956544ae3597c545c59231ecb65ff5d7046c1a8` | `ff85b4da4c479c55229984b88956544ae3597c545c59231ecb65ff5d7046c1a8` | — |
| `vision/stream-model.js` | 逐字相同 | `c8e5fd00f6987d4276e58e130e738d0e8a417fee05fd98ea76956f6d8d107215` | `c8e5fd00f6987d4276e58e130e738d0e8a417fee05fd98ea76956f6d8d107215` | — |
| `vision/vendor-webgl.js` | 按浏览器需要改写 | `228e2ed9a790bdafe1573c239e5a9d97278fc436ebbd31c3c32acfc27c4bae0d` | `a1c74384abcd73449e8acbdf20667afa5705afa45c5e08104e96a85af9239a70` | 薄 facade：复用 P/heybox 的 ORT WebGL 构建（平台中立浏览器代码）。 |
| `vision/web-photo-picker.js` | 逐字相同 | `401e59f806c904246c38b495e5ccda3ffc8e637635489acdd3692bea891ac3c2` | `401e59f806c904246c38b495e5ccda3ffc8e637635489acdd3692bea891ac3c2` | — |
| `vision/generated/aux.js` | 按浏览器需要改写 | `8e7ad27be3d5442e1287b8d77aad150525b0582de43041bf59bff8c5daadc764` | `54d47d123ab8e630d76886ed29b6cb658b9b4efb424c1f58991837394cb0077c` | 薄 facade：复用 P/heybox 辅助模型分段加载器。 |
| `vision/generated/main.js` | 按浏览器需要改写 | `31b33adfc7c55764b1855552273b328f24973018a6e44af277ef85d8de0146fa` | `7445d63afe4c2879e2cb56860e06ca6b9175b3cbec6340d8333db009a5111346` | 薄 facade：复用 P/heybox 主模型分段加载器（分段仍是动态 import）。 |
| `vision/generated/manifest.json` | 逐字相同 | `8870d439975f69804fe6b522304e399f110de61b51044a96a54dcb8f6b0c9b99` | `8870d439975f69804fe6b522304e399f110de61b51044a96a54dcb8f6b0c9b99` | — |

## 来源资产

- 牌面：`assets/tiles/{m,p,s}0..9.svg`、`assets/tiles/z1..7.svg`（37 张，A 提供的原创 SVG）；Web UI 统一通过 `web/src/assets.js` 生成 `./assets/tiles/<tile>.svg` 相对地址，离线单文件构建把该模块替换成 data URI 映射。
- 图标：`assets/app-icon-buddies.webp`（03，圆形品牌图标）、`assets/platform-icon-mochi.png`（01，favicon）。
- 样式：`styles.css`、`application.css`、`teaching.css` 逐字相同；`vision/photo.css` 逐字相同；`web.css` 为浏览器补充（安全区 env()、桌面居中、无照片入口时的对齐、手动复制框）。

## 启动可见性（0.6.1，B 自有模板，不属于小程序副本）

`web/index.html` 是 Web 专属模板，不和任何小程序页面一一对应；它自带静态打开说明与一个经典内联启动 guard，
因此脚本未运行（例如 `file://` 下 ES module 被拦截、内嵌预览器不执行脚本）时页面也不会是白屏。

| 文件 | 状态 | sha256 | 说明 |
| --- | --- | --- | --- |
| `web/index.html` | 新增（B 自有模板） | `21fa4f9d6c05f8da7cd010dab44120fc60e607d4bdea0ed8bb82993c1461fc1d` | `#startup-note` 静态三语打开说明（在 `#app` 内）+ `<noscript>` + `boot-styles` + `<script data-hela-startup-guard>` 经典 guard；主脚本仍为 `./main.js`（single 构建把它内联成第二个经典脚本）。 |

- 启动 guard 的契约由 `scripts/web-build-lib.mjs` 的 `auditBootContract()`/`auditSingleHtml()` 与
  `test/web-boot.test.mjs`、`test/web-build.test.mjs` 双向锁定：只在 `#app` 首屏渲染成功之前显示状态条，
  只写 `#hela-startup-status`（`textContent`，不注入 HTML），不吞错误、不谎称就绪，也不含路径/URL/堆栈。
- `web/src/app.js` 的 `markReady()` 在首屏渲染成功后置 `<html data-hela-ready="true">` 并派发 `hela:ready`；
  guard 收到后移除状态条，后续交互异常不会再往界面上写任何东西（不会清空已录入的手牌）。
- 两个构建都会往 `index.html` 写入 `<meta name="hela-build" content="web|single <版本>">`，状态条上的
  `build …` 标记即来自它，便于分辨用户打开的是哪个产物。
