const {t,nativeError}=require('./locale');
const model=require('./model');
function applyReview(base,items,winIndex,options={}){
  const next=model.clone(base);
  if(options.mode==='replace'){
    const groups=(options.melds||[]).filter(group=>group.include!==false);if(groups.length>4)throw nativeError('native.ui.up_to_4_melds_are_allowed');
    next.melds=groups.map((group,index)=>{if(!['chi','pon','ankan','minkan','kakan'].includes(group.type))throw nativeError('native.photo.choose_the_type_for_meld_count',{count:index+1});if(!['chi','ankan'].includes(group.type)&&!['-','=','+'].includes(group.direction))throw nativeError('native.photo.invalid_source_for_meld_count',{count:index+1});const tiles=(group.items||[]).map(item=>item.tile);if(tiles.some(tile=>!model.core.validTile(tile)))throw nativeError('native.photo.meld_count_still_has_unknown_tiles',{count:index+1});return model.core.makeMeld(group.type,tiles,group.direction||'-');});
    if(next.melds.some(m=>/[+=-]/.test(m))){next.riichi=0;next.ippatsu=false;}
    if(next.melds.length&&next.special==='first')next.special='none';
    if(next.special==='rinshan'&&!next.melds.some(m=>model.core.meldTiles(m).length===4))next.special='none';
  }
  const expected=14-next.melds.length*3;
  if(!items.length)throw nativeError('native.photo.recognize_or_add_hand_tiles_first');
  if(items.length>expected)throw nativeError('native.photo.with_these_melds_the_hand_allows_count_tiles_remove_extras',{count:expected});
  if(items.some(item=>!model.core.validTile(item.tile)))throw nativeError('native.photo.some_tiles_are_unknown_tap_a_question_mark_to_choose');
  next.hand=items.map(item=>item.tile);next.winIndex=next.hand.length===expected?winIndex:-1;
  if(next.hand.length===expected&&(!Number.isInteger(winIndex)||winIndex<0||winIndex>=expected))throw nativeError('native.photo.choose_the_winning_tile_first');
  model.core.validateInventory(model.core.inventory(next));model.core.syncWinningTile(next);return next;
}
module.exports={applyReview};
