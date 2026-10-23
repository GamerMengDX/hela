const {validTile}=require('../../utils/core');
const {tileName,t,subscribe,copyFor}=require('../../utils/locale');
Component({
  properties:{tile:{type:String,value:'',observer:'updateTile'},size:{type:String,value:'normal'},selected:Boolean,disabled:Boolean,removable:Boolean},
  data:{src:'',name:''},
  lifetimes:{attached(){this.updateTile(this.properties.tile);this.stopLocale=subscribe(()=>this.updateTile(this.properties.tile));},detached(){if(this.stopLocale)this.stopLocale();}},
  methods:{
    updateTile(tile){this.setData({src:validTile(tile)?'/assets/tiles/'+tile+'.png':'',copy:copyFor('mahjong-tile'),name:validTile(tile)?tileName(tile):t('native.ui.empty_tile')});},
    hold(){if(!this.properties.disabled)this.triggerEvent('choosewin',{tile:this.properties.tile});},
    pick(){if(!this.properties.disabled)this.triggerEvent('pick',{tile:this.properties.tile});},
    remove(){this.triggerEvent('remove',{tile:this.properties.tile});}
  }
});
