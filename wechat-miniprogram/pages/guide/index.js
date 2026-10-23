const {withLocale,t,presenters}=require('../../utils/locale');
const {goHome}=require('../../utils/navigation');
const {core}=require('../../utils/model');
Page(withLocale({
  data:{filter:'all',search:'',cards:[],tabs:[]},
  onLocaleRefresh(){this.setData({tabs:[{key:'all',name:t('native.ui.all_yaku')},{key:'basic',name:t('native.ui.common_yaku')},{key:'yakuman',name:t('native.ui.yakuman')},{key:'dora',name:t('native.ui.dora')}]});this.filterCards();},
  onLoad(){this.filterCards();},
  onHome(){goHome();},
  onFilter(e){this.setData({filter:e.currentTarget.dataset.key});this.filterCards();},
  onSearch(e){this.setData({search:e.detail.value});this.filterCards();},
  filterCards(){
    const search=this.data.search.trim().toLowerCase(),filter=this.data.filter;
    const entries=[['翻牌 白',['役牌 · 白','','可副露']],['場風 東',['场风 / 自风','','可副露']],...Object.entries(core.YAKU)];
    const cards=entries.filter(([,info])=>filter==='all'||(filter==='yakuman'?info[2]==='役满':filter==='dora'?info[2]==='宝牌':info[2]!=='役满'&&info[2]!=='宝牌')).map(([key,canonical])=>{
      let [name,description,kind]=presenters.yakuInfo(key);const alias=key==='翻牌 白'?'dragon':key==='場風 東'?'wind':'';if(alias){name=t('native.guide.'+alias+'.name');description=t('native.guide.'+alias+'.description');}
      return {key,name,description,kind,canonicalKind:canonical[2],searchText:[key,...canonical,...presenters.yakuInfo(key,'zh-CN'),name,description].join(' ').toLowerCase(),han:canonical[2]==='役满'?presenters.kindLabel('役满'):canonical[2]==='宝牌'?t('native.ui.label_1_han_per_tile'):t('native.model.han',{count:core.GUIDE_HAN[key]||1})};
    }).filter(card=>!search||card.searchText.includes(search)).map((card,index)=>({...card,index:String(index+1).padStart(2,'0')}));
    this.setData({cards});
  },
  onDetail(e){const card=this.data.cards.find(c=>c.key===e.currentTarget.dataset.key);if(card)wx.showModal({title:card.name,content:card.han+' · '+card.kind+'\n\n'+card.description,showCancel:false,confirmText:t('native.ui.got_it'),confirmColor:'#224d3d'});},
  onExamples(){wx.navigateTo({url:'/pages/teaching/index'});},
  onShareAppMessage(){return {title:t('native.ui.discover_every_yaku'),path:'/pages/guide/index'};}
}, 'guide'));
