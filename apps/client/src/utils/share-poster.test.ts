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
      background: '#FFF8DE',
      eyebrow: '本单荒诞结算单',
      primary: '点了 ¥46.80，实际摄入 0',
    });
  });

  it('uses achievement totals for a report cover', () => {
    expect(buildSharePosterModel(landing('achievement'))).toMatchObject({
      background: '#FFF8DE',
      eyebrow: '白吃阶段战报',
      primary: '累计白吃 18 顿',
    });
  });

  it('uses a dynamic persona result', () => {
    expect(buildSharePosterModel({ ...landing('persona'), persona: { id: 'teaa', acronym: 'TEAA', name: '茶饮炼金师', verdict: '杯子可以加大，摄入必须归零。', callToAction: '测测你', description: '饮料调和情绪。', imageUrl: '/static/personas/teaa.png' } })).toMatchObject({
      background: '#FFD400',
      eyebrow: '这顿白吃人格 · TEAA',
      title: '茶饮炼金师',
    });
  });
});
