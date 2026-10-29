"use client";

import { Copy, Download, Loader2, Printer, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError, Input, Label, Select } from "@/components/ui/input";
import { apiSend } from "@/lib/api-client";

export interface SettingsValues {
  name: string;
  slug: string;
  logoUrl: string;
  primaryColor: string;
  graceTurns: number;
  defaultServiceMinutes: number;
  dayResetTime: string;
  codeMode: "AUTO" | "MANUAL";
  codeRotateHours: number;
  phoneRetentionDays: number;
  displayKey: string;
}

export function SettingsForm({ initial, baseUrl, today }: { initial: SettingsValues; baseUrl: string; today: string }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [exportDate, setExportDate] = useState(today);

  const set = <K extends keyof SettingsValues>(k: K, val: SettingsValues[K]) => setV((s) => ({ ...s, [k]: val }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setMsg(null);
    const { displayKey: _ignored, ...body } = v;
    const r = await apiSend<{ settings: SettingsValues }>("/api/staff/settings", body, { method: "PUT" });
    setBusy(false);
    if (!r.ok) {
      if (r.fields) setErrors(r.fields);
      return setMsg({ ok: false, text: r.message });
    }
    setV(r.settings);
    setSaved(r.settings);
    setMsg({ ok: true, text: "Đã lưu cài đặt." });
    router.refresh();
  }

  async function rotateDisplayKey() {
    if (!confirm("Tạo khoá màn hình mới? Link màn hình cũ sẽ ngừng hoạt động, bạn cần mở lại link mới trên TV.")) return;
    const r = await apiSend<{ displayKey: string }>("/api/staff/settings", undefined, { method: "POST" });
    if (r.ok) {
      setV((s) => ({ ...s, displayKey: r.displayKey }));
      setSaved((s) => ({ ...s, displayKey: r.displayKey }));
    }
  }

  const customerLink = `${baseUrl}/s/${saved.slug}`;
  const displayLink = `${baseUrl}/display/${saved.slug}?key=${saved.displayKey}`;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Thông tin & quy tắc</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="grid gap-4 sm:grid-cols-2" noValidate>
            <Field label="Tên tiệm" error={errors.name}>
              <Input value={v.name} onChange={(e) => set("name", e.target.value)} />
            </Field>
            <Field label="Slug (đường dẫn /s/…)" error={errors.slug}>
              <Input value={v.slug} onChange={(e) => set("slug", e.target.value.toLowerCase())} />
            </Field>
            <Field label="Logo (URL ảnh, tuỳ chọn)" error={errors.logoUrl}>
              <Input value={v.logoUrl} placeholder="https://…" onChange={(e) => set("logoUrl", e.target.value)} />
            </Field>
            <Field label="Màu chủ đạo" error={errors.primaryColor}>
              <div className="flex gap-2">
                <input
                  type="color"
                  aria-label="Chọn màu"
                  value={v.primaryColor}
                  onChange={(e) => set("primaryColor", e.target.value)}
                  className="h-12 w-14 cursor-pointer rounded-xl border border-zinc-300"
                />
                <Input value={v.primaryColor} onChange={(e) => set("primaryColor", e.target.value)} />
              </div>
            </Field>
            <Field label="Số lượt ân hạn khi gọi lỡ" error={errors.graceTurns} hint="Khách quay lại trong N lượt vẫn được chụp. Mặc định 2.">
              <Input type="number" min={0} max={20} value={v.graceTurns} onChange={(e) => set("graceTurns", Number(e.target.value))} />
            </Field>
            <Field label="Thời gian chụp mặc định (phút)" error={errors.defaultServiceMinutes} hint="Dùng ước lượng thời gian chờ khi chưa đủ dữ liệu.">
              <Input type="number" min={1} max={180} value={v.defaultServiceMinutes} onChange={(e) => set("defaultServiceMinutes", Number(e.target.value))} />
            </Field>
            <Field label="Giờ reset số mỗi ngày" error={errors.dayResetTime} hint="Sau giờ này số bắt đầu lại từ 1.">
              <Input type="time" value={v.dayResetTime} onChange={(e) => set("dayResetTime", e.target.value)} />
            </Field>
            <Field label="Mã ngày" error={errors.codeMode}>
              <Select value={v.codeMode} onChange={(e) => set("codeMode", e.target.value as "AUTO" | "MANUAL")}>
                <option value="AUTO">Tự sinh mã mới mỗi ngày</option>
                <option value="MANUAL">Nhân viên tự đặt (giữ mã cũ qua ngày)</option>
              </Select>
            </Field>
            <Field
              label="Tự đổi mã mỗi N giờ"
              error={errors.codeRotateHours}
              hint="Mã cũng tự đổi ngay sau mỗi lượt nhận số. Đặt 0 để tắt đổi theo giờ."
            >
              <Input type="number" min={0} max={24} value={v.codeRotateHours} onChange={(e) => set("codeRotateHours", Number(e.target.value))} />
            </Field>
            <Field label="Tự xoá SĐT khách sau (ngày)" error={errors.phoneRetentionDays}>
              <Input type="number" min={1} max={3650} value={v.phoneRetentionDays} onChange={(e) => set("phoneRetentionDays", Number(e.target.value))} />
            </Field>
            <div className="sm:col-span-2">
              {msg && <p className={msg.ok ? "mb-3 text-emerald-700" : "mb-3 text-red-600"}>{msg.text}</p>}
              <Button type="submit" disabled={busy}>
                {busy && <Loader2 className="h-5 w-5 animate-spin" />}
                Lưu cài đặt
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Link, QR & màn hình tiệm</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <LinkRow label="Link cho khách (in thành QR ở quầy)" value={customerLink} />
          <LinkRow label="Link màn hình tiệm (mở trên TV — giữ bí mật)" value={displayLink} />
          <div className="flex flex-wrap gap-2">
            <a href="/staff/print" target="_blank" rel="noreferrer" className="inline-flex h-12 items-center gap-2 rounded-xl bg-brand px-5 font-semibold text-white">
              <Printer className="h-5 w-5" /> In QR khổ A5
            </a>
            <Button variant="outline" onClick={rotateDisplayKey}>
              <RefreshCw className="h-4 w-4" /> Tạo khoá màn hình mới
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Xuất danh sách vé (CSV)</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor="exp-date">Ngày</Label>
            <Input id="exp-date" type="date" value={exportDate} max={today} onChange={(e) => setExportDate(e.target.value)} />
          </div>
          <a
            href={`/api/staff/export.csv?date=${exportDate}`}
            className="inline-flex h-12 items-center gap-2 rounded-xl border border-zinc-300 bg-white px-5 font-semibold hover:bg-zinc-50"
          >
            <Download className="h-5 w-5" /> Tải CSV
          </a>
        </CardContent>
      </Card>
    </>
  );
}

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
      <FieldError>{error}</FieldError>
    </div>
  );
}

function LinkRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input readOnly value={value} onFocus={(e) => e.target.select()} />
        <Button
          variant="outline"
          size="icon"
          aria-label="Sao chép"
          onClick={() => {
            void navigator.clipboard.writeText(value).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          <Copy className="h-4 w-4" />
        </Button>
      </div>
      {copied && <p className="mt-1 text-xs text-emerald-700">Đã sao chép</p>}
    </div>
  );
}
