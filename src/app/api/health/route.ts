import { db } from "@/lib/db";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  const { error } = await db().from("shops").select("id").limit(1);
  if (error) return json({ ok: false, db: "down" }, 503);
  return json({ ok: true, db: "up", ms: Date.now() - started });
}
