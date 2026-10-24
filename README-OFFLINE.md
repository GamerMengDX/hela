# 和啦 · Helā 0.6.2 — 离线单文件版

`hela-0.6.2.html` 是一个可以直接双击打开的**单文件**页面：
算点、43 役图鉴、30 个教学示例、组牌练习、算点练习、本地四人点棒表、三语、三主题都在里面。

## 使用

1. 解压本压缩包，得到 `hela-0.6.2.html`。
2. 先把文件保存到本机，再双击用浏览器打开（断网也能用）。
3. 想换设备？把这个 html 文件拷过去即可，不需要服务器。

### 如果只看到一张「打开说明」卡片 / 页面底部有一条启动提示

单文件版把打开说明写在 HTML 里，所以脚本被拦截或浏览器不执行页面脚本时，看到的仍然是
这段说明而不是白屏：

- 说明卡片里的「正在启动…」一直不动：多半是当前浏览器（或内嵌预览器、文件管理器预览）
  不执行页面脚本，换 Chrome / Edge / Safari / Firefox 打开同一个文件即可，**不需要联网**。
- 页面底部若出现红色的启动提示，第一行是提示类别 `[error]` / `[load]` / `[startup]`
  之一，末行带 `build single 0.6.2` 构建标记；它只出现在首页渲染成功之前，
  首页正常显示后不会出现，也不会覆盖算点页或已录入的手牌。反馈时把类别与构建标记一起给出即可。

## 这个版本**没有**照片识别

单文件版在构建时把照片识别整块裁掉：不含识别模型、不含推理运行库、没有入口也没有隐藏按钮，
不会在运行时去加载或请求任何模型。需要拍照/截图识别请下载 `hela-0.6.2-web.zip` 并用本地静态
服务器打开（原因见那个包的说明：`file://` 不允许加载模块与模型）。

## 隐私

无遥测、无远程字体、无外部 CDN 依赖、无上传；记录只写入本机 localStorage（前缀 `hela-web-v1:`），
没有账号与云同步。

## 许可与源码

- 本项目原创代码：**AGPL-3.0-only**（`LICENSE`、`LICENSES/AGPL-3.0.txt`）。
- 37 张牌面**不是原创素材**，按上游 `lietxia/mahjong_graphic` 的 **M+ 字型授權條款**使用，
  **不按 AGPL 或 MIT 授权**：正文 `LICENSES/MAHJONG-GRAPHIC-M-PLUS-LICENSE.txt`（上游 LICENSE 原文）
  与 `LICENSES/MAHJONG-GRAPHIC-UPSTREAM-README.md`（上游 readme.md 原文），固定提交与逐张哈希见
  `LICENSES/MAHJONG-GRAPHIC-NOTICE.md`。
- 第三方组件保留各自许可：`LICENSES/`、`THIRD_PARTY_NOTICES.md`。
- **对应源码**：源码下载入口 中的 `hela-0.6.2-source.zip`（含构建脚本、牌面校验/栅格脚本与
  来源记录、模型转换/补丁材料）。


## 当前下载与校验

本ZIP通过独立下载分支提供，应用文件已构建。
对应源码与固定提交见本目录 SOURCE.md；文件校验见 FILES_SHA256SUMS。
源码下载：https://github.com/GamerMengDX/hela/archive/refs/heads/0.6.2-source.zip
