import {fittedPhotoSize} from './memory-policy.js';
export const MAX_PHOTO_BYTES=25*1024*1024;
export function photoType(bytes){
  const text=(start,end)=>String.fromCharCode(...bytes.subarray(start,end));
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
  if(bytes.length>=8&&[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n))return 'image/png';
  if(text(0,4)==='RIFF'&&text(8,12)==='WEBP')return 'image/webp';
  if(text(0,2)==='BM')return 'image/bmp';
  if(text(4,8)==='ftyp'){
    const brands=text(8,Math.min(bytes.length,64));
    if(/avif|avis/.test(brands))return 'image/avif';
    if(/heic|heix|hevc|hevx|heim|heis|mif1|msf1/.test(brands))return 'image/heic';
  }
  throw new Error('这不是支持的照片文件，请选择 JPG、PNG 或 WebP 照片');
}
export async function readPhoto(file,{onStage=()=>{}}={}){
  if(!(file instanceof Blob)||typeof file.arrayBuffer!=='function')throw new Error('没有取得照片，请重新选择照片或拍照');
  onStage('stat');
  if(!Number.isSafeInteger(file.size)||file.size<=0)throw new Error('照片文件为空或无法读取，请重新选择');
  if(file.size>MAX_PHOTO_BYTES)throw new Error('照片超过 25 MB，请先缩小或裁剪到手牌区域');
  onStage('read');
  const data=new Uint8Array(await file.arrayBuffer());
  if(data.byteLength!==file.size)throw new Error('照片读取不完整，请重新选择');
  return {bytes:data,type:photoType(data)};
}
export async function decodePhoto({bytes,type}){
  let url=URL.createObjectURL(new Blob([bytes],{type})),canvas;
  bytes=null;const image=new Image();image.decoding='async';image.src=url;
  try{
    await image.decode();
    if(!image.naturalWidth||!image.naturalHeight)throw new Error('empty');
    if(image.naturalWidth*image.naturalHeight>40000000)throw new Error('照片分辨率较大，请先裁剪到自己的手牌区域');
    const size=fittedPhotoSize(image.naturalWidth,image.naturalHeight);
    let source=image;
    if(size.width!==image.naturalWidth||size.height!==image.naturalHeight){
      canvas=document.createElement('canvas');canvas.width=size.width;canvas.height=size.height;
      const ctx=canvas.getContext('2d');if(!ctx)throw new Error('canvas');
      ctx.drawImage(image,0,0,size.width,size.height);
      const preview=await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('preview')),'image/jpeg',.94));
      // Both displayed preview and inference use the bounded image; release the
      // full-resolution bitmap and its URL before loading either neural model.
      image.src='';URL.revokeObjectURL(url);url=URL.createObjectURL(preview);source=canvas;
    }
    return {url,source,width:size.width,height:size.height,
      dispose(){URL.revokeObjectURL(url);image.src='';if(canvas){canvas.width=1;canvas.height=1;}}};
  }catch(error){URL.revokeObjectURL(url);image.src='';if(canvas){canvas.width=1;canvas.height=1;}throw new Error(error.message.includes('分辨率')?error.message:'当前设备无法读取此照片，请改用 JPG 或 PNG 格式');}
}
export function photoError(error,{stage}={}){
  if(error?.name==='AbortError'||error?.code==='FILE_PICKER_CANCELLED')return '';
  if(['NotAllowedError','SecurityError'].includes(error?.name))return '当前环境未允许打开照片入口，请重新点选，或先返回手动录牌';
  if(error?.name==='NotReadableError')return '照片读取失败，请确认照片已下载到本机，再重新选择';
  if(error?.code==='METHOD_FORBIDDEN')return '当前小黑盒运行环境尚未开放照片选择。即使 App 已是最新版，也可能出现此情况。请将此提示反馈给开发者。';
  if(error?.code==='METHOD_NOT_FOUND')return '当前小黑盒运行环境尚未提供照片选择接口。请更新 App 并重新打开；若仍失败，请将此提示反馈给开发者。';
  if(error?.code==='FILE_IO_FAILED')return '照片读取失败，请重新选择或换一张照片';
  if(error?.code==='FILE_ACCESS_REVOKED')return stage==='picker'?'照片选择授权未能完成，尚未读取文件。请重新选择本地照片。':'这张照片的读取授权已失效，请重新选择照片。';
  if(error?.code==='FILE_ACCESS_DENIED')return stage==='picker'?'当前运行环境拒绝了照片选择，尚未读取文件。可返回手动录牌，或反馈问题详情。':'系统拒绝读取这张照片。请确认照片已下载到本机，再重新选择。';
  if(error?.code==='PERMISSION_NOT_IN_SNAPSHOT')return '当前小程序的文件授权尚未更新。请关闭小程序，再从最新预览码重新进入。';
  if(['PERMISSION_NOT_DECLARED','PERMISSION_DENIED'].includes(error?.code))return '照片读取权限尚未就绪，请重新扫码进入调试版后再试';
  return error?.userMessage||error?.message||'照片处理未完成，请重试';
}
export function photoDiagnostic(error,stage){
  if(!photoError(error))return null;
  const labels={picker:'选择手牌照片',stat:'检查照片文件',read:'读取照片内容',decode:'解码照片',recognize:'识别牌面'};
  const code=[error?.code,error?.name].find(value=>typeof value==='string'&&/^[A-Za-z][A-Za-z0-9_]{2,63}$/.test(value));
  return {stage:labels[stage]||'处理照片',code:code||'UNEXPECTED_ERROR'};
}
