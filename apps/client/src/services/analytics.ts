import { requestApi } from './http';

type AnalyticsValue = string | number | boolean | null;
type AnalyticsPayload = Record<string, AnalyticsValue | AnalyticsValue[]>;

const BLOCKED_KEYS = /(?:token|phone|address|nickname|avatar|name)/i;

function safePayload(payload: AnalyticsPayload): AnalyticsPayload {
  return Object.fromEntries(
    Object.entries(payload)
      .filter(([key]) => !BLOCKED_KEYS.test(key))
      .slice(0, 30),
  );
}

/**
 * Product telemetry must never hold up the user's action. Callers intentionally
 * fire-and-forget this promise; failures are only logged in development tools.
 */
export async function trackEvent(
  eventName: string,
  payload: AnalyticsPayload = {},
  accessToken = '',
): Promise<void> {
  try {
    await requestApi<{ recorded: boolean }>('POST', '/v1/analytics/events', accessToken, {
      eventName,
      payload: safePayload(payload),
    });
  } catch (error) {
    if (import.meta.env.DEV) console.warn(`[analytics] ${eventName} was not recorded`, error);
  }
}
