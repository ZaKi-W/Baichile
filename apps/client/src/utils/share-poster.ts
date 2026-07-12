import type { ShareLanding } from '@baichile/api-contract';

export interface SharePosterModel {
  eyebrow: string;
  title: string;
  primary: string;
  secondary: string;
  detail: string;
  accent: string;
  background: string;
  stamp: string;
}

export function buildSharePosterModel(data: ShareLanding): SharePosterModel {
  if (data.kind === 'achievement') {
    return {
      eyebrow: '白吃阶段战报', title: data.milestone?.title || '白吃新人战报',
      primary: `累计白吃 ${data.completedOrderCount} 顿`,
      secondary: `省下 ¥${money(data.savedMoneyCents)} · 躲过 ${data.savedCaloriesKcal} 千卡`,
      detail: '嘴没有受委屈，胃也没有加班。', accent: '#F04B32', background: '#FFF8DE',
      stamp: data.milestone?.stamp || '正在升级',
    };
  }
  if (data.kind === 'persona') {
    return {
      eyebrow: `这顿白吃人格 · ${data.persona?.acronym || 'MINS'}`, title: data.persona?.name || '极简空盘修行者',
      primary: data.persona?.verdict || '嘴先点了，胃及时撤回。',
      secondary: `${data.completedOrderCount} 顿 · ¥${money(data.savedMoneyCents)} · ${data.savedCaloriesKcal} 千卡`,
      detail: data.persona?.description || '选择越少，内心越饱。', accent: '#2E8B72', background: '#FFD400',
      stamp: '鉴定有效',
    };
  }
  const egg = data.easterEgg;
  return {
    eyebrow: egg ? `${rarityText(egg.rarity)}彩蛋 · #${egg.collectionNumber}` : '本单荒诞结算单',
    title: egg?.name || data.title || '这顿我点了，但没真吃',
    primary: `点了 ¥${money(data.savedMoneyCents)}，实际摄入 0`,
    secondary: `成功躲过 ${data.savedCaloriesKcal} 千卡`,
    detail: egg?.verdict || data.dishNames.slice(0, 3).join('、') || '一顿神秘空气外卖',
    accent: egg?.themeColor || '#F04B32', background: '#FFF8DE', stamp: egg ? '稀有收藏' : '理智签收',
  };
}

function money(cents: number): string { return (cents / 100).toFixed(2); }
function rarityText(value: string): string { return value === 'legendary' ? '传说' : value === 'rare' ? '稀有' : '普通'; }
