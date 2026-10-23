// 鸣牌来源由横置牌在组内的位置决定：左=上家，中=对家，右=下家。
// 加杠先把上下叠放的两张还原成同一个位置，再沿用原碰牌来源。
const median=values=>{const a=values.slice().sort((x,y)=>x-y);return a[Math.floor(a.length/2)]||0;};
function inferMeldDirection(type,items=[]){
  if(type==='chi')return {direction:'-',automatic:true,reason:'吃牌来自上家'};
  if(type==='ankan')return {direction:'',automatic:true,reason:'暗杠没有鸣牌来源'};
  const boxes=items.filter(item=>item.box&&['x','y','width','height'].every(key=>Number.isFinite(item.box[key]))&&item.box.width>0&&item.box.height>0).slice().sort((a,b)=>a.box.x+a.box.width/2-b.box.x-b.box.width/2);
  if(boxes.length<3)return {direction:'',automatic:false,reason:'未读清横置牌位置'};
  const columns=[];
  for(const item of boxes){const b=item.box,cx=b.x+b.width/2;let column=columns.find(c=>Math.abs(cx-c.cx)<Math.min(b.width,c.width)*.45&&c.items.some(i=>Math.abs(i.box.y-b.y)>.2*Math.min(i.box.height,b.height)));if(!column){column={cx,width:b.width,items:[]};columns.push(column);}column.items.push(item);}
  const sourceAt=index=>index===0?'-':index===columns.length-1?'+':'=';
  if(type==='kakan'){
    const stack=columns.map((c,i)=>c.items.length>1?i:-1).filter(i=>i>=0);
    if(stack.length===1&&columns.length===3)return {direction:sourceAt(stack[0]),automatic:true,reason:'加杠叠放位置',calledColumn:stack[0]};
  }
  const ratios=columns.map(c=>Math.max(...c.items.map(i=>i.box.width/i.box.height))),tilted=ratios.map((ratio,index)=>ratio>1.25&&ratio>median(ratios.filter((_,n)=>n!==index))*1.18?index:-1).filter(i=>i>=0);
  const directions=[...new Set(tilted.map(sourceAt))];
  if(directions.length===1)return {direction:directions[0],automatic:true,reason:'横置牌位置',calledColumn:tilted[0]};
  return {direction:'',automatic:false,reason:'未读清横置牌位置'};
}
module.exports={inferMeldDirection};
