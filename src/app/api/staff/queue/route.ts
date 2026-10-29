import { requireStaff } from "@/lib/auth";
import { rpc } from "@/lib/db";
import { json, route } from "@/lib/http";
import type { StaffQueue } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Danh sách đầy đủ hàng đợi hôm nay (có tên, SĐT) cho nhân viên. */
export const GET = route("staff-queue", async (req) => {
  const auth = await requireStaff(req);
  if (auth.response) return auth.response;
  const data = await rpc<StaffQueue>("pb_staff_queue", { p_shop_id: auth.staff.shopId });
  return json({ ok: true, ...data, me: auth.staff });
});
