import { describe, expect, it } from 'vitest';
import { classifyPersona, selectMilestone, selectOrderEasterEgg } from './share-insights';

describe('share insights', () => {
  it('keeps easter egg selection deterministic and at one hundred percent during QA', () => {
    const results = Array.from({ length: 10_000 }, (_, index) => selectOrderEasterEgg(`order-${index}`, `seed-${index}`, '2026-01-01T00:00:00.000Z'));
    const hits = results.filter(Boolean).length;
    expect(hits).toBe(10_000);
    expect(selectOrderEasterEgg('same', 'seed', 'time')).toEqual(selectOrderEasterEgg('same', 'seed', 'time'));
  });

  it('classifies data-backed persona and milestones', () => {
    const line = { menuItemId: 'tea', name: '快乐奶茶', optionNames: [], quantity: 1, unitPriceCents: 2000, totalCents: 2000, unitCaloriesKcal: 500, totalCaloriesKcal: 500 };
    expect(classifyPersona([line], 1, 2000, 500).id).toBe('teaa');
    expect(classifyPersona([line], 1, 2000, 500).acronym).toBe('TEAA');
    expect(selectMilestone(20, 0, 0).id).toBe('master');
  });
});
