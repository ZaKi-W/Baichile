import { describe, expect, it } from 'vitest';
import { FULL_QUESTIONS, QUICK_QUESTIONS } from './questions';
import { calculatePersonalityResult } from './scoring';
import { PERSONALITY_CODES } from './types';
import type { QuizAnswers } from './types';

function answersFromSequence(sequence: string): QuizAnswers {
  return Object.fromEntries([...sequence].map((optionId, index) => [`Q${String(index + 1).padStart(2, '0')}`, optionId]));
}

describe('personality scoring', () => {
  it('returns stable primary and secondary personas for the same answers', () => {
    const answers = answersFromSequence('ABCDABCD');
    const first = calculatePersonalityResult(answers, 'quick');
    const second = calculatePersonalityResult({ ...answers }, 'quick');
    expect(first).toEqual(second);
    expect(first.primaryCode).not.toBe(first.secondaryCode);
    expect(PERSONALITY_CODES).toContain(first.primaryCode);
    expect(PERSONALITY_CODES).toContain(first.secondaryCode);
  });

  it('uses vector distance for a top-score tie and fixed priority for a complete tie', () => {
    const vectorTie = calculatePersonalityResult(answersFromSequence('AAAAAAAD'), 'quick');
    expect(vectorTie.primaryScore).toBe(vectorTie.secondaryScore);
    expect(vectorTie.primaryCode).toBe('BETA');

    const fixedPriorityTie = calculatePersonalityResult({}, 'quick');
    expect(fixedPriorityTie.primaryCode).toBe('FLEX');
    expect(fixedPriorityTie.secondaryCode).toBe('DESS');
  });

  it('marks close top scores as dual personality', () => {
    expect(calculatePersonalityResult(answersFromSequence('AAAAAAAD'), 'quick').isDualPersonality).toBe(true);
  });

  it('uses the first eight answers when recalculating a full result', () => {
    const quickAnswers = answersFromSequence('ABCDABCD');
    const fullAnswers = {
      ...quickAnswers,
      ...Object.fromEntries(FULL_QUESTIONS.slice(8).map((question) => [question.id, 'A'])),
    };
    const full = calculatePersonalityResult(fullAnswers, 'full');
    const changed = calculatePersonalityResult({ ...fullAnswers, Q01: 'D' }, 'full');
    expect(full.mode).toBe('full');
    expect(full.hiddenTitle).toBeTruthy();
    expect(changed).not.toEqual(full);
  });

  it('recalculates after an answer is changed', () => {
    const answers = answersFromSequence('AAAAAAAA');
    const original = calculatePersonalityResult(answers, 'quick');
    const changed = calculatePersonalityResult({ ...answers, Q01: 'D' }, 'quick');
    expect(changed).not.toEqual(original);
  });

  it('keeps every normalized dimension between zero and one hundred', () => {
    const combinations = ['AAAAAAAA', 'BBBBBBBB', 'CCCCCCCC', 'DDDDDDDD'];
    combinations.forEach((sequence) => {
      const result = calculatePersonalityResult(answersFromSequence(sequence), 'quick');
      Object.values(result.dimensions).forEach((value) => {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      });
    });
  });

  it('ignores invalid and missing options without producing undefined personas', () => {
    const result = calculatePersonalityResult({ Q01: 'missing', Q99: 'A' }, 'quick');
    expect(result.primaryCode).toBeTruthy();
    expect(result.secondaryCode).toBeTruthy();
    expect(result.dimensions).toEqual({ appetite: 50, explore: 50, control: 50, social: 50 });
  });

  it('has a reachable quick-test answer path for all sixteen personas', () => {
    const witnesses: Record<string, string> = {
      DAVE: 'AAAAAADA', MAYBE: 'AAAADBDB', FLEX: 'AAAAABAC', BIGG: 'AABACAAD',
      SOLO: 'AACAACAA', MATH: 'AAAAACAA', SAME: 'AAAAABAA', BETA: 'AAAAAAAA',
      DESS: 'AAAAAACA', LATE: 'AAAAABBB', NOPE: 'ABDDCADB', CARB: 'AAABABBB',
      FIRE: 'AAACABCB', CHECK: 'AAAAABAB', CHEAT: 'AAAADBBB', HOST: 'AAAAABAD',
    };
    expect(QUICK_QUESTIONS).toHaveLength(8);
    PERSONALITY_CODES.forEach((code) => {
      expect(calculatePersonalityResult(answersFromSequence(witnesses[code]), 'quick').primaryCode).toBe(code);
    });
  });
});
