import { formatInTimeZone } from "date-fns-tz";

export const TZ = "Asia/Ho_Chi_Minh";

export function fmtTime(iso: string | Date | null | undefined, pattern = "HH:mm") {
  if (!iso) return "—";
  return formatInTimeZone(iso, TZ, pattern);
}

export function todayInTz(tz = TZ): string {
  return formatInTimeZone(new Date(), tz, "yyyy-MM-dd");
}

/** 75 → "1 phút", 3700 → "1 giờ 2 phút" */
export function fmtDuration(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const m = Math.max(0, Math.round(seconds / 60));
  if (m < 60) return `${m} phút`;
  const h = Math.floor(m / 60);
  return `${h} giờ${m % 60 ? ` ${m % 60} phút` : ""}`;
}

/** Đồng hồ mm:ss / h:mm:ss */
export function fmtClock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function maskPhone(phone: string | null) {
  return phone ? `…${phone.slice(-3)}` : "—";
}
