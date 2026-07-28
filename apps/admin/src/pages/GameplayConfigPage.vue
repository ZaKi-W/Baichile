<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Check, RefreshRight } from '@element-plus/icons-vue';
import { adminApi, type GameplayConfig } from '../api/admin';
import { formatDate } from '../utils';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const loaded = ref<GameplayConfig | null>(null);
const form = reactive({
  firstCheckoutGuaranteed: true,
  deliveryIncidentPercent: 10,
  successEggPercent: 10,
});

const hasChanges = computed(() => {
  if (!loaded.value) return false;
  return loaded.value.firstCheckoutGuaranteed !== form.firstCheckoutGuaranteed
    || Math.abs(loaded.value.deliveryIncidentRate * 100 - form.deliveryIncidentPercent) > 0.001
    || Math.abs(loaded.value.successEggRate * 100 - form.successEggPercent) > 0.001;
});

function messageOf(reason: unknown, fallback: string): string {
  return reason instanceof Error ? reason.message : fallback;
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const config = await adminApi.gameplayConfig();
    loaded.value = config;
    form.firstCheckoutGuaranteed = config.firstCheckoutGuaranteed;
    form.deliveryIncidentPercent = Number((config.deliveryIncidentRate * 100).toFixed(2));
    form.successEggPercent = Number((config.successEggRate * 100).toFixed(2));
  } catch (reason) {
    error.value = messageOf(reason, '玩法配置加载失败');
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (!form.firstCheckoutGuaranteed) {
    await ElMessageBox.confirm(
      '关闭首次 checkout 必达会直接影响新用户首轮体验。确认保存？',
      '高影响配置确认',
      { type: 'warning' },
    );
  }
  saving.value = true;
  error.value = '';
  try {
    loaded.value = await adminApi.updateGameplayConfig({
      firstCheckoutGuaranteed: form.firstCheckoutGuaranteed,
      deliveryIncidentRate: form.deliveryIncidentPercent / 100,
      successEggRate: form.successEggPercent / 100,
    });
    ElMessage.success('玩法配置已更新并写入审计日志');
    await load();
  } catch (reason) {
    error.value = messageOf(reason, '玩法配置保存失败');
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section class="operations-intro">
    <div>
      <p class="eyebrow">EXPERIENCE CONTROL</p>
      <h2>结算与配送玩法护栏</h2>
      <p>首次 checkout 默认必达；后续订单事故率与成功单彩蛋率默认均为 10%。概率只作用于虚拟订单体验。</p>
    </div>
    <div v-if="loaded" class="config-revision">
      <span>最近更新</span>
      <strong>{{ formatDate(loaded.updatedAt) }}</strong>
    </div>
  </section>

  <el-alert v-if="error" class="page-error" type="error" :title="error" show-icon :closable="false">
    <template #default>
      <el-button link type="danger" :icon="RefreshRight" @click="load">重试</el-button>
    </template>
  </el-alert>

  <div v-loading="loading" class="gameplay-layout">
    <section class="surface config-panel">
      <div class="panel-heading">
        <div>
          <h3>首次结算保护</h3>
          <p>降低新用户首次体验被随机失败打断的概率。</p>
        </div>
        <el-tag effect="plain" :type="form.firstCheckoutGuaranteed ? 'success' : 'danger'">
          {{ form.firstCheckoutGuaranteed ? '护栏开启' : '护栏关闭' }}
        </el-tag>
      </div>
      <div class="config-switch-row">
        <div>
          <strong>首次 checkout 必达</strong>
          <span>开启后，每个用户的首次虚拟结算不会触发配送事故。</span>
        </div>
        <el-switch
          v-model="form.firstCheckoutGuaranteed"
          :disabled="!auth.has('promotions:write')"
          active-text="开启"
          inactive-text="关闭"
        />
      </div>
    </section>

    <section class="surface config-panel probability-panel">
      <div class="panel-heading">
        <div>
          <h3>后续随机规则</h3>
          <p>以 0–100% 管理，保存时转换为 0–1 的服务端概率。</p>
        </div>
      </div>
      <div class="probability-control">
        <div class="probability-copy">
          <strong>后续订单事故率</strong>
          <span>仅对非首次 checkout 的虚拟配送生效。</span>
        </div>
        <el-input-number
          v-model="form.deliveryIncidentPercent"
          :disabled="!auth.has('promotions:write')"
          :min="0"
          :max="100"
          :precision="1"
          controls-position="right"
        />
        <b>%</b>
      </div>
      <el-slider
        v-model="form.deliveryIncidentPercent"
        :disabled="!auth.has('promotions:write')"
        :min="0"
        :max="100"
        :step="1"
        :marks="{ 0: '0%', 10: '默认 10%', 50: '50%', 100: '100%' }"
      />
      <div class="probability-control second">
        <div class="probability-copy">
          <strong>成功单彩蛋率</strong>
          <span>只在虚拟配送成功后决定是否展示彩蛋。</span>
        </div>
        <el-input-number
          v-model="form.successEggPercent"
          :disabled="!auth.has('promotions:write')"
          :min="0"
          :max="100"
          :precision="1"
          controls-position="right"
        />
        <b>%</b>
      </div>
      <el-slider
        v-model="form.successEggPercent"
        :disabled="!auth.has('promotions:write')"
        :min="0"
        :max="100"
        :step="1"
        :marks="{ 0: '0%', 10: '默认 10%', 50: '50%', 100: '100%' }"
      />
    </section>

    <aside class="surface config-guardrail">
      <span class="guardrail-kicker">当前组合</span>
      <strong>{{ form.firstCheckoutGuaranteed ? '首结算必达' : '首结算参与随机' }}</strong>
      <dl>
        <div><dt>后续事故</dt><dd>{{ form.deliveryIncidentPercent.toFixed(1) }}%</dd></div>
        <div><dt>成功彩蛋</dt><dd>{{ form.successEggPercent.toFixed(1) }}%</dd></div>
      </dl>
      <el-alert
        v-if="form.deliveryIncidentPercent > 30"
        type="warning"
        title="事故率高于 30%，建议仅用于短时实验。"
        :closable="false"
        show-icon
      />
      <el-button
        v-if="auth.has('promotions:write')"
        type="primary"
        :icon="Check"
        :loading="saving"
        :disabled="!loaded || !hasChanges"
        @click="save"
      >
        保存并生效
      </el-button>
      <span v-else class="read-only-note">当前账号仅有查看权限</span>
    </aside>
  </div>
</template>
