import type { ShareRewardConfig } from '@baichile/api-contract';

export const DEFAULT_SHARE_REWARD_CONFIG: ShareRewardConfig = {
  enabled: true,
  initiatedRewardCents: 500,
  inviterRewardCents: 3000,
  inviteeRewardCents: 3000,
  dailyInitiatedLimit: 3,
  orderTitles: ['我刚刚忍住了这顿外卖', '这单我没点，但快乐省下了'],
  achievementTitles: ['我在这顿白吃攒下 {count} 次胜利', '今天也没有被外卖打败'],
  invitationTitles: ['来这顿白吃一起假装点外卖', '请你领一笔虚拟饭钱'],
};

export function buildSharePath(token: string): string {
  return `/pages/share-landing/index?token=${encodeURIComponent(token)}`;
}

export function chooseShareTitle(titles: string[], seed: string): string {
  const pool = titles.length ? titles : DEFAULT_SHARE_REWARD_CONFIG.invitationTitles;
  const hash = Math.abs(seed.split('').reduce((sum, char) => ((sum << 5) - sum + char.charCodeAt(0)) | 0, 0));
  return pool[hash % pool.length];
}

export function parseShareRewardConfig(value: unknown): ShareRewardConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('分享配置格式不正确');
  }
  const input = value as Partial<ShareRewardConfig>;
  const nonNegative = (n: unknown, fallback: number) => (
    Number.isInteger(n) && (n as number) >= 0 ? n as number : fallback
  );
  const stringList = (items: unknown, fallback: string[]) => (
    Array.isArray(items) && items.every((item) => typeof item === 'string' && item.trim())
      ? items.map((item) => item.trim()).slice(0, 20)
      : fallback
  );
  return {
    enabled: input.enabled !== false,
    initiatedRewardCents: nonNegative(input.initiatedRewardCents, DEFAULT_SHARE_REWARD_CONFIG.initiatedRewardCents),
    inviterRewardCents: nonNegative(input.inviterRewardCents, DEFAULT_SHARE_REWARD_CONFIG.inviterRewardCents),
    inviteeRewardCents: nonNegative(input.inviteeRewardCents, DEFAULT_SHARE_REWARD_CONFIG.inviteeRewardCents),
    dailyInitiatedLimit: Math.max(0, Math.min(20, nonNegative(input.dailyInitiatedLimit, DEFAULT_SHARE_REWARD_CONFIG.dailyInitiatedLimit))),
    orderTitles: stringList(input.orderTitles, DEFAULT_SHARE_REWARD_CONFIG.orderTitles),
    achievementTitles: stringList(input.achievementTitles, DEFAULT_SHARE_REWARD_CONFIG.achievementTitles),
    invitationTitles: stringList(input.invitationTitles, DEFAULT_SHARE_REWARD_CONFIG.invitationTitles),
  };
}
