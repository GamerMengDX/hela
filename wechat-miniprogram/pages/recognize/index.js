const {SUITS,keypadTiles}=require('../../utils/tile-keypad');
const {createTileTap}=require('../../utils/tile-tap');
const {withLocale:withTheme,t,presenters,nativeError}=require('../../utils/locale');
const model=require('../../utils/model');
const {choosePhoto}=require('../../utils/photo-picker');
const {recognizeModelPhoto}=require('../../utils/model-recognition');
const {applyReview}=require('../../utils/photo-review');
const {inferMeldDirection}=require('../../utils/meld-layout');
const TYPES=()=>[{type:'chi',name:t('native.ui.chi')},{type:'pon',name:t('native.ui.pon')},{type:'ankan',name:t('native.ui.closed_kan')},{type:'minkan',name:t('native.ui.open_kan')},{type:'kakan',name:t('native.ui.added_kan')}];
const DIRECTIONS=['-','=','+'],DIRECTION_NAMES=()=>[t('native.ui.left_player'),t('native.ui.opposite_player'),t('native.ui.right_player')];
const sourceReason=reason=>t('native.recognize.source.'+({'吃牌来自上家':'chi','暗杠没有鸣牌来源':'ankan','加杠叠放位置':'stacked'}[reason]||'horizontal'));
const required=type=>['ankan','minkan','kakan'].includes(type)?4:3;
Page(withTheme({
  data:{correctionSuit:'m',correctionRed:false,correctionSuits:SUITS,correctionTiles:[],photoPath:'',recognitionScene:'',examplePhoto:false,busy:false,progress:'',error:'',reviewItems:[],reviewMelds:[],meldMode:'keep',expected:14,winIndex:-1,mode:'correct',uncertainCount:0,validation:'',modal:'',activeIndex:-1,activeMeldIndex:-1,candidates:[],palette:[],showPrivacy:false,meldTypes:TYPES(),meldTypeNames:TYPES().map(t=>t.name),directionNames:DIRECTION_NAMES()},
  onLocaleRefresh(){if(this._progressRef&&this.data.busy)this.setData({progress:t(this._progressRef.key,this._progressRef.params)});if(this._photoError&&this.data.error)this.setData({error:presenters.errorMessage(this._photoError)});this.setData({recognitionScene:this._scene==='majsoul-default'?t('native.ui.mahjong_soul_screenshot_only_your_hand_and_melds'):'',correctionSuits:require('../../utils/tile-keypad').suits(),meldTypes:TYPES(),meldTypeNames:TYPES().map(row=>row.name),directionNames:DIRECTION_NAMES()});if(this._items){this.refreshReview();this.refreshCorrectionKeypad();this.setData({candidates:this.data.candidates.map(row=>({...row,name:presenters.tileName(row.tile)}))});}},
  onLoad(){
    const app=getApp();this._base=app.globalData.recognitionBase?model.clone(app.globalData.recognitionBase):model.restoreDraft();app.globalData.recognitionBase=null;this._requestId=0;this._items=[];this._melds=[];
    this.setData({expected:14-this._base.melds.length*3,palette:model.palette(model.emptyState(),'hand',true),meldCount:this._base.melds.length});
    this._privacyHandler=resolve=>{this._privacyResolve=resolve;this.setData({showPrivacy:true});};
    if(wx.onNeedPrivacyAuthorization)wx.onNeedPrivacyAuthorization(this._privacyHandler);
  },
  onHide(){this._tileTap?.cancel();},
  onUnload(){this._tileTap?.cancel();this._requestId++;this._unloaded=true;if(this._privacyResolve)this._privacyResolve({event:'disagree'});if(wx.offNeedPrivacyAuthorization)wx.offNeedPrivacyAuthorization(this._privacyHandler);this._items=[];this._melds=[];},
  toast(title){wx.showToast({title,icon:'none',duration:2500});},noop(){},
  onCamera(){this.pick('camera');},onAlbum(){this.pick('album');},onExamplePhoto(){this.pick('example');},
  async pick(source){
    if(this.data.busy)return;this._photoError=null;this._scene='';this._progressRef={key:source==='example'?'native.ui.loading_sample_image':'native.ui.choose_photo',params:{}};const request=++this._requestId;this.setData({busy:true,recognitionScene:'',progress:source==='example'?t('native.ui.loading_sample_image'):t('native.ui.choose_photo'),error:''});
    try{
      const path=source==='example'?'/assets/examples/hand-demo.png':await choosePhoto(source);if(this._unloaded||request!==this._requestId)return;
      this._progressRef={key:'native.ui.preparing_recognition',params:{}};this.setData({photoPath:path,examplePhoto:source==='example',progress:t('native.ui.preparing_recognition')});
      const result=await recognizeModelPhoto(this,path,(progress,ref)=>{if(!this._unloaded&&request===this._requestId){this._progressRef=ref||null;this.setData({progress:ref?t(ref.key,ref.params):progress});}});
      if(this._unloaded||request!==this._requestId)return;
      this.acceptResult(result);
    }catch(error){if(!this._unloaded&&request===this._requestId){const message=error.message||error.errMsg||'';if(!/cancel|取消/.test(message)){this._photoError=/auth|permission|privacy/i.test(message)?nativeError('native.ui.camera_or_album_access_was_denied_check_wechat'):error;this.setData({error:presenters.errorMessage(this._photoError)});}}}
    finally{if(!this._unloaded&&request===this._requestId)this.setData({busy:false,progress:''});}
  },
  acceptResult(result){
    this._scene=result.scene;this._items=result.items;this._melds=(result.melds||[]).map(group=>{const source=inferMeldDirection(group.type,group.items);return {...group,include:group.valid!==false,direction:source.direction||group.direction||group.suggestedDirection||'-',directionAutomatic:source.automatic||!!group.directionAutomatic,sourceUncertain:!source.automatic&&!group.directionAutomatic,sourceReason:source.reason};});
    this.setData({meldMode:this._melds.length?'replace':'keep',mode:'correct',recognitionScene:result.scene==='majsoul-default'?t('native.ui.mahjong_soul_screenshot_only_your_hand_and_melds'):''});this.refreshReview(-1);
    this._photoError=this._items.length?null:nativeError('native.ui.no_foreground_hand_found_include_all_your_tile');this.setData({error:this._photoError?presenters.errorMessage(this._photoError):''});
  },
  reviewOptions(){return {mode:this.data.meldMode,melds:this._melds};},
  refreshReview(winIndex=this.data.winIndex){
    this._tileTap?.cancel();
    const meldCount=this.data.meldMode==='replace'?this._melds.filter(g=>g.include).length:this._base.melds.length,expected=14-meldCount*3,complete=this._items.length===expected&&this._items.every(item=>model.core.validTile(item.tile));
    if(!complete)winIndex=-1;else if(winIndex<0||winIndex>=this._items.length)winIndex=this._items.length-1;
    let validation='';try{applyReview(this._base,this._items,winIndex,this.reviewOptions());}catch(error){validation=presenters.errorMessage(error);}
    const viewTile=(item,index)=>({tile:item.tile,index,number:index+1,name:item.tile?presenters.tileName(item.tile):t('native.ui.choose_tile'),uncertain:item.uncertain,manual:item.manual||false,winning:complete&&index===winIndex});
    const entered=this._items.filter(item=>model.core.validTile(item.tile)).length;
    this.setData({reviewSlots:Array.from({length:Math.max(expected,this._items.length)},(_,index)=>({...viewTile(this._items[index]||{},index),empty:!model.core.validTile(this._items[index]?.tile)})),enteredTiles:entered,missingTiles:Math.max(0,expected-entered),canAddHand:entered<expected,totalTiles:entered+meldCount*3});
    this.setData({winIndex,complete,expected,reviewItems:this._items.map(viewTile),reviewMelds:this._melds.map((group,index)=>({...group,index,typeIndex:Math.max(0,TYPES().findIndex(t=>t.type===group.type)),typeName:(TYPES().find(t=>t.type===group.type)||TYPES()[1]).name,directionIndex:Math.max(0,DIRECTIONS.indexOf(group.direction)),directionName:DIRECTION_NAMES()[Math.max(0,DIRECTIONS.indexOf(group.direction))],sourceTag:group.directionAutomatic?t('native.ui.automatic'):group.sourceUncertain?t('native.ui.check_tile'):t('native.ui.editable'),sourceHint:group.directionAutomatic?t('native.recognize.source_auto',{reason:sourceReason(group.sourceReason)}):group.sourceUncertain?t('native.ui.sideways_position_is_unclear_source_defaults_to_the'):t('native.ui.adjust_to_the_actual_meld_source'),required:required(group.type),items:group.items.map((item,n)=>({...viewTile(item,n),winning:false}))})),uncertainCount:this._items.filter(item=>item.uncertain&&!item.manual).length,validation,activeMeldCount:meldCount,capacityText:t('native.recognize.capacity',{count:meldCount,total:entered+meldCount*3}),missingHandText:t('native.recognize.missing_hand',{count:Math.max(0,expected-entered)}),importedMeldsText:t('native.recognize.imported_melds',{count:meldCount}),uncertainText:t('native.recognize.uncertain',{count:this._items.filter(item=>item.uncertain&&!item.manual).length})});
  },
  onMode(e){this._tileTap?.cancel();const mode=e.currentTarget.dataset.mode;if(mode==='win'&&!this.data.complete){this.toast(t('native.ui.complete_the_hand_before_selecting_a_winning_tile'));return;}this.setData({mode});},
  locateReviewItem(item){const index=this._items.indexOf(item);if(index>=0)return {index,group:-1};for(let group=0;group<this._melds.length;group++){const index=this._melds[group].items.indexOf(item);if(index>=0)return {index,group};}},
  tapReviewItem(item){
    if(!this._tileTap)this._tileTap=createTileTap({edit:item=>{const slot=this.locateReviewItem(item);if(slot)this.openCorrection(slot.index,slot.group);},remove:item=>{const slot=this.locateReviewItem(item);if(!slot)return;if(slot.group<0)this._items.splice(slot.index,1);else this._melds[slot.group].items[slot.index]={tile:'',uncertain:true,candidates:[]};this.refreshReview(-1);}});
    this._tileTap.tap(item);
  },
  onReviewTile(e){const index=Number(e.currentTarget.dataset.index);if(this.data.mode==='win'){this.refreshReview(index);return;}this.tapReviewItem(this._items[index]);},
  onMeldTile(e){const index=Number(e.currentTarget.dataset.slot),group=Number(e.currentTarget.dataset.group);if(!model.core.validTile(this._melds[group]?.items[index]?.tile)){this._tileTap?.flush();this.openCorrection(index,group);return;}this.tapReviewItem(this._melds[group].items[index]);},
  openCorrection(index,meldIndex=-1){const item=meldIndex<0?this._items[index]:this._melds[meldIndex]&&this._melds[meldIndex].items[index];if(!item)return;const valid=model.core.validTile(item.tile);this.setData({modal:'correct',activeIndex:index,activeMeldIndex:meldIndex,activeTile:item.tile||'',correctionSuit:valid?item.tile[0]:'m',correctionRed:valid&&item.tile[1]==='0',candidates:(item.candidates||[]).filter(candidate=>model.core.validTile(candidate.tile)).slice(0,3).map(candidate=>({...candidate,name:presenters.tileName(candidate.tile)}))});this.refreshCorrectionKeypad();},
  refreshCorrectionKeypad(){const rows=model.palette(this._base||model.emptyState(),'hand',true),tiles=keypadTiles(rows,this.data.correctionSuit,this.data.correctionRed);this.setData({correctionTitle:t(this.data.activeMeldIndex<0?'native.recognize.correct_hand':'native.recognize.correct_meld',{group:this.data.activeMeldIndex+1,count:this.data.activeIndex+1}),correctionTiles:tiles.map(tile=>({...tile,src:'/assets/tiles/'+tile.tile+'.png'}))});},
  onCorrectionSuit(e){const suit=e.currentTarget.dataset.suit;if(!SUITS.some(item=>item.id===suit))return;this.setData({correctionSuit:suit});this.refreshCorrectionKeypad();},
  onCorrectionRed(e){if(this.data.correctionSuit==='z')return;this.setData({correctionRed:!!e.detail.value});this.refreshCorrectionKeypad();},
  onCorrectionKey(e){this.onCorrectTile({detail:{tile:e.currentTarget.dataset.tile}});},
  onCorrectTile(e){const tile=e.detail.tile,index=this.data.activeIndex,list=this.data.activeMeldIndex<0?this._items:this._melds[this.data.activeMeldIndex].items;if(!model.core.validTile(tile)||!list[index])return;list[index]={...list[index],tile,manual:true,uncertain:false};this.setData({modal:''});this.refreshReview();},
  onCandidate(e){this.onCorrectTile({detail:{tile:e.currentTarget.dataset.tile}});},
  onDelete(e){this._items.splice(Number(e.currentTarget.dataset.index),1);this.refreshReview(-1);},
  onAdd(e){this._tileTap?.flush();if(this._items.filter(item=>model.core.validTile(item.tile)).length>=this.data.expected)return;const index=Number(e?.currentTarget?.dataset?.index),blank=this._items.findIndex(item=>!model.core.validTile(item.tile));if(Number.isInteger(index)&&index>=0&&index<this._items.length&&!model.core.validTile(this._items[index].tile)){this.openCorrection(index);return;}if(blank>=0){this.openCorrection(blank);return;}if(this._items.length>=this.data.expected)return;this._items.push({tile:'',manual:false,uncertain:true,candidates:[]});this.refreshReview();this.openCorrection(this._items.length-1);},
  onMeldMode(e){this.setData({meldMode:e.currentTarget.dataset.mode});this.refreshReview(-1);},
  onMeldInclude(e){const group=this._melds[Number(e.currentTarget.dataset.index)];group.include=!!e.detail.value;this.refreshReview(-1);},
  onMeldType(e){const group=this._melds[Number(e.currentTarget.dataset.index)];group.type=TYPES()[Number(e.detail.value)].type;const source=inferMeldDirection(group.type,group.items),fixed=['chi','ankan'].includes(group.type);if(source.automatic&&(fixed||!group.directionManual)){group.direction=source.direction;group.directionAutomatic=true;group.sourceUncertain=false;group.sourceReason=source.reason;if(fixed)group.directionManual=false;}else group.direction=DIRECTIONS.includes(group.direction)?group.direction:'-';while(group.items.length<required(group.type))group.items.push({tile:'',uncertain:true,candidates:[]});group.items=group.items.slice(0,required(group.type));this.refreshReview(-1);},
  onMeldDirection(e){const group=this._melds[Number(e.currentTarget.dataset.index)],direction=DIRECTIONS[Number(e.detail.value)];if(!direction)return;group.direction=direction;group.directionAutomatic=false;group.directionManual=true;group.sourceUncertain=false;this.refreshReview();},
  onAddMeld(){if(this._melds.length>=4){this.toast(t('native.ui.up_to_4_melds_can_be_recognized'));return;}this._melds.push({type:'pon',items:Array.from({length:3},()=>({tile:'',uncertain:true,candidates:[]})),include:true,direction:'-',directionAutomatic:false});this.setData({meldMode:'replace'});this.refreshReview(-1);},
  onRemoveMeld(e){this._melds.splice(Number(e.currentTarget.dataset.index),1);this.refreshReview(-1);},
  onMeldMove(e){const index=Number(e.currentTarget.dataset.index),other=index+Number(e.currentTarget.dataset.delta);if(other<0||other>=this._melds.length)return;[this._melds[index],this._melds[other]]=[this._melds[other],this._melds[index]];this.refreshReview();},
  onMeldRemoveTile(e){this._melds[Number(e.currentTarget.dataset.group)].items.splice(Number(e.currentTarget.dataset.slot),1);this.refreshReview(-1);},
  onMeldAddTile(e){const index=Number(e.currentTarget.dataset.index),group=this._melds[index];if(group.items.length>=required(group.type)){this.toast(t('native.ui.this_group_is_full_tap_a_tile_to'));return;}group.items.push({tile:'',uncertain:true,candidates:[]});this.refreshReview();this.openCorrection(group.items.length-1,index);},
  onMoveToMeld(){
    const index=this.data.activeIndex,item=this._items[index];if(!item)return;wx.showActionSheet({itemList:[t('native.ui.create_a_new_meld'),...this._melds.map((_,n)=>t('native.recognize.move_meld',{count:n+1}))],success:result=>{let group;if(result.tapIndex===0){if(this._melds.length>=4){this.toast(t('native.ui.up_to_4_melds_are_allowed'));return;}group={type:'pon',items:[],include:true,direction:'-',directionAutomatic:false};this._melds.push(group);}else group=this._melds[result.tapIndex-1];group.include=true;const blank=group.items.findIndex(i=>!i.tile);if(blank<0&&group.items.length>=required(group.type)){this.toast(t('native.ui.that_meld_is_full'));return;}if(blank>=0)group.items[blank]=item;else group.items.push(item);this._items.splice(index,1);this.setData({modal:'',meldMode:'replace'});this.refreshReview(-1);}});
  },
  onMoveToHand(){const group=this._melds[this.data.activeMeldIndex];if(!group)return;this._items.push(group.items.splice(this.data.activeIndex,1)[0]);if(!group.items.length)this._melds.splice(this.data.activeMeldIndex,1);this.setData({modal:''});this.refreshReview(-1);},
  onCloseSheet(){this.setData({modal:''});},onPreview(){if(this.data.photoPath)wx.previewImage({current:this.data.photoPath,urls:[this.data.photoPath]});},
  onConfirm(){
    this._tileTap?.flush();
    try{const state=applyReview(this._base,this._items,this.data.winIndex,this.reviewOptions()),app=getApp();app.globalData.pendingHand=state;app.globalData.pendingHandStep=state.hand.length===14-state.melds.length*3?1:0;
      const pages=getCurrentPages(),previous=pages[pages.length-2];if(previous&&previous.route==='pages/calculator/index')wx.navigateBack({delta:1});else wx.redirectTo({url:'/pages/calculator/index'});
    }catch(error){this.toast(presenters.errorMessage(error));}
  },
  onPrivacyContract(){if(wx.openPrivacyContract)wx.openPrivacyContract({fail:()=>this.toast(t('native.ui.configure_the_privacy_guide_in_the_wechat_console'))});},
  onPrivacyAgree(){if(this._privacyResolve)this._privacyResolve({event:'agree',buttonId:'photo-privacy-agree'});this._privacyResolve=null;this.setData({showPrivacy:false});},
  onPrivacyReject(){if(this._privacyResolve)this._privacyResolve({event:'disagree'});this._privacyResolve=null;this.setData({showPrivacy:false});},
  onShareAppMessage(){return {title:t('native.ui.your_riichi_companion'),path:'/pages/home/index'};}
}, 'recognize'));
