const cancelled=()=>new DOMException('已取消选择照片','AbortError');

// These are genuine Web File inputs, independent of SDK file grants.
// Mount outside PhotoPage's render target so redraws cannot remove the picker.
export function createWebPhotoPicker(doc=document){
  const inputs=new Map();let pending=null,disposed=false;
  const finish=(error,file)=>{
    if(!pending)return;
    const task=pending;pending=null;
    for(const input of inputs.values())input.value='';
    if(error)task.reject(error);else task.resolve(file);
  };
  for(const source of ['gallery','camera']){
    const input=doc.createElement('input');
    input.type='file';input.accept='image/*';input.hidden=true;input.tabIndex=-1;
    input.setAttribute('data-hela-photo-source',source);
    if(source==='camera')input.setAttribute('capture','environment');
    input.addEventListener('change',()=>{
      if(disposed||pending?.source!==source)return;
      const file=input.files?.[0];finish(file?null:cancelled(),file);
    });
    input.addEventListener('cancel',()=>{if(pending?.source===source)finish(cancelled());});
    doc.body.appendChild(input);inputs.set(source,input);
  }
  return {
    pick(source='gallery'){
      if(disposed)return Promise.reject(cancelled());
      if(!inputs.has(source))return Promise.reject(new TypeError('无效的照片入口'));
      if(pending)return Promise.reject(new Error('请先完成当前照片选择'));
      const input=inputs.get(source);input.value='';
      return new Promise((resolve,reject)=>{
        pending={source,resolve,reject};
        // Synchronous inside the original trusted click, before any await.
        try{input.click();}catch(error){finish(error);}
      });
    },
    dispose(){
      if(disposed)return;
      disposed=true;finish(cancelled());
      for(const input of inputs.values())input.remove();
      inputs.clear();
    }
  };
}
