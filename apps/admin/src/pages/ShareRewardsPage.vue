<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import type { ShareRewardConfig } from '@baichile/api-contract';
import { ElMessage } from 'element-plus';
import { adminApi } from '../api/admin';

const loading = ref(false);
const saving = ref(false);
const form = reactive<ShareRewardConfig>({
  enabled: true,
  initiatedRewardCents: 500,
  inviterRewardCents: 3000,
  inviteeRewardCents: 3000,
  dailyInitiatedLimit: 1,
  orderTitles: [],
  achievementTitles: [],
  invitationTitles: [],
});

function lines(values: string[]) {
  return values.join('\n');
}

function setLines(key: 'orderTitles' | 'achievementTitles' | 'invitationTitles', value: string) {
  form[key] = value.split('\n').map((item) => item.trim()).filter(Boolean);
}

async function load() {
  loading.value = true;
  try {
    Object.assign(form, await adminApi.shareRewardConfig());
  } finally {
    loading.value = false;
  }
}

async function save() {
  saving.value = true;
  try {
    Object.assign(form, await adminApi.updateShareRewardConfig({ ...form }));
    ElMessage.success('分享奖励配置已更新并写入审计日志');
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <el-card v-loading="loading" class="surface">
    <template #header>
      <div class="section-title">
        <div><h2>朋友圈分享奖励</h2><p>所有金额均为应用内虚拟货币，不可充值或提现。</p></div>
        <el-switch v-model="form.enabled" active-text="活动开启" inactive-text="活动关闭" />
      </div>
    </template>
    <el-form label-position="top">
      <el-row :gutter="18">
        <el-col :span="6"><el-form-item label="发起分享奖励（分）"><el-input-number v-model="form.initiatedRewardCents" :min="0" /></el-form-item></el-col>
        <el-col :span="6"><el-form-item label="邀请人奖励（分）"><el-input-number v-model="form.inviterRewardCents" :min="0" /></el-form-item></el-col>
        <el-col :span="6"><el-form-item label="新用户奖励（分）"><el-input-number v-model="form.inviteeRewardCents" :min="0" /></el-form-item></el-col>
        <el-col :span="6"><el-form-item label="每日发起奖励次数"><el-input-number v-model="form.dailyInitiatedLimit" :min="0" :max="20" /></el-form-item></el-col>
      </el-row>
      <el-form-item label="订单分享标题（每行一条）">
        <el-input :model-value="lines(form.orderTitles)" type="textarea" :rows="4" @update:model-value="setLines('orderTitles', $event)" />
      </el-form-item>
      <el-form-item label="累计成就标题（每行一条）">
        <el-input :model-value="lines(form.achievementTitles)" type="textarea" :rows="3" @update:model-value="setLines('achievementTitles', $event)" />
      </el-form-item>
      <el-form-item label="邀请分享标题（每行一条）">
        <el-input :model-value="lines(form.invitationTitles)" type="textarea" :rows="3" @update:model-value="setLines('invitationTitles', $event)" />
      </el-form-item>
      <el-button type="primary" :loading="saving" @click="save">保存配置</el-button>
    </el-form>
  </el-card>
</template>
