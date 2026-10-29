import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";
import { logger } from "./logger";

export function json(data: unknown, status = 200, headers?: HeadersInit) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export function apiError(status: number, error: string, message: string) {
  return json({ ok: false, error, message }, status);
}

const BUSINESS_STATUS: Record<string, number> = {
  BAD_CODE: 403,
  PAUSED: 423,
  NOT_FOUND: 404,
  EMPTY: 409,
  NO_SERVING: 409,
  NOT_RECALLABLE: 409,
  INVALID_STATE: 409,
  NOTHING_TO_UNDO: 409,
  BAD_CODE_FORMAT: 400,
  BAD_ACTION: 400,
};

/** Chuyển kết quả ok=false của hàm pb_* thành HTTP response. */
export function businessError(r: { error: string; message: string }) {
  return apiError(BUSINESS_STATUS[r.error] ?? 400, r.error, r.message);
}

export function getClientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Chống CSRF cho các request thay đổi dữ liệu: Origin phải trùng host đang phục vụ.
 * Kết hợp với cookie SameSite=Lax + body JSON nên form bên ngoài không gửi được.
 */
export function isSameOrigin(req: NextRequest): boolean {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  return req.headers.get("sec-fetch-site") === "same-origin";
}

export async function parseBody<S extends z.ZodType>(
  req: NextRequest,
  schema: S,
): Promise<{ data: z.output<S>; response?: undefined } | { data?: undefined; response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { response: apiError(400, "BAD_JSON", "Dữ liệu gửi lên không hợp lệ.") };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      response: json(
        {
          ok: false,
          error: "VALIDATION",
          message: first?.message ?? "Dữ liệu không hợp lệ.",
          fields: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])),
        },
        400,
      ),
    };
  }
  return { data: parsed.data };
}

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response>;

/** Bọc route handler: bắt lỗi không lường trước, log có cấu trúc, trả 500 thân thiện. */
export function route<C>(name: string, fn: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    const started = Date.now();
    try {
      const res = await fn(req, ctx);
      logger.debug({ route: name, status: res.status, ms: Date.now() - started }, "request");
      return res;
    } catch (err) {
      logger.error({ route: name, err: err instanceof Error ? err.message : String(err) }, "request failed");
      return apiError(500, "INTERNAL", "Có lỗi xảy ra, vui lòng thử lại.");
    }
  };
}
