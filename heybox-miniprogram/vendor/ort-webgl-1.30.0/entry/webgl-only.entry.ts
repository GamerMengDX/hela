// Authored for hela 0.3.12. WebGL-only ONNX Runtime entry, source-built from vendor/ort-webgl-1.30.0.
// Mirrors upstream lib/index.ts for the WebGL backend only, using the public onnxruntime-common API.
export * from 'onnxruntime-common';
import * as ort from 'onnxruntime-common';
export default ort;

import {env, registerBackend} from 'onnxruntime-common';
import {onnxjsBackend} from './lib/backend-onnxjs';
import {version} from './lib/version';

registerBackend('webgl', onnxjsBackend, -10);
Object.defineProperty(env.versions, 'web', {value: version, enumerable: true});
