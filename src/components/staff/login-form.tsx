"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { apiSend } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";

export function LoginForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await apiSend("/api/staff/auth/login", { username, password });
    if (!r.ok) {
      setBusy(false);
      return setError(r.message);
    }
    router.replace("/staff");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-4 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
      <div>
        <Label htmlFor="username">{t("username")}</Label>
        <Input
          id="username"
          autoComplete="username"
          autoCapitalize="none"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="password">{t("password")}</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={busy || !username || !password}>
        {busy && <Loader2 className="h-5 w-5 animate-spin" />}
        {t("login")}
      </Button>
    </form>
  );
}
