const homeRoute='pages/home/index';
const scoreRoutes=['pages/calculator/index','pages/history/index'];
const moduleRoutes=[...scoreRoutes,'pages/guide/index'];
function openModulePage(route){
  const target=route.replace(/^\//,'');
  if(!moduleRoutes.includes(target))return;
  const pages=getCurrentPages(),current=pages[pages.length-1];
  if(current&&current.route===target)return;
  // 同级板块或内部页面互相替换，返回时直接回首页。
  wx[current&&moduleRoutes.includes(current.route)?'redirectTo':'navigateTo']({url:'/'+target});
}
function openScorePage(route){if(scoreRoutes.includes(route.replace(/^\//,'')))openModulePage(route);}
function goHome(){
  const pages=getCurrentPages(),index=pages.findIndex(page=>page.route===homeRoute);
  if(index>=0){const delta=pages.length-1-index;if(delta>0)wx.navigateBack({delta});}
  else wx.reLaunch({url:'/'+homeRoute});
}
module.exports={homeRoute,scoreRoutes,moduleRoutes,openModulePage,openScorePage,goHome};
