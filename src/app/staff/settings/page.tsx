import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SettingsForm } from "@/components/staff/settings-form";
import { UsersManager } from "@/components/staff/users-manager";
import { getStaff } from "@/lib/auth";
import { todayInTz } from "@/lib/format";
import { publicBaseUrl } from "@/lib/public-url";
import { getShopById } from "@/lib/shop";
import { brandStyle } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Cài đặt", robots: { index: false } };

export default async function SettingsPage() {
  const staff = await getStaff();
  if (!staff) redirect("/staff/login");
  if (staff.role !== "OWNER") redirect("/staff");
  const shop = await getShopById(staff.shopId);
  if (!shop) redirect("/staff/login");

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16" style={brandStyle(shop.primary_color)}>
      <header className="flex items-center justify-between py-4">
        <h1 className="text-xl font-bold">Cài đặt tiệm</h1>
        <Link href="/staff" className="inline-flex h-11 items-center rounded-xl px-3 font-medium hover:bg-zinc-100">
          ← Về quầy
        </Link>
      </header>
      <div className="space-y-6">
        <SettingsForm
          baseUrl={await publicBaseUrl()}
          today={todayInTz(shop.timezone)}
          initial={{
            name: shop.name,
            slug: shop.slug,
            logoUrl: shop.logo_url ?? "",
            primaryColor: shop.primary_color,
            graceTurns: shop.grace_turns,
            defaultServiceMinutes: shop.default_service_minutes,
            dayResetTime: shop.day_reset_time.slice(0, 5),
            codeMode: shop.code_mode,
            codeRotateHours: shop.code_rotate_hours,
            phoneRetentionDays: shop.phone_retention_days,
            displayKey: shop.display_key,
          }}
        />
        <UsersManager />
      </div>
    </main>
  );
}
