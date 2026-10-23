// 一级板块统一在这里配置，后续确定新功能时替换名称和目标页面。
const modules=[
  {id:'riichi',number:'01',name:'日麻算点',status:'ready',label:'开始使用',description:'录入手牌，算清役种、番符与点数。',features:'手牌录入 · 番符解析 · 计算记录',url:'/pages/calculator/index'},
  {id:'guide',number:'02',name:'役种图鉴',status:'ready',label:'查看图鉴',description:'从常见役到役满，随时查阅成立条件。',features:'役种查询 · 成立条件 · 教学示例',url:'/pages/guide/index'},
  {id:'practice',number:'03',name:'算点练习',status:'ready',compact:true,label:'开始练习',description:'随机牌局，练出算点手感。',url:'/pages/practice/index'},
  {id:'lobby',number:'04',name:'组队大厅',status:'ready',compact:true,label:'本地开桌',description:'四人同桌，点棒自动结算。',url:'/pages/lobby/index'}
];
const {t}=require('./locale');
function localizedModules(){const names={riichi:[t('native.ui.score_calculator'),t('native.ui.get_started'),t('native.ui.enter_a_hand_to_calculate_yaku_han_fu'),t('native.ui.hand_entry_han_and_fu_hand_history')],guide:[t('native.ui.yaku_handbook'),t('native.ui.open_handbook'),t('native.ui.look_up_conditions_from_common_yaku_to_yakuman'),t('native.ui.yaku_search_conditions_teaching_examples')],practice:[t('native.ui.scoring_practice'),t('native.ui.start_practicing'),t('native.ui.build_scoring_skills_with_random_hands_2'),''],lobby:[t('native.ui.table_lobby'),t('native.ui.create_a_local_table'),t('native.ui.automatically_settle_points_at_a_four_player_table'),'']};return modules.map(module=>{const [name,label,description,features]=names[module.id];return {...module,name,label,description,features};});}
module.exports={modules,localizedModules};
