import { defineStore } from 'pinia';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
const VISITOR_KEY = 'baichile:visitor';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    visitorId: '' as string,
    accessToken: '' as string,
    accountId: '' as string,
    provider: 'guest' as 'guest' | 'dev-mock' | 'wechat',
  }),
  actions: {
    async ensureGuest() {
      const saved = uni.getStorageSync(VISITOR_KEY) as { visitorId: string; accessToken: string } | '';
      if (saved) {
        this.visitorId = saved.visitorId;
        this.accessToken = saved.accessToken;
        return;
      }
      if (API_BASE) {
        try {
          const data = await new Promise<{ visitorId: string; accessToken: string }>((resolve, reject) => {
            uni.request({
              method: 'POST', url: `${API_BASE}/v1/auth/guest`,
              success: (response) => resolve(response.data as { visitorId: string; accessToken: string }),
              fail: reject,
            });
          });
          this.visitorId = data.visitorId;
          this.accessToken = data.accessToken;
        } catch {
          this.createLocalGuest();
        }
      } else {
        this.createLocalGuest();
      }
      uni.setStorageSync(VISITOR_KEY, { visitorId: this.visitorId, accessToken: this.accessToken });
    },
    createLocalGuest() {
      this.visitorId = `visitor_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      this.accessToken = `local.${this.visitorId}`;
    },
    async devLogin() {
      if (import.meta.env.PROD) throw new Error('生产环境不可使用模拟微信登录');
      this.accountId = `account_dev_${Date.now()}`;
      this.provider = 'dev-mock';
      if (API_BASE) {
        await uni.request({
          method: 'POST',
          url: `${API_BASE}/v1/auth/merge-visitor`,
          data: { visitorId: this.visitorId, accountId: this.accountId },
        });
      }
    },
  },
});
