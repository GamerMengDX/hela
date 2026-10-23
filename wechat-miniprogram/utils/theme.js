const KEY='hela-native-theme-v1';
const THEMES=[
  {id:'moon',name:'月影',description:'深蓝磨砂，安静而清晰',background:'#263e4b',foreground:'#ffffff',accent:'#bfdcea'},
  {id:'mist',name:'雾银',description:'轻盈银蓝，柔和通透',background:'#e2ebef',foreground:'#000000',accent:'#416e91'},
  {id:'retro',name:'昭和',description:'奶油纸色，深绿牌桌',background:'#eee5d0',foreground:'#000000',accent:'#31543d'}
];
const listeners=new Set();
const normalize=id=>id==='cloud'?'mist':THEMES.some(t=>t.id===id)?id:'moon';
function current(){try{return normalize(wx.getStorageSync(KEY));}catch{return 'moon';}}
function apply(page,id=current()){
  const theme=THEMES.find(t=>t.id===normalize(id));
  if(page&&typeof page.setData==='function')page.setData({themeId:theme.id,themeName:theme.name,themeAccent:theme.accent});
  try{if(typeof wx.setNavigationBarColor==='function')wx.setNavigationBarColor({frontColor:theme.foreground,backgroundColor:theme.background,animation:{duration:0},fail(){}});}catch{}
  try{if(typeof wx.setBackgroundColor==='function')wx.setBackgroundColor({backgroundColor:theme.background,backgroundColorTop:theme.background,backgroundColorBottom:theme.background,fail(){}});}catch{}
  return theme;
}
function set(id){
  id=normalize(id);
  try{wx.setStorageSync(KEY,id);}catch{return false;}
  if(typeof getCurrentPages==='function')getCurrentPages().forEach(page=>apply(page,id));
  listeners.forEach(listener=>listener(id));
  return true;
}
function subscribe(callback){listeners.add(callback);return ()=>listeners.delete(callback);}
function withTheme(definition){
  const onLoad=definition.onLoad,onShow=definition.onShow;
  return {...definition,data:{...definition.data,themeId:current(),themeName:THEMES.find(t=>t.id===current()).name},
    onLoad(...args){apply(this);return onLoad&&onLoad.apply(this,args);},
    onShow(...args){apply(this);return onShow&&onShow.apply(this,args);}
  };
}
module.exports={KEY,THEMES,normalize,current,apply,set,subscribe,withTheme};
