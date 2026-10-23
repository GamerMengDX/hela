const {withLocale:withTheme,t,presenters}=require('../../utils/locale');
const {modules}=require('../../utils/modules');
Page(withTheme({
  data:{modules,mainModules:modules.filter(item=>!item.compact),quickModules:modules.filter(item=>item.compact),readyCount:modules.filter(item=>item.status==='ready').length,plannedCount:modules.filter(item=>item.status==='planned').length},
  onLocaleRefresh(){const modules=require('../../utils/modules').localizedModules();this.setData({languageLabel:t('native.locale.choose'),modules,mainModules:modules.filter(item=>!item.compact),quickModules:modules.filter(item=>item.compact)});},
  async onLocale(e){const value=e.currentTarget.dataset.locale;const result=await require('../../utils/locale').setLocale(value);if(!result.ok)wx.showToast({title:t('native.locale.save_failed'),icon:'none'});},
  onHistory(){wx.navigateTo({url:'/pages/history/index'});},
  onModule(e){const module=modules.find(item=>item.id===e.currentTarget.dataset.id);if(module)wx.navigateTo({url:module.url});},
  onShareAppMessage(){return {title:t('native.ui.your_riichi_companion'),path:'/pages/home/index'};}
}, 'home'));
