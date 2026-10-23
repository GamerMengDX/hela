# 实拍识别模型来源与许可

来源：nikmomo/Mahjong-YOLO，提交 28ffceed232ad95fd019c47a6c51ae7c78791a0e。
原模型：models/small/mahjong-yolos-best.onnx，YOLO11s，37 类。
辅助模型：models/nano/mahjong-yolon-best.onnx，YOLO11n，37 类，用于低置信度牌面复核。
为本项目转换为 FP16 存储，输入输出仍为 float32，按模型自身元数据映射牌种；未使用用户验收照片训练或修改类别。

仓库代码的 LICENSE 声明 MIT；模型元数据明确声明 AGPL-3.0，模型分发按该声明保留许可与来源。
上架分发时按模型声明核对并履行对应开源义务，保留来源与许可说明。

对应源代码与训练说明：https://github.com/nikmomo/Mahjong-YOLO/tree/28ffceed232ad95fd019c47a6c51ae7c78791a0e
模型元数据许可来源：原 ONNX custom_metadata_map.license。
完整许可证：VISION-MODEL-AGPL.txt；仓库代码许可：VISION-UPSTREAM-MIT.txt。
