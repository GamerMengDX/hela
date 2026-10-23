// Facade over the shipped model loader: the 31 main-model segments stay in the
// public Heybox copy (no duplicated weights), and each segment is a dynamic
// import so the browser build emits them as on-demand chunks.
export {default} from '../../../../heybox-miniprogram/src/vision/generated/main.js';
