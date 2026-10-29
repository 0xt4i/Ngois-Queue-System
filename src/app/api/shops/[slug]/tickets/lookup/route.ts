import { checkCustomerLimits, recordBadCode } from "@/lib/customer-guard";
import { rpc, type RpcResult } from "@/lib/db";
import { apiError, businessError, isSameOrigin, json, parseBody, route } from "@/lib/http";
import { getShopBySlug } from "@/lib/shop";
import type { TicketView } from "@/lib/types";
import { lookupSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** Tra cứu lại vé hôm nay bằng SĐT + mã ngày. */
export const POST = route("lookup-ticket", async (req, { params }: { params: Promise<{ slug: string }> }) => {
  if (!isSameOrigin(req)) return apiError(403, "CSRF", "Yêu cầu không hợp lệ.");
  const { slug } = await params;
  const shop = await getShopBySlug(slug);
  if (!shop) return apiError(404, "SHOP_NOT_FOUND", "Không tìm thấy tiệm.");

  const blocked = await checkCustomerLimits(req);
  if (blocked) return blocked;

  const body = await parseBody(req, lookupSchema);
  if (body.response) return body.response;

  const r = await rpc<RpcResult<{ ticket: TicketView }>>("pb_lookup_ticket", {
    p_shop_id: shop.id,
    p_phone: body.data.phone,
    p_code: body.data.code,
  });
  if (!r.ok) {
    if (r.error === "BAD_CODE") await recordBadCode(req);
    return businessError(r);
  }
  return json({ ok: true, ticket: r.ticket, token: r.ticket.token });
});
