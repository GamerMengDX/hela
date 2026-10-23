// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Backend, InferenceSession, InferenceSessionHandler } from 'onnxruntime-common';

import { Logger, suppressCleanupError } from './onnxjs/instrument';
import { Session } from './onnxjs/session';
import { OnnxjsSessionHandler } from './onnxjs/session-handler-inference';

class OnnxjsBackend implements Backend {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async init(): Promise<void> {}

  async createInferenceSessionHandler(
    pathOrBuffer: string | Uint8Array,
    options?: InferenceSession.SessionOptions,
  ): Promise<InferenceSessionHandler> {
    // NOTE: Session.Config(from onnx.js) is not compatible with InferenceSession.SessionOptions(from
    // onnxruntime-common).
    //       In future we should remove Session.Config and use InferenceSession.SessionOptions.
    //       Currently we allow this to happen to make test runner work.
    const session = new Session(options as unknown as Session.Config);

    // hela patch: a partially created session already owns a WebGL session handler (program cache,
    // texture manager, uploaded initializer textures). Release it when model loading fails, and keep
    // the original error as the one that surfaces.
    try {
      // typescript cannot merge method override correctly (so far in 4.2.3). need if-else to call the method.
      if (typeof pathOrBuffer === 'string') {
        await session.loadModel(pathOrBuffer);
      } else {
        await session.loadModel(pathOrBuffer);
      }
    } catch (error) {
      // hela patch: the load error keeps its identity and stays the one that surfaces; a cleanup failure is
      // attached to it as `suppressed`/`cleanupErrors` instead of replacing it.
      try {
        await session.dispose();
      } catch (cleanupError) {
        Logger.warning('OnnxjsBackend', `Cleanup after a load failure also failed: ${cleanupError}`);
        suppressCleanupError(error, cleanupError);
      }
      throw error;
    }

    return new OnnxjsSessionHandler(session);
  }
}

export const onnxjsBackend = new OnnxjsBackend();
