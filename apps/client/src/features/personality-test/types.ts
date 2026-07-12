export const PERSONALITY_CODES = [
  'DAVE', 'MAYBE', 'FLEX', 'BIGG', 'SOLO', 'MATH', 'SAME', 'BETA',
  'DESS', 'LATE', 'NOPE', 'CARB', 'FIRE', 'CHECK', 'CHEAT', 'HOST',
] as const;

export type PersonalityCode = typeof PERSONALITY_CODES[number];
export type QuizMode = 'quick' | 'full';
export type AxisKey = 'appetite' | 'explore' | 'control' | 'social';
export type AxisScores = Record<AxisKey, number>;
export type QuizAnswers = Record<string, string>;

export interface QuizOption {
  id: string;
  text: string;
  personaScores: Partial<Record<PersonalityCode, number>>;
  axes: AxisScores;
}

export interface QuizQuestion {
  id: string;
  mode: QuizMode;
  title: string;
  options: QuizOption[];
}

export interface PersonalityConfig {
  code: PersonalityCode;
  name: string;
  imageUrl: string;
  coreTrait: string;
  referenceVector: AxisScores;
  description: string;
  quote: string;
  representativeFoods: string[];
  recommendedScenes: string[];
  hiddenTitle: string;
}

export interface PersonalityResult {
  primaryCode: PersonalityCode;
  secondaryCode: PersonalityCode;
  primaryScore: number;
  secondaryScore: number;
  isDualPersonality: boolean;
  mode: QuizMode;
  dimensions: AxisScores;
  title: string;
  subtitle: string;
  description: string;
  quote: string;
  representativeFoods: string[];
  recommendedScenes: string[];
  hiddenTitle?: string;
}

export interface PersonalityHistorySnapshot {
  id: string;
  completedAt: number;
  mode: QuizMode;
  answers: QuizAnswers;
  result: PersonalityResult;
}

export interface PersonalityTestStateData {
  version: 1;
  roundId: string;
  answers: QuizAnswers;
  currentQuestionId: string;
  optionOrders: Record<string, string[]>;
  quickResult: PersonalityResult | null;
  fullResult: PersonalityResult | null;
  history: PersonalityHistorySnapshot[];
}
