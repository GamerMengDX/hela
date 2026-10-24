# 和啦 · Helā 0.6.2 — 浏览器版（完整功能）

这是一个**已经构建好的静态网站**，不需要安装 Node.js，也不需要联网才能算点。

## 怎么打开

完整版带有本机照片识别，浏览器出于安全限制不允许从 `file://` 加载模块与模型，
所以请用一个本地静态服务器打开，而不是双击 index.html：

```bash
# 任意一种，任选本机已有的工具；全部离线运行，不上传任何文件
cd hela-0.6.2-web
python3 -m http.server 8080 --bind 127.0.0.1
# 然后浏览器打开 http://localhost:8080/
```

Windows 可用 `py -m http.server 8080 --bind 127.0.0.1`；如果你有 Node.js，也可以用 `npx serve .`（首次需要联网安装）。
要放到 GitHub Pages / 任意子目录，把这个目录的内容原样上传即可：所有资源都是相对路径。

只想双击就能用、且不需要照片识别？请下载 `hela-0.6.2-offline.zip` 里的单文件版。

### 如果打开后只看到一张「打开说明」卡片

页面本身自带说明，即使脚本没有执行也看得到，所以这种时候不是白屏，而是**没跑起来**：

- 先确认地址是 `http://127.0.0.1:8080/`（服务器目录选的是解压出来的 `hela-0.6.2-web`），
  而不是 `file://` 双击打开的 `index.html`；完整版必须由本地静态服务器提供。
- 说明卡片下面（页面底部）可能出现一条红色的启动提示，写着 `[error]` 或 `[startup]` 和
  `build web 0.6.2` 这样的构建标记。它是诊断信息，只在首页渲染成功之前出现；
  首页正常显示后不会出现，也不会盖住算点或已录入的手牌。
- 把那条提示的方括号类别和 `build …` 标记一起反馈即可定位是哪个产物、哪一类启动失败。

## 两种下载的区别

| | 浏览器版（本压缩包） | 离线单文件版 |
| --- | --- | --- |
| 打开方式 | 本地静态服务器 / 任意静态托管 | 双击 `hela-<version>.html` |
| 照片识别 | **有**（本机 WebGL，模型约 36 MB） | **没有**（不含模型与运行库） |
| 算点 / 图鉴 / 教学 30 例 / 练习 / 本地点棒表 | 有 | 有 |
| 需要联网 | 不需要 | 不需要 |

## 隐私

- 照片只在本机浏览器里解码与推理：不上传、不写入磁盘、不进入任何网络请求。
- 没有遥测、没有远程字体、没有外部 CDN 运行依赖。
- 记录与设置只写入本机 localStorage（前缀 `hela-web-v1:`）；存储被禁用时会提示“仅本次会话”。
- 没有账号、没有云同步：换设备或清空浏览器数据后记录不会跟着走。

## 许可与源码

- 本项目原创**代码**：**AGPL-3.0-only**，正文见 `LICENSE` 与 `LICENSES/AGPL-3.0.txt`。
- 37 张牌面**不是原创素材**：它们是上游 `lietxia/mahjong_graphic` 的矢量图，按上游声明的
  **M+ 字型授權條款**使用，**不按 AGPL 或 MIT 授权**。正文见
  `LICENSES/MAHJONG-GRAPHIC-M-PLUS-LICENSE.txt`（上游 LICENSE 原文）、
  `LICENSES/MAHJONG-GRAPHIC-UPSTREAM-README.md`（上游 readme.md 原文）；固定提交、逐张哈希与
  来源链见 `LICENSES/MAHJONG-GRAPHIC-NOTICE.md` 与 `assets/tiles/art-provenance.json`。
- 第三方组件（和牌算点库、解压库、ONNX Runtime、字体/通知等）各自保留原许可，
  见 `LICENSES/` 与 `THIRD_PARTY_NOTICES.md`；识别权重单独标注为 AGPL-3.0，
  来源、固定 commit、校验和与转换脚本见 `LICENSES/vision/`。
- **对应源码**：源码下载入口 中的 `hela-0.6.2-source.zip` 是构建本页面所用的完整源码，
  包含牌面来源记录、模型转换脚本与运行时补丁材料，不是只给链接。
- 本包附带的许可与来源清单是工程分发材料，不构成对全部权利或法律合规的保证。

本目录共 182 个文件（含本说明与许可材料），校验值见 release 页面的 `SHA256SUMS`。


## 当前下载与校验

本ZIP通过独立下载分支提供，应用文件已构建。
对应源码与固定提交见本目录 SOURCE.md；文件校验见 FILES_SHA256SUMS。
源码下载：https://github.com/GamerMengDX/hela/archive/refs/heads/0.6.2-source.zip
