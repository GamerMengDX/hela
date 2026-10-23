# ONNX Runtime 1.30.0 · 本地 WebGL 源码构建与生命周期补丁

本目录是 0.3.12 候选的推理运行库来源。生产 bundle `src/vision/vendor-webgl.js` **不是**由 npm 的压缩
`dist/ort.webgl.min.mjs` 打成，而是由这里的 1.30.0 源码闭包 + 可审计补丁构建，构建过程可逐字节复现。

## 目录

| 路径 | 内容 |
| --- | --- |
| `upstream/` | 与已安装 `node_modules/onnxruntime-web@1.30.0` 逐字节一致的 TS 源码闭包（`lib/onnxjs/**`、`lib/backend-onnxjs.ts`、`lib/version.ts`，以及唯一没有 `.ts` 孪生文件的生成模块 `ort-schema/protobuf/onnx.js`） |
| `patched/` | 打补丁后的同名文件（12 个），仅用于与 patch 互相校验 |
| `overlays/<flavor>/` | DEV-only 单变量源码 overlay（见 `overlays/README.md`）；默认 `sync`+`gather`，`async-readback` / `filter-decoder` / `profile` 可组合用于对照 |
| `patches/0001-resource-lifecycle.patch` | `diff -u upstream patched` 生成的统一 diff，审查用 |
| `entry/webgl-only.entry.ts` | 本轮唯一自撰文件：WebGL-only 入口，用 `onnxruntime-common` 的公开 `registerBackend` 注册后端 |
| `manifest.json` | 上游版本、每个源码文件的 sha256、`onnxruntime-common` 公开 API 文件哈希、依赖版本、补丁路径 |
| `LICENSE-MIT.txt` | ONNX Runtime 的 MIT 许可（补丁同样以 MIT 分发） |

## 构建（可复现）

```bash
node scripts/build-ort-vendor.mjs --verify   # 只校验：上游哈希 + 补丁可还原 overlay
node scripts/build-ort-vendor.mjs            # 校验 + 构建 src/vision/vendor-webgl.js
node scripts/build-ort-vendor.mjs --out /tmp/original-widget.js --no-patch   # DEV 对照：原版（无补丁）
node scripts/vendor-ort-source.mjs           # 仅在故意更换运行库版本时重新冻结闭包
```

构建脚本按顺序做以下检查，任一不满足即失败：

1. `upstream/` 每个文件的 sha256 必须等于 `manifest.json` 记录值；
2. 若 `node_modules` 存在，`onnxruntime-web` 与 `onnxruntime-common` 版本必须仍是 1.30.0，且每个 vendored
   文件与安装包内同名文件逐字节相同（依赖被 bump 会立刻失败）；
3. `patches/*.patch` 必须能严格（无模糊匹配）应用到 `upstream/`，且结果与 `patched/` 逐字节相同；
4. bundle 必须包含补丁标记、必须包含 `registerBackend`，且除 `vendor/` 与 `node_modules/` 外不得引入
   其他输入。

补充说明：安装包未声明 `"type": "module"`，而本项目声明了。构建时会在含 `.js` 的组装目录写入
`{"type":"commonjs"}` 标记，使生成的 protobuf 模块仍按 CommonJS 处理（否则 `import {onnx}` 会是
undefined）。该标记是构建产物，不写入 `upstream/`。

## 补丁内容与理由

上游 1.30.0 的 WebGL 后端存在一条断掉的资源生命周期链：`onnxruntime-common` 的
`InferenceSession.release()` 只调用 `handler.dispose()`，而适配器的
`OnnxjsSessionHandler.dispose()` 是空函数；`Session` 本身没有 dispose；纹理池用错误的键删除
`textureLookup`；永久删除的纹理会先被塞回 idle 池再删除 GL 对象。补丁逐项接通这条链，只删「本次会话
自己所属」的对象，不动共享的 WebGL context / FBO / vertex buffer，也不使用 `loseContext()`。

| 文件 | 改动 | 理由 |
| --- | --- | --- |
| `lib/onnxjs/instrument.ts` | 新增 `DisposeError`（`code = 'DISPOSE_FAILED'`，携带 `failures`）与 `suppressCleanupError()`；被 `session.ts`、`session-handler-inference.ts`、`backend-onnxjs.ts`、`execution-plan.ts` 及各 manager 复用 | 清理失败必须可观察，又不能覆盖原始初始化/推理错误 |
| `lib/onnxjs/session-handler-inference.ts` | `dispose()` 接通 `Session.dispose()`；`disposed`（禁 run）与 `cleanupComplete`（清理完成）分开；失败时保留 session 引用并向调用方 reject；只有成功才断开引用 | 适配器 dispose 原本为空，是「release 链断裂」的根因；吞掉异常会让失败不可重试 |
| `lib/onnxjs/session.ts` | 新增 `dispose()`：先释放 CPU 侧（graph/权重/算子/执行计划），再让后端 handler 清理；`_disposed` 立即禁 run，`_cleanupComplete` 才表示真正清理完成；handler 清理失败时保留 handler 并 reject，重复调用会重试；`run()`/`loadModel()` 在 dispose 后拒绝 | 上层从不经过 Session，CPU 权重也会被 session 永久引用；清理失败不能变成永久 no-op |
| `lib/onnxjs/backends/webgl/session-handler.ts` | `dispose()` 分域清理：program 与 texture 各自 try/catch 且遍历所有对象；`hasPendingCleanup()` 决定是否还能重试；把各层 `DisposeError.failures` 汇总后抛出 | 上游先清 program 再清 texture，program 路径异常会让整会话纹理全部存活 |
| `lib/onnxjs/backends/webgl/texture-manager.ts` | 新增 `ownedTextures` 所有权账本（覆盖 in-use 与 idle）；`releaseTexture` 用 `WebGLTexture` 键删除 lookup（原来误用字符串键）；永久删除时从 in-use/idle/lookup 移除、**GL 删除成功后**才从账本移除；`dispose()` 遍历全部 owned 再抛 `DisposeError`，失败的纹理留在账本里可重试 | 上游 `textureLookup.delete(key)` 删错键导致 map 永久增长；删除时仍 push 进 idle 池，后来者会拿到已删除的 GL 纹理；先清账本会导致失败对象永久丢失 |
| `lib/onnxjs/backends/webgl/program-manager.ts` | 新增 `ownedPrograms`：编译成功后立即登记（元数据查询抛异常时程序不再不可达）；`build()` 失败删除程序；`compile()` 用 `finally` 删除片元着色器；`dispose()` 先 `useProgram(null)` 再逐个删除，**成功才出账本**，聚合失败后抛 `DisposeError` | `getUniformLocation` 缺失 uniform 会抛异常，上游此时程序既不在 repo 也无法删除 |
| `lib/onnxjs/backends/webgl/texture-data-encoder.ts` | `channelSize === 1` 的 CPU 通道抽取由 `filter((_v,i)=>i%4===0).subarray(0,dataSize)` 改成精确索引 gather（`output[i]=buffer[i*4]`），只复制原实现可能返回的元素个数；`subarrayEndLength()` 复刻 `subarray(0,end)` 的长度语义（`undefined`/NaN/±Infinity/负数/小数/越界），不做零填充；其它 channel、dtype、顺序与 Float32 写入语义不变 | 旧实现扫描整个 RGBA buffer（含 3/4 无用通道与 padding）、每元素一次 JS 回调并分配临时数组；Node 微基准 4,194,304→1,048,576 float 约 50–61 ms → 0.5–1.3 ms，`Object.is` 全元素一致（不是浏览器/手机结论） |
| `lib/onnxjs/backends/webgl/webgl-context.ts` | 本类在把 GL 对象交给调用方之前是它唯一的所有者，因此 `allocateTexture`（`texImage2D`/编码/`checkError` 抛异常）、`compileShader`（`shaderSource`/`compileShader`/`getShaderParameter` 抛异常）与 `createProgram`（`attachShader`/`linkProgram`/`LINK_STATUS` 抛异常）都在失败路径删除自己刚创建的对象并重抛原错误；删除也失败时把清理错误挂到原错误上；`compileShader` 编译失败先删 shader 再抛；`createProgram` 校验 `LINK_STATUS`，失败删除程序并抛出带日志的错误；共享 context（FBO/vertexbuffer/其他会话对象）不受影响 | 创建后即抛异常时对象没有 owner（TextureManager 只能在 `allocateTexture` 成功返回后登记），会永久泄漏；链接失败返回不可用程序并泄漏；编译失败的 shader 泄漏 |
| `lib/onnxjs/backends/webgl/inference-handler.ts` | `dispose()` 逐纹理容错、失败条目留在缓存以便重试、失败即抛 `DisposeError`；dispose 后再执行 program 直接报错 | 每次 run 的纹理归属 inference handler，异常路径原本不回收 |
| `lib/onnxjs/execution-plan.ts` | 每个图输出先用 `void outputTensor.data` **同步**物化（`Tensor.data` 会同步跑 dataProvider 并缓存，不产生 fence），全部输出物化完成后才 `inferenceHandler.dispose()`；成功路径上清理失败直接抛出（`DISPOSE_FAILED`），错误路径上把清理失败挂到原始错误（`suppressed`/`cleanupErrors`）后重抛原错误 | 旧补丁改成逐输出 `await getData()`，每输出一个 GPU fence（每张照片约 140 个），是额外开销而非清理修复；任何算子抛错又会跳过 `dispose()` |
| `lib/backend-onnxjs.ts` | `loadModel` 失败时先 `session.dispose()`；若清理也失败，则挂到原始错误上再抛原错误 | 初始化失败会留下已建好的 session（program 缓存 + 纹理管理器） |
| `lib/onnxjs/backends/backend-webgl.ts` | `dispose()` 幂等、容忍未初始化、异常只记录 | 适配器层 dispose 需要一个安全入口 |

### fence 生命周期（异步读回）

- `createAndWaitForFence()` 是 fence 的唯一所有者：成功、`WAIT_FAILED`、context loss、超时、dispose 等所有路径都会结算 promise，并在 `finally` 里 `deleteSync` 该对象一次（成功后置 `query = null`，不会重复删除）；删除本身失败时把错误挂到原错误（`suppressed`），不覆盖原错误。
- 轮询队列有界（每项 `FENCE_POLL_TIMEOUT_MS = 5000`）；`pollItems()` 从不抛出：`isDoneFn` 抛错（含 `WAIT_FAILED`）或超时的条目被 reject 并从队列移除；轮询循环自身异常会 reject 全部等待者并清空队列；context 丢失或 context 已 dispose 同样 reject 所有等待者。
- `TextureManager.readTextureAsync` 的重复读者现在同时携带 resolve/reject：首个读取成功则全部 resolve，失败则全部 reject，且 `pendingRead` 条目在 `finally` 中删除；`TextureManager.dispose()` 会 reject 仍在等待的读者，不留悬挂 Promise。
- 同步（生产）读回不创建任何 fence；DEV `async-readback` overlay 只在 DEV bundle 中产生 fence，且每张照片的 fence 计数必须 created == deleted、live == 0。

### 读回 flavor（DEV-only）

`scripts/build-ort-vendor.mjs --flavor async-readback` 在 `patched/` 之上叠加
`overlays/async-readback/lib/onnxjs/execution-plan.ts`（把同步物化换成 `await getData()`），产出的 bundle 会在 banner
里写 `readback=async`。生产构建只构建 `sync`，`dist/vision/runtime-provenance.json` 记录
`readback: "sync"`、`flavor: "sync"` 与 `flavorOverlay: []`，`scripts/verify-dist.mjs` 强制校验。

### fence 所有权（deleteSync 失败）

- `createFence()` 的 `fenceSync()`/`flush()` 都在 try 内：`flush()` 抛异常时，已创建的 sync 对象会被删除（删除再失败则挂 suppressed 并登记），原错误身份保留。
- `deleteSync` 失败时对象**保持所有权**：`failedFences` 记录 `{query, error}`，`pendingFenceCount`/`failedFenceCount` 如实反映，警告可见；`releaseFailedFences()` 在下次读回与 `WebGLSessionHandler.dispose()`（即 release）时重试，成功后从账本移除；成功删除只会发生一次。
- `WebGLContext.dispose()`（共享 context 的最后清理）也重试一次剩余 fence；任何路径都不销毁共享 context、FBO 或 vertex buffer。

### 创建失败清理（created-but-not-owned）

- `TextureManager` 只能在 `WebGLContext.allocateTexture()` **成功返回**后把纹理登记进 owned 账本；`ProgramManager` 只能在 `createProgram()` 成功返回后登记程序。因此失败发生在「对象已创建、尚未移交」这段窗口时，必须由 `WebGLContext` 自己删除该对象；
- 覆盖路径：纹理编码/`texImage2D`/`checkError`、`shaderSource`/`compileShader`/`getShaderParameter`/`getShaderInfoLog`、`attachShader`/`linkProgram`/`getProgramParameter(LINK_STATUS)`、`createTexture()/createShader()/createProgram()` 返回 null；
- 失败清理本身再抛异常时，用 `suppressCleanupError()` 挂到原错误上（best effort），`throw` 的始终是原始创建错误；
- 从不销毁共享 `WebGLContext`（FBO、vertex buffer 与其他会话的对象保持原样），只删除刚才创建的那一个对象。

### 清理失败契约（DISPOSE_FAILED）

- 显式 `release()` 在任一条清理路径失败时 **reject**，错误 `name = 'DisposeError'`、`code = 'DISPOSE_FAILED'`、`failures` 为可观察的失败列表；
- 一次清理会尝试**所有独立资源**（program 与 texture 互不跳过，同类对象逐个尝试）；
- 只有**真正删除成功**的对象才离开 owned 账本；失败对象保持所有权，下一次 `dispose()` 重试（因此不会 double delete，也不会永久丢弃待清理对象）；
- 首次成功 release 幂等；首次失败后重试 release 能完成剩余清理；
- 初始化/推理错误与清理失败并发时，**原错误身份保留**并附加 `suppressed`（等价 `cleanupErrors`），`throw` 的仍是原错误对象；
- 正常执行结束后清理失败必须从 `release()` 报 `DISPOSE_FAILED`。

不改动的内容：`onnxruntime-common`（公开 API 与注册表原样使用）、融合/算子实现、纹理布局策略、
`preferLogical` 策略、共享 context 的 FBO 与 vertex buffer、Wasm/WebGPU 后端（不进入本 bundle）。

## 已知边界

- 对象计数只能证明「我们创建的对象被显式删除」。**它不等于驱动已把显存归还，也不是显存峰值**；原版 release 未接通只说明这些对象没有被显式删除，不能据此推断物理显存泄漏；
- 补丁不改变数值语义：没有改算子、没有改常量折叠、没有改纹理打包方式；
- `release()` 之后驱动何时真正释放由浏览器决定，本轮不做 `loseContext()` 强制回收；
- 手机端时延与峰值仍需真机准入，不在本目录结论范围内。
