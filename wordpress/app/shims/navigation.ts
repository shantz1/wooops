import { navigate, useHashPath } from "../router";

/** Stand-in for next/navigation inside the wp-admin page. */
export function usePathname() {
  return useHashPath();
}

export function useRouter() {
  return {
    push: (path: string) => navigate(path),
    replace: (path: string) => navigate(path, true),
    back: () => window.history.back(),
    forward: () => window.history.forward(),
    refresh: () => {},
    prefetch: () => {},
  };
}

export function useSearchParams() {
  return new URLSearchParams(window.location.hash.split("?")[1] || "");
}
