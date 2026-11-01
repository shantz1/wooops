# Security

## Report a vulnerability privately

Use [GitHub private vulnerability reporting](https://github.com/shantz1/wooops/security/advisories/new).
Include the affected version, deployment type (WooOps or KartoDesk), reproduction steps and impact.
Use synthetic customer records and redact API keys, passwords, session cookies and personal data.
If GitHub does not offer private reporting, contact the maintainer through the GitHub profile to arrange a private channel. Do not put exploit details or customer data in a public issue.

Security fixes target the latest version on main. This project has automated checks, but has not had an independent security audit.

## Standalone WooOps

- API credentials stay server-side. Environment files are ignored by Git; the app does not encrypt them at rest. Use your host's secret manager or protected environment file. Keep it outside the public web directory and readable only by the service account (for example, chmod 600 on Linux; restricted ACLs on Windows). Never prefix secrets with NEXT_PUBLIC_.
- Production requires a salted scrypt password hash, a session secret of at least 32 characters and an HTTPS public origin. Legacy plain-text passwords work only in development.
- Administrator and optional read-only logins use separate passwords. Read-only sessions cannot write through the API; they still see customer information.
- Optional named logins and custom roles come from the access file (`WOOOPS_ACCESS_FILE`). Every API route requires a specific permission and unknown routes are refused unless the login has every permission; body-dependent actions (customer notifications, stock fields) are checked again in the route handler. Permissions limit what a login can do in this panel; the WooCommerce API key itself still has its full access, so protect it and the access file. There is no audit trail yet.
- Editing the access file signs everyone out. A login removed from the file is signed out on its next request.
- Sessions are signed, random, HttpOnly, SameSite=Strict and Secure in production, and expire after 12 hours. Credential changes invalidate existing sessions. Logout removes the browser cookie; a copied token stays valid until expiry or credential rotation.
- Optional TOTP uses six-digit, 30-second authenticator codes with a one-step clock window. Used codes are rejected within one process. Keep the deployment clock synchronized. Each configured role has its own secret; securely back it up. Recovery is an administrator changing the deployment secret, not a public bypass.
- Sign-in is limited to 20 attempts per five minutes per process, with one expensive password check at a time. Limits and TOTP replay tracking reset on restart and are not shared across instances. Run one Node process for this MVP and add per-client throttling at your HTTPS reverse proxy; do not trust arbitrary forwarded client-IP headers. For multiple instances, use shared security state or an identity provider.
- The reverse proxy must terminate HTTPS, overwrite X-Forwarded-Proto and forward the public Host. Restrict direct access to the Node port. Cross-site writes and requests without the expected Origin are rejected; scripts calling write endpoints must send that Origin and an authenticated cookie.
- API responses are private and no-store. Identical concurrent reads are shared only until settlement; customer records are not persistently cached. Store timezone metadata may be retained in process for up to one minute.
- JSON writes are bounded to 64 KiB, login to 4 KiB and signed webhooks to 512 KiB. HTTPS is required for a remote store; credentialed redirects are refused.
- Use the least-privileged WooCommerce key owner that supports your work. Choose Read permissions for browsing-only deployments and Read/Write for editing. Rotate any exposed credentials.

## WordPress KartoDesk

The plugin uses WordPress login, REST nonces and its per-role KartoDesk capabilities, plus WooCommerce's controller permissions. Subscribers and ordinary customers have no panel permissions by default. WordPress manages password hashing, sessions and any site-installed 2FA/login throttling. KartoDesk does not install a separate login or implement its own WordPress 2FA.

The plugin's private REST responses are no-store and its own scripts/styles load locally only on its panel. Product images may use the store's configured image/CDN URLs. No analytics or customer payload telemetry is sent.

Test customer-facing notes, status emails and tracking on staging. Tracking is one order metadata value: simultaneous editors or a standalone app and plugin writing together can overwrite each other's changes.

## Dependencies

The shadcn CLI is not a production dependency; its MIT-licensed CSS is vendored with attribution.
Run npm audit regularly. An audit result is a dependency check, not proof that the application is secure.

At the 0.2.0 security review, the production dependency audit has no reported vulnerabilities after updating Next.js, DOMPurify and compatible dependencies. The full audit reports 16 moderate entries stemming from the build-tool dependency minimatch (GHSA-g3hv-75wg-m249). These tools are not shipped in the plugin ZIP or needed to serve the standalone production build. Run lint/build tools only on trusted source and patterns. npm's suggested forced ESLint downgrade is incompatible; recheck upstream fixes before changing the toolchain.

## Order edits, email and updates

Customer assignment requires order-view/edit access and, for a registered account, customer-view access. The plugin also reads the selected customer through WooCommerce's permission-checked controller. Explicit address replacement validates and replaces the saved address fields, including the billing email used for future messages.

The picker currently accepts the standard customer role. Unknown/custom role mappings are refused rather than guessing whether an account is a customer or staff member. Shipping labels use the shipping contact by default; staff must explicitly choose to print a billing phone when it is the intended delivery contact.

Order detail responses carry an opaque state revision. Customer assignment requires it, and the panel's status/address editors submit it too. This detects relevant same-second changes. Panel order edits and resends share a lock: a MySQL named lock in the plugin, and an in-process queue in standalone. External writers and a standalone app running beside the plugin do not share these locks; the remote REST API cannot provide an atomic compare-and-swap across independent writers. Keep one standalone Node process and avoid simultaneous edits to the same order across tools.

Email resends require order-view and notification permissions, explicit recipient confirmation and a per-order cooldown. The plugin rechecks the actual order object immediately before the native mailer runs. Standalone requires WooCommerce's recipient guard (9.8+) and repeats the server-read address with `force_email_update: false`, so a different existing recipient is refused. If an independent writer clears the billing email between the check and send, WooCommerce can restore the previously confirmed address. No unconfirmed caller-supplied recipient or forced override is accepted. An uncertain response is not retried automatically.

WordPress updates stay under WordPress's native controls and administrator capabilities. The panel reads update state and links to those controls; it does not replace the update mechanism or install from GitHub. Standalone checks public stable GitHub release metadata, with no store credentials or customer data sent. It shows a dismissible notice for a newer version and provides server update instructions. There is no web-accessible command runner or code-install endpoint.

Order list search terms and order IDs are kept in tab session storage for previous/next navigation. Search terms may contain customer information; avoid sharing filtered URLs containing personal data. Standalone logout clears this navigation record.
