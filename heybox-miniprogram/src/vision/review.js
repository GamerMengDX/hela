import {validTile,makeMeld,validateInventory,inventory} from '../../../src/engine.js';
import {syncWinningTile} from '../../../src/hand-input.js';
import {clone} from '../repository.js';
export const MELD_TYPES=[{id:'chi',name:'吃',count:3},{id:'pon',name:'碰',count:3},{id:'minkan',name:'明杠',count:4},{id:'ankan',name:'暗杠',count:4},{id:'kakan',name:'加杠',count:4}];
export const DIRECTIONS=[{id:'-',name:'上家'},{id:'=',name:'对家'},{id:'+',name:'下家'}];
export const meldCount=type=>MELD_TYPES.find(item=>item.id===type)?.count||3;
export function includedMelds(base,groups,mode){return mode==='keep'?base.melds.length:groups.filter(group=>group.include!==false).length;}
export function expectedTiles(base,groups,mode){return 14-3*includedMelds(base,groups,mode);}
export function normalizeGroup(group,index){
  const type=MELD_TYPES.some(item=>item.id===group.type)?group.type:'pon';
  const items=Array.from({length:Math.max(meldCount(type),group.items?.length||0)},(_,i)=>clone(group.items?.[i]||{tile:'',uncertain:true}));
  return {...clone(group),id:'meld-'+index,type,items,include:group.include!==false,direction:type==='chi'?'-':type==='ankan'?'':DIRECTIONS.some(item=>item.id===group.direction)?group.direction:''};
}
export function applyPhotoReview(base,items,winIndex,{mode='replace',melds=[]}={}){
  const next=clone(base);
  if(mode==='replace'){
    const included=melds.filter(group=>group.include!==false);
    if(included.length>4)throw new Error('最多录入四组副露');
    next.melds=included.map((group,index)=>{
      const type=MELD_TYPES.find(item=>item.id===group.type);
      if(!type)throw new Error('请确认第 '+(index+1)+' 组的副露类型');
      if(!['chi','ankan'].includes(group.type)&&!DIRECTIONS.some(item=>item.id===group.direction))throw new Error('第 '+(index+1)+' 组副露未读清横牌位置，请核对鸣牌来源');
      if(group.items.some(item=>!validTile(item.tile)))throw new Error('第 '+(index+1)+' 组副露还有未确定的牌，请先补全');
      return makeMeld(group.type,group.items.map(item=>item.tile),group.direction||'-');
    });
    if(next.melds.some(meld=>/[+=-]/.test(meld))){next.riichi=0;next.ippatsu=false;}
    if(next.melds.length&&next.special==='first')next.special='none';
    if(next.special==='rinshan'&&!next.melds.some(meld=>meld.replace(/[^0-9]/g,'').length===4))next.special='none';
  }
  const expected=14-3*next.melds.length;
  if(!items.length)throw new Error('请先识别或添加手牌');
  if(items.length>expected)throw new Error('当前副露下最多录入 '+expected+' 张手牌，请移除多余的牌');
  if(items.some(item=>!validTile(item.tile)))throw new Error('还有未确定的牌，请点击问号补全');
  next.hand=items.map(item=>item.tile);
  if(next.hand.length===expected&&(!Number.isInteger(winIndex)||winIndex<0||winIndex>=expected))throw new Error('请先指定本次和牌');
  next.winIndex=next.hand.length===expected?winIndex:-1;
  validateInventory(inventory(next));syncWinningTile(next);return next;
}
export function reviewStatus(base,items,winIndex,options){
  const expected=expectedTiles(base,options.melds,options.mode);
  try{return {expected,complete:items.length===expected,state:applyPhotoReview(base,items,winIndex,options),error:''};}
  catch(error){return {expected,complete:false,state:null,error:error.message};}
}
