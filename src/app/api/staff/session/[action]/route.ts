import type { NextRequest } from "next/server";
import { requireStaff } from "@/lib/auth";
import { rpc, type RpcResult } from "@/lib/db";
import { apiError, businessError, json, route } from "@/lib/http";

export const dynamic = "force-dynamic";

/** POST /api/staff/session/pause | resume */
export const POST = route("staff-session", async (req: NextRequest, { params }: { params: Promise<{ action: string }> }) => {
  const { action } = await params;
  if (!["pause", "resume"].includes(action)) {
    return apiError(404, "NOT_FOUND", "Không tìm thấy thao tác.");
  }
  const auth = await requireStaff(req);
  if (auth.response) return auth.response;
  const { staff } = auth;

  const r = await rpc<RpcResult<object>>("pb_set_paused", {
    p_shop_id: staff.shopId,
    p_staff_id: staff.id,
    p_paused: action === "pause",
  });
  return r.ok ? json(r) : businessError(r);
});
