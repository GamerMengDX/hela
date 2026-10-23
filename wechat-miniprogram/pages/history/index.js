const {withLocale:withTheme,t,presenters}=require('../../utils/locale');
const {openScorePage}=require('../../utils/navigation');
const model=require('../../utils/model');
Page(withTheme({
  data:{records:[]},
  onLocaleRefresh(){this.refresh();},
  onShow(){this.refresh();},
  refresh(){this._records=model.getHistory();this.setData({records:this._records.map((record,index)=>{const result=model.core.calculate(record.state);const date=new Date(record.date);return {id:record.id||record.date+'-'+index,index,number:String(this._records.length-index).padStart(2,'0'),date:[t('native.history.date',{month:date.getMonth()+1,day:date.getDate()}),String(date.getHours()).padStart(2,'0')+':'+String(date.getMinutes()).padStart(2,'0')].join(' '),tiles:model.tilesView(record.state.hand),melds:record.state.melds.map((m,index)=>({index,tiles:model.tilesView(model.core.meldTiles(m))})),wind:presenters.windName(record.state.seat),method:record.state.method==='ron'?t('native.ui.ron'):t('native.ui.tsumo'),points:result.ok?model.number(result.defen):'—',yaku:result.ok?result.hupai.map(y=>presenters.yakuInfo(y.name)[0]).join(' · '):t('native.ui.recalculate')};})});},
  onLoadHand(e){const record=this._records[Number(e.currentTarget.dataset.index)];if(!record)return;getApp().globalData.pendingHand=model.clone(record.state);openScorePage('/pages/calculator/index');},
  onDelete(e){const index=Number(e.currentTarget.dataset.index);wx.showModal({title:t('native.ui.delete_this_hand'),content:t('native.ui.deletes_this_calculation_from_this_device'),confirmText:t('native.ui.delete'),confirmColor:'#b65e4c',success:({confirm})=>{if(!confirm)return;const records=model.getHistory();records.splice(index,1);model.saveHistory(records);this.refresh();}});},
  onClear(){wx.showModal({title:t('native.ui.clear_all_hand_history'),content:t('native.history.clear_content',{count:this._records.length}),confirmText:t('native.ui.clear'),confirmColor:'#b65e4c',success:({confirm})=>{if(!confirm)return;model.saveHistory([]);this.refresh();}});},
  onStart(){openScorePage('/pages/calculator/index');},
  onShareAppMessage(){return {title:t('native.ui.know_the_score_of_every_hand_2'),path:'/pages/calculator/index'};}
}, 'history'));
