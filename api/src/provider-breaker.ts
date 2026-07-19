// Circuit breaker for search/crawl providers.
//
// Successful results are cached, but FAILURES were not: a provider that is out of
// credits, mis-keyed, or simply slow got retried on every single request. In
// aggregate mode the response waits for all providers, so one dead engine set the
// floor for every search — e.g. a provider timing out at 6s made a fully cached
// News query still take 6s.
//
// After a couple of consecutive failures we stop calling the provider for a
// cooldown and report it as skipped. Cooldown length depends on how fixable the
// failure looks: an auth/quota problem will not resolve in a minute, a timeout might.
import { redis, redisHealthy, k } from './store.js';
import { log } from './logger.js';

/** Consecutive failures before the breaker opens. One blip shouldn't trip it. */
const FAIL_THRESHOLD = 2;
/** Timeouts, 5xx, network — plausibly transient. */
const COOLDOWN_TRANSIENT_SEC = 60;
/** Auth, quota, credits, billing — will not fix itself on a one-minute timescale. */
const COOLDOWN_PERSISTENT_SEC = 300;
/** How long the failure counter itself survives, so old blips age out. */
const COUNTER_TTL_SEC = 300;

export interface BreakerState {
  open: boolean;
  reason?: string;
  retryInSec?: number;
}

function stateKey(provider: string, scope: string): string {
  return k('brk', provider, scope);
}
function countKey(provider: string, scope: string): string {
  return k('brkn', provider, scope);
}

/** Does this look like a credential/quota problem rather than a hiccup? */
export function isPersistentFailure(err: unknown, status?: number): boolean {
  if (status === 401 || status === 402 || status === 403) return true;
  const msg = String((err as Error)?.message || err || '').toLowerCase();
  return /credit|quota|insufficient|billing|payment|unauthorized|forbidden|invalid api key|expired/.test(msg);
}

/**
 * Is the breaker open for this provider? Fails OPEN (returns closed) whenever
 * Redis is unavailable — a degraded cache must never stop us serving results.
 */
export async function breakerState(provider: string, scope: string): Promise<BreakerState> {
  if (!redisHealthy()) return { open: false };
  try {
    const key = stateKey(provider, scope);
    const [reason, ttl] = await Promise.all([redis.get(key), redis.ttl(key)]);
    if (!reason) return { open: false };
    return { open: true, reason, retryInSec: ttl > 0 ? ttl : undefined };
  } catch {
    return { open: false };
  }
}

/** Record a failure; opens the breaker once the threshold is reached. */
export async function recordFailure(
  provider: string,
  scope: string,
  err: unknown,
  status?: number,
): Promise<void> {
  if (!redisHealthy()) return;
  const reason = String((err as Error)?.message || err || 'request failed').slice(0, 200);
  try {
    const n = await redis.incr(countKey(provider, scope));
    if (n === 1) await redis.expire(countKey(provider, scope), COUNTER_TTL_SEC);
    if (n < FAIL_THRESHOLD) return;
    const cooldown = isPersistentFailure(err, status) ? COOLDOWN_PERSISTENT_SEC : COOLDOWN_TRANSIENT_SEC;
    await redis.set(stateKey(provider, scope), reason, 'EX', cooldown);
    log.warn('provider breaker opened', { provider, scope, cooldown, reason });
  } catch {
    /* breaker is best-effort */
  }
}

/** A success clears the failure counter and closes the breaker. */
export async function recordSuccess(provider: string, scope: string): Promise<void> {
  if (!redisHealthy()) return;
  try {
    await Promise.all([redis.del(countKey(provider, scope)), redis.del(stateKey(provider, scope))]);
  } catch {
    /* ignore */
  }
}

/** Clear a provider's breaker manually (admin "retry now"). */
export async function resetBreaker(provider: string, scope: string): Promise<void> {
  await recordSuccess(provider, scope);
}
