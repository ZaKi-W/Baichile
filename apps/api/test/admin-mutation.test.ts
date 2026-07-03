import { describe, expect, it } from 'vitest';
import {
  parseAccountUpdate,
  parseOrderUpdate,
  parseWalletAdjustment,
} from '../src/admin/admin-mutation.service';

describe('admin mutation validation', () => {
  it('only accepts editable account fields', () => {
    expect(parseAccountUpdate({ nickname: ' 新昵称 ', status: 'disabled' }))
      .toEqual({ nickname: '新昵称', status: 'disabled' });
    expect(() => parseAccountUpdate({ balanceCents: 1 })).toThrow('没有可更新的用户字段');
  });

  it('prevents mutation of order snapshots', () => {
    expect(parseOrderUpdate({ adminStatus: 'resolved', adminNote: ' 已处理 ' }))
      .toEqual({ adminStatus: 'resolved', adminNote: '已处理' });
    expect(() => parseOrderUpdate({ totalCents: 1 })).toThrow('没有可更新的订单字段');
  });

  it('requires integer wallet amounts and an operational reason', () => {
    expect(parseWalletAdjustment({ amountCents: -500, reason: ' 纠正误发 ' }))
      .toEqual({ amountCents: -500, reason: '纠正误发' });
    expect(() => parseWalletAdjustment({ amountCents: 1.5, reason: '测试原因' })).toThrow('整数分');
    expect(() => parseWalletAdjustment({ amountCents: 100, reason: '短' })).toThrow('2–200');
  });
});
