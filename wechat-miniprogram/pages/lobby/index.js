const {withLocale:withTheme,t,presenters,nativeError}=require('../../utils/locale');
const table=require('../../utils/local-table');
const {emptyState}=require('../../utils/model');
Page(withTheme({
  data:{table:null,setup:true,names:[1,2,3,4].map(index=>t('native.lobby.player'+index)),initial:'25000',recordsExpanded:false,showDraw:false,tenpai:[false,false,false,false],error:''},
  tableDisplay(value){const projected=table.view(value);if(projected)projected.handProgress=t('native.table.hand_progress',{count:value.handNo,phase:t(value.phase==='playing'?'native.ui.in_progress':'native.ui.settled')});return projected;},
  onLocaleRefresh(){if(this.data.error&&this._lastError)this.setData({error:presenters.errorMessage(this._lastError)});if(!this._table&&!this._namesEdited)this.setData({names:[1,2,3,4].map(index=>t('native.lobby.player'+index))});if(this._table)this.setData({table:this.tableDisplay(this._table)});},
  onLoad(){this.refresh();},
  onShow(){this.refresh();},
  refresh(){try{this._table=table.read();this.setData({table:this.tableDisplay(this._table),setup:!this._table,error:''});}catch(err){this.showError(err);}},
  showError(error){this._lastError=error;this.setData({error:presenters.errorMessage(error)});},
  toast(title){wx.showToast({title,icon:'none',duration:2500});},
  onName(e){this._namesEdited=true;const names=this.data.names.slice();names[Number(e.currentTarget.dataset.index)]=e.detail.value;this.setData({names,error:''});},
  onInitial(e){this.setData({initial:e.detail.value,error:''});},
  onCreate(){try{const value=String(this.data.initial).trim();if(!/^\d+$/.test(value))throw nativeError('native.ui.enter_starting_points_in_steps_of_1_000');const create=()=>{try{this._table=table.create(this.data.names,Number(value));this.setData({setup:false,recordsExpanded:false,showDraw:false});this.refresh();}catch(err){this.showError(err);}};if(this._table)wx.showModal({title:t('native.ui.start_a_new_table'),content:t('native.ui.the_current_scores_and_transfers_will_be_replaced'),confirmText:t('native.ui.start_a_new_table'),success:r=>{if(r.confirm)create();}});else create();}catch(err){this.showError(err);}},
  onSetup(){this.setData({setup:true,names:this._table?this._table.players.map(p=>p.name):this.data.names,initial:this._table?String(this._table.initial):this.data.initial,error:''});},
  onCancelSetup(){this.setData({setup:false,error:''});},
  onCalculate(){if(!this._table||this._table.phase!=='playing')return;wx.navigateTo({url:'/pages/calculator/index?table='+encodeURIComponent(this._table.id)});},
  onRiichi(e){const index=Number(e.currentTarget.dataset.index);if(!this._table)return;const expected=table.snapshot(this._table);wx.showModal({title:t('native.ui.pay_riichi_deposit'),content:t('native.table.riichi_payment',{name:this._table.players[index].name}),confirmText:t('native.ui.confirm_riichi'),success:r=>{if(!r.confirm)return;try{table.deposit(index,expected);this.refresh();}catch(err){this.toast(presenters.errorMessage(err));}}});},
  onRecords(){this.setData({recordsExpanded:!this.data.recordsExpanded});},
  onUndo(){if(!this._table)return;const expected=table.snapshot(this._table);wx.showModal({title:t('native.ui.undo_hand_settlement'),content:t('native.ui.reverses_this_hand_s_transfers_and_awarded_pot'),confirmText:t('native.ui.undo_settlement'),success:r=>{if(!r.confirm)return;try{table.undo(expected);this.refresh();}catch(err){this.toast(presenters.errorMessage(err));}}});},
  onCopy(){if(this._table)wx.setClipboardData({data:table.exportText(this._table),success:()=>this.toast(t('native.ui.transfers_copied'))});},
  onNext(e){if(!this._table)return;const repeat=e.currentTarget.dataset.repeat==='yes',expected=table.snapshot(this._table);wx.showModal({title:repeat?t('native.ui.next_hand_with_same_dealer'):t('native.ui.next_hand_with_new_dealer'),content:repeat?t('native.ui.the_current_dealer_continues_and_honba_increases_by'):t('native.ui.the_next_player_becomes_dealer_honba_resets_after'),confirmText:t('native.ui.advance_to_next_hand'),success:r=>{if(!r.confirm)return;try{table.nextHand(repeat,expected);this.refresh();}catch(err){this.toast(presenters.errorMessage(err));}}});},
  onDraw(){if(!this._table||this._table.phase!=='playing')return;this.setData({showDraw:!this.data.showDraw,tenpai:this._table.riichi.slice()});},
  onTenpai(e){const tenpai=this.data.tenpai.slice();tenpai[Number(e.currentTarget.dataset.index)]=!tenpai[Number(e.currentTarget.dataset.index)];this.setData({tenpai});},
  onConfirmDraw(){const expected=table.snapshot(this._table),tenpai=this.data.tenpai.slice();wx.showModal({title:t('native.ui.confirm_draw_settlement'),content:t('native.ui.split_the_3_000_point_noten_payment_by'),confirmText:t('native.ui.confirm_settlement'),success:r=>{if(!r.confirm)return;try{table.draw(tenpai,expected);this.setData({showDraw:false});this.refresh();}catch(err){this.toast(presenters.errorMessage(err));}}});},
  onShareAppMessage(){return {title:t('native.ui.local_scorekeeping_for_four'),path:'/pages/lobby/index'};}
}, 'lobby'));
