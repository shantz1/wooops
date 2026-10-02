# WooOps

**A standalone operations panel for one WooCommerce store.** Work through orders, customers, products, and stock in a focused interface while WooCommerce remains the source of truth.

WooOps is a self-hosted Next.js 16 application. It talks to the WooCommerce REST API through server-side route handlers, so API keys are never sent to the browser. The MVP needs one Node.js process and no WooOps database, Redis, or Docker setup.

## What you can do

| Area | MVP capability |
| --- | --- |
| Overview | See the five latest orders and summaries calculated from those five orders. These are **not** store-wide analytics. Amounts in different currencies are never added together, and guest orders are not counted as one customer. |
| Orders | Search (debounced), filter by status, paginate, click anywhere on an order row to open it, and update selected orders in bulk after a confirmation. Custom statuses from extensions are shown as they are. |
| Order workspace | Items with photos, SKU, quantity and variation details; a totals breakdown (items, discount, fees, shipping, tax, total, refunds); shipping and billing addresses with copy, email and phone actions; the customer's checkout note; guest or registered customer; payment method, paid date and transaction ID; order status; shipment tracking; and order notes. |
| Order notes | Read private and customer-facing notes and add either kind. The email consequence of a customer-facing note is shown before it is added. |
| Customers | Search and view the first 50 matching registered customers. Guest checkouts have no customer record. |
| Products and inventory | Search and view the first 50 matching products with image thumbnails; create simple draft or published products with an optional image URL; update non-negative stock quantities. |
| Connection | Check the WooCommerce API connection on the Settings page. |
| Webhooks | Verify WooCommerce signatures and log event topics. No event persistence or background sync yet. |

Every page works at phone, tablet and desktop widths; below desktop width the navigation opens from the menu button. Lists and panels show an explicit loading state, empty state and error with a **Retry** button. If a refresh fails, the last loaded data stays on screen with the error, and a newer search always replaces an older one. WooOps stops waiting for WooCommerce after 20 seconds and says so.

The application also exposes order creation and deletion routes, but the MVP has no UI for those actions. Treat the API as an administrative interface. Product creation currently covers basic simple products and one existing image URL from the same store; file uploads, variations, categories, and advanced attributes still require WooCommerce.

Shipment tracking is stored in the order's `wooops_shipments` metadata through the WooCommerce REST API. No extra WordPress plugin or WooOps database is required. On an order page, enter a courier and tracking number, optionally add an HTTPS tracking link and shipped date, then choose whether to also add a customer-facing tracking note (off by default). WooOps adds that note only after WooCommerce has confirmed the saved shipment. If the note fails, the shipment stays saved, the page says so, and **Try the email again** is offered. If WooCommerce does not answer in time, WooOps reloads the list and asks you to check it before retrying, because the change may have been applied. WooOps refuses to edit tracking when an order's `wooops_shipments` value is malformed or duplicated, rather than overwriting it. This tracking metadata is specific to WooOps and does not automatically appear in other shipment tracking plugins.

Shipments are stored with a read-modify-write of one metadata value. Two people editing the same order's tracking at the same moment can overwrite each other's change; reload the order before editing if others may be working on it.

### Customer emails

Customer-facing notes (from the notes panel or a shipment) are sent by WooCommerce's **Customer note** email to the order's billing email. Enable it under **WooCommerce → Settings → Emails** and verify the store can send mail. WooOps reports only that WooCommerce **accepted** the note; it cannot confirm that an email was sent or delivered. Orders without a billing email cannot be emailed. Changing an order's status can also trigger WooCommerce's own status emails, such as **Completed order**, depending on store settings. Notes added by WooOps are attributed to WooCommerce (the system) rather than a named staff member.

## How it works

```text
Store team → WooOps (Next.js UI + server-side API) → WooCommerce REST API → WordPress store
                                   ↑
                    optional signed WooCommerce webhooks
```

WooOps reads current data from WooCommerce when you open a view or refresh it. Webhooks are optional for this MVP; the interface does not require them to load data. One deployment is configured for one store.

## Requirements

- A working WordPress site with WooCommerce installed and activated.
- WordPress permalinks set to anything other than **Plain**. WooCommerce's REST API requires readable permalinks.
- A WooCommerce REST API key associated with a WordPress user who can access the store data, with **Read/Write** permission for status and stock updates.
- Node.js **20.9 or newer** and npm on the machine running WooOps.
- HTTPS for the WooCommerce store URL. WooOps permits HTTP only for `localhost` or `127.0.0.1` during development. Use HTTPS for a public WooOps deployment too.

You do **not** need to install a WooOps WordPress plugin or enable the legacy WooCommerce REST API.

## Set up the WordPress store

1. In WordPress, open **Settings → Permalinks** and select a readable structure such as **Post name** if the site still uses **Plain**. Save the change.
2. Open **WooCommerce → Settings → Advanced → REST API** and select **Add key** or **Create an API key**.
3. Give the key a recognizable description such as `WooOps`, choose an appropriate WordPress user, and set **Permissions** to **Read/Write**.
4. Select **Generate API Key**. Copy both the Consumer Key (`ck_...`) and Consumer Secret (`cs_...`). WooCommerce displays the complete secret only when it creates the key.
5. Keep the keys private. The key inherits the selected WordPress user's capabilities; revoke it from the same REST API screen if it is exposed.

See WooCommerce's [REST API key guide](https://woocommerce.com/document/woocommerce-rest-api/) and [authentication guide](https://developer.woocommerce.com/docs/apis/rest-api/authentication) for the current WordPress screens and permission details.

## Run WooOps locally

```bash
git clone https://github.com/shantz1/wooops.git
cd wooops
npm ci
cp .env.example .env.local
```

On Windows PowerShell, use `Copy-Item .env.example .env.local` instead of `cp` if needed. Edit `.env.local`:

```dotenv
WOOCOMMERCE_URL=https://your-store.com
WOOCOMMERCE_CONSUMER_KEY=ck_your_key
WOOCOMMERCE_CONSUMER_SECRET=cs_your_secret

WOOOPS_ADMIN_PASSWORD=choose_a_strong_password
WOOOPS_SESSION_SECRET=generate_a_long_random_secret
```

`WOOCOMMERCE_URL` is the public base URL of the WordPress installation, including a subdirectory if WordPress lives in one. Do not append `/wp-json/wc/v3`. For a local WordPress installation, `http://localhost:PORT` is allowed.

Set **both** `WOOOPS_*` values before exposing WooOps to other users or the internet. The password enables the login screen; the secret signs a seven-day HTTP-only session cookie. If you set the password but omit the secret, access is denied. If you leave the password empty, WooOps is open to anyone who can reach it. Keep `.env.local` out of version control and use a long random secret.

Start the development server:

```bash
npm run dev
```

Open `http://localhost:3000`, sign in if you enabled the password, and visit **Settings → Store connection**. A successful connection check confirms that the configured API key can reach WooCommerce. Then check Orders, Customers, and Products with real store data.

## Self-host a production instance

Run WooOps on a server that can reach your WordPress store and accept browser traffic. Configure the same environment variables on that server, put WooOps behind HTTPS, then run:

```bash
npm ci
npm run lint
npm run build
npm start
```

`npm start` runs the Next.js server on port 3000 by default. Keep the process running with your usual service manager and terminate HTTPS at your reverse proxy or hosting platform. Next.js documents the [Node.js server deployment model](https://nextjs.org/docs/app/guides/deploying-to-platforms). This repository does not include a process manager or reverse proxy configuration.

## Optional WooCommerce webhooks

The MVP does not need webhooks to show current store data. To test signed delivery after WooOps has a public HTTPS URL:

1. Add a long random `WOOCOMMERCE_WEBHOOK_SECRET` to the WooOps server environment and restart WooOps.
2. In WordPress, open **WooCommerce → Settings → Advanced → Webhooks** and select **Add webhook**.
3. Give it a name, select an event topic such as **Order updated**, and set the delivery URL to `https://your-wooops-host/api/woo/webhooks`.
4. Enter the **same secret** in the webhook's Secret field, set the webhook to **Active**, and save it.
5. Check WooOps server logs for `WooCommerce webhook received`. You can inspect delivery attempts under **WooCommerce → Status → Logs** in WordPress.

WooCommerce sends an initial ping when an active webhook is first saved. It can disable a webhook after repeated failed deliveries. The WooOps endpoint returns success after validating the signature and logging the topic; it does not store the payload or refresh open browser pages. See WooCommerce's [webhook setup and troubleshooting guide](https://woocommerce.com/document/webhooks/).

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Settings says environment variables are not configured | Confirm all three `WOOCOMMERCE_*` connection values are set on the **WooOps server** and restart it. |
| WooCommerce returns 401 or 403 | Confirm the Consumer Key and Secret, the key's **Read/Write** permission, and the selected WordPress user's capabilities. Also check whether a proxy or security plugin strips the `Authorization` header. |
| WooCommerce returns 404 | Check the WordPress base URL and make sure permalinks are not set to **Plain**. |
| Settings cannot connect | Confirm the WooOps server can reach the store over HTTPS and that the store's certificate is valid. |
| Login does not work | Set both `WOOOPS_ADMIN_PASSWORD` and `WOOOPS_SESSION_SECRET`, then restart WooOps. |
| Webhook delivery fails | Confirm the public delivery URL, matching secrets, and WooCommerce delivery logs. |

## Current limits

WooOps is a **single-store MVP**. Everyone signs in with one shared password, independent of WordPress accounts; there are no named users, roles, audit log, rate limiting, persistent webhook jobs, or cross-store analytics. The dashboard summarizes only the latest five orders; customer and product tables currently display up to 50 results per search. The orders list has pagination. Test changes against a staging store before using real orders and inventory.

Order workspace limits: the totals breakdown uses WooCommerce's stored amounts and shows WooCommerce's own total; if the lines do not add up exactly (for example because of an extension), the page says so. Refunds are shown but cannot be created. Addresses, line items and tracking entries cannot be edited after saving (remove and re-add a tracking entry instead). Shipments do not record item quantities, and WooOps has no delivered status. Product stock saved from the products table still enables stock management for that product.

The next useful milestones are pagination for products and customers, correct managed/unmanaged stock handling, product editing, customer history, a full store dashboard, stronger multi-user authentication, and live integration testing with a staging WooCommerce store.

## Development

```bash
npm run lint
npm run build
npm test
```

`npm test` runs the order totals and currency arithmetic tests with Node's built-in test runner and needs Node.js 22.18 or newer, which loads the TypeScript sources directly. GitHub Actions runs `npm ci`, lint, and build for pushes and pull requests to `main`.

## License

[MIT](LICENSE)
