# WooOps

A modern, standalone operations panel for WooCommerce.

WooOps lets store teams manage the day-to-day work that normally sends them back into WordPress: orders, customers, products, stock and operational actions.

## What works

- Live WooCommerce dashboard data
- Order search, status filtering and pagination
- Order detail with status updates
- Bulk order status updates
- Customer listing and search
- Product listing, search and stock updates
- Order notes API
- WooCommerce connection health check
- Signed WooCommerce webhook endpoint
- Optional password-protected admin session
- Server-side WooCommerce credentials

## Architecture

- **Next.js 16 + TypeScript**
- **Tailwind CSS + shadcn/ui**
- **WooCommerce REST API** as the source of truth
- **WooCommerce webhooks** with signature verification and event logging
- No database required for the single-store deployment
- Credentials stay on the server

Next.js 16 uses asynchronous request APIs such as `params` and `cookies`; this project follows those conventions.

## Getting started

```bash
npm install
cp .env.example .env.local
npm run dev
```

Required store configuration:

```env
WOOCOMMERCE_URL=https://your-store.com
WOOCOMMERCE_CONSUMER_KEY=ck_your_consumer_key
WOOCOMMERCE_CONSUMER_SECRET=cs_your_consumer_secret
```

Optional protection:

```env
WOOOPS_ADMIN_PASSWORD=change_me
WOOOPS_SESSION_SECRET=generate_a_long_random_secret
WOOCOMMERCE_WEBHOOK_SECRET=your_webhook_secret
```

Set both `WOOOPS_*` variables to protect the admin with a seven-day signed HTTP-only session cookie. If the password is set without the session secret, access is denied until the secret is configured. Use a long random session secret. WooCommerce must be accessed over HTTPS (localhost is allowed for development).

Create WooCommerce REST API keys in **WooCommerce → Settings → Advanced → REST API**.

For webhooks, point WooCommerce to:

`POST /api/woo/webhooks`

and use the same secret configured in `WOOCOMMERCE_WEBHOOK_SECRET`.
The webhook endpoint verifies signatures and logs the event topic; it does not persist events or update a local database.

## Development

```bash
npm run lint
npm run build
npm start
```

## Roadmap

The core single-store MVP is implemented. Future releases can add:

1. Multi-store accounts
2. Database-backed users and roles
3. Shipping-provider integrations and tracking
4. Product creation/editing UI
5. Advanced analytics
6. Saved views and automation rules
7. Marketplace/channel integrations

## License

MIT
