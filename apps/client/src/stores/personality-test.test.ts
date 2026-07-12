import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { FULL_QUESTIONS, QUICK_QUESTIONS } from '../features/personality-test/questions';
import { PERSONALITY_STORAGE_KEY } from '../features/personality-test/storage';
import { usePersonalityTestStore } from './personality-test';

const storage = new Map<string, unknown>();

beforeEach(() => {
  storage.clear();
  vi.restoreAllMocks();
  vi.stubGlobal('uni', {
    getStorageSync: (key: string) => storage.get(key),
    setStorageSync: (key: string, value: unknown) => storage.set(key, structuredClone(value)),
  });
  setActivePinia(createPinia());
});

describe('personality test store', () => {
  it('saves answers immediately and restores the current question', () => {
    const quiz = usePersonalityTestStore();
    quiz.answer('Q01', 'A');
    quiz.advance();
    expect(storage.has(PERSONALITY_STORAGE_KEY)).toBe(true);

    setActivePinia(createPinia());
    const restored = usePersonalityTestStore();
    expect(restored.answers.Q01).toBe('A');
    expect(restored.currentQuestionId).toBe('Q02');
  });

  it('returns to previous questions and invalidates stale results after changes', () => {
    const quiz = usePersonalityTestStore();
    QUICK_QUESTIONS.forEach((question) => quiz.answer(question.id, 'A'));
    quiz.complete('quick');
    expect(quiz.quickResult).not.toBeNull();
    quiz.edit('quick');
    expect(quiz.currentQuestionId).toBe('Q01');
    expect(quiz.quickResult).toBeNull();
    quiz.currentQuestionId = 'Q02';
    quiz.previous();
    expect(quiz.currentQuestionId).toBe('Q01');
  });

  it('continues the full test at Q09 while reusing quick answers', () => {
    const quiz = usePersonalityTestStore();
    QUICK_QUESTIONS.forEach((question) => quiz.answer(question.id, 'A'));
    quiz.complete('quick');
    quiz.continueFull();
    expect(quiz.currentQuestionId).toBe('Q09');
    expect(Object.keys(quiz.answers)).toHaveLength(8);
  });

  it('keeps shuffled option order stable throughout a round and after restore', () => {
    const quiz = usePersonalityTestStore();
    const order = [...quiz.optionOrders.Q01];
    quiz.answer('Q01', order[0]);
    setActivePinia(createPinia());
    expect(usePersonalityTestStore().optionOrders.Q01).toEqual(order);
  });

  it('stores quick and full snapshots and preserves them across restart', () => {
    const quiz = usePersonalityTestStore();
    FULL_QUESTIONS.forEach((question) => quiz.answer(question.id, 'A'));
    quiz.complete('quick');
    quiz.complete('full');
    expect(quiz.history.map((item) => item.mode)).toEqual(['quick', 'full']);
    const oldRound = quiz.roundId;
    quiz.restart();
    expect(quiz.history).toHaveLength(2);
    expect(quiz.roundId).not.toBe(oldRound);
    expect(quiz.answers).toEqual({});
  });
});
