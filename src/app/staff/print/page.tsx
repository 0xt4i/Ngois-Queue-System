import type { Metadata } from "next";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { PrintButton } from "@/components/staff/print-button";
import { getStaff } from "@/lib/auth";
import { customerUrl } from "@/lib/public-url";
import { getShopById } from "@/lib/shop";
import { brandStyle } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "In mã QR", robots: { index: false } };

/** Trang in A5: logo, QR tới trang khách, hướng dẫn 3 bước. */
export default async function PrintPage() {
  const staff = await getStaff();
  if (!staff) redirect("/staff/login");
  const shop = await getShopById(staff.shopId);
  if (!shop) redirect("/staff/login");
  const url = await customerUrl(shop.slug);
  const qr = await QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "M" });

  const steps = [
    { n: 1, title: "Quét mã", desc: "Dùng camera điện thoại quét mã QR bên trên" },
    { n: 2, title: "Nhập mã ngày", desc: "Mã 4 số đang hiện trên màn hình tại quầy" },
    { n: 3, title: "Nhận số", desc: "Đi dạo thoải mái, điện thoại báo khi gần tới lượt" },
  ];

  return (
    <div style={brandStyle(shop.primary_color)} className="flex min-h-dvh flex-col items-center bg-zinc-200 py-6 print:bg-white print:py-0">
      <style>{`@page { size: A5 portrait; margin: 0; }`}</style>
      <div className="no-print mb-4">
        <PrintButton />
      </div>
      <article className="flex h-[210mm] w-[148mm] flex-col items-center bg-white px-[12mm] py-[12mm] text-center shadow-xl print:shadow-none">
        {shop.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- logo do chủ tiệm nhập
          <img src={shop.logo_url} alt="" className="h-[18mm] w-[18mm] rounded-2xl object-cover" />
        ) : (
          <span className="flex h-[18mm] w-[18mm] items-center justify-center rounded-2xl bg-brand text-4xl font-extrabold text-white">#</span>
        )}
        <h1 className="mt-[4mm] text-[9mm] font-extrabold leading-tight">{shop.name}</h1>
        <p className="mt-[1mm] text-[5mm] font-semibold text-brand">Quét mã để lấy số thứ tự</p>
        <div className="mt-[6mm] h-[70mm] w-[70mm] [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: qr }} />
        <ol className="mt-[8mm] w-full space-y-[4mm] text-left">
          {steps.map((s) => (
            <li key={s.n} className="flex items-center gap-[4mm]">
              <span className="flex h-[11mm] w-[11mm] shrink-0 items-center justify-center rounded-full bg-brand text-[6mm] font-extrabold text-white">
                {s.n}
              </span>
              <div>
                <p className="text-[5.2mm] font-bold leading-tight">{s.title}</p>
                <p className="text-[3.8mm] text-zinc-600">{s.desc}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-auto break-all text-[3.2mm] text-zinc-400">{url}</p>
      </article>
    </div>
  );
}
