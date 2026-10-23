const {core,clone,number}=require('./model');
const {t:translate,presenters}=require('./locale');
const KEY='hela-local-table-v1';
const HAND_KEY='hela-local-table-hand-v1';
const fail=value=>{const ref=typeof value==='string'&&value.startsWith('native.')?{key:value}:value?.messageRef;const error=new Error(ref?translate(ref.key,ref.params||{}):presenters.errorMessage(value));if(ref)error.messageRef=ref;throw error;};
function read(){let table;try{table=wx.getStorageSync(KEY);}catch{return null;}if(!table)return null;validate(table);return clone(table);}
function validate(t){
  if(!t||t.version!==1||!Array.isArray(t.players)||t.players.length!==4||!Array.isArray(t.records)||!Array.isArray(t.riichi)||t.riichi.length!==4)fail('native.table.error.table_record_is_invalid_export_it_before_creating_a');
  if(!Number.isInteger(t.dealer)||t.dealer<0||t.dealer>3||!Number.isInteger(t.round)||t.round<0||t.round>3||!Number.isInteger(t.kyoku)||t.kyoku<1||t.kyoku>4||!Number.isInteger(t.honba)||t.honba<0||t.honba>99||!Number.isInteger(t.pot)||t.pot<0||t.pot>99000||t.pot%1000||!Number.isInteger(t.handNo)||!Number.isInteger(t.revision)||!['playing','settled','finished'].includes(t.phase))fail('native.table.error.table_data_is_invalid');
  if(typeof t.id!=='string'||!t.id||!Number.isInteger(t.initial)||t.initial<1000||t.initial>100000||t.initial%1000||t.handNo<1||t.revision<0||t.players.some(p=>!p||typeof p.name!=='string'||!p.name||!Number.isSafeInteger(p.points))||t.riichi.some(n=>typeof n!=='boolean'))fail('native.table.error.player_record_is_invalid');
  if(t.players.reduce((sum,p)=>sum+p.points,0)+t.pot!==t.initial*4)fail('native.table.error.total_points_do_not_match_settlement_is_unavailable');
}
function store(t){validate(t);try{wx.setStorageSync(KEY,t);}catch{fail('native.table.error.storage_failed_scores_were_not_updated_check_space_and');}return clone(t);}
function create(names,initial=25000){
  if(!Array.isArray(names)||names.length!==4)fail('native.table.error.enter_four_players');
  names=names.map(n=>String(n).trim().slice(0,12));if(names.some(n=>!n))fail('native.table.error.every_player_needs_a_name');if(new Set(names).size!==4)fail('native.table.error.use_a_different_name_for_each_player');
  if(!Number.isInteger(initial)||initial<1000||initial>100000||initial%1000)fail('native.table.error.starting_points_must_be_1_000_100_000_in');
  return store({version:1,id:Date.now()+'-'+Math.random().toString(36).slice(2,9),players:names.map(name=>({name,points:initial})),initial,dealer:0,round:0,kyoku:1,honba:0,pot:0,handNo:1,revision:0,phase:'playing',riichi:[false,false,false,false],records:[]});
}
function current(expected){const t=read();if(!t)fail('native.table.error.create_a_table_in_the_lobby_first');if(expected&&(t.id!==expected.id||t.revision!==expected.revision||t.handNo!==expected.handNo))fail('native.table.error.the_table_changed_return_to_the_lobby_for_current');return t;}
const playerAtWind=(t,wind)=>(t.dealer+wind)%4;
const windOfPlayer=(t,index)=>(index-t.dealer+4)%4;
function label(t){return core.WINDS[t.round]+t.kyoku+'局 · '+t.honba+'本场';}
function displayLabel(table){return translate('native.table.label',{wind:presenters.windName(table.round),kyoku:table.kyoku,honba:table.honba});}
function recordLabel(record){const match=/^([东南西北])([1-4])局 · (\d+)本场$/.exec(record.label||'');return match?translate('native.table.label',{wind:presenters.windName('东南西北'.indexOf(match[1])),kyoku:+match[2],honba:+match[3]}):record.label;}
function recordTitle(record,table){
  if(record.type==='riichi'){const index=record.changes.findIndex(n=>n<0);return translate('native.table.record.riichi',{name:table.players[index]?.name||''});}
  if(record.type==='win'){const player=table.players.find(player=>record.title===player.name+' · 荣和'||record.title===player.name+' · 自摸');if(player)return translate('native.table.record.win',{name:player.name,method:translate((record.hand?.method==='tsumo'||(!record.hand&&record.title===player.name+' · 自摸'))?'native.ui.tsumo':'native.ui.ron')});}
  if(record.type==='draw'){const match=/^流局 · ([0-4]) 家听牌$/.exec(record.title);if(match)return translate('native.table.record.draw',{count:+match[1]});}
  if(record.type==='next')return translate(record.title==='连庄 · 下一局'?'native.ui.dealer_repeats_next_hand':'native.ui.rotate_dealer_next_hand');
  if(record.type==='undo'){const original=table.records.find(row=>row.id!==record.id&&record.title==='撤销 · '+row.title);if(original)return translate('native.table.record.undo',{title:recordTitle(original,table)});}
  return record.title;
}
function view(table){if(!table)return null;return {...clone(table),label:displayLabel(table),potText:number(table.pot),players:table.players.map((player,index)=>({...player,index,wind:presenters.windName(windOfPlayer(table,index)),dealer:index===table.dealer,riichi:table.riichi[index],pointsText:number(player.points),changeText:(player.points-table.initial>=0?'+':'')+number(player.points-table.initial)})),records:table.records.slice().reverse().map(record=>({...clone(record),label:recordLabel(record),title:recordTitle(record,table),players:record.changes.map((amount,index)=>({name:table.players[index].name,delta:(amount>=0?'+':'')+number(amount)}))}))};}
function entryState(t,state){const next=clone(state);next.round=t.round;next.honba=t.honba;next.sticks=t.pot/1000;return next;}
function snapshot(t){return {id:t.id,revision:t.revision,handNo:t.handNo};}
function record(t,type,title,changes,extra={}){t.records.push({id:t.id+':'+t.revision,type,title,date:new Date().toISOString(),label:label(t),changes,...extra});t.revision++;}
function deposit(index,expected){const t=current(expected);if(t.phase!=='playing')fail('native.table.error.this_hand_has_ended');if(!Number.isInteger(index)||index<0||index>3)fail('native.table.error.invalid_player');if(t.riichi[index])fail('native.table.error.this_player_already_paid_a_riichi_deposit');if(t.players[index].points<1000)fail('native.table.error.fewer_than_1_000_points_riichi_is_unavailable');if(t.pot>=99000)fail('native.table.error.the_riichi_pot_reached_its_limit');const changes=[0,0,0,0];changes[index]=-1000;t.players[index].points-=1000;t.pot+=1000;t.riichi[index]=true;record(t,'riichi',t.players[index].name+' · 立直',changes);return store(t);}
function preview(state,expected){
  const t=current(expected);if(t.phase!=='playing')fail('native.table.error.this_hand_is_settled_advance_to_the_next_hand');
  if(state.round!==t.round||state.honba!==t.honba||state.sticks!==t.pot/1000)fail('native.table.error.honba_or_deposits_changed_restart_scoring_from_the_lobby');
  const winner=playerAtWind(t,state.seat);if(!!state.riichi!==t.riichi[winner])fail(state.riichi?'native.table.error.pay_the_winner_s_riichi_deposit_in_the_lobby':'native.table.error.the_winner_paid_a_deposit_select_riichi_in_round');
  const result=core.calculate(state);if(!result.ok)fail(result);
  const changes=[0,0,0,0];result.fenpei.forEach((n,wind)=>changes[playerAtWind(t,wind)]=n);
  if(changes.reduce((n,v)=>n+v,0)!==t.pot)fail('native.table.error.settlement_points_do_not_match');
  return {expected:snapshot(t),state:clone(state),result,changes,winner,rows:changes.map((amount,i)=>({name:t.players[i].name,amount,delta:(amount>=0?'+':'')+number(amount),after:number(t.players[i].points+amount)})),title:t.players[winner].name+' · '+(state.method==='ron'?'荣和':'自摸'),displayTitle:translate('native.table.record.win',{name:t.players[winner].name,method:translate(state.method==='ron'?'native.ui.ron':'native.ui.tsumo')}),pot:t.pot};
}
function settle(proposal){
  const t=read();if(!t)fail('native.table.error.local_table_does_not_exist');
  const token=proposal.expected.id+':hand:'+proposal.expected.handNo;
  if(t.id===proposal.expected.id&&t.records.some(r=>r.settlementId===token&&!r.voided))fail('native.table.error.this_hand_was_already_settled_no_duplicate_transfer');
  // Never trust cached deltas or edited display values; calculate again against persisted data.
  const fresh=preview(proposal.state,proposal.expected),next=current(fresh.expected);
  fresh.changes.forEach((n,i)=>next.players[i].points+=n);next.pot=0;next.phase='settled';next.lastWinner=fresh.winner;
  record(next,'win',fresh.title,fresh.changes,{settlementId:token,score:fresh.result.defen,han:fresh.result.fanshu||0,fu:fresh.result.fu||0,hand:clone(fresh.state),potAward:fresh.pot});return store(next);
}
function draw(tenpai,expected){
  const t=current(expected);if(t.phase!=='playing')fail('native.table.error.this_hand_has_already_ended');if(!Array.isArray(tenpai)||tenpai.length!==4||tenpai.some(n=>typeof n!=='boolean'))fail('native.table.error.select_tenpai_status_for_all_four_players');
  if(t.riichi.some((yes,i)=>yes&&!tenpai[i]))fail('native.table.error.riichi_players_should_normally_be_in_tenpai_handle_special');
  const count=tenpai.filter(Boolean).length,changes=tenpai.map(yes=>count===0||count===4?0:yes?3000/count:-3000/(4-count));changes.forEach((n,i)=>t.players[i].points+=n);t.phase='settled';t.lastWinner=null;t.lastTenpai=tenpai;t.lastDraw=true;record(t,'draw','流局 · '+count+' 家听牌',changes,{settlementId:t.id+':hand:'+t.handNo});return store(t);
}
function nextHand(repeat,expected){if(typeof repeat!=='boolean')fail('native.table.error.choose_whether_the_dealer_repeats_or_rotates');const t=current(expected);if(t.phase!=='settled')fail('native.table.error.settle_the_current_hand_first');if(t.honba>=99&&repeat)fail('native.table.error.honba_reached_its_limit');if(repeat)t.honba++;else{t.dealer=(t.dealer+1)%4;t.kyoku++;t.honba=t.lastDraw?t.honba+1:0;if(t.honba>99)fail('native.table.error.honba_reached_its_limit');if(t.kyoku>4){t.kyoku=1;if(t.round===3)fail('native.table.error.north_4_is_over_start_a_new_table');t.round++;}}t.handNo++;t.phase='playing';t.riichi=[false,false,false,false];delete t.lastDraw;delete t.lastTenpai;delete t.lastWinner;record(t,'next',repeat?'连庄 · 下一局':'换庄 · 下一局',[0,0,0,0]);return store(t);}
function undo(expected){const t=current(expected);if(t.phase!=='settled')fail('native.table.error.only_undo_a_settlement_before_advancing_to_the_next');const entry=t.records.find(r=>r.settlementId===t.id+':hand:'+t.handNo&&!r.voided);if(!entry)fail('native.table.error.no_settlement_to_undo_for_this_hand');const changes=entry.changes.map(n=>-n);changes.forEach((n,i)=>t.players[i].points+=n);t.pot+=entry.potAward||0;entry.voided=true;t.phase='playing';delete t.lastWinner;delete t.lastTenpai;delete t.lastDraw;record(t,'undo','撤销 · '+entry.title,changes);return store(t);}
function scoreState(t,state){if(t.phase==='settled'){const entry=t.records.find(r=>r.settlementId===t.id+':hand:'+t.handNo&&!r.voided&&r.hand);if(entry)return clone(entry.hand);}return entryState(t,state);}
function exportText(table){const projected=view(table);return [translate('native.table.copy.title'),projected.label,translate('native.table.copy.balance',{balances:table.players.map(player=>player.name+' '+number(player.points)).join('; ')}),translate('native.table.copy.pot',{points:number(table.pot)}),...projected.records.slice().reverse().map(record=>record.label+' / '+record.title+(record.voided?translate('native.ui.undone'):'')+' / '+record.changes.map((amount,index)=>table.players[index].name+' '+(amount>=0?'+':'')+number(amount)).join(', '))].join('\n');}
function readHand(t){try{const draft=wx.getStorageSync(HAND_KEY);if(draft&&draft.id===t.id&&draft.handNo===t.handNo&&['hand','melds','dora','ura'].every(k=>Array.isArray(draft.state&&draft.state[k])))return {...core.defaultState(),...clone(draft.state),rules:{...core.defaultState().rules,...draft.state.rules}};}catch{}return null;}
function saveHand(t,state){try{wx.setStorageSync(HAND_KEY,{id:t.id,handNo:t.handNo,state:clone(state)});return true;}catch{return false;}}
module.exports={read,create,view,snapshot,entryState,scoreState,deposit,preview,settle,draw,nextHand,undo,exportText,playerAtWind,windOfPlayer,readHand,saveHand};
