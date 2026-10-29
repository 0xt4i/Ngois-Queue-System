"use client";

import { Maximize, Volume2, VolumeX } from "lucide-react";
import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicShop, QueueSnapshot } from "@/lib/types";
import { useQueueState } from "@/lib/use-queue-state";
import { cn } from "@/lib/utils";

const RELOAD_AFTER_OFFLINE_MS = 30_000;
const SOUND_KEY = "pb_display_sound";

/** Âm "ting" bằng WebAudio (không cần file âm thanh). */
function playTing(ctx: AudioContext) {
  const now = ctx.currentTime;
  [880, 1318.5].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const t = now + i * 0.18;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 1);
  });
}

export function DisplayBoard({
  shop,
  displayKey,
  initialState,
  initialCode,
  qrSvg,
  customerUrl,
}: {
  shop: PublicShop;
  displayKey: string;
  initialState: QueueSnapshot;
  initialCode: string;
  qrSvg: string;
  customerUrl: string;
}) {
  const displayUrl = `/api/shops/${shop.slug}/display?key=${encodeURIComponent(displayKey)}`;
  const { snap, connected, disconnectedSince } = useQueueState(shop.id, shop.slug, initialState, displayUrl, 5_000);
  const [code, setCode] = useState(initialCode);
  const [qrMarkup, setQrMarkup] = useState(qrSvg);
  const [flash, setFlash] = useState(0);
  const [soundOn, setSoundOn] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const audioRef = useRef<AudioContext | null>(null);

  const current = snap?.currentNumber ?? null;

  // Mã ngày: tải lại cùng endpoint với trạng thái để đổi nhanh sau khi có vé mới.
  const loadCode = useCallback(async () => {
    try {
      const r = await fetch(displayUrl, { cache: "no-store" });
      if (r.ok) setCode(((await r.json()) as { checkinCode: string }).checkinCode);
    } catch {
      /* ignore */
    }
  }, [displayUrl]);
  useEffect(() => {
    void loadCode();
  }, [snap?.version, loadCode]);
  useEffect(() => {
    let cancelled = false;
    const url = new URL(customerUrl, window.location.origin);
    url.searchParams.set("code", code);
    void QRCode.toString(url.toString(), { type: "svg", margin: 1, errorCorrectionLevel: "M" }).then((svg) => {
      if (!cancelled) setQrMarkup(svg);
    });
    return () => {
      cancelled = true;
    };
  }, [code, customerUrl]);
  useEffect(() => {
    const id = setInterval(() => void loadCode(), 5_000);
    return () => clearInterval(id);
  }, [loadCode]);

  // Âm thanh: trình duyệt cần 1 lần chạm để cho phát
  useEffect(() => {
    try {
      if (localStorage.getItem(SOUND_KEY) !== "off") setNeedsTap(true);
    } catch {
      setNeedsTap(true);
    }
  }, []);
  const enableSound = () => {
    audioRef.current ??= new AudioContext();
    void audioRef.current.resume();
    setSoundOn(true);
    setNeedsTap(false);
    try {
      localStorage.setItem(SOUND_KEY, "on");
    } catch {
      /* ignore */
    }
  };
  const toggleSound = () => {
    if (soundOn) {
      setSoundOn(false);
      try {
        localStorage.setItem(SOUND_KEY, "off");
      } catch {
        /* ignore */
      }
    } else enableSound();
  };

  // Số đổi → nhấp nháy + ting
  const prevCurrent = useRef(current);
  useEffect(() => {
    if (current !== prevCurrent.current && current != null) {
      setFlash((f) => f + 1);
      if (soundOn && audioRef.current) playTing(audioRef.current);
    }
    prevCurrent.current = current;
  }, [current, soundOn]);

  // Chống tắt màn hình (Wake Lock)
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const request = async () => {
      try {
        if ("wakeLock" in navigator && document.visibilityState === "visible") {
          lock = await navigator.wakeLock.request("screen");
        }
      } catch {
        /* không hỗ trợ / bị từ chối */
      }
    };
    void request();
    const onVis = () => void request();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      void lock?.release();
    };
  }, []);

  // Mất kết nối > 30s → tải lại trang (chỉ khi server phản hồi, tránh kẹt ở trang lỗi)
  useEffect(() => {
    const id = setInterval(async () => {
      if (disconnectedSince && Date.now() - disconnectedSince > RELOAD_AFTER_OFFLINE_MS) {
        try {
          const r = await fetch("/api/health", { cache: "no-store" });
          if (r.ok) window.location.reload();
        } catch {
          /* vẫn mất mạng, thử lại sau */
        }
      }
    }, 5000);
    return () => clearInterval(id);
  }, [disconnectedSince]);

  const next = snap?.nextNumbers ?? [];
  const missed = snap?.skippedInGrace ?? [];

  return (
    <main className="relative flex h-dvh w-full select-none flex-col overflow-hidden bg-zinc-950 p-[2.5vh] text-white">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {shop.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- logo do chủ tiệm nhập
            <img src={shop.logoUrl} alt="" className="h-[7vh] w-[7vh] rounded-2xl object-cover" />
          )}
          <h1 className="text-[4vh] font-bold">{shop.name}</h1>
        </div>
        <div className="no-print flex items-center gap-3 text-[2vh] text-zinc-400">
          <span className={cn("inline-block h-[1.4vh] w-[1.4vh] rounded-full", connected ? "bg-emerald-500" : "bg-red-500")} />
          <button type="button" onClick={toggleSound} className="rounded-full p-3 hover:bg-white/10" aria-label="Bật/tắt âm thanh">
            {soundOn ? <Volume2 className="h-[3vh] w-[3vh]" /> : <VolumeX className="h-[3vh] w-[3vh]" />}
          </button>
          <button
            type="button"
            onClick={() => void document.documentElement.requestFullscreen?.()}
            className="rounded-full p-3 hover:bg-white/10"
            aria-label="Toàn màn hình"
          >
            <Maximize className="h-[3vh] w-[3vh]" />
          </button>
        </div>
      </header>

      <div className="mt-[2vh] grid min-h-0 flex-1 grid-cols-[1.6fr_1fr] gap-[2.5vh]">
        {/* Số đang chụp */}
        <section className="flex flex-col items-center justify-center rounded-[3vh] bg-brand">
          <p className="text-[6vh] font-bold uppercase tracking-wider text-white/90">Đang chụp</p>
          <p
            key={flash}
            className={cn("tabular text-[34vh] font-extrabold leading-none", flash > 0 && "animate-flash")}
            data-testid="display-current"
          >
            {current ?? "—"}
          </p>
          {snap?.isPaused && (
            <p className="mt-[2vh] rounded-full bg-black/30 px-[3vh] py-[1vh] text-[3vh] font-semibold">
              Tiệm tạm ngưng nhận số mới
            </p>
          )}
        </section>

        <div className="flex min-h-0 flex-col gap-[2.5vh]">
          {/* Số tiếp theo */}
          <section className="rounded-[3vh] bg-zinc-900 p-[2.5vh]">
            <p className="text-[3.2vh] font-semibold text-zinc-300">Số tiếp theo</p>
            <div className="mt-[1.5vh] flex flex-wrap gap-[1.5vh]">
              {next.length === 0 && <p className="text-[3.5vh] text-zinc-500">Chưa có ai chờ</p>}
              {next.map((n, i) => (
                <span
                  key={n}
                  className={cn(
                    "tabular rounded-[2vh] px-[2.2vh] py-[0.8vh] font-extrabold",
                    i === 0 ? "bg-white text-[8vh] text-zinc-950" : "bg-zinc-800 text-[6vh]",
                  )}
                >
                  {n}
                </span>
              ))}
            </div>
          </section>

          {/* Gọi lỡ */}
          {missed.length > 0 && (
            <section className="rounded-[3vh] bg-red-600 p-[2.5vh]">
              <p className="text-[3.6vh] font-bold leading-tight">
                Số {missed.map((m) => m.number).join(", ")} vui lòng tới quầy
              </p>
              <p className="mt-[0.5vh] text-[2.4vh] text-white/85">Bạn đã bị gọi qua lượt — vẫn còn được hỗ trợ.</p>
            </section>
          )}

          {/* QR + mã ngày */}
          <section className="mt-auto flex items-center gap-[2.5vh] rounded-[3vh] bg-white p-[2.5vh] text-zinc-950">
            <div
              className="aspect-square h-[22vh] shrink-0 [&>svg]:h-full [&>svg]:w-full"
              aria-label={`Mã QR tới ${customerUrl}?code=${code}`}
              dangerouslySetInnerHTML={{ __html: qrMarkup }}
            />
            <div className="min-w-0">
              <p className="text-[2.6vh] font-semibold leading-tight">Quét mã để lấy số</p>
              <p className="mt-[1vh] text-[2.2vh] text-zinc-600">Mã ngày hôm nay</p>
              <p className="tabular text-[10vh] font-extrabold leading-none tracking-[0.15em]" data-testid="display-code">
                {code}
              </p>
            </div>
          </section>
        </div>
      </div>

      {needsTap && (
        <button
          type="button"
          onClick={enableSound}
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black/70 text-[4vh] font-semibold"
        >
          <Volume2 className="h-[10vh] w-[10vh]" />
          Chạm vào màn hình để bật âm thanh báo số
          <span className="text-[2.4vh] font-normal text-zinc-300">(trình duyệt yêu cầu 1 lần chạm)</span>
        </button>
      )}
    </main>
  );
}
