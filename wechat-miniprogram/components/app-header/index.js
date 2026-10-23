const theme=require('../../utils/theme');
const {t,current,subscribe,copyFor}=require('../../utils/locale');
const {goHome,openScorePage}=require('../../utils/navigation');
Component({
  properties:{caption:{type:String,value:t('native.ui.riichi_companion')},calculatorHelp:Boolean},
  data:{themeId:'moon',themes:theme.THEMES,showThemes:false,showHelp:false,iconFailed:false},
  lifetimes:{
    attached(){this.refreshLocale();this.setData({themeId:theme.current()});this.stopTheme=theme.subscribe(id=>this.setData({themeId:id}));this.stopLocale=subscribe(()=>this.refreshLocale());},
    detached(){this.stopTheme&&this.stopTheme();this.stopLocale&&this.stopLocale();}
  },
  pageLifetimes:{show(){this.refreshLocale();this.setData({themeId:theme.current()});}},
  methods:{
    refreshLocale(){const labels={moon:[t('native.ui.moonlight'),t('native.ui.deep_frosted_blue_calm_and_clear')],mist:[t('native.ui.silver_mist'),t('native.ui.soft_airy_silver_blue')],retro:[t('native.ui.showa'),t('native.ui.cream_paper_and_a_deep_green_table')]};this.setData({locale:current(),copy:copyFor('app-header'),themes:theme.THEMES.map(row=>({...row,name:labels[row.id][0],description:labels[row.id][1]}))});},
    noop(){},
    onHome(){goHome();},
    onIconError(){this.setData({iconFailed:true});},
    onThemes(){this.setData({showThemes:true,showHelp:false});},
    onHelp(){if(this.properties.calculatorHelp)this.triggerEvent('help');else this.setData({showHelp:true,showThemes:false});},
    onClose(){this.setData({showThemes:false,showHelp:false});},
    onTheme(e){if(theme.set(e.currentTarget.dataset.id))this.onClose();else wx.showToast({title:t('native.ui.could_not_save_the_theme_check_device_storage'),icon:'none'});},
    onHistory(){this.onClose();openScorePage('/pages/history/index');}
  }
});
