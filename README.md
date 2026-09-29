# WooOps

A modern, standalone operations panel for WooCommerce.

WooOps is designed for store teams who want to manage orders, customers, products and inventory without repeatedly going back into WordPress/wp-admin.

## Architecture

- **Next.js + TypeScript** — application and server-side API layer
- **Tailwind CSS + shadcn/ui** — interface
- **WooCommerce REST API** — source of truth
- **WooCommerce webhooks** — planned for live events
- **Server-side credentials** — WooCommerce keys are never exposed to the browser

## Getting started

```bash
npm install
cp .env.example .env.local
npm run dev
```

Add your WooCommerce REST API credentials to `.env.local`:

```env
WOOCOMMERCE_URL=https://your-store.com
WOOCOMMERCE_CONSUMER_KEY=ck_your_consumer_key
WOOCOMMERCE_CONSUMER_SECRET=cs_your_consumer_secret
```

Create the keys in **WooCommerce → Settings → Advanced → REST API**.

Open `http://localhost:3000`.

## Current scope

The initial shell includes the dashboard, orders, products, customers, inventory and store connection areas, plus the server-side WooCommerce client and orders API route.

### Roadmap

1. Live orders list with search, filters and pagination
2. Order detail and status/payment actions
3. Bulk order operations
4. Customers and order history
5. Products and inventory updates
6. Shipment/tracking workflow
7. Webhook-driven live updates
8. Multi-store support and authentication

## Contributing

Create a feature branch from `main`, keep changes focused, and open a pull request with a clear description and screenshots for UI changes.

## License

MIT
