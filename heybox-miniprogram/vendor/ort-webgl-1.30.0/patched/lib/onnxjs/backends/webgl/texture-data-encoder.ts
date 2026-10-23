// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Logger } from '../../instrument';

export declare namespace Encoder {
  export interface DataTypeMap {
    float: Float32Array;
    byte: Uint8Array;
    int: Uint32Array;
  }
  export type DataType = keyof DataTypeMap;
  type DataArrayType = DataTypeMap[DataType];
}

/* eslint-disable @typescript-eslint/naming-convention */
export const enum EncoderUsage {
  Default = 0,
  UploadOnly,
  Download4BytesAsFloat32,
}
/* eslint-enable @typescript-eslint/naming-convention */

/**
 * Abstraction for mapping data types to texture texlets
 * Encoding means how a Float32 is mapped to 1 or 4 channels for each texlet
 * Decoding means how a texlet's channels are mapped to a resulting Float32
 */
export interface DataEncoder {
  internalFormat: number;
  format: number;
  textureType: number;
  channelSize: number;
  encode(src: Encoder.DataArrayType, textureSize: number): Encoder.DataArrayType;
  allocate(size: number): Encoder.DataArrayType;
  decode(buffer: Encoder.DataArrayType, dataSize: number): Encoder.DataArrayType;
}
/**
 * WebGL2 data encoder
 * Uses R32F as the format for texlet
 */
export class RedFloat32DataEncoder implements DataEncoder {
  internalFormat: number;
  format: number;
  textureType: number;
  channelSize: number;
  constructor(gl: WebGL2RenderingContext, channels = 1) {
    if (channels === 1) {
      this.internalFormat = gl.R32F;
      this.format = gl.RED;
      this.textureType = gl.FLOAT;
      this.channelSize = channels;
    } else if (channels === 4) {
      this.internalFormat = gl.RGBA32F;
      this.format = gl.RGBA;
      this.textureType = gl.FLOAT;
      this.channelSize = channels;
    } else {
      throw new Error(`Invalid number of channels: ${channels}`);
    }
  }
  encode(src: Encoder.DataArrayType, textureSize: number): Encoder.DataArrayType {
    let result: Float32Array;
    let source: Float32Array;
    if (src.constructor !== Float32Array) {
      Logger.warning('Encoder', 'data was not of type Float32; creating new Float32Array');
      source = new Float32Array(src);
    }
    if (textureSize * this.channelSize > src.length) {
      Logger.warning('Encoder', 'Source data too small. Allocating larger array');
      source = src as Float32Array;
      result = this.allocate(textureSize * this.channelSize) as Float32Array;
      source.forEach((v, i) => (result[i] = v));
    } else {
      source = src as Float32Array;
      result = source;
    }
    return result;
  }
  allocate(size: number): Encoder.DataArrayType {
    return new Float32Array(size * 4);
  }
  decode(buffer: Encoder.DataArrayType, dataSize: number): Float32Array {
    if (this.channelSize === 1) {
      // hela patch: exact-index gather instead of filter()+subarray(). The channel-1 read-back only needs the
      // R component of every RGBA texel, so the result of the old code was always
      // `[buffer[0], buffer[4], ...]` truncated to `subarray(0, dataSize)` semantics. filter() walked the whole
      // buffer (including the three unused channels and any padding), called a JS callback per element and
      // allocated a full-length temporary; this loop copies only the values the function can return.
      //
      // Contract kept identical: same Float32Array, same element count for every dataSize (including 0,
      // negative, fractional, NaN/Infinity and larger-than-available), same element values for any input
      // (NaN, ±0, Infinity included), no zero filling, and a fresh buffer that does not alias `buffer`.
      return gatherChannelOne(buffer as Float32Array, dataSize);
    }
    return buffer.subarray(0, dataSize) as Float32Array;
  }
}
/**
 * Data encoder for WebGL 1 with support for floating point texture
 */
export class RGBAFloatDataEncoder implements DataEncoder {
  internalFormat: number;
  format: number;
  textureType: number;
  channelSize: number;
  constructor(gl: WebGLRenderingContext, channels = 1, textureType?: number) {
    if (channels !== 1 && channels !== 4) {
      throw new Error(`Invalid number of channels: ${channels}`);
    }
    this.internalFormat = gl.RGBA;
    this.format = gl.RGBA;
    this.channelSize = channels;
    this.textureType = textureType || gl.FLOAT;
  }
  encode(src: Float32Array, textureSize: number): Encoder.DataArrayType {
    let dest = src;
    if (this.channelSize === 1) {
      Logger.verbose('Encoder', 'Exploding into a larger array');
      dest = this.allocate(textureSize) as Float32Array;
      src.forEach((v, i) => (dest[i * 4] = v));
    }
    return dest;
  }
  allocate(size: number): Encoder.DataArrayType {
    return new Float32Array(size * 4);
  }
  decode(buffer: Encoder.DataArrayType, dataSize: number): Float32Array {
    if (this.channelSize === 1) {
      // hela patch: exact-index gather instead of filter()+subarray(). The channel-1 read-back only needs the
      // R component of every RGBA texel, so the result of the old code was always
      // `[buffer[0], buffer[4], ...]` truncated to `subarray(0, dataSize)` semantics. filter() walked the whole
      // buffer (including the three unused channels and any padding), called a JS callback per element and
      // allocated a full-length temporary; this loop copies only the values the function can return.
      //
      // Contract kept identical: same Float32Array, same element count for every dataSize (including 0,
      // negative, fractional, NaN/Infinity and larger-than-available), same element values for any input
      // (NaN, ±0, Infinity included), no zero filling, and a fresh buffer that does not alias `buffer`.
      return gatherChannelOne(buffer as Float32Array, dataSize);
    }
    return buffer.subarray(0, dataSize) as Float32Array;
  }
}

export class Uint8DataEncoder implements DataEncoder {
  internalFormat: number;
  format: number;
  textureType: number;
  channelSize = 4;
  constructor(gl: WebGLRenderingContext, channels = 1) {
    if (channels === 1) {
      this.internalFormat = gl.ALPHA;
      this.format = gl.ALPHA; // not tested
      this.textureType = gl.UNSIGNED_BYTE;
      this.channelSize = channels;
    } else if (channels === 4) {
      this.internalFormat = gl.RGBA;
      this.format = gl.RGBA;
      this.textureType = gl.UNSIGNED_BYTE;
      this.channelSize = channels;
    } else {
      throw new Error(`Invalid number of channels: ${channels}`);
    }
  }
  encode(src: Uint8Array, _textureSize: number): Encoder.DataArrayType {
    return new Uint8Array(src.buffer, src.byteOffset, src.byteLength);
  }
  allocate(size: number): Encoder.DataArrayType {
    return new Uint8Array(size * this.channelSize);
  }
  decode(buffer: Encoder.DataArrayType, dataSize: number): Uint8Array {
    if (buffer instanceof Uint8Array) {
      return buffer.subarray(0, dataSize);
    }
    throw new Error(`Invalid array type: ${buffer.constructor}`);
  }
}

// hela patch: helpers for the channel-1 read-back gather.
//
// `subarray(0, end).length` semantics for a buffer of `available` elements, exactly as a typed array computes
// it: `undefined` means "to the end", NaN counts as 0, ±Infinity clamp, negative values count from the end,
// fractional values truncate toward zero.
function subarrayEndLength(available: number, end: number | undefined): number {
  if (end === undefined) {
    return available;
  }
  const relativeEnd = Number(end);
  if (Number.isNaN(relativeEnd) || relativeEnd === 0) {
    return 0;
  }
  if (relativeEnd === Infinity) {
    return available;
  }
  if (relativeEnd === -Infinity) {
    return 0;
  }
  const integer = Math.trunc(relativeEnd);
  if (integer < 0) {
    return Math.max(available + integer, 0);
  }
  return Math.min(integer, available);
}

function gatherChannelOne(buffer: Float32Array, dataSize: number): Float32Array {
  // The old implementation filtered the whole buffer, so it could never return more than one value per RGBA
  // texel: ceil(length / 4) candidates, then truncated by the subarray end.
  const available = Math.ceil(buffer.length / 4);
  const length = subarrayEndLength(available, dataSize as number | undefined);
  const output = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    output[i] = buffer[i * 4];
  }
  return output;
}
