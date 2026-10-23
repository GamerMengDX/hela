import {EXAMPLES} from './examples.js';

// Kept separate from calculator presets and random point-practice questions.
export const TEACHING_EXAMPLES=[
  {...EXAMPLES[0],id:'riichi-tanyao-pinfu',category:'basic',targets:['立直','断幺九','平和']},
  {...EXAMPLES[1],id:'seven-pairs',category:'basic',targets:['七対子']},
  {...EXAMPLES[2],id:'open-white',category:'basic',targets:['翻牌 白'],requiresOpen:true},
  {...EXAMPLES[3],id:'thirteen-orphans',category:'yakuman',targets:['国士無双']},
  {...EXAMPLES[4],id:'closed-tsumo-pinfu',category:'basic',targets:['門前清自摸和','平和']},
  {id:'pinfu',name:'平和',desc:'四组顺子、非役牌雀头，两面等待和牌。',category:'basic',hand:'234m34566p45667s8s',targets:['平和']},
  {id:'tanyao',name:'断幺九',desc:'只使用二至八的数牌，不含一、九和字牌。',category:'basic',hand:'222345m456p678s66p',targets:['断幺九']},
  {id:'identical-sequences',name:'一杯口',desc:'门清状态下，组成同花色的两组相同顺子。',category:'basic',hand:'123123m456p678s55p',targets:['一盃口']},
  {id:'three-suit-sequences',name:'三色同顺',desc:'万、筒、索各有一组数字相同的顺子。',category:'advanced',hand:'123m123p123789s55z',targets:['三色同順']},
  {id:'straight',name:'一气通贯',desc:'同一种花色中，组成一二三、四五六、七八九。',category:'advanced',hand:'123456789m234p55z',targets:['一気通貫']},
  {id:'all-triplets',name:'对对和',desc:'四组刻子或杠子，加上一对雀头；本例含副露。',category:'advanced',hand:'222m444p666s77z',melds:['z555-'],targets:['対々和']},
  {id:'three-concealed-triplets',name:'三暗刻',desc:'三组暗刻成立，第四组用顺子，观察荣和牌的位置。',category:'advanced',hand:'222m444p666s789p55z',targets:['三暗刻']},
  {id:'three-suit-triplets',name:'三色同刻',desc:'万、筒、索各有一组数字相同的刻子。',category:'advanced',hand:'222m222p222s456s55z',targets:['三色同刻']},
  {id:'mixed-outside',name:'混全带幺九',desc:'每组面子与雀头都含幺九或字牌，且有顺子和字牌。',category:'advanced',hand:'123m789p111999s55z',targets:['混全帯幺九']},
  {id:'pure-outside',name:'纯全带幺九',desc:'每组都含一或九，没有字牌，并至少有一组顺子。',category:'advanced',hand:'123789m111p99911s',targets:['純全帯幺九']},
  {id:'terminals-honors',name:'混老头',desc:'全由一、九和字牌组成；本例由刻子与雀头构成。',category:'advanced',hand:'111m999p111s22z',melds:['z555-'],targets:['混老頭']},
  {id:'small-three-dragons',name:'小三元',desc:'白、发、中，两种为刻子，另一种为雀头。',category:'advanced',hand:'123m789p55566677z',targets:['小三元']},
  {id:'half-flush',name:'混一色',desc:'一种数牌花色与字牌组合，门清时为三番。',category:'advanced',hand:'123345678m55577z',targets:['混一色']},
  {id:'full-flush',name:'清一色',desc:'整手只使用同一种花色的数牌，不含字牌。',category:'advanced',hand:'12334556778922m',targets:['清一色']},
  {id:'two-identical-sequence-pairs',name:'二杯口',desc:'门清下有两对相同顺子，不与一杯口或七对子叠加。',category:'advanced',hand:'123123m789789p55s',targets:['二盃口']},
  {id:'big-three-dragons',name:'大三元',desc:'白、发、中各组成一组刻子或杠子。',category:'yakuman',hand:'123m55p555666777z',targets:['大三元']},
  {id:'four-concealed-triplets',name:'四暗刻',desc:'四组暗刻，双碰等待时通过自摸完成。',category:'yakuman',hand:'111m222p333s55777z',method:'tsumo',targets:['四暗刻']},
  {id:'small-four-winds',name:'小四喜',desc:'三种风牌为刻子，第四种风牌作雀头。',category:'yakuman',hand:'11122233344z123m',targets:['小四喜']},
  {id:'big-four-winds',name:'大四喜',desc:'东、南、西、北全部成为刻子或杠子。',category:'yakuman',hand:'222333444z55p',melds:['z111-'],targets:['大四喜']},
  {id:'all-honors',name:'字一色',desc:'整副牌只由风牌和三元牌组成。',category:'yakuman',hand:'11122255577z',melds:['z666-'],targets:['字一色']},
  {id:'all-green',name:'绿一色',desc:'只使用二、三、四、六、八索与发。',category:'yakuman',hand:'234234666s66z888s',targets:['緑一色']},
  {id:'all-terminals',name:'清老头',desc:'只使用万、筒、索的一与九，不含字牌。',category:'yakuman',hand:'111999m111p99s',melds:['p999-'],targets:['清老頭']},
  {id:'nine-gates',name:'九莲宝灯',desc:'同花色的一一一二三四五六七八九九九，再加一张。',category:'yakuman',hand:'11123456789999m',win:3,targets:['九蓮宝燈']},
  {id:'replacement-tile',name:'岭上开花',desc:'完成杠子后，用岭上摸到的牌自摸和牌。',category:'advanced',hand:'234m456p67s22p8s',melds:['z5555'],method:'tsumo',special:'rinshan',targets:['嶺上開花']},
  {id:'last-draw',name:'海底摸月 · 断幺九',desc:'牌山最后一张自摸，同时用二至八的数牌组牌。',category:'advanced',hand:'234m34566p45667s8s',method:'tsumo',special:'last',targets:['海底摸月','断幺九']}
].map(example=>({...example,nameRef:{key:'shared.lesson.'+example.id+'.name'},descriptionRef:{key:'shared.lesson.'+example.id+'.description'}}));

export const TEACHING_CATEGORIES=[{id:'all',name:'全部',nameRef:{key:'shared.category.all'}},{id:'basic',name:'入门',nameRef:{key:'shared.category.basic'}},{id:'advanced',name:'进阶',nameRef:{key:'shared.category.advanced'}},{id:'yakuman',name:'役满',nameRef:{key:'shared.category.yakuman'}}];
