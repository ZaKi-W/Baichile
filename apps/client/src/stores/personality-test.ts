import { defineStore } from 'pinia';
import { createOptionOrders } from '../features/personality-test/option-order';
import { FULL_QUESTIONS, QUESTION_BY_ID, QUICK_QUESTIONS } from '../features/personality-test/questions';
import { calculatePersonalityResult } from '../features/personality-test/scoring';
import { loadPersonalityState, savePersonalityState } from '../features/personality-test/storage';
import type { PersonalityHistorySnapshot, PersonalityTestStateData, QuizMode } from '../features/personality-test/types';

function uniqueId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function freshState(history: PersonalityHistorySnapshot[] = []): PersonalityTestStateData {
  return {
    version: 1,
    roundId: uniqueId('round'),
    answers: {},
    currentQuestionId: 'Q01',
    optionOrders: createOptionOrders(),
    quickResult: null,
    fullResult: null,
    history,
  };
}

function initialState(): PersonalityTestStateData {
  const loaded = loadPersonalityState();
  if (!loaded) return freshState();
  if (Object.keys(loaded.optionOrders).length !== FULL_QUESTIONS.length) loaded.optionOrders = createOptionOrders();
  if (!loaded.roundId) loaded.roundId = uniqueId('round');
  return loaded;
}

export const usePersonalityTestStore = defineStore('personality-test', {
  state: initialState,
  getters: {
    currentQuestion: (state) => QUESTION_BY_ID[state.currentQuestionId] || QUICK_QUESTIONS[0],
    orderedCurrentOptions(): ReturnType<typeof QUESTION_BY_ID[string]['options']['slice']> {
      const question = this.currentQuestion;
      const order = this.optionOrders[question.id] || question.options.map((option) => option.id);
      return order.map((id) => question.options.find((option) => option.id === id)).filter((item) => !!item);
    },
    currentMode: (state): QuizMode => Number(state.currentQuestionId.slice(1)) <= 8 ? 'quick' : 'full',
  },
  actions: {
    persist() {
      const plainState = JSON.parse(JSON.stringify(this.$state)) as PersonalityTestStateData;
      savePersonalityState(plainState);
    },
    answer(questionId: string, optionId: string) {
      const question = QUESTION_BY_ID[questionId];
      if (!question || !question.options.some((option) => option.id === optionId)) return;
      if (this.answers[questionId] !== optionId) {
        this.answers[questionId] = optionId;
        if (Number(questionId.slice(1)) <= 8) {
          this.quickResult = null;
          this.fullResult = null;
        } else {
          this.fullResult = null;
        }
      }
      this.persist();
    },
    advance(): QuizMode | null {
      const index = FULL_QUESTIONS.findIndex((question) => question.id === this.currentQuestionId);
      if (index === 7) return this.complete('quick');
      if (index === 19) return this.complete('full');
      this.currentQuestionId = FULL_QUESTIONS[index + 1].id;
      this.persist();
      return null;
    },
    previous() {
      const index = FULL_QUESTIONS.findIndex((question) => question.id === this.currentQuestionId);
      if (index <= 0) return;
      this.currentQuestionId = FULL_QUESTIONS[index - 1].id;
      this.persist();
    },
    complete(mode: QuizMode): QuizMode {
      const result = calculatePersonalityResult(this.answers, mode);
      if (mode === 'quick') this.quickResult = result;
      else this.fullResult = result;
      this.history.push({
        id: uniqueId('result'),
        completedAt: Date.now(),
        mode,
        answers: { ...this.answers },
        result,
      });
      this.persist();
      return mode;
    },
    continueFull() {
      this.currentQuestionId = 'Q09';
      this.persist();
    },
    edit(mode: QuizMode) {
      if (mode === 'quick') {
        this.quickResult = null;
        this.fullResult = null;
        this.currentQuestionId = 'Q01';
      } else {
        this.fullResult = null;
        this.currentQuestionId = 'Q09';
      }
      this.persist();
    },
    restart() {
      const replacement = freshState([...this.history]);
      this.roundId = replacement.roundId;
      this.answers = replacement.answers;
      this.currentQuestionId = replacement.currentQuestionId;
      this.optionOrders = replacement.optionOrders;
      this.quickResult = null;
      this.fullResult = null;
      this.history = replacement.history;
      this.persist();
    },
  },
});
