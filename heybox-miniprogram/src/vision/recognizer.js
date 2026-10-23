import metadata from './generated/manifest.json';
import {recognizeTable,letterbox,decode,unrotate,nms,detectMahjongSoul,recognizeMahjongSoul} from './shared.js';
import {runSegmentBatch} from './staged-runner.js';
import {createPairedInfer} from './paired-infer.js';
import {createInferenceScheduler} from './scheduler.js';
const abort=()=>new DOMException('识别已取消','AbortError');
function userError(message,cause){const error=new Error(message,{cause});error.userMessage=message;return error;}
let queue=Promise.resolve();
export function recognizePhoto(photo,options={}){
  const job=queue.then(()=>runRecognition(photo,options));queue=job.catch(()=>{});return job;
}
async function runRecognition(photo,{expected=14,progress=()=>{},cancelled=()=>false,checkpoint=async()=>{}}={}){
  const check=()=>{if(cancelled())throw abort();};
  const {yieldFrame:frame,releaseFrame}=createInferenceScheduler();
  const size=metadata.models.main.inputSize;

  const canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!ctx)throw userError('当前设备未能准备识别画布，请重新打开小程序');
  const plane=size*size;
  try{
    if(photo.width/photo.height>=1.45&&photo.width/photo.height<=2.6){
      check();progress('检查截图布局');canvas.width=Math.min(1024,photo.width);canvas.height=Math.round(photo.height*canvas.width/photo.width);
      ctx.drawImage(photo.source,0,0,canvas.width,canvas.height);
      const sample={width:canvas.width,height:canvas.height,data:ctx.getImageData(0,0,canvas.width,canvas.height).data},scene=detectMahjongSoul(sample);
      if(scene)return await recognizeMahjongSoul(sample,scene,{width:photo.width,height:photo.height,progress,cancelled,yieldFrame:releaseFrame});
      canvas.width=size;canvas.height=size;
    }
    check();progress('准备本机识别引擎');await checkpoint('runtime');await frame();
    const runtime=await import('./vendor-webgl.js');const {env}=runtime;
    // Public ORT options. No Worker, Wasm/CPU fallback or Host policy changes.
    env.webgl.pack=true;env.webgl.textureCacheMode='full';env.webgl.contextId='webgl2';env.logLevel='error';
    const loaders={};
    const started=performance.now();let calls=0,sessionPreparations=0;
    const infer=createPairedInfer(async(region,angles,kind)=>{
      check();if(!loaders[kind])loaders[kind]=(await(kind==='main'?import('./generated/main.js'):import('./generated/aux.js'))).default;
      const angle=angles[0],rotated=angle===90||angle===270,rw=rotated?region.height:region.width,rh=rotated?region.width:region.height,map=letterbox(rw,rh,size);
      const inputs=angles.map(angle=>{
        ctx.fillStyle='rgb(114,114,114)';ctx.fillRect(0,0,size,size);ctx.save();ctx.translate(map.padX+map.drawWidth/2,map.padY+map.drawHeight/2);ctx.rotate(angle*Math.PI/180);ctx.drawImage(photo.source,region.x,region.y,region.width,region.height,-region.width*map.scale/2,-region.height*map.scale/2,region.width*map.scale,region.height*map.scale);ctx.restore();
        // Each run owns its input data; GPU upload caches may key by data identity.
        const pixels=ctx.getImageData(0,0,size,size).data,input=new Float32Array(plane*3);
        for(let i=0;i<plane;i++){input[i]=pixels[i*4]/255;input[plane+i]=pixels[i*4+1]/255;input[2*plane+i]=pixels[i*4+2]/255;}
        return input;
      });
      const tensors=await runSegmentBatch(metadata.models[kind],loaders[kind],inputs,runtime,{
        check,yieldFrame:frame,releaseFrame,stage:async(phase,segment,total,job=0)=>{
          if(phase==='init')sessionPreparations++;
          progress((kind==='main'?'主模型':'辅助模型')+' · 第 '+(calls+1)+'–'+(calls+angles.length)+' 次检查 · 分段 '+segment+' / '+total);
          // Persist before loading and before GPU execution. Readback/release
          // remain inside the run checkpoint; don't do five Host writes/segment.
          if(phase==='load'||phase==='run')await checkpoint(phase+'_'+kind,calls+job+1,segment);
        }
      });
      check();calls+=angles.length;
      return tensors.map((tensor,index)=>unrotate(decode(tensor.data,tensor.dims,{x:0,y:0,width:rw,height:rh},rw,rh),region,angles[index]));
    });
    const result=await recognizeTable(infer,photo.width,photo.height,expected,message=>{check();progress(message);});
    check();result.items=nms(result.items,.4).sort((a,b)=>a.box.x-b.box.x).map((item,index)=>({...item,index}));
    return {...result,engine:'Mahjong-YOLO · Paired Staged WebGL · '+size,elapsedSeconds:(performance.now()-started)/1000,inferenceCalls:calls,sessionPreparations};
  }catch(error){if(error.name==='AbortError'||error.userMessage)throw error;throw userError('本机识别未完成。请重试；若仍中断，请记录页面显示的最后阶段。',error);}
  finally{canvas.width=1;canvas.height=1;}
}
