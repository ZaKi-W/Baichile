import { describe, expect, it } from 'vitest';
import { calculateLineTotal, calculateOrderTotal, validateSelections } from './index';

describe('order pricing', () => {
  it('uses integer cents for item options and quantity', () => {
    expect(calculateLineTotal(1800, [200, 300], 2)).toBe(4600);
  });

  it('adds delivery and packing fees once', () => {
    expect(calculateOrderTotal([4600, 1200], 300, 100)).toBe(6200);
  });
});

describe('SKU validation', () => {
  const groups = [
    {
      id: 'size',
      name: '份量',
      required: true,
      minSelect: 1,
      maxSelect: 1,
      options: [{ id: 'large', name: '大份', priceDeltaCents: 300 }],
    },
  ];

  it('rejects a missing required selection', () => {
    expect(validateSelections(groups, [])).toEqual({ valid: false, message: '请选择份量' });
  });

  it('accepts a valid required selection', () => {
    expect(validateSelections(groups, ['large'])).toEqual({ valid: true });
  });
});

