import { requireStaff } from "@/lib/auth";
import { rpc } from "@/lib/db";
import { todayInTz } from "@/lib/format";
import { apiError, json, route } from "@/lib/http";
import { getShopById } from "@/lib/shop";
import type { DayStats } from "@/lib/types";
import { dateParamSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** GET /api/staff/stats?date=YYYY-MM-DD (mặc định hôm nay theo múi giờ tiệm) */
export const GET = route("staff-stats", async (req) => {
  const auth = await requireStaff(req);
  if (auth.response) return auth.response;
  const shop = await getShopById(auth.staff.shopId);
  const raw = req.nextUrl.searchParams.get("date") ?? todayInTz(shop?.timezone);
  const date = dateParamSchema.safeParse(raw);
  if (!date.success) return apiError(400, "VALIDATION", "Ngày dạng YYYY-MM-DD.");
  const stats = await rpc<DayStats>("pb_stats", { p_shop_id: auth.staff.shopId, p_date: date.data });
  return json({ ok: true, stats });
});
