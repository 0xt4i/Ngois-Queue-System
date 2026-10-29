import { rpc, type RpcResult } from "@/lib/db";
import { apiError, businessError, isSameOrigin, json, route } from "@/lib/http";
import type { TicketView } from "@/lib/types";

export const dynamic = "force-dynamic";

export const POST = route("cancel-ticket", async (req, { params }: { params: Promise<{ token: string }> }) => {
  if (!isSameOrigin(req)) return apiError(403, "CSRF", "Yêu cầu không hợp lệ.");
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(token)) return apiError(404, "NOT_FOUND", "Không tìm thấy vé.");
  const r = await rpc<RpcResult<{ ticket: TicketView }>>("pb_customer_cancel", { p_token: token });
  if (!r.ok) return businessError(r);
  return json({ ok: true, ticket: r.ticket });
});
