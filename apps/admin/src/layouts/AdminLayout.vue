<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  Avatar,
  Coin,
  DataAnalysis,
  Document,
  Goods,
  List,
  Setting,
  SwitchButton,
  UserFilled,
} from '@element-plus/icons-vue';
import { useAuthStore } from '../stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const menu = computed(() => [
  { path: '/', label: '运营概览', icon: DataAnalysis, permission: 'dashboard:read' as const },
  { path: '/stores', label: '商家管理', icon: Goods, permission: 'catalog:read' as const },
  { path: '/accounts', label: '用户与货币', icon: Coin, permission: 'accounts:read' as const },
  { path: '/orders', label: '订单管理', icon: List, permission: 'orders:read' as const },
  { path: '/share-rewards', label: '分享奖励', icon: Setting, permission: 'wallet:read' as const },
  { path: '/admins', label: '管理员', icon: UserFilled, permission: 'admins:manage' as const },
  { path: '/audit', label: '审计日志', icon: Document, permission: 'audit:read' as const },
].filter((item) => auth.has(item.permission)));

async function logout() {
  await auth.logout();
  await router.push({ name: 'login' });
}
</script>

<template>
  <div class="admin-shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark"><el-icon><Goods /></el-icon></div>
        <div><strong>白吃了</strong><span>运营后台</span></div>
      </div>
      <nav class="nav-list" aria-label="后台导航">
        <RouterLink
          v-for="item in menu"
          :key="item.path"
          :to="item.path"
          :class="{ active: route.path === item.path || (item.path !== '/' && route.path.startsWith(item.path)) }"
        >
          <el-icon><component :is="item.icon" /></el-icon>
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>
      <div class="sidebar-account">
        <el-avatar :size="34"><el-icon><Avatar /></el-icon></el-avatar>
        <div><strong>{{ auth.admin?.displayName }}</strong><span>{{ auth.admin?.username }}</span></div>
        <el-button text circle aria-label="退出登录" @click="logout"><el-icon><SwitchButton /></el-icon></el-button>
      </div>
    </aside>
    <main class="workspace">
      <header class="topbar">
        <div>
          <p>内部运营系统</p>
          <h1>{{ route.meta.title }}</h1>
        </div>
        <el-tag effect="plain" type="info">{{ auth.admin?.role }}</el-tag>
      </header>
      <section class="page"><RouterView /></section>
    </main>
  </div>
</template>
