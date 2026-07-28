import { describe, expect, it } from 'vitest';
import type { ShareInviteDoc, WalletTransactionDoc } from './models';
import {
  sanitizeShareInviteCopy,
  sanitizeWalletTransactionCopy,
} from './product-copy';

const RETIRED = '\u6a21\u62df';
const NOW = '2026-01-01T00:00:00.000Z';

describe('legacy product copy compatibility', () => {
  it('cleans only the exact system-owned wallet description', () => {
    const row: WalletTransactionDoc = {
      _id: 'wallet_1',
      id: 'wallet_1',
      accountId: 'account_1',
      type: 'order_payment',
      amountCents: -100,
      balanceAfterCents: 200,
      description: `${RETIRED}订单扣款（虚拟余额）`,
      createdAt: NOW,
    };

    expect(sanitizeWalletTransactionCopy(row).description).toBe('订单扣款（虚拟余额）');
    expect(row.description).toContain(RETIRED);
    expect(sanitizeWalletTransactionCopy({
      ...row,
      description: `管理员自定义${RETIRED}说明`,
    }).description).toBe(`管理员自定义${RETIRED}说明`);
  });

  it('cleans exact system-owned share fields without changing user content', () => {
    const row: ShareInviteDoc = {
      _id: 'share_1',
      token: 'share_1',
      inviterAccountId: 'account_1',
      kind: 'persona',
      title: `我的这顿白吃人格是 CALN · ${RETIRED}热量忍者`,
      snapshot: {
        storeName: `${RETIRED}小馆`,
        dishNames: [`${RETIRED}炒饭`],
        savedMoneyCents: 100,
        savedCaloriesKcal: 200,
        completedOrderCount: 1,
        persona: {
          id: 'caln',
          acronym: 'CALN',
          name: `${RETIRED}热量忍者`,
          verdict: `${RETIRED}热量刚到门口，你已经完成了整桌推演。`,
          description: `对${RETIRED}热量极其敏锐，最享受在虚拟点单里研究一整桌。`,
          callToAction: `看看你的${RETIRED}热量人格`,
          imageUrl: '/persona.png',
        },
        milestone: {
          id: 'one',
          title: `${RETIRED}订单达人`,
          stamp: `${RETIRED}订单认证`,
        },
        easterEgg: {
          id: 'egg',
          name: `${RETIRED}彩蛋`,
          rarity: 'common',
          verdict: `${RETIRED}彩蛋判词`,
          themeColor: '#000000',
          decoration: 'plate',
          collectionNumber: '0001',
          triggeredAt: NOW,
        },
      },
      initiatedRewardGranted: false,
      expiresAt: NOW,
      createdAt: NOW,
    };

    const safe = sanitizeShareInviteCopy(row);

    expect(safe.title).toBe('我的这顿白吃人格是 CALN · 热量忍者');
    expect(JSON.stringify(safe.snapshot.persona)).not.toContain(RETIRED);
    expect(safe.snapshot.storeName).toBe(`${RETIRED}小馆`);
    expect(safe.snapshot.dishNames).toEqual([`${RETIRED}炒饭`]);
    expect(safe.snapshot.milestone).toEqual(row.snapshot.milestone);
    expect(safe.snapshot.easterEgg).toEqual(row.snapshot.easterEgg);
  });
});
