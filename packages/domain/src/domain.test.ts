import { describe, expect, it } from 'vitest';
import {
  DELIVERY_INCIDENTS,
  calculateLineCalories,
  calculateLineTotal,
  calculateOrderTotal,
  getDeliveryIncidentPhase,
  selectDeliveryIncident,
  validateSelections,
} from './index';

describe('order pricing', () => {
  it('uses integer cents for item options and quantity', () => {
    expect(calculateLineTotal(1800, [200, 300], 2)).toBe(4600);
  });

  it('adds delivery and packing fees once', () => {
    expect(calculateOrderTotal([4600, 1200], 300, 100)).toBe(6200);
  });
});

describe('order calories', () => {
  it('adds selected specification calories and multiplies by quantity', () => {
    expect(calculateLineCalories(420, [180, -35], 2)).toBe(1130);
  });

  it('rejects a calorie result below zero', () => {
    expect(() => calculateLineCalories(20, [-30], 1)).toThrow('卡路里不能小于 0');
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

describe('delivery incidents', () => {
  it('selects one stable incident for three tenths of hash buckets', () => {
    const orderStartedAt = Date.parse('2026-07-02T00:00:00.000Z');
    const incident = selectDeliveryIncident('seed-0', 20, orderStartedAt);
    expect(incident).toEqual(selectDeliveryIncident('seed-0', 20, orderStartedAt));
    expect(incident?.startedAt).toBe('2026-07-02T00:00:30.000Z');
    expect(incident?.failedAt).toBe('2026-07-02T00:00:45.000Z');
    expect(Array.from({ length: 100 }, (_, index) => selectDeliveryIncident(`seed-${index}`, 20))
      .filter(Boolean)).toHaveLength(30);
    expect(DELIVERY_INCIDENTS).toHaveLength(8);
  });

  it('derives the incident and failed phases from absolute timestamps', () => {
    const assignment = {
      key: DELIVERY_INCIDENTS[0].key,
      startedAt: '2026-07-02T10:00:00.000Z',
      failedAt: '2026-07-02T10:00:10.000Z',
    };

    expect(getDeliveryIncidentPhase(assignment, Date.parse('2026-07-02T09:59:59.000Z'))).toBe('pending');
    expect(getDeliveryIncidentPhase(assignment, Date.parse('2026-07-02T10:00:05.000Z'))).toBe('incident');
    expect(getDeliveryIncidentPhase(assignment, Date.parse('2026-07-02T10:00:10.000Z'))).toBe('failed');
  });
});
