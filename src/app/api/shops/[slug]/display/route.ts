import { rpc } from "@/lib/db";
import { displayKeyMatches } from "@/lib/display-key";
import { apiError, json, route } from "@/lib/http";
import { getShopBySlug } from "@/lib/shop";
import type { QueueSnapshot } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Dữ liệu cho màn hình tiệm: snapshot + mã ngày (cần `key` bí mật). */
export const GET = route("display", async (req, { params }: { params: Promise<{ slug: string }> }) => {
  const { slug } = await params;
  const shop = await getShopBySlug(slug);
  if (!shop || !displayKeyMatches(shop.display_key, req.nextUrl.searchParams.get("key"))) {
    return apiError(404, "NOT_FOUND", "Không tìm thấy màn hình.");
  }
  const data = await rpc<{ state: QueueSnapshot; checkinCode: string; codeUpdatedAt: string }>(
    "pb_display_state",
    { p_shop_id: shop.id },
  );
  return json({ ok: true, ...data });
});
