const {t,nativeError}=require('./locale');
// YOLO 37 类输出解码。类别顺序来自模型自身元数据，不能按花色重新排序。
const CLASS_NAMES=['1m','1p','1s','1z','2m','2p','2s','2z','3m','3p','3s','3z','4m','4p','4s','4z','5m','5p','5s','5z','6m','6p','6s','6z','7m','7p','7s','7z','8m','8p','8s','9m','9p','9s','0m','0p','0s'];
const {inferMeldDirection}=require('./meld-layout');
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const median=values=>{const a=values.slice().sort((x,y)=>x-y);return a[Math.floor(a.length/2)]||0;};
const tileCode=label=>label[1]+label[0];
function letterbox(width,height,size=640){const scale=Math.min(size/width,size/height),drawWidth=Math.round(width*scale),drawHeight=Math.round(height*scale);return {scale,padX:Math.floor((size-drawWidth)/2),padY:Math.floor((size-drawHeight)/2),drawWidth,drawHeight};}
function iou(a,b){const overlap=Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));return overlap/Math.max(1,a.width*a.height+b.width*b.height-overlap);}
function nms(items,threshold=.45){const kept=[];for(const item of items.slice().sort((a,b)=>b.confidence-a.confidence)){if(!kept.some(other=>iou(item.box,other.box)>threshold))kept.push(item);}return kept;}
function decode(data,shape,region,imageWidth,imageHeight,threshold=.15){
  if(!Array.isArray(shape)||shape.length!==3||shape[0]!==1||shape[1]!==41||data.length!==shape[1]*shape[2])throw nativeError('native.photo.recognition_model_output_format_does_not_match');
  const n=shape[2],map=letterbox(region.width,region.height),items=[];
  for(let index=0;index<n;index++){
    const candidates=[];for(let c=0;c<37;c++){const confidence=data[(4+c)*n+index];if(Number.isFinite(confidence))candidates.push({tile:tileCode(CLASS_NAMES[c]),confidence,similarity:confidence});}candidates.sort((a,b)=>b.confidence-a.confidence);
    if(!candidates.length||candidates[0].confidence<threshold)continue;
    const cx=data[index],cy=data[n+index],w=data[2*n+index],h=data[3*n+index];if(![cx,cy,w,h].every(Number.isFinite)||w<=0||h<=0)continue;
    const x=region.x+(cx-w/2-map.padX)/map.scale,y=region.y+(cy-h/2-map.padY)/map.scale,right=region.x+(cx+w/2-map.padX)/map.scale,bottom=region.y+(cy+h/2-map.padY)/map.scale;
    const box={x:clamp(x,0,imageWidth),y:clamp(y,0,imageHeight),width:clamp(right,0,imageWidth)-clamp(x,0,imageWidth),height:clamp(bottom,0,imageHeight)-clamp(y,0,imageHeight)};
    const clipped=x<region.x+2||y<region.y+2||right>region.x+region.width-2||bottom>region.y+region.height-2;
    if(box.width<8||box.height<8)continue;
    items.push({tile:candidates[0].tile,confidence:candidates[0].confidence,candidates:candidates.slice(0,3),box,clipped,uncertain:candidates[0].confidence<.6});
  }
  return nms(items);
}
function selectHand(items,expected=14){
  const candidates=items.filter(item=>item.confidence>=.15&&item.box.width/item.box.height>.35&&item.box.width/item.box.height<1.85);
  let best=[],bestScore=-Infinity;
  for(const anchor of candidates){
    const cy=anchor.box.y+anchor.box.height/2;
    let row=candidates.filter(item=>Math.abs(item.box.y+item.box.height/2-cy)<Math.max(item.box.height,anchor.box.height)*.4&&item.box.height/anchor.box.height>.6&&item.box.height/anchor.box.height<1.65);
    if(row.length<2)continue;const typicalWidth=median(row.map(item=>item.box.width));row=row.filter(item=>item.box.width>=typicalWidth*.65&&item.box.width<=typicalWidth*1.6&&(!item.clipped||item.confidence>=.5));
    if(row.length<2)continue;
    const size=median(row.map(item=>item.box.height)),depth=median(row.map(item=>item.box.y+item.box.height/2));
    // 前景牌通常更大、更靠下；数量只是辅助，不强行补齐 13/14 张。
    const score=Math.log(1+size)*2+Math.log(1+depth)+Math.min(row.length,expected)*.16;
    if(score>bestScore){best=row;bestScore=score;}
  }
  return best.sort((a,b)=>a.box.x-b.box.x).slice(0,18);
}
function handRegion(items,imageWidth,imageHeight){
  if(!items.length)return null;const mx=median(items.map(item=>item.box.width))*.3,my=median(items.map(item=>item.box.height))*.4;
  const x=Math.max(0,Math.floor(Math.min(...items.map(item=>item.box.x))-mx)),y=Math.max(0,Math.floor(Math.min(...items.map(item=>item.box.y))-my));
  const right=Math.min(imageWidth,Math.ceil(Math.max(...items.map(item=>item.box.x+item.box.width))+mx)),bottom=Math.min(imageHeight,Math.ceil(Math.max(...items.map(item=>item.box.y+item.box.height))+my));
  return {x,y,width:right-x,height:bottom-y};
}
function mergePasses(first,second,expected){return selectHand(nms(first.concat(second)),expected);}
function resultItems(items){return items.map((item,index)=>({...item,index,uncertain:item.confidence<.6}));}
function unrotate(items,region,angle){
  return items.map(item=>{const b=item.box;let x=b.x,y=b.y,w=b.width,h=b.height;
    if(angle===90){x=b.y;y=region.height-b.x-b.width;w=b.height;h=b.width;}
    else if(angle===180){x=region.width-b.x-b.width;y=region.height-b.y-b.height;}
    else if(angle===270){x=region.width-b.y-b.height;y=b.x;w=b.height;h=b.width;}
    return {...item,angle,box:{x:x+region.x,y:y+region.y,width:w,height:h}};
  });
}
function scanRegions(width,height){const w=Math.round(width*.6),h=Math.round(height*.6);return [0,height-h].flatMap(y=>[0,width-w].map(x=>({x,y,width:w,height:h})));}
const normalized=t=>t&&t[0]+(t[1]==='0'?'5':t[1]);
function meldType(items){
  const tiles=items.map(item=>normalized(item.tile));
  if(tiles.length===3&&tiles.every(t=>t===tiles[0]))return 'pon';
  if(tiles.length===4&&tiles.every(t=>t===tiles[0])){
    const stacked=items.some((a,i)=>items.some((b,j)=>i!==j&&Math.abs(a.box.x+a.box.width/2-b.box.x-b.box.width/2)<Math.min(a.box.width,b.box.width)*.45&&Math.abs(a.box.y-b.box.y)>.2*Math.min(a.box.height,b.box.height)));
    return stacked?'kakan':'minkan';
  }
  if(tiles.length===3&&tiles[0][0]!=='z'&&tiles.every(t=>t[0]===tiles[0][0])){const ns=tiles.map(t=>+t[1]).sort((a,b)=>a-b);if(ns[1]===ns[0]+1&&ns[2]===ns[1]+1)return 'chi';}
  return '';
}
function findMeldGroups(all,hand){
  if(hand.length<2)return [];const w=median(hand.map(i=>i.box.width)),h=median(hand.map(i=>i.box.height)),left=Math.min(...hand.map(i=>i.box.x)),right=Math.max(...hand.map(i=>i.box.x+i.box.width)),top=Math.min(...hand.map(i=>i.box.y)),bottom=Math.max(...hand.map(i=>i.box.y+i.box.height));
  const pool=nms(all).filter(i=>i.confidence>=.25&&(!i.clipped||i.confidence>=.6)&&i.box.width>w*.45&&i.box.height>h*.45&&i.box.width<w*2.4&&i.box.height<h*2.8&&!hand.some(t=>iou(i.box,t.box)>.2)&&i.box.y+i.box.height/2>=top-3*h&&i.box.y<bottom+2*h&&(i.box.x>right-w*.2||i.box.x+i.box.width<left+w*.2||i.box.y>bottom+h*.15));
  const groups=[];const remaining=new Set(pool);
  for(const anchor of pool){if(!remaining.has(anchor))continue;remaining.delete(anchor);const component=[anchor];for(let j=0;j<component.length;j++)for(const other of [...remaining]){const a=component[j].box,b=other.box,gapX=Math.max(0,Math.max(a.x,b.x)-Math.min(a.x+a.width,b.x+b.width)),gapY=Math.max(0,Math.max(a.y,b.y)-Math.min(a.y+a.height,b.y+b.height));if(gapX<Math.max(a.width,b.width)*.35&&gapY<Math.max(a.height,b.height)*.45){remaining.delete(other);component.push(other);}}
    component.sort((a,b)=>Math.abs(a.box.y-b.box.y)<Math.max(a.box.height,b.box.height)*.65?a.box.x-b.box.x:a.box.y-b.box.y);
    if(component.length>=2&&component.length<=4){const type=meldType(component),source=inferMeldDirection(type,component);groups.push({items:component,type:type||'pon',valid:!!type,direction:source.direction,suggestedDirection:source.direction,directionAutomatic:source.automatic,sourceReason:source.reason,uncertain:!type||component.some(i=>i.confidence<.6)});}
  }
  return groups.sort((a,b)=>{const ay=median(a.items.map(i=>i.box.y+i.box.height/2)),by=median(b.items.map(i=>i.box.y+i.box.height/2)),height=median(a.items.concat(b.items).map(i=>i.box.height));return Math.abs(ay-by)<height*.65?Math.max(...b.items.map(i=>i.box.x))-Math.max(...a.items.map(i=>i.box.x)):by-ay;}).slice(0,4);
}
function mergeRefinement(coarse,refined){
  const merged=refined.slice();for(const item of coarse){if(!merged.some(i=>iou(i.box,item.box)>.25))merged.push({...item,confidence:Math.min(item.confidence,.55),uncertain:true});}return selectHand(nms(merged));
}
function resolveUncertain(items,aux){return items.map(item=>{if(item.confidence>=.65)return item;const candidates=aux.filter(i=>iou(item.box,i.box)>.3&&!i.clipped).sort((a,b)=>b.confidence-a.confidence);const best=candidates[0];if(best&&best.confidence>=.6&&best.confidence>item.confidence+.1)return {...best,box:item.box,auxiliary:true,uncertain:best.tile!==item.tile,candidates:[...best.candidates,...item.candidates].filter((c,i,a)=>a.findIndex(x=>x.tile===c.tile)===i).slice(0,4)};return {...item,uncertain:true};});}
module.exports={CLASS_NAMES,letterbox,iou,nms,decode,selectHand,handRegion,mergePasses,resultItems,unrotate,scanRegions,findMeldGroups,meldType,mergeRefinement,resolveUncertain};
