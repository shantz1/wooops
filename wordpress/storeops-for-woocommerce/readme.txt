=== StoreOps for WooCommerce ===
Contributors: shantanuudasi
Tags: woocommerce, orders, shipment tracking, order notes, fulfilment
Requires at least: 6.5
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 0.1.0
License: MIT
License URI: https://opensource.org/licenses/MIT

A focused order workspace inside wp-admin: review orders, add private or customer notes and record shipment tracking.

== Description ==

StoreOps gives your team one fast screen for daily order work, without leaving WordPress.

* **Overview** of the five most recent orders, clearly labelled as a snapshot rather than store-wide totals.
* **Orders list** with search, status filter, pagination and bulk status changes (with a confirmation).
* **Order workspace** with items, photos, SKU and variation details, an exact totals breakdown (items, discount, fees, shipping, tax, refunds), shipping and billing addresses, the customer's checkout note, guest or registered customer, and payment details.
* **Order notes**: read and add private notes or customer-facing notes. The email consequence is shown before a customer note is added.
* **Shipment tracking** without another plugin: courier, tracking number, optional HTTPS tracking link and shipped date, stored on the order. Optionally add a customer-facing tracking note.

StoreOps uses WooCommerce's own REST API inside your site as the signed-in user. It needs no API keys, stores no data of its own beyond tracking on the order, and makes no requests to external services.

= Who can use it =

Users with the `manage_woocommerce` capability (Shop managers and Administrators). WooCommerce's normal permission checks also apply to every change.

= Emails =

Customer-facing notes are sent by WooCommerce's **Customer note** email to the order's billing email, if that email is enabled under WooCommerce → Settings → Emails. StoreOps reports only that WooCommerce accepted the note; it cannot confirm delivery. Changing an order status can also trigger WooCommerce's own status emails.

= Source code =

The JavaScript in `build/` is compiled from TypeScript and React source in the public repository: https://github.com/shantz1/wooops (the panel components are in `src/`, the plugin entry in `wordpress/`). Build it with `npm ci && npm run build:wp`.

== Installation ==

1. Install and activate WooCommerce.
2. Upload the `storeops-for-woocommerce` folder to `/wp-content/plugins/`, or upload the zip under Plugins → Add New → Upload Plugin.
3. Activate **StoreOps for WooCommerce**.
4. Open **StoreOps** in the admin menu.

== Frequently Asked Questions ==

= Does it change my orders automatically? =

No. Adding tracking does not change the order status and does not email anyone unless you choose to add a customer-facing note.

= Where is tracking stored? =

In the order's `wooops_shipments` metadata, in the same format as the standalone WooOps app, so both can be used on one store. It does not appear in other shipment tracking plugins.

= Can two people edit tracking on the same order at once? =

Avoid it. Tracking is saved as one value on the order; two simultaneous edits can overwrite each other. Reload the order before editing if others may be working on it.

= Does it support High-Performance Order Storage (HPOS)? =

Yes. It works through WooCommerce's REST controllers and declares HPOS compatibility.

= What about products, customers and reports? =

This first version covers orders. Use WooCommerce's screens for everything else for now.

== Privacy ==

StoreOps does not track users, send data to third parties or load remote assets. It displays customer details that WooCommerce already stores, only to users who can manage WooCommerce.

== Changelog ==

= 0.1.0 =
* First release: overview, orders list, order workspace, order notes and shipment tracking.
