"use client";

import { Loader2, PauseCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConnectionStatus } from "@/components/ui/connection-status";
import { FieldError, Input, Label } from "@/components/ui/input";
import { apiGet, apiSend, clearTicketToken, loadTicketToken, saveTicketToken } from "@/lib/api-client";
import type { PublicShop, QueueSnapshot, TicketView } from "@/lib/types";
import { useQueueState } from "@/lib/use-queue-state";
import { useI18n } from "@/lib/i18n";
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
  const { t } = useI18n();
  const router = useRouter();
  const { snap, connected, lastUpdate } = useQueueState(shop.id, shop.slug, initialState);
  const [checking, setChecking] = useState(true);
  const [form, setForm] = useState({ code: "", name: "", phone: "" });
  const [errors, setErrors] = useState<Fields>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Thiết bị đã có vé hôm nay → vào thẳng trang theo dõi vé
  useEffect(() => {
    const token = loadTicketToken(shop.slug);
    setForm((f) => ({ ...f, code: initialCode ?? f.code }));
    try {
      const p = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? "{}") as { name?: string; phone?: string };
      setForm((f) => ({ ...f, name: p.name ?? "", phone: "" }));
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
  }, [initialCode, shop.slug, router]);

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
      localStorage.setItem(PROFILE_KEY, JSON.stringify({ name: form.name }));
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
            <Loader2 className="h-5 w-5 animate-spin" /> {t("checkingTicket")}
          </div>
        ) : paused ? (
          <div className="py-8 text-center">
            <PauseCircle className="mx-auto h-12 w-12 text-amber-500" />
            <h2 className="mt-3 text-xl font-bold">{t("pausedTitle")}</h2>
            <p className="mt-2 text-zinc-600">{t("pausedText")}</p>
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <h2 className="text-xl font-bold">{t("takeTicket")}</h2>
            <p className="mt-1 text-zinc-600">
              {form.code ? t("codeAutoHint") : t("codeHint")}
            </p>

            <div className="mt-5 space-y-4">
              {!form.code && (
                <div>
                  <Label htmlFor="code">{t("dailyCode")}</Label>
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
                <Label htmlFor="name">{t("yourName")}</Label>
                <Input
                  id="name"
                  autoComplete="name"
                  placeholder={t("namePlaceholder")}
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
              {t("getTicket")}
            </Button>
          </form>
        )}
      </section>

    </main>
  );
}
