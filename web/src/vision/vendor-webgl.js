// Thin facade over the platform-neutral model runtime that already ships in the
// public Heybox copy. Only the ONNX Runtime WebGL build is reused here: it is
// plain browser code and contains no Heybox SDK, entry gate or preview logic.
// The single file build never reaches this module.
export * from '../../../heybox-miniprogram/src/vision/vendor-webgl.js';
export {default} from '../../../heybox-miniprogram/src/vision/vendor-webgl.js';
