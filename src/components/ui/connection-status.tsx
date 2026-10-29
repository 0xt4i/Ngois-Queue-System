"use client";

import { fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ConnectionStatus({
  connected,
  lastUpdate,
  className,
}: {
  connected: boolean;
  lastUpdate: Date | null;
  className?: string;
}) {
  return (
    <p className={cn("flex items-center justify-center gap-2 text-sm text-zinc-500", className)} aria-live="polite">
      <span
        className={cn("inline-block h-2.5 w-2.5 rounded-full", connected ? "bg-emerald-500" : "bg-red-500")}
        aria-hidden
      />
      <span>
        {connected ? "Đang cập nhật trực tiếp" : "Mất kết nối trực tiếp, đang thử lại"}
        {lastUpdate ? ` · Cập nhật lúc ${fmtTime(lastUpdate, "HH:mm:ss")}` : ""}
      </span>
    </p>
  );
}
