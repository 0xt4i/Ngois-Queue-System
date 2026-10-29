import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { StaffDashboard } from "@/components/staff/staff-dashboard";
import { getStaff } from "@/lib/auth";
import { rpc } from "@/lib/db";
import { getShopById } from "@/lib/shop";
import type { StaffQueue } from "@/lib/types";
import { brandStyle } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Quầy nhân viên", robots: { index: false } };

export default async function StaffPage() {
  const staff = await getStaff();
  if (!staff) redirect("/staff/login");
  const [queue, shop] = await Promise.all([
    rpc<StaffQueue>("pb_staff_queue", { p_shop_id: staff.shopId }),
    getShopById(staff.shopId),
  ]);
  return (
    <div style={brandStyle(shop?.primary_color ?? "#e11d48")}>
      <StaffDashboard me={staff} initialQueue={queue} />
    </div>
  );
}
