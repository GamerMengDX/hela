import Majiang from '@kobalab/majiang-core';
const {Shoupai,Shan,rule,Util:scoring}=Majiang;
const displayError=(message,key,params={})=>Object.assign(new Error(message),{messageRef:{key:'shared.error.'+key,params}});

export const WINDS = ['东', '南', '西', '北'];
export const normalize = t => t[0] + (t[1] === '0' ? '5' : t[1]);
export const validTile = t => /^[mps][0-9]$|^z[1-7]$/.test(t);
export function tileName(t) {
  if (!validTile(t)) return '未知牌';
  return t[0] === 'z' ? ['东', '南', '西', '北', '白', '发', '中'][+t[1]-1] : (t[1] === '0' ? '赤五' : ['零','一','二','三','四','五','六','七','八','九'][+t[1]]) + {m:'万',p:'筒',s:'索'}[t[0]];
}
export function parseNotation(input) {
  const text = input.toLowerCase().replace(/\s/g, '');
  if (!text) return [];
  if (!/^(?:[0-9]+[mpsz])+$/.test(text)) throw displayError('请使用「234m345p456678s66p」格式，m 万、p 筒、s 索、z 字牌。','notation-format');
  const result = [];
  for (const [,digits,suit] of text.matchAll(/([0-9]+)([mpsz])/g)) {
    for (const n of digits) {
      if (!validTile(suit+n)) throw displayError('字牌只允许 1–7z；赤五用 0m、0p、0s。','notation-tile');
      result.push(suit+n);
    }
  }
  return result;
}
export function notation(tiles) {
  return ['m','p','s','z'].map(s => tiles.some(t=>t[0]===s) ? tiles.filter(t=>t[0]===s).map(t=>t[1]).join('')+s : '').join('');
}
export const doraFrom = t => Shan.zhenbaopai(t);
export function meldTiles(m) { return m.slice(1).replace(/[^0-9]/g,'').split('').map(n=>m[0]+n); }
export function makeMeld(type, tiles, direction='-') {
  const required = ['ankan','minkan','kakan'].includes(type) ? 4 : 3;
  if (tiles.length !== required) throw displayError(`请选择 ${required} 张牌。`,'meld-count',{count:required});
  if (tiles.some(t=>!validTile(t)) || tiles.some(t=>t[0]!==tiles[0][0])) throw displayError('一个副露必须由同一种花色组成。','meld-suit');
  const sorted = [...tiles].sort((a,b)=>(+a[1]||5)-(+b[1]||5) || +a[1]-+b[1]);
  const numbers = sorted.map(t=>t[1]);
  const normalized = sorted.map(t=>+t[1]||5);
  if (type==='chi') {
    if (tiles[0][0]==='z' || normalized[1]!==normalized[0]+1 || normalized[2]!==normalized[1]+1) throw displayError('吃牌需要同花色的三张连续数牌，例如二三四万。','chi-shape');
    direction='-';
  } else if (normalized.some(n=>n!==normalized[0])) throw displayError('碰、杠需要三张或四张相同的牌。','triplet-shape');
  let m = sorted[0][0]+numbers.join('') + (type==='ankan' ? '' : direction);
  if (type==='kakan') m = sorted[0][0]+numbers.slice(0,3).join('')+direction+numbers[3];
  const result = Shoupai.valid_mianzi(m);
  if (!result) throw displayError('副露牌型不合法，请检查所选的牌。','meld-invalid-selection');
  return result;
}
export function defaultState() {
  return {hand:parseNotation('234m34566p45667s8s'),winIndex:13,melds:[],dora:['p3'],ura:[],round:0,seat:1,loser:2,method:'ron',riichi:1,ippatsu:false,special:'none',honba:0,sticks:0,rules:{openTanyao:true,kiriage:false,doubleYakuman:true,kazoe:true,doubleWindFu:true}};
}
export function inventory(state, indicators=true) {
  return [...state.hand,...state.melds.flatMap(meldTiles),...(indicators?state.dora:[]),...(indicators?state.ura:[])];
}
export function validateInventory(tiles) {
  const counts={},red={};
  for (const t of tiles) {
    if (!validTile(t)) throw displayError('包含无法识别的麻将牌。','tile-invalid');
    const n=normalize(t); counts[n]=(counts[n]||0)+1;
    if (counts[n]>4) throw displayError(`${tileName(n)}超过 4 张，请检查手牌、副露和指示牌。`,'tile-copies',{tile:n});
    if (t[1]==='0' && (red[t[0]]=(red[t[0]]||0)+1)>1) throw displayError(`标准赤宝牌规则中，${tileName(t)}最多 1 张。`,'red-copies',{tile:t});
  }
}
export function calculate(state) {
  try {
    if (state.melds.length>4) throw displayError('最多录入 4 组副露。','too-many-melds');
    if (state.melds.some(m=>!Shoupai.valid_mianzi(m))) throw displayError('副露牌型不合法。','meld-invalid');
    validateInventory(inventory(state));
    const expected=14-state.melds.length*3;
    if (state.hand.length!==expected) return {ok:false,code:'count',message:`手牌需要 ${expected} 张（包含和牌），当前 ${state.hand.length} 张。副露请单独录入。`,messageRef:{key:'shared.error.hand-count',params:{expected,actual:state.hand.length}}};
    if (!state.hand[state.winIndex]) throw displayError('点击手牌，选出最后和到的那一张牌。','winning-tile');
    const closed=state.melds.every(m=>!/[+=-]/.test(m));
    const kongs=state.melds.some(m=>meldTiles(m).length===4);
    if (!closed && state.riichi) throw displayError('吃、碰或明杠之后不能立直，请取消立直。','open-riichi');
    if (state.ippatsu && !state.riichi) throw displayError('一发必须在立直状态下成立。','ippatsu-riichi');
    if (state.ippatsu && ['rinshan','chankan','first'].includes(state.special)) throw displayError('一发不能与岭上开花、抢杠或天和/地和同时成立。','ippatsu-special');
    if (state.special==='rinshan' && (state.method!=='tsumo' || !kongs)) throw displayError('岭上开花需要自己有杠，并以自摸和牌。','rinshan');
    if (state.special==='chankan' && state.method!=='ron') throw displayError('抢杠需要以荣和和牌。','chankan');
    if (state.special==='first' && (state.method!=='tsumo' || state.melds.length || state.riichi)) throw displayError('天和/地和需要无副露、无立直的第一巡自摸。','first-turn');
    if (state.dora.length>5 || state.ura.length>5) throw displayError('宝牌和里宝牌指示牌各最多 5 张。','indicator-count');
    if (state.ura.length>state.dora.length) throw displayError('里宝牌指示牌不能多于宝牌指示牌。','ura-count');
    if (![state.round,state.seat,state.loser].every(n=>Number.isInteger(n)&&n>=0&&n<4)) throw displayError('风位参数无效。','wind-invalid');
    if (state.method==='ron' && state.loser===state.seat) throw displayError('放铳者不能是自己。','self-ron');
    if (![state.honba,state.sticks].every(n=>Number.isInteger(n)&&n>=0&&n<=99)) throw displayError('本场和供托请输入 0–99 之间的整数。','counters');
    const winning=state.hand[state.winIndex];
    const concealed=state.hand.filter((_,i)=>i!==state.winIndex);
    const hand=Shoupai.fromString(['m','p','s','z'].map(s=>concealed.some(t=>t[0]===s)?s+concealed.filter(t=>t[0]===s).map(t=>t[1]).join(''):'').join('')+(state.melds.length?','+state.melds.join(','):''));
    const rong=state.method==='ron'?winning+({1:'+',2:'=',3:'-'}[(state.loser-state.seat+4)%4]):null;
    if (state.method==='tsumo') hand.zimo(winning);
    const param=scoring.hule_param({
      rule:rule({'クイタンあり':state.rules.openTanyao,'切り上げ満貫あり':state.rules.kiriage,'ダブル役満あり':state.rules.doubleYakuman,'数え役満あり':state.rules.kazoe,'連風牌は2符':!state.rules.doubleWindFu}),
      zhuangfeng:state.round,menfeng:state.seat,lizhi:state.riichi,yifa:state.ippatsu,
      lingshang:state.special==='rinshan',qianggang:state.special==='chankan',haidi:state.special==='last'?(state.method==='tsumo'?1:2):0,tianhu:state.special==='first'?(state.seat===0?1:2):0,
      baopai:state.dora,fubaopai:state.riichi?state.ura:null,changbang:state.honba,lizhibang:state.sticks
    });
    const result=scoring.hule(hand,rong,param);
    if (!result) return {ok:false,code:'shape',message:'这副牌还没有构成和牌。通常需要四组面子和一对雀头，七对子与国士无双除外。',messageRef:{key:'shared.error.shape'}};
    if (!result.hupai?.length) return {ok:false,code:'no-yaku',message:'牌型已和，但没有役。宝牌不能单独作为和牌的役；请检查立直、自摸和其他和牌条件。',messageRef:{key:'shared.error.no-yaku'}};
    return {ok:true,...result,closed,total:result.fenpei[state.seat],limit:limitName(result,state.rules),limitRef:limitReference(result,state.rules),fuDetails:fuDetails(scoring.hule_mianzi(hand,rong),result,state)};
  } catch(e) { return {ok:false,code:'invalid',message:e.message||'请检查牌局信息。',messageRef:e.messageRef||{key:'shared.error.generic'}}; }
}
function limitName(r,rules) {
  if (r.damanguan) return r.damanguan===1?'役满':`${r.damanguan} 倍役满`;
  if(r.fanshu>=13 && rules.kazoe) return '累计役满';
  if(r.fanshu>=11) return '三倍满';
  if(r.fanshu>=8) return '倍满';
  if(r.fanshu>=6) return '跳满';
  if(r.fanshu>=5 || r.fu*2**(r.fanshu+2)>=2000 || (rules.kiriage && r.fu*2**(r.fanshu+2)===1920)) return '满贯';
  return '基本点';
}
function limitReference(r,rules) {
  const label=limitName(r,rules);
  const key=({'役满':'yakuman','累计役满':'counted-yakuman','三倍满':'sanbaiman','倍满':'baiman','跳满':'haneman','满贯':'mangan','基本点':'basic'})[label];
  if(key)return {key:'shared.limit.'+key};
  const multiple=/^(\d+) 倍役满$/.exec(label);
  return {key:'shared.limit.multiple-yakuman',params:{count:+multiple[1]}};
}
const fuRow=(name,fu,key,params={})=>({name,fu,nameRef:{key:'shared.fu.'+key,params}});
function fuDetails(forms,result,state) {
  if (result.damanguan) return [fuRow('役满不使用符数计算',null,'yakuman')];
  if (result.hupai.some(y=>y.name==='七対子')) return [fuRow('七对子固定符数，不进位',25,'seven-pairs')];
  for (const form of forms.filter(f=>f.length===5)) {
    const rows=[fuRow('副底',20,'base')];
    const pair=form[0], pairN=+pair[1];
    if(pair[0]==='z') {
      let pairFu=pairN>=5?2:(pairN===state.round+1?2:0)+(pairN===state.seat+1?2:0);
      if(!state.rules.doubleWindFu) pairFu=Math.min(2,pairFu);
      if(pairFu) rows.push(fuRow('役牌雀头',pairFu,'value-pair'));
    }
    if(/^[mpsz](\d)\1[+=_-]!$/.test(pair)) rows.push(fuRow('单骑等待',2,'tanki'));
    for(const m of form.slice(1)) {
      const digits=m.slice(1).replace(/[^0-9]/g,'');
      if([...digits].every(n=>n===digits[0])) {
        const terminal=m[0]==='z'||['1','9'].includes(digits[0]);
        const open=/[+=-]/.test(m);
        const kong=digits.length===4;
        rows.push(fuRow(`${terminal?'幺九':'中张'}${open?'明':'暗'}${kong?'杠':'刻'} · ${tileName(m[0]+digits[0])}`,2*(terminal?2:1)*(open?1:2)*(kong?4:1),(terminal?'terminal':'simple')+'-'+(open?'open':'closed')+'-'+(kong?'quad':'triplet'),{tile:m[0]+digits[0]}));
      } else if(/^[mps]\d\d[+=_-]!\d$/.test(m)) rows.push(fuRow('嵌张等待',2,'kanchan'));
      else if(/^[mps](123[+=_-]!|7[+=_-]!89)$/.test(m)) rows.push(fuRow('边张等待',2,'penchan'));
    }
    const menzen=state.melds.every(m=>!/[+=-]/.test(m));
    const pinfu=menzen&&rows.reduce((n,r)=>n+r.fu,0)===20;
    if(pinfu!==result.hupai.some(y=>y.name==='平和')) continue;
    if(state.method==='tsumo'&&!pinfu) rows.push(fuRow('自摸',2,'tsumo'));
    if(state.method==='ron'&&menzen) rows.push(fuRow('门清荣和',10,'closed-ron'));
    let total=rows.reduce((n,r)=>n+r.fu,0);
    if(state.method==='ron'&&!menzen&&total===20) {rows.push(fuRow('副露荣和最低 30 符',10,'open-minimum'));total=30;}
    const rounded=Math.ceil(total/10)*10;
    if(rounded===result.fu) {
      if(rounded>total) rows.push(fuRow('向上进位到整十符',rounded-total,'rounding'));
      return rows;
    }
  }
  return [fuRow('按最优和牌形计算（已进位）',result.fu,'optimal')];
}
