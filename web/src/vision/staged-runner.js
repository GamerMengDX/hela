import {loadModelBytes} from './stream-model.js';

// Cleanup failures must be observable, but a cleanup error must never replace the error that caused the
// release. `release()` rejects (code DISPOSE_FAILED) when the backend could not delete everything it owns;
// attach it to the original error instead of throwing it over the original one.
function attachCleanupError(original,cleanupError){
  try{
    original.suppressed=cleanupError;
    original.cleanupErrors=[...(original.cleanupErrors||[]),cleanupError];
  }catch{}
  return original;
}

// DEV measurement helper. Every field is a wall-clock accumulation of work this runner performs itself
// (model decode, session create, GPU run call, boundary copy/validate, release). They are *inclusive* of
// driver waits and shader compilation, so they must never be presented as pure GPU compute or summed into a
// mutually exclusive budget. Production never passes this object.
export function createSegmentTiming(){
  return {loadMs:0,createMs:0,runMs:0,copyMs:0,releaseMs:0,segments:0,runs:0};
}
const timingNow=typeof performance!=='undefined'&&typeof performance.now==='function'?()=>performance.now():()=>Date.now();

export const MAX_RETAINED_CPU_BYTES=64*1024*1024;
export function estimatedRetainedCpuBytes(model,batchSize=2){
  const inputBytes=model.shape.reduce((n,v)=>n*v,1)*4;
  return batchSize*(inputBytes+Math.max(0,...model.segments.map(s=>s.boundaryBytes||0)));
}
export async function runSegments(model,loaders,input,runtime,options={}){
  return (await runSegmentBatch(model,loaders,[input],runtime,options))[0];
}
// GPU runs are sequential in one small session. Only CPU boundary arrays
// survive a segment. Limit to two inputs; never retain a complete GPU model.
export async function runSegmentBatch(model, loaders, inputs, runtime, options={}){
  if(!Array.isArray(inputs)||inputs.length<1||inputs.length>2)throw new RangeError('Only one or two inference inputs are allowed');
  if(inputs.length===2&&estimatedRetainedCpuBytes(model)>MAX_RETAINED_CPU_BYTES){
    const results=[];
    for(let job=0;job<inputs.length;job++)results.push(await runSegments(model,loaders,inputs[job],runtime,{...options,stage:(phase,index,total)=>options.stage?.(phase,index,total,job)}));
    return results;
  }
  const {check=()=>{},stage=async()=>{},yieldFrame=async()=>{},releaseFrame=yieldFrame,observe=()=>{},timing=null}=options;
  const measure=(field,start)=>{if(timing)timing[field]+=timingNow()-start;};
  const states=inputs.map(input=>new Map([[model.inputName,{type:'float32',dims:model.shape,data:input}]]));
  let session=null,pendingError=null;
  try{
    for(const info of model.segments){
      check();await stage('load',info.index+1,model.segments.length);
      const loadStart=timingNow();
      let bytes=await loadModelBytes(info,async()=>loaders[info.index],{check,yieldFrame});
      measure('loadMs',loadStart);
      check();await stage('init',info.index+1,model.segments.length);await yieldFrame();
      const createStart=timingNow();
      try{session=await runtime.InferenceSession.create(bytes,{executionProviders:['webgl']});}
      finally{bytes=null;measure('createMs',createStart);if(timing)timing.segments++;}
      for(let job=0;job<states.length;job++){
      const values=states[job],feeds={},owned=[];let outputs;
      try{
        for(const name of info.inputs){
          const value=values.get(name);if(!value)throw new Error('Missing segment input');
          feeds[name]=new runtime.Tensor(value.type,value.data,value.dims);owned.push(feeds[name]);
        }
        check();await stage('run',info.index+1,model.segments.length,job);await yieldFrame();
        const runStart=timingNow();
        try{outputs=await session.run(feeds);}
        finally{measure('runMs',runStart);if(timing)timing.runs++;}
        check();
        await stage('read',info.index+1,model.segments.length,job);
        const copyStart=timingNow();
        try{
        for(const name of info.outputs){
          const tensor=outputs[name];
          if(!tensor||tensor.type!=='float32')throw new Error('Invalid segment output type');
          // A real copy is required before disposing the output/session.
          const data=new Float32Array(tensor.data);
          if(data.some(v=>!Number.isFinite(v)))throw new Error('Non-finite segment output');
          values.set(name,{type:'float32',dims:[...tensor.dims],data});
          observe(info.index,name,data,tensor.dims,job);
        }
        }finally{measure('copyMs',copyStart);}
      }finally{
        for(const tensor of owned)tensor.dispose();
        if(outputs)for(const tensor of Object.values(outputs))tensor.dispose();
      }
      const keep=new Set(info.keep);
      for(const name of values.keys())if(!keep.has(name))values.delete(name);
      }
      await stage('release',info.index+1,model.segments.length);
      // Release before loading the next subgraph, including on cancellation.
      // Keep the session reference when the release fails, so the cleanup path below can retry the same
      // release once instead of dropping the only handle to the objects that still need deleting.
      const completed=session;
      const releaseStart=timingNow();
      try{await completed.release();}
      catch(error){session=completed;throw error;}
      finally{measure('releaseMs',releaseStart);}
      session=null;await releaseFrame();check();
    }
    return states.map(values=>{const result=values.get(model.outputName);if(!result)throw new Error('Missing final model output');return result;});
  }catch(error){
    pendingError=error;throw error;
  }finally{
    for(const values of states)values.clear();
    if(session){
      try{await session.release();}
      catch(cleanupError){
        // A failed run stays the reported error; a successful run that cannot clean up must surface it.
        if(pendingError)attachCleanupError(pendingError,cleanupError);
        else throw cleanupError;
      }
    }
  }
}
