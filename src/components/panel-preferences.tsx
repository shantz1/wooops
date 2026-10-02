"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";

export type PanelPreferences = { name: string; theme: "system" | "light" | "dark" };
const defaults: PanelPreferences = { name: "WooOps", theme: "system" };
const Context = createContext<{ timeZone: string; preferences: PanelPreferences; save: (value: PanelPreferences) => void }>({ timeZone: "UTC", preferences: defaults, save: () => {} });

export function PanelPreferencesProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [timeZone, setTimeZone] = useState("UTC");
  useEffect(() => {
    const controller = new AbortController();
    const read = () => fetch("/api/settings", { signal: controller.signal }).then(response => response.ok ? response.json() : null).then(data => { if (data?.timezone) setTimeZone(data.timezone); }).catch(() => {});
    void read();
    window.addEventListener("focus", read);
    return () => { controller.abort(); window.removeEventListener("focus", read); };
  }, [pathname]);
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
  return <Context.Provider value={{ timeZone, preferences, save }}>{children}</Context.Provider>;
}

export const usePanelPreferences = () => useContext(Context);
