import {calculate,defaultState,inventory,normalize,validateInventory,WINDS} from './engine.js';

const displayError=(message,key,params={})=>Object.assign(new Error(message),{messageRef:{key:'shared.error.'+key,params}});
const tiles=['m','p','s'].flatMap(s=>Array.from({length:9},(_,i)=>s+(i+1))).concat(Array.from({length:7},(_,i)=>'z'+(i+1)));
const pick=(items,rng)=>items[Math.floor(rng()*items.length)];
const integer=(max,rng)=>Math.floor(rng()*max);
function shuffle(items,rng){const a=items.slice();for(let i=a.length-1;i>0;i--){const j=integer(i+1,rng);[a[i],a[j]]=[a[j],a[i]];}return a;}
function group(rng,suit,onlySequences=false){const s=suit||pick(['m','p','s'],rng);if(onlySequences||rng()<.7){const n=1+integer(7,rng);return [s+n,s+(n+1),s+(n+2)];}const t=s+ (1+integer(9,rng));return [t,t,t];}

// Generate new physical hands, then let the same scoring engine reject invalid/no-yaku cases.
export function generatePractice(level='basic',rng=Math.random){
  if(!['basic','normal','advanced'].includes(level))level='basic';
  for(let attempt=0;attempt<1000;attempt++){
    const state={...defaultState(),hand:[],melds:[],dora:[],ura:[],riichi:0,ippatsu:false,special:'none',honba:0,sticks:0};
    state.seat=integer(4,rng);state.round=integer(2,rng);state.loser=(state.seat+1+integer(3,rng))%4;state.method=rng()<.5?'ron':'tsumo';
    const kind=level==='advanced'?pick(['standard','standard','seven','flush','kong','kokushi'],rng):level==='normal'?pick(['standard','standard','open','seven'],rng):'standard';
    if(kind==='kokushi'){
      const terminals=tiles.filter(t=>t[0]==='z'||t[1]==='1'||t[1]==='9');state.hand=terminals.concat(pick(terminals,rng));
    }else if(kind==='seven'){
      state.hand=shuffle(tiles,rng).slice(0,7).flatMap(t=>[t,t]);state.riichi=rng()<.4?1:0;
    }else{
      const suit=kind==='flush'?pick(['m','p','s'],rng):null;
      const pair=pick(suit?tiles.filter(t=>t[0]===suit):tiles,rng);state.hand=[pair,pair];
      if(kind==='open'||kind==='kong'){
        const t='z'+(5+integer(3,rng));state.melds=[kind==='kong'?t[0]+t[1].repeat(4):t[0]+t[1].repeat(3)+'-'];
      }
      for(let i=state.melds.length;i<4;i++)state.hand.push(...group(rng,suit,level==='basic'));
      state.riichi=kind==='open'?0:kind==='flush'&&rng()<.5?0:1;
      if(kind==='kong'&&rng()<.45){state.special='rinshan';state.method='tsumo';}
    }
    if(level!=='basic'){
      state.honba=integer(4,rng);state.sticks=integer(3,rng);
      if(state.riichi&&!state.special.includes('rinshan'))state.ippatsu=rng()<.12;
      if(state.special==='none'&&!state.ippatsu&&rng()<.12)state.special='last';
      const redSuits=new Set();state.hand=state.hand.map(t=>t[1]==='5'&&t[0]!=='z'&&!redSuits.has(t[0])&&rng()<.2?(redSuits.add(t[0]),t[0]+'0'):t);
    }
    try{validateInventory(inventory(state));}catch{continue;}
    const indicatorCount=1+state.melds.filter(m=>m.replace(/[^0-9]/g,'').length===4).length;
    for(let n=0;n<indicatorCount;n++){const choices=tiles.filter(t=>inventory(state).filter(x=>normalize(x)===t).length<4);state.dora.push(pick(choices,rng));}
    if(level!=='basic'&&state.riichi)for(let n=0;n<indicatorCount;n++){const choices=tiles.filter(t=>inventory(state).filter(x=>normalize(x)===t).length<4);state.ura.push(pick(choices,rng));}
    const shuffled=shuffle(state.hand,rng),winning=shuffled.pop();
    state.hand=shuffled.sort((a,b)=>tiles.indexOf(normalize(a))-tiles.indexOf(normalize(b))).concat(winning);state.winIndex=state.hand.length-1;
    const result=calculate(state);if(!result.ok)continue;
    if(level==='basic'&&(result.damanguan||result.fanshu>4))continue;
    return {state,result,level};
  }
  throw displayError('暂时无法生成题目，请重试。','practice-generate');
}

export function practiceFields(question){
  const {state,result}=question,fields=[];
  if(!result.damanguan)fields.push({key:'han',label:'总番数',labelRef:{key:'shared.practice.han'},unit:'番',expected:result.fanshu},{key:'fu',label:'符数',labelRef:{key:'shared.practice.fu'},unit:'符',expected:result.fu});
  result.fenpei.forEach((n,i)=>{if(n<0)fields.push({key:'pay'+i,label:WINDS[i]+'家支付'+(i===0?'（庄家）':''),labelRef:{key:i===0?'shared.practice.dealer-payment':'shared.practice.payment',params:{windIndex:i}},unit:'点',expected:-n});});
  fields.push({key:'total',label:'和牌者总获得'+(state.sticks?'（含供托）':''),labelRef:{key:state.sticks?'shared.practice.total-sticks':'shared.practice.total'},includesSticks:!!state.sticks,unit:'点',expected:result.total});
  return fields;
}
export function checkPractice(question,answers){
  return practiceFields(question).map(field=>({...field,correct:/^\d+$/.test(String(answers[field.key]??'').trim())&&Number(answers[field.key])===field.expected}));
}
