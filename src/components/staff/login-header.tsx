"use client";

import { useI18n } from "@/lib/i18n";

export function LoginHeader() {
  const { t } = useI18n();
  return (
    <>
      <h1 className="text-center text-2xl font-bold">{t("staffLogin")}</h1>
      <p className="mt-1 text-center text-zinc-500">{t("manageQueue")}</p>
    </>
  );
}
