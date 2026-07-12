import { QUIZ_QUESTIONS } from './questions';

export function createOptionOrders(random: () => number = Math.random): Record<string, string[]> {
  return Object.fromEntries(QUIZ_QUESTIONS.map((question) => {
    const ids = question.options.map((option) => option.id);
    for (let index = ids.length - 1; index > 0; index -= 1) {
      const target = Math.floor(random() * (index + 1));
      [ids[index], ids[target]] = [ids[target], ids[index]];
    }
    return [question.id, ids];
  }));
}
