import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-6xl font-extrabold text-zinc-300">404</p>
      <h1 className="text-xl font-semibold">Không tìm thấy trang</h1>
      <p className="text-zinc-600">Link có thể đã sai hoặc hết hiệu lực. Bạn hãy quét lại mã QR tại quầy nhé.</p>
      <Link href="/" className="font-semibold text-brand underline underline-offset-4">
        Về trang lấy số
      </Link>
    </main>
  );
}
