const i18n=require('./i18n-core');
const {withTheme}=require('./theme');
const copyKeys=require('./locale-copy');
let configured=false;
function configure(){if(configured)return;configured=true;i18n.configureLocale({read:async key=>wx.getStorageSync(key),write:async(key,value)=>{wx.setStorageSync(key,value);}});/* Also restore after an IDE hot reload that does not call App.onLaunch again. */i18n.initialize();}
function copyFor(name){const copy={};for(const key of copyKeys[name]||[])copy[key]=i18n.t('native.ui.'+key);return copy;}
const titleKeys={calculator:'native.nav.calculator',guide:'native.nav.guide',history:'native.nav.history',practice:'native.nav.practice',teaching:'native.nav.teaching',lobby:'native.nav.lobby',recognize:'native.nav.recognize','coming-soon':'native.nav.coming-soon'};
function refresh(page,name){try{const pages=typeof getCurrentPages==='function'?getCurrentPages():[];const visible=!pages.length||pages[pages.length-1].route==='pages/'+name+'/index';if(visible&&(page._titleLocale||'zh-CN')!==i18n.current()&&typeof wx.setNavigationBarTitle==='function'){wx.setNavigationBarTitle({title:name==='home'?'和啦':i18n.t(titleKeys[name])});page._titleLocale=i18n.current();}}catch{}page.setData({locale:i18n.current(),copy:copyFor(name)});if(typeof page.onLocaleRefresh==='function')page.onLocaleRefresh();}
function withLocale(definition,name){
  const onLoad=definition.onLoad,onShow=definition.onShow,onUnload=definition.onUnload;
  return withTheme({...definition,data:{...definition.data,locale:i18n.current(),copy:copyFor(name)},
    onLoad(...args){configure();this._stopLocale=i18n.subscribe(()=>refresh(this,name));refresh(this,name);const result=onLoad&&onLoad.apply(this,args);refresh(this,name);return result;},
    onShow(...args){refresh(this,name);return onShow&&onShow.apply(this,args);},
    onUnload(...args){if(this._stopLocale)this._stopLocale();this._stopLocale=null;return onUnload&&onUnload.apply(this,args);}
  });
}
configure();
function nativeText(key,params,locale=i18n.current()){const values={...params};if(values.tileCode){values.tile=i18n.tileName(values.tileCode,locale);delete values.tileCode;}return i18n.t(key,values,locale);}
function nativeError(key,params={}){const error=new Error(nativeText(key,params));error.messageRef={key,params};return error;}
function displayError(error,locale=i18n.current()){const ref=error?.messageRef;if(ref&&typeof ref.key==='string'&&ref.key.startsWith('native.')&&Object.prototype.hasOwnProperty.call(i18n.messages(locale),ref.key))return nativeText(ref.key,ref.params||{},locale);return i18n.errorMessage(error,locale);}
const presenters={...i18n,errorMessage:displayError};
module.exports={nativeError,...i18n,presenters,copyFor,withLocale};
