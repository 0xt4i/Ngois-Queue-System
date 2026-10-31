import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CustomerHome } from "@/components/customer/customer-home";
import { rpc } from "@/lib/db";
import { getShopBySlug, toPublicShop } from "@/lib/shop";
import type { QueueSnapshot } from "@/lib/types";
import { brandStyle } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ code?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const shop = await getShopBySlug((await params).slug);
  return { title: "Lấy số", ...(shop ? { description: `Lấy số tại ${shop.name}` } : {}) };
}

export default async function ShopPage({ params, searchParams }: Props) {
  const shop = await getShopBySlug((await params).slug);
  if (!shop) notFound();
  const state = await rpc<QueueSnapshot>("pb_public_state", { p_shop_id: shop.id });
  const { code: queryCode } = await searchParams;
  const code = queryCode && /^\d{4}$/.test(queryCode) ? queryCode : undefined;
  return (
    <div style={brandStyle(shop.primary_color)}>
      <CustomerHome shop={toPublicShop(shop)} initialState={state} initialCode={code} />
    </div>
  );
}
