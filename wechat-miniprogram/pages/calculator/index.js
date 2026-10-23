const {keypadTiles}=require('../../utils/tile-keypad');
const {withLocale:withTheme,t:translate,presenters,nativeError}=require('../../utils/locale');
const {openScorePage,openModulePage}=require('../../utils/navigation');
const model=require('../../utils/model');
const {core}=model;
const localTable=require('../../utils/local-table');
const ruleSettings=()=>[['openTanyao',translate('native.ui.allow_open_tanyao'),translate('native.ui.tanyao_is_allowed_in_open_hands')],['kiriage',translate('native.ui.kiriage_mangan'),translate('native.ui.round_4_han_30_fu_3_han_60')],['doubleYakuman',translate('native.ui.double_yakuman'),translate('native.ui.double_value_for_13_sided_kokushi_suuankou_tanki')],['kazoe',translate('native.ui.kazoe_yakuman'),translate('native.ui.count_13_or_more_han_as_yakuman')],['doubleWindFu',translate('native.ui.double_wind_pair_4_fu'),translate('native.ui.use_2_fu_when_disabled')]];
Page(withTheme({
  data:{currentSuit:'m',redFive:false,canUndo:false,suits:[{id:'m',name:translate('native.ui.man')},{id:'p',name:translate('native.ui.pin')},{id:'s',name:translate('native.ui.sou')},{id:'z',name:translate('native.ui.honors')}],step:0,steps:[{index:0,name:translate('native.ui.hand')},{index:1,name:translate('native.ui.round')},{index:2,name:translate('native.ui.result')}],meldExpanded:false,bonusExpanded:false,winTile:'',complete:false,target:'hand',textMode:false,notationInput:'',modal:'',meldType:'chi',meldTiles:[],meldDirection:'-',meldMove:false,meldRequired:3,meldError:'',examples:model.examplesView(),meldTypes:[{type:'chi',name:translate('native.ui.chi')},{type:'pon',name:translate('native.ui.pon')},{type:'ankan',name:translate('native.ui.closed_kan')},{type:'minkan',name:translate('native.ui.open_kan')},{type:'kakan',name:translate('native.ui.added_kan')}],directionNames:[translate('native.ui.left_player'),translate('native.ui.opposite_player'),translate('native.ui.right_player')],directionIndex:0},
  onLocaleRefresh(){if(this.data.meldError&&this._meldError)this.setData({meldError:presenters.errorMessage(this._meldError)});if(this.data.tableError&&this._tableError)this.setData({tableError:presenters.errorMessage(this._tableError)});this.setData({examples:model.examplesView(),suits:[{id:'m',name:translate('native.ui.man')},{id:'p',name:translate('native.ui.pin')},{id:'s',name:translate('native.ui.sou')},{id:'z',name:translate('native.ui.honors')}],steps:[{index:0,name:translate('native.ui.hand')},{index:1,name:translate('native.ui.round')},{index:2,name:translate('native.ui.result')}],meldTypes:[{type:'chi',name:translate('native.ui.chi')},{type:'pon',name:translate('native.ui.pon')},{type:'ankan',name:translate('native.ui.closed_kan')},{type:'minkan',name:translate('native.ui.open_kan')},{type:'kakan',name:translate('native.ui.added_kan')}],directionNames:[translate('native.ui.left_player'),translate('native.ui.opposite_player'),translate('native.ui.right_player')]});if(this._state){const notationInput=this.data.notationInput;this.refreshDisplay();if(this.data.modal==='notation')this.setData({notationInput});if(this._table)this.setData({tableLabel:localTable.view(this._table).label});if(this.data.activeYaku){const activeYaku=this.data.result.yaku?.find(row=>row.key===this.data.activeYaku.key);if(activeYaku)this.setData({activeYaku});}}},
  onLoad(options={}){this._undo=[];this._tableId=options.table||'';this._state=this._tableId?model.emptyState():model.restoreDraft();this.syncTable();if(this._table){this._state=localTable.readHand(this._table)||this._state;this.syncTable();}this.commit();},
  onShow(){const app=getApp();let imported=false;if(app.globalData.pendingHand){imported=true;this._state=model.clone(app.globalData.pendingHand);app.globalData.pendingHand=null;const nextStep=app.globalData.pendingHandStep;app.globalData.pendingHandStep=null;this.setData({target:'hand',step:Number.isInteger(nextStep)&&nextStep>=0&&nextStep<=2?nextStep:2});}this.syncTable();if(imported)this.commit();else this.refreshDisplay();},
  syncTable(){
    if(!this._tableId)return;
    try{const t=localTable.read();if(!t||t.id!==this._tableId||this._tableHandNo&&t.handNo!==this._tableHandNo){this._tableError=nativeError('native.ui.the_table_or_hand_changed_return_to_the');this.setData({localTable:true,tableExpired:true,tableError:presenters.errorMessage(this._tableError)});return;}this._tableHandNo=t.handNo;this._tableExpected=localTable.snapshot(t);this._table=t;this._state=localTable.scoreState(t,this._state);const paid=t.riichi[localTable.playerAtWind(t,this._state.seat)];this._state.riichi=paid?(this._state.riichi||1):0;if(!paid)this._state.ippatsu=false;this.setData({localTable:true,tableExpired:false,tableSettled:t.phase!=='playing',tableLabel:localTable.view(t).label,tableNames:[0,1,2,3].map(w=>t.players[localTable.playerAtWind(t,w)].name),tableError:''});}catch(err){this._tableError=err;this.setData({localTable:true,tableExpired:true,tableError:presenters.errorMessage(err)});}
  },
  refreshDisplay(){
    if(!this._state)return;
    const target=this.data.target==='ura'&&!this._state.riichi?'hand':this.data.target;
    const vm=model.viewModel(this._state,target);
    const rows=model.palette(this._state,target),suit=this.data.currentSuit||'m';
    const keyboardTiles=keypadTiles(rows,suit,this.data.redFive);
    const handSlots=Array.from({length:vm.expected-1},(_,slot)=>({...vm.handTiles[slot],slot}));
    this.setData({...vm,keyboardTiles,handSlots,canUndo:!!this._undo&&this._undo.length>0,target,missingTiles:Math.max(0,vm.expected-this._state.hand.length),notationInput:vm.notation,ruleRows:ruleSettings().map(([key,name,description])=>({key,name,description,value:!!this._state.rules[key]})),meldPalette:model.palette(this._state,'hand',true)});
    if(this._tableId&&this.data.tableNames)this.setData({loserNames:vm.losers.map(w=>presenters.windName(w.value)+' · '+this.data.tableNames[w.value])});
  },
  commit(){this.refreshDisplay();
    if(this._table&&!this.data.tableExpired&&!localTable.saveHand(this._table,this._state))this.toast(translate('native.ui.could_not_save_the_table_hand_draft_scores'));
    if(!this._tableId&&!model.saveDraft(this._state))this.toast(translate('native.ui.storage_is_unavailable_you_can_still_calculate_this'));
  },
  toast(title){wx.showToast({title,icon:'none',duration:2500});},
  noop(){},
  checkpoint(){this._undo=this._undo||[];this._undo.push(model.clone(this._state));if(this._undo.length>30)this._undo.shift();},
  onUndo(){if(!this._undo||!this._undo.length)return;this._state=this._undo.pop();this.commit();},
  onSuit(e){this.setData({currentSuit:e.currentTarget.dataset.suit});this.commit();},
  onRedFive(e){this.setData({redFive:e.detail.value});this.commit();},
  onHeaderHelp(){this.setData({modal:'help'});},
  onOpenIndicators(){this.setData({modal:'indicators',target:'dora'});this.commit();},
  setStep(step){if(Number.isInteger(step)&&step>=0&&step<=2)this.setData({step});},
  onStep(e){this.setStep(Number(e.currentTarget.dataset.step));},
  onStepSwipe(e){this.setStep(Number(e.detail.current));},
  onNext(){if(!this.data.complete){this.toast(translate('native.ui.complete_the_hand_before_setting_round_conditions'));return;}this.setStep(1);},
  onPrevious(){this.setStep(Math.max(0,this.data.step-1));},
  onEditInput(){this.setStep(this.data.result.code==='no-yaku'?1:0);},
  onToggleMelds(){this.setData({meldExpanded:!this.data.meldExpanded});},
  onToggleBonus(){this.setData({bonusExpanded:!this.data.bonusExpanded});},
  onTarget(e){const target=e.currentTarget.dataset.target;if(target==='ura'&&!this._state.riichi)return;this.setData({target});this.commit();},
  onAddTile(e){
    const tile=e.detail.tile,target=this.data.target;
    try{const next=model.clone(this._state);if(target==='hand'){const expected=14-next.melds.length*3;if(next.hand.length>=expected)throw nativeError('native.ui.the_hand_is_full_remove_a_tile_first');next.hand.push(tile);next.winIndex=next.hand.length===expected?next.hand.length-1:-1;}else{if(next[target].length>=5)throw nativeError('native.ui.up_to_5_indicators_are_allowed');next[target].push(tile);}core.validateInventory(core.inventory(next));this.checkpoint();this._state=next;this.commit();}catch(err){this.toast(presenters.errorMessage(err));}
  },
  onSelectWin(e){if(this._state.hand.length!==14-this._state.melds.length*3)return;this._state.winIndex=Number(e.currentTarget.dataset.index);this.commit();},
  onRemoveHand(e){this.checkpoint();const index=Number(e.currentTarget.dataset.index);this._state.hand.splice(index,1);if(this._state.winIndex===index)this._state.winIndex=-1;else if(this._state.winIndex>index)this._state.winIndex--;this.commit();},
  onRemoveIndicator(e){this.checkpoint();this._state[e.currentTarget.dataset.target].splice(Number(e.currentTarget.dataset.index),1);this.commit();},
  onClear(){this.checkpoint();this._state.hand=[];this._state.melds=[];this._state.winIndex=-1;this.setData({target:'hand',step:0,meldExpanded:false});this.commit();},
  onTextMode(){this.setData({textMode:true,modal:'notation',target:'hand'});this.commit();},
  onNotationInput(e){this.setData({notationInput:e.detail.value});},
  onApplyNotation(){try{const next=model.clone(this._state),target=this.data.target;next[target]=core.parseNotation(this.data.notationInput);if(target==='hand'){const expected=14-next.melds.length*3;if(next.hand.length>expected)throw nativeError('native.ui.too_many_hand_tiles_enter_melds_separately');next.winIndex=next.hand.length===expected?next.hand.length-1:-1;}else if(next[target].length>5)throw nativeError('native.ui.up_to_5_indicators_are_allowed');core.validateInventory(core.inventory(next));this.checkpoint();this._state=next;this.setData({modal:'',textMode:false});this.commit();this.toast(translate('native.ui.hand_entered'));}catch(err){this.toast(presenters.errorMessage(err));}},
  onField(e){const {field,value}=e.currentTarget.dataset;if(this._tableId){if(field==='round'){this.toast(translate('native.ui.the_round_wind_follows_the_table_advance_in'));return;}if(field==='riichi'){const paid=this._table&&this._table.riichi[localTable.playerAtWind(this._table,this._state.seat)];if(!!Number(value)!==paid){this.toast(paid?translate('native.ui.the_winner_paid_a_riichi_deposit_keep_riichi'):translate('native.ui.pay_the_riichi_deposit_in_the_lobby_first'));return;}}}model.changeField(this._state,field,value);if(this._tableId&&field==='seat'&&this._table){this._state.riichi=this._table.riichi[localTable.playerAtWind(this._table,this._state.seat)]?1:0;this._state.ippatsu=false;}this.commit();},
  onLoser(e){model.changeField(this._state,'loser',this.data.losers[Number(e.detail.value)].value);this.commit();},
  onIppatsu(e){if(this.data.ippatsuDisabled)return;this._state.ippatsu=e.detail.value;this.commit();},
  onSpecial(e){const type=e.currentTarget.dataset.type,option=this.data.specials.find(s=>s.type===type);if(option&&option.disabled)return;model.setSpecial(this._state,type);this.commit();},
  onCount(e){if(this._tableId){this.toast(translate('native.ui.honba_and_deposits_follow_the_lobby_record'));return;}const key=e.currentTarget.dataset.field;this._state[key]=Math.max(0,Math.min(99,this._state[key]+Number(e.currentTarget.dataset.delta)));this.commit();},
  onCountInput(e){if(this._tableId){this.commit();this.toast(translate('native.ui.honba_and_deposits_follow_the_lobby_record'));return;}const key=e.currentTarget.dataset.field;this._state[key]=Math.max(0,Math.min(99,Math.trunc(Number(e.detail.value)||0)));this.commit();},
  onOpenSheet(e){this.setData({modal:e.currentTarget.dataset.modal});},
  onCloseSheet(){const indicators=this.data.modal==='indicators';this.setData({modal:'',...(indicators?{target:'hand'}:{})});if(indicators)this.commit();},
  onRuleChange(e){this._state.rules[e.currentTarget.dataset.key]=e.detail.value;this.commit();},
  onExample(e){const ex=core.EXAMPLES[Number(e.currentTarget.dataset.index)];this._state={...core.defaultState(),hand:core.parseNotation(ex.hand),winIndex:ex.win,riichi:ex.riichi,dora:ex.dora,ura:[],melds:ex.melds||[],method:ex.method||'ron',rules:this._state.rules};this.setData({target:'hand',modal:''});this.commit();},
  onYaku(e){const row=this.data.result.yaku.find(y=>y.key===e.currentTarget.dataset.key);if(row)this.setData({modal:'yaku',activeYaku:row});},
  onToggleFu(){this.setData({modal:'fu'});},
  onCalculate(){this.commit();this.setStep(2);},
  onSave(){if(!this.data.result.ok)return;const records=model.getHistory();records.unshift({id:Date.now()+'-'+Math.random().toString(36).slice(2,7),date:new Date().toISOString(),state:model.clone(this._state)});if(model.saveHistory(records))this.toast(translate('native.ui.saved_to_hand_history'));else this.toast(translate('native.ui.could_not_save_check_device_storage'));},
  onCopy(){const text=model.copyText(this._state);if(text)wx.setClipboardData({data:text,success:()=>this.toast(translate('native.ui.result_copied'))});},
  onLocalLobby(){const pages=getCurrentPages();if(pages.length>1&&pages[pages.length-2].route==='pages/lobby/index')wx.navigateBack({delta:1});else wx.redirectTo({url:'/pages/lobby/index'});},
  onSettle(){
    if(!this._tableId||this.data.tableExpired||this.data.tableSettled||this._settling)return;
    try{const proposal=localTable.preview(this._state,this._tableExpected);this._settling=true;wx.showModal({title:translate('native.ui.confirm_score_transfer'),content:proposal.displayTitle+'\n'+proposal.rows.map(r=>r.name+' '+r.delta+' → '+r.after).join('\n')+(proposal.pot?'\n'+translate('native.table.award_pot',{points:model.number(proposal.pot)}):''),confirmText:translate('native.ui.confirm_transfer'),success:r=>{if(!r.confirm)return;try{localTable.settle(proposal);this.syncTable();this.commit();this.toast(translate('native.ui.settlement_complete_all_four_scores_updated'));}catch(err){this.toast(presenters.errorMessage(err));}},complete:()=>{this._settling=false;}});}catch(err){this.toast(presenters.errorMessage(err));}
  },
  onPhoto(){getApp().globalData.recognitionBase=model.clone(this._state);wx.navigateTo({url:'/pages/recognize/index'});},
  onGuide(){openModulePage('/pages/guide/index');},
  onOpenMeld(){this.setData({modal:'meld',meldType:'chi',meldTiles:[],meldDirection:'-',directionIndex:0,meldMove:false,meldRequired:3,meldError:''});},
  onMeldType(e){const type=e.currentTarget.dataset.type;this.setData({meldType:type,meldTiles:[],meldRequired:['chi','pon'].includes(type)?3:4,meldError:'',...(type==='chi'?{meldDirection:'-',directionIndex:0}:{})});},
  onMeldTile(e){if(this.data.meldTiles.length>=this.data.meldRequired){this.setMeldError(nativeError('native.ui.this_meld_is_full'));return;}this.setData({meldTiles:this.data.meldTiles.concat([{tile:e.detail.tile,index:this.data.meldTiles.length}]),meldError:''});},
  setMeldError(error){this._meldError=error;this.setData({meldError:presenters.errorMessage(error)});},
  onMeldRemove(e){const tiles=this.data.meldTiles.slice();tiles.splice(Number(e.currentTarget.dataset.index),1);this.setData({meldTiles:tiles.map((t,index)=>({...t,index})),meldError:''});},
  onMeldDirection(e){const index=Number(e.detail.value);this.setData({directionIndex:index,meldDirection:['-','=','+'][index]});},
  onMeldMove(e){this.setData({meldMove:e.detail.value});},
  onConfirmMeld(){try{if(this._state.melds.length>=4)throw nativeError('native.ui.up_to_four_melds_are_allowed');const tiles=this.data.meldTiles.map(t=>t.tile),meld=core.makeMeld(this.data.meldType,tiles,this.data.meldDirection),next=model.clone(this._state);if(this.data.meldMove){for(const tile of tiles){const index=next.hand.indexOf(tile);if(index<0)throw nativeError('native.model.missing_hand_tile',{tileCode:tile});next.hand.splice(index,1);if(next.winIndex===index)next.winIndex=-1;else if(next.winIndex>index)next.winIndex--;}}next.melds.push(meld);core.validateInventory(core.inventory(next));if(/[+=-]/.test(meld)){next.riichi=0;next.ippatsu=false;}this.checkpoint();this._state=next;this.setData({modal:'',meldExpanded:true});this.commit();}catch(err){this.setMeldError(err);}},
  onRemoveMeld(e){this.checkpoint();this._state.melds.splice(Number(e.currentTarget.dataset.index),1);this.commit();},
  onShareAppMessage(){return {title:translate('native.ui.know_the_score_of_every_hand_2'),path:'/pages/calculator/index'};}
}, 'calculator'));
