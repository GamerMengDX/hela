// DEV-only profile entry overlay.
//
// Same WebGL-only ONNX Runtime entry as the default one, plus prototype-level instrumentation of the five hot
// functions. Nothing in the vendored sources changes: the wrappers are installed here, from the bundle's own
// module instances, so the code under measurement is exactly the code the default bundle runs.
//
// Measurement unit: synchronous wall time on the calling thread (`performance.now()` around the call). For
// every function we record call count, inclusive time and self time (inclusive minus the inclusive time of
// wrapped calls nested inside it), which is what makes it possible to say "how much of the read-back is the
// CPU decode" instead of guessing. Instrumentation adds unmeasured timing/recording overhead and is reported as
// `instrumented: true` in the diagnostics.
export * from 'onnxruntime-common';
import * as ort from 'onnxruntime-common';
export default ort;

import {env, registerBackend} from 'onnxruntime-common';
import {onnxjsBackend} from './lib/backend-onnxjs';
import {version} from './lib/version';

import {GlslPreprocessor} from './lib/onnxjs/backends/webgl/glsl-preprocessor';
import {ProgramManager} from './lib/onnxjs/backends/webgl/program-manager';
import {RGBAFloatDataEncoder, RedFloat32DataEncoder} from './lib/onnxjs/backends/webgl/texture-data-encoder';
import {TextureManager} from './lib/onnxjs/backends/webgl/texture-manager';

registerBackend('webgl', onnxjsBackend, -10);
Object.defineProperty(env.versions, 'web', {value: version, enumerable: true});

const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

interface Entry {
  calls: number;
  inclusiveMs: number;
  selfMs: number;
  maxMs: number;
}

function createDiagnostics() {
  const entries = new Map<string, Entry>();
  const stack: Array<{name: string; startedAt: number; childMs: number}> = [];

  const entryOf = (name: string): Entry => {
    let entry = entries.get(name);
    if (!entry) {
      entry = {calls: 0, inclusiveMs: 0, selfMs: 0, maxMs: 0};
      entries.set(name, entry);
    }
    return entry;
  };

  const instrument = <T extends object>(target: T, name: string, method: string): void => {
    const original = (target as unknown as Record<string, unknown>)[method];
    if (typeof original !== 'function') {
      return;
    }
    const framed = stack;
    Object.defineProperty(target, method, {
      configurable: true,
      writable: true,
      value: function instrumented(this: unknown, ...args: unknown[]) {
        const startedAt = now();
        const frame = {name, startedAt, childMs: 0};
        framed.push(frame);
        try {
          return (original as (...inner: unknown[]) => unknown).apply(this, args);
        } finally {
          framed.pop();
          const elapsed = now() - startedAt;
          const entry = entryOf(name);
          entry.calls++;
          entry.inclusiveMs += elapsed;
          const self = elapsed - frame.childMs;
          entry.selfMs += self;
          if (elapsed > entry.maxMs) entry.maxMs = elapsed;
          const parent = framed[framed.length - 1];
          if (parent) parent.childMs += elapsed;
        }
      },
    });
  };

  instrument(RedFloat32DataEncoder.prototype, 'RedFloat32DataEncoder.decode', 'decode');
  instrument(RGBAFloatDataEncoder.prototype, 'RGBAFloatDataEncoder.decode', 'decode');
  instrument(TextureManager.prototype, 'TextureManager.readTexture', 'readTexture');
  instrument(ProgramManager.prototype, 'ProgramManager.build', 'build');
  instrument(GlslPreprocessor.prototype, 'GlslPreprocessor.preprocess', 'preprocess');

  return {
    instrumented: true,
    instrumentationNote:
      '插桩包含额外的 performance.now 与记录开销，未单独测量；inclusive 与 self 都是调用线程的同步 wall，嵌套关系已扣除，不能当作互斥预算。',
    reset() {
      entries.clear();
      stack.length = 0;
    },
    snapshot() {
      const functions: Record<string, Entry> = {};
      for (const [name, entry] of entries) {
        functions[name] = {
          calls: entry.calls,
          inclusiveMs: Math.round(entry.inclusiveMs * 1000) / 1000,
          selfMs: Math.round(entry.selfMs * 1000) / 1000,
          maxMs: Math.round(entry.maxMs * 1000) / 1000,
        };
      }
      return {instrumented: true, functions, pendingFrames: stack.length};
    },
  };
}

export const __helaDevDiagnostics = createDiagnostics();
