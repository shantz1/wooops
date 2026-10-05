# WooOps

A self-hosted operations panel for your WooCommerce store: orders, products, stock, customers, notes, shipment tracking and basic reports.

**One store. No extra database. API keys stay server-side.**

Prefer to stay inside WordPress? Use **KartoDesk for WooCommerce**, the plugin version, with the same screens and your existing WordPress login.

Under **Products**, search and open an item to edit its descriptions, prices, categories, image gallery, stock and shipping details. Images use existing store Media Library URLs. Categories, attributes, variations and reviews have their own sections. **Inventory** is for quantity updates and availability checks.

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
- **Named logins and roles:** set `WOOOPS_ACCESS_FILE` to a JSON file that defines roles (sets of permissions) and logins (username, display name, role, password hash from `npm run setup:password`, optional `totp_secret`). See [`access.example.json`](access.example.json). Staff sign in with their username; leave it blank for the built-in administrator or read-only password. The file is re-read when it changes, and changing it signs everyone out. Keep it outside the web root and readable only by the service account.
- **Authenticator codes:** run `npm run setup:2fa -- admin` and follow the output. Configure a separate secret for a read-only login with `npm run setup:2fa -- readonly`.
- Sessions expire after **12 hours**. Credential changes invalidate them.
- This MVP runs with **one Node process**. Built-in login limits and authenticator replay protection are not shared across instances.

[Security and private vulnerability reporting](SECURITY.md) ? [Updating an existing installation](docs/security-update.md)

## WordPress plugin: KartoDesk

1. Upload the packaged `kartodesk-for-woocommerce-0.1.6.zip` under **Plugins > Add New > Upload Plugin**.
2. Activate it and open **KartoDesk** in the admin menu. It runs inside its own wp-admin page; the WordPress menu, admin bar and notices stay visible.
3. Use an administrator or store manager account. No Node server, API keys or WooOps password are needed.

WordPress handles login, passwords and sessions. Existing WordPress 2FA/login protection applies; the plugin does not add its own login.

Earlier pre-release builds also served the panel at `/manage/`. That URL was removed in 0.1.4; use the admin menu. Deactivate the earlier StoreOps test plugin before activating KartoDesk.

### Roles and permissions

Administrators choose what each WordPress role can do under **KartoDesk > Settings > Access and permissions**. Administrators always have full access; Shop managers start with full access. Other roles (Editor, or a custom role such as "Packer" made with a role editor) get only the permissions you tick. Permissions are stored as WordPress capabilities (`kartodesk_view_orders` and so on), so role-editor plugins can manage them too. WooCommerce's own capability checks still apply on top: if a role lacks the WooCommerce capability a permission relies on, Settings shows a warning. Deleting the plugin removes its capabilities from every role.

Build the installable ZIP from source:

```bash
npm run build:wp
python wordpress/package.py
```

The ZIP is created under `wordpress/dist/`. It includes every local screen module with portable paths. Shared source is in `src/`; plugin source is in `wordpress/`.

## Permissions

Both the standalone app and the plugin use the same permissions. The server checks them on every request; hiding a button is never the only protection.

| Permission | Allows |
| --- | --- |
| `orders.view` | Overview, order list and details, notes, tracking and packing slips |
| `orders.status` | Single and bulk order status changes (the store may email customers) |
| `orders.notes` | Private, staff-only order notes |
| `orders.notify` | Customer-facing notes and tracking messages (may be emailed) |
| `orders.shipments` | Adding and removing shipment tracking |
| `products.view` | Products, categories, attributes, variations, reviews and stock levels |
| `products.edit` | Creating and editing products, categories, attributes, variations; review moderation |
| `inventory.edit` | Stock quantities, stock status, backorders, enabling stock management |
| `customers.view` | Registered customers |
| `reports.view` | Order and inventory reports and CSV exports |
| `settings.view` | Settings: connection, store details, panel preferences, roles |

A customer-facing note or a shipment notification also needs `orders.notify`; a product edit that changes stock fields also needs `inventory.edit`.

## Tracking and emails

Order filters stay in the URL. Use Previous/Next to move through the filtered list, or print a packing slip from an order. Custom store statuses are available in order screens and reports.

Open an order to save courier tracking and an optional HTTPS link. Known couriers suggest an editable tracking link. Templates have not been verified with real parcels for every courier. Check each link opens the right parcel before saving; no live delivery status is fetched. No tracking plugin is needed. Customer notification is off by default.

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
