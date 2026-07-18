'use client';

import { setRecentsScope } from '@/lib/recents';

/**
 * Binds browser-tier search history to the signed-in account.
 *
 * localStorage is shared by every user of the browser, so without this two
 * people on the same machine would see each other's searches in the sidebar.
 * Rendered from the root layout so every page is covered, and set during render
 * (not in an effect) so the scope is already correct before any list reads it.
 */
export function RecentsScope({ scope }: { scope: string }) {
  if (typeof window !== 'undefined') setRecentsScope(scope);
  return null;
}
