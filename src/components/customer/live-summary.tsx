import type { QueueSnapshot } from "@/lib/types";
import { useI18n } from "@/lib/i18n";

/** Ô tóm tắt "Đang chụp số X · N lượt đang chờ" cho trang khách. */
export function LiveSummary({ snap }: { snap: QueueSnapshot | null }) {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-2xl bg-white p-4 text-center shadow-sm ring-1 ring-zinc-200">
        <p className="text-sm text-zinc-500">{t("serving")}</p>
        <p className="tabular text-4xl font-extrabold text-brand">
          {snap?.currentNumber != null ? snap.currentNumber : "—"}
        </p>
      </div>
      <div className="rounded-2xl bg-white p-4 text-center shadow-sm ring-1 ring-zinc-200">
        <p className="text-sm text-zinc-500">{t("waiting")}</p>
        <p className="tabular text-4xl font-extrabold">{snap?.waitingCount ?? 0}</p>
      </div>
    </div>
  );
}
