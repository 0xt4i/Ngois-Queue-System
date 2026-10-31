"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FieldError, Input, Label } from "@/components/ui/input";
import { apiSend } from "@/lib/api-client";
import type { TicketView } from "@/lib/types";
import { useI18n } from "@/lib/i18n";

/** Thêm khách thủ công (khách không có điện thoại / lớn tuổi) → hiện số + QR để khách theo dõi nếu muốn. */
export function ManualAddDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ ticket: TicketView; existing: boolean } | null>(null);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setName("");
      setPhone("");
      setErrors({});
      setError(null);
      setCreated(null);
      setQr(null);
    }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setError(null);
    const r = await apiSend<{ ticket: TicketView; existing: boolean }>("/api/staff/tickets", { name, phone }, { idempotent: true });
    setBusy(false);
    if (!r.ok) {
      if (r.fields) setErrors(r.fields);
      else setError(r.message);
      return;
    }
    setCreated({ ticket: r.ticket, existing: r.existing });
    onCreated();
    const { toDataURL } = await import("qrcode");
    setQr(await toDataURL(`${window.location.origin}/t/${r.ticket.token}`, { margin: 1, width: 240 }));
  }

  return (
    <Dialog open={open} onClose={onClose} title={created ? t("ticketNumber") : t("addCustomer")}>
      {created ? (
        <div className="text-center">
          {created.existing && (
            <p className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
              {t("existingTicket")}
            </p>
          )}
          <p className="text-zinc-500">{created.ticket.name}</p>
          <p className="tabular text-9xl font-extrabold leading-none text-brand">{created.ticket.number}</p>
          {qr && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- data URL */}
              <img src={qr} alt="Ticket QR code" className="mx-auto mt-4 h-48 w-48" />
              <p className="mt-1 text-sm text-zinc-500">{t("scanToTrack")}</p>
            </>
          )}
          <Button className="mt-5 w-full" onClick={onClose}>
            {t("done")}
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div>
            <Label htmlFor="m-name">{t("customerName")}</Label>
            <Input id="m-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            <FieldError>{errors.name}</FieldError>
          </div>
          <div>
            <Label htmlFor="m-phone">{t("phoneOptional")}</Label>
            <Input id="m-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <FieldError>{errors.phone}</FieldError>
          </div>
          {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Loader2 className="h-5 w-5 animate-spin" />}
            {t("issueTicket")}
          </Button>
        </form>
      )}
    </Dialog>
  );
}
