import { rpc, type RpcResult } from "@/lib/db";
import { apiError, businessError, json, route } from "@/lib/http";
import { derivePosition } from "@/lib/position";
import type { QueueSnapshot, TicketView } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Chi tiết vé (chỉ người có token) + vị trí hiện tại trong hàng. */
export const GET = route("ticket", async (_req, { params }: { params: Promise<{ token: string }> }) => {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(token)) return apiError(404, "NOT_FOUND", "Không tìm thấy vé.");
  const r = await rpc<RpcResult<{ ticket: TicketView; state: QueueSnapshot }>>("pb_ticket_view", { p_token: token });
  if (!r.ok) return businessError(r);
  const position = r.ticket.isToday ? derivePosition(r.state, r.ticket.number) : { status: "UNKNOWN" };
  return json({ ok: true, ticket: r.ticket, state: r.state, position });
});
