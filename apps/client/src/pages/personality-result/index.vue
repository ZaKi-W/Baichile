<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import PersonalityDimensionBars from '../../components/personality-test/PersonalityDimensionBars.vue';
import PersonalityResultCard from '../../components/personality-test/PersonalityResultCard.vue';
import { usePersonalityTestStore } from '../../stores/personality-test';
import type { QuizMode } from '../../features/personality-test/types';

const quiz = usePersonalityTestStore();
const requestedMode = ref<QuizMode>('quick');
const result = computed(() => requestedMode.value === 'full' ? quiz.fullResult : quiz.quickResult);

onLoad((query) => {
  requestedMode.value = query && query.mode === 'full' ? 'full' : 'quick';
  if (!result.value) {
    if (quiz.fullResult) requestedMode.value = 'full';
    else if (quiz.quickResult) requestedMode.value = 'quick';
    else uni.redirectTo({ url: '/pages/personality-test/index' });
  }
});

function continueFull() {
  quiz.continueFull();
  uni.redirectTo({ url: '/pages/personality-test/index' });
}

function editAnswers() {
  quiz.edit(requestedMode.value);
  uni.redirectTo({ url: '/pages/personality-test/index' });
}

function restart() {
  uni.showModal({
    title: '重新测试？',
    content: '当前结果会保留在本地历史中，并开始一轮全新的测试。',
    confirmText: '重新开始',
    success: ({ confirm }) => {
      if (!confirm) return;
      quiz.restart();
      uni.redirectTo({ url: '/pages/personality-test/index' });
    },
  });
}
</script>

<template>
  <view v-if="result" class="page">
    <PersonalityResultCard :result="result" />
    <view class="section">
      <text class="section-title">你的四项饭格</text>
      <PersonalityDimensionBars :dimensions="result.dimensions" />
    </view>
    <view v-if="result.mode === 'full'" class="section details">
      <text class="section-title">完整人格档案</text>
      <text class="description">{{ result.description }}</text>
      <view class="detail-row"><text class="detail-label">代表食物</text><text>{{ result.representativeFoods.join('、') }}</text></view>
      <view class="detail-row"><text class="detail-label">推荐场景</text><text>{{ result.recommendedScenes.join('、') }}</text></view>
      <view class="hidden-title"><text>隐藏称号</text><strong>{{ result.hiddenTitle }}</strong></view>
    </view>
    <view class="actions">
      <button v-if="result.mode === 'quick'" class="primary-btn" @tap="continueFull">补做 12 题，解锁完整饭格</button>
      <button class="secondary-btn" @tap="editAnswers">返回修改答案</button>
      <button class="text-btn" @tap="restart">重新测试</button>
    </view>
  </view>
</template>

<style scoped>
.page{min-height:100vh;padding:30rpx 28rpx calc(50rpx + env(safe-area-inset-bottom));box-sizing:border-box;background:#e8e1d2;color:#191713}.section{margin-top:28rpx;padding:32rpx;border:3rpx solid #191713;background:#fff}.section-title{display:block;margin-bottom:30rpx;font-size:31rpx;font-weight:950}.description{display:block;color:#544e45;font-size:27rpx;line-height:1.75}.detail-row{display:flex;flex-direction:column;gap:10rpx;margin-top:26rpx;padding-top:24rpx;border-top:2rpx dashed #c9c0b2;font-size:25rpx;line-height:1.6}.detail-label{font-weight:900}.hidden-title{display:flex;align-items:center;justify-content:space-between;margin-top:28rpx;padding:22rpx;background:#191713;color:#fff;font-size:23rpx}.hidden-title strong{color:#ffd400;font-size:27rpx}.actions{display:flex;flex-direction:column;gap:18rpx;margin-top:28rpx}.actions button{width:100%;border-radius:14rpx;font-size:27rpx;font-weight:900}.actions button::after{border:0}.primary-btn{background:#ffd400;color:#191713}.secondary-btn{border:2rpx solid #191713;background:#fff;color:#191713}.text-btn{background:transparent;color:#6d655a;font-size:24rpx!important}
</style>
