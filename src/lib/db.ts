import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

// Client service_role — CHỈ dùng phía server (bỏ qua RLS).
let admin: SupabaseClient | null = null;

export function db(): SupabaseClient {
  admin ??= createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}

export class DbError extends Error {}

export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn, args);
  if (error) throw new DbError(`${fn}: ${error.message}`);
  return data as T;
}

/** Kết quả chuẩn của các hàm pb_* (lỗi nghiệp vụ trả về ok=false thay vì throw). */
export type RpcResult<T> = ({ ok: true } & T) | { ok: false; error: string; message: string };
