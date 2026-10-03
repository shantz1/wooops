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
- Administrator and optional read-only logins use separate passwords. Read-only sessions cannot write through the API; they still see customer information. These are shared roles, not individual staff accounts or an audit trail.
- Sessions are signed, random, HttpOnly, SameSite=Strict and Secure in production, and expire after 12 hours. Credential changes invalidate existing sessions. Logout removes the browser cookie; a copied token stays valid until expiry or credential rotation.
- Optional TOTP uses six-digit, 30-second authenticator codes with a one-step clock window. Used codes are rejected within one process. Keep the deployment clock synchronized. Each configured role has its own secret; securely back it up. Recovery is an administrator changing the deployment secret, not a public bypass.
- Sign-in is limited to 20 attempts per five minutes per process, with one expensive password check at a time. Limits and TOTP replay tracking reset on restart and are not shared across instances. Run one Node process for this MVP and add per-client throttling at your HTTPS reverse proxy; do not trust arbitrary forwarded client-IP headers. For multiple instances, use shared security state or an identity provider.
- The reverse proxy must terminate HTTPS, overwrite X-Forwarded-Proto and forward the public Host. Restrict direct access to the Node port. Cross-site writes and requests without the expected Origin are rejected; scripts calling write endpoints must send that Origin and an authenticated cookie.
- API responses are private and no-store. Identical concurrent reads are shared only until settlement; customer records are not persistently cached. Store timezone metadata may be retained in process for up to one minute.
- JSON writes are bounded to 64 KiB, login to 4 KiB and signed webhooks to 512 KiB. HTTPS is required for a remote store; credentialed redirects are refused.
- Use the least-privileged WooCommerce key owner that supports your work. Choose Read permissions for browsing-only deployments and Read/Write for editing. Rotate any exposed credentials.

## WordPress KartoDesk

The plugin uses WordPress login, REST nonces and the manage_woocommerce capability, plus WooCommerce's controller permissions. Subscribers and ordinary customers cannot open it. WordPress manages password hashing, sessions and any site-installed 2FA/login throttling. KartoDesk does not install a separate login or implement its own WordPress 2FA.

The plugin's private REST responses are no-store and its own scripts/styles load locally only on its panel. Product images may use the store's configured image/CDN URLs. No analytics or customer payload telemetry is sent.

Test customer-facing notes, status emails and tracking on staging. Tracking is one order metadata value: simultaneous editors or a standalone app and plugin writing together can overwrite each other's changes.

## Dependencies

The shadcn CLI is not a production dependency; its MIT-licensed CSS is vendored with attribution.
Run npm audit regularly. An audit result is a dependency check, not proof that the application is secure.

At the 0.1.1 plugin release, the production dependency audit has no reported vulnerabilities. The full audit still reports five high-severity development dependency findings through ESLint's braces dependency (GHSA-vfj7-8cjw-p6xm); no patched braces release is currently available. These tools are not shipped in the plugin ZIP or needed to serve the standalone production build. Recheck the advisory before upgrading build tooling.
