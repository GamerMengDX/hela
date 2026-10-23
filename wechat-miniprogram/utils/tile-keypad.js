const SUITS=[{id:'m',name:'万'},{id:'p',name:'筒'},{id:'s',name:'索'},{id:'z',name:'字'}];
function keypadTiles(rows,suit='m',red=false){
  const row=rows.find(row=>row.key===suit)||rows.find(row=>row.key==='m'),redTile=rows.find(row=>row.key==='red')?.tiles.find(tile=>tile.tile[0]===suit);
  return row.tiles.map(tile=>red&&tile.tile===suit+'5'&&redTile?redTile:tile);
}
function suits(){const {t}=require('./locale');return [{id:'m',name:t('native.ui.man')},{id:'p',name:t('native.ui.pin')},{id:'s',name:t('native.ui.sou')},{id:'z',name:t('native.ui.honors')} ];}
module.exports={SUITS,suits,keypadTiles};
