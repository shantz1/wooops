# WooOps

A self-hosted operations panel for your WooCommerce store: orders, products, stock, customers, notes, shipment tracking and basic reports.

**One store. No extra database. API keys stay server-side.**

Prefer to stay inside WordPress? Use **KartoDesk for WooCommerce**, the plugin version, with the same screens and your existing WordPress login.

## Standalone setup

You need an HTTPS WooCommerce store and **Node.js 22.18+**.

### 1. Prepare WordPress

1. Under **Settings > Permalinks**, choose a readable structure such as **Post name**.
2. Open **WooCommerce > Settings > Advanced > REST API > Add key**.
3. Choose a store management user and **Read/Write** permissions for editing. Use **Read** for a browsing-only deployment.
4. Copy the Consumer Key and Consumer Secret; keep them private.
5. Under **Settings > General > Timezone**, choose your store timezone. For IST, select **Kolkata**. The panel follows this setting; metadata refreshes within about a minute.

[Official API key guide](https://woocommerce.com/document/woocommerce-rest-api/)

### 2. Configure WooOps

```bash
git clone https://github.com/shantz1/wooops.git
cd wooops
npm ci
cp .env.example .env.local
npm run setup:password
```

On PowerShell, use `Copy-Item .env.example .env.local` instead of `cp`.

Enter a password when prompted. Copy the generated hash into `.env.local`:

```dotenv
WOOCOMMERCE_URL=https://your-store.com
WOOCOMMERCE_CONSUMER_KEY=ck_your_key
WOOCOMMERCE_CONSUMER_SECRET=cs_your_secret
WOOOPS_ADMIN_PASSWORD_HASH=scrypt:131072:8:1:your_generated_salt:your_generated_hash
WOOOPS_SESSION_SECRET=your_long_random_secret
WOOOPS_PUBLIC_URL=https://ops.your-store.com
```

Use the WordPress base URL, including its subdirectory if needed; do not add `/wp-json/wc/v3`.

Generate a random session secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

For local development, set `WOOOPS_PUBLIC_URL=http://localhost:3000`. Keep secrets outside the public web directory, out of Git, and accessible only to the service account. Environment values are **not encrypted by the app**.

### 3. Run it

```bash
npm run dev
```

Open **http://localhost:3000**, sign in and check **Settings**.

For production:

```bash
npm run build
npm start
```

Use an HTTPS reverse proxy, restrict direct access to the Node port and add per-client login throttling. Forward the public Host and overwrite `X-Forwarded-Proto`. Production refuses to open without a valid password hash, session secret and public origin.

### Optional access controls

- **Read-only staff:** generate a different password hash and set `WOOOPS_READONLY_PASSWORD_HASH`. That login can view customer data and export reports, but cannot change store records.
- **Authenticator codes:** run `npm run setup:2fa -- admin` and follow the output. Configure a separate secret for a read-only login with `npm run setup:2fa -- readonly`.
- Sessions expire after **12 hours**. Credential changes invalidate them.
- This MVP runs with **one Node process**. Built-in login limits and authenticator replay protection are not shared across instances.

[Security and private vulnerability reporting](SECURITY.md) ? [Updating an existing installation](docs/security-update.md)

## WordPress plugin: KartoDesk

1. Upload the packaged `kartodesk-for-woocommerce-0.1.1.zip` under **Plugins > Add New > Upload Plugin**.
2. Activate it and open **KartoDesk** in the admin menu, or visit **/manage/**.
3. Use an administrator or store manager account. No Node server, API keys or WooOps password are needed.

WordPress handles login, passwords and sessions. Existing WordPress 2FA/login protection applies; the plugin does not add its own login.

Use readable permalinks. If `/manage/` returns 404 after updating, save **Settings > Permalinks** once. An existing page called `manage` takes priority. Deactivate the earlier StoreOps test plugin before activating KartoDesk.

Build the installable ZIP from source:

```bash
npm run build:wp
python wordpress/package.py
```

The ZIP is created under `wordpress/dist/`. It includes every local screen module with portable paths. Shared source is in `src/`; plugin source is in `wordpress/`.

## Tracking and emails

Open an order to save courier tracking and an optional HTTPS link. No tracking plugin is needed. Customer notification is off by default.

Enable **Customer note** under **WooCommerce > Settings > Emails** and test the store's mail delivery. The panel confirms that the store accepted a note, not that an email was delivered. Status changes may trigger separate store emails.

If a write times out, reload before retrying. Avoid editing the same order's tracking simultaneously; another editor's changes can be overwritten. Test writes and emails on staging first.

## Current limits

- One store; standalone logins are shared roles, without individual staff accounts or an audit log.
- Overview summarizes the latest five orders. Orders, products and customers have pagination; customers exclude guest checkouts.
- Reports read up to 500 records and flag incomplete results. Order value is not profit or confirmed revenue; inventory reports exclude variation quantities.
- Product creation supports simple products. The plugin uses an existing Media Library image URL; standalone images must belong to the store origin.
- Enabling stock management requires confirmation. Tracking edits require removing and re-adding the shipment.

## Troubleshooting

| Problem | Check |
| --- | --- |
| Connection fails | Store URL, HTTPS, API key scope and key owner's permissions. |
| Store returns 404 | WordPress permalinks must not be Plain. |
| Production returns 503 | Password hash, session secret and public origin; restart after changes. |
| Write returns 403 | Read-only access or Origin/public URL mismatch. |
| Login returns 429 | Wait for the retry delay; review proxy throttling. |
| Times show UTC | WordPress timezone and Settings connection warning. |
| Customer emails do not arrive | Customer note email settings and store mail delivery. |

## Developer checks

```bash
npm run lint
npm test
npm run build
npm run build:wp
npx tsc --noEmit
npm run test:integration
```

Integration tests use an isolated mock store. Optional signed webhooks at `/api/woo/webhooks` use `WOOCOMMERCE_WEBHOOK_SECRET`; they invalidate timezone metadata and acknowledge the event without storing customer payloads.

[MIT license](LICENSE) ? [Third-party notices](THIRD_PARTY_NOTICES.md)
