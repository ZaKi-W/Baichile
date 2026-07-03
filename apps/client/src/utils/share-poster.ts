import type { ShareLanding } from '@baichile/api-contract';

export interface SharePosterModel {
  background: string;
  eyebrow: string;
  title: string;
  primary: string;
  secondary: string;
  detail: string;
  textColor: string;
  mutedColor: string;
}

export function buildSharePosterModel(data: ShareLanding): SharePosterModel {
  if (data.kind === 'achievement') {
    return {
      background: '/static/share/achievement-report-bg.jpg',
      eyebrow: '白吃战报',
      title: data.title ?? '嘴上没亏待自己，肚子也没为难自己',
      primary: `累计白吃 ${data.completedOrderCount} 顿`,
      secondary: `省下 ¥${money(data.savedMoneyCents)} · 约 ${data.savedCaloriesKcal} 千卡`,
      detail: '认真点餐，坚决不吃。',
      textColor: '#fff8e8',
      mutedColor: '#d7dda1',
    };
  }
  if (data.kind === 'invitation') {
    return {
      background: '/static/share/invitation-ticket-bg.jpg',
      eyebrow: '朋友请客券',
      title: data.title ?? '送你一笔饭钱，放心，是假的',
      primary: `送你 ¥${wholeMoney(data.inviteeRewardCents)} 虚拟饭钱`,
      secondary: '点开一起白吃，双方都有奖励',
      detail: '不能提现，但真能在这里花。',
      textColor: '#2b211b',
      mutedColor: '#925336',
    };
  }
  return {
    background: '/static/share/order-receipt-bg.jpg',
    eyebrow: '本单已送达到想象里',
    title: data.title ?? '这顿我点了，但没真吃',
    primary: `省下 ¥${money(data.savedMoneyCents)}`,
    secondary: `逃过约 ${data.savedCaloriesKcal} 千卡`,
    detail: data.dishNames.slice(0, 2).join('、') || '一顿神秘空气外卖',
    textColor: '#2b2923',
    mutedColor: '#796d5b',
  };
}

function money(cents: number): string {
  return (cents / 100).toFixed(2);
}

function wholeMoney(cents: number): string {
  const yuan = cents / 100;
  return Number.isInteger(yuan) ? yuan.toFixed(0) : yuan.toFixed(2);
}
