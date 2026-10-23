// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { env } from 'onnxruntime-common';

import { Logger, suppressCleanupError } from '../../instrument';

import * as DataEncoders from './texture-data-encoder';
import { DataEncoder, Encoder, EncoderUsage } from './texture-data-encoder';
import { repeatedTry } from './utils';

export interface FenceContext {
  query: WebGLSync | null;
  isFencePassed(): boolean;
}

type PollItem = {
  isDoneFn: () => boolean;
  resolveFn: () => void;
  // hela patch: a poll item must be able to settle as failed (WAIT_FAILED, context loss, timeout), otherwise
  // the waiting promise stays pending forever and its fence is never deleted.
  rejectFn: (error: unknown) => void;
  deadline: number;
};

// hela patch: bounded fence wait. The old loop polled forever with setTimeout(0); a lost context or a failing
// clientWaitSync could therefore hang a readback indefinitely.
const FENCE_POLL_INTERVAL_MS = 0;
const FENCE_POLL_TIMEOUT_MS = 5000;

export function linearSearchLastTrue(arr: Array<() => boolean>): number {
  let i = 0;
  for (; i < arr.length; ++i) {
    const isDone = arr[i]();
    if (!isDone) {
      break;
    }
  }
  return i - 1;
}

/**
 * Abstraction and wrapper around WebGLRenderingContext and its operations
 */
export class WebGLContext {
  gl: WebGLRenderingContext;
  version: 1 | 2;

  private vertexbuffer: WebGLBuffer;
  private framebuffer: WebGLFramebuffer;

  // WebGL flags and vital parameters
  private isFloatTextureAttachableToFrameBuffer: boolean;
  isFloat32DownloadSupported: boolean;
  isRenderFloat32Supported: boolean;
  isBlendSupported: boolean;
  maxTextureSize: number;
  // private maxCombinedTextureImageUnits: number;
  private maxTextureImageUnits: number;
  // private maxCubeMapTextureSize: number;
  // private shadingLanguageVersion: string;
  // private webglVendor: string;
  // private webglVersion: string;

  // WebGL2 flags and vital parameters
  // private max3DTextureSize: number;
  // private maxArrayTextureLayers: number;
  // private maxColorAttachments: number;
  // private maxDrawBuffers: number;

  // WebGL extensions
  // eslint-disable-next-line camelcase
  textureFloatExtension: OES_texture_float | null;
  // eslint-disable-next-line camelcase
  textureHalfFloatExtension: OES_texture_half_float | null;

  // WebGL2 extensions
  colorBufferFloatExtension: unknown | null;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  disjointTimerQueryWebgl2Extension: { TIME_ELAPSED_EXT: GLenum; GPU_DISJOINT_EXT: GLenum } | null;

  private disposed: boolean;
  private frameBufferBound = false;

  constructor(gl: WebGLRenderingContext, version: 1 | 2) {
    this.gl = gl;
    this.version = version;

    this.getExtensions();
    this.vertexbuffer = this.createVertexbuffer();
    this.framebuffer = this.createFramebuffer();
    this.queryVitalParameters();
  }

  allocateTexture(width: number, height: number, encoder: DataEncoder, data?: Encoder.DataArrayType): WebGLTexture {
    const gl = this.gl;
    // create the texture
    const texture = gl.createTexture();
    if (!texture) {
      throw new Error('createTexture() returned null');
    }
    // hela patch: this method hands the texture to its caller only on success, so it is the only owner of the
    // object while the upload below runs. If encoding/upload/error-checking throws, the texture would
    // otherwise have no owner at all (TextureManager can only register it after a successful return).
    try {
      // bind the texture so the following methods effect this texture.
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const buffer = data ? encoder.encode(data, width * height) : null;
      gl.texImage2D(
        gl.TEXTURE_2D,
        0, // Level of detail.
        encoder.internalFormat,
        width,
        height,
        0, // Always 0 in OpenGL ES.
        encoder.format,
        encoder.textureType,
        buffer,
      );
      this.checkError();
    } catch (error) {
      // The shared context (framebuffer, vertex buffer, other sessions' objects) is left untouched: only the
      // texture created above is deleted, and the upload error stays the error that surfaces.
      try {
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.deleteTexture(texture);
      } catch (cleanupError) {
        Logger.warning('WebGLContext', `Cleanup of a failed texture upload also failed: ${cleanupError}`);
        suppressCleanupError(error, cleanupError);
      }
      throw error;
    }
    return texture as WebGLTexture;
  }
  updateTexture(
    texture: WebGLTexture,
    width: number,
    height: number,
    encoder: DataEncoder,
    data: Encoder.DataArrayType,
  ): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    const buffer = encoder.encode(data, width * height);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0, // level
      0, // xoffset
      0, // yoffset
      width,
      height,
      encoder.format,
      encoder.textureType,
      buffer,
    );
    this.checkError();
  }
  attachFramebuffer(texture: WebGLTexture, width: number, height: number): void {
    const gl = this.gl;
    // Make it the target for framebuffer operations - including rendering.
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0); // 0, we aren't using MIPMAPs
    this.checkError();
    gl.viewport(0, 0, width, height);
    gl.scissor(0, 0, width, height);
  }
  readTexture(
    texture: WebGLTexture,
    width: number,
    height: number,
    dataSize: number,
    dataType: Encoder.DataType,
    channels: number,
  ): Encoder.DataArrayType {
    const gl = this.gl;
    if (!channels) {
      channels = 1;
    }
    if (!this.frameBufferBound) {
      this.attachFramebuffer(texture, width, height);
    }
    const encoder = this.getEncoder(dataType, channels);
    const buffer = encoder.allocate(width * height);
    // bind texture to framebuffer
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0); // 0, we aren't using MIPMAPs
    // TODO: Check if framebuffer is ready
    gl.readPixels(0, 0, width, height, gl.RGBA, encoder.textureType, buffer);
    this.checkError();
    // unbind FB
    return encoder.decode(buffer, dataSize);
  }

  isFramebufferReady(): boolean {
    // TODO: Implement logic to check if the framebuffer is ready
    return true;
  }
  getActiveTexture(): string {
    const gl = this.gl;
    const n = gl.getParameter(this.gl.ACTIVE_TEXTURE);
    return `TEXTURE${n - gl.TEXTURE0}`;
  }
  getTextureBinding(): WebGLTexture {
    return this.gl.getParameter(this.gl.TEXTURE_BINDING_2D);
  }
  getFramebufferBinding(): WebGLFramebuffer {
    return this.gl.getParameter(this.gl.FRAMEBUFFER_BINDING);
  }
  setVertexAttributes(positionHandle: number, textureCoordHandle: number): void {
    const gl = this.gl;
    gl.vertexAttribPointer(positionHandle, 3, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(positionHandle);
    if (textureCoordHandle !== -1) {
      gl.vertexAttribPointer(textureCoordHandle, 2, gl.FLOAT, false, 20, 12);
      gl.enableVertexAttribArray(textureCoordHandle);
    }
    this.checkError();
  }
  createProgram(vertexShader: WebGLShader, fragShader: WebGLShader): WebGLProgram {
    const gl = this.gl;
    const program = gl.createProgram();
    if (!program) {
      throw new Error('createProgram() returned null');
    }

    // hela patch: attachShader/linkProgram/getProgramParameter can throw. The program created here has no
    // owner until this method returns, so every failure path deletes it and keeps the original error.
    try {
      // the program consists of our shaders
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragShader);
      gl.linkProgram(program);
      // Verify the link result: upstream returned an unlinked program, so the caller either used an
      // unusable program or leaked it on the first query.
      if (gl.getProgramParameter(program, gl.LINK_STATUS) === false) {
        const log = gl.getProgramInfoLog(program);
        throw new Error(`Failed to link program: ${log}`);
      }
    } catch (error) {
      try {
        gl.deleteProgram(program);
      } catch (cleanupError) {
        Logger.warning('WebGLContext', `Cleanup of a failed program creation also failed: ${cleanupError}`);
        suppressCleanupError(error, cleanupError);
      }
      throw error;
    }
    return program;
  }
  compileShader(shaderSource: string, shaderType: number): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(shaderType);
    if (!shader) {
      throw new Error(`createShader() returned null with type ${shaderType}`);
    }

    // hela patch: shaderSource/compileShader/getShaderParameter/getShaderInfoLog may throw. The shader is
    // owned by this method until it returns, so every failure path deletes it and keeps the original error.
    try {
      gl.shaderSource(shader, shaderSource);
      gl.compileShader(shader);
      if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) === false) {
        const log = gl.getShaderInfoLog(shader);
        // A shader that failed to compile is useless; delete it instead of leaking it.
        throw new Error(`Failed to compile shader: ${log}
Shader source:
${shaderSource}`);
      }
    } catch (error) {
      try {
        gl.deleteShader(shader);
      } catch (cleanupError) {
        Logger.warning('WebGLContext', `Cleanup of a failed shader also failed: ${cleanupError}`);
        suppressCleanupError(error, cleanupError);
      }
      throw error;
    }
    return shader;
  }
  deleteShader(shader: WebGLShader): void {
    this.gl.deleteShader(shader);
  }
  bindTextureToUniform(texture: WebGLTexture, position: number, uniformHandle: WebGLUniformLocation): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + position);
    this.checkError();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    this.checkError();
    gl.uniform1i(uniformHandle, position);
    this.checkError();
  }
  draw(): void {
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    this.checkError();
  }
  checkError(): void {
    if (env.debug) {
      const gl = this.gl;
      const error = gl.getError();
      let label = '';
      switch (error) {
        case gl.NO_ERROR:
          return;
        case gl.INVALID_ENUM:
          label = 'INVALID_ENUM';
          break;
        case gl.INVALID_VALUE:
          label = 'INVALID_VALUE';
          break;
        case gl.INVALID_OPERATION:
          label = 'INVALID_OPERATION';
          break;
        case gl.INVALID_FRAMEBUFFER_OPERATION:
          label = 'INVALID_FRAMEBUFFER_OPERATION';
          break;
        case gl.OUT_OF_MEMORY:
          label = 'OUT_OF_MEMORY';
          break;
        case gl.CONTEXT_LOST_WEBGL:
          label = 'CONTEXT_LOST_WEBGL';
          break;
        default:
          label = `Unknown WebGL Error: ${error.toString(16)}`;
      }
      throw new Error(label);
    }
  }
  deleteTexture(texture: WebGLTexture): void {
    this.gl.deleteTexture(texture);
  }
  deleteProgram(program: WebGLProgram): void {
    this.gl.deleteProgram(program);
  }
  getEncoder(dataType: Encoder.DataType, channels: number, usage: EncoderUsage = EncoderUsage.Default): DataEncoder {
    if (this.version === 2) {
      return new DataEncoders.RedFloat32DataEncoder(this.gl as WebGL2RenderingContext, channels);
    }

    switch (dataType) {
      case 'float':
        if (usage === EncoderUsage.UploadOnly || this.isRenderFloat32Supported) {
          return new DataEncoders.RGBAFloatDataEncoder(this.gl, channels);
        } else {
          return new DataEncoders.RGBAFloatDataEncoder(
            this.gl,
            channels,
            this.textureHalfFloatExtension!.HALF_FLOAT_OES,
          );
        }
      case 'int':
        throw new Error('not implemented');
      case 'byte':
        return new DataEncoders.Uint8DataEncoder(this.gl, channels);
      default:
        throw new Error(`Invalid dataType: ${dataType}`);
    }
  }
  clearActiveTextures(): void {
    const gl = this.gl;
    for (let unit = 0; unit < this.maxTextureImageUnits; ++unit) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }
  }
  dispose(): void {
    if (this.disposed) {
      return;
    }
    // hela patch: last chance for fences whose delete failed while their read-back was running. Nothing else
    // about the shared context changes here.
    const fenceFailures = this.releaseFailedFences();
    if (fenceFailures) {
      Logger.warning('WebGLContext', `Fences still owned at context dispose: ${fenceFailures.message}`);
    }
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(this.framebuffer);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.deleteBuffer(this.vertexbuffer);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    gl.finish();
    this.disposed = true;
  }

  private createDefaultGeometry(): Float32Array {
    // Sets of x,y,z(=0),s,t coordinates.
    return new Float32Array([
      -1.0,
      1.0,
      0.0,
      0.0,
      1.0, // upper left
      -1.0,
      -1.0,
      0.0,
      0.0,
      0.0, // lower left
      1.0,
      1.0,
      0.0,
      1.0,
      1.0, // upper right
      1.0,
      -1.0,
      0.0,
      1.0,
      0.0, // lower right
    ]);
  }
  private createVertexbuffer(): WebGLBuffer {
    const gl = this.gl;
    const buffer = gl.createBuffer();
    if (!buffer) {
      throw new Error('createBuffer() returned null');
    }
    const geometry = this.createDefaultGeometry();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, geometry, gl.STATIC_DRAW);
    this.checkError();
    return buffer;
  }
  private createFramebuffer(): WebGLFramebuffer {
    const fb = this.gl.createFramebuffer();
    if (!fb) {
      throw new Error('createFramebuffer returned null');
    }
    return fb;
  }

  private queryVitalParameters(): void {
    const gl = this.gl;

    this.isFloatTextureAttachableToFrameBuffer = this.checkFloatTextureAttachableToFrameBuffer();
    this.isRenderFloat32Supported = this.checkRenderFloat32();
    this.isFloat32DownloadSupported = this.checkFloat32Download();

    if (this.version === 1 && !this.textureHalfFloatExtension && !this.isRenderFloat32Supported) {
      throw new Error('both float32 and float16 TextureType are not supported');
    }

    this.isBlendSupported = !this.isRenderFloat32Supported || this.checkFloat32Blend();

    // this.maxCombinedTextureImageUnits = gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS);
    this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    this.maxTextureImageUnits = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
    // this.maxCubeMapTextureSize = gl.getParameter(gl.MAX_CUBE_MAP_TEXTURE_SIZE);
    // this.shadingLanguageVersion = gl.getParameter(gl.SHADING_LANGUAGE_VERSION);
    // this.webglVendor = gl.getParameter(gl.VENDOR);
    // this.webglVersion = gl.getParameter(gl.VERSION);

    if (this.version === 2) {
      // this.max3DTextureSize = gl.getParameter(WebGL2RenderingContext.MAX_3D_TEXTURE_SIZE);
      // this.maxArrayTextureLayers = gl.getParameter(WebGL2RenderingContext.MAX_ARRAY_TEXTURE_LAYERS);
      // this.maxColorAttachments = gl.getParameter(WebGL2RenderingContext.MAX_COLOR_ATTACHMENTS);
      // this.maxDrawBuffers = gl.getParameter(WebGL2RenderingContext.MAX_DRAW_BUFFERS);
    }
  }
  private getExtensions(): void {
    if (this.version === 2) {
      this.colorBufferFloatExtension = this.gl.getExtension('EXT_color_buffer_float');
      this.disjointTimerQueryWebgl2Extension = this.gl.getExtension('EXT_disjoint_timer_query_webgl2');
    } else {
      this.textureFloatExtension = this.gl.getExtension('OES_texture_float');
      this.textureHalfFloatExtension = this.gl.getExtension('OES_texture_half_float');
    }
  }

  private checkFloatTextureAttachableToFrameBuffer(): boolean {
    // test whether Float32 texture is supported:
    // STEP.1 create a float texture
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    // eslint-disable-next-line @typescript-eslint/naming-convention
    const internalFormat = this.version === 2 ? (gl as unknown as { RGBA32F: number }).RGBA32F : gl.RGBA;
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 1, 1, 0, gl.RGBA, gl.FLOAT, null);
    // STEP.2 bind a frame buffer
    const frameBuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffer);
    // STEP.3 attach texture to framebuffer
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    // STEP.4 test whether framebuffer is complete
    const isComplete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteTexture(texture);
    gl.deleteFramebuffer(frameBuffer);
    return isComplete;
  }

  private checkRenderFloat32(): boolean {
    if (this.version === 2) {
      if (!this.colorBufferFloatExtension) {
        return false;
      }
    } else {
      if (!this.textureFloatExtension) {
        return false;
      }
    }
    return this.isFloatTextureAttachableToFrameBuffer;
  }

  private checkFloat32Download(): boolean {
    if (this.version === 2) {
      if (!this.colorBufferFloatExtension) {
        return false;
      }
    } else {
      if (!this.textureFloatExtension) {
        return false;
      }
      if (!this.gl.getExtension('WEBGL_color_buffer_float')) {
        return false;
      }
    }
    return this.isFloatTextureAttachableToFrameBuffer;
  }

  /**
   * Check whether GL_BLEND is supported
   */
  private checkFloat32Blend(): boolean {
    // it looks like currently (2019-05-08) there is no easy way to detect whether BLEND is supported
    // https://github.com/microsoft/onnxjs/issues/145

    const gl = this.gl;

    let texture: WebGLTexture | null | undefined;
    let frameBuffer: WebGLFramebuffer | null | undefined;
    let vertexShader: WebGLShader | null | undefined;
    let fragmentShader: WebGLShader | null | undefined;
    let program: WebGLProgram | null | undefined;

    try {
      texture = gl.createTexture();
      frameBuffer = gl.createFramebuffer();
      gl.bindTexture(gl.TEXTURE_2D, texture);

      // eslint-disable-next-line @typescript-eslint/naming-convention
      const internalFormat = this.version === 2 ? (gl as unknown as { RGBA32F: number }).RGBA32F : gl.RGBA;
      gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 1, 1, 0, gl.RGBA, gl.FLOAT, null);

      gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

      gl.enable(gl.BLEND);

      vertexShader = gl.createShader(gl.VERTEX_SHADER);
      if (!vertexShader) {
        return false;
      }
      gl.shaderSource(vertexShader, 'void main(){}');
      gl.compileShader(vertexShader);

      fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
      if (!fragmentShader) {
        return false;
      }
      gl.shaderSource(fragmentShader, 'precision highp float;void main(){gl_FragColor=vec4(0.5);}');
      gl.compileShader(fragmentShader);

      program = gl.createProgram();
      if (!program) {
        return false;
      }
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.useProgram(program);

      gl.drawArrays(gl.POINTS, 0, 1);
      return gl.getError() === gl.NO_ERROR;
    } finally {
      gl.disable(gl.BLEND);

      if (program) {
        gl.deleteProgram(program);
      }
      if (vertexShader) {
        gl.deleteShader(vertexShader);
      }
      if (fragmentShader) {
        gl.deleteShader(fragmentShader);
      }
      if (frameBuffer) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.deleteFramebuffer(frameBuffer);
      }
      if (texture) {
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.deleteTexture(texture);
      }
    }
  }

  beginTimer(): WebGLQuery {
    if (this.version === 2 && this.disjointTimerQueryWebgl2Extension) {
      const gl2 = this.gl as WebGL2RenderingContext;
      const ext = this.disjointTimerQueryWebgl2Extension;

      const query = gl2.createQuery() as WebGLQuery;
      gl2.beginQuery(ext.TIME_ELAPSED_EXT, query);
      return query;
    } else {
      // TODO: add webgl 1 handling.
      throw new Error('WebGL1 profiling currently not supported.');
    }
  }

  endTimer() {
    if (this.version === 2 && this.disjointTimerQueryWebgl2Extension) {
      const gl2 = this.gl as WebGL2RenderingContext;
      const ext = this.disjointTimerQueryWebgl2Extension;
      gl2.endQuery(ext.TIME_ELAPSED_EXT);
      return;
    } else {
      // TODO: add webgl 1 handling.
      throw new Error('WebGL1 profiling currently not supported');
    }
  }

  isTimerResultAvailable(query: WebGLQuery): boolean {
    let available = false,
      disjoint = false;
    if (this.version === 2 && this.disjointTimerQueryWebgl2Extension) {
      const gl2 = this.gl as WebGL2RenderingContext;
      const ext = this.disjointTimerQueryWebgl2Extension;

      available = gl2.getQueryParameter(query, gl2.QUERY_RESULT_AVAILABLE);
      disjoint = gl2.getParameter(ext.GPU_DISJOINT_EXT);
    } else {
      // TODO: add webgl 1 handling.
      throw new Error('WebGL1 profiling currently not supported');
    }

    return available && !disjoint;
  }

  getTimerResult(query: WebGLQuery): number {
    let timeElapsed = 0;
    if (this.version === 2) {
      const gl2 = this.gl as WebGL2RenderingContext;
      timeElapsed = gl2.getQueryParameter(query, gl2.QUERY_RESULT);
      gl2.deleteQuery(query);
    } else {
      // TODO: add webgl 1 handling.
      throw new Error('WebGL1 profiling currently not supported');
    }
    // return milliseconds
    return timeElapsed / 1000000;
  }

  async waitForQueryAndGetTime(query: WebGLQuery): Promise<number> {
    await repeatedTry(() => this.isTimerResultAvailable(query));
    return this.getTimerResult(query);
  }

  public async createAndWaitForFence(): Promise<void> {
    // hela patch: one owner for the WebGLSync object. Every outcome (success, WAIT_FAILED, context loss,
    // timeout, cancellation via dispose) settles the promise and deletes the sync object exactly once in the
    // finally block; a failing delete is attached to the original error instead of replacing it.
    // Fences whose delete failed earlier are retried before a new one is created, so their ownership is not
    // silently dropped.
    this.releaseFailedFences();
    const fenceContext = this.createFence(this.gl);
    let failure: unknown = null;
    try {
      await this.pollFence(fenceContext);
    } catch (error) {
      failure = error;
      throw error;
    } finally {
      const cleanupError = this.releaseFence(fenceContext);
      if (cleanupError) {
        Logger.warning('WebGLContext', `Failed to delete a fence sync object: ${cleanupError}`);
        if (failure !== null && failure !== undefined) {
          suppressCleanupError(failure, cleanupError);
        } else {
          throw cleanupError;
        }
      }
    }
  }

  /**
   * hela patch: delete the fence's WebGLSync object once. Returns the failure instead of throwing so the
   * caller can decide whether it is the reported error or a suppressed cleanup error.
   */
  private releaseFence(fenceContext: FenceContext | null | undefined): Error | null {
    const query = fenceContext?.query ?? null;
    if (!query) {
      return null;
    }
    const cleanupError = this.deleteFenceObject(query);
    if (!cleanupError) {
      fenceContext!.query = null;
    }
    return cleanupError;
  }

  /**
   * hela patch: the single place that deletes a sync object.
   *
   * On failure the object stays owned (the caller keeps `query`, and it is recorded in `failedFences`), so a
   * later read-back or `releaseFailedFences()` retries it and `pendingFenceCount` keeps reporting it. A
   * successful delete happens exactly once because `deleteSync` is never called twice for the same object.
   */
  private deleteFenceObject(query: WebGLSync, originalError?: unknown): Error | null {
    const gl2 = this.gl as WebGL2RenderingContext;
    if (typeof gl2.deleteSync !== 'function') {
      return null;
    }
    try {
      gl2.deleteSync(query);
      const index = this.failedFences.findIndex((entry) => entry.query === query);
      if (index !== -1) {
        this.failedFences.splice(index, 1);
      }
      return null;
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      if (!this.failedFences.some((entry) => entry.query === query)) {
        this.failedFences.push({query, error: failure});
      }
      Logger.warning('WebGLContext', `Failed to delete a fence sync object, keeping it owned for a retry: ${failure}`);
      if (originalError !== undefined) {
        suppressCleanupError(originalError, failure);
      }
      return failure;
    }
  }

  /**
   * hela patch: retry every fence whose delete failed earlier. Returns the remaining failures as an error (or
   * null when everything was released), never throws.
   */
  releaseFailedFences(): Error | null {
    const failures: Error[] = [];
    for (const entry of [...this.failedFences]) {
      const error = this.deleteFenceObject(entry.query);
      if (error) {
        failures.push(error);
      }
    }
    if (!failures.length) {
      return null;
    }
    return new Error(`${failures.length} fence sync object(s) still cannot be deleted: ${failures.map(String).join('; ')}`);
  }

  get failedFenceCount(): number {
    return this.failedFences.length;
  }

  /** hela patch: number of fences this context still owns (must be 0 when a session is gone). */
  get pendingFenceCount(): number {
    return this.itemsToPoll.length + this.failedFences.length;
  }

  private createFence(gl: WebGLRenderingContext): FenceContext {
    const gl2 = gl as WebGL2RenderingContext;
    let query: WebGLSync | null = null;
    try {
      query = (gl2.fenceSync(gl2.SYNC_GPU_COMMANDS_COMPLETE, 0) as WebGLSync | null) ?? null;
      // hela patch: flush() runs inside the guarded block. It can throw, and by then the sync object already
      // exists - leaving this function without deleting it would create an ownerless fence.
      gl.flush();
    } catch (error) {
      if (query) {
        this.deleteFenceObject(query, error);
      }
      throw error;
    }
    const fenceContext: FenceContext = {query, isFencePassed: () => true};
    fenceContext.isFencePassed = () => this.isFencePassed(fenceContext);
    return fenceContext;
  }

  async pollFence(fenceContext: FenceContext): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.addItemToPoll(
        () => this.isFencePassed(fenceContext),
        () => resolve(),
        (error) => reject(error),
      );
    });
  }

  private itemsToPoll: PollItem[] = [];
  // hela patch: fences whose deleteSync failed. They stay owned here so a retry can finish the job and the
  // failure stays observable instead of being forgotten.
  private readonly failedFences: Array<{query: WebGLSync; error: Error}> = [];
  private pollLoop: Promise<void> | null = null;

  /**
   * hela patch: settle the finished prefix of the queue. An item settles when its fence passed, when checking
   * it threw (WAIT_FAILED, lost context), or when its deadline expired; the first still-pending item and the
   * rest of the queue are kept in order. Never throws.
   */
  pollItems(): void {
    let index = 0;
    for (; index < this.itemsToPoll.length; ++index) {
      const item = this.itemsToPoll[index];
      let done = false;
      let failure: unknown = null;
      try {
        done = item.isDoneFn();
      } catch (error) {
        failure = error;
      }
      if (failure !== null && failure !== undefined) {
        item.rejectFn(failure);
        continue;
      }
      if (done) {
        item.resolveFn();
        continue;
      }
      if (Date.now() >= item.deadline) {
        item.rejectFn(new Error('Fence wait timed out before the GPU signalled the readback'));
        continue;
      }
      break;
    }
    this.itemsToPoll = this.itemsToPoll.slice(index);
  }

  private addItemToPoll(isDoneFn: () => boolean, resolveFn: () => void, rejectFn: (error: unknown) => void): void {
    this.itemsToPoll.push({isDoneFn, resolveFn, rejectFn, deadline: Date.now() + FENCE_POLL_TIMEOUT_MS});
    if (this.pollLoop) {
      // A loop is already draining the queue.
      return;
    }
    this.pollLoop = this.runPollLoop();
  }

  private async runPollLoop(): Promise<void> {
    try {
      while (this.itemsToPoll.length) {
        if (this.disposed) {
          // hela patch: a disposed context must not leave readers waiting.
          this.failPendingPollItems(new Error('WebGL context was disposed while a fence was being awaited'));
          return;
        }
        if (this.isContextLost()) {
          this.failPendingPollItems(new Error('WebGL context was lost while a fence was being awaited'));
          return;
        }
        this.pollItems();
        if (!this.itemsToPoll.length) {
          return;
        }
        await new Promise<void>((resolve) => setTimeout(resolve, FENCE_POLL_INTERVAL_MS));
      }
    } catch (error) {
      // hela patch: a failing poll loop rejects every waiter and clears the queue instead of hanging them.
      this.failPendingPollItems(error);
    } finally {
      this.pollLoop = null;
      if (this.itemsToPoll.length && !this.disposed) {
        this.pollLoop = this.runPollLoop();
      }
    }
  }

  private failPendingPollItems(error: unknown): void {
    const pending = this.itemsToPoll;
    this.itemsToPoll = [];
    for (const item of pending) {
      try {
        item.rejectFn(error);
      } catch (rejectError) {
        Logger.warning('WebGLContext', `A fence waiter rejected with an error: ${rejectError}`);
      }
    }
  }

  private isContextLost(): boolean {
    try {
      return !!this.gl.isContextLost?.();
    } catch {
      return true;
    }
  }

  /**
   * hela patch: a WAIT_FAILED answer is an error, not "still running"; a null query means there is nothing to
   * wait for.
   */
  private isFencePassed(fenceContext: FenceContext): boolean {
    if (!fenceContext.query) {
      return true;
    }
    const gl2 = this.gl as WebGL2RenderingContext;
    if (typeof gl2.clientWaitSync !== 'function') {
      return true;
    }
    const status = gl2.clientWaitSync(fenceContext.query, 0, 0);
    if (status === gl2.ALREADY_SIGNALED || status === gl2.CONDITION_SATISFIED) {
      return true;
    }
    if (status === gl2.WAIT_FAILED) {
      throw new Error('clientWaitSync reported WAIT_FAILED');
    }
    return false;
  }
}
