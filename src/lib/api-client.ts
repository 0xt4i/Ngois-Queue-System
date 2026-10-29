"use client";

export interface ApiFailure {
  ok: false;
  error: string;
  message: string;
  fields?: Record<string, string>;
  status: number;
}

/** POST/PUT/PATCH/DELETE JSON tới API cùng origin. Không throw — luôn trả ok/không ok. */
export async function apiSend<T>(
  url: string,
  body?: unknown,
  opts: { method?: string; idempotent?: boolean } = {},
): Promise<({ ok: true } & T) | ApiFailure> {
  const headers: Record<string, string> = { "Content-Type": "application/json", "X-Device-Id": getDeviceId() };
  if (opts.idempotent) headers["Idempotency-Key"] = crypto.randomUUID();
  try {
    const res = await fetch(url, {
      method: opts.method ?? "POST",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || data.ok === false) {
      return {
        ok: false,
        error: String(data.error ?? "HTTP_" + res.status),
        message: String(data.message ?? "Có lỗi xảy ra, vui lòng thử lại."),
        fields: data.fields as Record<string, string> | undefined,
        status: res.status,
      };
    }
    return { ...(data as T), ok: true };
  } catch {
    return { ok: false, error: "NETWORK", message: "Mất kết nối mạng, vui lòng thử lại.", status: 0 };
  }
}

export async function apiGet<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

const deviceKey = "pb_device";
export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(deviceKey);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(deviceKey, id);
    }
    return id;
  } catch {
    return "no-storage";
  }
}

export const ticketStorageKey = (slug: string) => `pb_ticket_${slug}`;

export function saveTicketToken(slug: string, token: string) {
  try {
    localStorage.setItem(ticketStorageKey(slug), token);
  } catch {
    /* private mode */
  }
}

export function loadTicketToken(slug: string): string | null {
  try {
    return localStorage.getItem(ticketStorageKey(slug));
  } catch {
    return null;
  }
}

export function clearTicketToken(slug: string) {
  try {
    localStorage.removeItem(ticketStorageKey(slug));
  } catch {
    /* ignore */
  }
}
