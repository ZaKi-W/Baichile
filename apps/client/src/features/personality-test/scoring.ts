import { FULL_QUESTIONS, QUICK_QUESTIONS } from './questions';
import { PERSONALITIES, PERSONALITY_PRIORITY } from './personas';
import { PERSONALITY_CODES } from './types';
import type { AxisKey, AxisScores, PersonalityCode, PersonalityResult, QuizAnswers, QuizMode } from './types';

const AXES: AxisKey[] = ['appetite', 'explore', 'control', 'social'];

interface RankedPersona {
  code: PersonalityCode;
  score: number;
  distance: number;
  priority: number;
}

function emptyAxes(): AxisScores {
  return { appetite: 0, explore: 0, control: 0, social: 0 };
}

function normalizeAxis(value: number, answeredCount: number): number {
  if (!answeredCount) return 50;
  const normalized = ((value + 2 * answeredCount) / (4 * answeredCount)) * 100;
  return Math.max(0, Math.min(100, Math.round(normalized)));
}

export function calculatePersonalityResult(answers: QuizAnswers, mode: QuizMode): PersonalityResult {
  const questions = mode === 'quick' ? QUICK_QUESTIONS : FULL_QUESTIONS;
  const personaScores = Object.fromEntries(PERSONALITY_CODES.map((code) => [code, 0])) as Record<PersonalityCode, number>;
  const axes = emptyAxes();
  let answeredCount = 0;

  questions.forEach((question) => {
    const selected = question.options.find((item) => item.id === answers[question.id]);
    if (!selected) return;
    answeredCount += 1;
    PERSONALITY_CODES.forEach((code) => {
      personaScores[code] += selected.personaScores[code] || 0;
    });
    AXES.forEach((axis) => { axes[axis] += selected.axes[axis]; });
  });

  const averageAxes = Object.fromEntries(AXES.map((axis) => [axis, answeredCount ? axes[axis] / answeredCount : 0])) as AxisScores;
  const ranked: RankedPersona[] = PERSONALITY_CODES.map((code) => {
    const reference = PERSONALITIES[code].referenceVector;
    const distance = AXES.reduce((sum, axis) => sum + (averageAxes[axis] - reference[axis]) ** 2, 0);
    return { code, score: personaScores[code], distance, priority: PERSONALITY_PRIORITY.indexOf(code) };
  }).sort((left, right) => (
    right.score - left.score
    || left.distance - right.distance
    || left.priority - right.priority
  ));

  const primary = ranked[0];
  const secondary = ranked[1];
  const config = PERSONALITIES[primary.code];
  const secondaryConfig = PERSONALITIES[secondary.code];

  return {
    primaryCode: primary.code,
    secondaryCode: secondary.code,
    primaryScore: primary.score,
    secondaryScore: secondary.score,
    isDualPersonality: primary.score - secondary.score <= 2,
    mode,
    dimensions: Object.fromEntries(AXES.map((axis) => [axis, normalizeAxis(axes[axis], answeredCount)])) as AxisScores,
    title: config.name,
    subtitle: `副人格 · ${secondaryConfig.name}`,
    description: config.description,
    quote: config.quote,
    representativeFoods: [...config.representativeFoods],
    recommendedScenes: [...config.recommendedScenes],
    hiddenTitle: mode === 'full' ? config.hiddenTitle : undefined,
  };
}
