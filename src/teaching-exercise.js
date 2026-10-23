import {validTile,normalize,validateInventory,makeMeld,meldTiles,tileName} from './engine.js';
import {teachingState,teachingGoal,judgeTeachingExercise} from './teaching-model.js';
const displayError=(message,key,params={})=>Object.assign(new Error(message),{messageRef:{key:'shared.error.'+key,params}});
const copy=value=>JSON.parse(JSON.stringify(value));
export const TEACHING_MELD_TYPES=[{id:'chi',name:'吃',nameRef:{key:'shared.meld.chi'}},{id:'pon',name:'碰',nameRef:{key:'shared.meld.pon'}},{id:'minkan',name:'明杠',nameRef:{key:'shared.meld.minkan'}},{id:'ankan',name:'暗杠',nameRef:{key:'shared.meld.ankan'}},{id:'kakan',name:'加杠',nameRef:{key:'shared.meld.kakan'}}];
const required=type=>['minkan','ankan','kakan'].includes(type)?4:3;
const initial=()=>({hand:[],melds:[],winIndex:-1,suit:'m',red:false,target:'hand',meldType:'pon',meldDraft:[],winMode:false});
export function createTeachingExercise(index){
  const fixed=teachingState(index);if(!fixed)throw displayError('练习不存在','lesson-missing');
  let state=initial(),feedback=null,error='',errorRef=null,history=[];
  const expected=()=>14-state.melds.length*3;
  const checkpoint=()=>{history.push(copy(state));history=history.slice(-30);feedback=null;error='';errorRef=null;};
  const sync=()=>{state.winIndex=state.hand.length===expected()?(state.winIndex>=0&&state.winIndex<state.hand.length?state.winIndex:state.hand.length-1):-1;if(state.winIndex<0)state.winMode=false;};
  const allTiles=()=>[...state.hand,...state.melds.flatMap(meldTiles),...state.meldDraft,...fixed.dora,...fixed.ura];
  function snapshot(){
    const counts={},redUsed=new Set();for(const tile of allTiles()){counts[normalize(tile)]=(counts[normalize(tile)]||0)+1;if(tile[1]==='0')redUsed.add(tile[0]);}
    const full=state.target==='hand'?state.hand.length>=expected():state.meldDraft.length>=required(state.meldType);
    const palette=Array.from({length:state.suit==='z'?7:9},(_,n)=>{const tile=state.suit+(n===4&&state.red&&state.suit!=='z'?'0':n+1);return {tile,name:tileName(tile),count:counts[normalize(tile)]||0,disabled:full||(counts[normalize(tile)]||0)>=4||(tile[1]==='0'&&redUsed.has(tile[0]))};});
    const slots=Array.from({length:expected()},(_,n)=>({tile:state.hand[n]||'',name:state.hand[n]?tileName(state.hand[n]):'待补牌',index:n,kind:'hand',empty:!state.hand[n],winning:n===state.winIndex}));
    const groups=state.melds.map((meld,n)=>({index:n,typeKey:!/[+=-]/.test(meld)?'ankan':meldTiles(meld).length===4?'kan':meldTiles(meld).map(normalize).every(t=>t===normalize(meldTiles(meld)[0]))?'pon':'chi',name:!/[+=-]/.test(meld)?'暗杠':meldTiles(meld).length===4?'杠':meldTiles(meld).map(normalize).every(t=>t===normalize(meldTiles(meld)[0]))?'碰':'吃',text:meldTiles(meld).map(tileName).join(' '),tiles:meldTiles(meld)}));
    const rowTiles=[...slots,...groups.flatMap(g=>g.tiles.map((tile,n)=>({tile,name:tileName(tile),kind:'meld',groupIndex:g.index,groupStart:n===0})))].map((tile,rowIndex)=>({...tile,rowIndex}));
    return {goal:teachingGoal(index),...copy(state),handCount:state.hand.length,meldCount:state.melds.length,expected:expected(),remaining:expected()-state.hand.length,rowTiles,groups,palette,
      groupTypes:copy(TEACHING_MELD_TYPES),draftTiles:state.meldDraft.map((tile,n)=>({tile,name:tileName(tile),index:n})),required:required(state.meldType),canUndo:history.length>0,canJudge:state.hand.length===expected()&&!state.meldDraft.length,error,errorRef,feedback:feedback?copy(feedback):null};
  }
  function act(action,value){
    error='';errorRef=null;
    try{
      if(action==='suit'){if(['m','p','s','z'].includes(value))state.suit=value;}
      else if(action==='red'){if(state.suit!=='z')state.red=!state.red;}
      else if(action==='add'){
        if(!validTile(value))throw displayError('请选择有效牌面','choose-valid');
        const list=state.target==='hand'?state.hand:state.meldDraft,limit=state.target==='hand'?expected():required(state.meldType);
        if(list.length>=limit)throw displayError(state.target==='hand'?'手牌已满，请先移除一张牌。':'这组副露已选满。',state.target==='hand'?'hand-full':'meld-full');
        validateInventory([...allTiles(),value]);checkpoint();list.push(value);sync();
      }else if(action==='hand'){
        if(!Number.isInteger(value)||!state.hand[value])return snapshot();checkpoint();
        if(state.winMode)state.winIndex=value;else state.hand.splice(value,1);sync();
      }else if(action==='win'){if(state.hand.length!==expected())throw displayError('补齐手牌后再指定和牌。','fill-before-win');state.winMode=!state.winMode;}
      else if(action==='begin-meld'){if(state.melds.length>=4)throw displayError('最多四组副露。','exercise-meld-limit');state.target='meld';feedback=null;}
      else if(action==='input-hand'){if(state.meldDraft.length)throw displayError('请先确认或取消副露选牌。','confirm-meld-first');state.target='hand';}
      else if(action==='meld-type'){
        if(!TEACHING_MELD_TYPES.some(t=>t.id===value))return snapshot();
        if(state.meldDraft.length>required(value))throw displayError('先从副露选牌中移除多余的牌。','remove-draft-extra');state.meldType=value;
      }else if(action==='draft-remove'){if(Number.isInteger(value)&&state.meldDraft[value]){checkpoint();state.meldDraft.splice(value,1);}}
      else if(action==='cancel-meld'){if(state.meldDraft.length)checkpoint();state.meldDraft=[];state.target='hand';}
      else if(action==='confirm-meld'){
        const meld=makeMeld(state.meldType,state.meldDraft,'-');
        if(state.hand.length>14-(state.melds.length+1)*3)throw displayError('加副露后手牌最多 '+(14-(state.melds.length+1)*3)+' 张，请先移除对应手牌。','hand-after-meld',{count:14-(state.melds.length+1)*3});
        checkpoint();state.melds.push(meld);state.meldDraft=[];state.target='hand';sync();
      }else if(action==='remove-meld'){if(Number.isInteger(value)&&state.melds[value]){checkpoint();state.melds.splice(value,1);sync();}}
      else if(action==='clear'){checkpoint();state=initial();}
      else if(action==='undo'){if(history.length){state=history.pop();feedback=null;}}
      else if(action==='judge')feedback=judgeTeachingExercise(index,state);
    }catch(caught){error=caught.message;errorRef=caught.messageRef||{key:'shared.error.generic'};}
    return snapshot();
  }
  return {snapshot,act};
}
