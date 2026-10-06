=== KartoDesk for WooCommerce ===
Contributors: shantz1
Tags: woocommerce, orders, shipment tracking, order notes, fulfilment
Requires at least: 6.5
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 0.1.7
License: MIT
License URI: https://opensource.org/licenses/MIT

A focused order workspace inside wp-admin: review orders, add private or customer notes and record shipment tracking.

== Description ==

KartoDesk gives your team one fast screen for daily order work, without leaving WordPress.

* **Overview** of the five most recent orders, clearly labelled as a snapshot rather than store-wide totals.
* **Orders list** with search, status filter, pagination and bulk status changes (with a confirmation).
* **Order workspace** with items, photos, SKU and variation details, an exact totals breakdown (items, discount, fees, shipping, tax, refunds), shipping and billing addresses, the customer's checkout note, guest or registered customer, and payment details.
* **Products and inventory**: browse products, create simple products using Media Library image URLs and update stock.
* **Customers**: search registered customers.
* **Reports**: filter orders and inventory and export CSV.
* **Settings**: panel name and theme, store details and WordPress account access.
* **Order notes**: read and add private notes or customer-facing notes. The email consequence is shown before a customer note is added.
* **Shipment tracking** without another plugin: courier, tracking number, optional HTTPS tracking link and shipped date, stored on the order. Optionally add a customer-facing tracking note.

KartoDesk uses WooCommerce's own REST API inside your site as the signed-in user. It needs no API keys, stores no data of its own beyond tracking on the order, and makes no requests to external services.

= Who can use it =

Administrators always have full access, and Shop managers start with full access. Under KartoDesk > Settings, administrators choose what each other role can do: view orders, change order status, add private notes, notify customers, manage shipment tracking, view products, edit products, change stock, view customers, view reports, open settings, issue refunds, manage discounts, edit customers and run maintenance tools. Permissions are standard WordPress capabilities (prefixed `kartodesk_`), so role-editor plugins can manage them as well. WooCommerce's own permission checks still apply to every request.

= Emails =

Customer-facing notes are sent by WooCommerce's **Customer note** email to the order's billing email, if that email is enabled under WooCommerce → Settings → Emails. KartoDesk reports only that WooCommerce accepted the note; it cannot confirm delivery. Changing an order status can also trigger WooCommerce's own status emails.

= Source code =

The JavaScript in `build/` is compiled from TypeScript and React source in the public repository: https://github.com/shantz1/wooops (the panel components are in `src/`, the plugin entry in `wordpress/`). Build it with `npm ci && npm run build:wp`.

== Installation ==

1. Install and activate WooCommerce.
2. Upload the `kartodesk-for-woocommerce` folder to `/wp-content/plugins/`, or upload the zip under Plugins → Add New → Upload Plugin.
3. Activate **KartoDesk for WooCommerce**.
4. Open **KartoDesk** in the admin menu.

== Frequently Asked Questions ==

= Does it change my orders automatically? =

No. Adding tracking does not change the order status and does not email anyone unless you choose to add a customer-facing note.

= Where is tracking stored? =

In the order's `wooops_shipments` metadata, in the same format as the standalone WooOps app, so both can be used on one store. It does not appear in other shipment tracking plugins.

= Can two people edit tracking on the same order at once? =

Avoid it. Tracking is saved as one value on the order; two simultaneous edits can overwrite each other. Reload the order before editing if others may be working on it.

= Does it support High-Performance Order Storage (HPOS)? =

Yes. It works through WooCommerce's REST controllers and declares HPOS compatibility.

= What else can I manage? =

Products, simple product creation, stock, registered customers, order and inventory reports with CSV, and panel settings. Product and customer lists have pagination. Reports load up to 500 records and flag incomplete results; inventory reports exclude variation stock. Enabling stock management requires explicit confirmation.

== Screenshots ==

1. Overview with the latest orders and store snapshot.
2. Orders list with search, status filter, column choice and row density.
3. Saved views for quick filters such as Processing, On hold, Failed and Completed.
4. Select several orders to change their status in one step.
5. Order summary with items, totals, customer, shipping address and payment details.
6. Edit shipping and billing addresses with validation and a save bar.
7. Courier tracking on an order, with optional customer notification.
8. Payments tab with refund history and what is left to refund.
9. Guided refund form with item quantities, tax split, restock option and a record-only or gateway choice.
10. Product catalogue with stock controls.
11. Product editor with a visual editor for descriptions.
12. Inventory view for stock quantity and status.
13. Customers list with orders and spend.
14. Order reports with date filters and CSV export.
15. Settings with store details, panel preferences and customer notifications.
16. Roles and permissions: choose what each WordPress role can do in KartoDesk.
17. Role details, for example a fulfilment role limited to orders and tracking.

== Privacy ==

KartoDesk does not track users or send telemetry. Its own scripts and styles load locally; product images can use the store's image or CDN URLs. It displays customer details that WooCommerce already stores, only to users who can manage WooCommerce.

== Changelog ==

= 0.1.7 =
* Add order address editing and refunds with tax breakdowns, refund history and duplicate-request checks.
* Add per-user saved order views, column controls and list density preferences.
* Add visual editors for product descriptions, short descriptions and purchase notes, and refresh the panel styling.
* Add permissions for issuing refunds, managing discounts, editing customers and running maintenance tools. Administrators and Shop managers receive them automatically; other roles keep exactly what they had.

= 0.1.6 =
* Add permission-based access: choose per WordPress role who can view orders, change status, add notes, notify customers, manage tracking, view or edit products, change stock, view customers, view reports and open settings.
* Administrators always keep full access; Shop managers keep full access by default.
* Remove KartoDesk capabilities from all roles when the plugin is deleted.

= 0.1.5 =
* Add a product editor for descriptions, pricing, image URLs and galleries, stock, shipping and related products.
* Add categories, attribute terms, variations and review moderation to the product workspace.
* Separate catalogue editing from inventory quantity operations.
* Detect stale product edits before saving.

= 0.1.4 =
* Use a vertical KartoDesk menu inside its admin page (a drawer on small screens), alongside the WordPress menu.
* Remove the separate front-end panel URL; KartoDesk opens from its admin menu only.
* Use the kartodesk prefix for all handles and identifiers.

= 0.1.3 =
* Keep WordPress navigation and other plugins' notices visible on the KartoDesk admin page.
* Scope the WooCommerce dependency notice to the Plugins screen.
* Keep the separate /manage workspace available.

= 0.1.2 =
* Support registered custom order statuses in filters, status updates and reports.
* Preserve order list filters in URLs and add previous/next order navigation.
* Add printable packing slips and editable courier tracking-link suggestions.
* Wait for packing slip data before printing.

= 0.1.1 =
* Load screens on demand and share concurrent reads.
* Reduce list/report payloads; paginate products and customers.
* Prevent caching of private API responses and bound write payloads.
* Require confirmation before enabling product stock management.

= 0.1.0 =
* Initial release with overview, orders, products, customers, inventory, reports, settings, notes and tracking.
