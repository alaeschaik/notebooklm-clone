import { cookies } from "next/headers";

import { LOCALE_COOKIE, dictionaries, isLocale, type Dictionary, type Locale } from "./dictionaries";

/** Reads the visitor's chosen language, defaulting to English. */
export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : "en";
}

export async function getDictionary(): Promise<Dictionary> {
  return dictionaries[await getLocale()];
}
