"use client";

import { FormEvent, useState } from "react";
import { Loader2, LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { usePanelPreferences } from "@/components/panel-preferences";

export default function LoginPage() {
  const { preferences } = usePanelPreferences();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      if (response.ok) { router.replace("/"); return; }
      setError(response.status === 401 ? "Incorrect password." : "Sign-in is unavailable. Check the WooOps server configuration.");
    } catch {
      setError("Could not reach WooOps. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return <main className="grid min-h-screen place-items-center bg-muted/30 p-6">
    <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border bg-background p-7 shadow-sm">
      <div className="grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground"><LockKeyhole className="size-5" aria-hidden="true" /></div>
      <h1 className="mt-6 break-words text-2xl font-semibold">{preferences.name}</h1>
      <p className="mt-1 text-sm text-muted-foreground">Sign in to your store operations panel.</p>
      <label className="mt-6 block text-sm font-medium">Admin password
        <input autoFocus type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} className="mt-2 h-11 w-full rounded-lg border bg-background px-3 outline-none focus:ring-2 focus:ring-ring" />
      </label>
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      <button disabled={loading} className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground disabled:opacity-50">{loading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}Sign in</button>
    </form>
  </main>;
}
