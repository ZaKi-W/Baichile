<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow, onUnload } from '@dcloudio/uni-app';
import PersonalityProgress from '../../components/personality-test/PersonalityProgress.vue';
import PersonalityQuestionCard from '../../components/personality-test/PersonalityQuestionCard.vue';
import { usePersonalityTestStore } from '../../stores/personality-test';

const quiz = usePersonalityTestStore();
const selection = ref<{ questionId: string; optionId: string } | null>(null);
const choosing = ref(false);
let advanceTimer: ReturnType<typeof setTimeout> | null = null;

const questionNumber = computed(() => Number(quiz.currentQuestion.id.slice(1)));
const selectedId = computed(() => selection.value && selection.value.questionId === quiz.currentQuestion.id
  ? selection.value.optionId
  : '');
const progressTotal = computed(() => quiz.currentMode === 'quick' ? 8 : 20);
const progressLabel = computed(() => quiz.currentMode === 'quick' ? '极速测试' : '完整测试 · 补测中');

onShow(() => {
  if (quiz.fullResult) {
    uni.redirectTo({ url: '/pages/personality-result/index?mode=full' });
    return;
  }
  if (quiz.quickResult) uni.redirectTo({ url: '/pages/personality-result/index?mode=quick' });
});

onUnload(() => {
  if (advanceTimer) clearTimeout(advanceTimer);
});

function selectOption(optionId: string) {
  if (choosing.value) return;
  choosing.value = true;
  const questionId = quiz.currentQuestion.id;
  selection.value = { questionId, optionId };
  quiz.answer(questionId, optionId);
  advanceTimer = setTimeout(() => {
    selection.value = null;
    const completedMode = quiz.advance();
    choosing.value = false;
    if (completedMode) uni.redirectTo({ url: `/pages/personality-result/index?mode=${completedMode}` });
  }, 220);
}

function previous() {
  if (choosing.value) return;
  quiz.previous();
  const questionId = quiz.currentQuestion.id;
  const optionId = quiz.answers[questionId];
  selection.value = optionId ? { questionId, optionId } : null;
}
</script>

<template>
  <view class="page">
    <PersonalityProgress :current="questionNumber" :total="progressTotal" :label="progressLabel" />
    <PersonalityQuestionCard
      :question="quiz.currentQuestion"
      :options="quiz.orderedCurrentOptions"
      :selected-id="selectedId"
      @select="selectOption"
    />
    <view class="footer">
      <button class="back-btn" :disabled="questionNumber === 1 || choosing" @tap="previous">返回上一题修改</button>
      <text>答案会自动保存在本地</text>
    </view>
  </view>
</template>

<style scoped>
.page{min-height:100vh;padding:34rpx 30rpx calc(50rpx + env(safe-area-inset-bottom));box-sizing:border-box;background:#f6f1e6;color:#191713}.footer{display:flex;flex-direction:column;align-items:center;gap:18rpx;margin-top:34rpx;color:#81786b;font-size:21rpx}.back-btn{width:100%;border:2rpx solid #191713;border-radius:14rpx;background:#fff;color:#191713;font-size:25rpx;font-weight:800}.back-btn::after{border:0}.back-btn[disabled]{opacity:.4}
</style>
