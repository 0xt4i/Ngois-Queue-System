import { rpc } from "@/lib/db";
import { apiError, json, route } from "@/lib/http";
import { getShopBySlug, toPublicShop } from "@/lib/shop";
import type { QueueSnapshot } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Snapshot công khai của hàng đợi (không có dữ liệu cá nhân). */
export const GET = route("state", async (_req, { params }: { params: Promise<{ slug: string }> }) => {
  const { slug } = await params;
  const shop = await getShopBySlug(slug);
  if (!shop) return apiError(404, "SHOP_NOT_FOUND", "Không tìm thấy tiệm.");
  const state = await rpc<QueueSnapshot>("pb_public_state", { p_shop_id: shop.id });
  return json({ ok: true, shop: toPublicShop(shop), state });
});
