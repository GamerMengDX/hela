import {t as tr} from '../../src/i18n/index.js';
import {teachingSnapshot} from '../../src/i18n/presenters.js';
import {createTeachingBrowser} from '../../src/teaching.js';
import {esc,icon,face} from './ui.js';
const action=(name,value='')=>' data-teaching-action="'+name+'" data-value="'+esc(String(value))+'"';
function fullRow(tiles,exercise=null){
  return '<div class="teaching-full-row">'+tiles.map(tile=>{
    const button=exercise&&tile.kind==='hand',tag=button?'button':'span';
    return '<'+tag+(button?' type="button"'+action(tile.empty?'input-hand':'hand',tile.index)+' aria-label="'+esc(tile.empty?(tr('heybox.teaching.fillTile')):tile.name+(exercise.winMode?(tr('heybox.teaching.setWinSuffix')):(tr('heybox.teaching.removeSuffix'))))+'"':'')+' class="teaching-strip-tile '+(tile.winning?'winning ':'')+(tile.empty?'empty-slot ':'')+(tile.groupStart?'meld-start':'')+'"><span class="teaching-strip-box">'+(tile.empty?'<span class="teaching-plus">+</span>':'<img class="teaching-strip-image" src="./assets/tiles/'+tile.tile+'.png" alt="'+esc(tile.name+(tile.winning?(tr('heybox.teaching.winSuffix')):''))+'">')+'</span>'+(tile.winning?('<span class="teaching-strip-win">' + esc(tr('heybox.common.winTile')) + '</span>'):'')+'</'+tag+'>';
  }).join('')+'</div>';
}
function listHTML(model){
  return ('<p class="teaching-eyebrow">HELA · LEARN BY PLAYING</p><h1>' + esc(tr('heybox.teaching.title')) + '</h1><p class="teaching-intro">' + esc(tr('heybox.teaching.intro')) + '</p><div class="teaching-filters">')+model.categories.map(c=>'<button type="button" class="'+(model.category===c.id?'selected':'')+'"'+action('filter',c.id)+'>'+c.name+'</button>').join('')+'</div>'+model.examples.map(example=>
    '<button type="button" class="teaching-case '+(model.selectedIndex===example.index?'selected':'')+'"'+action('select',example.index)+'><span class="teaching-case-heading"><strong>'+esc(example.name)+'</strong>'+icon('arrow')+'</span><span class="teaching-muted">'+esc(example.description)+'</span>'+fullRow(example.tiles)+'<span class="teaching-case-bottom"><span class="teaching-muted">'+esc(tr('heybox.teaching.handCount',{count:example.handCount}))+(example.meldCount?esc(tr('heybox.teaching.meldCount',{count:example.meldCount})):'')+'</span><span class="teaching-case-score">'+esc(example.summary)+' · '+esc(example.points)+(' ' + esc(tr('heybox.common.points')) + '</span></span></button>')).join('');
}
function contextText(context){return context.round+' · '+context.seat+'（'+context.role+'）· '+context.method+' · '+context.riichi+(context.special?' · '+context.special:'');}
function detailHTML(detail){
  const context=detail.context,score=detail.score;
  const melds=detail.meldSummary.map(summary=>('<p class="teaching-meld-summary">' + esc(tr('heybox.copy.melds')))+esc(summary)+'</p>').join('');
  const bonus=detail.dora.length?('<section class="teaching-section"><h3>' + esc(tr('heybox.common.dora')) + '</h3>')+detail.dora.map(tile=>'<div class="teaching-bonus">'+face(tile.tile)+'<span class="teaching-muted">'+esc(tr('heybox.teaching.indicator',{tile:tile.name,actual:tile.actualName}))+'</span></div>').join('')+'</section>':'';
  return ('<p class="teaching-eyebrow">' + esc(tr('heybox.teaching.detailEyebrow')) + '</p><h1>')+esc(detail.name)+'</h1><div class="teaching-context-action"><div><p class="teaching-intro">'+esc(detail.description)+'</p><p class="teaching-context">'+esc(contextText(context))+('</p></div><button type="button" class="teaching-entry" aria-label="' + esc(tr('heybox.teaching.tryLabel')) + '"')+action('try')+'>'+icon('compose')+('<span>' + esc(tr('heybox.teaching.try')) + '</span></button></div>')+
    ('<section class="teaching-section"><h3>' + esc(tr('heybox.teaching.completeHand')) + ' <small>')+esc(tr('heybox.teaching.physical',{count:detail.physicalCount}))+'</small></h3>'+fullRow(detail.rowTiles)+('<p class="teaching-row-legend">' + esc(tr('heybox.common.winTile')) + '：')+esc(detail.winTileName)+'</p>'+melds+'</section>'+bonus+
    '<section class="teaching-result"><p class="teaching-muted">'+esc(context.role+' · '+context.method+(score.limit?' · '+score.limit:''))+'</p><strong>'+esc(score.total)+('<small>' + esc(tr('heybox.common.points')) + '</small></strong><p>')+esc(score.summary)+'</p></section>'+
    ('<section class="teaching-section"><h3>' + esc(tr('heybox.teaching.yaku')) + '</h3>')+score.yaku.map(yaku=>'<div class="teaching-yaku"><div class="teaching-row"><span>'+esc(yaku.name)+'</span><span>'+esc(yaku.label)+'</span></div><p class="teaching-muted">'+esc(yaku.description)+'</p></div>').join('')+'</section>'+
    ('<section class="teaching-section"><h3>' + esc(tr('heybox.teaching.fu')) + '</h3>')+score.fuDetails.map(row=>'<div class="teaching-row"><span>'+esc(row.name)+'</span><span>'+(row.fu===null?'—':row.fu+' '+tr('heybox.common.fu'))+'</span></div>').join('')+'</section>'+
    ('<section class="teaching-section"><h3>' + esc(tr('heybox.teaching.payments')) + '</h3>')+score.payments.map(payment=>'<div class="teaching-row"><span>'+esc(payment.label)+'</span><span>'+esc(payment.amount)+(' ' + esc(tr('heybox.common.points')) + '</span></div>')).join('')+'</section><button type="button" class="teaching-try full"'+action('try')+('>' + esc(tr('heybox.teaching.build')) + '</button><p class="teaching-end">' + esc(tr('heybox.teaching.fixed')) + '</p>');
}
function exerciseHTML(ex){
  const goal=ex.goal,feedback=ex.feedback;
  return ('<p class="teaching-eyebrow">' + esc(tr('heybox.teaching.practiceEyebrow')) + '</p><h1>')+esc(goal.name)+'</h1><p class="teaching-intro">'+esc(goal.description)+('<br>' + esc(tr('heybox.teaching.goalNote')) + '</p><div class="teaching-goal"><div class="teaching-tags">')+goal.targets.map(t=>'<span>'+esc(t.name)+'</span>').join('')+'</div><p class="teaching-muted">'+esc(contextText(goal.context))+'</p>'+(goal.indicators.length?('<p class="teaching-muted">' + esc(tr('heybox.teaching.fixedIndicators')))+esc(goal.indicators.map(t=>t.name).join('、'))+'</p>':'')+'</div>'+
  ('<section class="teaching-section"><div class="teaching-row teaching-tray-heading"><strong>' + esc(tr('heybox.teaching.yourHand')) + ' ')+ex.handCount+' / '+ex.expected+'</strong><div class="teaching-tools"><button type="button"'+action('undo')+(ex.canUndo?'':' disabled')+('>' + esc(tr('heybox.common.undo')) + '</button><button type="button"')+action('clear')+(!ex.handCount&&!ex.meldCount&&!ex.draftTiles.length?' disabled':'')+('>' + esc(tr('heybox.common.clear')) + '</button></div></div>')+fullRow(ex.rowTiles,ex)+'<div class="teaching-row"><span class="teaching-muted">'+(ex.winMode?(tr('heybox.teaching.chooseWin')):ex.remaining?tr('heybox.teaching.remaining',{count:ex.remaining}):(tr('heybox.teaching.full')))+'</span><button type="button" class="teaching-mini '+(ex.winMode?'selected':'')+'"'+action('win')+(ex.remaining?' disabled':'')+('>' + esc(tr('heybox.teaching.setWin')) + '</button></div>')+ex.groups.map(g=>'<div class="teaching-row"><span class="teaching-muted">'+esc(g.name+' · '+g.text)+'</span><button type="button" class="teaching-mini"'+action('remove-meld',g.index)+('>' + esc(tr('heybox.common.remove')) + '</button></div>')).join('')+(ex.target!=='meld'?'<button type="button" class="teaching-mini"'+action('begin-meld')+(ex.meldCount>=4?' disabled':'')+('>' + esc(tr('heybox.teaching.addMeld')) + '</button>'):'')+'</section>'+
  (ex.target==='meld'?('<section class="teaching-section teaching-meld-editor"><h3>' + esc(tr('heybox.teaching.buildMeld')) + ' <small>')+ex.draftTiles.length+' / '+ex.required+'</small></h3><div class="teaching-group-types">'+ex.groupTypes.map(t=>'<button type="button" class="'+(ex.meldType===t.id?'selected':'')+'"'+action('meld-type',t.id)+'>'+t.name+'</button>').join('')+'</div><div class="teaching-draft">'+ex.draftTiles.map(t=>'<button type="button"'+action('draft-remove',t.index)+(' aria-label="' + esc(tr('heybox.common.remove')))+t.name+'">'+face(t.tile)+'</button>').join('')+'<span class="teaching-muted">'+(ex.draftTiles.length?(tr('heybox.teaching.tapRemove')):(tr('heybox.teaching.padHint')))+'</span></div><div class="teaching-row"><button type="button" class="teaching-mini"'+action('cancel-meld')+('>' + esc(tr('heybox.common.cancel')) + '</button><button type="button" class="teaching-try"')+action('confirm-meld')+(ex.draftTiles.length===ex.required?'':' disabled')+('>' + esc(tr('heybox.teaching.confirmMeld')) + '</button></div></section>'):'')+
  '<section class="teaching-section teaching-keyboard"><div class="teaching-row"><span class="teaching-muted">'+(ex.target==='meld'?(tr('heybox.teaching.intoMeld')):(tr('heybox.teaching.intoHand')))+'</span><button type="button" class="teaching-mini '+(ex.red?'selected':'')+'"'+action('red')+(ex.suit==='z'?' disabled':'')+'>'+ (ex.red?'●':'○')+(' ' + esc(tr('heybox.common.redFive')) + '</button></div><div class="teaching-suits">')+[['m',(tr('heybox.common.man'))],['p',(tr('heybox.common.pin'))],['s',(tr('heybox.common.sou'))],['z',(tr('heybox.common.honors'))]].map(([id,name])=>'<button type="button" class="'+(ex.suit===id?'selected':'')+'"'+action('suit',id)+'>'+name+'</button>').join('')+'</div><div class="teaching-key-grid">'+ex.palette.map(t=>'<button type="button" class="teaching-key"'+action('add',t.tile)+(t.disabled?' disabled':'')+' aria-label="'+t.name+'">'+face(t.tile)+(t.count?'<small>'+t.count+' / 4</small>':'')+'</button>').join('')+'</div></section>'+
  (ex.error?'<div class="teaching-feedback failure" role="status">'+esc(ex.error)+'</div>':'')+
  (feedback?'<section class="teaching-feedback '+(feedback.correct?'success':'failure')+'" role="status"><h3>'+esc(feedback.title)+'</h3><p>'+esc(feedback.message)+'</p>'+(feedback.detail?'<p class="teaching-feedback-score">'+esc(feedback.detail.score.total+' '+tr('heybox.common.points')+' · '+feedback.detail.score.summary)+'</p>'+feedback.detail.score.yaku.map(y=>'<div class="teaching-row"><span>'+esc(y.name)+'</span><span>'+esc(y.label)+'</span></div>').join(''):'')+'</section>':'')+
  ('<p class="teaching-end">' + esc(tr('heybox.teaching.end')) + '</p>');
}
// A separate page with private learning state; no calculator, draft or repository access.
export class TeachingPage {
  constructor(root,{header=()=>'',back=()=>{}}={}){
    this.root=root;this.header=header;this.back=back;this.browser=createTeachingBrowser();this.listScroll=0;
    this.onClick=event=>{
      const button=event.target.closest('[data-teaching-action]');if(!button||button.disabled)return;
      const name=button.dataset.teachingAction;let value=button.dataset.value,model;
      const scroll=this.root.querySelector('.teaching-scroll'),previous=this.browser.snapshot().stage,top=scroll?.scrollTop||0;
      if(previous==='list')this.listScroll=top;
      if(name==='back'){if(previous==='list'){this.back();return;}model=this.browser.back();}
      else if(name==='select')model=this.browser.select(Number(value));
      else if(name==='filter'){this.listScroll=0;model=this.browser.filter(value);}
      else if(name==='try')model=this.browser.try();
      else {if(['hand','remove-meld','draft-remove'].includes(name))value=Number(value);model=this.browser.exercise(name,value);}
      this.render(model);
      const next=this.root.querySelector('.teaching-scroll');
      next.scrollTop=name==='filter'?0:model.stage===previous?top:model.stage==='list'?this.listScroll:0;
      if(name==='judge')this.root.querySelector('.teaching-feedback')?.scrollIntoView({block:'nearest'});
    };
    root.addEventListener('click',this.onClick);this.render(this.browser.open());
  }
  dispose(){this.root.removeEventListener('click',this.onClick);this.browser.close();}
  render(model){
    model=teachingSnapshot(model);
    this.root.innerHTML='<div class="teaching-page">'+this.header()+'<div class="teaching-page-nav"><button type="button" class="teaching-back"'+action('back')+'>‹ '+(model.stage==='list'?(tr('heybox.nav.guide')):model.stage==='practice'?(tr('heybox.teaching.analysis')):(tr('heybox.teaching.list')))+'</button><span class="teaching-muted">'+(model.stage==='list'?tr('heybox.teaching.count',{count:model.total}):model.stage==='practice'?(tr('heybox.teaching.practice')):(model.selectedIndex+1)+' / '+model.total)+'</span></div><div class="teaching-scroll"><div class="teaching-content">'+(model.stage==='list'?listHTML(model):model.stage==='detail'?detailHTML(model.detail):exerciseHTML(model.exercise))+'</div></div>'+(model.stage==='practice'?'<footer class="teaching-footer"><button type="button" class="teaching-mini"'+action('back')+('>' + esc(tr('heybox.teaching.view')) + '</button><button type="button" class="teaching-try"')+action('judge')+('>' + esc(tr('heybox.teaching.judge')) + '</button></footer>'):'')+'</div>';
  }
}
