const {t,nativeError}=require('./locale');
const post=require('./model-postprocess');
const {config,getSession}=require('./inference-session');
const auxConfig=require('./vision-aux-model');
const {recognizeTable}=require('./model-pipeline');
const {detectMahjongSoul,recognizeMahjongSoul}=require('./majsoul-recognition');
function getCanvas(page){return new Promise((resolve,reject)=>page.createSelectorQuery().select('#vision-canvas').fields({node:true}).exec(results=>{const canvas=results[0]&&results[0].node;if(canvas)resolve(canvas);else reject(nativeError('native.photo.recognition_canvas_is_not_ready_retry_shortly'));}));}
function getImage(canvas,path){return new Promise((resolve,reject)=>{const image=canvas.createImage();image.onload=()=>resolve(image);image.onerror=()=>reject(nativeError('native.photo.could_not_read_the_photo_choose_another_image'));image.src=path;});}
async function infer(session,canvas,image,region,angle,selected){
  const size=selected.inputSize,rotated=angle===90||angle===270,map=post.letterbox(rotated?region.height:region.width,rotated?region.width:region.height,size);canvas.width=size;canvas.height=size;const ctx=canvas.getContext('2d');ctx.fillStyle='rgb(114,114,114)';ctx.fillRect(0,0,size,size);ctx.save();ctx.translate(map.padX+map.drawWidth/2,map.padY+map.drawHeight/2);ctx.rotate(angle*Math.PI/180);ctx.drawImage(image,region.x,region.y,region.width,region.height,-region.width*map.scale/2,-region.height*map.scale/2,region.width*map.scale,region.height*map.scale);ctx.restore();
  const pixels=ctx.getImageData(0,0,size,size).data,plane=size*size,input=new Float32Array(3*plane);
  for(let i=0;i<plane;i++){input[i]=pixels[i*4]/255;input[plane+i]=pixels[i*4+1]/255;input[2*plane+i]=pixels[i*4+2]/255;}
  const outputs=await session.run({[selected.inputName]:{type:'float32',shape:selected.shape,data:input.buffer}}),tensor=outputs[selected.outputName];if(!tensor||tensor.type!=='float32')throw nativeError('native.photo.recognition_model_output_format_does_not_match');
  const rw=rotated?region.height:region.width,rh=rotated?region.width:region.height;return post.unrotate(post.decode(new Float32Array(tensor.data),tensor.shape,{x:0,y:0,width:rw,height:rh},rw,rh),region,angle);
}
async function recognizeModelPhoto(page,path,onProgress){
  const canvas=await getCanvas(page),image=await getImage(canvas,path),expected=page.data.expected||14;let aux;
  if(page._unloaded)throw nativeError('native.photo.recognition_cancelled');
  if(image.width/image.height>=1.45&&image.width/image.height<=2.6){
    canvas.width=Math.min(1024,image.width);canvas.height=Math.round(image.height*canvas.width/image.width);
    const context=canvas.getContext('2d');context.drawImage(image,0,0,canvas.width,canvas.height);
    const sample={width:canvas.width,height:canvas.height,data:context.getImageData(0,0,canvas.width,canvas.height).data},scene=detectMahjongSoul(sample);
    if(scene)return recognizeMahjongSoul(sample,scene,{width:image.width,height:image.height,progress:onProgress,cancelled:()=>page._unloaded,yieldFrame:()=>new Promise(resolve=>setTimeout(resolve,0))});
  }
  const session=await getSession(onProgress);
  const result=await recognizeTable(async(region,angle,kind)=>{if(page._unloaded)throw nativeError('native.photo.recognition_cancelled');if(kind==='aux'&&!aux)aux=await getSession(onProgress,auxConfig);if(page._unloaded)throw nativeError('native.photo.recognition_cancelled');return infer(kind==='aux'?aux:session,canvas,image,region,angle,kind==='aux'?auxConfig:config);},image.width,image.height,expected,onProgress);
  return {...result,engine:config.name};
}
module.exports={recognizeModelPhoto};
