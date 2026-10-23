const {t,nativeError}=require('./locale');
function choosePhoto(source){
  if(typeof wx.chooseMedia!=='function')return Promise.reject(nativeError('native.photo.update_wechat_to_use_photo_selection'));
  return new Promise((resolve,reject)=>{
    let finished=false;
    const timer=setTimeout(()=>finish(nativeError('native.photo.photo_selection_timed_out_close_the_picker_and_retry')),120000);
    function finish(error,path){if(finished)return;finished=true;clearTimeout(timer);if(error)reject(error);else resolve(path);}
    try{wx.chooseMedia({count:1,mediaType:['image'],sourceType:[source],camera:'back',sizeType:['compressed'],success:res=>{const file=res.tempFiles&&res.tempFiles[0];if(file&&file.tempFilePath)finish(null,file.tempFilePath);else finish(nativeError('native.photo.no_photo_selected'));},fail:error=>finish(error)});}catch(error){finish(error);}
  });
}
module.exports={choosePhoto};
