import { QUESTION_BY_ID, QUIZ_QUESTIONS } from './questions';
import type { PersonalityHistorySnapshot, PersonalityResult, PersonalityTestStateData, QuizAnswers } from './types';

export const PERSONALITY_STORAGE_KEY = 'baichile:personality-test:v1';

function validAnswers(value: unknown): QuizAnswers {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([questionId, optionId]) => {
    const question = QUESTION_BY_ID[questionId];
    return question && typeof optionId === 'string' && question.options.some((option) => option.id === optionId);
  })) as QuizAnswers;
}

function validResult(value: unknown): value is PersonalityResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Partial<PersonalityResult>;
  return (result.mode === 'quick' || result.mode === 'full')
    && typeof result.primaryCode === 'string'
    && typeof result.secondaryCode === 'string'
    && !!result.dimensions;
}

function validHistory(value: unknown): PersonalityHistorySnapshot[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is PersonalityHistorySnapshot => {
    if (!item || typeof item !== 'object') return false;
    const snapshot = item as Partial<PersonalityHistorySnapshot>;
    return typeof snapshot.id === 'string'
      && typeof snapshot.completedAt === 'number'
      && (snapshot.mode === 'quick' || snapshot.mode === 'full')
      && validResult(snapshot.result);
  }).map((item) => ({ ...item, answers: validAnswers(item.answers) }));
}

function validOptionOrders(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== 'object') return {};
  const orders: Record<string, string[]> = {};
  QUIZ_QUESTIONS.forEach((question) => {
    const order = (value as Record<string, unknown>)[question.id];
    const expected = question.options.map((option) => option.id).sort().join(',');
    if (Array.isArray(order) && order.every((id) => typeof id === 'string') && [...order].sort().join(',') === expected) {
      orders[question.id] = [...order];
    }
  });
  return orders;
}

export function loadPersonalityState(): PersonalityTestStateData | null {
  const raw = uni.getStorageSync(PERSONALITY_STORAGE_KEY) as unknown;
  if (!raw || typeof raw !== 'object' || (raw as Partial<PersonalityTestStateData>).version !== 1) return null;
  const state = raw as Partial<PersonalityTestStateData>;
  return {
    version: 1,
    roundId: typeof state.roundId === 'string' ? state.roundId : '',
    answers: validAnswers(state.answers),
    currentQuestionId: QUESTION_BY_ID[state.currentQuestionId || ''] ? state.currentQuestionId! : 'Q01',
    optionOrders: validOptionOrders(state.optionOrders),
    quickResult: validResult(state.quickResult) && state.quickResult.mode === 'quick' ? state.quickResult : null,
    fullResult: validResult(state.fullResult) && state.fullResult.mode === 'full' ? state.fullResult : null,
    history: validHistory(state.history),
  };
}

export function savePersonalityState(state: PersonalityTestStateData): void {
  uni.setStorageSync(PERSONALITY_STORAGE_KEY, state);
}
