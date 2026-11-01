"use client";
import { Notice, RetryButton, LoadingState } from "@/components/ui/feedback";
import { wordpressRuntime } from "@/lib/runtime";
import { useRemote } from "@/lib/use-remote";
import type { UpdateInfo } from "@/lib/updates";

const labels = { not_checked: "Update check has not run yet", update_available: "An update is available", up_to_date: "You are up to date", unpublished: "No published stable release", unknown: "Update status unavailable" };
export function UpdateSettings() {
  const plugin = Boolean(wordpressRuntime());
  const { data, error, loading, reload } = useRemote<UpdateInfo>(plugin ? "/api/updates" : "/api/updates?check=1", "Could not load update information.");
  return <section className="max-w-3xl space-y-5 rounded-xl border bg-background p-5 shadow-sm">
    <div><h2 className="font-semibold">Updates</h2><p className="mt-1 text-sm text-muted-foreground">{plugin ? "WordPress manages plugin updates and automatic update scheduling." : "Check stable releases on GitHub and update your installation."}</p></div>
    {error && <Notice tone="error">{error}</Notice>}
    {!data && loading && <LoadingState label="Loading update information…" className="py-6" />}
    {data && <><dl className="space-y-2 text-sm"><div className="flex justify-between gap-3"><dt>Installed version</dt><dd className="font-medium">{data.current_version}</dd></div><div className="flex justify-between gap-3"><dt>Status</dt><dd>{labels[data.status]}</dd></div>{data.latest_version && <div className="flex justify-between gap-3"><dt>Latest stable version</dt><dd>{data.latest_version}</dd></div>}</dl>
      {data.message && <p className="text-sm text-muted-foreground">{data.message}</p>}
      {plugin ? <div className="space-y-3"><p className="text-sm">Automatic updates: <strong>{!data.auto_updates?.available ? "Unavailable under this site's update policy" : data.auto_updates.enabled ? "Enabled in WordPress" : "Disabled in WordPress"}</strong></p><p className="text-xs text-muted-foreground">Site policies and other plugins may override automatic update preferences. WordPress checks and installs updates on its own schedule.</p>{data.auto_updates?.can_manage && data.auto_updates.manage_url ? <a className="inline-flex rounded-lg border px-4 py-2 text-sm font-medium hover:bg-accent" href={data.auto_updates.manage_url}>Manage updates in WordPress</a> : <p className="text-sm text-muted-foreground">A WordPress administrator with update permission can manage automatic updates.</p>}</div>
        : <><p className="text-sm text-muted-foreground">Release checks contact GitHub from this server, sending no store credentials or customer data. Checks are cached for up to six hours.</p><ol className="list-decimal space-y-2 pl-5 text-sm"><li>Read the release notes and back up your environment configuration and local access file.</li><li>On the server, check that your Git working tree is clean, then fetch the release tags.</li><li>Check out the chosen stable release tag, run <code>npm ci</code> and <code>npm run build</code>.</li><li>Restart the app with your existing service manager, then check sign-in and the store connection.</li></ol><p className="text-xs text-muted-foreground">Keep the previous release and protected configuration available for rollback. The panel does not execute deployment commands.</p></>}
      <a className="inline-flex rounded-lg border px-4 py-2 text-sm font-medium hover:bg-accent" target="_blank" rel="noopener noreferrer" href={data.release_url}>View release information</a>
    </>}
    {data?.checked_at && <p className="text-xs text-muted-foreground">Last checked: {new Date(data.checked_at).toLocaleString()}</p>}
    <RetryButton label={plugin ? "Refresh status" : "Check for updates"} busy={loading} onRetry={reload} />
  </section>;
}
