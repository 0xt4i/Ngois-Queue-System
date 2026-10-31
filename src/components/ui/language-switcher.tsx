"use client";

import { useI18n } from "@/lib/i18n";

export function LanguageSwitcher() {
  const { language, setLanguage, t } = useI18n();
  return (
    <div className="inline-flex items-center gap-1 rounded-lg bg-zinc-100 p-1 text-xs" aria-label={t("language")}>
      <button type="button" onClick={() => setLanguage("vi")} className={`rounded-md px-2 py-1 ${language === "vi" ? "bg-white font-semibold shadow-sm" : "text-zinc-500"}`}>
        VI
      </button>
      <button type="button" onClick={() => setLanguage("en")} className={`rounded-md px-2 py-1 ${language === "en" ? "bg-white font-semibold shadow-sm" : "text-zinc-500"}`}>
        EN
      </button>
    </div>
  );
}
