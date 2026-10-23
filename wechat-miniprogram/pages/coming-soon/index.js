const {withLocale:withTheme,t,presenters}=require('../../utils/locale');
const {localizedModules}=require('../../utils/modules');
const {goHome}=require('../../utils/navigation');
Page(withTheme({
  data:{module:null},
  onLoad(options){const module=localizedModules().find(item=>item.id===options.module&&item.status==='planned');if(!module){goHome();return;}this.setData({module});wx.setNavigationBarTitle({title:module.name});},
  onLocaleRefresh(){if(this.data.module){const module=localizedModules().find(item=>item.id===this.data.module.id);this.setData({module});wx.setNavigationBarTitle({title:module.name});}},
  onHome(){goHome();}
}, 'coming-soon'));
