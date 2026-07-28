import { describe, expect, it } from 'vitest';
import { maintenanceTaskFromTimer } from './maintenance';

describe('maintenance timer boundary', () => {
  const event = {
    Type: 'Timer',
    TriggerName: 'maintenance-refunds',
    Time: '2026-07-28T00:00:00.000Z',
    Message: '',
  };

  it('requires the platform timer source plus the configured, well-formed timer event', () => {
    expect(maintenanceTaskFromTimer(event, {}, 'timer')).toBe('refund_failed_orders');
    expect(maintenanceTaskFromTimer(event, {}, undefined)).toBe('');
    expect(maintenanceTaskFromTimer(event, {}, 'manual')).toBe('');
    expect(maintenanceTaskFromTimer({
      ...event,
      Time: 'not-a-time',
    }, {}, 'timer')).toBe('');
    expect(maintenanceTaskFromTimer({
      ...event,
      Message: { task: 'refund_failed_orders' },
    }, {}, 'timer')).toBe('');
    expect(maintenanceTaskFromTimer({
      type: 'maintenance',
      task: 'refund_failed_orders',
    }, {}, 'timer')).toBe('');
    expect(maintenanceTaskFromTimer({
      ...event,
      path: '/v1/health',
    }, {}, 'timer')).toBe('');
    expect(maintenanceTaskFromTimer(event, { openId: 'attacker' }, 'timer')).toBe('');
    expect(maintenanceTaskFromTimer({
      ...event,
      TriggerName: 'other-timer',
    }, {}, 'timer')).toBe('');
  });
});
