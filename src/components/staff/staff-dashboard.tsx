"use client";

import {
  ExternalLink,
  KeyRound,
  Loader2,
  LogOut,
  Monitor,
  Pause,
  Play,
  RefreshCw,
  Settings,
  SkipForward,
  Undo2,
  UserPlus,
  UserX,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConnectionStatus } from "@/components/ui/connection-status";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiSend } from "@/lib/api-client";
import type { StaffUser } from "@/lib/auth";
import { fmtClock, fmtDuration, fmtTime, maskPhone } from "@/lib/format";
import type { DayStats, StaffQueue, StaffTicket } from "@/lib/types";
import { useQueueState } from "@/lib/use-queue-state";
import { cn } from "@/lib/utils";
import { ManualAddDialog } from "./manual-add-dialog";

type Toast = { kind: "ok" | "error"; text: string } | null;

const ACTION_LABEL: Record<string, string> = { NEXT: "Next", SKIP: "Vắng mặt", RECALL: "Gọi lại" };

export function StaffDashboard({ me, initialQueue }: { me: StaffUser; initialQueue: StaffQueue }) {
  const router = useRouter();
  const [queue, setQueue] = useState(initialQueue);
  const [stats, setStats] = useState<DayStats | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [toast, setToast] = useState<Toast>(null);
  const [now, setNow] = useState(() => Date.now());
  const clockOffset = useRef(new Date(initialQueue.serverTime).getTime() - Date.now());
  const [manualOpen, setManualOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState<StaffTicket | null>(null);
  const [customCode, setCustomCode] = useState("");

  const { snap, connected, lastUpdate } = useQueueState(queue.shop.id, queue.shop.slug, null);

  const showToast = useCallback((t: Toast) => {
    setToast(t);
    if (t) setTimeout(() => setToast((cur) => (cur === t ? null : cur)), 3500);
  }, []);

  const loadQueue = useCallback(async () => {
    try {
      const res = await fetch("/api/staff/queue", { cache: "no-store" });
      if (res.status === 401) return router.replace("/staff/login");
      if (!res.ok) return;
      const q = (await res.json()) as StaffQueue;
      clockOffset.current = new Date(q.serverTime).getTime() - Date.now();
      setQueue(q);
    } catch {
      /* mất mạng */
    }
  }, [router]);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch("/api/staff/stats", { cache: "no-store" });
      if (res.ok) setStats(((await res.json()) as { stats: DayStats }).stats);
    } catch {
      /* ignore */
    }
  }, []);

  // Snapshot đổi (do bất kỳ ai: khách lấy số, nhân viên khác bấm Next…) → tải lại danh sách
  useEffect(() => {
    void loadQueue();
    void loadStats();
  }, [snap?.version, loadQueue, loadStats]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + clockOffset.current), 1000);
    return () => clearInterval(id);
  }, []);

  /** Gửi thao tác: chống double-click (khoá + idempotency key), cập nhật lại danh sách. */
  const act = useCallback(
    async (url: string, body?: unknown, okText?: string) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      const r = await apiSend<{ servedNumber?: number | null }>(url, body, { idempotent: true });
      if (!r.ok) {
        if (r.status === 401) router.replace("/staff/login");
        showToast({ kind: "error", text: r.message });
      } else if (okText) {
        showToast({ kind: "ok", text: okText.replace("{n}", String(r.servedNumber ?? "—")) });
      }
      await loadQueue();
      void loadStats();
      setTimeout(() => {
        busyRef.current = false;
        setBusy(false);
      }, 350);
      return r;
    },
    [loadQueue, loadStats, router, showToast],
  );

  const next = useCallback(() => act("/api/staff/queue/next", undefined, "Đã gọi số {n}"), [act]);
  const skip = useCallback(() => act("/api/staff/queue/skip", undefined, "Đã đánh dấu vắng mặt, gọi số {n}"), [act]);
  const undo = useCallback(() => act("/api/staff/queue/undo", undefined, "Đã hoàn tác"), [act]);

  const t = queue.tickets;
  const serving = t.find((x) => x.status === "SERVING") ?? null;
  const upcoming = useMemo(
    () => [
      ...t
        .filter((x) => x.status === "SKIPPED" && x.recalled)
        .sort((a, b) => (a.recalledAt ?? "").localeCompare(b.recalledAt ?? "")),
      ...t.filter((x) => x.status === "WAITING"),
    ],
    [t],
  );
  const missed = t.filter((x) => x.status === "SKIPPED" && !x.recalled);
  const expired = t.filter((x) => x.status === "EXPIRED").slice(-5).reverse();
  const recentDone = t
    .filter((x) => x.status === "DONE")
    .sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? ""))
    .slice(0, 5);

  const undoLeft = queue.undo ? Math.ceil((new Date(queue.undo.expiresAt).getTime() - now) / 1000) : 0;
  const canUndo = undoLeft > 0;

  // Phím tắt: Space/→ = Next, S = Vắng mặt, Ctrl+Z = Hoàn tác
  const anyDialog = manualOpen || !!confirmCancel;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (anyDialog || el.closest("input, textarea, select, [contenteditable=true]")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (canUndo) void undo();
      } else if (e.key === " " || e.key === "ArrowRight") {
        e.preventDefault();
        if (!e.repeat) void next();
      } else if (e.key.toLowerCase() === "s" && !e.ctrlKey && !e.metaKey && !e.repeat) {
        e.preventDefault();
        if (serving) void skip();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [anyDialog, canUndo, next, skip, undo, serving]);

  async function logout() {
    await apiSend("/api/staff/auth/logout");
    router.replace("/staff/login");
    router.refresh();
  }

  const displayHref = `/display/${queue.shop.slug}?key=${queue.shop.displayKey}`;
  const roleLabel = me.role === "OWNER" ? "Chủ tiệm" : "Nhân viên";

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16">
      <header className="flex flex-wrap items-center justify-between gap-2 py-4">
        <div>
          <h1 className="text-xl font-bold">{queue.shop.name}</h1>
          <p className="text-sm text-zinc-500">
            {roleLabel} · Ngày{" "}
            {queue.session.businessDate.split("-").reverse().join("/")}
          </p>
        </div>
        <nav className="flex flex-wrap items-center gap-1">
          <a
            href={displayHref}
            target="_blank"
            rel="noopener noreferrer"
            title="Mở màn hình tiệm ở tab mới để đưa sang màn hình phụ"
            className="inline-flex h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-medium hover:bg-zinc-100"
          >
            <Monitor className="h-4 w-4" /> Màn hình tiệm ↗
          </a>
          <a href={`/s/${queue.shop.slug}`} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-medium hover:bg-zinc-100">
            <ExternalLink className="h-4 w-4" /> Trang khách
          </a>
          {me.role === "OWNER" && (
            <Link href="/staff/settings" className="inline-flex h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-medium hover:bg-zinc-100">
              <Settings className="h-4 w-4" /> Cài đặt
            </Link>
          )}
          <Button variant="ghost" size="sm" onClick={logout}>
            <LogOut className="h-4 w-4" /> Đăng xuất
          </Button>
        </nav>
      </header>

      <ConnectionStatus connected={connected} lastUpdate={lastUpdate} className="mb-4 justify-start" />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* ĐANG CHỤP + NÚT */}
        <Card className={cn(serving && "ring-2 ring-emerald-500")}>
          <CardContent>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">Đang chụp</p>
                <p className="tabular text-8xl font-extrabold leading-none text-brand" data-testid="staff-current">
                  {serving?.number ?? "—"}
                </p>
                {serving && (
                  <p className="mt-2 text-lg">
                    <strong>{serving.name}</strong>
                    <span className="ml-2 text-zinc-500">{serving.phone ?? ""}</span>
                  </p>
                )}
              </div>
              {serving?.calledAt && (
                <div className="text-right">
                  <p className="text-sm text-zinc-500">Đã chụp</p>
                  <p className="tabular text-3xl font-bold">{fmtClock(now - new Date(serving.calledAt).getTime())}</p>
                </div>
              )}
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <Button
                size="xl"
                variant="success"
                className="col-span-2"
                onClick={next}
                disabled={busy || (!serving && upcoming.length === 0)}
                data-testid="btn-next"
              >
                {busy ? <Loader2 className="h-8 w-8 animate-spin" /> : <SkipForward className="h-8 w-8" />}
                NEXT
                {upcoming[0] && <span className="text-xl font-medium opacity-80">→ số {upcoming[0].number}</span>}
              </Button>
              <Button size="lg" variant="warning" onClick={skip} disabled={busy || !serving}>
                <UserX className="h-5 w-5" /> VẮNG MẶT
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="min-w-0 !whitespace-normal px-2 text-center text-base leading-tight sm:px-6 sm:text-lg"
                onClick={undo}
                disabled={busy || !canUndo}
              >
                <Undo2 className="h-5 w-5" />
                {canUndo ? `HOÀN TÁC ${ACTION_LABEL[queue.undo!.action] ?? ""} (${undoLeft}s)` : "HOÀN TÁC"}
              </Button>
            </div>
            <p className="mt-3 hidden text-xs text-zinc-400 sm:block">
              Phím tắt: <kbd>Space</kbd>/<kbd>→</kbd> Next · <kbd>S</kbd> Vắng mặt · <kbd>Ctrl+Z</kbd> Hoàn tác
            </p>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {/* MÃ NGÀY + TẠM DỪNG */}
          <Card>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-zinc-500">Mã ngày hiện tại</p>
                  <p className="tabular text-5xl font-extrabold tracking-[0.2em]" data-testid="staff-code">
                    {queue.session.checkinCode}
                  </p>
                  <p className="text-xs text-zinc-400">Đổi lúc {fmtTime(queue.session.codeUpdatedAt)}</p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => act("/api/staff/session/rotate-code", {}, "Đã đổi mã ngày")}
                  disabled={busy}
                >
                  <RefreshCw className="h-4 w-4" /> Đổi mã
                </Button>
              </div>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!/^\d{4}$/.test(customCode)) return showToast({ kind: "error", text: "Mã gồm đúng 4 chữ số" });
                  void act("/api/staff/session/rotate-code", { code: customCode }, "Đã đặt mã mới").then(() =>
                    setCustomCode(""),
                  );
                }}
              >
                <Input
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="Tự đặt mã 4 số"
                  value={customCode}
                  onChange={(e) => setCustomCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                />
                <Button type="submit" variant="secondary" disabled={busy}>
                  <KeyRound className="h-4 w-4" /> Đặt
                </Button>
              </form>
              {queue.shop.isPaused ? (
                <Button className="w-full" variant="success" onClick={() => act("/api/staff/session/resume", undefined, "Đã mở lại nhận số")} disabled={busy}>
                  <Play className="h-5 w-5" /> Mở lại nhận số
                </Button>
              ) : (
                <Button className="w-full" variant="secondary" onClick={() => act("/api/staff/session/pause", undefined, "Đã tạm dừng nhận số")} disabled={busy}>
                  <Pause className="h-5 w-5" /> Tạm dừng nhận số
                </Button>
              )}
              {queue.shop.isPaused && (
                <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                  Đang tạm dừng: khách không lấy số mới được. Bạn vẫn có thể thêm khách thủ công.
                </p>
              )}
            </CardContent>
          </Card>

          {/* THỐNG KÊ */}
          <Card>
            <CardHeader>
              <CardTitle>Hôm nay</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-3 text-center">
              <Stat label="Tổng vé" value={stats?.total} />
              <Stat label="Đã chụp" value={stats?.done} />
              <Stat label="Đang chờ" value={stats ? stats.waiting : undefined} />
              <Stat label="Gọi lỡ / mất lượt" value={stats ? `${stats.skipped}/${stats.expired}` : undefined} />
              <Stat label="Dự kiến chụp" value="15 phút" />
              <Stat label="Dự kiến chờ" value="10 phút" />
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* DANH SÁCH CHỜ */}
        <Card>
          <CardHeader>
            <CardTitle>Danh sách chờ ({upcoming.length})</CardTitle>
            <Button size="sm" onClick={() => setManualOpen(true)}>
              <UserPlus className="h-4 w-4" /> Thêm khách
            </Button>
          </CardHeader>
          <CardContent className="px-2 sm:px-5">
            {upcoming.length === 0 ? (
              <p className="py-6 text-center text-zinc-500">Chưa có khách nào đang chờ.</p>
            ) : (
              <ul className="divide-y divide-zinc-100" data-testid="waiting-list">
                {upcoming.map((x) => (
                  <li key={x.id} className="flex items-center gap-3 py-2.5">
                    <span className="tabular w-14 text-center text-2xl font-extrabold">{x.number}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {x.name}
                        {x.recalled && <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-700">Gọi lại</span>}
                        {x.source === "MANUAL" && <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">Thủ công</span>}
                      </p>
                      <p className="text-sm text-zinc-500" title={x.phone ?? undefined}>
                        {maskPhone(x.phone)} · lấy lúc {fmtTime(x.createdAt)} · chờ {fmtDuration((now - new Date(x.createdAt).getTime()) / 1000)}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" className="text-red-600" onClick={() => setConfirmCancel(x)}>
                      Huỷ
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {/* GỌI LỠ */}
          <Card>
            <CardHeader>
              <CardTitle>Đã gọi lỡ</CardTitle>
            </CardHeader>
            <CardContent className="px-2 sm:px-5">
              {missed.length === 0 && expired.length === 0 && (
                <p className="py-4 text-center text-zinc-500">Không có.</p>
              )}
              <ul className="divide-y divide-zinc-100">
                {missed.map((x) => (
                  <li key={x.id} className="flex items-center gap-3 py-2.5">
                    <span className="tabular w-14 text-center text-2xl font-extrabold text-red-600">{x.number}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{x.name}</p>
                      <p className="text-sm text-zinc-500">
                        {maskPhone(x.phone)} · còn <strong>{x.turnsLeft}</strong> lượt ân hạn
                      </p>
                    </div>
                    <Button size="sm" onClick={() => act(`/api/staff/tickets/${x.id}/recall`, undefined, `Đã gọi lại số ${x.number}`)} disabled={busy}>
                      GỌI LẠI
                    </Button>
                    <Button variant="ghost" size="sm" className="text-red-600" onClick={() => setConfirmCancel(x)}>
                      Huỷ
                    </Button>
                  </li>
                ))}
                {expired.map((x) => (
                  <li key={x.id} className="flex items-center gap-3 py-2 opacity-45">
                    <span className="tabular w-14 text-center text-xl font-bold">{x.number}</span>
                    <p className="flex-1 truncate">{x.name} · mất lượt</p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* VỪA CHỤP XONG */}
          <Card>
            <CardHeader>
              <CardTitle>Vừa chụp xong</CardTitle>
            </CardHeader>
            <CardContent className="px-2 sm:px-5">
              {recentDone.length === 0 ? (
                <p className="py-4 text-center text-zinc-500">Chưa có.</p>
              ) : (
                <ul className="divide-y divide-zinc-100 text-sm">
                  {recentDone.map((x) => (
                    <li key={x.id} className="flex items-center gap-3 py-2">
                      <span className="tabular w-14 text-center text-lg font-bold text-zinc-500">{x.number}</span>
                      <p className="flex-1 truncate">{x.name}</p>
                      <span className="text-zinc-500">
                        {fmtTime(x.doneAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <ManualAddDialog
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        onCreated={() => {
          void loadQueue();
          void loadStats();
        }}
      />

      <Dialog open={!!confirmCancel} onClose={() => setConfirmCancel(null)} title={`Huỷ số ${confirmCancel?.number ?? ""}?`}>
        <p className="text-zinc-600">
          Vé của <strong>{confirmCancel?.name}</strong> sẽ bị huỷ khỏi hàng đợi.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => setConfirmCancel(null)}>
            Không
          </Button>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() => {
              const x = confirmCancel;
              setConfirmCancel(null);
              if (x) void act(`/api/staff/tickets/${x.id}/cancel`, undefined, `Đã huỷ số ${x.number}`);
            }}
          >
            Huỷ vé
          </Button>
        </div>
      </Dialog>

      {toast && (
        <div
          role="status"
          className={cn(
            "fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-2xl px-5 py-3 font-medium text-white shadow-lg",
            toast.kind === "ok" ? "bg-zinc-900" : "bg-red-600",
          )}
        >
          {toast.text}
        </div>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number | string | undefined | null }) {
  return (
    <div className="rounded-xl bg-zinc-50 p-2">
      <p className="tabular text-xl font-bold">{value ?? "—"}</p>
      <p className="text-xs text-zinc-500">{label}</p>
    </div>
  );
}
