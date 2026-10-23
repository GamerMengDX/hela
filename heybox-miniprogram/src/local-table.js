import {t as tr,current} from '../../src/i18n/index.js';
import {windName} from '../../src/i18n/presenters.js';
import * as core from '../../src/engine.js';
import {clone} from './repository.js';
import {validateTable as validate} from './table-state.js';
const number=n=>Number(n).toLocaleString(current());
export function createTableService(repository) {
const fail=(message,key)=>{const error=new Error(message);if(key)error.messageRef={key,params:{}};throw error;};
function read(){const table=repository.snapshot().table;if(!table)return null;validate(table);return clone(table);}

function store(t){validate(t);return repository.update(data=>{const current=data.table;if(current&&current.id===t.id&&t.revision!==current.revision+1)fail('牌桌已更新，请重试本次操作','heybox.table.changed');data.table=clone(t);}).then(()=>clone(t));}
function create(names,initial=25000){
  if(!Array.isArray(names)||names.length!==4)fail('请输入四名玩家','heybox.table.fourPlayers');
  names=names.map(n=>String(n).trim().slice(0,12));if(names.some(n=>!n))fail('每位玩家都需要一个名字','heybox.table.namesRequired');if(new Set(names).size!==4)fail('请用不同的名字区分四名玩家','heybox.table.uniqueNames');
  if(!Number.isInteger(initial)||initial<1000||initial>100000||initial%1000)fail('初始点棒应为 1,000–100,000 之间的整千点','heybox.table.initialInvalid');
  return store({version:1,id:Date.now()+'-'+Math.random().toString(36).slice(2,9),players:names.map(name=>({name,points:initial})),initial,dealer:0,round:0,kyoku:1,honba:0,pot:0,handNo:1,revision:0,phase:'playing',riichi:[false,false,false,false],records:[]});
}
function current(expected){const t=read();if(!t)fail('请先在组队大厅开桌','heybox.table.createFirst');if(expected&&(t.id!==expected.id||t.revision!==expected.revision||t.handNo!==expected.handNo))fail('牌桌已更新，请返回大厅查看当前余额','heybox.table.balanceChanged');return t;}
const playerAtWind=(t,wind)=>(t.dealer+wind)%4;
const windOfPlayer=(t,index)=>(index-t.dealer+4)%4;
function label(t){return core.WINDS[t.round]+t.kyoku+'局 · '+t.honba+'本场';}
function view(t){if(!t)return null;return {...t,label:displayLabel(t),potText:number(t.pot),players:t.players.map((p,i)=>({...p,index:i,wind:windName(windOfPlayer(t,i)),dealer:i===t.dealer,riichi:t.riichi[i],pointsText:number(p.points),changeText:(p.points-t.initial>=0?'+':'')+number(p.points-t.initial)})),records:t.records.slice().reverse().map(r=>({...r,label:displayRecordLabel(r.label),title:displayRecordTitle(r,t),players:r.changes.map((n,i)=>({name:t.players[i].name,delta:(n>=0?'+':'')+number(n)}))}))};}
function entryState(t,state){const next=clone(state);next.round=t.round;next.honba=t.honba;next.sticks=t.pot/1000;return next;}
function snapshot(t){return {id:t.id,revision:t.revision,handNo:t.handNo};}
function record(t,type,title,changes,extra={}){t.records.push({id:t.id+':'+t.revision,type,title,date:new Date().toISOString(),label:label(t),changes,...extra});t.revision++;}
function deposit(index,expected){const t=current(expected);if(t.phase!=='playing')fail('这一局已结束','heybox.table.ended');if(!Number.isInteger(index)||index<0||index>3)fail('玩家无效','heybox.table.playerInvalid');if(t.riichi[index])fail('这位玩家已经支付过本局立直棒','heybox.table.duplicateDeposit');if(t.players[index].points<1000)fail('点棒不足 1,000，不能立直','heybox.table.notEnough');if(t.pot>=99000)fail('供托已达上限','heybox.table.potLimit');const changes=[0,0,0,0];changes[index]=-1000;t.players[index].points-=1000;t.pot+=1000;t.riichi[index]=true;record(t,'riichi',t.players[index].name+' · 立直',changes);return store(t);}
function preview(state,expected){
  const t=current(expected);if(t.phase!=='playing')fail('本局已结算，请先在大厅进入下一局','heybox.table.settled');
  if(state.round!==t.round||state.honba!==t.honba||state.sticks!==t.pot/1000)fail('本场与供托已变化，请返回大厅重新开始算点','heybox.table.conditionsChanged');
  const winner=playerAtWind(t,state.seat);if(!!state.riichi!==t.riichi[winner])fail(state.riichi?'请先在大厅为和牌者支付本局立直棒':'和牌者已支付立直棒，请在牌局条件中选择立直',state.riichi?'heybox.table.winnerDeposit':'heybox.table.winnerRiichi');
  const result=core.calculate(state);if(!result.ok){const error=new Error(result.message);error.messageRef=result.messageRef;throw error;}
  const changes=[0,0,0,0];result.fenpei.forEach((n,wind)=>changes[playerAtWind(t,wind)]=n);
  if(changes.reduce((n,v)=>n+v,0)!==t.pot)fail('结算点数校验失败','heybox.table.invalidSettlement');
  return {expected:snapshot(t),state:clone(state),result,changes,winner,rows:changes.map((amount,i)=>({name:t.players[i].name,amount,delta:(amount>=0?'+':'')+number(amount),after:number(t.players[i].points+amount)})),title:t.players[winner].name+' · '+(state.method==='ron'?'荣和':'自摸'),pot:t.pot};
}
function settle(proposal){
  const t=read();if(!t)fail('本地牌桌不存在','heybox.table.missing');
  const token=proposal.expected.id+':hand:'+proposal.expected.handNo;
  if(t.id===proposal.expected.id&&t.records.some(r=>r.settlementId===token&&!r.voided))fail('本局已经入账，不会重复扣点','heybox.table.duplicateSettlement');
  // Never trust cached deltas or edited display values; calculate again against persisted data.
  const fresh=preview(proposal.state,proposal.expected),next=current(fresh.expected);
  fresh.changes.forEach((n,i)=>next.players[i].points+=n);next.pot=0;next.phase='settled';next.lastWinner=fresh.winner;
  record(next,'win',fresh.title,fresh.changes,{settlementId:token,score:fresh.result.defen,han:fresh.result.fanshu||0,fu:fresh.result.fu||0,hand:clone(fresh.state),potAward:fresh.pot});return store(next);
}
function draw(tenpai,expected){
  const t=current(expected);if(t.phase!=='playing')fail('本局已经结束','heybox.table.alreadyEnded');if(!Array.isArray(tenpai)||tenpai.length!==4||tenpai.some(n=>typeof n!=='boolean'))fail('请选择四家的听牌状态','heybox.table.tenpaiRequired');
  if(t.riichi.some((yes,i)=>yes&&!tenpai[i]))fail('已立直玩家通常应为听牌；特殊流局请另行处理','heybox.table.riichiTenpai');
  const count=tenpai.filter(Boolean).length,changes=tenpai.map(yes=>count===0||count===4?0:yes?3000/count:-3000/(4-count));changes.forEach((n,i)=>t.players[i].points+=n);t.phase='settled';t.lastWinner=null;t.lastTenpai=tenpai;t.lastDraw=true;record(t,'draw','流局 · '+count+' 家听牌',changes,{settlementId:t.id+':hand:'+t.handNo});return store(t);
}
function nextHand(repeat,expected){if(typeof repeat!=='boolean')fail('请选择连庄或换庄','heybox.table.chooseRepeat');const t=current(expected);if(t.phase!=='settled')fail('请先结算当前牌局','heybox.table.settleFirst');if(t.honba>=99&&repeat)fail('本场数已达上限','heybox.table.honbaLimit');if(repeat)t.honba++;else{t.dealer=(t.dealer+1)%4;t.kyoku++;t.honba=t.lastDraw?t.honba+1:0;if(t.honba>99)fail('本场数已达上限','heybox.table.honbaLimit');if(t.kyoku>4){t.kyoku=1;if(t.round===3)fail('北四局结束，请新开牌桌','heybox.table.northEnd');t.round++;}}t.handNo++;t.phase='playing';t.riichi=[false,false,false,false];delete t.lastDraw;delete t.lastTenpai;delete t.lastWinner;record(t,'next',repeat?'连庄 · 下一局':'换庄 · 下一局',[0,0,0,0]);return store(t);}
function undo(expected){const t=current(expected);if(t.phase!=='settled')fail('只能撤销尚未进入下一局的结算','heybox.table.undoPhase');const entry=t.records.find(r=>r.settlementId===t.id+':hand:'+t.handNo&&!r.voided);if(!entry)fail('没有可撤销的本局结算','heybox.table.nothingToUndo');const changes=entry.changes.map(n=>-n);changes.forEach((n,i)=>t.players[i].points+=n);t.pot+=entry.potAward||0;entry.voided=true;t.phase='playing';delete t.lastWinner;delete t.lastTenpai;delete t.lastDraw;record(t,'undo','撤销 · '+entry.title,changes);return store(t);}
function scoreState(t,state){if(t.phase==='settled'){const entry=t.records.find(r=>r.settlementId===t.id+':hand:'+t.handNo&&!r.voided&&r.hand);if(entry)return clone(entry.hand);}return entryState(t,state);}
function displayLabel(t){return tr('heybox.lobby.label',{wind:windName(t.round),hand:t.kyoku,honba:t.honba});}
function displayRecordLabel(value){const match=/^([东南西北])([1-4])局 · (\d{1,2})本场$/.exec(value);return match?tr('heybox.lobby.label',{wind:windName(core.WINDS.indexOf(match[1])),hand:Number(match[2]),honba:Number(match[3])}):value;}
function displayRecordTitle(record,table){
  const title=record.title;
  if(record.type==='riichi'){const player=table.players.find(p=>title===p.name+' · 立直');if(player)return tr('heybox.lobby.riichiRecord',{name:player.name});}
  if(record.type==='win'&&record.hand&&['ron','tsumo'].includes(record.hand.method)){const suffix=' · '+(record.hand.method==='ron'?'荣和':'自摸');if(title.endsWith(suffix))return tr('heybox.lobby.winRecord',{name:title.slice(0,-suffix.length),method:tr('heybox.common.'+record.hand.method)});}
  if(record.type==='draw'){const match=/^流局 · ([0-4]) 家听牌$/.exec(title);if(match)return tr('heybox.lobby.drawRecord',{count:Number(match[1])});}
  if(record.type==='next'&&['连庄 · 下一局','换庄 · 下一局'].includes(title))return tr(title==='连庄 · 下一局'?'heybox.lobby.repeat':'heybox.lobby.rotate');
  if(record.type==='undo'&&title.startsWith('撤销 · ')){const old=table.records.find(r=>r.voided&&title==='撤销 · '+r.title);if(old)return tr('heybox.lobby.undoRecord',{title:displayRecordTitle(old,table)});}
  return title;
}
function displayProposal(proposal){return {...proposal,title:tr('heybox.lobby.winRecord',{name:proposal.rows[proposal.winner].name,method:tr('heybox.common.'+proposal.state.method)})};}
function exportText(t){return [tr('heybox.lobby.local')+' · 和啦',displayLabel(t),tr('heybox.lobby.balance',{players:t.players.map(p=>p.name+' '+p.points).join(' · ')}),tr('heybox.lobby.pot',{points:t.pot}),...t.records.map(r=>displayRecordLabel(r.label)+' / '+displayRecordTitle(r,t)+(r.voided?tr('heybox.lobby.voided'):'')+' / '+r.changes.map((n,i)=>t.players[i].name+' '+(n>=0?'+':'')+n).join(' · '))].join('\n');}
function readHand(t){try{const draft=repository.snapshot().tableDraft;if(draft&&draft.id===t.id&&draft.handNo===t.handNo&&['hand','melds','dora','ura'].every(k=>Array.isArray(draft.state&&draft.state[k])))return {...core.defaultState(),...clone(draft.state),rules:{...core.defaultState().rules,...draft.state.rules}};}catch{}return null;}
function saveHand(t,state){return repository.update(data=>{if(data.table?.id===t.id&&data.table.handNo===t.handNo)data.tableDraft={id:t.id,handNo:t.handNo,state:clone(state)};});}
return {read,create,view,displayProposal,snapshot,entryState,scoreState,deposit,preview,settle,draw,nextHand,undo,exportText,playerAtWind,windOfPlayer,readHand,saveHand};

}
