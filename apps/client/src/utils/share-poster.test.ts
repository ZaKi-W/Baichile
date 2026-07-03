import { describe, expect, it } from 'vitest';
import type { ShareLanding } from '@baichile/api-contract';
import { buildSharePosterModel } from './share-poster';

const landing = (kind: ShareLanding['kind']): ShareLanding => ({
  active: true,
  kind,
  title: '这顿我点了，但没真吃',
  dishNames: ['招牌炸鸡', '芝士薯条', '一杯很长很长名字的快乐气泡水'],
  savedMoneyCents: 4680,
  savedCaloriesKcal: 820,
  completedOrderCount: 18,
  inviteeRewardCents: 3000,
  benefitText: '双方都有虚拟饭钱',
});

describe('share poster model', () => {
  it('uses a receipt cover for an order share', () => {
    expect(buildSharePosterModel(landing('order'))).toMatchObject({
      background: '/static/share/order-receipt-bg.jpg',
      eyebrow: '本单已送达到想象里',
      primary: '省下 ¥46.80',
    });
  });

  it('uses achievement totals for a report cover', () => {
    expect(buildSharePosterModel(landing('achievement'))).toMatchObject({
      background: '/static/share/achievement-report-bg.jpg',
      eyebrow: '白吃战报',
      primary: '累计白吃 18 顿',
    });
  });

  it('uses the configured invitee reward for an invitation cover', () => {
    expect(buildSharePosterModel(landing('invitation'))).toMatchObject({
      background: '/static/share/invitation-ticket-bg.jpg',
      eyebrow: '朋友请客券',
      primary: '送你 ¥30 虚拟饭钱',
    });
  });
});
