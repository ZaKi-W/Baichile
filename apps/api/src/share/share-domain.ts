import { BadRequestException } from '@nestjs/common';
import type { ShareRewardConfig } from '@baichile/api-contract';

export const DEFAULT_SHARE_REWARD_CONFIG: ShareRewardConfig = {
  enabled: true,
  initiatedRewardCents: 500,
  inviterRewardCents: 3000,
  inviteeRewardCents: 3000,
  dailyInitiatedLimit: 1,
  orderTitles: [
    '骑手跑了 3 公里，我一口没胖',
    '这顿我点了，但没真吃',
    '本单最大赢家：我的银行卡',
  ],
  achievementTitles: [
    '嘴上没亏待自己，肚子也没为难自己',
    '累计白吃 {count} 顿，恩格尔系数看了都沉默',
  ],
  invitationTitles: [
    '这里可以点外卖，唯一的问题是吃不到',
    '送你一笔饭钱，放心，是假的',
  ],
};

export function buildSharePath(token: string): string {
  return `/pages/share-landing/index?token=${encodeURIComponent(token)}`;
}

export function chooseShareTitle(titles: string[], seed: string): string {
  let hash = 0;
  for (const character of seed) hash = ((hash * 31) + character.charCodeAt(0)) >>> 0;
  return titles[hash % titles.length] ?? '来白吃一顿';
}

export function isShareMilestone(completedOrderCount: number): boolean {
  return completedOrderCount >= 5 && (
    completedOrderCount % 5 === 0 || completedOrderCount % 10 === 0
  );
}

export function parseShareRewardConfig(value: unknown): ShareRewardConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidConfig();
  const input = value as Record<string, unknown>;
  const integer = (key: keyof ShareRewardConfig, max = 1_000_000) => {
    const item = input[key];
    if (!Number.isInteger(item) || (item as number) < 0 || (item as number) > max) throw invalidConfig();
    return item as number;
  };
  const titles = (key: 'orderTitles' | 'achievementTitles' | 'invitationTitles') => {
    const item = input[key];
    if (!Array.isArray(item) || !item.length || item.length > 20) throw invalidConfig();
    const normalized = item.map((title) => typeof title === 'string' ? title.trim() : '');
    if (normalized.some((title) => !title || title.length > 60)) throw invalidConfig();
    return normalized;
  };
  if (typeof input.enabled !== 'boolean') throw invalidConfig();
  return {
    enabled: input.enabled,
    initiatedRewardCents: integer('initiatedRewardCents'),
    inviterRewardCents: integer('inviterRewardCents'),
    inviteeRewardCents: integer('inviteeRewardCents'),
    dailyInitiatedLimit: integer('dailyInitiatedLimit', 20),
    orderTitles: titles('orderTitles'),
    achievementTitles: titles('achievementTitles'),
    invitationTitles: titles('invitationTitles'),
  };
}

function invalidConfig() {
  return new BadRequestException({ code: 'INVALID_SHARE_CONFIG', message: '分享奖励配置格式不正确' });
}
