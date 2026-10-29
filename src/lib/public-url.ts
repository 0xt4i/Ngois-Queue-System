import { headers } from "next/headers";
import { env } from "./env";

/** URL gốc công khai của web (ưu tiên NEXT_PUBLIC_APP_URL, sau đó lấy từ request). */
export async function publicBaseUrl(): Promise<string> {
  if (env.appUrl) return env.appUrl.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function customerUrl(slug: string) {
  return `${await publicBaseUrl()}/s/${slug}`;
}
