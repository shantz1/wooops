# Security update to 0.1.1

## Existing standalone installations

1. Run `npm ci`.
2. Run `npm run setup:password`, enter your current or a new password, and copy the printed hash to `WOOOPS_ADMIN_PASSWORD_HASH`. Input is hidden in an interactive terminal.
3. Remove `WOOOPS_ADMIN_PASSWORD` from the deployment. Keep a random `WOOOPS_SESSION_SECRET` of at least 32 characters.
4. Set `WOOOPS_PUBLIC_URL` to the exact HTTPS origin of the panel, for example `https://ops.example.com`.
5. Rebuild and restart. Existing sessions expire immediately because the session format changed; sign in again.

For an optional viewer login, generate a different password hash and set `WOOOPS_READONLY_PASSWORD_HASH`. It can read customer data and export reports, but cannot modify store records.

## Optional authenticator login

Run `npm run setup:2fa -- admin`. Store the printed Base32 secret in `WOOOPS_ADMIN_TOTP_SECRET` and add the same secret to an authenticator app as a time-based account (SHA1, six digits, 30 seconds). Save a secure backup before restarting.

For a viewer login, also run `npm run setup:2fa -- readonly` and set `WOOOPS_READONLY_TOTP_SECRET`. Never share the administrator secret with viewers. Do not send the secret or provisioning URI to an online QR service.

This MVP supports one Node process. Put per-client login throttling at the HTTPS reverse proxy as well. See [SECURITY.md](../SECURITY.md) for operational limits.

## KartoDesk installations

Install the new `kartodesk-for-woocommerce-0.1.5.zip` through Plugins > Add New > Upload Plugin and confirm replacing the existing plugin. Its access still comes from WordPress; no environment changes are needed.

Versions 0.1.1 and newer include local modules for each screen. Use the complete ZIP rather than uploading app.js alone. Keep the earlier 0.1.0 ZIP if you need to roll back.

For a submission awaiting review, replace the uploaded file using **Upload updated plugin for review**; do not make a second plugin submission. Manual review remains pending.
