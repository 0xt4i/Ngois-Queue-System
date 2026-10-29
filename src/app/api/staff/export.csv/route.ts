import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtTime, todayInTz } from "@/lib/format";
import { apiError, route } from "@/lib/http";
import { getShopById } from "@/lib/shop";
import { dateParamSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const STATUS_VI: Record<string, string> = {
  WAITING: "Đang chờ",
  SERVING: "Đang chụp",
  DONE: "Đã chụp",
  SKIPPED: "Gọi lỡ",
  EXPIRED: "Mất lượt",
  CANCELLED: "Đã huỷ",
};

function csvCell(v: unknown): string {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // chống CSV injection khi mở bằng Excel
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** GET /api/staff/export.csv?date=YYYY-MM-DD */
export const GET = route("staff-export", async (req) => {
  const auth = await requireStaff(req);
  if (auth.response) return auth.response;
  const shop = await getShopById(auth.staff.shopId);
  const raw = req.nextUrl.searchParams.get("date") ?? todayInTz(shop?.timezone);
  const date = dateParamSchema.safeParse(raw);
  if (!date.success) return apiError(400, "VALIDATION", "Ngày dạng YYYY-MM-DD.");

  const { data, error } = await db()
    .from("tickets")
    .select("number, customer_name, phone, source, status, created_at, called_at, done_at, skipped_at, cancelled_at")
    .eq("shop_id", auth.staff.shopId)
    .eq("business_date", date.data)
    .order("number");
  if (error) throw error;

  const header = ["Số", "Tên", "SĐT", "Nguồn", "Trạng thái", "Lấy số", "Gọi lúc", "Xong lúc", "Gọi lỡ lúc", "Huỷ lúc", "Chờ (phút)", "Chụp (phút)"];
  const minutes = (a: string | null, b: string | null) =>
    a && b ? Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000) : "";
  const rows = (data ?? []).map((t) => [
    t.number,
    t.customer_name,
    t.phone ?? "",
    t.source === "MANUAL" ? "Thủ công" : "QR",
    STATUS_VI[t.status] ?? t.status,
    fmtTime(t.created_at, "HH:mm:ss"),
    t.called_at ? fmtTime(t.called_at, "HH:mm:ss") : "",
    t.done_at ? fmtTime(t.done_at, "HH:mm:ss") : "",
    t.skipped_at ? fmtTime(t.skipped_at, "HH:mm:ss") : "",
    t.cancelled_at ? fmtTime(t.cancelled_at, "HH:mm:ss") : "",
    minutes(t.created_at, t.called_at),
    t.status === "DONE" ? minutes(t.called_at, t.done_at) : "",
  ]);
  // BOM để Excel đọc đúng tiếng Việt
  const csv = "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ve-${shop?.slug ?? "shop"}-${date.data}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
