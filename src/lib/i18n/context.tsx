"use client";

import { createContext, useContext, type ReactNode } from "react";

import { dictionaries, type Dictionary, type Locale } from "./dictionaries";

const I18nContext = createContext<{ locale: Locale; t: Dictionary } | null>(null);

export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  return (
    <I18nContext.Provider value={{ locale, t: dictionaries[locale] }}>
      {children}
    </I18nContext.Provider>
  );
}

/** Translations for the current locale. Throws outside the provider. */
export function useT(): Dictionary {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useT must be used inside I18nProvider");
  return value.t;
}

export function useLocale(): Locale {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useLocale must be used inside I18nProvider");
  return value.locale;
}
