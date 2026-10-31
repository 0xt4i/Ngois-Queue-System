"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError, Input, Label, Select } from "@/components/ui/input";
import { apiGet, apiSend } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";

interface UserRow {
  id: string;
  username: string;
  display_name: string;
  role: "OWNER" | "STAFF";
  is_active: boolean;
}

export function UsersManager() {
  const { t } = useI18n();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [form, setForm] = useState({ username: "", displayName: "", password: "", role: "STAFF" as "OWNER" | "STAFF" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await apiGet<{ users: UserRow[]; me: string }>("/api/staff/users");
    if (r) {
      setUsers(r.users);
      setMe(r.me);
    }
  }, []);
  useEffect(() => void load(), [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setMsg(null);
    const r = await apiSend("/api/staff/users", form);
    setBusy(false);
    if (!r.ok) {
      if (r.fields) setErrors(r.fields);
      return setMsg({ ok: false, text: r.message });
    }
    setForm({ username: "", displayName: "", password: "", role: "STAFF" });
    setMsg({ ok: true, text: t("createAccount") });
    void load();
  }

  async function update(id: string, patch: Record<string, unknown>, okText: string) {
    const r = await apiSend(`/api/staff/users/${id}`, patch, { method: "PATCH" });
    setMsg(r.ok ? { ok: true, text: okText } : { ok: false, text: r.message });
    void load();
  }

  async function remove(u: UserRow) {
    if (!confirm(`${t("cancel")} account "${u.username}"?`)) return;
    const r = await apiSend(`/api/staff/users/${u.id}`, undefined, { method: "DELETE" });
    setMsg(r.ok ? { ok: true, text: t("cancel") } : { ok: false, text: r.message });
    void load();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("accounts")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <ul className="divide-y divide-zinc-100">
          {users.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-2 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {u.display_name || u.username}{" "}
                  <span className="text-sm text-zinc-500">@{u.username}</span>
                  {u.id === me && <span className="ml-2 text-xs text-zinc-400">(bạn)</span>}
                </p>
                <p className="text-sm text-zinc-500">
                  {u.role === "OWNER" ? t("owner") : t("staff")} · {u.is_active ? t("active") : t("locked")}
                </p>
              </div>
              {u.id !== me && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const pw = prompt(`New password for ${u.username} (minimum 6 characters):`);
                      if (pw) void update(u.id, { password: pw }, t("changePassword"));
                    }}
                  >
                    Đổi mật khẩu
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => update(u.id, { isActive: !u.is_active }, u.is_active ? "Đã khoá tài khoản." : "Đã mở khoá.")}
                  >
                    {u.is_active ? t("lock") : t("unlock")}
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="Xoá" className="text-red-600" onClick={() => remove(u)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>

        <form onSubmit={create} className="grid gap-3 rounded-2xl bg-zinc-50 p-4 sm:grid-cols-2" noValidate>
          <p className="font-semibold sm:col-span-2">{t("addAccount")}</p>
          <div>
            <Label htmlFor="u-username">Tên đăng nhập</Label>
            <Input id="u-username" autoCapitalize="none" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            <FieldError>{errors.username}</FieldError>
          </div>
          <div>
            <Label htmlFor="u-name">{t("displayName")}</Label>
            <Input id="u-name" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="u-pw">Mật khẩu</Label>
            <Input id="u-pw" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <FieldError>{errors.password}</FieldError>
          </div>
          <div>
            <Label htmlFor="u-role">{t("role")}</Label>
            <Select id="u-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as "OWNER" | "STAFF" })}>
              <option value="STAFF">{t("staff")}</option>
              <option value="OWNER">{t("owner")}</option>
            </Select>
          </div>
          <div className="sm:col-span-2">
            {msg && <p className={msg.ok ? "mb-2 text-emerald-700" : "mb-2 text-red-600"}>{msg.text}</p>}
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="h-5 w-5 animate-spin" />}
              {t("createAccount")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
