import {errorText as errorMessage,uiError} from './locale.js';
import {t,current} from '../../src/i18n/index.js';
import { calculate, normalize, inventory, validateInventory, makeMeld, meldTiles, doraFrom, WINDS } from '../../src/engine.js';
import { syncWinningTile } from '../../src/hand-input.js';
import { emptyState } from './repository.js';
import {tileName,windName,yakuInfo,scoreResult} from '../../src/i18n/presenters.js';

const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone = value => JSON.parse(JSON.stringify(value));
const number = value => Number(value).toLocaleString(current());
const tileURL = tile => './assets/tiles/' + tile + '.png';
const artwork = tile => '<span class="tile-face"><img src="' + tileURL(tile) + '" alt="" draggable="false"></span>';
const paths = {
  arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
  chevron:'<path d="m9 5 7 7-7 7"/>',
  down:'<path d="m6 9 6 6 6-6"/>',
  image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
  undo:'<path d="M4 4v7h7M4 11a8 8 0 1 1 2 8"/>',
  trash:'<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3h.01"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  tiles:'<rect x="3" y="5" width="7" height="15" rx="2"/><rect x="14" y="3" width="7" height="15" rx="2"/><path d="M6 9h1m10-2h1"/>',
  dora:'<path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z"/>',
  check:'<path d="m5 12 4 4L19 6"/>'
};
const icon = name => '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (paths[name] || paths.help) + '</svg>';
export class HandEntry {
  constructor(frame, options = {}) {
    this.frame = frame;
    this.config = options;
    this.meta = {order:['nav','steps','intro','tray','actions','editor','footer']};
    this.state = clone(options.state || emptyState());
    syncWinningTile(this.state);
    this.history = [];
    this.suit = 'm';
    this.sheetSuit = 'm';
    this.red = false;
    this.modal = '';
    this.meldType = 'pon';
    this.meldDirection = '-';
    this.draft = [];
    this.indicator = 'dora';
    this.dialog = frame.querySelector('dialog');
    this.click = e => {
      const target = e.target.closest('button[data-action]');
      if (target && this.frame.contains(target) && !target.disabled) this.action(target);
    };
    frame.addEventListener('click', this.click);
    this.changeListener = e => {
      if (e.target.id === 'red-five') { this.red = e.target.checked; this.renderScreen(); }
      if (e.target.dataset.flag) this.mutate(s => { s[e.target.dataset.flag] = e.target.checked; });
      if (e.target.dataset.rule) this.mutate(s => { s.rules[e.target.dataset.rule] = e.target.checked; });

    };
    frame.addEventListener('change', this.changeListener);
    this.dialog.addEventListener('close', () => { if (!this.dialog.open) this.modal = ''; });
    this.renderScreen();
  }
  dispose() {
    clearTimeout(this.toastTimer);
    this.frame.removeEventListener('click', this.click);
    this.frame.removeEventListener('change', this.changeListener);
    if (this.dialog.open) this.dialog.close();
  }
  get expected() { return 14 - 3 * this.state.melds.length; }
  get complete() { return this.state.hand.length === this.expected; }
  get opened() { return this.state.melds.some(m => /[+=-]/.test(m)); }
  toast(message) {
    if (this.config.onToast) return this.config.onToast(message);
    const node = this.frame.querySelector('.toast');
    node.textContent = message;
    node.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { node.hidden = true; }, 2600);
  }
  mutate(fn) {
    const before = clone(this.state);
    try {
      fn(this.state);
      this.config.normalizeState?.(this.state,before);
      syncWinningTile(this.state);
      validateInventory(inventory(this.state));
      this.history.push(before);
      this.config.onChange?.(clone(this.state));
      this.renderScreen();
      if (this.modal && this.modal !== 'result') this.renderSheet();
      return true;
    } catch (error) {
      this.state = before;
      this.toast(errorMessage(error));
      return false;
    }
  }
  handSlot(tile, index, scope = 'hand') {
    if (!tile) return '<span class="hand-slot empty" aria-hidden="true">·</span>';
    return '<button type="button" class="hand-slot" data-action="remove-' + scope + '" data-index="' + index + ('" aria-label="' + escape(t('heybox.calc.removeTile',{tile:tileName(tile)}))) + '">' + artwork(tile) + '</button>';
  }
  tray() {
    const concealed = this.state.hand.map((tile, index) => ({ tile, index })).filter(t => t.index !== this.state.winIndex);
    const slots = Array.from({length:this.expected - 1}, (_, i) => this.handSlot(concealed[i]?.tile, concealed[i]?.index)).join('');
    const winning = this.complete ? this.state.hand[this.state.winIndex] : '';
    const win = winning ? this.handSlot(winning, this.state.winIndex) : ('<span class="hand-slot empty">' + escape(t('heybox.calc.last')) + '<br>' + escape(t('heybox.calc.enter')) + '</span>');
    return ('<section class="hand-card" aria-label="' + escape(t('heybox.calc.tray')) + '"><div class="tray-labels"><span>' + escape(t('heybox.common.hand')) + '<em>' + escape(t('heybox.calc.tapRemove')) + '</em></span><span>' + escape(t('heybox.common.winTile')) + '</span></div><div class="hand-board"><div class="hand-slots">') + slots + '</div><div class="win-slot">' + win + ('</div></div><div class="scroll-hint">' + escape(t('heybox.calc.scroll')) + '</div></section>');
  }
  suits(suit, scope = 'hand') {
    return ('<div class="suits" role="group" aria-label="' + escape(t('heybox.calc.suit')) + '">') + ['m','p','s','z'].map((value, i) => '<button type="button" class="suit ' + (suit === value ? 'selected' : '') + '" data-action="suit" data-value="' + value + '" data-scope="' + scope + '" aria-pressed="' + (suit === value) + '" data-focus="suit-' + scope + '-' + value + '">' + [(t('heybox.common.man')),(t('heybox.common.pin')),(t('heybox.common.sou')),(t('heybox.common.honors'))][i] + '</button>').join('') + '</div>';
  }
  keys(suit, scope = 'hand') {
    const tiles = Array.from({length:suit === 'z' ? 7 : 9}, (_, i) => suit + (i === 4 && this.red && suit !== 'z' ? '0' : i + 1));
    let used = inventory(this.state);
    if (scope === 'meld') used = used.concat(this.draft);
    const full = scope === 'hand' ? this.complete : scope === 'meld' ? this.draft.length >= (['ankan','minkan'].includes(this.meldType) ? 4 : 3) : this.state[this.indicator].length >= 5;
    return ('<div class="tile-grid" aria-label="' + escape(t('heybox.calc.pad')) + '">') + tiles.map(tile => {
      const count = used.filter(t => normalize(t) === normalize(tile)).length;
      const redUsed = tile[1] === '0' && used.includes(tile);
      const disabled = count >= 4 || redUsed || full;
      return '<button type="button" class="tile-key ' + (count ? 'used' : '') + '" data-action="add" data-value="' + tile + '" data-scope="' + scope + '" data-focus="add-' + scope + '-' + tile + '" aria-label="' + escape(t('heybox.calc.addTile',{tile:tileName(tile)})) + '" ' + (disabled ? 'disabled' : '') + '>' + artwork(tile) + (count ? '<small>' + count + '/4</small>' : '') + '</button>';
    }).join('') + (suit === 'z' ? '<span class="tile-key blank"></span><span class="tile-key blank"></span>' : '') + '</div>';
  }
  utility(kind) {
    const meld = kind === 'meld';
    const values = meld ? this.state.melds.flatMap(meldTiles) : this.state.dora;
    return '<button type="button" class="utility" data-action="' + (meld ? 'meld' : 'indicators') + '"><span class="utility-top">' + icon(meld ? 'tiles' : 'dora') + icon('chevron') + '</span><span class="name">' + (meld ? (t('heybox.common.meldAndKan')) : (t('heybox.common.dora'))) + '</span>' + (values.length ? '<span class="utility-preview">' + values.slice(0,4).map(artwork).join('') + '</span>' : '') + '<small>' + (meld ? t('heybox.common.groupCount',{count:this.state.melds.length}) : t('heybox.common.tileCount',{count:this.state.dora.length})) + '</small></button>';
  }
  editor() {
    return ('<section class="editor" aria-label="' + escape(t('heybox.calc.input')) + '"><div class="editor-header"><strong>' + escape(t('heybox.calc.select')) + '</strong><label class="red-toggle"><input id="red-five" type="checkbox" ') + (this.red ? 'checked' : '') + ' ' + (this.suit === 'z' ? 'disabled' : '') + ('>' + escape(t('heybox.common.redFive')) + '</label></div><div class="keyboard-layout"><div class="keyboard-main">') + this.suits(this.suit) + this.keys(this.suit) + '</div><div class="utility-rail">' + this.utility('meld') + this.utility('dora') + ('</div></div><div class="input-hint"><button type="button" class="notation-link" data-action="notation">' + escape(t('heybox.notation.title')) + '</button><strong>') + (this.complete ? (t('heybox.calc.complete')) : t('heybox.calc.remaining',{count:this.expected-this.state.hand.length})) + '</strong></div></section>';
  }
  renderScreen() {
    const activeFocus = document.activeElement?.dataset.focus;
    const scroll = this.frame.querySelector('.content')?.scrollTop || 0;
    const handScroll = this.frame.querySelector('.hand-slots')?.scrollLeft || 0;
    const s = this.state;
    const nav = this.config.header?.() || '';
    const steps = ('<div class="steps" aria-label="' + escape(t('heybox.calc.steps')) + '"><button type="button" class="step-item active" data-action="hand"><b>1</b>' + escape(t('heybox.common.hand')) + '</button><span class="step-line"></span><button type="button" class="step-item" data-action="context"><b>2</b>' + escape(t('heybox.calc.context')) + '</button><span class="step-line"></span><button type="button" class="step-item" data-action="result"><b>3</b>' + escape(t('heybox.calc.result')) + '</button></div>');
    const intro = ('<div class="intro"><div><h2>' + escape(t('heybox.home.calculatorTitle')) + '</h2><small>') + (this.opened ? (t('heybox.calc.openHand')) : (t('heybox.calc.closedHand'))) + '</small></div><div class="count" aria-live="polite"><b>' + String(s.hand.length).padStart(2,'0') + '</b><span>/ ' + this.expected + '</span></div></div>';
    const actions = '<div class="actions"><button type="button" class="control photo-entry" data-action="photo">' + icon('image') + (escape(t('heybox.calc.choosePhoto')) + '</button><button type="button" class="control undo" data-action="undo" aria-label="' + escape(t('heybox.calc.undoLabel')) + '" ') + (this.history.length ? '' : 'disabled') + '>' + icon('undo') + '</button><button type="button" class="control clear" data-action="clear">' + icon('trash') + (escape(t('heybox.common.clear')) + '</button></div>');
    const stats = '<div class="stats"><div class="stat"><b>' + String(s.hand.length).padStart(2,'0') + ('</b>' + escape(t('heybox.common.hand')) + '</div><div class="stat"><b>') + String(s.melds.length).padStart(2,'0') + ('</b>' + escape(t('heybox.common.melds')) + '</div><div class="stat"><b>') + String(s.dora.length).padStart(2,'0') + ('</b>' + escape(t('heybox.common.dora')) + '</div></div>');
    const context = '<button type="button" class="context-summary" data-action="context"><span>' + escape(t('heybox.common.round',{wind:windName(s.round)})) + ' · ' + escape(t('heybox.common.seat',{wind:windName(s.seat)})) + ' · ' + (s.method === 'ron' ? (t('heybox.common.ron')) : (t('heybox.common.tsumo'))) + (s.riichi ? ' · '+t('heybox.common.riichi') : '') + ('</span><span>' + escape(t('heybox.calc.conditions')) + ' ') + icon('chevron') + '</span></button>';
    const footer = '<footer class="app-footer"><button type="button" class="primary" data-action="context" ' + (this.complete ? '' : 'disabled') + ('><span>' + escape(t('heybox.calc.next')) + '</span>') + icon('arrow') + '</button></footer>';
    const blocks = { nav, steps, intro, actions, stats, context, tray:this.tray(), editor:this.editor(), footer };
    const contents = this.meta.order.filter(key => key !== 'nav' && key !== 'footer').map(key => blocks[key]).join('');
    this.frame.querySelector('#screen').innerHTML = nav + '<div class="content">' + contents + '</div>' + footer;
    this.frame.querySelector('.content').scrollTop = scroll;
    this.frame.querySelector('.hand-slots').scrollLeft = handScroll;
    if (activeFocus) this.frame.querySelector('[data-focus="' + CSS.escape(activeFocus) + '"]:not(:disabled)')?.focus({preventScroll:true});
  }
  replaceHand(tiles) {
    if (tiles.length > this.expected) throw uiError('heybox.calc.maxTiles',{count:this.expected});
    return this.mutate(state => { state.hand = tiles.slice(); state.winIndex = -1; });
  }
  option(label, field, value, selected, disabled = false) {
    return '<button type="button" class="option ' + (selected ? 'selected' : '') + '" data-action="field" data-field="' + field + '" data-value="' + value + '" data-focus="field-' + field + '-' + value + '" aria-pressed="' + selected + '" ' + (disabled ? 'disabled' : '') + '>' + label + '</button>';
  }
  field(label, contents) { return '<div class="field"><span class="field-label">' + label + '</span>' + contents + '</div>'; }
  options(labels, field, values, current, disabled = false) {
    return '<div class="options">' + labels.map((label, i) => this.option(label, field, values[i], values[i] === current, disabled)).join('') + '</div>';
  }
  counter(label, field) {
    return this.field(label, '<div class="counter-control"><button type="button" data-action="counter" data-field="' + field + '" data-delta="-1" aria-label="' + escape(t('heybox.common.reduce',{label})) + '" ' + (!this.state[field] ? 'disabled' : '') + '>−</button><b>' + this.state[field] + '</b><button type="button" data-action="counter" data-field="' + field + '" data-delta="1" aria-label="' + escape(t('heybox.common.increase',{label})) + '" ' + (this.state[field] >= 99 ? 'disabled' : '') + '>＋</button></div>');
  }
  contextBody() {
    const s = this.state;
    const specials = [
      [(t('heybox.calc.haitei')),'last','tsumo'],[(t('heybox.calc.houtei')),'last','ron'],[(t('heybox.calc.rinshan')),'rinshan','tsumo'],[(t('heybox.calc.chankan')),'chankan','ron'],[s.seat === 0 ? (t('heybox.calc.tenhou')) : (t('heybox.calc.chiihou')),'first','tsumo']
    ];
    return '<div class="two-fields">' + this.field((t('heybox.calc.roundWind')),this.options(WINDS.map((_,i)=>windName(i)),'round',[0,1,2,3],s.round)) + this.field((t('heybox.calc.seatWind')),this.options(WINDS.map((_,i)=>windName(i)),'seat',[0,1,2,3],s.seat)) + '</div>' +
      this.field((t('heybox.calc.method')),this.options([(t('heybox.common.ron')),(t('heybox.common.tsumo'))],'method',['ron','tsumo'],s.method)) +
      (s.method === 'ron' ? this.field((t('heybox.calc.loser')),this.options(WINDS.map((_,i)=>windName(i)).filter((_,i)=>i!==s.seat),'loser',[0,1,2,3].filter(i=>i!==s.seat),s.loser)) : '') +
      this.field(t('heybox.common.riichi')+' ' + (this.opened ? ('<small>' + escape(t('heybox.calc.openRiichi')) + '</small>') : ''),this.options([(t('heybox.common.noRiichi')),(t('heybox.common.riichi')),(t('heybox.common.doubleRiichi'))],'riichi',[0,1,2],s.riichi,this.opened)) +
      this.field((t('heybox.common.ippatsu')),('<label class="flag">' + escape(t('heybox.calc.ippatsuNote')) + '<input type="checkbox" data-flag="ippatsu" ') + (s.ippatsu ? 'checked' : '') + ' ' + (!s.riichi ? 'disabled' : '') + '></label>') +
      this.field((t('heybox.calc.special')),'<div class="special-options">' + specials.map(([label, value, method]) => '<button type="button" class="option ' + (s.special === value && s.method === method ? 'selected' : '') + '" data-action="special" data-value="' + value + '" data-method="' + method + '" aria-pressed="' + (s.special === value && s.method === method) + '">' + label + '</button>').join('') + '</div>') +
      '<div class="two-fields">' + this.counter((t('heybox.common.honba')),'honba') + this.counter((t('heybox.common.sticks')),'sticks') + '</div>' +
      ('<details class="rule-details"><summary>' + escape(t('heybox.calc.rules')) + '</summary><div class="rule-settings">') + [
        ['openTanyao',(t('heybox.calc.openTanyao')),(t('heybox.calc.openTanyaoNote'))],
        ['kiriage',(t('heybox.calc.kiriage')),(t('heybox.calc.kiriageNote'))],
        ['doubleYakuman',(t('heybox.calc.doubleYakuman')),(t('heybox.calc.doubleYakumanNote'))],
        ['kazoe',(t('heybox.calc.kazoe')),(t('heybox.calc.kazoeNote'))],
        ['doubleWindFu',(t('heybox.calc.doubleWindFu')),(t('heybox.calc.doubleWindFuNote'))]
      ].map(([key,label,note])=>'<label class="rule-setting"><span>' + label + '<small>' + note + '</small></span><input type="checkbox" data-rule="' + key + '" ' + (s.rules[key]?'checked':'') + '></label>').join('') + ('</div><p class="sheet-note">' + escape(t('heybox.calc.ruleNote')) + '</p></details>');
  }
  sheetPalette(scope) { return '<div class="sheet-palette">' + this.suits(this.sheetSuit,scope) + this.keys(this.sheetSuit,scope) + '</div>'; }
  meldBody() {
    const s = this.state;
    const rows = s.melds.map((meld, i) => '<div class="meld-row"><span><small>' + escape(t('heybox.common.groupIndex',{count:i+1})) + '</small>' + meldTiles(meld).map(artwork).join('') + '</span><button type="button" class="icon-button" data-action="remove-meld" data-index="' + i + ('" aria-label="' + escape(t('heybox.common.removeGroup',{count:i+1}))) + '">' + icon('trash') + '</button></div>').join('');
    return rows + ('<div class="field" style="margin-top:16px"><span class="field-label">' + escape(t('heybox.calc.addMeld')) + '</span><div class="options">') +
      [[(t('heybox.common.chi')),'chi'],[(t('heybox.common.pon')),'pon'],[(t('heybox.common.minkan')),'minkan'],[(t('heybox.common.ankan')),'ankan'],[(t('heybox.common.kakan')),'kakan']].map(([label, value]) => '<button type="button" class="option ' + (this.meldType === value ? 'selected' : '') + '" data-action="meld-type" data-value="' + value + '">' + label + '</button>').join('') +
      '</div><div class="selected-tiles">' + (this.draft.length ? this.draft.map((tile,i) => this.handSlot(tile,i,'draft')).join('') : '<span class="placeholder">'+escape(t('heybox.common.addCount',{count:['minkan','ankan','kakan'].includes(this.meldType)?4:3}))+'</span>') + '</div>' + this.sheetPalette('meld') + '</div>' +
      (['pon','minkan','kakan'].includes(this.meldType)?this.field((t('heybox.calc.source')),'<div class="options">'+[[(t('heybox.common.previous')),'-'],[(t('heybox.common.across')),'='],[(t('heybox.common.next')),'+']].map(([name,value])=>'<button type="button" class="option '+(this.meldDirection===value?'selected':'')+'" data-action="meld-direction" data-value="'+value+'">'+name+'</button>').join('')+'</div>'):'') +
      ('<p class="sheet-note">' + escape(t('heybox.calc.meldNote')) + '</p>');
  }
  indicatorBody() {
    const s = this.state;
    const values = s[this.indicator];
    return '<div class="options">' + ['dora','ura'].map((target, i) => '<button type="button" class="option ' + (this.indicator === target ? 'selected' : '') + '" data-action="indicator-target" data-value="' + target + '">' + [(t('heybox.common.dora')),(t('heybox.common.ura'))][i] + '</button>').join('') + '</div>' +
      '<div class="selected-tiles">' + (values.length ? values.map((tile,i)=>this.handSlot(tile,i,'indicator')).join('') : ('<span class="placeholder">' + escape(t('heybox.calc.indicatorPlaceholder')) + '</span>')) + '</div>' +
      (values.length ? ('<div class="sheet-note">' + escape(t('heybox.calc.actualDora')) + '<div class="utility-preview">') + values.map(tile=>artwork(doraFrom(tile))).join('') + '</div></div>' : '') +
      this.sheetPalette('indicator') + ('<p class="sheet-note">' + escape(t('heybox.calc.indicatorNote')) + '</p>');
  }
  resultBody() {
    const result = scoreResult(this.state,calculate(this.state));
    this.resultOK = result.ok;
    if (!result.ok) return '<div class="error-box">' + escape(errorMessage(result)) + ('</div><p class="sheet-note">' + escape(t('heybox.calc.errorNote')) + '</p>');
    const details = result.hupai.map(y => '<div class="result-row"><span>' + escape(yakuInfo(y.name)[0]) + '</span><span>' + escape(y.fanshu) + (String(y.fanshu).includes('*') ? '' : ' '+t('heybox.common.han')) + '</span></div>').join('');
    const fuRows = result.fuDetails.map(row => '<div class="result-row"><span>' + escape(row.name) + '</span><span>' + (row.fu === null ? '—' : row.fu + ' '+t('heybox.common.fu')) + '</span></div>').join('');
    const payments = result.fenpei.map((value, i) => value < 0 ? '<div class="result-row"><span>' + escape(t('heybox.common.payments',{wind:windName(i)})) + '</span><span>' + number(-value) + (' ' + escape(t('heybox.common.points')) + '</span></div>') : '').join('');
    return '<div class="result-hero"><p>' + (this.state.seat === 0 ? (t('heybox.common.dealer')) : (t('heybox.common.nonDealer'))) + ' · ' + (this.state.method === 'ron' ? (t('heybox.common.ron')) : (t('heybox.common.tsumo'))) + ' · ' + escape(result.limit) + '</p><strong>' + number(result.total) + ('</strong><small>' + escape(t('heybox.common.points')) + '</small><p style="margin:12px 0 0">') + (result.damanguan ? escape(result.limit) : escape(t('heybox.common.hanFu',{han:result.fanshu,fu:result.fu}))) + '</p></div><div class="result-rows">' + details + '</div><div class="result-rows">' + payments + ('</div><details class="fu-details"><summary>' + escape(t('heybox.calc.fuDetails')) + '</summary>') + fuRows + '</details>';
  }
  renderSheet() {
    if (!this.modal) return;
    const scroll = this.dialog.querySelector('.sheet-body')?.scrollTop || 0;
    const focus = document.activeElement?.dataset.focus;
    const rulesOpen = this.dialog.querySelector('.rule-details')?.open;
    let title = '', subtitle = '', body = '', footer = '';
    if (this.modal === 'context') {
      title = (t('heybox.calc.conditions')); subtitle = (t('heybox.calc.contextSubtitle')); body = this.contextBody();
      footer = ('<button type="button" class="primary" data-action="result"><span>' + escape(t('heybox.calc.calculate')) + '</span>') + icon('arrow') + '</button>';
    } else if (this.modal === 'meld') {
      title = (t('heybox.common.meldAndKan')); subtitle = (t('heybox.calc.meldSubtitle')); body = this.meldBody();
      footer = '<button type="button" class="primary" data-action="commit-meld" ' + (this.draft.length !== (['ankan','minkan','kakan'].includes(this.meldType) ? 4 : 3) || this.state.melds.length >= 4 ? 'disabled' : '') + ('><span>' + escape(t('heybox.calc.commitMeld')) + '</span>') + icon('check') + '</button>';
    } else if (this.modal === 'indicators') {
      title = (t('heybox.common.dora')); subtitle = (t('heybox.calc.indicatorSubtitle')); body = this.indicatorBody();
      footer = ('<button type="button" class="primary" data-action="close"><span>' + escape(t('heybox.common.done')) + '</span>') + icon('check') + '</button>';
    } else if (this.modal === 'result') {
      title = (t('heybox.calc.resultTitle')); subtitle = (t('heybox.calc.resultSubtitle')); body = this.resultBody();
      footer = (this.resultOK ? ('<div class="result-actions"><button type="button" class="control" data-action="save-record">' + escape(t('heybox.calc.save')) + '</button><button type="button" class="control" data-action="copy-result">' + escape(t('heybox.calc.copy')) + '</button></div>') : '') + '<button type="button" class="primary" data-action="' + (this.resultOK && this.config.onSettle ? 'settle' : this.resultOK ? 'close' : 'context') + '"><span>' + (this.resultOK && this.config.onSettle ? (t('heybox.calc.settle')) : this.resultOK ? (t('heybox.calc.returnHand')) : (t('heybox.calc.editConditions'))) + '</span>' + icon('arrow') + '</button>';
    } else {
      title = (t('heybox.calc.helpTitle')); subtitle = (t('heybox.calc.helpSubtitle'));
      body = ('<div class="sheet-note" style="font-size:13px">' + escape(t('heybox.calc.help1')) + '<br><br>' + escape(t('heybox.calc.help2')) + '<br><br>' + escape(t('heybox.calc.help3')) + '<br><br>' + escape(t('heybox.calc.help4')) + '</div>');
      footer = ('<button type="button" class="primary" data-action="close"><span>' + escape(t('heybox.common.gotIt')) + '</span>') + icon('check') + '</button>';
    }
    this.dialog.querySelector('#sheet-content').innerHTML = '<div class="sheet-inner"><div class="sheet-head"><div><h3>' + title + '</h3><p>' + subtitle + ('</p></div><button type="button" class="icon-button" data-action="close" aria-label="' + escape(t('heybox.common.close')) + '">') + icon('close') + '</button></div><div class="sheet-body">' + body + '</div><div class="sheet-footer">' + footer + '</div></div>';
    this.dialog.querySelector('.sheet-body').scrollTop = scroll;
    if(rulesOpen&&this.dialog.querySelector('.rule-details'))this.dialog.querySelector('.rule-details').open=true;
    if (focus) this.dialog.querySelector('[data-focus="' + CSS.escape(focus) + '"]:not(:disabled)')?.focus({preventScroll:true});
  }
  open(kind) {
    const wasOpen = this.dialog.open;
    this.modal = kind;
    this.renderSheet();
    if (!wasOpen) {
      this.dialog.showModal();
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) this.dialog.animate([{opacity:0,transform:'translateY(12px)'},{opacity:1,transform:'translateY(0)'}],{duration:180,easing:'cubic-bezier(.23,1,.32,1)'});
    }
  }
  action(button) {
    const data = button.dataset;
    switch (data.action) {
      case 'suit':
        if (data.scope === 'hand') { this.suit = data.value; this.renderScreen(); }
        else { this.sheetSuit = data.value; this.renderSheet(); }
        break;
      case 'add':
        if (data.scope === 'hand') {
          if (!this.complete) this.mutate(s => { s.hand.push(data.value); });
        } else if (data.scope === 'meld') {
          try { validateInventory(inventory(this.state).concat(this.draft,data.value)); this.draft.push(data.value); this.renderSheet(); } catch (e) { this.toast(errorMessage(e)); }
        } else {
          this.mutate(s => { if (s[this.indicator].length < 5) s[this.indicator].push(data.value); });
        }
        break;
      case 'remove-hand': this.mutate(s => { s.hand.splice(Number(data.index),1); }); break;
      case 'remove-draft': this.draft.splice(Number(data.index),1); this.renderSheet(); break;
      case 'remove-meld': this.mutate(s => { s.melds.splice(Number(data.index),1); }); break;
      case 'remove-indicator': this.mutate(s => { s[this.indicator].splice(Number(data.index),1); }); break;
      case 'undo':
        if (this.history.length) { this.state = this.history.pop(); this.config.onChange?.(clone(this.state)); this.renderScreen(); }
        break;
      case 'clear':
        this.mutate(s => { s.hand = []; s.melds = []; s.dora = []; s.ura = []; });
        this.toast((t('heybox.calc.cleared')));
        break;
      case 'meld':
        this.draft = []; this.sheetSuit = this.suit; this.open('meld'); break;
      case 'indicators':
        this.sheetSuit = 'm'; this.open('indicators'); break;
      case 'meld-type': this.meldType = data.value; this.draft = []; this.renderSheet(); break;
      case 'meld-direction': this.meldDirection = data.value; this.renderSheet(); break;
      case 'commit-meld':
        try {
          const meld = makeMeld(this.meldType,this.draft,this.meldDirection);
          const expected = 14 - (this.state.melds.length + 1) * 3;
          if (this.state.hand.length > expected) throw Object.assign(new Error(t('heybox.calc.removeBeforeMeld',{count:this.state.hand.length-expected})),{messageRef:{key:'heybox.calc.removeBeforeMeld',params:{count:this.state.hand.length-expected}}});
          if (this.mutate(s => { s.melds.push(meld); if (/[+=-]/.test(meld)) { s.riichi = 0; s.ippatsu = false; } })) { this.draft = []; this.renderSheet(); this.toast((t('heybox.calc.meldAdded'))); }
        } catch (e) { this.toast(errorMessage(e)); }
        break;
      case 'indicator-target': this.indicator = data.value; this.renderSheet(); break;
      case 'field':
        this.mutate(s => {
          s[data.field] = ['method'].includes(data.field) ? data.value : Number(data.value);
          if (data.field === 'seat' && s.loser === s.seat) s.loser = (s.seat+1)%4;
          if (data.field === 'riichi' && !s.riichi) s.ippatsu = false;
        });
        break;
      case 'special':
        this.mutate(s => {
          if (s.special === data.value && s.method === data.method) s.special = 'none';
          else { s.special = data.value; s.method = data.method; if (data.value === 'first') { s.riichi = 0; s.ippatsu = false; } }
        });
        break;
      case 'counter': this.mutate(s => { s[data.field] = Math.max(0,Math.min(99,s[data.field] + Number(data.delta))); }); break;
      case 'context': this.open('context'); break;
      case 'result': this.open('result'); break;
      case 'photo': this.config.onPhoto?.(); break;
      case 'notation': this.config.onNotation?.(); break;
      case 'save-record': this.config.onSave?.(clone(this.state)); break;
      case 'copy-result': this.config.onCopy?.(clone(this.state)); break;
      case 'settle': this.config.onSettle?.(clone(this.state)); break;
      case 'help': this.open('help'); break;
      case 'hand': if (this.dialog.open) this.dialog.close(); break;
      case 'close': this.dialog.close(); break;
    }
  }
}
