import type { ShareLanding } from '@baichile/api-contract';

export type SharePosterKind = 'order' | 'order_egg' | 'persona' | 'achievement' | 'reward';

export const VIRTUAL_FUNDS_NOTICE = '虚拟外卖游戏，不涉及真实资金，虚拟余额不可充值或提现。';

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
  fundsNotice: string;
}

export function buildSharePosterModel(data: ShareLanding, requestedKind?: SharePosterKind): SharePosterModel {
  const kind = requestedKind || normalizeKind(data.kind);
  if (kind === 'achievement') {
    return {
      kind,
      eyebrow: '本次升级成果', title: data.milestone?.title || '白吃新人进阶中',
      primary: `累计 ${data.completedOrderCount} 顿`,
      secondary: `订单金额 ¥${money(data.savedMoneyCents)} · 热量 ${data.savedCaloriesKcal} 千卡`,
      detail: '每一次虚拟点单，都让你的游戏等级再亮一点。', accent: '#36BFA1',
      stamp: data.milestone?.stamp || '升级中', ticket: 'ACHIEVEMENT DROP', primaryLabel: '当前累计', callToAction: '来测你的白吃等级',
      fundsNotice: VIRTUAL_FUNDS_NOTICE,
    };
  }
  if (kind === 'persona') {
    return {
      kind,
      eyebrow: `你的白吃人格 · ${data.persona?.acronym || 'MINS'}`, title: data.persona?.name || '极简空盘修行者',
      primary: data.persona?.verdict || '嘴先点了，胃及时撤回。',
      secondary: `${data.completedOrderCount} 顿订单 · 订单金额 ¥${money(data.savedMoneyCents)}`,
      detail: data.persona?.description || '选择越少，内心越饱。', accent: '#36BFA1',
      stamp: '人格已解锁', ticket: 'PERSONA CAPSULE', primaryLabel: '本次鉴定', callToAction: '扫码抽取你的同款人格',
      fundsNotice: VIRTUAL_FUNDS_NOTICE,
    };
  }
  if (kind === 'reward') {
    return {
      kind,
      eyebrow: '好友扭蛋邀请', title: '一起领虚拟饭钱',
      primary: `¥${money(data.inviteeRewardCents)}`,
      secondary: '首次登录后到账', detail: data.benefitText || '把这枚饭钱胶囊发给朋友，一起假装点外卖。',
      accent: '#FF7145', stamp: '邀请有效', ticket: 'REWARD CAPSULE', primaryLabel: '新朋友可领', callToAction: '扫码领取你的饭钱胶囊',
      fundsNotice: VIRTUAL_FUNDS_NOTICE,
    };
  }
  const egg = data.easterEgg;
  return {
    kind,
    eyebrow: egg ? `${rarityText(egg.rarity)}彩蛋 · #${egg.collectionNumber}` : '本单空气外卖',
    title: egg?.name || data.storeName || data.title || '这顿虚拟外卖已完成',
    primary: kind === 'order_egg' ? '恭喜抽到隐藏彩蛋' : `¥${money(data.savedMoneyCents)}`,
    secondary: `热量 ${data.savedCaloriesKcal} 千卡`,
    detail: egg?.verdict || data.dishNames.slice(0, 3).join('、') || '一顿神秘空气外卖',
    accent: egg?.themeColor || '#FF7145', stamp: kind === 'order_egg' ? '彩蛋已解锁' : '订单完成',
    ticket: kind === 'order_egg' ? 'HIDDEN CAPSULE' : 'ORDER CAPSULE', primaryLabel: kind === 'order_egg' ? '本次获得' : '订单金额', callToAction: kind === 'order_egg' ? '扫码抽取更多彩蛋' : '扫码开一单虚拟外卖',
    fundsNotice: VIRTUAL_FUNDS_NOTICE,
  };
}

function money(cents: number): string { return (cents / 100).toFixed(2); }
function rarityText(value: string): string { return value === 'legendary' ? '传说' : value === 'rare' ? '稀有' : '普通'; }
function normalizeKind(kind: ShareLanding['kind']): SharePosterKind {
  if (kind === 'persona' || kind === 'achievement' || kind === 'reward' || kind === 'order_egg') return kind;
  return 'order';
}
