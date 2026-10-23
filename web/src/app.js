import {createLocaleAdapter,setDocumentLanguage,errorText as errorMessage,uiError} from './locale.js';
import {windName,yakuInfo as displayYaku,kindLabel,practiceFields as displayPracticeFields} from '../../src/i18n/presenters.js';
import {t,current,configureLocale,initialize,setLocale} from '../../src/i18n/index.js';
import {HandEntry} from './calculator.js';
import {TeachingPage} from './teaching-view.js';
import {PHOTO_ENABLED,loadPhotoPage} from './photo-slot.js';
import {APP_VERSION} from './version.js';
import {webText} from './web-strings.js';
import {appIconSrc} from './assets.js';
import {LEGAL,sourceArchive} from './legal.js';
import {THEMES,getTheme,normalizeTheme,applyTheme,themeDisplay} from './themes.js';
import {platform} from './platform.js';
import {createRepository,emptyState,restoreState,clone} from './repository.js';
import {createTableService} from './local-table.js';
import {calculate,parseNotation,WINDS,notation} from '../../src/engine.js';
import {YAKU,GUIDE_HAN,yakuInfo} from '../../src/data.js';
import {generatePractice,practiceFields,checkPractice} from '../../src/practice.js';
import {esc,num,icon,face,handView,copyResult} from './ui.js';

class HelaApp {
  constructor(root) {
    this.root=root;
    this.repo=createRepository(platform);
    this.table=createTableService(this.repo);
    this.theme='moon';
    this.view='home';
    this.draft=emptyState();
    this.ready=false;
    this.guideQuery='';
    this.guideFilter='all';
    this.practice=null;
    this.tableMode=false;
    this.busy=false;
    root.innerHTML=('<section class="app-frame refined"><div id="page"><div class="startup"><span class="startup-mark">和啦</span><p>' + esc(t('heybox.common.loading')) + '</p></div></div><dialog id="app-dialog" class="sheet" aria-label="和啦"><div id="app-dialog-content"></div></dialog><div id="app-toast" class="toast" role="status" hidden></div></section>');
    this.frame=root.querySelector('.app-frame');
    this.page=root.querySelector('#page');
    this.dialog=root.querySelector('#app-dialog');
    root.addEventListener('click',e=>{
      const submitButton=e.target.closest('button[type="submit"]');
      if(submitButton?.form&&root.contains(submitButton)&&!submitButton.disabled){
        e.preventDefault();
        if(submitButton.form.reportValidity())this.submit(submitButton.form).catch(error=>this.message(errorMessage(error)||(t('heybox.common.failed'))));
        return;
      }
      const button=e.target.closest('[data-app-action]');
      if(button&&!button.disabled)this.action(button).catch(error=>this.message(errorMessage(error)||(t('heybox.common.failed'))));
    });
    root.addEventListener('submit',e=>{e.preventDefault();this.submit(e.target).catch(error=>this.message(errorMessage(error)||(t('heybox.common.failed'))));});
    root.addEventListener('input',e=>{
      if(e.target.id==='guide-search'){this.guideQuery=e.target.value;this.renderGuide(true);}
      if(e.target.dataset.answer&&this.practice)this.practice.answers[e.target.dataset.answer]=e.target.value;
    });
    this.start();
    root.addEventListener('keydown',event=>{const control=event.target.closest('[data-app-action=locale]');if(!control||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const controls=[...root.querySelectorAll('[data-app-action=locale]')],index=controls.indexOf(control),next=event.key==='Home'?0:event.key==='End'?controls.length-1:(index+(event.key==='ArrowRight'?1:-1)+controls.length)%controls.length;controls[next].focus();this.action(controls[next]).catch(()=>this.message(t('heybox.common.failed')));});
  }
  async start() {
    try{
      // The browser adapter is ready immediately: no SDK handshake and no
      // preview entry point. A denied storage probe already switched the
      // adapter to session-only mode, which the UI states explicitly.
      await platform.ready();
      if(platform.state().temporary)this.storageTemporary=true;
      configureLocale(createLocaleAdapter(platform));
      const localeResult=await initialize();
      setDocumentLanguage(current());
      if(localeResult?.error)this.localeNotice=true;
      try{
        const data=await this.repo.initialize();
        this.theme=normalizeTheme(data.theme);
        this.draft=restoreState(data.draft);
        this.ready=true;
      }catch{
        // Unreadable or structurally invalid records: keep the app usable, but
        // never claim anything is being persisted from here on. `degradeToSession`
        // also drops the cached bad snapshot, so this retry really starts blank
        // (the stored record itself is left untouched for manual recovery).
        this.storageError=true;
        platform.degradeToSession();
        this.storageTemporary=true;
        this.repo=createRepository(platform);
        this.table=createTableService(this.repo);
        try{
          const data=await this.repo.initialize();
          this.theme=normalizeTheme(data.theme);
          this.draft=restoreState(data.draft);
          this.ready=true;
        }catch{
          // Second failure: keep the shell usable, writes stay reported as failed.
          this.storageError=true;
        }
      }
    }catch{
      this.storageError=true;
    }
    setDocumentLanguage(current());
    applyTheme(this.theme);
    if(!PHOTO_ENABLED)this.photoDisabled=true;
    this.stopExternal=platform.onExternalChange(()=>{
      // Another tab wrote newer records: stop writing here and say so. Views that
      // own their DOM (calculator, teaching, photo) get an in-place notice so the
      // hand being entered on screen is not thrown away by a re-render.
      this.storageStale=true;
      this.message(webText('web.storage.stale'));
      if(!this.refreshNotices()&&['home','guide','practice','lobby','history'].includes(this.view))this.render();
    });
    this.render();
    this.markReady();
    platform.ready().then(()=>{
      this.syncTheme();
      const viewport=info=>{
        const area=info.safeArea;
        if(!area)return;
        const values={top:area.top,right:info.windowWidth-area.right,bottom:info.windowHeight-area.bottom,left:area.left};
        for(const [edge,value] of Object.entries(values))if(Number.isFinite(value))document.documentElement.style.setProperty('--safe-area-'+edge,Math.max(0,value)+'px');
      };
      platform.windowInfo().then(viewport).catch(()=>{});
      this.stopViewport=platform.onViewport(viewport);
      this.stopShow=platform.onShow(()=>{setDocumentLanguage(current());this.syncTheme();});
    }).catch(()=>{});
    window.addEventListener('pagehide',()=>{this.repo.flush();this.stopShow?.();this.stopViewport?.();this.stopExternal?.();},{once:true});
  }
  markReady() {
    // Ready marker for the startup guard in web/index.html. It is set only after
    // the first screen really rendered, so a startup failure keeps its readable
    // status line while a working app never sees it (and later interaction
    // errors never replace what is already on screen).
    try{document.documentElement.setAttribute('data-hela-ready','true');}catch{}
    try{document.dispatchEvent(new Event('hela:ready'));}catch{}
  }
  syncTheme() {
    const theme=applyTheme(this.theme);
    platform.navigationStyle(theme.foreground).catch(()=>{});
    this.root.querySelector('.theme-trigger')?.setAttribute('aria-label',t('heybox.theme.current',{theme:themeDisplay(theme).name}));
  }
  header(title='') {
    return ('<header class="app-nav"><button type="button" class="brand" data-app-action="home" aria-label="' + esc(t('heybox.nav.homeLabel')) + '"><span class="brand-avatar-mask"><img class="brand-avatar" src="'+appIconSrc()+'" alt=""></span></button><div class="nav-tools"><button type="button" id="theme-trigger" class="theme-trigger" data-app-action="themes" aria-label="')+esc(t('heybox.theme.current',{theme:themeDisplay(getTheme(this.theme)).name}))+'">'+icon('palette')+('<span>' + esc(t('heybox.nav.theme')) + '</span></button><button type="button" id="help-trigger" class="icon-button help-trigger" data-app-action="help" aria-label="' + esc(t('heybox.nav.help')) + '">')+icon('help')+'</button></div></header>';
  }
  message(text) {
    let node=document.querySelector('dialog[open] .dialog-message');
    if(!node){
      const dialog=document.querySelector('dialog[open]');
      if(dialog){node=document.createElement('div');node.className='dialog-message';node.setAttribute('role','status');dialog.append(node);}
      else node=this.root.querySelector('#app-toast');
    }
    node.textContent=text;node.hidden=false;
    clearTimeout(this.toastTimer);
    this.toastTimer=setTimeout(()=>{node.hidden=true;},2600);
  }
  open(title,body,footer='',subtitle='') {
    const wasOpen=this.dialog.open;
    this.dialog.querySelector('#app-dialog-content').innerHTML='<div class="sheet-inner"><div class="sheet-head"><div><h2>'+esc(title)+'</h2>'+(subtitle?'<p>'+esc(subtitle)+'</p>':'')+('</div><button type="button" class="icon-button" data-app-action="close" aria-label="' + esc(t('heybox.common.close')) + '">')+icon('close')+'</button></div><div class="sheet-body">'+body+'</div>'+(footer?'<div class="sheet-footer">'+footer+'</div>':'')+'</div>';
    if(!wasOpen){
      this.dialog.showModal();
      if(!matchMedia('(prefers-reduced-motion: reduce)').matches)this.dialog.animate([{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'translateY(0)'}],{duration:180,easing:'cubic-bezier(.23,1,.32,1)'});
    }
  }
  close(){if(this.dialog.open)this.dialog.close();}
  async navigate(view,options={}) {
    // Direct navigation to the photo page is refused when the recognition
    // factory is compiled out, not merely hidden from the entry buttons.
    if(view==='photo'&&!PHOTO_ENABLED){this.message(webText('web.photo.unavailable'));return;}
    if(this.view==='guide')this.guideScroll=this.page.querySelector('#view-content')?.scrollTop||0;
    this.teaching?.dispose();this.teaching=null;
    await this.repo.flush();
    this.close();
    this.calc?.dispose();this.calc=null;
    this.photo?.dispose();this.photo=null;
    this.stopPickerDebug?.();this.stopPickerDebug=null;
    this.view=view;
    if(view==='calculator')this.tableMode=options.table===true;
    this.render();
  }
  render() {
    if(this.view==='calculator')return this.renderCalculator();
    if(this.view==='photo')return this.renderPhoto();
    if(this.view==='teaching')return this.renderTeaching();
    const titles={home:'',guide:(t('heybox.nav.guide')),practice:(t('heybox.nav.practice')),lobby:(t('heybox.nav.lobby')),history:(t('heybox.nav.history'))};
    this.page.innerHTML=this.header(titles[this.view])+'<div class="page-content" id="view-content"></div>';
    if(this.view==='home')this.renderHome();
    if(this.view==='guide'){this.page.querySelector('#view-content').classList.add('guide-page-content');this.renderGuide();this.page.querySelector('#view-content').scrollTop=this.guideScroll||0;this.page.insertAdjacentHTML('beforeend',('<footer class="guide-teaching-footer"><button type="button" data-app-action="teaching-examples"><span><strong>' + esc(t('heybox.home.teachingTitle')) + '</strong><small>' + esc(t('heybox.home.teachingDescription')) + '</small></span>')+icon('arrow')+'</button></footer>');}
    if(this.view==='practice')this.renderPractice();
    if(this.view==='lobby')this.renderLobby();
    if(this.view==='history')this.renderHistory();
    this.syncTheme();
  }
  renderTeaching(){this.teaching=new TeachingPage(this.page,{header:()=>this.header((t('heybox.nav.teaching'))),back:()=>this.navigate('guide'),notices:()=>this.notices()});this.syncTheme();}
  notices(){
    const line=(text,action=false)=>'<div class="notice">'+esc(text)+(action?'<button type="button" class="web-notice-action" data-app-action="reload-records">'+esc(webText('web.storage.reload'))+'</button>':'')+'</div>';
    let html='';
    if(this.storageStale)html+=line(webText('web.storage.stale'),true);
    else if(this.storageTemporary)html+=line(this.storageError?(webText('web.storage.unreadable')):(webText('web.storage.temporary')));
    else if(this.storageError)html+=line(t('heybox.storage.unavailable'));
    if(this.localeNotice)html+=line(t('heybox.locale.readFailed'));
    if(!PHOTO_ENABLED)html+=line(webText('web.offline.note'));
    return html;
  }
  /**
   * Licence visibility inside the help sheet. The summary and the source archive
   * name are always visible; the full AGPL/MIT texts stay collapsed so the normal
   * help copy is not buried. Texts are escaped, never injected as markup.
   */
  legalSection(){
    const archive=sourceArchive;
    const details=(summary,body,modifier)=>'<details class="legal-details '+modifier+'"><summary>'+esc(summary)+'</summary><pre class="legal-text" tabindex="0">'+esc(body)+'</pre></details>';
    const body=LEGAL.embedded
      ? details(webText('web.legal.agpl'),LEGAL.agpl,'legal-agpl')+details(webText('web.legal.mit'),LEGAL.mit,'legal-mit')
      : '<p class="summary-note">'+esc(webText('web.legal.missing'))+'</p>';
    return '<section class="legal-block"><h3>'+esc(webText('web.legal.title'))+'</h3><p>'+esc(webText('web.legal.summary'))+'</p><p class="legal-source">'+esc(webText('web.legal.source',current(),{file:archive}))+'</p><p class="summary-note">'+esc(webText('web.legal.note'))+'</p>'+body+'</section>';
  }
  noticeSlot(){return '<div class="web-notices" data-web-notices>'+this.notices()+'</div>';}
  /** Re-render the notice slot in place. Returns false when the view has no slot. */
  refreshNotices(){
    const slot=this.page?.querySelector?.('[data-web-notices]');
    if(!slot)return false;
    slot.innerHTML=this.notices();
    return true;
  }
  content(html){this.page.querySelector('#view-content').innerHTML=this.notices()+html;}
  async copy(text){
    try{await platform.copy(text);this.message((t('heybox.copy.done')));}
    catch{this.manualCopy(text);}
  }
  manualCopy(text){
    this.open(webText('web.copy.title'),('<p class="summary-note">'+esc(webText('web.copy.manual'))+'</p><textarea class="manual-copy" readonly aria-label="'+esc(webText('web.copy.title'))+'">')+esc(text)+'</textarea>',('<button type="button" class="primary" data-app-action="close">'+esc(t('heybox.common.close'))+' ')+icon('check')+'</button>');
    const field=this.dialog.querySelector('.manual-copy');field?.focus?.();field?.select?.();
  }
  localeSwitch(){return '<div class="locale-switch" role="group" aria-label="Language / 言語 / 语言">'+[['zh-CN','中文'],['ja','日本語'],['en','English']].map(([locale,label])=>'<button type="button" data-app-action="locale" data-value="'+locale+'" aria-pressed="'+(current()===locale)+'" class="'+(current()===locale?'selected':'')+'"><span class="locale-label">'+label+'</span></button>').join('')+'</div>'; }
  renderHome() {
    const stats=this.repo.snapshot().practice,table=this.table.read();
    this.content(('<div class="home-intro"><div class="home-meta-row"><p class="eyebrow">' + esc(t('heybox.home.eyebrow')) + '</p>')+this.localeSwitch()+('</div><h1>' + esc(t('heybox.home.title')) + '</h1><p>' + esc(t('heybox.home.description')) + '</p></div>')+
      ('<button type="button" class="feature feature-main" data-app-action="calculator"><div><span class="feature-index">' + esc(t('heybox.home.calculatorIndex')) + '</span><h2>' + esc(t('heybox.home.calculatorTitle')) + '<br>' + esc(t('heybox.home.calculatorSecond')) + '</h2><span class="feature-link">' + esc(t('heybox.home.start')) + ' ')+icon('arrow')+'</span></div><div class="home-tiles" aria-hidden="true">'+face('m5')+face('z7')+'</div></button>'+
      '<button type="button" class="feature feature-guide" data-app-action="guide"><span class="feature-symbol">'+icon('book')+('</span><div><h2>' + esc(t('heybox.nav.guide')) + '</h2><p>' + esc(t('heybox.home.guideDescription')) + '</p></div>')+icon('arrow')+'</button>'+
      '<div class="home-grid"><button type="button" class="feature feature-small" data-app-action="practice">'+icon('target')+('<h2>' + esc(t('heybox.nav.practice')) + '</h2><p>' + esc(t('heybox.home.practiceDescription')) + '</p><small>')+(stats.attempted?esc(t('heybox.home.progress',{count:stats.attempted})):(t('heybox.home.basic')))+'</small></button><button type="button" class="feature feature-small" data-app-action="lobby">'+icon('table')+('<h2>' + esc(t('heybox.nav.lobby')) + '</h2><p>' + esc(t('heybox.home.tableDescription')) + '</p><small>')+(table?esc(this.table.view(table).label):(t('heybox.home.createTable')))+'</small></button></div>'+
      '<button type="button" class="history-link" data-app-action="history">'+icon('history')+(t('heybox.nav.history'))+icon('arrow')+'</button>');
  }
  renderCalculator() {
    let state=clone(this.draft),linked=null;
    if(this.tableMode){
      linked=this.table.read();
      if(!linked||linked.phase!=='playing'){this.view='lobby';return this.render();}
      state=this.table.entryState(linked,this.table.readHand(linked)||emptyState());
      state.riichi=linked.riichi[this.table.playerAtWind(linked,state.seat)]?(state.riichi||1):0;
    }
    this.page.innerHTML=('<div id="calculator" class="calculator"><div id="screen"></div><dialog class="sheet calculator-sheet" aria-label="' + esc(t('heybox.calc.settings')) + '"><div id="sheet-content"></div></dialog><div class="toast" role="status" hidden></div></div>');
    // Storage/conflict state must stay visible while a hand is being entered.
    this.page.insertAdjacentHTML('afterbegin',this.noticeSlot());
    const tableSnapshot=linked?this.table.snapshot(linked):null;
    this.calc=new HandEntry(this.page.querySelector('#calculator'),{
      state,header:()=>this.header(linked?(t('heybox.nav.tableCalculator')):(t('heybox.nav.calculator'))),
      onToast:message=>this.message(message),
      onChange:next=>{
        if(!linked)this.draft=clone(next);
        if(this.ready)(linked?this.table.saveHand(linked,next):this.repo.update(data=>{data.draft=clone(next);})).catch(()=>this.message((t('heybox.storage.draftFailed'))));
      },
      normalizeState:(next,before)=>{
        if(linked){
          next.round=linked.round;next.honba=linked.honba;next.sticks=linked.pot/1000;
          const player=this.table.playerAtWind(linked,next.seat);
          if(next.seat!==before.seat){next.riichi=linked.riichi[player]?1:0;next.ippatsu=false;}
          if(!!next.riichi!==linked.riichi[player])throw uiError(linked.riichi[player]?'heybox.lobby.paidKeep':'heybox.lobby.payFirst');
        }
      },
      onSave:next=>this.saveRecord(next).catch(error=>this.message(errorMessage(error))),
      onCopy:next=>this.copy(copyResult(next)),
      onNotation:()=>this.open((t('heybox.notation.title')),('<form id="notation-form"><label class="field-label" for="notation-input">' + esc(t('heybox.notation.legend')) + '</label><input id="notation-input" name="notation" class="text-input" autocomplete="off" autocapitalize="none" placeholder="' + esc(t('heybox.notation.placeholder')) + '" value="')+esc(notation(this.calc.state.hand))+('"><p class="summary-note">' + esc(t('heybox.notation.note')) + '</p><button type="submit" class="primary">' + esc(t('heybox.notation.confirm')) + ' ')+icon('check')+'</button></form>'),
      ...(PHOTO_ENABLED?{onPhoto:()=>this.openPhoto().catch(error=>this.message(errorMessage(error)))}:{}),
      ...(linked?{onSettle:next=>this.confirmSettlement(next,tableSnapshot)}:{})
    });
    this.syncTheme();
  }
  async openPhoto(){
    if(!PHOTO_ENABLED){this.message(webText('web.photo.unavailable'));return;}
    this.photoBase=clone(this.calc.state);
    this.photoTable=this.tableMode?this.table.snapshot(this.table.read()):null;
    await this.navigate('photo');
  }
  async renderPhoto(){
    if(!PHOTO_ENABLED){this.message(webText('web.photo.unavailable'));this.view='calculator';return this.render();}
    this.page.innerHTML='<div id="photo-page" class="photo-page"></div>';
    // The recognition page (and with it the runtime and the model chunks) is
    // fetched only when a photo flow actually starts.
    const PhotoPage=await loadPhotoPage();
    if(!PhotoPage||this.view!=='photo')return;
    this.photo=new PhotoPage(this.page.querySelector('#photo-page'),{
      base:this.photoBase||emptyState(),platform,version:APP_VERSION,notices:()=>this.notices(),header:()=>this.header((t('heybox.nav.photo'))),
      back:()=>this.navigate('calculator',{table:!!this.photoTable}),
      import:async state=>{
        const next=restoreState(state),linked=this.photoTable;
        if(linked){
          const table=this.table.read();
          if(!table||table.id!==linked.id||table.handNo!==linked.handNo||table.revision!==linked.revision||table.phase!=='playing')throw uiError('heybox.photo.tableUpdated');
          const paid=table.riichi[this.table.playerAtWind(table,next.seat)];
          if(paid&&next.melds.some(m=>/[+=-]/.test(m)))throw uiError('heybox.photo.riichiMeld');
          await this.table.saveHand(table,next);
        }else{
          if(this.ready)await this.repo.update(data=>{data.draft=clone(next);});
          this.draft=clone(next);
        }
        await this.navigate('calculator',{table:!!linked});
        this.message(this.ready?(t('heybox.photo.importDone')):(t('heybox.photo.importNoStorage')));
      }
    });
    this.syncTheme();
  }
  async saveRecord(state) {
    const result=calculate(state);if(!result.ok)throw Object.assign(new Error(result.message),{messageRef:result.messageRef});
    const savedState=restoreState(state);
    await this.repo.update(data=>{
      if(JSON.stringify(data.history[0]?.state)===JSON.stringify(savedState))return;
      data.history.unshift({id:Date.now()+'-'+Math.random().toString(36).slice(2,7),date:new Date().toISOString(),state:savedState});
      data.history=data.history.slice(0,30);
    });
    this.message((t('heybox.history.saved')));
  }
  renderHistory() {
    const records=this.repo.snapshot().history;
    this.content(('<div class="page-heading"><h1>' + esc(t('heybox.nav.history')) + '</h1><p>' + esc(t('heybox.history.local')) + '</p></div>')+(records.length?'<div class="record-list">'+records.map(record=>{
      const result=calculate(record.state);
      return '<article class="card record"><div class="row"><small>'+esc(new Date(record.date).toLocaleString(current()))+'</small><strong>'+ (result.ok?num(result.total)+' '+t('heybox.common.points'):(t('heybox.history.check')))+'</strong></div>'+handView(record.state)+'<button type="button" class="quiet-link" data-app-action="load-record" data-id="'+esc(record.id)+'">'+esc(t('heybox.history.load'))+' '+icon('arrow')+'</button></article>';
    }).join('')+'</div>':'<div class="empty-state">'+icon('history')+('<h2>' + esc(t('heybox.history.emptyTitle')) + '</h2><p>' + esc(t('heybox.history.emptyDescription')) + '</p><button type="button" class="primary" data-app-action="calculator">' + esc(t('heybox.history.start')) + ' ')+icon('arrow')+'</button></div>'));
  }
  renderGuide(focus=false) {
    let cards=Object.entries(YAKU).map(([key,[name,description,kind]])=>({key,name:displayYaku(key)[0],description:displayYaku(key)[1],kind,kindName:kindLabel(kind),aliases:key+name+description,han:kind==='宝牌'?'1':(GUIDE_HAN[key]||t('heybox.guide.yakuman'))}));
    if(this.guideFilter==='yakuman')cards=cards.filter(card=>card.kind==='役满');
    if(this.guideFilter==='closed')cards=cards.filter(card=>card.kind==='门清');
    const query=this.guideQuery.trim();
    if(query)cards=cards.filter(card=>(card.name+card.description+card.aliases).toLocaleLowerCase().includes(query.toLocaleLowerCase()));
    this.content(('<div class="page-heading"><h1>' + esc(t('heybox.nav.guide')) + '</h1><p>' + esc(t('heybox.guide.description')) + '</p></div><label class="search-field"><span>' + esc(t('heybox.guide.search')) + '</span><input id="guide-search" type="search" placeholder="' + esc(t('heybox.guide.placeholder')) + '" value="')+esc(this.guideQuery)+'"></label><div class="filter-tabs">'+[['all',(t('heybox.guide.all'))],['closed',(t('heybox.guide.closed'))],['yakuman',t('heybox.guide.yakuman')]].map(([value,name])=>'<button type="button" class="'+(this.guideFilter===value?'selected':'')+'" data-app-action="guide-filter" data-value="'+value+'">'+name+'</button>').join('')+'</div><div class="guide-list">'+(cards.length?cards.map(card=>'<article class="card guide-card"><div class="row"><h2>'+esc(card.name)+'</h2><span class="tag">'+esc(card.han)+(card.kind==='役满'?'':' '+t('heybox.common.han'))+'</span></div><p>'+esc(card.description)+'</p><small>'+esc(card.kindName)+'</small></article>').join(''):('<p class="empty-caption">' + esc(t('heybox.guide.empty')) + '</p>'))+'</div>');
    if(focus){const input=this.page.querySelector('#guide-search');input.focus({preventScroll:true});input.setSelectionRange(input.value.length,input.value.length);}
  }
  newQuestion(level='basic') {
    this.practice={question:generatePractice(level),answers:{},revealed:false,submitted:false,checks:[]};
  }
  renderPractice() {
    if(!this.practice)this.newQuestion();
    const p=this.practice,s=p.question.state,stats=this.repo.snapshot().practice;
    this.content(('<div class="page-heading row"><div><h1>' + esc(t('heybox.nav.practice')) + '</h1><p>')+esc(t('heybox.practice.progress',{attempted:stats.attempted,correct:stats.correct}))+'</p></div><span class="tag">'+(s.seat===0?(t('heybox.common.dealer')):(t('heybox.common.nonDealer')))+'</span></div><div class="filter-tabs">'+[['basic',(t('heybox.practice.basic'))],['normal',(t('heybox.practice.normal'))],['advanced',(t('heybox.practice.advanced'))]].map(([value,name])=>'<button type="button" class="'+(p.question.level===value?'selected':'')+'" data-app-action="practice-level" data-value="'+value+'">'+name+'</button>').join('')+'</div><article class="card question-card">'+handView(s)+'<div class="question-conditions">'+[t('heybox.common.round',{wind:windName(s.round)}),t('heybox.common.seat',{wind:windName(s.seat)}),s.method==='ron'?(t('heybox.common.ron')):(t('heybox.common.tsumo')),s.method==='ron'?t('heybox.common.discarder',{wind:windName(s.loser)}):'',s.riichi?(t('heybox.common.riichi')):(t('heybox.common.noRiichi')),s.ippatsu?(t('heybox.common.ippatsu')):'',s.special==='last'?(s.method==='ron'?(t('heybox.calc.houtei')):(t('heybox.calc.haitei'))):s.special==='rinshan'?(t('heybox.calc.rinshan')):'',t('heybox.common.honbaCount',{count:s.honba}),t('heybox.common.stickCount',{count:s.sticks})].filter(Boolean).map(esc).join(' · ')+('</div><div class="dora-line">' + esc(t('heybox.common.dora')) + ' ')+s.dora.map(tile=>face(tile,'mini')).join('')+(s.ura.length?' · '+t('heybox.common.ura')+' '+s.ura.map(tile=>face(tile,'mini')).join(''):'')+'</div></article><form id="practice-form" class="practice-form"><div class="answer-grid">'+displayPracticeFields(practiceFields(p.question)).map(field=>'<label><span>'+esc(field.label)+'</span><div class="answer-input"><input inputmode="numeric" pattern="[0-9]*" autocomplete="off" data-answer="'+field.key+'" name="'+field.key+'" value="'+esc(p.answers[field.key]||'')+'" '+(p.revealed?'readonly':'')+'><span>'+field.unit+'</span></div></label>').join('')+'</div>'+(!p.revealed?('<button type="submit" class="primary">' + esc(t('heybox.practice.check')) + ' ')+icon('check')+('</button><button type="button" class="quiet-link" data-app-action="practice-reveal">' + esc(t('heybox.practice.reveal')) + '</button>'):'<div class="answer-feedback">'+(p.submitted?displayPracticeFields(p.checks).map(field=>'<div class="result-row"><span>'+(field.correct?'✓ ':'· ')+esc(field.label)+'</span><span>'+field.expected+' '+field.unit+'</span></div>').join(''):'')+'<p>'+p.question.result.hupai.map(y=>displayYaku(y.name)[0]+' '+y.fanshu+(t('heybox.common.han'))).join(' · ')+'</p><strong>'+num(p.question.result.total)+(' ' + esc(t('heybox.common.points')) + '</strong></div><button type="button" class="primary" data-app-action="practice-next">' + esc(t('heybox.practice.next')) + ' ')+icon('arrow')+'</button>')+'</form>');
  }
  renderLobby() {
    const table=this.table.read();
    if(!table){this.content(('<div class="page-heading"><h1>' + esc(t('heybox.nav.lobby')) + '</h1><p>' + esc(t('heybox.lobby.description')) + '</p></div><form id="table-create-form" class="card"><h2>' + esc(t('heybox.lobby.new')) + '</h2><div class="player-inputs">')+WINDS.map((_,i)=>'<label><span>'+esc(t('heybox.lobby.initialSeat',{wind:windName(i)}))+'</span><input class="text-input" name="player'+i+'" maxlength="12" value="'+esc(t('heybox.common.seat',{wind:windName(i)}))+'" required></label>').join('')+('</div><label class="field-label" for="initial-points">' + esc(t('heybox.lobby.initial')) + '</label><select id="initial-points" name="initial" class="text-input"><option value="25000">25,000 ' + esc(t('heybox.common.points')) + '</option><option value="30000">30,000 ' + esc(t('heybox.common.points')) + '</option></select><p class="summary-note">' + esc(t('heybox.lobby.privacy')) + '</p><button type="submit" class="primary">' + esc(t('heybox.lobby.start')) + ' ')+icon('arrow')+'</button></form>');return;}
    const view=this.table.view(table);
    this.content('<div class="page-heading row"><div><h1>'+esc(view.label)+('</h1><p>' + esc(t('heybox.lobby.local')) + ' · ')+(table.phase==='playing'?(t('heybox.lobby.playing')):(t('heybox.lobby.settled')))+('</p></div><span class="tag">' + esc(t('heybox.common.sticks')) + ' ')+view.potText+'</span></div><div class="players-grid">'+view.players.map(player=>'<article class="card player-card"><div class="row"><span class="wind-badge">'+player.wind+'</span><small>'+(player.dealer?(t('heybox.common.dealer')):(t('heybox.common.nonDealer')))+'</small></div><h2>'+esc(player.name)+'</h2><strong>'+player.pointsText+'</strong><small>'+player.changeText+'</small><button type="button" class="control" data-app-action="deposit" data-index="'+player.index+'" '+(player.riichi||table.phase!=='playing'?'disabled':'')+'>'+(player.riichi?(t('heybox.lobby.paid')):(t('heybox.lobby.pay')))+'</button></article>').join('')+'</div><div class="table-actions">'+(table.phase==='playing'?('<button type="button" class="primary" data-app-action="table-calculator">' + esc(t('heybox.lobby.calculate')) + ' ')+icon('arrow')+('</button><button type="button" class="control" data-app-action="draw">' + esc(t('heybox.lobby.draw')) + '</button>'):('<button type="button" class="primary" data-app-action="next-hand" data-repeat="yes">' + esc(t('heybox.lobby.repeat')) + ' ')+icon('arrow')+('</button><button type="button" class="control" data-app-action="next-hand" data-repeat="no">' + esc(t('heybox.lobby.rotate')) + '</button><button type="button" class="quiet-link" data-app-action="undo-settlement">' + esc(t('heybox.lobby.undo')) + '</button>'))+'</div><details class="card table-records"><summary>'+esc(t('heybox.lobby.recordCount',{count:view.records.length}))+'</summary>'+view.records.map(record=>'<div class="ledger-row"><small>'+esc(record.label)+'</small><p>'+esc(record.title)+(record.voided?(t('heybox.lobby.voided')):'')+'</p><span>'+record.players.map(player=>esc(player.name)+' '+player.delta).join(' · ')+'</span></div>').join('')+('</details><div class="table-secondary"><button type="button" class="quiet-link" data-app-action="export-table">' + esc(t('heybox.lobby.export')) + '</button><button type="button" class="quiet-link" data-app-action="new-table">' + esc(t('heybox.lobby.new')) + '</button></div>'));
  }
  confirm(title,text,action) {
    this.confirmAction=action;
    this.open(title,'<p class="body-copy">'+esc(text).replaceAll('\n','<br>')+'</p>',('<button type="button" class="primary" data-app-action="confirm">' + esc(t('heybox.common.confirm')) + ' ')+icon('check')+('</button><button type="button" class="quiet-link" data-app-action="close">' + esc(t('heybox.common.cancel')) + '</button>'));
  }
  confirmSettlement(state,expected) {
    try{
      const proposal=this.table.preview(state,expected);
      this.confirm((t('heybox.lobby.settleTitle')),this.table.displayProposal(proposal).title+'\n'+proposal.rows.map(row=>row.name+' '+row.delta+' → '+row.after).join('\n'),async()=>{
        await this.table.settle(proposal);
        await this.navigate('lobby');this.message((t('heybox.lobby.booked')));
      });
    }catch(error){this.message(errorMessage(error));}
  }
  async action(button) {
    const d=button.dataset;
    // A fast tap on a module must enter it in the language still being saved.
    if(d.appAction!=='locale'&&this.localePending)await this.localePending;
    if(d.appAction==='locale'){
      const pending=setLocale(d.value);this.localePending=pending;
      const result=await pending;
      if(this.localePending===pending)this.localePending=null;
      if(result?.ok===false){this.message(t('heybox.locale.writeFailed'));return;}
      setDocumentLanguage(current());
      if(this.view==='home'){
        this.render();
        this.page.querySelector('[data-app-action="locale"][data-value="'+current()+'"]')?.focus?.({preventScroll:true});
      }
      return;
    }
    if(d.appAction==='teaching-examples')return this.navigate('teaching');
    if(['home','calculator','guide','practice','lobby','history'].includes(d.appAction))return this.navigate(d.appAction);
    if(d.appAction==='close'){this.close();return;}
    if(d.appAction==='themes'){
      this.open((t('heybox.theme.title')),('<div class="theme-options" role="radiogroup" aria-label="' + esc(t('heybox.theme.label')) + '">')+THEMES.map(themeDisplay).map(theme=>'<button type="button" class="theme-option '+(theme.id===this.theme?'selected':'')+'" role="radio" aria-checked="'+(theme.id===this.theme)+'" data-app-action="choose-theme" data-value="'+theme.id+'"><span class="theme-preview" style="--preview-bg:'+theme.background+';--preview-surface:'+theme.surface+';--preview-accent:'+theme.accent+'"><i></i><i></i><i></i></span><span><strong>'+theme.name+'</strong><small>'+theme.description+'</small></span><span class="theme-check">'+(theme.id===this.theme?icon('check'):'')+'</span></button>').join('')+('</div><p class="summary-note">' + esc(t('heybox.theme.note')) + '</p>'));return;
    }
    if(d.appAction==='choose-theme'){
      if(this.busy)return;
      this.busy=true;const previous=this.theme;this.theme=normalizeTheme(d.value);this.syncTheme();
      try{await this.repo.update(data=>{data.theme=this.theme;});this.close();this.message(t('heybox.theme.changed',{theme:themeDisplay(getTheme(this.theme)).name}));}
      catch(error){this.theme=previous;this.syncTheme();throw error;}
      finally{this.busy=false;}
      return;
    }
    if(d.appAction==='help'){
      this.open((t('heybox.nav.help')),('<div class="help-copy"><h3>' + esc(t('heybox.help.flowTitle')) + '</h3><p>' + esc(t('heybox.help.flow')) + '</p><h3>' + esc(t('heybox.help.meldTitle')) + '</h3><p>' + esc(t('heybox.help.meld')) + '</p><h3>' + esc(t('heybox.help.themeTitle')) + '</h3><p>' + esc(t('heybox.help.theme')) + '</p><h3>' + esc(t('heybox.nav.photo')) + '</h3><p>' + esc(t('heybox.help.photo')) + '</p><h3>' + esc(t('heybox.lobby.local')) + '</h3><p>' + esc(t('heybox.help.table')) + '</p></div>')+this.legalSection(),('<button type="button" class="primary" data-app-action="close">' + esc(t('heybox.common.gotIt')) + ' ')+icon('check')+'</button>');return;
    }
    if(d.appAction==='guide-filter'){this.guideFilter=d.value;this.renderGuide();return;}
    if(d.appAction==='practice-level'){this.newQuestion(d.value);this.renderPractice();return;}
    if(d.appAction==='practice-next'){this.newQuestion(this.practice.question.level);this.renderPractice();return;}
    if(d.appAction==='practice-reveal'){this.practice.revealed=true;this.renderPractice();return;}
    if(d.appAction==='load-record'){
      const record=this.repo.snapshot().history.find(item=>item.id===d.id);if(!record)return;
      this.draft=restoreState(record.state);
      await this.repo.update(data=>{data.draft=clone(this.draft);});
      return this.navigate('calculator');
    }
    if(d.appAction==='table-calculator')return this.navigate('calculator',{table:true});

    if(d.appAction==='export-table'){
      const text=this.table.exportText(this.table.read());
      this.open((t('heybox.lobby.records')),('<p class="summary-note">' + esc(t('heybox.lobby.exportNote')) + '</p><textarea class="export-record" aria-label="' + esc(t('heybox.lobby.records')) + '" readonly>')+esc(text)+'</textarea>',('<button type="button" class="primary" data-app-action="copy-table">' + esc(t('heybox.lobby.copy')) + ' ')+icon('check')+'</button>');return;
    }
    if(d.appAction==='copy-table'){
      const text=this.dialog.querySelector('.export-record').value;
      if(text.length>10000)throw uiError('heybox.lobby.copyLong');
      await this.copy(text);return;
    }
    if(d.appAction==='reload-records'){
      // Recreate page controllers from the newest stored snapshot. Re-enabling
      // writes while keeping an old calculator would overwrite the newer hand.
      // Keep the stale guard active until this document has actually unloaded.
      globalThis.location.reload();
      return;
    }
    if(d.appAction==='new-table'){
      this.confirm((t('heybox.lobby.new')),(t('heybox.lobby.replaceNote')),async()=>{
        await this.repo.update(data=>{data.table=null;data.tableDraft=null;});this.close();this.renderLobby();
      });return;
    }

    if(d.appAction==='deposit'){
      const table=this.table.read(),expected=this.table.snapshot(table),index=Number(d.index);
      this.confirm((t('heybox.lobby.depositTitle')),t('heybox.lobby.depositNote',{name:table.players[index].name}),async()=>{await this.table.deposit(index,expected);this.close();this.renderLobby();});return;
    }
    if(d.appAction==='draw'){
      const table=this.table.read();this.drawExpected=this.table.snapshot(table);
      this.open((t('heybox.lobby.draw')),'<form id="draw-form">'+table.players.map((player,i)=>'<label class="flag">'+esc(player.name)+('<span>' + esc(t('heybox.lobby.tenpai')) + ' <input type="checkbox" name="tenpai')+i+'" '+(table.riichi[i]?'checked disabled':'')+'></span></label>').join('')+('<p class="summary-note">' + esc(t('heybox.lobby.drawNote')) + '</p><button type="submit" class="primary">' + esc(t('heybox.lobby.confirmDraw')) + ' ')+icon('check')+'</button></form>');return;
    }
    if(d.appAction==='next-hand'){
      const expected=this.table.snapshot(this.table.read()),repeat=d.repeat==='yes';
      this.confirm((t('heybox.lobby.nextTitle')),repeat?(t('heybox.lobby.repeatNote')):(t('heybox.lobby.rotateNote')),async()=>{await this.table.nextHand(repeat,expected);this.close();this.renderLobby();});return;
    }
    if(d.appAction==='undo-settlement'){
      const expected=this.table.snapshot(this.table.read());
      this.confirm((t('heybox.lobby.undo')),(t('heybox.lobby.undoNote')),async()=>{await this.table.undo(expected);this.close();this.renderLobby();});return;
    }
    if(d.appAction==='confirm'){
      if(this.busy)return;this.busy=true;button.disabled=true;
      try{await this.confirmAction?.();this.confirmAction=null;}finally{this.busy=false;if(button.isConnected)button.disabled=false;}
    }
  }
  async submit(form) {
    if(form.id==='notation-form'){
      const tiles=parseNotation(new FormData(form).get('notation'));
      if(this.calc.replaceHand(tiles))this.close();return;
    }
    if(form.id==='table-create-form'){
      if(this.busy)return;this.busy=true;
      try{const data=new FormData(form);await this.table.create([0,1,2,3].map(i=>String(data.get('player'+i)||'')),Number(data.get('initial')));this.renderLobby();}finally{this.busy=false;}
    }
    if(form.id==='draw-form'){
      if(this.busy)return;this.busy=true;
      try{await this.table.draw([0,1,2,3].map(i=>form.elements['tenpai'+i].checked),this.drawExpected);this.close();this.renderLobby();}finally{this.busy=false;}
    }
    if(form.id==='practice-form'){
      if(this.practice.revealed||this.busy)return;
      const p=this.practice,fields=practiceFields(p.question);
      if(fields.some(field=>!/^\d+$/.test(String(p.answers[field.key]||'').trim())))throw uiError('heybox.practice.required');
      this.busy=true;
      try{const checks=checkPractice(p.question,p.answers),correct=checks.every(field=>field.correct);await this.repo.update(data=>{data.practice.attempted++;if(correct)data.practice.correct++;});p.checks=checks;p.submitted=true;p.revealed=true;this.renderPractice();}finally{this.busy=false;}
    }
  }
}
new HelaApp(document.querySelector('#app'));

