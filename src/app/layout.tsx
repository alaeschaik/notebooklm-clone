import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { ConfirmProvider } from "@/components/ui/confirm";
import { I18nProvider } from "@/lib/i18n/context";
import { getLocale } from "@/lib/i18n/server";

import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: "Notebook — grounded research with verifiable sources",
  description:
    "Upload documents, ask questions, and get answers where every claim links back to the exact sentence in the source that supports it.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();

  return (
    <html lang={locale} className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <I18nProvider locale={locale}>
          <ConfirmProvider>{children}</ConfirmProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
