# WooOps

**A standalone operations panel for one WooCommerce store.** Work through orders, customers, products, and stock in a focused interface while WooCommerce remains the source of truth.

WooOps is a self-hosted Next.js 16 application. It talks to the WooCommerce REST API through server-side route handlers, so API keys are never sent to the browser. The MVP needs one Node.js process and no WooOps database, Redis, or Docker setup.

## What you can do

| Area | MVP capability |
| --- | --- |
| Overview | See the five latest orders and summaries calculated from those five orders. These are **not** store-wide analytics. |
| Orders | Search, filter by status, paginate, open an order, change its status, and update selected orders in bulk. |
| Customers | Search and view the first 50 matching customers. |
| Products and inventory | Search and view the first 50 matching products; update non-negative stock quantities. |
| Connection | Check the WooCommerce API connection on the Settings page. |
| API | Read and add order notes. There is no notes UI yet. |
| Webhooks | Verify WooCommerce signatures and log event topics. No event persistence or background sync yet. |

The application also exposes order and product creation routes and an order deletion route, but the MVP has no UI for those actions. Treat the API as an administrative interface.

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

WooOps is a **single-store MVP**. There are no named users, roles, audit log, rate limiting, persistent webhook jobs, or cross-store analytics. The dashboard summarizes only the latest five orders; customer and product tables currently display up to 50 results per search. The orders list has pagination. Test changes against a staging store before using real orders and inventory.

The next useful milestones are a full store dashboard, pagination for products and customers, an order notes UI, stronger multi-user authentication, and live integration testing with a WooCommerce store.

## Development

```bash
npm run lint
npm run build
```

GitHub Actions runs `npm ci`, lint, and build for pushes and pull requests to `main`.

## License

[MIT](LICENSE)
