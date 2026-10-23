import {teachingExample,teachingExamples,validTeachingIndex} from './teaching-model.js';
import {TEACHING_CATEGORIES} from './teaching-examples.js';
import {createTeachingExercise} from './teaching-exercise.js';
export * from './teaching-model.js';
export {TEACHING_CATEGORIES} from './teaching-examples.js';
export {createTeachingExercise} from './teaching-exercise.js';
const copy=value=>JSON.parse(JSON.stringify(value));
export function createTeachingBrowser(){
  let stage='',selectedIndex=-1,category='all';
  const catalog=teachingExamples(),exercises=new Map();
  const snapshot=()=>({stage,selectedIndex,category,total:catalog.length,categories:copy(TEACHING_CATEGORIES),
    examples:stage==='list'?copy(catalog.filter(ex=>category==='all'||ex.category===category)):[],
    detail:stage==='detail'?teachingExample(selectedIndex):null,
    exercise:stage==='practice'?exercises.get(selectedIndex).snapshot():null});
  return {
    snapshot,
    open(){stage='list';return snapshot();},
    select(index){if(validTeachingIndex(index)){selectedIndex=index;stage='detail';}return snapshot();},
    filter(value){if(TEACHING_CATEGORIES.some(c=>c.id===value))category=value;return snapshot();},
    try(){if(validTeachingIndex(selectedIndex)){if(!exercises.has(selectedIndex))exercises.set(selectedIndex,createTeachingExercise(selectedIndex));stage='practice';}return snapshot();},
    exercise(action,value){if(stage==='practice')exercises.get(selectedIndex).act(action,value);return snapshot();},
    back(){stage=stage==='practice'?'detail':'list';return snapshot();},
    toList(){stage='list';return snapshot();},
    close(){stage='';return snapshot();}
  };
}
