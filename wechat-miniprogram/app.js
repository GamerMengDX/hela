const locale=require('./utils/locale');
App({globalData:{pendingHand:null,pendingHandStep:null,recognitionBase:null},onLaunch(){this.localeReady=locale.initialize();}});
