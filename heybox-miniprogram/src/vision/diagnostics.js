export const VISION_CHECKPOINT_KEY='hela_ui_polish_checkpoint_v1';
export const PHASE_LABELS={
  start:'开始识别',runtime:'准备识别引擎',load_main:'加载与准备主模型分段',init_main:'初始化主模型',run_main:'主模型分段计算',
  load_aux:'加载与准备辅助模型分段',init_aux:'初始化辅助模型',run_aux:'辅助模型分段计算',
  read_main:'读取主模型分段结果',read_aux:'读取辅助模型分段结果',release_main:'释放主模型分段资源',release_aux:'释放辅助模型分段资源',
  complete:'识别完成',error:'识别返回错误',cancelled:'识别已取消'
};
let sequence=0,active=0,writes=Promise.resolve();
export function createVisionJournal(adapter,{version='0.3.11'}={}){
  function save(token,phase,status='running',pass,segment){
    if(!Object.hasOwn(PHASE_LABELS,phase))return Promise.resolve();
    const job=writes.then(async()=>{
      if(token!==active)return;
      // Local bounded checkpoint only: no image, file name, path, hand or token.
      const record={schema:1,version,phase,status,time:Date.now()};
      if(Number.isSafeInteger(pass)&&pass>0&&pass<1000)record.pass=pass;
      if(Number.isSafeInteger(segment)&&segment>0&&segment<1000)record.segment=segment;
      console.info('[hela-vision] '+phase+' · '+status+(record.segment?' · segment '+record.segment:''));
      try{await adapter?.write?.(VISION_CHECKPOINT_KEY,record);}catch{}
    });
    writes=job.catch(()=>{});return writes;
  }
  return {
    async previous(){
      try{
        const record=await adapter?.read?.(VISION_CHECKPOINT_KEY);
        if(record?.schema===1&&record.status==='running'&&Object.hasOwn(PHASE_LABELS,record.phase))return {phase:record.phase,label:PHASE_LABELS[record.phase]+(Number.isSafeInteger(record.pass)&&record.pass>0&&record.pass<1000?'（第 '+record.pass+' 次）':'')+(Number.isSafeInteger(record.segment)&&record.segment>0&&record.segment<1000?' · 第 '+record.segment+' 段':'')};
      }catch{}
      return null;
    },
    async begin(){const token=++sequence;active=token;await save(token,'start');return token;},
    stage:(token,phase,pass,segment)=>save(token,phase,'running',pass,segment),
    finish:(token,status)=>save(token,status,status)
  };
}
