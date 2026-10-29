import { randomBytes } from "node:crypto";
import { checkCustomerLimits, recordBadCode } from "@/lib/customer-guard";
import { rpc, type RpcResult } from "@/lib/db";
import { apiError, businessError, isSameOrigin, json, parseBody, route } from "@/lib/http";
import { logger } from "@/lib/logger";
import { getShopBySlug } from "@/lib/shop";
import type { TicketView } from "@/lib/types";
import { createTicketSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** Khách lấy số: { code, name, phone } → { ticket, token } */
export const POST = route("create-ticket", async (req, { params }: { params: Promise<{ slug: string }> }) => {
  if (!isSameOrigin(req)) return apiError(403, "CSRF", "Yêu cầu không hợp lệ.");
  const { slug } = await params;
  const shop = await getShopBySlug(slug);
  if (!shop) return apiError(404, "SHOP_NOT_FOUND", "Không tìm thấy tiệm.");

  const blocked = await checkCustomerLimits(req);
  if (blocked) return blocked;

  const body = await parseBody(req, createTicketSchema);
  if (body.response) return body.response;
  const { code, name, phone } = body.data;

  const r = await rpc<RpcResult<{ existing: boolean; ticket: TicketView }>>("pb_create_ticket", {
    p_shop_id: shop.id,
    p_code: code,
    p_name: name,
    p_phone: phone ?? null,
    p_source: "QR",
    p_token: randomBytes(24).toString("base64url"), // 192-bit
  });
  if (!r.ok) {
    if (r.error === "BAD_CODE") await recordBadCode(req);
    return businessError(r);
  }
  logger.info({ shop: shop.slug, number: r.ticket.number, existing: r.existing }, "ticket issued");
  return json({ ok: true, existing: r.existing, ticket: r.ticket, token: r.ticket.token }, r.existing ? 200 : 201);
});
