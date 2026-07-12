import type { OrderEasterEgg, QuoteLine, ShareMilestone, SharePersona } from '@baichile/api-contract';

const EGGS = [
  ['clean-plate', '赛博光盘行动', 'common', '一口没吃，盘子却干净得很有态度。', '#2E8B72', 'plate'],
  ['calorie-ninja', '热量隐身术', 'common', '这批卡路里抵达前，您已经精神撤离。', '#2E8B72', 'smoke'],
  ['receipt-poet', '小票诗人', 'common', '每一行菜名，都是写给克制的情书。', '#F04B32', 'receipt'],
  ['midnight-guard', '深夜守胃人', 'common', '夜宵敲过门，但理智假装不在家。', '#F04B32', 'moon'],
  ['empty-feast', '空气满汉全席', 'rare', '阵仗很大，摄入为零，堪称宴席管理大师。', '#D97706', 'crown'],
  ['coupon-scholar', '满减理论博士', 'rare', '省下的不只是钱，还有一次复杂计算。', '#D97706', 'calculator'],
  ['zero-bite', '零口传说', 'rare', '传说有人点遍全城，却从未动过一筷。', '#D97706', 'spark'],
  ['legend', '白吃之神降临', 'legendary', '本单已被载入空气外卖史册。', '#F04B32', 'halo'],
] as const;

const PERSONAS: SharePersona[] = [
  persona('teaa', 'TEAA', '茶饮炼金师', '配方可以全糖，结局必须零卡。', '你擅长用一杯饮料调和情绪，却总能在真正入口前恢复理智。', '来测你的点单人格'),
  persona('caln', 'CALN', '热量闪避忍者', '卡路里刚到门口，你已经无影无踪。', '对高热量极其敏锐，最享受在想象里吃完一整桌。', '看看你能躲过多少热量'),
  persona('cpns', 'CPNS', '满减策略学者', '不一定要吃，但优惠必须算明白。', '你把点单当作数学研究，凑单、满减与配送费都逃不过你的演算。', '测测你的省钱流派'),
  persona('airf', 'AIRF', '空气盛宴收藏家', '菜单阅尽，胃里仍有大片留白。', '你重视见识多于摄入，收藏过的空气外卖足以办一场展览。', '看看你的收藏人格'),
  persona('nght', 'NGHT', '深夜守胃人', '夜宵敲门时，你负责让理智值夜班。', '越到深夜越懂得和馋意和平相处，是朋友圈里的守胃队长。', '测测你的深夜人格'),
  persona('menu', 'MENU', '菜单浪漫诗人', '菜名是诗，结算页是留白。', '你会认真读完每句菜品描述，精神饱餐之后优雅退场。', '生成你的菜单判词'),
  persona('deci', 'DECI', '果断点单船长', '下单不犹豫，不吃也果断。', '你负责迅速做决定、掌控全场，并在关键时刻带领胃安全返航。', '测测你的决策人格'),
  persona('expl', 'EXPL', '新店探险家', '地图上的新店，都是精神目的地。', '好奇心驱使你探索不同店铺和菜系，吃不吃反而是次要问题。', '发现你的探索人格'),
  persona('budg', 'BUDG', '饭钱审计官', '每一分钱，都要省得有凭有据。', '你对价格有天然雷达，享受看着累计节约金额稳定上涨。', '测测你的饭钱人格'),
  persona('heal', 'HEAL', '情绪好胃师', '先安慰心情，再安抚胃口。', '你用熟悉的食物照顾情绪，即使没有真正吃下也能获得安慰。', '看看你的治愈人格'),
  persona('host', 'HOST', '朋友圈开席官', '自己可以不吃，气氛必须管饱。', '你天生适合分享与组局，总能把一张订单变成朋友间的话题。', '邀请朋友一起测'),
  persona('mins', 'MINS', '极简空盘修行者', '选择越少，内心越饱。', '你偏爱简单直接的订单，用最少的菜品完成最高级的克制。', '测测你的极简人格'),
];

function persona(id: string, acronym: string, name: string, verdict: string, description: string, callToAction: string): SharePersona {
  return { id, acronym, name, verdict, description, callToAction, imageUrl: `/static/personas/${id}.png` };
}

export function stableHash(value: string): number { return Math.abs(value.split('').reduce((sum, char) => ((sum << 5) - sum + char.charCodeAt(0)) | 0, 0)); }

export function selectOrderEasterEgg(orderId: string, seed: string, triggeredAt: string): OrderEasterEgg | undefined {
  const hash = stableHash(`${orderId}:${seed}:egg`); if (hash % 1000 >= 80) return undefined;
  const rarity = hash % 10000 < 8 ? 'legendary' : hash % 100 < 28 ? 'rare' : 'common';
  const pool = EGGS.filter((egg) => egg[2] === rarity); const egg = pool[hash % pool.length];
  return { id: egg[0], name: egg[1], rarity: egg[2], verdict: egg[3], themeColor: egg[4], decoration: egg[5], collectionNumber: String(hash % 10000).padStart(4, '0'), triggeredAt };
}

export function classifyPersona(lines: QuoteLine[], count: number, money: number, calories: number): SharePersona {
  const names = lines.map((line) => line.name).join('');
  if (/奶茶|咖啡|茶|果汁/.test(names)) return PERSONAS[0];
  if (calories >= 8000) return PERSONAS[1];
  if (money >= 30000) return PERSONAS[8];
  if (count >= 20) return PERSONAS[3];
  const signature = `${lines.map((line) => `${line.menuItemId}:${line.quantity}`).sort().join('|')}:${count}:${money}:${calories}`;
  return PERSONAS[stableHash(signature) % PERSONAS.length];
}

export function selectMilestone(count: number, money: number, calories: number): ShareMilestone {
  if (count >= 50 || money >= 100000 || calories >= 50000) return { id: 'legend', title: '白吃传奇', stamp: '传说级克制' };
  if (count >= 20 || money >= 50000 || calories >= 20000) return { id: 'master', title: '白吃大师', stamp: '大师认证' };
  if (count >= 5 || money >= 10000 || calories >= 5000) return { id: 'expert', title: '白吃熟练工', stamp: '阶段达成' };
  return { id: 'rookie', title: '白吃新人战报', stamp: '正在升级' };
}
