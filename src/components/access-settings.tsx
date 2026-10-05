"use client";

import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { usePanelPreferences } from "@/components/panel-preferences";
import { Notice } from "@/components/ui/feedback";
import { errorMessage, fetchJson } from "@/lib/fetch-json";
import { permissionList, type Permission } from "@/lib/permissions";

export type AccessRules = {
  editable: boolean;
  source: "wordpress" | "file" | "environment";
  roles: Array<{ slug: string; label: string; permissions: Permission[]; built_in?: boolean; locked?: boolean; missing?: Record<string, string[]> }>;
  logins: Array<{ username: string | null; name: string; role: string; two_factor: boolean }>;
};

export type AccessSummary = {
  protected: boolean; session_ready: boolean; two_factor?: boolean;
  role: string | null; role_label?: string | null; name?: string | null; permissions: Permission[];
  rules: AccessRules | null;
};

const groups = [...new Set(permissionList.map(item => item.group))];

function RoleCard({ role, editable, onSaved }: { role: AccessRules["roles"][number]; editable: boolean; onSaved: (rules: AccessRules) => void }) {
  const [draft, setDraft] = useState<Permission[]>(role.permissions);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const canEdit = editable && !role.locked;
  const changed = draft.length !== role.permissions.length || draft.some(permission => !role.permissions.includes(permission));

  function toggle(permission: Permission, on: boolean) {
    setResult(null);
    setDraft(current => on ? [...current, permission] : current.filter(item => item !== permission));
  }

  async function save() {
    setSaving(true);
    setResult(null);
    try {
      const rules = await fetchJson<AccessRules>("/api/access", { method: "PUT", json: { role: role.slug, permissions: draft } });
      onSaved(rules);
      setResult({ tone: "success", message: `Saved. People with the ${role.label} role get these permissions the next time a page loads.` });
    } catch (cause) {
      setResult({ tone: "error", message: errorMessage(cause, "Could not save this role.") });
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">{role.label} <span className="text-xs font-normal text-muted-foreground">({role.slug})</span></h3>
        {role.locked
          ? <span className="text-xs text-muted-foreground">Always has full access</span>
          : <span className="text-xs text-muted-foreground">{draft.length} of {permissionList.length} permissions</span>}
      </div>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {groups.map(group => (
          <fieldset key={group} className="space-y-1.5">
            <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group}</legend>
            {permissionList.filter(item => item.group === group).map(item => {
              const missing = role.missing?.[item.key];
              return (
                <label key={item.key} className="flex items-start gap-2 text-sm" title={item.description}>
                  <input type="checkbox" className="mt-1" disabled={!canEdit || saving} checked={draft.includes(item.key)}
                    onChange={event => toggle(item.key, event.target.checked)} />
                  <span>
                    {item.label}
                    {missing && missing.length > 0 && draft.includes(item.key) &&
                      <span className="block text-xs text-amber-700 dark:text-amber-300">WooCommerce also requires: {missing.join(", ")}</span>}
                  </span>
                </label>
              );
            })}
          </fieldset>
        ))}
      </div>
      {canEdit && <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
        {changed && <button type="button" disabled={saving} onClick={() => { setDraft(role.permissions); setResult(null); }} className="rounded-lg border px-3 py-2 text-sm">Reset</button>}
        <button type="button" disabled={!changed || saving} onClick={save}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {saving && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}Save {role.label}
        </button>
      </div>}
      {result && <Notice tone={result.tone} className="mt-3">{result.message}</Notice>}
    </li>
  );
}

/** Who can do what: the signed-in user's own access, and (for Settings users) each role's permissions. */
export function AccessSettings({ access, inWordPress }: { access: AccessSummary; inWordPress: boolean }) {
  const { access: workspace } = usePanelPreferences();
  const [rules, setRules] = useState<AccessRules | null>(access.rules);
  const [showAll, setShowAll] = useState(false);
  const mine = workspace?.permissions ?? access.permissions;
  const roles = rules?.roles.filter(role => showAll || role.locked || role.permissions.length > 0) ?? [];
  const hidden = (rules?.roles.length ?? 0) - roles.length;

  return (
    <section aria-labelledby="access-heading" className="rounded-xl border bg-background p-5 shadow-sm">
      <h2 id="access-heading" className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-5 text-primary" />Access and permissions</h2>
      {!inWordPress && <Notice tone={access.protected && access.session_ready ? "success" : "warning"} className="mt-4">
        {access.protected ? access.session_ready ? "Sign-in is required. Sessions expire after twelve hours." : "Sign-in is enabled, but session signing is not configured."
          : "Sign-in is disabled. Anyone who can reach this panel has full access."}
      </Notice>}
      <p className="mt-4 text-sm">
        Signed in as <strong>{access.name || "this login"}</strong>{access.role_label ? <> · {access.role_label}</> : null}
        {!inWordPress && <> · Two-factor sign-in: {access.two_factor ? "enabled" : "not enabled"}</>}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {mine.length === permissionList.length ? "You have every permission."
          : `You have ${mine.length} of ${permissionList.length} permissions: ${permissionList.filter(item => mine.includes(item.key)).map(item => item.label).join(", ") || "none"}.`}
      </p>

      {rules && <>
        <h3 className="mt-6 text-sm font-semibold">Roles</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {inWordPress
            ? rules.editable
              ? "Choose what each WordPress role can do in KartoDesk. Administrators always have full access. WooCommerce's own permissions still apply on top of these."
              : "Only administrators can change role permissions."
            : rules.source === "file"
              ? "Roles and logins come from the access file (WOOOPS_ACCESS_FILE) on the server. Edit that file to change them; saving it signs everyone out."
              : "Only the built-in administrator and read-only logins are configured. Add an access file (WOOOPS_ACCESS_FILE) for named logins and custom roles."}
        </p>
        <ul className="mt-4 space-y-3">
          {roles.map(role => <RoleCard key={`${role.slug}:${role.permissions.join(",")}`} role={role} editable={inWordPress && rules.editable} onSaved={setRules} />)}
        </ul>
        {hidden > 0 && <button type="button" onClick={() => setShowAll(true)} className="mt-3 text-sm underline underline-offset-2">Show {hidden} role{hidden === 1 ? "" : "s"} without KartoDesk access</button>}
        {!inWordPress && rules.logins.length > 0 && <>
          <h3 className="mt-6 text-sm font-semibold">Logins</h3>
          <ul className="mt-2 divide-y rounded-lg border text-sm">
            {rules.logins.map(login => (
              <li key={`${login.username}:${login.name}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <span>{login.name}{login.username && <span className="text-muted-foreground"> · {login.username}</span>}</span>
                <span className="text-muted-foreground">{rules.roles.find(role => role.slug === login.role)?.label ?? login.role} · 2FA {login.two_factor ? "on" : "off"}</span>
              </li>
            ))}
          </ul>
        </>}
      </>}
    </section>
  );
}
