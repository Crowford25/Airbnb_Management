"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";

import { copy, type Locale } from "./content";

type LanguageContextValue = {
  locale: Locale;
  setLocale(locale: Locale): void;
  copy: (typeof copy)[Locale];
};

const LanguageContext = createContext<LanguageContextValue | null>(null);
const localeStorageKey = "aureum-locale";
const localeListeners = new Set<() => void>();

function getStoredLocale(): Locale {
  try {
    const storedLocale = window.localStorage.getItem(localeStorageKey);
    return storedLocale === "zh-CN" ? "zh-CN" : "en";
  } catch {
    return "en";
  }
}

function getServerLocale(): Locale {
  return "en";
}

function subscribeToLocale(listener: () => void) {
  function handleStorage(event: StorageEvent) {
    if (event.key === localeStorageKey) {
      listener();
    }
  }

  localeListeners.add(listener);
  window.addEventListener("storage", handleStorage);

  return () => {
    localeListeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

function persistLocale(locale: Locale) {
  try {
    window.localStorage.setItem(localeStorageKey, locale);
  } catch {
    // The active page can still switch language when storage is unavailable.
  }

  localeListeners.forEach((listener) => listener());
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const locale = useSyncExternalStore(
    subscribeToLocale,
    getStoredLocale,
    getServerLocale,
  );
  const value = useMemo(
    () => ({ locale, setLocale: persistLocale, copy: copy[locale] }),
    [locale],
  );

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider.");
  }

  return context;
}
