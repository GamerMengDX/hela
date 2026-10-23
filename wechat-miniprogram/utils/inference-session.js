const {t,nativeError}=require('./locale');
const config=require('./vision-model');
const loaders=require('./vision-package-loaders');
const sessions={};
async function loadPart(name){try{await loaders[name]();}catch(error){console.warn('模型分包加载失败',name,error);throw nativeError('native.photo.could_not_load_model_resources_check_your_connection_and_retry');}}
function readPart(fs,part){let lastError;for(const path of [part.path,'/'+part.path]){try{const bytes=new Uint8Array(fs.readFileSync(path));if(bytes.length===part.bytes)return bytes;}catch(error){lastError=error;}}throw lastError||nativeError('native.photo.model_resources_are_incomplete');}
async function modelFile(onProgress,config){
  const fs=wx.getFileSystemManager(),directory=wx.env.USER_DATA_PATH+'/hela-vision',file=directory+'/'+config.sha256.slice(0,20)+'.onnx';
  try{if(fs.statSync(file).size===config.bytes)return file;}catch{}
  try{fs.accessSync(directory);}catch{fs.mkdirSync(directory,true);}const bytes=new Uint8Array(config.bytes);let offset=0;
  for(let index=0;index<config.parts.length;index++){
    const part=config.parts[index];onProgress(t('native.photo.loading_recognition_model_count_total',{count:index+1,total:config.parts.length}),{key:'native.photo.loading_recognition_model_count_total',params:{count:index+1,total:config.parts.length}});let chunk;
    try{chunk=readPart(fs,part);}catch{await loadPart(part.name);try{chunk=readPart(fs,part);}catch(error){console.warn('模型分包读取失败',part.path,error);throw nativeError('native.photo.model_resources_did_not_fully_load_rebuild_or_preview_on');}}
    bytes.set(chunk,offset);offset+=chunk.length;
  }
  if(offset!==config.bytes)throw nativeError('native.photo.model_resources_are_incomplete');fs.writeFileSync(file,bytes.buffer);return file;
}
async function getSession(onProgress,selected=config){
  if(typeof wx.createInferenceSession!=='function')throw nativeError('native.photo.this_environment_does_not_support_local_models_update_wechat_and');
  const key=selected.sha256;
  if(!sessions[key])sessions[key]=(async()=>{
    const file=await modelFile(onProgress,selected);onProgress(t('native.photo.initializing_photo_recognition_model'),{key:'native.photo.initializing_photo_recognition_model',params:{}});
    return new Promise((resolve,reject)=>{let settled=false;const session=wx.createInferenceSession({model:file,precisionLevel:4,allowNPU:false,allowQuantize:false});
      if(!session||typeof session.onLoad!=='function'||typeof session.run!=='function'){reject(nativeError('native.photo.this_environment_does_not_support_local_models_preview_in_wechat'));return;}
      const timer=setTimeout(()=>{if(!settled){settled=true;session.destroy();reject(nativeError('native.photo.model_initialization_timed_out_retry_in_wechat_on_your_phone'));}},60000);
      session.onLoad(()=>{if(!settled){settled=true;clearTimeout(timer);resolve(session);}});
      session.onError(error=>{console.warn('本地模型初始化失败',error);if(!settled){settled=true;clearTimeout(timer);session.destroy();const key=/开发者工具.*不支持/.test(error.errMsg||'')?'native.photo.the_wechat_simulator_does_not_support_local_inference_use_the':'native.photo.the_local_model_could_not_start_retry_in_wechat_on';reject(nativeError(key));}});
    });
  })().catch(error=>{delete sessions[key];throw error;});
  return sessions[key];
}
module.exports={config,getSession};
