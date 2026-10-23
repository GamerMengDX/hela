import {t as tr} from '../../../src/i18n/index.js';
import {tileName} from '../../../src/i18n/presenters.js';
import {photoDisplayError,photoProgress,photoPhase} from './photo-locale.js';
import {esc,icon,face} from '../ui.js';
import {clone} from '../repository.js';
import {validTile} from '../../../src/engine.js';
import {MELD_TYPES,DIRECTIONS,meldCount,normalizeGroup,reviewStatus,expectedTiles} from './review.js';
import {readPhoto,decodePhoto,photoError,photoDiagnostic} from './photo-source.js';
import {createVisionJournal} from './diagnostics.js';
import {createWebPhotoPicker} from './web-photo-picker.js';
import {inferMeldDirection,createTileTap} from './shared.js';
const button=(action,text,extra='')=>'<button type="button" data-photo-action="'+action+'" '+extra+'>'+text+'</button>';
export class PhotoPage {
  constructor(frame,options){
    this.frame=frame;this.options=options;this.journal=options.journal||createVisionJournal(options.platform,{version:options.version});this.base=clone(options.base);this.items=[];this.melds=[];this.mode=this.base.melds.length?'keep':'replace';this.winIndex=-1;this.selection='correct';this.suit='m';this.red=false;this.generation=0;this.canPick=true;this.picker=options.photoPicker||createWebPhotoPicker(frame.ownerDocument);this.busy=false;this.error='';this.errorDetail=null;this.progress='';
    this.click=e=>{const target=e.target.closest('[data-photo-action]');if(target&&!target.disabled)this.action(target).catch(error=>{if(!this.disposed)this.setError(error);});};
    this.change=e=>{if(e.target.dataset.photoType!==undefined)this.changeMeldType(Number(e.target.dataset.photoType),e.target.value);};
    frame.addEventListener('click',this.click);frame.addEventListener('change',this.change);this.render();
    this.journal.previous().then(previous=>{if(previous&&!this.disposed&&!this.busy){this.interruption=photoPhase(previous.phase);this.render();}});
  }
  dispose(){this.tileTap?.cancel();this.disposed=true;this.generation++;this.picker.dispose();this.image?.dispose();this.frame.querySelector('dialog')?.close();this.frame.removeEventListener('click',this.click);this.frame.removeEventListener('change',this.change);}
  active(generation){return !this.disposed&&generation===this.generation;}
  status(){const status=reviewStatus(this.base,this.items,this.winIndex,{mode:this.mode,melds:this.melds});return {...status,error:status.error?photoDisplayError(status.error):''};}
  updateWin(){const expected=expectedTiles(this.base,this.melds,this.mode);if(this.items.length!==expected)this.winIndex=-1;else if(this.winIndex<0||this.winIndex>=expected)this.winIndex=this.items.length-1;}
  setError(message){this.error=photoDisplayError(message);this.errorDetail=null;this.busy=false;this.render();}
  setProgress(message){message=photoProgress(message);this.progress=message;const label=this.frame.querySelector('[data-photo-progress]');if(label)label.textContent=message;const footer=this.frame.querySelector('[data-photo-footer-progress]');if(footer)footer.textContent=message;}
  async pick(source='gallery'){
    if(this.busy||!this.canPick)return;
    const generation=++this.generation;
    let stage='picker';
    this.error='';this.errorDetail=null;
    try{
      // The Web input is outside the render target and invoked before the first await.
      let selected=this.picker.pick(source);
      this.busy=true;this.progress=source==='camera'?(tr('heybox.photo.waitCamera')):(tr('heybox.photo.waitPicker'));this.render();
      let file=await selected;selected=null;if(!this.active(generation))return;
      this.setProgress({key:'heybox.photo.read'});let data=await readPhoto(file,{onStage:value=>{stage=value;}});if(!this.active(generation))return;
      stage='decode';
      const candidate=await decodePhoto(data);data=null;file=null;if(!this.active(generation)){candidate.dispose();return;}
      this.image?.dispose();this.image=candidate;this.items=[];this.melds=[];this.winIndex=-1;this.mode=this.base.melds.length?'keep':'replace';this.render();
      await this.recognize(generation);
    }catch(error){if(this.active(generation)){this.error=photoDisplayError(photoError(error,{stage}));this.errorDetail=photoDiagnostic(error,stage);this.busy=false;this.render();}}
  }
  async recognize(generation=++this.generation){
    if(!this.image||this.disposed)return;
    this.busy=true;this.error='';this.errorDetail=null;this.interruption='';this.progress=(tr('heybox.photo.prepare'));this.render();
    let run,status='complete';
    try{
      run=await this.journal.begin();
      const {recognizePhoto}=await import('./recognizer.js');if(!this.active(generation))return;
      const result=await recognizePhoto(this.image,{expected:14-this.base.melds.length*3,progress:message=>{if(this.active(generation))this.setProgress(message);},cancelled:()=>!this.active(generation),checkpoint:(phase,pass,segment)=>this.journal.stage(run,phase,pass,segment)});
      if(!this.active(generation))return;
      this.acceptResult(result);
    }catch(error){status=error.name==='AbortError'?'cancelled':'error';if(this.active(generation)){this.error=photoDisplayError(photoError(error));this.errorDetail=photoDiagnostic(error,'recognize');}}
    finally{if(run!==undefined)await this.journal.finish(run,this.active(generation)?status:'cancelled');if(this.active(generation)){this.busy=false;this.render();}}
  }
  acceptResult(result){
    this.items=clone(result.items);this.melds=(result.melds||[]).map(normalizeGroup);this.result=result;this.selection='correct';this.mode=this.base.melds.length?'keep':'replace';this.winIndex=-1;this.updateWin();
    if(!this.items.length)this.error=(tr('heybox.photo.noTiles'));
  }
  tileButton(item,index,group=-1,allowAdd=true){
    const uncertain=!item?.manual&&(item?.uncertain||!validTile(item?.tile));
    if(!validTile(item?.tile))return '<div class="photo-tile-cell empty">'+button(group<0?'add-hand':'tile',('<span aria-hidden="true">＋</span><small>' + esc(tr('heybox.photo.emptySlot')) + '</small>'),'class="photo-empty-slot" data-index="'+index+'" data-group="'+group+'" aria-label="'+esc(tr('heybox.photo.fillLabel',{scope:tr(group<0?'heybox.common.hand':'heybox.common.melds'),index:index+1}))+'" '+(group<0&&!allowAdd?'disabled':''))+'</div>';
    return '<div class="photo-tile-cell">'+button('tile',face(item.tile)+'<small>'+ (group<0&&index===this.winIndex?(tr('heybox.common.winTile')):index+1)+'</small>','class="photo-tile '+(uncertain?'uncertain ':'')+(group<0&&index===this.winIndex?'winning':'')+'" data-index="'+index+'" data-group="'+group+'" aria-label="'+esc(tr('heybox.photo.tileLabel',{scope:tr(group<0?'heybox.common.hand':'heybox.common.melds'),index:index+1,tile:tileName(item.tile)}))+'"')+'</div>';
  }
  preview(){
    if(!this.image)return '<div class="photo-empty"><div class="photo-library">'+icon('image')+('</div><h2>' + esc(tr('heybox.photo.emptyTitle')) + '</h2><p>' + esc(tr('heybox.photo.emptyDescription')) + '<br>' + esc(tr('heybox.photo.emptyDescription2')) + '</p><div class="photo-example">')+face('m2')+face('m3')+face('m4')+'<span>…</span>'+face('s8')+'</div></div>';
    const w=this.image.width,h=this.image.height,draw=(item,meld)=>{const b=item.box;if(!b||![b.x,b.y,b.width,b.height].every(Number.isFinite))return '';return '<rect x="'+b.x+'" y="'+b.y+'" width="'+b.width+'" height="'+b.height+'" class="'+(meld?'meld-box':'hand-box')+'"/>';};
    return '<div class="photo-preview-wrap"><img src="'+this.image.url+('" alt="' + esc(tr('heybox.photo.selectedAlt')) + '"><svg class="photo-boxes" viewBox="0 0 ')+w+' '+h+'" aria-hidden="true">'+this.items.map(item=>draw(item,false)).join('')+this.melds.flatMap(g=>g.items.map(item=>draw(item,true))).join('')+'</svg>'+button('zoom',(tr('heybox.photo.zoom')),'class="photo-zoom-trigger"')+'</div>';
  }
  review(){
    if(!this.image&&!this.items.length)return '';
    const status=this.status(),entered=this.items.filter(i=>validTile(i.tile)).length,groups=(14-status.expected)/3,missing=Math.max(0,status.expected-entered),uncertain=this.items.filter(i=>!i.manual&&i.uncertain).length;
    return (this.result?.scene==='majsoul-default'?('<p class="summary-note">' + esc(tr('heybox.photo.majsoul')) + '</p>'):'')+('<section class="photo-review card"><div class="row"><h2>' + esc(tr('heybox.common.hand')) + ' ')+entered+' / '+status.expected+'</h2>'+button('add-hand',(tr('heybox.photo.addHand')),'class="quiet-link photo-add-hand" '+(!missing?'disabled':'')+'')+'</div><p class="summary-note">'+esc(tr('heybox.photo.reviewCount',{groups,total:entered+groups*3}))+(uncertain?esc(tr('heybox.photo.uncertain',{count:uncertain})):'')+'</p><div class="photo-modes">'+button('selection',(tr('heybox.photo.correct')),'class="control '+(this.selection==='correct'?'selected':'')+'" data-value="correct"')+button('selection',(tr('heybox.teaching.setWin')),'class="control '+(this.selection==='win'?'selected':'')+'" data-value="win" '+(entered!==status.expected?'disabled':'')+'')+'</div><p class="summary-note">'+(this.selection==='win'?(tr('heybox.photo.chooseWin')):(tr('heybox.photo.tapHint')))+'</p><div class="photo-hand">'+Array.from({length:Math.max(status.expected,this.items.length)},(_,index)=>this.tileButton(this.items[index],index,-1,missing>0)).join('')+'</div><p class="summary-note">'+(missing?tr('heybox.photo.missing',{count:missing}):(tr('heybox.photo.defaultWin')))+'</p></section>'+
    ('<section class="photo-review card"><div class="row"><h2>' + esc(tr('heybox.common.meldAndKan')) + '</h2>')+button('add-meld',(tr('heybox.photo.add')),'class="quiet-link photo-add-meld" '+(this.melds.length>=4?'disabled':'')+'')+'</div>'+
    (this.base.melds.length?'<div class="photo-modes">'+button('meld-mode',tr('heybox.photo.keep',{count:this.base.melds.length}),'class="control '+(this.mode==='keep'?'selected':'')+'" data-value="keep"')+button('meld-mode',(tr('heybox.photo.usePhotoMelds')),'class="control '+(this.mode==='replace'?'selected':'')+'" data-value="replace"')+'</div>':'')+
    (this.mode==='keep'?('<p class="summary-note">' + esc(tr('heybox.photo.keepNote')) + '</p>'):
      (this.melds.length?this.melds.map((group,index)=>this.meldView(group,index)).join(''):('<p class="summary-note">' + esc(tr('heybox.photo.noMelds')) + '</p>')))+'</section>'+
    '<p class="photo-validation" role="status">'+esc(status.error||(tr('heybox.photo.confirmHint')))+'</p>';
  }
  meldView(group,index){
    const name=tr('heybox.common.'+group.type)||(tr('heybox.photo.pending')),source=({'-':'previous','=':'across','+':'next'}[group.direction]?tr('heybox.common.'+{'-':'previous','=':'across','+':'next'}[group.direction]):'');
    return '<article class="photo-meld '+(group.include===false?'excluded':'')+'"><div class="row"><strong>'+esc(tr('heybox.common.groupIndex',{count:index+1}))+' · '+name+'</strong>'+button('include-meld',group.include===false?(tr('heybox.photo.excluded')):(tr('heybox.photo.included')),'class="photo-small-button" data-index="'+index+'" aria-pressed="'+(group.include!==false)+'"')+'</div><p class="summary-note">'+esc(group.type==='ankan'?(tr('heybox.photo.closedSource')):source?(group.directionAutomatic?(tr('heybox.photo.autoSource')):(tr('heybox.photo.sourcePrefix')))+source:(tr('heybox.photo.sourceUnknown')))+'</p><div class="photo-meld-tiles">'+group.items.map((item,n)=>this.tileButton(item,n,index)).join('')+'</div><div class="photo-meld-actions">'+button('meld-settings',(tr('heybox.photo.settings')),'class="photo-small-button" data-index="'+index+'"')+button('move-meld',(tr('heybox.photo.up')),'class="photo-small-button" data-index="'+index+'" data-delta="-1" '+(!index?'disabled':'')+'')+button('move-meld',(tr('heybox.photo.down')),'class="photo-small-button" data-index="'+index+'" data-delta="1" '+(index===this.melds.length-1?'disabled':'')+'')+button('delete-meld',(tr('heybox.common.remove')),'class="photo-small-button" data-index="'+index+'"')+'</div></article>';
  }
  render(){
    if(this.disposed)return;
    this.tileTap?.cancel();
    const scroll=this.frame.querySelector('.photo-content')?.scrollTop||0,status=this.status();
    this.frame.innerHTML=this.options.header()+('<div class="photo-content"><div class="web-notices" data-web-notices>'+((this.options.notices&&this.options.notices())||'')+'</div><div class="page-heading"><h1>' + esc(tr('heybox.photo.title')) + '</h1><p>' + esc(tr('heybox.photo.description')) + '</p></div><p class="photo-first-load">' + esc(tr('heybox.photo.firstLoad')))+'</p>'+(this.interruption?'<div class="notice">'+esc(tr('heybox.photo.interrupted',{stage:this.interruption}))+'</div>':'')+this.preview()+
    (this.error?'<div class="notice photo-error" role="alert">'+esc(this.error)+(this.errorDetail?('<details class="photo-error-details"><summary>' + esc(tr('heybox.photo.details')) + '</summary><p>')+esc(photoPhase(this.errorDetail.stage))+' · '+esc(this.errorDetail.code)+(this.options.version?' · 和啦 '+esc(this.options.version):'')+'</p></details>':'')+'</div>':'')+
    (this.busy?'<div class="photo-progress" role="status"><span class="photo-spinner" aria-hidden="true"></span><span data-photo-progress>'+esc(this.progress)+'</span></div>':'<div class="photo-source-actions">'+button('pick',icon('image')+(this.image?(tr('heybox.photo.repick')):(tr('heybox.photo.pick'))),'class="control" '+(!this.canPick?'disabled':'')+'')+button('camera',icon('camera')+(tr('heybox.photo.camera')),'class="control" '+(!this.canPick?'disabled':'')+'')+(this.image?button('recognize',(tr('heybox.photo.retry')),'class="control"'):'')+'</div>')+
    (!this.busy?this.review():'')+('<p class="photo-privacy-note">' + esc(tr('heybox.photo.privacy')) + '<br>' + esc(tr('heybox.photo.privacy2')) + '</p></div><footer class="app-footer photo-footer"><p class="photo-footer-message" ')+(this.busy?'data-photo-footer-progress':'')+'>'+esc(this.busy?this.progress:this.error||(!this.image?(tr('heybox.photo.startHint')):status.error||(status.complete?(tr('heybox.photo.backHint')):tr('heybox.photo.partial',{count:status.expected-this.items.length}))))+'</p><div class="photo-footer-buttons">'+button('back',(tr('heybox.photo.back')),'class="control"')+button('import',this.busy?(tr('heybox.photo.busy')):tr('heybox.photo.import')+' '+icon('check'),'class="primary" '+(this.busy||!status.state?'disabled':'')+'')+('</div></footer><dialog class="sheet photo-dialog" aria-label="' + esc(tr('heybox.photo.correctLabel')) + '"><div class="sheet-inner"><div class="sheet-head"><h2>' + esc(tr('heybox.photo.checkTitle')) + '</h2>')+button('close',icon('close'),('class="icon-button" aria-label="' + esc(tr('heybox.common.close')) + '"'))+'</div><div class="sheet-body" id="photo-dialog-content"></div></div></dialog>';
    this.frame.querySelector('.photo-content').scrollTop=scroll;
  }
  open(body,title=(tr('heybox.photo.checkTitle'))){
    const dialog=this.frame.querySelector('.photo-dialog');dialog.querySelector('h2').textContent=title;dialog.querySelector('#photo-dialog-content').innerHTML=body;if(!dialog.open)dialog.showModal();
  }
  close(){this.frame.querySelector('.photo-dialog')?.close();}
  openTile(index,group=-1){this.tileTap?.cancel();this.edit={index,group};const tile=group<0?this.items[index]?.tile:this.melds[group]?.items[index]?.tile;this.suit=validTile(tile)?tile[0]:'m';this.red=!!tile&&tile[1]==='0';this.renderTileDialog();}
  locateItem(item){const index=this.items.indexOf(item);if(index>=0)return {index,group:-1};for(let group=0;group<this.melds.length;group++){const index=this.melds[group].items.indexOf(item);if(index>=0)return {index,group};}}
  tapItem(item){if(!this.tileTap)this.tileTap=createTileTap({edit:item=>{const slot=this.locateItem(item);if(slot)this.openTile(slot.index,slot.group);},remove:item=>{const slot=this.locateItem(item);if(!slot)return;if(slot.group<0)this.items.splice(slot.index,1);else this.melds[slot.group].items[slot.index]={tile:'',uncertain:true};this.updateWin();this.render();}});this.tileTap.tap(item);}
  addHand(index){this.tileTap?.flush();const expected=expectedTiles(this.base,this.melds,this.mode);if(this.items.filter(item=>validTile(item.tile)).length>=expected)return;const blank=this.items.findIndex(item=>!validTile(item.tile));if(Number.isInteger(index)&&index>=0&&index<this.items.length&&!validTile(this.items[index].tile)){this.openTile(index);return;}if(blank>=0){this.openTile(blank);return;}if(this.items.length>=expected)return;this.openTile(this.items.length);}
  renderTileDialog(){
    const {index,group}=this.edit,item=group<0?this.items[index]:this.melds[group].items[index],candidates=(item?.candidates||[]).filter(c=>validTile(c.tile)).slice(0,3);
    const suits='<div class="suits">'+['m','p','s','z'].map((id,n)=>button('suit',[(tr('heybox.common.man')),(tr('heybox.common.pin')),(tr('heybox.common.sou')),(tr('heybox.common.honors'))][n],'class="suit '+(this.suit===id?'selected':'')+'" data-value="'+id+'" aria-pressed="'+(this.suit===id)+'"')).join('')+'</div>';
    const tiles=Array.from({length:this.suit==='z'?7:9},(_,n)=>this.suit+(n===4&&this.red&&this.suit!=='z'?'0':n+1));
    const body=('<div class="photo-correction-toolbar"><span>' + esc(tr('heybox.photo.selectTile')) + '</span>')+button('red',(esc(tr('heybox.common.redFive')) + ' <span class="photo-red-switch" aria-hidden="true"></span>'),'class="photo-red '+(this.red?'selected':'')+'" role="switch" aria-checked="'+this.red+'" '+(this.suit==='z'?'disabled':'')+'')+'</div><div class="photo-correction-keyboard">'+suits+'<div class="photo-correction-grid">'+tiles.map(tile=>button('correct',face(tile),'class="tile-key '+(tile===item?.tile?'selected':'')+'" data-value="'+tile+'" aria-label="'+esc(tr('heybox.photo.changedTile',{tile:tileName(tile)}))+'"')).join('')+'</div></div>'+(candidates.length?('<span class="field-label">' + esc(tr('heybox.photo.candidates')) + '</span><div class="photo-candidates">')+candidates.map(c=>button('correct',face(c.tile),'class="control" data-value="'+c.tile+'" aria-label="'+esc(tr('heybox.photo.changedTile',{tile:tileName(c.tile)}))+'"')).join('')+'</div>':'')+
    (item?'<div class="photo-correction-actions">'+button(group<0?'delete-hand':'delete-meld-tile',(tr('heybox.photo.deleteTile')),'class="control"')+button(group<0?'to-meld':'to-hand',group<0?(tr('heybox.photo.toMeld')):(tr('heybox.photo.toHand')),'class="control"')+'</div>':'');
    this.open(body,group<0?(item?tr('heybox.photo.handIndex',{index:index+1}):(tr('heybox.photo.addOne'))):tr('heybox.photo.meldTileIndex',{group:group+1,index:index+1}));
  }
  correct(tile){
    if(!validTile(tile))return;const {index,group}=this.edit;
    if(group<0){const item={...(this.items[index]||{}),tile,manual:true,uncertain:false};if(index>=this.items.length)this.items.push(item);else this.items[index]=item;}
    else this.melds[group].items[index]={...this.melds[group].items[index],tile,manual:true,uncertain:false};
    this.close();this.updateWin();this.error='';this.render();
  }
  meldSettings(index){
    this.settingsIndex=index;const group=this.melds[index];
    this.open(('<label class="field-label">' + esc(tr('heybox.photo.meldType')) + '</label><select class="text-input" data-photo-type="')+index+'">'+MELD_TYPES.map(t=>'<option value="'+t.id+'" '+(t.id===group.type?'selected':'')+'>'+tr('heybox.common.'+t.id)+'</option>').join('')+'</select>'+(!['chi','ankan'].includes(group.type)?('<label class="field-label">' + esc(tr('heybox.photo.source')) + '</label><div class="options">')+DIRECTIONS.map(d=>button('direction',tr('heybox.common.'+{'-':'previous','=':'across','+':'next'}[d.id]),'class="option '+(d.id===group.direction?'selected':'')+'" data-value="'+d.id+'" data-index="'+index+'"')).join('')+'</div>':'<p class="summary-note">'+(group.type==='chi'?(tr('heybox.photo.chiSource')):(tr('heybox.photo.ankanSource')))+'</p>')+('<p class="summary-note">' + esc(tr('heybox.photo.sourceNote')) + '</p>')+button('done-settings',(tr('heybox.common.done')),'class="primary"'),tr('heybox.photo.meldIndex',{index:index+1}));
  }
  changeMeldType(index,type){
    const group=this.melds[index];if(!group||!MELD_TYPES.some(t=>t.id===type))return;
    group.type=type;group.items=Array.from({length:meldCount(type)},(_,n)=>group.items[n]||{tile:'',uncertain:true});
    const source=inferMeldDirection(type,group.items);
    if(['chi','ankan'].includes(type)||(!group.directionManual&&source.automatic)){group.direction=source.direction;group.directionAutomatic=source.automatic;}else if(!DIRECTIONS.some(d=>d.id===group.direction)){group.direction='';group.directionAutomatic=false;}
    this.updateWin();this.meldSettings(index);
  }
  async action(target){
    const d=target.dataset,index=Number(d.index),group=Number(d.group);
    if(d.photoAction==='pick')return this.pick('gallery');
    if(d.photoAction==='camera')return this.pick('camera');
    if(d.photoAction==='back'){this.tileTap?.cancel();return this.options.back();}
    if(d.photoAction==='close'){this.close();return;}
    if(d.photoAction==='zoom'){this.open('<div class="photo-zoom-scroll"><img src="'+this.image.url+('" alt="' + esc(tr('heybox.photo.originalAlt')) + '" style="width:')+Math.max(800,Math.min(1800,this.image.width))+('px"></div><p class="summary-note">' + esc(tr('heybox.photo.zoomNote')) + '</p>'),(tr('heybox.photo.zoomTitle')));return;}
    if(this.busy)return;
    if(d.photoAction==='recognize')return this.recognize();
    if(d.photoAction==='import'){this.tileTap?.flush();const status=this.status();if(!status.state)throw new Error(status.error);this.busy=true;this.render();try{await this.options.import(status.state);}catch(error){this.busy=false;throw error;}return;}
    if(d.photoAction==='selection'){this.selection=d.value;this.render();return;}
    if(d.photoAction==='tile'){const item=group<0?this.items[index]:this.melds[group]?.items[index];if(group<0&&this.selection==='win'){this.winIndex=index;this.render();}else if(!validTile(item?.tile)){this.tileTap?.flush();this.openTile(index,group);}else this.tapItem(item);return;}
    if(d.photoAction==='add-hand'){this.addHand(d.index===undefined?undefined:index);return;}
    if(d.photoAction==='suit'){if(!['m','p','s','z'].includes(d.value))return;this.suit=d.value;this.renderTileDialog();return;}
    if(d.photoAction==='red'){if(this.suit==='z')return;this.red=!this.red;this.renderTileDialog();return;}
    if(d.photoAction==='correct'){this.correct(d.value);return;}
    if(d.photoAction==='meld-mode'){this.mode=d.value;this.updateWin();this.render();return;}
    if(d.photoAction==='add-meld'){this.mode='replace';this.melds.push(normalizeGroup({type:'pon',items:[],direction:''},this.melds.length));this.updateWin();this.render();return;}
    if(d.photoAction==='include-meld'){this.melds[index].include=this.melds[index].include===false;this.updateWin();this.render();return;}
    if(d.photoAction==='delete-meld'){this.melds.splice(index,1);this.updateWin();this.render();return;}
    if(d.photoAction==='move-meld'){const to=index+Number(d.delta);[this.melds[index],this.melds[to]]=[this.melds[to],this.melds[index]];this.render();return;}
    if(d.photoAction==='meld-settings'){this.meldSettings(index);return;}
    if(d.photoAction==='direction'){Object.assign(this.melds[index],{direction:d.value,directionManual:true,directionAutomatic:false});this.meldSettings(index);return;}
    if(d.photoAction==='done-settings'){this.close();this.updateWin();this.render();return;}
    if(d.photoAction==='delete-hand'){const slot=d.index===undefined?this.edit?.index:index;if(!Number.isInteger(slot)||slot<0||slot>=this.items.length)return;this.items.splice(slot,1);this.close();this.updateWin();this.render();return;}
    if(d.photoAction==='delete-meld-tile'){const slot=d.index===undefined?this.edit?.index:index,meld=d.group===undefined?this.edit?.group:group;if(!this.melds[meld]?.items[slot])return;this.melds[meld].items[slot]={tile:'',uncertain:true};this.close();this.render();return;}
    if(d.photoAction==='to-meld'){
      this.open(('<p class="summary-note">' + esc(tr('heybox.photo.moveQuestion')) + '</p>')+this.melds.map((g,n)=>button('move-to-group',tr('heybox.common.groupIndex',{count:n+1})+' · '+(tr('heybox.common.'+g.type)),'class="control full" data-index="'+n+'" '+(g.items.every(i=>i.tile)?'disabled':'')+'')).join('')+button('move-to-group',(tr('heybox.photo.newMeld')),'class="control full" data-index="-1" '+(this.melds.length>=4?'disabled':'')+''),(tr('heybox.photo.toMeld')));return;
    }
    if(d.photoAction==='move-to-group'){
      const [item]=this.items.splice(this.edit.index,1);this.mode='replace';
      if(index<0)this.melds.push(normalizeGroup({type:'pon',items:[item],direction:''},this.melds.length));
      else{const g=this.melds[index],slot=g.items.findIndex(i=>!i.tile);if(slot>=0)g.items[slot]=item;}
      this.close();this.updateWin();this.render();return;
    }
    if(d.photoAction==='to-hand'){
      const expected=expectedTiles(this.base,this.melds,this.mode);if(this.items.length>=expected)throw Object.assign(new Error(tr('heybox.photo.handFull')),{messageRef:{key:'heybox.photo.handFull'}});
      const g=this.melds[this.edit.group],item=g.items[this.edit.index];this.items.push(item);g.items[this.edit.index]={tile:'',uncertain:true};if(g.items.every(i=>!i.tile))g.include=false;
      this.close();this.updateWin();this.render();
    }
  }
}
