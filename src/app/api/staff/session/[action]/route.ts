import type { NextRequest } from "next/server";
import { requireStaff } from "@/lib/auth";
import { rpc, type RpcResult } from "@/lib/db";
import { apiError, businessError, json, parseBody, route } from "@/lib/http";
import { rotateCodeSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** POST /api/staff/session/rotate-code | pause | resume */
export const POST = route("staff-session", async (req: NextRequest, { params }: { params: Promise<{ action: string }> }) => {
  const { action } = await params;
  if (!["rotate-code", "pause", "resume"].includes(action)) {
    return apiError(404, "NOT_FOUND", "Không tìm thấy thao tác.");
  }
  const auth = await requireStaff(req);
  if (auth.response) return auth.response;
  const { staff } = auth;

  if (action === "rotate-code") {
    // body tuỳ chọn: { code: "1234" } để nhân viên tự đặt mã
    const hasBody = (req.headers.get("content-length") ?? "0") !== "0";
    let code: string | null = null;
    if (hasBody) {
      const body = await parseBody(req, rotateCodeSchema);
      if (body.response) return body.response;
      code = body.data.code ?? null;
    }
    const r = await rpc<RpcResult<{ checkinCode: string; codeUpdatedAt: string }>>("pb_set_code", {
      p_shop_id: staff.shopId,
      p_staff_id: staff.id,
      p_code: code,
    });
    return r.ok ? json(r) : businessError(r);
  }

  const r = await rpc<RpcResult<object>>("pb_set_paused", {
    p_shop_id: staff.shopId,
    p_staff_id: staff.id,
    p_paused: action === "pause",
  });
  return r.ok ? json(r) : businessError(r);
});
