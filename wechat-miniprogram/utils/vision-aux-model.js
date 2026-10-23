module.exports={
  "name": "Mahjong-YOLO YOLO11n FP16",
  "source": "https://github.com/nikmomo/Mahjong-YOLO",
  "sourceModel": "models/nano/mahjong-yolon-best.onnx",
  "license": "AGPL-3.0 (model metadata)",
  "sha256": "55cc0cc6b355d24970ba379b0a83127ee78148ea1332d4bf18f482079529b486",
  "bytes": 5350148,
  "inputName": "images",
  "outputName": "output0",
  "inputSize": 640,
  "shape": [
    1,
    3,
    640,
    640
  ],
  "parts": [
    {
      "name": "vision-aux-01",
      "path": "vision-aux-01/weights.bin",
      "bytes": 1400000,
      "sha256": "1d808f5d84fb1668964b93943e56944516fd488c6510f997cf5aee8d3d8a5382"
    },
    {
      "name": "vision-aux-02",
      "path": "vision-aux-02/weights.bin",
      "bytes": 1400000,
      "sha256": "2b1946cf4c2d713606e205f63deeae1149577d232ca5aaf02d7a9787ccc5b64c"
    },
    {
      "name": "vision-aux-03",
      "path": "vision-aux-03/weights.bin",
      "bytes": 1400000,
      "sha256": "93e9ece295d1afdfc848bb4c6a3794af327937e90b9e21a2df29f8285e2b6d08"
    },
    {
      "name": "vision-aux-04",
      "path": "vision-aux-04/weights.bin",
      "bytes": 1150148,
      "sha256": "9dde32461853b35782653fbaa5be9273a793d7878101da38f2720d590fe4be2b"
    }
  ],
  "sourceCommit": "28ffceed232ad95fd019c47a6c51ae7c78791a0e",
  "originalSha256": "3c7732c022d41c1a3f48cea931ce626416d92486ab5b86692312941d0cc22226"
};
