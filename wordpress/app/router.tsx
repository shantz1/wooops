import { createContext, useContext, useEffect, useState } from "react";

/**
 * Hash routing for the wp-admin page (admin.php?page=kartodesk#/orders/12). The query string belongs to
 * WordPress, so panel paths live in the fragment. Fragments that are not paths (e.g. #main) are ignored.
 */
function readPath() {
  const hash = window.location.hash;
  return hash.startsWith("#/") ? hash.slice(1).split("?")[0] || "/" : null;
}

const PathContext = createContext("/");

export function HashRouter({ children }: { children: React.ReactNode }) {
  const [path, setPath] = useState(() => readPath() ?? "/");
  useEffect(() => {
    const update = () => {
      const next = readPath();
      if (next === null) return;
      setPath(next);
      // The panel is part of the admin page: bring its top back into view, below WordPress's fixed admin bar.
      const panel = document.getElementById("kartodesk-root");
      const adminBar = document.getElementById("wpadminbar")?.offsetHeight ?? 0;
      if (panel) {
        const top = panel.getBoundingClientRect().top + window.scrollY - adminBar - 8;
        if (window.scrollY > top) window.scrollTo({ top });
      }
    };
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return <PathContext.Provider value={path}>{children}</PathContext.Provider>;
}

export const useHashPath = () => useContext(PathContext);

export function navigate(path: string, replace = false) {
  const url = `${window.location.pathname}${window.location.search}#${path}`;
  if (replace) {
    window.history.replaceState(null, "", url);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    window.location.hash = path;
  }
}
