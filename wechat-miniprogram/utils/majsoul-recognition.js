const {t,nativeError}=require('./locale');
const {W,H,components,descriptors}=require('./majsoul-features');
const {meldType}=require('./model-postprocess');
const {inferMeldDirection}=require('./meld-layout');
let templates;
function references(){
  if(!templates)templates=require('./majsoul-templates').samples.map(sample=>{
    const unpack=value=>Float32Array.from(value,c=>parseInt(c,16)/15),body=unpack(sample.body);let norm=0;
    for(let y=4;y<44;y++)for(let x=3;x<29;x++)norm+=body[y*W+x]**2;
    return {...sample,body,glyph:unpack(sample.glyph),norm:Math.sqrt(norm)};
  });
  return templates;
}
function detectMahjongSoul(image){
  const {width:w,height:h,data}=image;if(w/h<1.45||w/h>2.6||w<480)return null;
  let cyan=0,gold=0,pixels=0;
  for(let y=Math.floor(h*.28);y<h*.61;y++)for(let x=Math.floor(w*.39);x<w*.65;x++){
    const p=(y*w+x)*4,r=data[p],g=data[p+1],b=data[p+2];pixels++;
    if(g>90&&b>90&&r<g*.7)cyan++;
    if(r>140&&g>90&&g<r*.9&&b<g*.8)gold++;
  }
  if(cyan/pixels<.001||gold/pixels<.002)return null;
  const faces=components(image,{xStart:Math.floor(w*.09),yStart:Math.floor(h*.78)}).filter(b=>b.width>w*.017&&b.width<w*.12&&b.height>h*.04&&b.height<h*.20&&b.fill>.35&&(b.x+b.width/2)>w*.10&&(b.x+b.width/2)<w*.96&&(b.y+b.height/2)>h*.84&&b.width/b.height>.35&&b.width/b.height<2.5).sort((a,b)=>a.x-b.x);
  if(faces.length<4||faces.length>20)return null;
  const hand=faces.filter(b=>b.height>h*.095),melds=faces.filter(b=>b.height<=h*.095);
  if(!hand.length||hand.length>14||melds.length>16)return null;
  return {kind:'majsoul-default',width:w,height:h,hand,melds};
}
function classifyFace(image,box){
  const refs=references(),best=new Float64Array(refs.length),angles=new Int16Array(refs.length),rotations=box.width/box.height>1.2?[90,270]:[0,180];
  for(const angle of rotations){
    const f=descriptors(image,box,angle),similarity=new Float64Array(refs.length);let centralMass=0;
    for(let y=4;y<44;y++)for(let x=3;x<29;x++)centralMass+=f.body[y*W+x];
    if(centralMass<2)return {tile:'z5',confidence:.99,candidates:[{tile:'z5',confidence:.99}],uncertain:false,angle};
    for(let dy=-4;dy<=4;dy++)for(let dx=-2;dx<=2;dx++){
      let norm=0;for(let y=4;y<44;y++)for(let x=3;x<29;x++)norm+=f.body[(y-dy)*W+x-dx]**2;norm=Math.sqrt(norm);
      for(let n=0;n<refs.length;n++){
        let dot=0;const ref=refs[n];
        for(let y=4;y<44;y++)for(let x=3;x<29;x++)dot+=f.body[(y-dy)*W+x-dx]*ref.body[y*W+x];
        similarity[n]=Math.max(similarity[n],dot/Math.max(1e-9,norm*ref.norm));
      }
    }
    for(let n=0;n<refs.length;n++){
      const ref=refs[n];let distance=0;for(let p=0;p<W*H;p++)distance+=Math.abs(f.glyph[p]-ref.glyph[p]);
      distance=distance/(W*H)+Math.abs(f.red-ref.red)*.12;
      const score=.7*similarity[n]+.3*Math.max(0,1-2*distance);
      if(score>best[n]){best[n]=score;angles[n]=angle;}
    }
  }
  const indices=Array.from(best,(_,i)=>i).sort((a,b)=>best[b]-best[a]),candidates=indices.slice(0,3).map(i=>({tile:refs[i].tile,confidence:best[i],similarity:best[i]})),winner=indices[0];
  return {tile:refs[winner].tile,confidence:best[winner],candidates,uncertain:best[winner]<.72||best[winner]-best[indices[1]]<.025,angle:angles[winner]};
}
function groupMelds(items){
  function solve(index,remaining){
    if(index===items.length)return {score:0,groups:[]};if(!remaining)return null;let best=null;
    for(const count of [3,4]){
      if(index+count>items.length)continue;const group=items.slice(index,index+count),type=meldType(group),next=solve(index+count,remaining-1);if(!next)continue;
      const source=inferMeldDirection(type,group),score=next.score+(type?10:-10)+(source.automatic?2:0);
      if(!best||score>best.score)best={score,groups:[{items:group,type:type||'pon',valid:!!type,direction:source.direction,suggestedDirection:source.direction,directionAutomatic:source.automatic,sourceReason:source.reason,uncertain:!type||group.some(i=>i.uncertain)},...next.groups]};
    }
    return best;
  }
  // New self melds appear to the left of older self melds in this layout.
  return (solve(0,4)?.groups||[]).reverse();
}
async function recognizeMahjongSoul(image,scene,options={}){
  const {width=scene.width,height=scene.height,progress=()=>{},cancelled=()=>false,yieldFrame=async()=>{}}=options,started=Date.now(),faces=scene.hand.concat(scene.melds),items=[];
  for(let n=0;n<faces.length;n++){
    if(cancelled()){const error=nativeError('native.photo.recognition_cancelled');error.name='AbortError';throw error;}progress(t('native.photo.recognizing_your_mahjong_soul_tiles_count_total',{count:n+1,total:faces.length}),{key:'native.photo.recognizing_your_mahjong_soul_tiles_count_total',params:{count:n+1,total:faces.length}});
    const box=faces[n],item=classifyFace(image,box),sx=width/scene.width,sy=height/scene.height;
    items.push({...item,box:{x:box.x*sx,y:box.y*sy,width:box.width*sx,height:box.height*sy},clipped:false});
    if(n%2===1)await yieldFrame();
  }
  const hand=items.slice(0,scene.hand.length).map((item,index)=>({...item,index})),flat=items.slice(scene.hand.length),melds=groupMelds(flat).map(group=>({...group,items:group.items.map((item,index)=>({...item,index}))}));
  return {width,height,items:hand,melds,handRegion:null,auxiliaryUsed:false,engine:'雀魂默认牌面 · 本机纹理匹配',scene:'majsoul-default',inferenceCalls:0,elapsedSeconds:(Date.now()-started)/1000,unassignedMeldTiles:flat.length-melds.reduce((sum,g)=>sum+g.items.length,0)};
}
module.exports={detectMahjongSoul,classifyFace,groupMelds,recognizeMahjongSoul};
