import {t} from '../../src/i18n/index.js';
export const THEMES = Object.freeze([
  Object.freeze({id:'moon',name:'月影',description:'蓝灰夜色 · 轻磨砂',background:'#263e4b',surface:'#3b5360',accent:'#bfdcea',foreground:'light'}),
  Object.freeze({id:'mist',name:'雾银',description:'银蓝浅色 · 清透柔和',background:'#e2ebef',surface:'#f5f8fa',accent:'#416e91',foreground:'dark'}),
  Object.freeze({id:'retro',name:'昭和',description:'暖纸墨绿 · 旧雀庄',background:'#eee5d0',surface:'#f8efdc',accent:'#31543d',foreground:'dark'})
]);
export function normalizeTheme(id) {
  if (id === 'cloud') return 'mist';
  return THEMES.some(theme=>theme.id===id) ? id : 'moon';
}
export const getTheme = id => THEMES.find(theme=>theme.id===normalizeTheme(id));
export function applyTheme(id, root=document.documentElement) {
  const theme=getTheme(id);
  root.dataset.theme=theme.id;
  document.querySelectorAll('meta[name="theme-color"]').forEach(meta=>{meta.content=theme.background;});
  return theme;
}

export function themeDisplay(theme){return {...theme,name:t('heybox.theme.'+theme.id),description:t('heybox.theme.'+theme.id+'Description')};}
