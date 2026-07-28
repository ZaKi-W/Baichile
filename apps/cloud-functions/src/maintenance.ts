export function maintenanceTaskFromTimer(
  event: unknown,
  caller: { openId?: string; appId?: string; webUid?: string },
  triggerSource = process.env.TRIGGER_SRC,
): 'refund_failed_orders' | '' {
  if (!event || typeof event !== 'object') return '';
  const record = event as Record<string, unknown>;
  const validTime = typeof record.Time === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(record.Time)
    && Number.isFinite(Date.parse(record.Time));
  const validMessage = typeof record.Message === 'string'
    && Buffer.byteLength(record.Message, 'utf8') <= 4_096;
  const timerInvocation = record.Type === 'Timer'
    && record.TriggerName === 'maintenance-refunds'
    && validTime
    && validMessage
    && triggerSource === 'timer';
  const hasHttpShape = 'path' in record
    || 'httpMethod' in record
    || 'method' in record
    || 'body' in record
    || 'authorization' in record
    || 'headers' in record;
  const hasCallerIdentity = Boolean(caller.openId || caller.appId || caller.webUid);
  return timerInvocation && !hasHttpShape && !hasCallerIdentity
    ? 'refund_failed_orders'
    : '';
}
