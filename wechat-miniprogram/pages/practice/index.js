const {withLocale,t,presenters}=require('../../utils/locale');
const model=require('../../utils/model');
const {core}=model;
const STATS='hela-practice-stats-v1';
const levels=()=>[{id:'basic',name:t('native.ui.beginner')},{id:'normal',name:t('native.ui.intermediate')},{id:'advanced',name:t('native.ui.challenge')}];
Page(withLocale({
  data:{levels:levels(),level:'basic',scrollTop:0,question:null,fields:[],answered:false,revealed:false,analysis:false,stats:{attempted:0,correct:0},error:''},
  onLocaleRefresh(){this.setData({levels:levels()});this.renderQuestion();},
  onLoad(){try{const raw=wx.getStorageSync(STATS);if(raw&&Number.isInteger(raw.attempted)&&raw.attempted>=0&&Number.isInteger(raw.correct)&&raw.correct>=0&&raw.correct<=raw.attempted)this.setData({stats:raw});}catch{}this.newQuestion();},
  newQuestion(){
    try{this._question=core.generatePractice(this.data.level);this._answers={};this._feedbackKey='';this._errorKey='';this.setData({answered:false,revealed:false,analysis:false,error:'',feedback:'',answer:null});this.renderQuestion();this.setData({scrollTop:this.data.scrollTop===0?1:0});}
    catch(error){this.setData({error:presenters.errorMessage(error)});}
  },
  renderQuestion(){
    if(!this._question)return;
    const {state,result}=this._question,vm=model.viewModel(state);
    const special=state.special==='last'?(state.method==='ron'?presenters.yakuInfo('河底撈魚')[0]:presenters.yakuInfo('海底摸月')[0]):state.special==='rinshan'?presenters.yakuInfo('嶺上開花')[0]:'';
    const rawFields=this.data.answered?core.checkPractice(this._question,this._answers):core.practiceFields(this._question);
    const fields=presenters.practiceFields(rawFields).map(({expected,...field})=>({...field,value:this._answers[field.key]||'',...(this.data.revealed?{expectedText:model.number(expected)}:{})}));
    const role=state.seat===0?t('native.ui.dealer'):t('native.ui.non_dealer');
    this.setData({question:{hand:model.tilesView(state.hand.slice(0,-1)),win:state.hand[state.hand.length-1],melds:vm.melds,dora:model.tilesView(state.dora),ura:model.tilesView(state.ura),round:presenters.windName(state.round),seat:presenters.windName(state.seat),context:t('native.practice.context',{round:presenters.windName(state.round),seat:presenters.windName(state.seat),role}),methodText:state.method==='ron'?t('native.practice.ron_context',{wind:presenters.windName(state.loser)}):t('native.ui.tsumo'),riichi:state.riichi?t('native.ui.riichi_declared'):t('native.ui.no_riichi'),ippatsu:state.ippatsu,special,honba:state.honba,sticks:state.sticks,yakuman:!!result.damanguan},fields,feedback:this._feedbackKey?t(this._feedbackKey):'',...(this._errorKey?{error:t(this._errorKey)}:{}),...(this.data.revealed?{answer:model.resultView(state,result)}:{})});
  },
  onLevel(e){const level=e.currentTarget.dataset.level;if(!levels().some(l=>l.id===level)||level===this.data.level)return;this.setData({level});this.newQuestion();},
  onAnswer(e){if(this.data.revealed)return;const key=e.currentTarget.dataset.key,value=e.detail.value;this._answers[key]=value;this._errorKey='';this.setData({fields:this.data.fields.map(f=>f.key===key?{...f,value}:f),error:''});},
  onSubmit(){
    if(!this._question||this.data.revealed)return;
    const checked=core.checkPractice(this._question,this._answers);
    if(checked.some(f=>!/^\d+$/.test(String(this._answers[f.key]??'').trim()))){this._errorKey='native.ui.complete_every_field_using_non_negative_whole_numbers';this.setData({error:t(this._errorKey)});return;}
    const correct=checked.every(f=>f.correct),stats={attempted:this.data.stats.attempted+1,correct:this.data.stats.correct+(correct?1:0)};
    this._feedbackKey=correct?'native.ui.all_correct_well_calculated':'native.ui.review_the_explanation_and_remember_the_key_point';this.setData({stats,answered:true});
    try{wx.setStorageSync(STATS,stats);}catch{this._errorKey='native.ui.device_storage_is_unavailable_practice_stats_were_not';}
    this.reveal();
  },
  reveal(){this.setData({revealed:true});this.renderQuestion();},
  onReveal(){if(!this._question||this.data.revealed)return;this._feedbackKey='native.ui.this_question_does_not_count_toward_accuracy';this.reveal();},
  onAnalysis(){this.setData({analysis:!this.data.analysis});},
  onNext(){this.newQuestion();},
  onShareAppMessage(){return {title:t('native.ui.practice_scoring_random_hands'),path:'/pages/practice/index'};}
}, 'practice'));
