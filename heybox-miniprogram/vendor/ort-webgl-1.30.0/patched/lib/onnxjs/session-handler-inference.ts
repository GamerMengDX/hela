// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { InferenceSession, InferenceSessionHandler, SessionHandler, Tensor } from 'onnxruntime-common';

import { Logger } from './instrument';
import { Session } from './session';
import { Tensor as OnnxjsTensor } from './tensor';

export class OnnxjsSessionHandler implements InferenceSessionHandler {
  // hela patch: dispose state. The 1.30.0 `dispose()` body was empty, so `InferenceSession.release()`
  // (onnxruntime-common calls handler.dispose()) never reached the WebGL programs and textures.
  private disposed = false;
  private cleanupComplete = false;

  constructor(private session: Session) {
    this.inputNames = this.session.inputNames;
    this.outputNames = this.session.outputNames;
  }

  get inputMetadata(): readonly InferenceSession.ValueMetadata[] {
    throw new Error('Getting model metadata is not supported in webgl backend.');
  }

  get outputMetadata(): readonly InferenceSession.ValueMetadata[] {
    throw new Error('Getting model metadata is not supported in webgl backend.');
  }

  async dispose(): Promise<void> {
    // hela patch: actually reach the backend, forbid runs immediately, and keep the session reference until
    // its backend objects are gone so a failed cleanup can be retried. A cleanup failure is propagated
    // (code DISPOSE_FAILED) instead of being swallowed.
    if (this.cleanupComplete) {
      return;
    }
    this.disposed = true;
    this.inputNames = [];
    this.outputNames = [];
    const session = this.session;
    if (!session) {
      this.cleanupComplete = true;
      return;
    }
    try {
      await session.dispose();
    } catch (error) {
      Logger.warning('OnnxjsSessionHandler', `Failed to dispose the onnx.js session, keeping it for a retry: ${error}`);
      throw error;
    }
    this.session = undefined as unknown as Session;
    this.cleanupComplete = true;
  }
  get isDisposed(): boolean {
    return this.disposed;
  }

  get isCleanupComplete(): boolean {
    return this.cleanupComplete;
  }
  inputNames: readonly string[];
  outputNames: readonly string[];
  async run(
    feeds: SessionHandler.FeedsType,
    _fetches: SessionHandler.FetchesType,
    _options: InferenceSession.RunOptions,
  ): Promise<SessionHandler.ReturnType> {
    // hela patch: refuse to run after release instead of using deleted GL objects.
    if (this.disposed) {
      throw new Error('session has been disposed');
    }
    const inputMap = new Map<string, OnnxjsTensor>();
    for (const name in feeds) {
      if (Object.hasOwnProperty.call(feeds, name)) {
        const feed = feeds[name];
        inputMap.set(
          name,
          new OnnxjsTensor(
            feed.dims,
            feed.type as OnnxjsTensor.DataType,
            undefined,
            undefined,
            feed.data as OnnxjsTensor.NumberType,
          ),
        );
      }
    }
    const outputMap = await this.session.run(inputMap);
    const output: SessionHandler.ReturnType = {};
    outputMap.forEach((tensor, name) => {
      output[name] = new Tensor(tensor.type, tensor.data, tensor.dims);
    });
    return output;
  }
  startProfiling(): void {
    this.session.startProfiling();
  }
  endProfiling(): void {
    this.session.endProfiling();
  }
}
