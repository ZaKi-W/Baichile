import type { ShareLanding } from '@baichile/api-contract';

export type SharePosterKind = 'order' | 'order_egg' | 'persona' | 'achievement' | 'reward';

export interface SharePosterModel {
  kind: SharePosterKind;
  eyebrow: string;
  title: string;
  primary: string;
  secondary: string;
  detail: string;
  accent: string;
  stamp: string;
  ticket: string;
  primaryLabel: string;
  callToAction: string;
}

export function buildSharePosterModel(data: ShareLanding, requestedKind?: SharePosterKind): SharePosterModel {
  const kind = requestedKind || normalizeKind(data.kind);
  if (kind === 'achievement') {
    return {
      kind,
      eyebrow: '本次升级成果', title: data.milestone?.title || '白吃新人进阶中',
      primary: `累计 ${data.completedOrderCount} 顿`,
      secondary: `省下 ¥${money(data.savedMoneyCents)} · ${data.savedCaloriesKcal} 千卡`,
      detail: '每一次忍住不下嘴，都让你的白吃等级再亮一点。', accent: '#36BFA1',
      stamp: data.milestone?.stamp || '升级中', ticket: 'ACHIEVEMENT DROP', primaryLabel: '当前累计', callToAction: '来测你的白吃等级',
    };
  }
  if (kind === 'persona') {
    return {
      kind,
      eyebrow: `你的白吃人格 · ${data.persona?.acronym || 'MINS'}`, title: data.persona?.name || '极简空盘修行者',
      primary: data.persona?.verdict || '嘴先点了，胃及时撤回。',
      secondary: `${data.completedOrderCount} 顿 · ¥${money(data.savedMoneyCents)}`,
      detail: data.persona?.description || '选择越少，内心越饱。', accent: '#36BFA1',
      stamp: '人格已解锁', ticket: 'PERSONA CAPSULE', primaryLabel: '本次鉴定', callToAction: '扫码抽取你的同款人格',
    };
  }
  if (kind === 'reward') {
    return {
      kind,
      eyebrow: '好友扭蛋邀请', title: '一起领虚拟饭钱',
      primary: `¥${money(data.inviteeRewardCents)}`,
      secondary: '首次登录后到账', detail: data.benefitText || '把这枚饭钱胶囊发给朋友，一起假装点外卖。',
      accent: '#FF7145', stamp: '邀请有效', ticket: 'REWARD CAPSULE', primaryLabel: '新朋友可领', callToAction: '扫码领取你的饭钱胶囊',
    };
  }
  const egg = data.easterEgg;
  return {
    kind,
    eyebrow: egg ? `${rarityText(egg.rarity)}彩蛋 · #${egg.collectionNumber}` : '本单空气外卖',
    title: egg?.name || data.storeName || data.title || '这顿我点了，但没真吃',
    primary: kind === 'order_egg' ? '恭喜抽到隐藏彩蛋' : `¥${money(data.savedMoneyCents)}`,
    secondary: `成功躲过 ${data.savedCaloriesKcal} 千卡`,
    detail: egg?.verdict || data.dishNames.slice(0, 3).join('、') || '一顿神秘空气外卖',
    accent: egg?.themeColor || '#FF7145', stamp: kind === 'order_egg' ? '彩蛋已解锁' : '本单已撤回',
    ticket: kind === 'order_egg' ? 'HIDDEN CAPSULE' : 'ORDER CAPSULE', primaryLabel: kind === 'order_egg' ? '本次获得' : '本单实付', callToAction: kind === 'order_egg' ? '扫码抽取更多彩蛋' : '扫码开一单空气外卖',
  };
}

function money(cents: number): string { return (cents / 100).toFixed(2); }
function rarityText(value: string): string { return value === 'legendary' ? '传说' : value === 'rare' ? '稀有' : '普通'; }
function normalizeKind(kind: ShareLanding['kind']): SharePosterKind {
  if (kind === 'persona' || kind === 'achievement' || kind === 'reward' || kind === 'order_egg') return kind;
  return 'order';
}
