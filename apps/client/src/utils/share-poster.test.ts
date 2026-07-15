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
  it('uses the order capsule model for an order share', () => {
    expect(buildSharePosterModel(landing('order'))).toMatchObject({
      kind: 'order',
      eyebrow: '本单空气外卖',
      primary: '¥46.80',
      ticket: 'ORDER CAPSULE',
    });
  });

  it('renders a triggered delivery incident as the order easter egg', () => {
    expect(buildSharePosterModel({
      ...landing('order'),
      easterEgg: {
        id: 'incident-alien_abduction',
        name: '您的外卖已抵达火星，配送失败',
        rarity: 'rare',
        verdict: '骑手遭遇了外星人袭击',
        themeColor: '#F04B32',
        decoration: 'delivery-incident',
        collectionNumber: '0042',
        triggeredAt: '2026-07-12T02:00:00.000Z',
      },
    }, 'order_egg')).toMatchObject({
      kind: 'order_egg',
      eyebrow: '稀有彩蛋 · #0042',
      title: '您的外卖已抵达火星，配送失败',
      detail: '骑手遭遇了外星人袭击',
      stamp: '彩蛋已解锁',
    });
  });

  it('uses achievement totals for an upgrade capsule', () => {
    expect(buildSharePosterModel(landing('achievement'))).toMatchObject({
      eyebrow: '本次升级成果',
      primary: '累计 18 顿',
      ticket: 'ACHIEVEMENT DROP',
    });
  });

  it('uses a dynamic persona result', () => {
    expect(buildSharePosterModel({ ...landing('persona'), persona: { id: 'teaa', acronym: 'TEAA', name: '茶饮炼金师', verdict: '杯子可以加大，摄入必须归零。', callToAction: '测测你', description: '饮料调和情绪。', imageUrl: '/static/personas/teaa.png' } })).toMatchObject({
      eyebrow: '你的白吃人格 · TEAA',
      title: '茶饮炼金师',
      ticket: 'PERSONA CAPSULE',
    });
  });

  it('provides a reward capsule model for invitation posters', () => {
    expect(buildSharePosterModel(landing('reward'))).toMatchObject({
      kind: 'reward',
      primary: '¥30.00',
      ticket: 'REWARD CAPSULE',
    });
  });
});
