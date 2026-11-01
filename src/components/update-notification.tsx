"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePanelPreferences } from "@/components/panel-preferences";
import { Notice } from "@/components/ui/feedback";
import { useRemote } from "@/lib/use-remote";
import type { UpdateInfo } from "@/lib/updates";

/** A quiet, dismissible notification for published newer standalone releases. */
export function UpdateNotification() {
  const { can, access } = usePanelPreferences();
  const { data } = useRemote<UpdateInfo>(can("settings.view") ? "/api/updates?check=1" : null, "Could not check for updates.");
  const [hidden, setHidden] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const key = `wooops:update-dismissed:${access?.user || access?.role || "admin"}`;
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try { setHidden(localStorage.getItem(key)); } catch { /* Session dismissal still works. */ }
      setReady(true);
    });
    return () => { active = false; };
  }, [key]);
  if (!ready || data?.status !== "update_available" || !data.latest_version || hidden === data.latest_version) return null;
  return <div className="mb-5 print:hidden"><Notice tone="info" action={<button type="button" className="rounded border px-3 py-1 text-sm" onClick={() => { setHidden(data.latest_version); try { localStorage.setItem(key, data.latest_version!); } catch { /* Dismiss for this session. */ } }}>Dismiss</button>}>
    WooOps {data.latest_version} is available. <Link href="/settings" className="underline">Open Settings → Updates</Link> for release information and installation steps.
  </Notice></div>;
}
