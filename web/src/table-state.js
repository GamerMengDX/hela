const fail=message=>{throw new Error(message);};
export function validateTable(t){
  if(!t||t.version!==1||!Array.isArray(t.players)||t.players.length!==4||!Array.isArray(t.records)||!Array.isArray(t.riichi)||t.riichi.length!==4)fail('本地牌桌记录异常，请先导出记录后重新开桌');
  if(!Number.isInteger(t.dealer)||t.dealer<0||t.dealer>3||!Number.isInteger(t.round)||t.round<0||t.round>3||!Number.isInteger(t.kyoku)||t.kyoku<1||t.kyoku>4||!Number.isInteger(t.honba)||t.honba<0||t.honba>99||!Number.isInteger(t.pot)||t.pot<0||t.pot>99000||t.pot%1000||!Number.isInteger(t.handNo)||!Number.isInteger(t.revision)||!['playing','settled','finished'].includes(t.phase))fail('本地牌桌数据异常');
  if(typeof t.id!=='string'||!t.id||!Number.isInteger(t.initial)||t.initial<1000||t.initial>100000||t.initial%1000||t.handNo<1||t.revision<0||t.players.some(p=>!p||typeof p.name!=='string'||!p.name||!Number.isSafeInteger(p.points))||t.riichi.some(n=>typeof n!=='boolean'))fail('玩家记录异常');
  if(t.players.reduce((sum,p)=>sum+p.points,0)+t.pot!==t.initial*4)fail('点棒总额校验失败，暂不进行结算');
  if(t.records.some(record=>!record||typeof record.id!=='string'||typeof record.title!=='string'||typeof record.label!=='string'||!Array.isArray(record.changes)||record.changes.length!==4||record.changes.some(n=>!Number.isSafeInteger(n))))fail('本地牌桌记账记录异常');
}
