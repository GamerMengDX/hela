import hbSDK from '@heybox/hb-sdk';

export const platform={
  async ready(){
    const state=hbSDK.getHandshakeState();
    if(state.status==='ready')return;
    if(state.status==='failed')throw new Error('小黑盒连接未就绪，请重新进入小程序');
    await new Promise((resolve,reject)=>{
      let stop=()=>{};
      stop=hbSDK.onHandshakeStateChange(next=>{
        if(next.status==='ready'){queueMicrotask(()=>stop());resolve();}
        if(next.status==='failed'){queueMicrotask(()=>stop());reject(new Error('小黑盒连接未就绪，请重新进入小程序'));}
      });
    });
  },
  async read(key){const result=await hbSDK.storage.getStorage({key});return result.data;},
  async write(key,data){await hbSDK.storage.setStorage({key,data});},
  async navigationStyle(foregroundStyle){await hbSDK.viewport.setNavigationBarStyle({foregroundStyle});},
  async windowInfo(){return hbSDK.viewport.getWindowInfo();},
  onViewport(handler){return hbSDK.on('viewport_change',handler);},
  async copy(text){await hbSDK.device.setClipboard({text});},
  onShow(handler){return hbSDK.on('show',handler);}
};
