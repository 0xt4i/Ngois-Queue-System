"use client";

import { AlertTriangle, BellRing, CheckCircle2, Clock, Loader2, PartyPopper, QrCode, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConnectionStatus } from "@/components/ui/connection-status";
import { Dialog } from "@/components/ui/dialog";
import { apiGet, apiSend, clearTicketToken, saveTicketToken } from "@/lib/api-client";
import { fmtDuration } from "@/lib/format";
import { derivePosition, estimateWaitSeconds, NEAR_TURN_THRESHOLD } from "@/lib/position";
import type { QueueSnapshot, TicketStatus, TicketView } from "@/lib/types";
import { useQueueState } from "@/lib/use-queue-state";
import { cn } from "@/lib/utils";
import { ShopHeader } from "./shop-header";

const FINAL: TicketStatus[] = ["DONE", "EXPIRED", "CANCELLED"];

export function TicketTracker({ initialTicket, initialState }: { initialTicket: TicketView; initialState: QueueSnapshot }) {
  const router = useRouter();
  const [ticket, setTicket] = useState(initialTicket);
  const { snap, connected, lastUpdate } = useQueueState(ticket.shop.id, ticket.shop.slug, initialState);
  const fetchedVersion = useRef(initialState.version);
  const reloadedForVersion = useRef<number | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [ticketQr, setTicketQr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void import("qrcode").then(({ toDataURL }) =>
      toDataURL(`${window.location.origin}/t/${ticket.token}`, { margin: 1, width: 220 }).then((dataUrl) => {
        if (!cancelled) setTicketQr(dataUrl);
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [ticket.token]);

  useEffect(() => {
    if (ticket.isToday) saveTicketToken(ticket.shop.slug, ticket.token);
  }, [ticket.isToday, ticket.shop.slug, ticket.token]);

  const reloadTicket = useCallback(async () => {
    const r = await apiGet<{ ok: boolean; ticket: TicketView; state: QueueSnapshot }>(`/api/tickets/${ticket.token}`);
    if (r?.ok) {
      fetchedVersion.current = Math.max(fetchedVersion.current, r.state.version);
      setTicket(r.ticket);
    }
  }, [ticket.token]);

  const isFinal = FINAL.includes(ticket.status) || !ticket.isToday;
  const fresh = snap && snap.version >= fetchedVersion.current;
  const sameDay = snap?.businessDate === ticket.businessDate;
  const pos = !isFinal && fresh && sameDay ? derivePosition(snap, ticket.number) : null;

  // Snapshot cho thấy vé đã ra khỏi hàng / đổi trạng thái → tải lại chi tiết vé (1 lần mỗi version)
  useEffect(() => {
    if (isFinal || !snap || !fresh) return;
    const consistent =
      pos &&
      (pos.status === ticket.status || (pos.status === "WAITING" && ticket.status === "SKIPPED" && ticket.recalled));
    if (consistent && sameDay) return;
    if (reloadedForVersion.current === snap.version) return;
    reloadedForVersion.current = snap.version;
    void reloadTicket();
  }, [snap, fresh, sameDay, pos, isFinal, ticket.status, ticket.recalled, reloadTicket]);

  const status: TicketStatus = isFinal ? ticket.status : pos && pos.status !== "UNKNOWN" ? pos.status : ticket.status;

  // Rung khi tới lượt
  const prevStatus = useRef(status);
  useEffect(() => {
    if (status === "SERVING" && prevStatus.current !== "SERVING" && "vibrate" in navigator) {
      navigator.vibrate([400, 150, 400, 150, 400]);
    }
    prevStatus.current = status;
  }, [status]);

  const ahead = pos?.status === "WAITING" ? pos.ahead : null;
  const turnsLeft = pos?.status === "SKIPPED" ? pos.turnsLeft : ticket.turnsLeft;
  const recalled = pos?.status === "WAITING" && pos.recalled;

  async function cancel() {
    setCancelling(true);
    setCancelError(null);
    const r = await apiSend<{ ticket: TicketView }>(`/api/tickets/${ticket.token}/cancel`);
    setCancelling(false);
    if (!r.ok) return setCancelError(r.message);
    setTicket(r.ticket);
    setCancelOpen(false);
  }

  function newTicket() {
    clearTicketToken(ticket.shop.slug);
    router.push(`/${ticket.shop.slug}`);
  }

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-10">
      <ShopHeader shop={ticket.shop} />

      <section
        className={cn(
          "rounded-3xl bg-white p-6 text-center shadow-sm ring-1 ring-zinc-200 transition-colors",
          status === "SERVING" && "bg-emerald-50 ring-2 ring-emerald-500",
          isFinal && "opacity-90",
        )}
      >
        <p className="text-base text-zinc-500">Xin chào {ticket.name}, số của bạn là</p>
        <p
          className={cn(
            "tabular my-2 text-[8rem] font-extrabold leading-none text-brand",
            status === "SERVING" && "text-emerald-600",
            isFinal && "text-zinc-400",
          )}
          data-testid="my-number"
        >
          {ticket.number}
        </p>

        {!isFinal && snap && (
          <div className="mt-4 space-y-1">
            <p className="text-lg">
              Đang chụp:{" "}
              <strong className="tabular text-2xl" data-testid="current-number">
                {snap.currentNumber != null ? `số ${snap.currentNumber}` : "chưa có"}
              </strong>
            </p>
            {ahead != null && (
              <p className="text-lg" data-testid="ahead">
                {ahead === 0 ? (
                  <strong>Bạn là lượt kế tiếp!</strong>
                ) : (
                  <>
                    Còn <strong className="tabular text-2xl text-brand">{ahead}</strong> lượt nữa tới bạn
                  </>
                )}
              </p>
            )}
            {ahead != null && ahead > 0 && (
              <p className="flex items-center justify-center gap-1.5 text-zinc-600">
                <Clock className="h-4 w-4" />
                Khoảng ~{fmtDuration(estimateWaitSeconds(ahead, snap))}
                <span className="text-sm text-zinc-400">(chỉ là ước tính)</span>
              </p>
            )}
          </div>
        )}
      </section>

      <div className="mt-4">
        <StatusBanner
          status={status}
          ahead={ahead}
          turnsLeft={turnsLeft}
          recalled={!!recalled}
          isToday={ticket.isToday}
          businessDate={ticket.businessDate}
          shopName={ticket.shop.name}
        />
      </div>

      {!isFinal && <ConnectionStatus connected={connected} lastUpdate={lastUpdate} className="mt-4" />}

      <div className="mt-6 space-y-3">
        <section className="rounded-3xl bg-white p-5 text-center shadow-sm ring-1 ring-zinc-200">
          <div className="flex items-center justify-center gap-2 font-semibold">
            <QrCode className="h-5 w-5 text-brand" /> QR vé của bạn
          </div>
          {ticketQr ? (
            // eslint-disable-next-line @next/next/no-img-element -- QR được tạo ở trình duyệt
            <img src={ticketQr} alt="QR để mở lại vé" className="mx-auto mt-3 h-44 w-44" />
          ) : (
            <p className="mt-3 text-sm text-zinc-500">Đang tạo QR…</p>
          )}
          <p className="mt-2 text-sm text-zinc-500">Chụp màn hình QR này để mở lại vé khi cần.</p>
        </section>
        {isFinal ? (
          <Button size="lg" className="w-full" onClick={newTicket}>
            Lấy số mới
          </Button>
        ) : (
          (status === "WAITING" || status === "SKIPPED") && (
            <Button variant="outline" className="w-full" onClick={() => setCancelOpen(true)}>
              Huỷ số
            </Button>
          )
        )}
        {!isFinal && (
          <p className="text-center text-sm text-zinc-500">
            Bạn có thể đi dạo và mở lại trang này bất cứ lúc nào — trang tự cập nhật. Hãy lưu lại link hoặc
            &quot;Thêm vào màn hình chính&quot;.
          </p>
        )}
      </div>

      <Dialog open={cancelOpen} onClose={() => setCancelOpen(false)} title="Huỷ số của bạn?">
        <p className="text-zinc-600">
          Số <strong>{ticket.number}</strong> sẽ bị huỷ và không thể khôi phục. Muốn chụp lại bạn sẽ phải lấy số mới.
        </p>
        {cancelError && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{cancelError}</p>}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => setCancelOpen(false)}>
            Giữ số
          </Button>
          <Button variant="destructive" onClick={cancel} disabled={cancelling}>
            {cancelling && <Loader2 className="h-5 w-5 animate-spin" />}
            Huỷ số
          </Button>
        </div>
      </Dialog>
    </main>
  );
}

function StatusBanner(props: {
  status: TicketStatus;
  ahead: number | null;
  turnsLeft: number | null;
  recalled: boolean;
  isToday: boolean;
  businessDate: string;
  shopName: string;
}) {
  const { status, ahead, turnsLeft, recalled } = props;
  const base = "flex items-start gap-3 rounded-2xl p-4 text-base";

  if (!props.isToday) {
    const [y, m, d] = props.businessDate.split("-");
    return (
      <div className={cn(base, "bg-zinc-100 text-zinc-700")} role="status">
        <XCircle className="mt-0.5 h-6 w-6 shrink-0" />
        <p>
          Số này là của ngày {d}/{m}/{y} nên đã hết hiệu lực. Bạn hãy lấy số mới nhé.
        </p>
      </div>
    );
  }
  switch (status) {
    case "SERVING":
      return (
        <div className={cn(base, "bg-emerald-600 text-white shadow-lg")} role="alert" data-testid="banner-serving">
          <BellRing className="mt-0.5 h-7 w-7 shrink-0 animate-bounce" />
          <div>
            <p className="text-xl font-bold">Tới lượt bạn!</p>
            <p>Mời bạn vào phòng chụp ngay nhé.</p>
          </div>
        </div>
      );
    case "SKIPPED":
      return (
        <div className={cn(base, "bg-red-600 text-white")} role="alert">
          <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0" />
          <div>
            <p className="font-bold">Bạn đã bị gọi qua lượt.</p>
            <p>
              {turnsLeft && turnsLeft > 0
                ? `Hãy tới quầy trong vòng ${turnsLeft} lượt nữa để được hỗ trợ.`
                : "Hãy tới quầy ngay — đây là lượt ân hạn cuối cùng."}
            </p>
          </div>
        </div>
      );
    case "WAITING":
      if (recalled) {
        return (
          <div className={cn(base, "bg-sky-600 text-white")} role="alert">
            <BellRing className="mt-0.5 h-6 w-6 shrink-0" />
            <p className="font-semibold">Nhân viên đã gọi lại số của bạn — bạn được chụp ở lượt kế tiếp.</p>
          </div>
        );
      }
      if (ahead != null && ahead <= NEAR_TURN_THRESHOLD) {
        return (
          <div className={cn(base, "bg-amber-400 text-zinc-950")} role="alert" data-testid="banner-near">
            <BellRing className="mt-0.5 h-6 w-6 shrink-0" />
            <p className="font-semibold">Sắp tới lượt — hãy quay lại tiệm!</p>
          </div>
        );
      }
      return (
        <div className={cn(base, "bg-zinc-100 text-zinc-700")} role="status">
          <Clock className="mt-0.5 h-6 w-6 shrink-0" />
          <p>Bạn đang trong hàng chờ. Còn khoảng {NEAR_TURN_THRESHOLD} lượt thì nên quay lại tiệm nhé.</p>
        </div>
      );
    case "DONE":
      return (
        <div className={cn(base, "bg-emerald-50 text-emerald-800")} role="status">
          <PartyPopper className="mt-0.5 h-6 w-6 shrink-0" />
          <p>Cảm ơn bạn đã chụp ảnh tại {props.shopName}! Hẹn gặp lại 💖</p>
        </div>
      );
    case "EXPIRED":
      return (
        <div className={cn(base, "bg-zinc-100 text-zinc-700")} role="status">
          <XCircle className="mt-0.5 h-6 w-6 shrink-0" />
          <p>Số của bạn đã hết hiệu lực vì quá lượt. Bạn có thể lấy số mới (cần mã ngày tại quầy).</p>
        </div>
      );
    case "CANCELLED":
      return (
        <div className={cn(base, "bg-zinc-100 text-zinc-700")} role="status">
          <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0" />
          <p>Bạn đã huỷ số này.</p>
        </div>
      );
  }
}
