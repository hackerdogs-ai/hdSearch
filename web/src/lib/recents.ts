// Browser-tier search history (the default for everyone, incl. anonymous users).
// Stored in localStorage; signed-in users additionally get the server-side Redis
// (3-day) and S3 tiers. Capped and de-duplicated, most-recent first.
//
// localStorage is per-BROWSER, not per-account, so the key is namespaced by an
// opaque per-account scope. Without it, two people sharing a machine would see
// each other's searches in the sidebar. The scope is set once per page from the
// session (see components/recents-scope.tsx).
export interface Recent {
  q: string;
  modality: string;
  ts: number;
}

const BASE_KEY = 'hd_recents';
/** Pre-scoping key, shared by every user on the browser. Purged on first load. */
const LEGACY_KEY = 'hd_recents';
const MAX = 50;

/**
 * Opaque namespace for an account (FNV-1a over the session sub). Hashed rather
 * than using the raw id so a later user can't read the previous user's identity
 * out of the localStorage key names.
 */
export function recentsScope(sub?: string | null): string {
  if (!sub) return 'anon';
  let h = 0x811c9dc5;
  for (let i = 0; i < sub.length; i++) {
    h ^= sub.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

let scope = 'anon';
let scopeSet = false;

function key(): string {
  return `${BASE_KEY}::${scope}`;
}

/** Bind subsequent reads/writes to an account. Safe to call on every render. */
export function setRecentsScope(next: string): void {
  const changed = !scopeSet || next !== scope;
  scope = next;
  scopeSet = true;
  if (!changed || typeof window === 'undefined') return;
  try {
    // The legacy un-scoped list may hold another account's searches — drop it
    // rather than attributing it to whoever happens to be signed in now.
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event('hd-recents'));
}

export function getRecents(): Recent[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(key());
    return raw ? (JSON.parse(raw) as Recent[]) : [];
  } catch {
    return [];
  }
}

export function pushRecent(q: string, modality: string): void {
  if (typeof window === 'undefined' || !q.trim()) return;
  try {
    const list = getRecents().filter((r) => !(r.q === q && r.modality === modality));
    list.unshift({ q, modality, ts: Date.now() });
    localStorage.setItem(key(), JSON.stringify(list.slice(0, MAX)));
    window.dispatchEvent(new Event('hd-recents'));
  } catch {
    /* ignore quota errors */
  }
}

export function removeRecent(q: string, modality: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key(), JSON.stringify(getRecents().filter((r) => !(r.q === q && r.modality === modality))));
    window.dispatchEvent(new Event('hd-recents'));
  } catch {
    /* ignore */
  }
}

export function clearRecents(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(key());
  window.dispatchEvent(new Event('hd-recents'));
}
