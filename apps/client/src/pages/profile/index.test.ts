import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('profile page WeChat login', () => {
  it('collects an avatar and nickname before logging in', () => {
    const source = readFileSync(new URL('./index.vue', import.meta.url), 'utf8');

    expect(source).toContain('open-type="chooseAvatar"');
    expect(source).toContain('type="nickname"');
    expect(source).toContain('if (!avatarUrl.value || !trimmedNickname)');
    expect(source).toContain('if (loading.value) return');
    expect(source).toContain('await auth.wechatLogin');
  });

  it('shows the logged-in avatar and nickname', () => {
    const source = readFileSync(new URL('./index.vue', import.meta.url), 'utf8');

    expect(source).toContain(':src="auth.userProfile.avatarUrl"');
    expect(source).toContain('{{ auth.userProfile.nickname }}');
    expect(source).toContain('v-if="auth.accountId"');
  });

  it('shows completed-order money and calorie savings for the account', () => {
    const source = readFileSync(new URL('./index.vue', import.meta.url), 'utf8');

    expect(source).toContain('orders.savings.savedMoneyCents');
    expect(source).toContain('orders.savings.savedCaloriesKcal');
    expect(source).toContain('orders.savings.completedOrderCount');
    expect(source).toContain('累计省下');
    expect(source).toContain('约省卡路里');
    expect(source).toContain('min-height: 52rpx');
    expect(source).not.toContain('money-value');
  });

  it('shows the wallet balance and daily check-in controls without test credit', () => {
    const source = readFileSync(new URL('./index.vue', import.meta.url), 'utf8');

    expect(source).toContain('wallet.summary.balanceCents');
    expect(source).toContain('签到领 ¥100');
    expect(source).not.toContain('测试加 ¥1000');
    expect(source).not.toContain('addTestCredit');
    expect(source).toContain("'/pages/wallet/index'");
  });

  it('shows the current code version in the about section', () => {
    const source = readFileSync(new URL('./index.vue', import.meta.url), 'utf8');
    const version = readFileSync(new URL('../../config/code-version.ts', import.meta.url), 'utf8');

    expect(version).toMatch(/CODE_VERSION = \d+/);
    expect(source).toContain("import { CODE_VERSION }");
    expect(source).toContain('代码版本 {{ CODE_VERSION }}');
  });
});
