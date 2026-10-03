"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { wordpressRuntime } from "@/lib/runtime";
import { useRemote } from "@/lib/use-remote";

export type PanelPreferences = { name: string; theme: "system" | "light" | "dark" };
// The WordPress plugin ships under its own name; the standalone app keeps WooOps.
const defaults: PanelPreferences = { name: wordpressRuntime() ? "KartoDesk" : "WooOps", theme: "system" };
const Context = createContext<{ timeZone: string; canWrite: boolean; preferences: PanelPreferences; save: (value: PanelPreferences) => void }>({ timeZone: "UTC", canWrite: false, preferences: defaults, save: () => {} });

export function PanelPreferencesProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: workspace, reload } = useRemote<{ timezone: string; access: { role: string } }>(pathname === "/login" ? null : "/api/timezone", "Could not load workspace access.");
  const timeZone = workspace?.timezone || "UTC";
  const canWrite = workspace?.access.role === "admin";
  useEffect(() => {
    if (pathname === "/login") return;
    window.addEventListener("focus", reload);
    return () => window.removeEventListener("focus", reload);
  }, [pathname, reload]);
  const [preferences, setPreferences] = useState(defaults);
  useEffect(() => {
    try {
      const value = JSON.parse(localStorage.getItem("wooops:panel-preferences") || "null");
      if (value && typeof value.name === "string" && ["system", "light", "dark"].includes(value.theme)) {
        queueMicrotask(() => setPreferences({ name: value.name.trim().slice(0, 60) || defaults.name, theme: value.theme }));
      }
    } catch { /* Browsers may disable local storage. Defaults still work. */ }
  }, []);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => document.documentElement.classList.toggle("dark", preferences.theme === "dark" || preferences.theme === "system" && media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [preferences.theme]);
  useEffect(() => { document.title = `${preferences.name} — Store Operations`; }, [preferences.name]);
  function save(value: PanelPreferences) {
    const next = { ...value, name: value.name.trim().slice(0, 60) || defaults.name };
    localStorage.setItem("wooops:panel-preferences", JSON.stringify(next));
    setPreferences(next);
  }
  return <Context.Provider value={{ timeZone, canWrite, preferences, save }}>{children}</Context.Provider>;
}

export const usePanelPreferences = () => useContext(Context);
