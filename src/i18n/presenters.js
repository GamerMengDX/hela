import {t,current} from './index.js';
import {YAKU} from '../data.js';
import {TEACHING_EXAMPLES} from '../teaching-examples.js';
import {entries} from './catalogs/shared.js';

// Canonical third-party yaku identifiers are retained exclusively for rules and lookup.
const yakuKeys = {
  "立直": "riichi",
  "ダブル立直": "double-riichi",
  "一発": "ippatsu",
  "門前清自摸和": "menzen-tsumo",
  "平和": "pinfu",
  "断幺九": "tanyao",
  "一盃口": "iipeikou",
  "三色同順": "sanshoku-doujun",
  "一気通貫": "ittsu",
  "混全帯幺九": "chanta",
  "七対子": "chiitoitsu",
  "対々和": "toitoi",
  "三暗刻": "sanankou",
  "三槓子": "sankantsu",
  "三色同刻": "sanshoku-doukou",
  "混老頭": "honroutou",
  "小三元": "shousangen",
  "混一色": "honitsu",
  "純全帯幺九": "junchan",
  "二盃口": "ryanpeikou",
  "清一色": "chinitsu",
  "海底摸月": "haitei",
  "河底撈魚": "houtei",
  "嶺上開花": "rinshan",
  "槍槓": "chankan",
  "天和": "tenhou",
  "地和": "chiihou",
  "国士無双": "kokushi",
  "国士無双十三面": "kokushi-thirteen",
  "四暗刻": "suuankou",
  "四暗刻単騎": "suuankou-tanki",
  "大三元": "daisangen",
  "小四喜": "shousuushii",
  "大四喜": "daisuushii",
  "字一色": "tsuuiisou",
  "緑一色": "ryuuiisou",
  "清老頭": "chinroutou",
  "四槓子": "suukantsu",
  "九蓮宝燈": "chuuren",
  "純正九蓮宝燈": "pure-chuuren",
  "ドラ": "dora",
  "赤ドラ": "red-dora",
  "裏ドラ": "ura-dora"
};
const windIds=['east','south','west','north'];
const dragonIds=['white','green','red'];
const copy=value=>value==null?value:JSON.parse(JSON.stringify(value));
const text=(key,params,locale)=>t('shared.'+key,params||{},locale);
function refText(ref,locale){
  if(!ref)return '';
  if(typeof ref==='string')return entries[ref]?t(ref,{},locale):'';
  if(!entries[ref.key])return '';
  const params={...(ref.params||{})};
  if(params.tile)params.tile=tileName(params.tile,locale);
  if(Number.isInteger(params.windIndex)){params.wind=windName(params.windIndex,locale);delete params.windIndex;}
  return t(ref.key,params,locale);
}
export function windName(index,locale=current()){
  return windIds[index]?text('wind.'+windIds[index],{},locale):text('tile.unknown',{},locale);
}
export function tileName(tile,locale=current()){
  if(typeof tile!=='string'||!(/^[mps][0-9]$|^z[1-7]$/).test(tile))return text('tile.unknown',{},locale);
  if(tile[0]==='z')return +tile[1]<5?windName(+tile[1]-1,locale):text('dragon.'+dragonIds[+tile[1]-5],{},locale);
  const number=tile[1]==='0'?text('tile.red',{},locale):locale==='zh-CN'?['零','一','二','三','四','五','六','七','八','九'][+tile[1]]:tile[1];
  return text('tile.'+({m:'man',p:'pin',s:'sou'})[tile[0]],{number},locale);
}
export function kindLabel(kind,locale=current()){
  const key=({'门清':'closed','可副露':'open','役满':'yakuman','宝牌':'dora'})[kind];
  return key?text('kind.'+key,{},locale):'';
}
export function yakuInfo(key,locale=current()){
  const id=yakuKeys[key];
  if(id)return [text('yaku.'+id+'.name',{},locale),text('yaku.'+id+'.description',{},locale),kindLabel(YAKU[key][2],locale)];
  const windIndex=['東','南','西','北'].indexOf(String(key).slice(-1));
  if(windIndex>=0&&(String(key).startsWith('場風 ')||String(key).startsWith('自風 '))){
    const type=String(key).startsWith('場風 ')?'round':'seat';
    return [text('yaku.'+type+'.name',{wind:windName(windIndex,locale)},locale),text('yaku.'+type+'.description',{},locale),kindLabel('可副露',locale)];
  }
  const dragon=['白','發','中'].indexOf(String(key).slice(-1));
  if(String(key).startsWith('翻牌 ')&&dragon>=0){
    const tile=tileName('z'+(dragon+5),locale);
    return [text('yaku.dragon.name',{tile},locale),text('yaku.dragon.description',{tile},locale),kindLabel('可副露',locale)];
  }
  return [text('yaku.unknown.name',{},locale),text('yaku.unknown.description',{},locale),''];
}
const limitIds=['yakuman','counted-yakuman','sanbaiman','baiman','haneman','mangan','basic'];
function legacyLimitRef(limit){
  const id=limitIds.find(id=>entries['shared.limit.'+id][0]===limit);
  if(id)return {key:'shared.limit.'+id};
  const match=/^(\d+) 倍役满$/.exec(limit||'');
  return match?{key:'shared.limit.multiple-yakuman',params:{count:+match[1]}}:null;
}
export function limitName(result,locale=current()){
  if(!result)return '';
  if(result.limitRef)return refText(result.limitRef,locale);
  if(result.damanguan)return text(result.damanguan===1?'limit.yakuman':'limit.multiple-yakuman',{count:result.damanguan},locale);
  const legacy=legacyLimitRef(result.limit);
  if(legacy)return refText(legacy,locale);
  return text('limit.unknown',{},locale);
}
// Compatibility classification for previously generated display objects is deliberately finite.
const legacyErrorIds=Object.keys(entries).filter(key=>key.startsWith('shared.error.')&&!/[{]/.test(entries[key][0]));
function legacyTile(value){
  for(const suit of ['m','p','s','z'])for(let n=suit==='z'?1:0;n<=(suit==='z'?7:9);n++){
    const tile=suit+n;if(tileName(tile,'zh-CN')===value)return tile;
  }
  return '';
}
function legacyErrorRef(message){
  const key=legacyErrorIds.find(key=>entries[key][0]===message);
  if(key)return {key};
  let match=/^请选择 (\d+) 张牌。$/.exec(message||'');
  if(match)return {key:'shared.error.meld-count',params:{count:+match[1]}};
  match=/^手牌需要 (\d+) 张（包含和牌），当前 (\d+) 张。副露请单独录入。$/.exec(message||'');
  if(match)return {key:'shared.error.hand-count',params:{expected:+match[1],actual:+match[2]}};
  match=/^(.+)超过 4 张，请检查手牌、副露和指示牌。$/.exec(message||'');
  if(match&&legacyTile(match[1]))return {key:'shared.error.tile-copies',params:{tile:legacyTile(match[1])}};
  match=/^标准赤宝牌规则中，(.+)最多 1 张。$/.exec(message||'');
  if(match&&legacyTile(match[1]))return {key:'shared.error.red-copies',params:{tile:legacyTile(match[1])}};
  match=/^加副露后手牌最多 (\d+) 张，请先移除对应手牌。$/.exec(message||'');
  return match?{key:'shared.error.hand-after-meld',params:{count:+match[1]}}:null;
}
export function errorMessage(value,locale=current()){
  const ref=value?.messageRef||(value?.key?.startsWith('shared.')?value:null)||legacyErrorRef(typeof value==='string'?value:value?.message);
  return (ref&&refText(ref,locale))||text('error.generic',{},locale);
}
const fuIds=['yakuman','seven-pairs','base','value-pair','tanki','kanchan','penchan','tsumo','closed-ron','open-minimum','rounding','optimal'];
function legacyFuRef(name){
  const id=fuIds.find(id=>entries['shared.fu.'+id][0]===name);
  if(id)return {key:'shared.fu.'+id};
  const match=/^(幺九|中张)(明|暗)(杠|刻) · (.+)$/.exec(name||'');
  if(!match||!legacyTile(match[4]))return null;
  return {key:'shared.fu.'+(match[1]==='幺九'?'terminal':'simple')+'-'+(match[2]==='明'?'open':'closed')+'-'+(match[3]==='杠'?'quad':'triplet'),params:{tile:legacyTile(match[4])}};
}
export function fuDetails(rows,locale=current()){
  return (rows||[]).map(row=>({...copy(row),name:refText(row.nameRef||legacyFuRef(row.name),locale)||text('fu.optimal',{},locale)}));
}
export function scoreResult(state,result,locale=current()){
  if(!result)return result;
  const projected=copy(result);
  if(result.ok===false||result.message)projected.message=errorMessage(result,locale);
  if(result.ok!==false){projected.limit=limitName(result,locale);if(result.fuDetails)projected.fuDetails=fuDetails(result.fuDetails,locale);}
  return projected;
}
function lessonById(id){return TEACHING_EXAMPLES.find(example=>example.id===id);}
function lessonText(id,field,locale){return lessonById(id)?text('lesson.'+id+'.'+field,{},locale):'';}
const meldIds={'吃':'chi','碰':'pon','明杠':'minkan','暗杠':'ankan','加杠':'kakan','杠':'kan'};
const sourceIds={'上家':'left','对家':'opposite','下家':'right','-':'left','=':'opposite','+':'right'};
function tileView(row,locale){return {...copy(row),name:row.tile?tileName(row.tile,locale):text('tile.empty',{},locale),...(row.actual?{actualName:tileName(row.actual,locale)}:{})};}
function contextView(context,locale){
  if(!context)return context;
  const round=context.roundIndex??['东场','南场','西场','北场'].indexOf(context.round);
  const seat=context.seatIndex??['东家','南家','西家','北家'].indexOf(context.seat);
  const method=context.methodKey||(context.method==='自摸'?'tsumo':'ron');
  const riichi=context.riichiLevel??(context.riichi==='双立直'?2:context.riichi==='立直'?1:0);
  const special=context.specialYakuKey||({'岭上开花':'嶺上開花','海底摸月':'海底摸月','河底捞鱼':'河底撈魚','抢杠':'槍槓','天和':'天和','地和':'地和'})[context.special];
  return {...copy(context),round:text('context.round',{wind:windName(round,locale)},locale),seat:text('context.seat',{wind:windName(seat,locale)},locale),role:text(seat===0?'context.dealer':'context.non-dealer',{},locale),method:text('context.'+method,{},locale),riichi:riichi?yakuInfo(riichi===2?'ダブル立直':'立直',locale)[0]:text('context.no-riichi',{},locale),special:special?yakuInfo(special,locale)[0]:''};
}
function targetView(target,locale){return {...copy(target),name:yakuInfo(target.key,locale)[0]};}
function goalView(goal,locale){
  if(!goal)return goal;
  return {...copy(goal),name:lessonText(goal.id,'name',locale),description:lessonText(goal.id,'description',locale),categoryLabel:text('category.'+goal.category,{},locale),targets:(goal.targets||[]).map(target=>targetView(target,locale)),context:contextView(goal.context,locale),indicators:(goal.indicators||[]).map(row=>tileView(row,locale))};
}
function canonicalYaku(row){
  if(row.key||row.yakuKey)return row.key||row.yakuKey;
  return Object.keys(YAKU).find(key=>YAKU[key][0]===row.name)||['場風 東','場風 南','場風 西','場風 北','自風 東','自風 南','自風 西','自風 北','翻牌 白','翻牌 發','翻牌 中'].find(key=>yakuInfo(key,'zh-CN')[0]===row.name);
}
function yakuLabel(row,locale){
  const value=row.fanshu;
  if(typeof value==='string')return text(value.length>1?'limit.multiple-yakuman':'limit.yakuman',{count:value.length},locale);
  if(typeof value==='number')return text('score.han',{count:value},locale);
  let match=/^(\d+) 番$/.exec(row.label||'');if(match)return text('score.han',{count:+match[1]},locale);
  return refText(legacyLimitRef(row.label),locale);
}
function scoreView(score,locale){
  if(!score)return score;
  return {...copy(score),summary:score.yakuman?limitName(score,locale):text('score.summary',{han:score.han,fu:score.fu},locale),limit:limitName(score,locale),yaku:(score.yaku||[]).map(row=>{const info=yakuInfo(canonicalYaku(row),locale);return {...copy(row),name:info[0],description:info[1],label:yakuLabel(row,locale)};}),fuDetails:fuDetails(score.fuDetails,locale),payments:(score.payments||[]).map(row=>{const seat=row.seat??['东','南','西','北'].indexOf(row.wind);return {...copy(row),wind:windName(seat,locale),label:text(seat===0?'score.dealer-payment':'score.payment',{wind:windName(seat,locale)},locale)};})};
}
function meldView(group,locale){
  const type=group.typeKey||meldIds[group.type]||meldIds[group.name];
  const source=sourceIds[group.sourceKey||group.source];
  return {...copy(group),...(group.type?{type:text('meld.'+(type||'kan'),{},locale)}:{}),...(group.name?{name:text('meld.'+(type||'kan'),{},locale)}:{}),...(group.source!=null?{source:source?text('source.'+source,{},locale):''}:{}),...(Array.isArray(group.tiles)?{tiles:group.tiles.map(tile=>typeof tile==='string'?tile:tileView(tile,locale))}:{}),...(group.text!=null?{text:(group.tiles||[]).map(tile=>tileName(typeof tile==='string'?tile:tile.tile,locale)).join(' ')}:{})};
}
function detailView(detail,locale){
  if(!detail)return detail;
  const melds=(detail.melds||[]).map(group=>meldView(group,locale));
  return {...copy(detail),name:lessonText(detail.id,'name',locale),description:lessonText(detail.id,'description',locale),categoryLabel:text('category.'+detail.category,{},locale),targets:(detail.targets||[]).map(target=>targetView(target,locale)),hand:(detail.hand||[]).map(row=>tileView(row,locale)),melds,rowTiles:(detail.rowTiles||[]).map(row=>tileView(row,locale)),meldSummary:melds.map(group=>group.type+' · '+group.tiles.map(tile=>tile.name).join(' ')+(group.source?text('meld.from',{source:group.source},locale):'')),winTileName:tileName(detail.winTile,locale),dora:(detail.dora||[]).map(row=>tileView(row,locale)),context:contextView(detail.context,locale),score:scoreView(detail.score,locale)};
}
function feedbackView(feedback,goal,locale){
  if(!feedback)return feedback;
  const code=feedback.code,titleCode=['lesson','draft','invalid','meld','count','shape','open','target','correct'].includes(code)?code:'adjust';
  const projected={...copy(feedback),title:refText(feedback.titleRef,locale)||text('judge.'+titleCode+'.title',{},locale)};
  if(['lesson','draft','invalid','open','correct'].includes(code))projected.message=text('judge.'+code+'.message',{},locale);
  else if(code==='target'){
    const missing=feedback.missingKeys||(feedback.missing||[]).map(name=>Object.keys(YAKU).find(key=>YAKU[key][0]===name)||['翻牌 白','翻牌 發','翻牌 中'].find(key=>yakuInfo(key,'zh-CN')[0]===name));
    projected.missing=missing.map(key=>yakuInfo(key,locale)[0]);
    projected.message=text('judge.target.message',{missing:projected.missing.join(locale==='en'?', ':'、'),description:lessonText(feedback.lessonId||goal?.id,'description',locale)},locale);
  }else projected.message=errorMessage(feedback,locale);
  if(feedback.detail)projected.detail=detailView(feedback.detail,locale);
  return projected;
}
function exerciseView(exercise,locale){
  if(!exercise)return exercise;
  return {...copy(exercise),goal:goalView(exercise.goal,locale),rowTiles:(exercise.rowTiles||[]).map(row=>tileView(row,locale)),groups:(exercise.groups||[]).map(group=>meldView(group,locale)),palette:(exercise.palette||[]).map(row=>tileView(row,locale)),groupTypes:(exercise.groupTypes||[]).map(group=>({...copy(group),name:text('meld.'+group.id,{},locale)})),draftTiles:(exercise.draftTiles||[]).map(row=>tileView(row,locale)),error:exercise.error?errorMessage({message:exercise.error,messageRef:exercise.errorRef},locale):'',feedback:feedbackView(exercise.feedback,exercise.goal,locale)};
}
export function teachingSnapshot(snapshot,locale=current()){
  if(!snapshot)return snapshot;
  // Project each public display field explicitly. Canonical IDs and exercise state stay intact.
  return {...copy(snapshot),categories:(snapshot.categories||[]).map(category=>({...copy(category),name:text('category.'+category.id,{},locale)})),examples:(snapshot.examples||[]).map(example=>({...copy(example),name:lessonText(example.id,'name',locale),description:lessonText(example.id,'description',locale),categoryLabel:text('category.'+example.category,{},locale),tiles:(example.tiles||[]).map(row=>tileView(row,locale)),winTileName:tileName(example.winTile,locale),summary:refText(example.summaryRef,locale)||(example.summary?.includes('番')?text('score.summary',{han:+example.summary.split(' ')[0],fu:+example.summary.split(' ')[2]},locale):refText(legacyLimitRef(example.summary),locale))})),detail:detailView(snapshot.detail,locale),exercise:exerciseView(snapshot.exercise,locale)};
}
export function practiceFields(fields,locale=current()){
  return (fields||[]).map(field=>{
    let label=refText(field.labelRef,locale),unit=field.key==='han'?'han':field.key==='fu'?'fu':'points';
    if(!label){
      if(field.key==='han'||field.key==='fu')label=text('practice.'+field.key,{},locale);
      else if(/^pay[0-3]$/.test(field.key)){const seat=+field.key.slice(-1);label=text(seat===0?'practice.dealer-payment':'practice.payment',{wind:windName(seat,locale)},locale);}
      else if(field.key==='total')label=text(field.includesSticks||field.label?.includes('含供托')?'practice.total-sticks':'practice.total',{},locale);
      else label=text('practice.total',{},locale);
    }
    return {...copy(field),label,unit:text('unit.'+unit,{},locale)};
  });
}
