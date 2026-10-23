const {withLocale:withTheme,t,presenters}=require('../../utils/locale');
const {core}=require('../../utils/model');
Page(withTheme({
  data:{course:{stage:'list',examples:[],total:0},scrollTop:0,suits:[{id:'m',name:t('native.ui.man')},{id:'p',name:t('native.ui.pin')},{id:'s',name:t('native.ui.sou')},{id:'z',name:t('native.ui.honors')}]},
  projectCourse(snapshot){const course=presenters.teachingSnapshot(snapshot);course.examples=(course.examples||[]).map(row=>({...row,handCountText:t('native.teaching.hand_count',{count:row.handCount})+(row.meldCount?t('native.teaching.meld_count',{count:row.meldCount}):'')}));if(course.exercise)course.exercise.remainingHint=t('native.teaching.remaining',{count:course.exercise.remaining});return course;},
  onLocaleRefresh(){this.setData({suits:[{id:'m',name:t('native.ui.man')},{id:'p',name:t('native.ui.pin')},{id:'s',name:t('native.ui.sou')},{id:'z',name:t('native.ui.honors')}]});if(this._snapshot)this.setData({course:this.projectCourse(this._snapshot)});},
  onLoad(){this._course=core.createTeachingBrowser();this.update(this._course.open());},
  onBack(){if(this.data.course.stage==='list'){wx.navigateBack({delta:1,fail(){wx.redirectTo({url:'/pages/guide/index'});}});return;}this.update(this._course.back(),true);},
  onList(){this.update(this._course.toList(),true);},
  onSelect(e){this.update(this._course.select(Number(e.currentTarget.dataset.index)),true);},
  onFilter(e){this._listScroll=0;this.update(this._course.filter(e.currentTarget.dataset.id),true);},
  onTry(){this.update(this._course.try(),true);},
  onScroll(e){this._scroll=e.detail.scrollTop;if(this.data.course.stage==='list')this._listScroll=this._scroll;},
  onExercise(e){const d=e.currentTarget.dataset;let value=d.value;if(['hand','remove-meld','draft-remove'].includes(d.action))value=Number(value);this.setData({scrollTarget:''});this.update(this._course.exercise(d.action,value));if(d.action==='judge')this.setData({scrollTarget:'exercise-feedback'});},
  update(course,reset=false){this._snapshot=course;const data={course:this.projectCourse(course)};if(reset)data.scrollTop=course.stage==='list'?this._listScroll||0:0;this.setData(data);},
  onShareAppMessage(){return {title:t('native.ui.learn_a_hand_then_build_your_own'),path:'/pages/teaching/index'};}
}, 'teaching'));
