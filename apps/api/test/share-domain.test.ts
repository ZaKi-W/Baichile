import { describe, expect, it } from 'vitest';
import {
  buildSharePath,
  chooseShareTitle,
  isShareMilestone,
  parseShareRewardConfig,
} from '../src/share/share-domain';

describe('share domain', () => {
  it('builds a timeline path with encoded attribution token', () => {
    expect(buildSharePath('token/with spaces')).toBe(
      '/pages/share-landing/index?token=token%2Fwith%20spaces',
    );
  });

  it('selects a stable title for the same share context', () => {
    const titles = ['第一条', '第二条', '第三条'];
    expect(chooseShareTitle(titles, 'same-order')).toBe(chooseShareTitle(titles, 'same-order'));
    expect(titles).toContain(chooseShareTitle(titles, 'same-order'));
  });

  it('treats completed-order milestones as achievement share opportunities', () => {
    expect(isShareMilestone(1)).toBe(false);
    expect(isShareMilestone(5)).toBe(true);
    expect(isShareMilestone(10)).toBe(true);
  });

  it('validates editable reward amounts, limit, and copy pools', () => {
    expect(parseShareRewardConfig({
      enabled: true,
      initiatedRewardCents: 500,
      inviterRewardCents: 3000,
      inviteeRewardCents: 3000,
      dailyInitiatedLimit: 1,
      orderTitles: ['这顿我点了，但没真吃'],
      achievementTitles: ['嘴上没亏待自己，肚子也没为难自己'],
      invitationTitles: ['送你一笔饭钱，放心，是假的'],
    })).toMatchObject({ initiatedRewardCents: 500, dailyInitiatedLimit: 1 });
  });
});
