"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { QueueSnapshot } from "./types";

const POLL_FALLBACK_MS = 15_000;
const POLL_SAFETY_MS = 60_000;

export interface QueueStateHook {
  snap: QueueSnapshot | null;
  connected: boolean;
  /** Mốc thời gian lần cuối nhận được snapshot (thành công). */
  lastUpdate: Date | null;
  /** Mốc thời gian kể từ lúc mất kết nối realtime (null nếu đang kết nối). */
  disconnectedSince: number | null;
  refresh: () => Promise<void>;
}

/**
 * Theo dõi snapshot hàng đợi theo thời gian thực:
 * - Supabase Realtime (postgres_changes trên bảng queue_state, kênh `shop:{shopId}`)
 * - Fallback polling 15s khi mất realtime, 60s khi đang kết nối (phòng hờ)
 * - Tải lại ngay khi tab hiện lại / có mạng lại
 * - Bỏ qua snapshot có `version` cũ hơn bản đang có
 */
export function useQueueState(
  shopId: string,
  slug: string,
  initial: QueueSnapshot | null,
  stateUrl = `/api/shops/${slug}/state`,
): QueueStateHook {
  const [snap, setSnap] = useState<QueueSnapshot | null>(initial);
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(initial ? new Date() : null);
  const [disconnectedSince, setDisconnectedSince] = useState<number | null>(Date.now());
  const versionRef = useRef(initial?.version ?? 0);

  const apply = useCallback((s: QueueSnapshot | null | undefined) => {
    if (!s || typeof s.version !== "number") return;
    setLastUpdate(new Date());
    if (s.version < versionRef.current) return;
    versionRef.current = s.version;
    setSnap(s);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(stateUrl, { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as { state?: QueueSnapshot };
      apply(body.state);
    } catch {
      /* mất mạng — thử lại ở lần poll sau */
    }
  }, [stateUrl, apply]);

  // Realtime
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    void import("@supabase/realtime-js").then(({ RealtimeClient }) => {
      if (cancelled) return;
      const client = new RealtimeClient(`${url.replace(/\/$/, "")}/realtime/v1`, {
        params: { apikey: key },
        ...(key.startsWith("eyJ") ? { accessToken: async () => key } : {}),
      });
      const channel = client
        .channel(`shop:${shopId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "queue_state", filter: `shop_id=eq.${shopId}` },
          (payload) => apply((payload.new as { snapshot?: QueueSnapshot }).snapshot),
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            setConnected(true);
            setDisconnectedSince(null);
            void refresh(); // bù các thay đổi trong lúc đang kết nối
          } else {
            setConnected(false);
            setDisconnectedSince((d) => d ?? Date.now());
          }
        });
      cleanup = () => {
        void channel.unsubscribe();
        void client.disconnect();
      };
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [shopId, apply, refresh]);

  // Polling (fallback khi mất realtime, phòng hờ khi đang có)
  useEffect(() => {
    const id = setInterval(() => void refresh(), connected ? POLL_SAFETY_MS : POLL_FALLBACK_MS);
    return () => clearInterval(id);
  }, [connected, refresh]);

  // Tab hiện lại / có mạng lại → tải ngay
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const onOnline = () => void refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    window.addEventListener("pageshow", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pageshow", onOnline);
    };
  }, [refresh]);

  return { snap, connected, lastUpdate, disconnectedSince, refresh };
}
