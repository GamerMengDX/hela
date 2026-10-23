import {errorText as errorMessage,uiError} from './locale.js';
import {t,current} from '../../src/i18n/index.js';
import {calculate,notation,WINDS} from '../../src/engine.js';
import {tileName,windName,yakuInfo,scoreResult} from '../../src/i18n/presenters.js';
export const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const num=value=>Number(value).toLocaleString(current());
const paths={
  compose:'<rect x="3" y="3" width="7" height="7" rx="1.7"/><rect x="14" y="3" width="7" height="7" rx="1.7"/><rect x="3" y="14" width="7" height="7" rx="1.7"/><path d="M14 17.5h7m-3.5-3.5v7"/>',
  camera:'<path d="M14 4h-4L8 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-4Z"/><circle cx="12" cy="13" r="4"/>',
  image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
  arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
  back:'<path d="m14 5-7 7 7 7"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3h.01"/>',
  palette:'<path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1-3.7c-.8-.5-.4-1.8.5-1.8H17a4 4 0 0 0 4-4C21 6.8 17 3 12 3Z"/><path d="M7 10h.01M10 7h.01M15 7h.01M18 10h.01" stroke-width="3"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  book:'<path d="M12 5C8 2 4 3 2 4v15c4-1 7-1 10 2m0-16c4-3 8-2 10-1v15c-4-1-7-1-10 2V5Z"/>',
  target:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="m12 12 9-9m-4 0h4v4"/>',
  table:'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 10h18M10 3v18"/>',
  history:'<path d="M3 4v7h7M3 11a9 9 0 1 1 3 8m6-13v6l4 2"/>',
  check:'<path d="m5 12 4 4L19 6"/>'
};
export const icon=name=>'<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[name]||paths.arrow)+'</svg>';
export const face=(tile,extra='')=>'<span class="tile-face '+extra+'" role="img" aria-label="'+esc(tileName(tile))+'"><img src="./assets/tiles/'+tile+'.png" alt="" draggable="false"></span>';
export function handView(state){
  return '<div class="static-hand">'+state.hand.map((tile,i)=>'<span class="'+(i===state.winIndex?'static-winning':'')+'">'+face(tile,'small')+(i===state.winIndex?('<small>' + esc(t('heybox.common.winTile')) + '</small>'):'')+'</span>').join('')+'</div>'+(state.melds.length?('<div class="summary-note">' + esc(t('heybox.common.melds')) + '：')+state.melds.map(esc).join(' · ')+'</div>':'');
}
export function copyResult(state){
  const result=scoreResult(state,calculate(state));
  if(!result.ok)throw Object.assign(new Error(result.message),{messageRef:result.messageRef});
  return [t('heybox.copy.title'),t('heybox.copy.hand',{hand:notation(state.hand)}),t('heybox.copy.win',{tile:tileName(state.hand[state.winIndex]),seat:t('heybox.common.seat',{wind:windName(state.seat)}),method:t('heybox.common.'+state.method)}),result.hupai.map(y=>yakuInfo(y.name)[0]+' '+y.fanshu+(String(y.fanshu).includes('*')?'':' '+t('heybox.common.han'))).join(' + '),result.damanguan?result.limit:t('heybox.common.hanFu',{han:result.fanshu,fu:result.fu}),result.fenpei.map((n,i)=>n<0?t('heybox.common.payments',{wind:windName(i)})+' '+num(-n)+' '+t('heybox.common.points'):null).filter(Boolean).join(' · '),t('heybox.common.total',{count:num(result.total)})].join('\n');
}
