const {t,nativeError}=require('./locale');
const post=require('./model-postprocess');
// infer 回调在微信使用原生 ONNX，在实拍验收使用 ONNX Runtime；调度和筛选共用这一份代码。
async function recognizeTable(infer,width,height,expected=14,progress=()=>{}){
  const full={x:0,y:0,width,height};progress(t('native.photo.locating_hand_and_melds'),{key:'native.photo.locating_hand_and_melds',params:{}});
  const upright=await infer(full,0,'main'),turned=await infer(full,180,'main');let all=upright.concat(turned),coarse=post.selectHand(post.nms(all),expected);
  if(coarse.length<8){const windows=post.scanRegions(width,height);for(let n=0;n<windows.length;n++){progress(t('native.photo.locating_enlarged_tiles_count_total',{count:n+1,total:windows.length}),{key:'native.photo.locating_enlarged_tiles_count_total',params:{count:n+1,total:windows.length}});for(const angle of [0,180])all.push(...await infer(windows[n],angle,'main'));}coarse=post.selectHand(post.nms(all),expected);}
  const region=post.handRegion(coarse,width,height);let hand=coarse,auxiliaryUsed=false;
  if(region){progress(t('native.photo.checking_upright_and_upside_down_tiles'),{key:'native.photo.checking_upright_and_upside_down_tiles',params:{}});const refined=(await infer(region,0,'main')).concat(await infer(region,180,'main'));
    // 全图正向检出一整行时可保留其中的高置信度结果；旋转/滑窗结果只用于定位，避免放大前的误分类覆盖复检。
    const known=post.selectHand(upright,expected);hand=post.mergeRefinement(coarse,post.selectHand(post.nms(refined.concat(known.length>=8?known:[])),expected));
    if(hand.some(i=>i.confidence<.65)){progress(t('native.photo.checking_uncertain_tiles'),{key:'native.photo.checking_uncertain_tiles',params:{}});const aux=(await infer(region,0,'aux')).concat(await infer(region,180,'aux'));hand=post.resolveUncertain(hand,post.nms(aux));auxiliaryUsed=true;}
  }
  let melds=post.findMeldGroups(all,hand);
  for(let n=0;n<melds.length;n++){
    progress(t('native.photo.checking_meld_count',{count:n+1}),{key:'native.photo.checking_meld_count',params:{count:n+1}});const group=melds[n],bounds=post.handRegion(group.items,width,height),rw=Math.min(width,Math.max(bounds.width*2.2,width*.5)),rh=Math.min(height,Math.max(bounds.height*2.4,height*.3));
    const context={x:Math.max(0,Math.min(width-rw,bounds.x+bounds.width/2-rw/2)),y:Math.max(0,Math.min(height-rh,bounds.y+bounds.height/2-rh/2)),width:rw,height:rh};
    for(const angle of [0,90,180,270])all.push(...await infer(context,angle,'main'));
  }
  if(melds.length)melds=post.findMeldGroups(all,hand);
  return {width,height,items:hand.map((item,index)=>({...item,index,uncertain:!!item.uncertain||item.confidence<.6})),melds:melds.map(group=>({...group,items:group.items.map((item,index)=>({...item,index}))})),handRegion:post.handRegion(hand,width,height),auxiliaryUsed};
}
module.exports={recognizeTable};
