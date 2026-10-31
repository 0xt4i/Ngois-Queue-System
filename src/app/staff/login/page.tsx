import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/staff/login-form";
import { getStaff } from "@/lib/auth";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { LoginHeader } from "@/components/staff/login-header";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Đăng nhập nhân viên", robots: { index: false } };

export default async function LoginPage() {
  if (await getStaff()) redirect("/staff");
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <div className="flex justify-end"><LanguageSwitcher /></div>
      <LoginHeader />
      <LoginForm />
    </main>
  );
}
