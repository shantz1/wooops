# WooOps

A clean, self-hosted admin panel for your WooCommerce store. Manage daily operations without opening WordPress admin each time.

**One store. No extra plugin or database. API keys stay on the server.**

## What you can do

- Search orders, update statuses individually or in bulk, and view items, photos, addresses, payments and refunds.
- Add private notes or customer-facing notes, and save courier tracking with a tracking link.
- Find registered customers, browse products, create simple products and update stock.
- Generate order and inventory reports and export CSV.
- Customize the panel name and light/dark theme in Settings.

## 1. Prepare WordPress

You need a working WooCommerce store with HTTPS and **Node.js 22.18+** on the computer or server running WooOps.

1. In WordPress, open **Settings > Permalinks**. Use a structure such as **Post name**, rather than **Plain**.
2. Open **WooCommerce > Settings > Advanced > REST API > Add key**.
3. Name it `WooOps`, choose a user with store management access, and select **Read/Write** permissions.
4. Generate the key and copy the **Consumer Key** and **Consumer Secret**. Keep both private.
5. Under **Settings > General > Timezone**, choose your store timezone. For IST, select **Kolkata** (`Asia/Kolkata`). WooOps follows this setting; refresh the panel after changing it.

[Official API key setup guide](https://woocommerce.com/document/woocommerce-rest-api/)

## 2. Connect WooOps

```bash
git clone https://github.com/shantz1/wooops.git
cd wooops
npm ci
cp .env.example .env.local
```

On Windows PowerShell, use `Copy-Item .env.example .env.local` for the last command.

Edit `.env.local`:

```dotenv
WOOCOMMERCE_URL=https://your-store.com
WOOCOMMERCE_CONSUMER_KEY=ck_your_key
WOOCOMMERCE_CONSUMER_SECRET=cs_your_secret
WOOOPS_ADMIN_PASSWORD=your_strong_password
WOOOPS_SESSION_SECRET=your_long_random_secret
```

Use the WordPress base URL, including its subdirectory if applicable. Do not add `/wp-json/wc/v3`. HTTP is allowed only for localhost development.

Generate a random session secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Set both login values before sharing the panel.** Login uses your WooOps password, independently of WordPress users. Without a password, anyone who can reach the panel can access it. Never commit `.env.local` or share your keys.

## 3. Start the panel

```bash
npm run dev
```

Open **http://localhost:3000**, sign in, and check the connection under **Settings**. You can then use Orders, Products, Customers and Reports.

For production hosting:

```bash
npm ci
npm run build
npm start
```

Configure the same environment values on your server, serve the panel over HTTPS, and keep the process running with your hosting service or process manager.

## Tracking and customer emails

Open an order to add a courier, tracking number and optional HTTPS link. No tracking plugin is needed. Select **Notify customer** when you want a customer-facing tracking note; it is off by default.

Enable **Customer note** under **WooCommerce > Settings > Emails** and check that your store sends mail. WooOps confirms the store accepted a note, not that the email was delivered. Status changes may also trigger store emails.

If an email outcome is uncertain, check the order notes before sending again. Avoid editing the same order's tracking simultaneously: another person's change can be overwritten.

## Know the current limits

- One store and one shared admin password; no staff roles or audit log yet.
- Overview summarizes the latest five orders. Customers and products show up to 50 results per search; Orders has pagination.
- Reports load up to 500 records and flag incomplete results. Order values are not profit or confirmed revenue; refunds relate to orders created in the selected period. Inventory reports exclude variation quantities.
- Product creation supports simple products and an existing image URL. Saving a stock quantity enables stock management.
- Tracking is specific to WooOps. Saved tracking details must be removed and re-added to change them. Test writes and emails on staging first.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| Connection fails | Base URL, HTTPS, API keys, Read/Write permission and the key owner's access. |
| Store returns 404 | WordPress permalinks must not be Plain. |
| Login fails | Set both login values and restart WooOps. |
| Times show UTC | Check the WordPress timezone and the connection. Settings warns if WooOps cannot read it. |
| Customer emails do not arrive | Customer note email settings and the store's mail delivery. |

Restart WooOps after changing environment values.

## Developer checks

```bash
npm run lint
npm test
npm run build
npx tsc --noEmit
npm run test:integration
```

Integration tests use an isolated mock store, not your live store. Optional signed webhooks can be configured at `/api/woo/webhooks` using `WOOCOMMERCE_WEBHOOK_SECRET`; they currently log events only.

## License

[MIT](LICENSE)
