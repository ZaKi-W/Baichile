import { createRouter, createWebHistory } from 'vue-router';
import type { AdminPermission } from '@baichile/api-contract';
import { useAuthStore } from './stores/auth';

declare module 'vue-router' {
  interface RouteMeta {
    title?: string;
    permission?: AdminPermission;
  }
}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('./pages/LoginPage.vue') },
    {
      path: '/',
      component: () => import('./layouts/AdminLayout.vue'),
      children: [
        { path: '', name: 'dashboard', component: () => import('./pages/DashboardPage.vue'), meta: { title: '运营概览', permission: 'dashboard:read' } },
        { path: 'stores', name: 'stores', component: () => import('./pages/StoresPage.vue'), meta: { title: '商家管理', permission: 'catalog:read' } },
        { path: 'stores/:storeId', name: 'store-detail', component: () => import('./pages/StoreDetailPage.vue'), meta: { title: '商家详情', permission: 'catalog:read' } },
        { path: 'accounts', name: 'accounts', component: () => import('./pages/AccountsPage.vue'), meta: { title: '用户管理', permission: 'accounts:read' } },
        { path: 'accounts/:id', name: 'account-detail', component: () => import('./pages/AccountDetailPage.vue'), meta: { title: '用户详情', permission: 'accounts:read' } },
        { path: 'orders', name: 'orders', component: () => import('./pages/OrdersPage.vue'), meta: { title: '订单管理', permission: 'orders:read' } },
        { path: 'orders/:id', name: 'order-detail', component: () => import('./pages/OrderDetailPage.vue'), meta: { title: '订单详情', permission: 'orders:read' } },
        { path: 'share-rewards', name: 'share-rewards', component: () => import('./pages/ShareRewardsPage.vue'), meta: { title: '分享奖励', permission: 'wallet:read' } },
        { path: 'admins', name: 'admins', component: () => import('./pages/AdminUsersPage.vue'), meta: { title: '管理员', permission: 'admins:manage' } },
        { path: 'audit', name: 'audit', component: () => import('./pages/AuditLogsPage.vue'), meta: { title: '审计日志', permission: 'audit:read' } },
      ],
    },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  await auth.ensureLoaded();
  if (to.name === 'login') return auth.loggedIn ? { name: 'dashboard' } : true;
  if (!auth.loggedIn) return { name: 'login', query: { redirect: to.fullPath } };
  if (!auth.has(to.meta.permission)) return { name: 'dashboard' };
  return true;
});
