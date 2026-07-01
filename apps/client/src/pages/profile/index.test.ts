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
});
