import {defaultState,validTile,validateInventory,inventory,makeMeld,meldTiles,normalize} from '../../src/engine.js';
import {syncWinningTile} from '../../src/hand-input.js';
import {normalizeTheme} from './themes.js';
import {validateTable} from './table-state.js';

export const STORAGE_KEY='hela_ui_polish_test_v1';
export const clone=value=>JSON.parse(JSON.stringify(value));
export function emptyState() {
  return {...defaultState(),hand:[],winIndex:-1,melds:[],dora:[],ura:[],riichi:0};
}
export function restoreState(raw) {
  if(!raw||!['hand','melds','dora','ura'].every(key=>Array.isArray(raw[key])))throw new Error('手牌记录格式异常');
  const state=emptyState();
  for(const key of ['hand','dora','ura']){
    if(raw[key].some(tile=>!validTile(tile)))throw new Error('手牌记录包含无效牌面');
    state[key]=raw[key].slice();
  }
  if(raw.melds.length>4)throw new Error('副露记录数量异常');
  state.melds=raw.melds.map(meld=>{
    if(typeof meld!=='string'||!/^[mpsz][0-9+=-]+$/.test(meld))throw new Error('副露记录格式异常');
    const tiles=meldTiles(meld),direction=meld.match(/[+=-]/)?.[0]||'-';
    const type=tiles.length===4?(!/[+=-]/.test(meld)?'ankan':/[+=-]\d$/.test(meld)?'kakan':'minkan'):tiles.every(t=>normalize(t)===normalize(tiles[0]))?'pon':'chi';
    makeMeld(type,tiles,direction);
    return meld;
  });
  if(state.hand.length>14-state.melds.length*3||state.dora.length>5||state.ura.length>5)throw new Error('手牌记录数量异常');
  for(const key of ['round','seat','loser'])if(Number.isInteger(raw[key])&&raw[key]>=0&&raw[key]<4)state[key]=raw[key];
  state.method=raw.method==='tsumo'?'tsumo':'ron';
  state.riichi=[0,1,2].includes(raw.riichi)?raw.riichi:0;
  state.ippatsu=raw.ippatsu===true;
  state.special=['none','last','rinshan','chankan','first'].includes(raw.special)?raw.special:'none';
  for(const key of ['honba','sticks'])if(Number.isInteger(raw[key])&&raw[key]>=0&&raw[key]<=99)state[key]=raw[key];
  for(const key of Object.keys(state.rules))if(typeof raw.rules?.[key]==='boolean')state.rules[key]=raw.rules[key];
  state.winIndex=Number.isInteger(raw.winIndex)?raw.winIndex:-1;
  validateInventory(inventory(state));
  syncWinningTile(state);
  return state;
}
function defaults() { return {version:1,theme:'moon',draft:emptyState(),history:[],practice:{attempted:0,correct:0},table:null,tableDraft:null}; }
function restore(raw) {
  if(raw===undefined||raw===null)return defaults();
  if(!raw||raw.version!==1)throw new Error('本地记录版本无法读取，已保留原记录');
  const next=defaults();
  next.theme=normalizeTheme(raw.theme);
  if(raw.draft)next.draft=restoreState(raw.draft);
  next.history=Array.isArray(raw.history)?raw.history.slice(0,30).flatMap(record=>{
    try{return typeof record.id==='string'&&typeof record.date==='string'?[{id:record.id,date:record.date,state:restoreState(record.state)}]:[];}catch{return [];}
  }):[];
  if(Number.isInteger(raw.practice?.attempted)&&raw.practice.attempted>=0&&Number.isInteger(raw.practice?.correct)&&raw.practice.correct>=0&&raw.practice.correct<=raw.practice.attempted)next.practice={attempted:raw.practice.attempted,correct:raw.practice.correct};
  if(raw.table){
    const t=raw.table;
    validateTable(t);
    next.table=clone(t);
  }
  if(raw.tableDraft?.state)next.tableDraft={id:raw.tableDraft.id,handNo:raw.tableDraft.handNo,state:restoreState(raw.tableDraft.state)};
  return next;
}
export function createRepository(adapter) {
  let current=defaults(),tail=Promise.resolve(),initialized=false;
  return {
    snapshot:()=>clone(current),
    async initialize(){const value=await adapter.read(STORAGE_KEY);current=restore(value);initialized=true;return clone(current);},
    update(mutator){
      const job=tail.then(async()=>{
        if(!initialized)throw new Error('本机存储尚未就绪，请稍后重试');
        const next=clone(current);
        mutator(next);
        next.theme=normalizeTheme(next.theme);
        await adapter.write(STORAGE_KEY,next);
        current=next;
        return clone(current);
      });
      tail=job.catch(()=>{});
      return job;
    },
    flush:()=>tail
  };
}
