# 识别模型：来源、许可与复现

本项目以**完整浏览器目录版**（`dist/web/`）的本机照片识别为主要分发功能；附带的微信和小黑盒小程序源码也保留各自的识别实现。离线单文件
`dist/hela.html` 不含任何模型、运行库或识别入口。

## 许可（与代码许可分开）

| 对象 | 许可 |
| --- | --- |
| 转换后的推理权重与分段产物 `heybox-miniprogram/src/vision/generated/**` | **AGPL-3.0** |
| 上游仓库代码 [nikmomo/Mahjong-YOLO](https://github.com/nikmomo/Mahjong-YOLO) | MIT（按其仓库声明） |
| ONNX Runtime WebGL（项目内源码构建） | MIT |
| 雀魂默认牌面纹理参考 [toki-2004/MahjongHelper](https://github.com/toki-2004/MahjongHelper) | MIT |

权重被单独标注为 AGPL-3.0，**不**与上面任何 MIT 组件混为一项。随包提供完整许可正文：
`heybox-miniprogram/public/vision/VISION-MODEL-AGPL.txt`、
`.../VISION-MODEL-NOTICE.md`、`.../VISION-UPSTREAM-MIT.txt`、`.../ONNXRUNTIME-MIT.txt`、
`.../MAJSOUL-TEMPLATES-LICENSE.txt`、`.../THIRD_PARTY_NOTICES.txt`，以及本包
`LICENSES/RUNTIME-THIRD-PARTY-NOTICES.txt`。

模型训练数据的权利边界没有经过独立的法务审查；本文件不构成法律意见。

## 固定来源

| 图 | 上游 | 固定提交 | 源文件 sha256 | 分类数 | 形状 |
| --- | --- | --- | --- | --- | --- |
| main | nikmomo/Mahjong-YOLO | `28ffceed232ad95fd019c47a6c51ae7c78791a0e` | `8317f196…76d468f0f` | 37 | 1×3×640×640 |
| aux | nikmomo/Mahjong-YOLO | `28ffceed232ad95fd019c47a6c51ae7c78791a0e` | `55cc0cc6…79529b486` | 37 | 1×3×640×640 |

雀魂纹理参考固定为 `toki-2004/MahjongHelper@9448b0eee7b90948e518d0bbf2c9e4d0e47be2f5`
（`template_packs/雀魂默认/templates`，37 个文件，MIT）。运行时**不打包原始模板图片**、不联网、
不上传用户截图；几何定位、颜色特征与匹配实现由本项目提供。

完整的分段清单（每段输入/输出张量、节点数、字节数、gzip 与解压后的 sha256）就是随包的
`heybox-miniprogram/src/vision/generated/manifest.json`。

## 分段策略

- 候选 A（当前选择）：每段 ≤ 20 个节点，单段输出 ≤ 32 MiB。共 31（main）+ 23（aux）段。
- 候选 B：每段 ≤ 40 个节点，同一 32 MiB 上限。
- 候选 C（80 节点）只是开发期比较集，**不可选**、不随包分发。

选择结果记录在 `heybox-miniprogram/vision-selection.json`，生成与审计都读同一份模块
（`scripts/vision-selection.mjs`），因此“构建了什么”和“审计期望什么”不会不一致。

分段的意义：移动端 GPU 显存有限，逐段执行可以“加载一段 → 推理 → 把边界张量下载到 CPU →
释放该段 GPU 会话”，避免把整张 640×640 计算图同时驻留。

## 冷构建不需要 Python

分段产物已提交，因此 `npm ci && npm run build` 只需要 Node。构建前的门禁是
`heybox-miniprogram/scripts/verify-vision.mjs`：

- 每个资源文件存在，且拼接后的 gzip 字节哈希等于 `gzipSha256`；
- 解压后字节数与 `sha256` 与清单一致（子图被替换或截断都会失败）；
- 候选与 `vision-selection.json` 一致；
- `vendor/ort-webgl-1.30.0` 的上游文件哈希与清单一致，且在已安装 `node_modules` 时与
  `onnxruntime-web@1.30.0` 的实际文件一致。

```bash
cd heybox-miniprogram
npm run prepare:vision     # 等价于 node scripts/verify-vision.mjs
```

## 重新生成（可选，需要 Python）

```bash
# 1) 准备 Python 环境（版本固定在脚本旁的 requirements 里）
python3 -m venv .venv && . .venv/bin/activate
pip install -r scripts/heybox-vision-requirements.txt    # onnx==1.19.1, numpy==2.0.2

# 2) 重新构建 ONNX Runtime WebGL（上游源码 + 项目补丁）
cd heybox-miniprogram && npm run vendor:build && cd ..

# 3) 重新分段
cd heybox-miniprogram && npm run vision:rebuild
```

输入权重来源（二者其一即可，脚本会自动选择）：

1. 随包的微信端分段权重：`wechat-miniprogram/vision-part-*/weights.bin` 与
   `vision-aux-*/weights.bin`（配置与 sha256 见 `wechat-miniprogram/utils/vision-model.json`、
   `vision-aux-model.json`）——由这些分片可无损还原 FP16 源模型；
2. 你自己下载的上游 FP16 ONNX，放在 `vision-models/mahjong-small-fp16.onnx` 与
   `vision-models/mahjong-nano-fp16.onnx`（`vision-models/*.onnx` 已被 `.gitignore` 忽略，
   校验不上传、不分发）。

转换过程不训练、不使用用户照片、不改变类别；只做“FP16 → FP32”、等价的
`Reshape`/`Tile` 替换最近邻放大、为 GPU 广播调整常量维度，然后按拓扑顺序切图。

## 运行时补丁

`heybox-miniprogram/vendor/ort-webgl-1.30.0/` 保存了：

- `upstream/`：onnxruntime-web 1.30.0 的原始 WebGL 后端源码；
- `patches/0001-resource-lifecycle.patch`：资源生命周期补丁（WebGL 会话与纹理及时释放）；
- `patched/`：套用补丁后的文件，便于逐文件审阅；
- `PATCHES.md`、`manifest.json`：补丁说明与逐文件 sha256 清单。

构建脚本 `scripts/build-ort-vendor.mjs` 会重新校验这些文件和已安装包是否一致；
`src/vision/vendor-webgl.js` 是由它产出的 WebGL-only bundle，随包提交以便离线构建。
