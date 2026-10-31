"use client";

import Link from "next/link";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { useI18n } from "@/lib/i18n";

export function SettingsHeader() {
  const { t } = useI18n();
  return (
    <header className="flex items-center justify-between py-4">
      <h1 className="text-xl font-bold">{t("settings")}</h1>
      <div className="flex items-center gap-2">
        <LanguageSwitcher />
        <Link href="/staff" className="inline-flex h-11 items-center rounded-xl px-3 font-medium hover:bg-zinc-100">
          ← {t("staff")}
        </Link>
      </div>
    </header>
  );
}
