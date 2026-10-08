"use client";
import { useCallback, useEffect, useState } from "react";
import { usePanelPreferences } from "@/components/panel-preferences";
import { defaultDashboard, validDashboardPreferences, type DashboardPreferences } from "@/lib/dashboard";
import { fetchJson, errorMessage } from "@/lib/fetch-json";
import { wordpressRuntime } from "@/lib/runtime";

const defaults = { ...defaultDashboard, widget_enabled: Boolean(wordpressRuntime()) };

export function useDashboardPreferences() {
  const { access, accessLoaded } = usePanelPreferences();
  const identity = access?.user || access?.role || "admin";
  const key = `wooops:dashboard:${identity}`;
  const [preferences, setPreferences] = useState<DashboardPreferences>(defaults);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion(value => value + 1), []);
  useEffect(() => {
    if (!accessLoaded) return;
    const controller = new AbortController();
    queueMicrotask(async () => {
      if (controller.signal.aborted) return;
      setLoaded(false); setError("");
      try {
        const value = wordpressRuntime()
          ? await fetchJson<DashboardPreferences>("/api/dashboard/preferences", { signal: controller.signal })
          : JSON.parse(localStorage.getItem(key) || "null");
        if (!controller.signal.aborted) { setPreferences(validDashboardPreferences(value) ? value : defaults); setLoaded(true); }
      } catch (cause) { if (!controller.signal.aborted) setError(errorMessage(cause, "Could not load dashboard preferences.")); }
    });
    return () => controller.abort();
  }, [accessLoaded, key, version]);
  useEffect(() => {
    window.addEventListener("wooops:dashboard-changed", reload);
    return () => window.removeEventListener("wooops:dashboard-changed", reload);
  }, [reload]);
  async function save(value: DashboardPreferences) {
    if (!loaded || !validDashboardPreferences(value)) throw new Error("Choose between one and four unique cards.");
    if (wordpressRuntime()) await fetchJson("/api/dashboard/preferences", { method: "PUT", json: value });
    else localStorage.setItem(key, JSON.stringify({ ...value, widget_enabled: false }));
    setPreferences(value);
    window.dispatchEvent(new Event("wooops:dashboard-changed"));
  }
  return { preferences, loaded, error, save, reload };
}
