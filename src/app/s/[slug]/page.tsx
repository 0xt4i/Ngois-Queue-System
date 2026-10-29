import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CustomerHome } from "@/components/customer/customer-home";
import { rpc } from "@/lib/db";
import { getShopBySlug, toPublicShop } from "@/lib/shop";
import type { QueueSnapshot } from "@/lib/types";
import { brandStyle } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const shop = await getShopBySlug((await params).slug);
  return { title: shop ? `Lấy số — ${shop.name}` : "Lấy số" };
}

export default async function ShopPage({ params }: Props) {
  const shop = await getShopBySlug((await params).slug);
  if (!shop) notFound();
  const state = await rpc<QueueSnapshot>("pb_public_state", { p_shop_id: shop.id });
  return (
    <div style={brandStyle(shop.primary_color)}>
      <CustomerHome shop={toPublicShop(shop)} initialState={state} />
    </div>
  );
}
