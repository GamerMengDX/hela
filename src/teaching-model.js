import {TEACHING_EXAMPLES as EXAMPLES} from './teaching-examples.js';
import {defaultState,parseNotation,calculate,tileName,meldTiles,normalize,WINDS,doraFrom,makeMeld,validTile} from './engine.js';
import {yakuInfo} from './data.js';
const displayError=(message,key,params={})=>Object.assign(new Error(message),{messageRef:{key:'shared.error.'+key,params}});
const number=value=>Number(value).toLocaleString('zh-CN');
const tileView=(tile,index)=>({tile,index,name:tileName(tile)});
export const validTeachingIndex=index=>Number.isInteger(index)&&index>=0&&index<EXAMPLES.length;
const families={'国士無双':['国士無双','国士無双十三面'],'四暗刻':['四暗刻','四暗刻単騎'],'九蓮宝燈':['九蓮宝燈','純正九蓮宝燈']};
const targetMatched=(target,names)=>(families[target]||[target]).some(key=>names.includes(key));

export function teachingState(index){
  if(!validTeachingIndex(index))return null;
  const ex=EXAMPLES[index],hand=parseNotation(ex.hand);
  return {...defaultState(),hand,winIndex:ex.win??hand.length-1,melds:[...(ex.melds||[])],
    dora:[...(ex.dora||[])],ura:[...(ex.ura||[])],riichi:ex.riichi||0,method:ex.method||'ron',
    special:ex.special||'none',ippatsu:ex.ippatsu||false,round:ex.round??0,seat:ex.seat??1};
}
export function teachingContext(state){
  return {round:WINDS[state.round]+'场',seat:WINDS[state.seat]+'家',role:state.seat===0?'庄家':'闲家',
    method:state.method==='ron'?'荣和':'自摸',riichi:state.riichi===2?'双立直':state.riichi?'立直':'未立直',
    special:({rinshan:'岭上开花',last:state.method==='tsumo'?'海底摸月':'河底捞鱼',chankan:'抢杠',first:state.seat===0?'天和':'地和'})[state.special]||'',
    honba:state.honba,sticks:state.sticks,roundIndex:state.round,seatIndex:state.seat,methodKey:state.method,riichiLevel:state.riichi,specialYakuKey:({rinshan:'嶺上開花',last:state.method==='tsumo'?'海底摸月':'河底撈魚',chankan:'槍槓',first:state.seat===0?'天和':'地和'})[state.special]||''};
}
export function teachingGoal(index){
  if(!validTeachingIndex(index))return null;
  const ex=EXAMPLES[index],state=teachingState(index);
  return {index,id:ex.id,name:ex.name,description:ex.desc,nameRef:ex.nameRef,descriptionRef:ex.descriptionRef,category:ex.category,
    targets:ex.targets.map(key=>({key,name:yakuInfo(key)[0]})),requiresOpen:!!ex.requiresOpen,
    context:teachingContext(state),indicators:state.dora.map(tileView)};
}
export function presentTeachingState(index,state,result=calculate(state)){
  if(!result.ok)throw Object.assign(new Error(result.message),{messageRef:result.messageRef});
  const ex=EXAMPLES[index],hand=state.hand.map((tile,n)=>({...tileView(tile,n),winning:n===state.winIndex}));
  const melds=state.melds.map((meld,n)=>{
    const tiles=meldTiles(meld),source=meld.match(/[+=-]/)?.[0],type=tiles.length===4?(!source?'暗杠':/[+=-]\d$/.test(meld)?'加杠':'明杠'):tiles.every(tile=>normalize(tile)===normalize(tiles[0]))?'碰':'吃';
    return {index:n,type,typeKey:({'暗杠':'ankan','加杠':'kakan','明杠':'minkan','碰':'pon','吃':'chi'})[type],sourceKey:source||'',tiles:tiles.map(tileView),source:source?{'-':'上家','=':'对家','+':'下家'}[source]:''};
  });
  const rowTiles=[...hand.map(tile=>({...tile,kind:'hand',groupStart:false})),...melds.flatMap(group=>group.tiles.map((tile,n)=>({...tile,kind:'meld',groupIndex:group.index,groupStart:n===0,winning:false})))].map((tile,rowIndex)=>({...tile,rowIndex}));
  return {index,id:ex.id,name:ex.name,description:ex.desc,nameRef:ex.nameRef,descriptionRef:ex.descriptionRef,category:ex.category,targets:teachingGoal(index).targets,
    hand,melds,rowTiles,meldSummary:melds.map(g=>g.type+' · '+g.tiles.map(t=>t.name).join(' ')+(g.source?' · 来自'+g.source:'')),
    winTile:state.hand[state.winIndex],winTileName:tileName(state.hand[state.winIndex]),physicalCount:rowTiles.length,
    dora:state.dora.map((tile,n)=>({...tileView(tile,n),actual:doraFrom(tile),actualName:tileName(doraFrom(tile))})),context:teachingContext(state),
    score:{points:number(result.defen),total:number(result.total),summary:result.damanguan?result.limit:result.fanshu+' 番 '+result.fu+' 符',summaryRef:result.damanguan?result.limitRef:{key:'shared.score.summary',params:{han:result.fanshu,fu:result.fu}},limit:result.limit,limitRef:result.limitRef,
      han:result.fanshu||0,fu:result.fu||0,yakuman:!!result.damanguan,
      yaku:result.hupai.map(y=>({key:y.name,fanshu:y.fanshu,name:yakuInfo(y.name)[0],description:yakuInfo(y.name)[1],label:typeof y.fanshu==='string'?(y.fanshu.length>1?y.fanshu.length+' 倍役满':'役满'):y.fanshu+' 番'})),
      fuDetails:result.fuDetails,payments:result.fenpei.map((amount,seat)=>({seat,wind:WINDS[seat],amount:number(-amount),paying:amount<0,label:WINDS[seat]+'家'+(seat===0?'（庄家）':'')+'支付'})).filter(p=>p.paying)}};
}
export function teachingExample(index){const state=teachingState(index);return state?presentTeachingState(index,state):null;}
export function teachingExamples(){return EXAMPLES.map((_,index)=>{const d=teachingExample(index);return {index,id:d.id,name:d.name,description:d.description,category:d.category,tiles:d.rowTiles,winTile:d.winTile,winTileName:d.winTileName,handCount:d.hand.length,meldCount:d.melds.length,summary:d.score.summary,summaryRef:d.score.summaryRef,points:d.score.total};});}

function canonicalMeld(meld){
  if(typeof meld!=='string'||!/^[mpsz][0-9]+(?:[+=-][0-9]?)?$/.test(meld))throw displayError('副露格式不正确。','meld-format');
  const tiles=meldTiles(meld),direction=meld.match(/[+=-]/)?.[0]||'-';
  const type=tiles.length===4?(!/[+=-]/.test(meld)?'ankan':/[+=-]\d$/.test(meld)?'kakan':'minkan'):tiles.every(t=>normalize(t)===normalize(tiles[0]))?'pon':'chi';
  return makeMeld(type,tiles,direction);
}
export function judgeTeachingExercise(index,guess){
  const fail=(code,title,message,messageRef)=>({correct:false,code,title,message,titleRef:{key:'shared.judge.'+(['lesson','draft','invalid','meld','count','shape','open','target'].includes(code)?code:'adjust')+'.title'},...(messageRef?{messageRef}:['lesson','draft','invalid','open'].includes(code)?{messageRef:{key:'shared.judge.'+code+'.message'}}:{})});
  if(!validTeachingIndex(index))return fail('lesson','请重新选择示例','没有找到这道练习。');
  if(guess?.meldDraft?.length)return fail('draft','副露还未完成','先确认或取消正在选择的副露，再检查牌型。');
  if(!Array.isArray(guess?.hand)||!Array.isArray(guess?.melds)||guess.melds.length>4||guess.hand.some(tile=>!validTile(tile)))return fail('invalid','牌面有误','请用下方牌盘重新选择有效的牌面。');
  const state=teachingState(index);
  try{state.hand=guess.hand.slice();state.melds=guess.melds.map(canonicalMeld);state.winIndex=guess.winIndex;}
  catch(error){return fail('meld','请检查副露',error.message,error.messageRef);}
  const result=calculate(state);
  if(!result.ok)return fail(result.code,result.code==='count'?'手牌还没有补齐':result.code==='shape'?'还没有构成和牌':'这手牌还需调整',result.message,result.messageRef);
  const definition=EXAMPLES[index],names=result.hupai.map(y=>y.name),missing=definition.targets.filter(target=>!targetMatched(target,names));
  const detail=presentTeachingState(index,state,result);
  if(definition.requiresOpen&&!state.melds.some(m=>/[+=-]/.test(m)))return {...fail('open','本题还需要副露','目标是副露和牌，请至少组成一组吃、碰或明杠。'),detail};
  if(missing.length)return {...fail('target','已经和牌，目标役种还未齐全','还缺：'+missing.map(key=>yakuInfo(key)[0]).join('、')+'。'+definition.desc),missing:missing.map(key=>yakuInfo(key)[0]),missingKeys:missing,lessonId:definition.id,detail};
  return {correct:true,code:'correct',titleRef:{key:'shared.judge.correct.title'},messageRef:{key:'shared.judge.correct.message'},title:'组对了！',message:'这手牌成立目标役种。额外的役种和宝牌也已计入算点。',detail};
}
