// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { SessionHandler } from '../../backend';
import { Graph } from '../../graph';
import { DisposeError, Logger } from '../../instrument';
import { Operator } from '../../operators';
import { OpSet, resolveOperator } from '../../opset';
import { Session } from '../../session';
import { Tensor } from '../../tensor';
import { WebGLBackend } from '../backend-webgl';

import { WebGLInferenceHandler } from './inference-handler';
import { WEBGL_OP_RESOLVE_RULES } from './op-resolve-rules';
import { ProgramManager } from './program-manager';
import { PreferLogicalStrategy, TextureLayoutStrategy } from './texture-layout-strategy';
import { TextureManager } from './texture-manager';
import { TextureData } from './types';

export class WebGLSessionHandler implements SessionHandler {
  programManager: ProgramManager;
  textureManager: TextureManager;
  layoutStrategy: TextureLayoutStrategy;
  packedTextureDataCache: Map<Tensor.Id, TextureData>;
  unpackedTextureDataCache: Map<Tensor.Id, TextureData>;
  pack2unpackMap: Map<Tensor.Id, Tensor.Id>;
  unpack2packMap: Map<Tensor.Id, Tensor.Id>;
  initializers: Set<Tensor.Id>;
  pack?: boolean;
  // hela patch: dispose bookkeeping. `disposed` makes a repeated dispose a no-op, and
  // `disposeFailures` keeps cleanup problems observable without replacing the inference error.
  private disposed = false;
  disposeFailures: string[] = [];

  constructor(
    public readonly backend: WebGLBackend,
    public readonly context: Session.Context,
  ) {
    this.layoutStrategy = new PreferLogicalStrategy(backend.glContext.maxTextureSize);
    this.programManager = new ProgramManager(this.context.profiler, backend.glContext, this.layoutStrategy);
    this.textureManager = new TextureManager(backend.glContext, this.layoutStrategy, this.context.profiler, {
      reuseTextures: backend.textureCacheMode === 'full',
    });
    this.packedTextureDataCache = new Map();
    this.unpackedTextureDataCache = new Map();
    this.pack = backend.pack;
    this.pack2unpackMap = new Map();
    this.unpack2packMap = new Map();
  }

  createInferenceHandler() {
    return new WebGLInferenceHandler(this);
  }
  onGraphInitialized(graph: Graph): void {
    const initializers = graph
      .getValues()
      .filter((v) => v.from === -1 && v.tensor)
      .map((v) => v.tensor!.dataId);
    this.initializers = new Set(initializers);
  }
  isInitializer(tensorId: Tensor.Id): boolean {
    return this.initializers ? this.initializers.has(tensorId) : false;
  }
  addInitializer(tensorId: Tensor.Id): void {
    this.initializers.add(tensorId);
  }
  getTextureData(tensorId: Tensor.Id, isPacked: boolean): TextureData | undefined {
    if (isPacked) {
      return this.packedTextureDataCache.get(tensorId);
    } else {
      return this.unpackedTextureDataCache.get(tensorId);
    }
  }
  setTextureData(tensorId: Tensor.Id, textureData: TextureData, isPacked = false): void {
    Logger.verbose('WebGLSessionHandler', 'Storing Texture data in cache');
    if (isPacked) {
      this.packedTextureDataCache.set(tensorId, textureData);
    } else {
      this.unpackedTextureDataCache.set(tensorId, textureData);
    }
  }
  dispose(): void {
    // hela patch: programs and textures are two independent ownership domains. Upstream disposed the
    // program cache first and only then the textures, so one exception in the program path silently kept
    // every texture of the session alive. Both now run under their own guard, each texture is released on
    // its own, and the texture manager ledger sweeps whatever the caches lost track of. A cleanup failure is
    // reported after the sweep (DisposeError); the caller decides whether to surface it or attach it to an
    // error already in flight.
    if (this.disposed && !this.hasPendingCleanup()) {
      return;
    }
    this.disposed = true;
    const failures: string[] = [];
    const collect = (error: unknown) => {
      if (error instanceof DisposeError) failures.push(...error.failures);
      else failures.push(String(error));
    };

    try {
      this.programManager.dispose();
    } catch (error) {
      collect(error);
    }

    try {
      for (const cache of [this.packedTextureDataCache, this.unpackedTextureDataCache]) {
        cache.forEach((textureData) => {
          try {
            this.textureManager.releaseTexture(textureData, true);
          } catch (error) {
            failures.push(`texture: ${String(error)}`);
          }
        });
        cache.clear();
      }
      this.packedTextureDataCache = new Map();
      this.unpackedTextureDataCache = new Map();
      this.pack2unpackMap.clear();
      this.unpack2packMap.clear();
      try {
        this.textureManager.clearActiveTextures();
      } catch (error) {
        failures.push(`active-texture: ${String(error)}`);
      }
      try {
        this.textureManager.dispose();
      } catch (error) {
        collect(error);
      }
    } catch (error) {
      collect(error);
    }

    if (this.initializers) {
      this.initializers.clear();
    }

    // hela patch: a fence whose deleteSync failed during its read-back is still owned by the shared context.
    // Retry it here (release) and report it if it still cannot be deleted, so ownership is never silently lost.
    const fenceFailure = this.backend.glContext.releaseFailedFences();
    if (fenceFailure) {
      failures.push(`fence: ${fenceFailure.message}`);
    }

    this.disposeFailures = failures;
    if (failures.length) {
      Logger.warning(
        'WebGLSessionHandler',
        `Session dispose left ${failures.length} cleanup failure(s): ${failures.join('; ')}`,
      );
      // hela patch: a release that could not delete every object must be observable. Objects that failed
      // stay owned by their managers, so the next dispose() retries exactly those.
      throw new DisposeError('WebGLSessionHandler', failures);
    }
  }
  private hasPendingCleanup(): boolean {
    return (
      (this.programManager?.pendingCleanupCount ?? 0) > 0 ||
      (this.textureManager?.pendingCleanupCount ?? 0) > 0 ||
      this.packedTextureDataCache.size > 0 ||
      this.unpackedTextureDataCache.size > 0
    );
  }
  get isDisposed(): boolean {
    return this.disposed;
  }
  resolve(node: Graph.Node, opsets: readonly OpSet[], graph: Graph): Operator {
    const op = resolveOperator(node, opsets, WEBGL_OP_RESOLVE_RULES);
    return { impl: op.opImpl, context: op.opInit ? op.opInit(node, graph) : node };
  }
}
