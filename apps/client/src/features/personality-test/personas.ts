import type { AxisKey, PersonalityCode, PersonalityConfig } from './types';

export const PERSONALITY_IMAGE_BASE_URL = 'https://cloud1-d8g7o18ula3c12f10-1318253748.tcloudbaseapp.com/baichile-home/personality-test';

export const PERSONALITY_PRIORITY: PersonalityCode[] = [
  'DAVE', 'MAYBE', 'FLEX', 'BIGG', 'SOLO', 'MATH', 'SAME', 'BETA',
  'DESS', 'LATE', 'NOPE', 'CARB', 'FIRE', 'CHECK', 'CHEAT', 'HOST',
];

export const AXIS_LABELS: Record<AxisKey, { name: string; low: string; high: string }> = {
  appetite: { name: '食量倾向', low: '小鸟胃', high: '大胃王' },
  explore: { name: '尝鲜倾向', low: '老三样', high: '赛博神农' },
  control: { name: '点餐方式', low: '随缘点单', high: '精准规划' },
  social: { name: '用餐气场', low: '独自开饭', high: '饭局中心' },
};

const configs: Array<Omit<PersonalityConfig, 'imageUrl'>> = [
  { code: 'DAVE', name: '大卫戴', coreTrait: '大份、碳水、肉、扎实、北方胃', referenceVector: { appetite: 2, explore: -1, control: -1, social: 0 }, description: '你相信一顿饭最重要的是扎实。肉要够、主食要足，吃完能扛住一整天才算交付完成。', quote: '份量到位，世界自然安静。', representativeFoods: ['大碗面', '肉夹馍', '盖饭'], recommendedScenes: ['忙碌工作日', '体力回血局'], hiddenTitle: '碳水大陆守门人' },
  { code: 'MAYBE', name: '薛定谔的饭盒', coreTrait: '点之前很饿，送到后又没胃口', referenceVector: { appetite: -1, explore: 0, control: -2, social: -1 }, description: '你的食欲存在于下单前的量子态里。菜单越翻越饿，饭一送到，胃口却可能先一步下线。', quote: '饭到了，饿意却撤回了。', representativeFoods: ['小份沙拉', '精致便当', '水果杯'], recommendedScenes: ['选择困难时', '少量多样局'], hiddenTitle: '食欲量子观测员' },
  { code: 'FLEX', name: '林黛玉倒拔大鸡腿', coreTrait: '平时小鸟胃，遇到真爱突然爆发', referenceVector: { appetite: -1, explore: 1, control: 0, social: 0 }, description: '你不是吃得少，只是值得你认真出手的食物不多。一旦遇见真爱菜品，小鸟胃会立刻切换战斗模式。', quote: '胃口不大，真爱除外。', representativeFoods: ['烤鸡腿', '限定料理', '精致小食'], recommendedScenes: ['本命美食局', '新品品鉴局'], hiddenTitle: '限定食欲爆发者' },
  { code: 'BIGG', name: '亚历山大盘鸡', coreTrait: '大盘硬菜、多人分享、排面优先', referenceVector: { appetite: 2, explore: 0, control: 0, social: 2 }, description: '小碟小碗很难点燃你的热情。桌上必须有一道镇场硬菜，最好大到所有人都能参与。', quote: '盘子不大，怎么撑起场面？', representativeFoods: ['大盘鸡', '烤全鱼', '多人火锅'], recommendedScenes: ['朋友聚餐', '庆祝宴'], hiddenTitle: '硬菜排面总监' },
  { code: 'SOLO', name: '面壁者', coreTrait: '一个人吃饭最舒服，电子榨菜必备', referenceVector: { appetite: 0, explore: -1, control: 1, social: -2 }, description: '独自吃饭不是孤单，而是你最稳定的能量补给方式。熟悉的食物配熟悉的视频，就是完整结界。', quote: '一人一饭一屏幕，自成宇宙。', representativeFoods: ['单人套餐', '拌饭', '泡面'], recommendedScenes: ['独处充电', '追剧夜宵'], hiddenTitle: '电子榨菜首席鉴赏官' },
  { code: 'MATH', name: '凑满减数学家', coreTrait: '为了省三块，熟练多花十五块', referenceVector: { appetite: 0, explore: 0, control: 2, social: 0 }, description: '你的下单页不是菜单，是一道动态规划题。优惠券、配送费和满减门槛都逃不过你的计算。', quote: '可以多点，不能少减。', representativeFoods: ['满减套餐', '拼单小吃', '优惠组合'], recommendedScenes: ['多人拼单', '优惠券清仓'], hiddenTitle: '外卖算法工程师' },
  { code: 'SAME', name: '老三样终身会员', coreTrait: '固定店铺、固定菜品、稳定第一', referenceVector: { appetite: 0, explore: -2, control: 2, social: -1 }, description: '你知道稳定的珍贵。熟悉的店、固定的菜、可预测的味道，比冒险踩雷更让人安心。', quote: '世界在变，老三样不变。', representativeFoods: ['常点盖饭', '固定套餐', '家常菜'], recommendedScenes: ['工作日午餐', '不想动脑时'], hiddenTitle: '复购体系终身会员' },
  { code: 'BETA', name: '赛博神农', coreTrait: '新店、新品、猎奇口味都敢试', referenceVector: { appetite: 0, explore: 2, control: -1, social: 0 }, description: '新品对你不是风险，而是待解锁的体验。哪怕味道离谱，也能转化成一条有价值的测评。', quote: '先吃一口，再定义它。', representativeFoods: ['限定新品', '融合料理', '猎奇小吃'], recommendedScenes: ['新店首发', '菜单探险'], hiddenTitle: '人类味觉公测员' },
  { code: 'DESS', name: '第二胃业主', coreTrait: '正餐吃不下，甜品永远有位置', referenceVector: { appetite: 0, explore: 1, control: -1, social: 0 }, description: '正餐容量和甜品容量在你体内分区管理。无论前面吃了多少，好看的甜点永远拥有独立席位。', quote: '吃饱是正餐的事，甜品不归它管。', representativeFoods: ['蛋糕', '冰淇淋', '奶茶'], recommendedScenes: ['下午茶', '饭后续摊'], hiddenTitle: '第二胃产权所有人' },
  { code: 'LATE', name: '深夜冰箱巡逻员', coreTrait: '白天一般，夜里正式开胃', referenceVector: { appetite: 1, explore: 0, control: -2, social: -1 }, description: '太阳落山后，你的食欲才逐渐上线。冰箱灯和外卖页面，是深夜里最懂你的两束光。', quote: '夜越深，胃越清醒。', representativeFoods: ['夜宵烧烤', '泡面', '炸串'], recommendedScenes: ['深夜加班', '睡前巡逻'], hiddenTitle: '午夜食欲值班员' },
  { code: 'NOPE', name: '随便吃点否决者', coreTrait: '嘴上都行，实际每个选项都不行', referenceVector: { appetite: 0, explore: -1, control: -2, social: 0 }, description: '你并非没有主见，只是主见通常以否决形式出现。每个提议都差一点，直到饭点悄悄过去。', quote: '都可以，除了刚才那些。', representativeFoods: ['临时便当', '家常小炒', '最后的备选'], recommendedScenes: ['朋友帮选', '菜单精简局'], hiddenTitle: '饭局一票否决人' },
  { code: 'CARB', name: '碳水永动机', coreTrait: '没有米面馒头饼，就不算吃饭', referenceVector: { appetite: 1, explore: -1, control: 0, social: 0 }, description: '在你的饮食世界里，主食不是配角，而是整顿饭的地基。少了米面馒头饼，菜再多也像没开机。', quote: '主食到位，这顿才算数。', representativeFoods: ['米饭', '面条', '馒头饼'], recommendedScenes: ['高强度工作日', '饥饿回血局'], hiddenTitle: '主食能源核心' },
  { code: 'FIRE', name: '辣椒素股东', coreTrait: '微辣等于没放辣，越辣越来劲', referenceVector: { appetite: 1, explore: 1, control: -1, social: 0 }, description: '辣度不是障碍，是启动食欲的按钮。别人开始找水时，你才觉得这顿饭终于进入正题。', quote: '不够辣，就不够有诚意。', representativeFoods: ['爆辣火锅', '辣子鸡', '酸辣粉'], recommendedScenes: ['压力释放局', '重口挑战局'], hiddenTitle: '辣度风险投资人' },
  { code: 'CHECK', name: '配料表纪检委', coreTrait: '热量、蛋白质、油盐都要看', referenceVector: { appetite: -1, explore: 0, control: 2, social: 0 }, description: '你吃的不只是味道，还有一整套可追踪指标。热量、蛋白质和配料表都要经得住审查。', quote: '先看数据，再动筷子。', representativeFoods: ['轻食碗', '高蛋白餐', '清淡套餐'], recommendedScenes: ['减脂期', '训练餐'], hiddenTitle: '营养数据审计官' },
  { code: 'CHEAT', name: '减脂餐叛逃者', coreTrait: '周一减脂，周二炸鸡，周三再来', referenceVector: { appetite: 1, explore: 0, control: -2, social: 0 }, description: '你对健康计划是真诚的，对炸鸡的感情也同样真诚。短暂叛逃之后，下一顿又是崭新的开始。', quote: '今天放纵，明天重新做人。', representativeFoods: ['炸鸡', '汉堡', '放纵餐'], recommendedScenes: ['减脂休息日', '情绪奖励局'], hiddenTitle: '饮食计划弹性专家' },
  { code: 'HOST', name: '饭局发动机', coreTrait: '负责组局、点菜、照顾所有人', referenceVector: { appetite: 0, explore: 0, control: 2, social: 2 }, description: '一顿饭能顺利开场，往往是因为你在背后推进。组人、订位、点菜和照顾忌口都被你自然接管。', quote: '人我来叫，菜我来点。', representativeFoods: ['共享套餐', '多人火锅', '圆桌菜'], recommendedScenes: ['朋友聚会', '团队聚餐'], hiddenTitle: '饭局首席运营官' },
];

export const PERSONALITIES = Object.fromEntries(configs.map((item) => [item.code, {
  ...item,
  imageUrl: `${PERSONALITY_IMAGE_BASE_URL}/${item.code}.png`,
}])) as Record<PersonalityCode, PersonalityConfig>;
