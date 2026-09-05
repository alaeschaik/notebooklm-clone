"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { LOCALES, type Locale } from "@/lib/i18n/dictionaries";
import { useLocale } from "@/lib/i18n/context";
import { cn } from "@/lib/cn";

export function LocaleSwitcher() {
  const current = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const select = (locale: Locale) => {
    if (locale === current) return;
    void fetch("/api/locale", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ locale }),
      // The server components that read the cookie must re-render, so the
      // refresh has to wait for the cookie to actually be set.
    }).then(() => startTransition(() => router.refresh()));
  };

  return (
    <div
      className={cn(
        "flex items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5",
        pending && "opacity-60",
      )}
    >
      {LOCALES.map((locale) => (
        <button
          key={locale}
          onClick={() => select(locale)}
          aria-pressed={locale === current}
          className={cn(
            "rounded-md px-2 py-1 text-xs font-medium uppercase transition-colors",
            locale === current
              ? "bg-accent-soft text-accent"
              : "text-fg-subtle hover:text-fg",
          )}
        >
          {locale}
        </button>
      ))}
    </div>
  );
}
