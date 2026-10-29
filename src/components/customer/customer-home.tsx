"use client";

import { Loader2, PauseCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConnectionStatus } from "@/components/ui/connection-status";
import { Dialog } from "@/components/ui/dialog";
import { FieldError, Input, Label } from "@/components/ui/input";
import { apiGet, apiSend, clearTicketToken, loadTicketToken, saveTicketToken } from "@/lib/api-client";
import type { PublicShop, QueueSnapshot, TicketView } from "@/lib/types";
import { useQueueState } from "@/lib/use-queue-state";
import { LiveSummary } from "./live-summary";
import { ShopHeader } from "./shop-header";

const ACTIVE = ["WAITING", "SERVING", "SKIPPED"];
const PROFILE_KEY = "pb_profile";

type Fields = Record<string, string>;

export function CustomerHome({
  shop,
  initialState,
  initialCode,
}: {
  shop: PublicShop;
  initialState: QueueSnapshot;
  initialCode?: string;
}) {
  const router = useRouter();
  const { snap, connected, lastUpdate } = useQueueState(shop.id, shop.slug, initialState);
  const [checking, setChecking] = useState(true);
  const [form, setForm] = useState({ code: "", name: "", phone: "" });
  const [errors, setErrors] = useState<Fields>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lookupOpen, setLookupOpen] = useState(false);

  // Thiết bị đã có vé hôm nay → vào thẳng trang theo dõi vé
  useEffect(() => {
    const token = loadTicketToken(shop.slug);
    try {
      const p = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? "{}") as { name?: string; phone?: string };
      setForm((f) => ({ ...f, code: initialCode ?? f.code, name: p.name ?? "", phone: p.phone ?? "" }));
    } catch {
      /* ignore */
    }
    if (!token) {
      setChecking(false);
      return;
    }
    void apiGet<{ ok: boolean; ticket: TicketView }>(`/api/tickets/${token}`).then((r) => {
      if (r?.ok && r.ticket.isToday && ACTIVE.includes(r.ticket.status)) {
        router.replace(`/t/${token}`);
      } else {
        clearTicketToken(shop.slug);
        setChecking(false);
      }
    });
  }, [shop.slug, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setErrors({});
    setFormError(null);
    const r = await apiSend<{ token: string; ticket: TicketView }>(`/api/shops/${shop.slug}/tickets`, form);
    if (!r.ok) {
      setSubmitting(false);
      if (r.fields) setErrors(r.fields);
      else if (r.error === "BAD_CODE") setErrors({ code: r.message });
      else setFormError(r.message);
      return;
    }
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify({ name: form.name, phone: form.phone }));
    } catch {
      /* ignore */
    }
    saveTicketToken(shop.slug, r.token);
    router.push(`/t/${r.token}`);
  }

  const paused = snap?.isPaused ?? false;

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-10">
      <ShopHeader shop={shop} />
      <LiveSummary snap={snap} />
      <ConnectionStatus connected={connected} lastUpdate={lastUpdate} className="mt-3" />

      <section className="mt-6 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        {checking ? (
          <div className="flex items-center justify-center gap-2 py-10 text-zinc-500">
            <Loader2 className="h-5 w-5 animate-spin" /> Đang kiểm tra số của bạn…
          </div>
        ) : paused ? (
          <div className="py-8 text-center">
            <PauseCircle className="mx-auto h-12 w-12 text-amber-500" />
            <h2 className="mt-3 text-xl font-bold">Tiệm tạm ngưng nhận số</h2>
            <p className="mt-2 text-zinc-600">Bạn vui lòng quay lại sau ít phút, hoặc hỏi nhân viên tại quầy nhé.</p>
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <h2 className="text-xl font-bold">Lấy số thứ tự</h2>
            <p className="mt-1 text-zinc-600">
              {form.code ? "Mã ngày đã được điền tự động. Bạn chỉ cần nhập tên." : "Nhập mã ngày đang hiện trên màn hình tại quầy."}
            </p>

            <div className="mt-5 space-y-4">
              {!form.code && (
                <div>
                  <Label htmlFor="code">Mã ngày (4 số)</Label>
                  <Input
                    id="code"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="off"
                    maxLength={4}
                    placeholder="••••"
                    className="tabular h-16 text-center text-3xl font-bold tracking-[0.5em]"
                    value={form.code}
                    aria-invalid={!!errors.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                  />
                  <FieldError>{errors.code}</FieldError>
                </div>
              )}
              <div>
                <Label htmlFor="name">Tên của bạn</Label>
                <Input
                  id="name"
                  autoComplete="name"
                  placeholder="VD: Ngọc Anh"
                  maxLength={60}
                  value={form.name}
                  aria-invalid={!!errors.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
                <FieldError>{errors.name}</FieldError>
              </div>
            </div>

            {formError && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{formError}</p>}

            <Button type="submit" size="lg" className="mt-6 w-full" disabled={submitting}>
              {submitting && <Loader2 className="h-5 w-5 animate-spin" />}
              Nhận số
            </Button>
          </form>
        )}
      </section>

      {!checking && (
        <p className="mt-6 text-center">
          <button
            type="button"
            className="min-h-11 font-medium text-brand underline underline-offset-4"
            onClick={() => setLookupOpen(true)}
          >
            Đã có số? Tra cứu bằng số điện thoại
          </button>
        </p>
      )}

      <LookupDialog
        open={lookupOpen}
        onClose={() => setLookupOpen(false)}
        slug={shop.slug}
        defaultPhone={form.phone}
        onFound={(token) => {
          saveTicketToken(shop.slug, token);
          router.push(`/t/${token}`);
        }}
      />
    </main>
  );
}

function LookupDialog({
  open,
  onClose,
  slug,
  defaultPhone,
  onFound,
}: {
  open: boolean;
  onClose: () => void;
  slug: string;
  defaultPhone: string;
  onFound: (token: string) => void;
}) {
  const [phone, setPhone] = useState(defaultPhone);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setPhone((p) => p || defaultPhone);
  }, [open, defaultPhone]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await apiSend<{ token: string }>(`/api/shops/${slug}/tickets/lookup`, { phone, code });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    onFound(r.token);
  }

  return (
    <Dialog open={open} onClose={onClose} title="Tra cứu số của bạn">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="lk-phone">Số điện thoại đã dùng khi lấy số</Label>
          <Input id="lk-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="lk-code">Mã ngày trên màn hình tại quầy</Label>
          <Input
            id="lk-code"
            inputMode="numeric"
            maxLength={4}
            className="tabular text-center text-2xl font-bold tracking-[0.4em]"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
          />
        </div>
        {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy && <Loader2 className="h-5 w-5 animate-spin" />}
          Tìm số của tôi
        </Button>
      </form>
    </Dialog>
  );
}
