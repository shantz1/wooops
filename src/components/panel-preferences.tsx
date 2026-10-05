"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import type { Permission } from "@/lib/permissions";
import { wordpressRuntime } from "@/lib/runtime";
import { useRemote } from "@/lib/use-remote";

export type PanelPreferences = { name: string; theme: "system" | "light" | "dark" };
// The WordPress plugin ships under its own name; the standalone app keeps WooOps.
const defaults: PanelPreferences = { name: wordpressRuntime() ? "KartoDesk" : "WooOps", theme: "system" };
export type WorkspaceAccess = { role: string | null; role_label?: string | null; name?: string | null; permissions: Permission[] };
type PanelContext = {
  timeZone: string;
  /** Whether the signed-in user's permissions have loaded; until then actions stay hidden. */
  accessLoaded: boolean;
  access: WorkspaceAccess | null;
  can: (permission: Permission) => boolean;
  preferences: PanelPreferences;
  save: (value: PanelPreferences) => void;
};
const Context = createContext<PanelContext>({ timeZone: "UTC", accessLoaded: false, access: null, can: () => false, preferences: defaults, save: () => {} });

export function PanelPreferencesProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: workspace, reload } = useRemote<{ timezone: string; access: WorkspaceAccess }>(pathname === "/login" ? null : "/api/timezone", "Could not load workspace access.");
  const timeZone = workspace?.timezone || "UTC";
  // Permissions are re-read when the window regains focus, so a role change applies without signing out.
  const access = workspace?.access ?? null;
  const can = (permission: Permission) => Boolean(access?.permissions?.includes(permission));
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
  return <Context.Provider value={{ timeZone, accessLoaded: Boolean(workspace), access, can, preferences, save }}>{children}</Context.Provider>;
}

export const usePanelPreferences = () => useContext(Context);
