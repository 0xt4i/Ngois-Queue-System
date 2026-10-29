import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { DisplayBoard } from "@/components/display/display-board";
import { rpc } from "@/lib/db";
import { displayKeyMatches } from "@/lib/display-key";
import { customerUrl } from "@/lib/public-url";
import { getShopBySlug, toPublicShop } from "@/lib/shop";
import type { QueueSnapshot } from "@/lib/types";
import { brandStyle } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Màn hình tiệm", robots: { index: false, follow: false } };

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ key?: string }> };

export default async function DisplayPage({ params, searchParams }: Props) {
  const [{ slug }, { key }] = await Promise.all([params, searchParams]);
  const shop = await getShopBySlug(slug);
  if (!shop || !displayKeyMatches(shop.display_key, key)) notFound();

  const url = await customerUrl(shop.slug);
  const data = await rpc<{ state: QueueSnapshot; checkinCode: string }>("pb_display_state", { p_shop_id: shop.id });
  const qrUrl = new URL(url);
  qrUrl.searchParams.set("code", data.checkinCode);
  const qrSvg = await QRCode.toString(qrUrl.toString(), { type: "svg", margin: 1, errorCorrectionLevel: "M" });

  return (
    <div style={brandStyle(shop.primary_color)}>
      <DisplayBoard
        shop={toPublicShop(shop)}
        displayKey={key!}
        initialState={data.state}
        initialCode={data.checkinCode}
        qrSvg={qrSvg}
        customerUrl={url}
      />
    </div>
  );
}
