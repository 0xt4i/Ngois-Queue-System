import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/staff/login-form";
import { getStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Đăng nhập nhân viên", robots: { index: false } };

export default async function LoginPage() {
  if (await getStaff()) redirect("/staff");
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <h1 className="text-center text-2xl font-bold">Đăng nhập nhân viên</h1>
      <p className="mt-1 text-center text-zinc-500">Quản lý hàng đợi của tiệm</p>
      <LoginForm />
    </main>
  );
}
