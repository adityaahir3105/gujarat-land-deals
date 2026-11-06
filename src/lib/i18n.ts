// English / Gujarati. Strings sit next to the code that shows them as t('English', 'ગુજરાતી')
// pairs, so there are no keys to keep in sync. The choice is remembered in this browser.
//
// Pages are prerendered in English (the server has no localStorage); useSyncExternalStore
// switches to the saved language right after hydration without a mismatch warning.

import { useCallback, useSyncExternalStore } from 'react';

export type Lang = 'en' | 'gu';

const KEY = 'landdeals.v1.lang';
const listeners = new Set<() => void>();
let current: Lang | null = null;

function detect(): Lang {
  try {
    const saved = window.localStorage.getItem(KEY);
    if (saved === 'en' || saved === 'gu') return saved;
  } catch {
    // storage blocked: fall through to the browser language
  }
  return navigator.languages?.some((l) => l.toLowerCase().startsWith('gu')) ? 'gu' : 'en';
}

function snapshot(): Lang {
  if (current === null) current = detect();
  return current;
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      current = null;
      fn();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener('storage', onStorage);
  };
}

export function setLang(lang: Lang) {
  current = lang;
  try {
    window.localStorage.setItem(KEY, lang);
  } catch {
    // remembered for this visit only
  }
  document.documentElement.lang = lang;
  listeners.forEach((f) => f());
}

export function useLang(): Lang {
  return useSyncExternalStore(subscribe, snapshot, () => 'en');
}

export type Translate = (en: string, gu: string) => string;

/** t('Map', 'નકશો') returns the string for the chosen language. */
export function useT(): Translate {
  const lang = useLang();
  return useCallback((en: string, gu: string) => (lang === 'gu' ? gu : en), [lang]);
}

/** Plural helper for English; Gujarati nouns here do not change with the count. */
export const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);
