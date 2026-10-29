import { randomBytes } from "node:crypto";
import { requireStaff } from "@/lib/auth";
import { rpc, type RpcResult } from "@/lib/db";
import { businessError, json, parseBody, route } from "@/lib/http";
import type { TicketView } from "@/lib/types";
import { manualTicketSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** Nhân viên thêm khách thủ công (không cần mã ngày, vẫn nhận khi đang tạm dừng). */
export const POST = route("staff-manual-ticket", async (req) => {
  const auth = await requireStaff(req);
  if (auth.response) return auth.response;
  const body = await parseBody(req, manualTicketSchema);
  if (body.response) return body.response;

  const r = await rpc<RpcResult<{ existing: boolean; ticket: TicketView }>>("pb_create_ticket", {
    p_shop_id: auth.staff.shopId,
    p_code: null,
    p_name: body.data.name,
    p_phone: body.data.phone ?? null,
    p_source: "MANUAL",
    p_token: randomBytes(24).toString("base64url"),
    p_staff_id: auth.staff.id,
  });
  if (!r.ok) return businessError(r);
  return json({ ok: true, existing: r.existing, ticket: r.ticket }, r.existing ? 200 : 201);
});
