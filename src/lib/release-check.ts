import "server-only";
import { isNewerVersion, releaseVersion, releasesUrl, type UpdateInfo } from "@/lib/updates";
import packageInfo from "../../package.json";

let cached: { value: UpdateInfo; expires: number } | null = null;
let pending: Promise<UpdateInfo> | null = null;
export function installedUpdateInfo(): UpdateInfo {
  return { platform: "standalone", current_version: packageInfo.version, latest_version: null, status: "not_checked", checked_at: null, release_url: releasesUrl };
}
/** Public release metadata only. No store URL, credentials or customer data is sent. Never downloads or executes code. */
export async function checkLatestRelease(): Promise<UpdateInfo> {
  if (cached && cached.expires > Date.now()) return cached.value;
  if (pending) return pending;
  const request = (async () => {
    const result = { ...installedUpdateInfo(), checked_at: new Date().toISOString() };
    try {
      const response = await fetch("https://api.github.com/repos/shantz1/wooops/releases/latest", {
        headers: { Accept: "application/vnd.github+json", "User-Agent": "WooOps-update-check" },
        cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000),
      });
      if (response.status === 404) return { ...result, status: "unpublished" as const, message: "No published stable GitHub release is available." };
      if (!response.ok) throw new Error();
      const release = await response.json() as { tag_name?: unknown; draft?: boolean; prerelease?: boolean };
      const version = releaseVersion(release.tag_name);
      if (!version || release.draft || release.prerelease) throw new Error();
      return { ...result, latest_version: version, status: isNewerVersion(version, result.current_version) ? "update_available" as const : "up_to_date" as const,
        release_url: `${releasesUrl}/tag/${encodeURIComponent(String(release.tag_name))}` };
    } catch { return { ...result, status: "unknown" as const, message: "Could not check GitHub releases. Your installed version is unchanged." }; }
  })().then(value => { cached = { value, expires: Date.now() + (value.status === "unknown" ? 60_000 : 6 * 60 * 60_000) }; return value; }).finally(() => { if (pending === request) pending = null; });
  pending = request;
  return request;
}
