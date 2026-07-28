import { defineStore } from 'pinia';
import {
  adminApi,
  type AdminConsolePermission,
  type AdminIdentity,
} from '../api/admin';
import { getToken, setToken } from '../api/http';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    admin: null as AdminIdentity | null,
    loaded: false,
  }),
  getters: {
    loggedIn: (state) => !!state.admin,
  },
  actions: {
    async login(username: string, password: string) {
      const result = await adminApi.login(username, password);
      setToken(result.accessToken);
      this.admin = result.admin;
      this.loaded = true;
    },
    async ensureLoaded() {
      if (this.loaded) return;
      if (!getToken()) {
        this.loaded = true;
        return;
      }
      try {
        this.admin = await adminApi.me();
      } catch {
        this.admin = null;
      } finally {
        this.loaded = true;
      }
    },
    has(permission?: AdminConsolePermission) {
      if (permission && this.admin?.role === 'support' && !permission.endsWith(':read')) {
        return false;
      }
      return !permission || !!this.admin?.permissions.includes(permission);
    },
    async logout() {
      try {
        if (getToken()) await adminApi.logout();
      } finally {
        setToken('');
        this.admin = null;
        this.loaded = true;
      }
    },
  },
});
