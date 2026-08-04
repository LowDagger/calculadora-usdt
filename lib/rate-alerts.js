export const COOLDOWN_MS = 15 * 60 * 1000;

export function evaluateAlert(alert, currentRate, providerTimestamp, now = new Date()) {
  const baseline = Number(alert?.baseline_rate);
  const threshold = Number(alert?.threshold);
  const current = Number(currentRate);
  const observedAt = Date.parse(providerTimestamp);
  if (![baseline, threshold, current].every(Number.isFinite) || baseline <= 0 || threshold <= 0 || current <= 0 || !Number.isFinite(observedAt)) return { triggered: false, reason: 'invalid' };
  if (!alert.active) return { triggered: false, reason: 'inactive' };
  if (alert.cooldown_until && Date.parse(alert.cooldown_until) > now.getTime()) return { triggered: false, reason: 'cooldown' };
  if (alert.last_observed_provider_timestamp && observedAt <= Date.parse(alert.last_observed_provider_timestamp)) return { triggered: false, reason: 'duplicate' };
  const change = alert.measurement === 'percent' ? ((current - baseline) / baseline) * 100 : current - baseline;
  if (!Number.isFinite(change) || !['ves', 'percent'].includes(alert.measurement) || !['up', 'down', 'any'].includes(alert.direction)) return { triggered: false, reason: 'invalid' };
  const crossed = alert.direction === 'up' ? change >= threshold : alert.direction === 'down' ? change <= -threshold : Math.abs(change) >= threshold;
  return { triggered: crossed, reason: crossed ? 'threshold' : 'below', change };
}

export function successfulDeliveryUpdate(alert, currentRate, providerTimestamp, now = new Date()) {
  const common = { last_observed_rate: currentRate, last_observed_provider_timestamp: providerTimestamp, last_triggered_at: now.toISOString() };
  return alert.recurring
    ? { ...common, baseline_rate: currentRate, cooldown_until: new Date(now.getTime() + COOLDOWN_MS).toISOString(), active: true }
    : { ...common, active: false, cooldown_until: null };
}

export function observationUpdate(currentRate, providerTimestamp) {
  return { last_observed_rate: currentRate, last_observed_provider_timestamp: providerTimestamp };
}
