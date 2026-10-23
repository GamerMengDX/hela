import {Gunzip} from 'fflate';

export async function loadModelBytes(info,loadParts,{check=()=>{},progress=()=>{},yieldFrame=async()=>{}}={}){
  if(!Number.isSafeInteger(info.bytes)||info.bytes<=0||info.bytes>64*1024*1024)throw new Error('模型大小无效');
  check();const parts=await loadParts();check();
  if(parts.length!==info.parts||!parts.length)throw new Error('模型资源分段不完整');
  // One final weight buffer; never also concatenate the entire compressed model.
  const bytes=new Uint8Array(info.bytes);let offset=0,compressedBytes=0,finished=false;
  const decoder=new Gunzip((chunk,final)=>{
    if(offset+chunk.length>bytes.length)throw new Error('模型解压大小超出预期');
    bytes.set(chunk,offset);offset+=chunk.length;finished=final;
  });
  for(let index=0;index<parts.length;index++){
    check();
    {
      const part=await parts[index]();check();
      const binary=atob(part.default),compressed=new Uint8Array(binary.length);
      for(let i=0;i<binary.length;i++)compressed[i]=binary.charCodeAt(i);
      compressedBytes+=compressed.length;
      if(compressedBytes>info.gzipBytes)throw new Error('模型压缩资源大小异常');
      decoder.push(compressed,index===parts.length-1);
    }
    progress(index+1,parts.length);if(index%4===3||index===parts.length-1)await yieldFrame();
  }
  check();
  if(!finished||offset!==bytes.length||compressedBytes!==info.gzipBytes)throw new Error('模型资源读取不完整');
  return bytes;
}
