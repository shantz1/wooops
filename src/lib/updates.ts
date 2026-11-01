export const releasesUrl = "https://github.com/shantz1/wooops/releases";
export type UpdateState = "not_checked" | "update_available" | "up_to_date" | "unpublished" | "unknown";
export interface UpdateInfo {
  platform: "standalone" | "wordpress";
  current_version: string;
  latest_version: string | null;
  status: UpdateState;
  checked_at: string | null;
  release_url: string;
  message?: string;
  auto_updates?: { available: boolean; enabled: boolean; can_manage: boolean; manage_url: string | null };
}
export function releaseVersion(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 40 || !/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) return null;
  const parts = value.replace(/^v/, "").split(".").map(Number);
  return parts.every(Number.isSafeInteger) ? parts.join(".") : null;
}
export function isNewerVersion(candidate: string, installed: string): boolean {
  const next = releaseVersion(candidate)?.split(".").map(Number);
  const current = releaseVersion(installed)?.split(".").map(Number);
  if (!next || !current) return false;
  for (let index = 0; index < 3; index++) if (next[index] !== current[index]) return next[index] > current[index];
  return false;
}
