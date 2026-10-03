<?php
/**
 * Plugin Name:       KartoDesk for WooCommerce
 * Plugin URI:        https://github.com/shantz1/wooops
 * Description:       A store operations workspace inside wp-admin: orders, products, stock, customers, reports and shipment tracking.
 * Version:           0.1.2
 * Requires at least: 6.5
 * Requires PHP:      7.4
 * Requires Plugins:  woocommerce
 * Author:            Shantanu Udasi
 * License:           MIT
 * License URI:       https://opensource.org/licenses/MIT
 * Text Domain:       kartodesk-for-woocommerce
 *
 * WC requires at least: 8.0
 *
 * @package KartoDesk
 */

defined( 'ABSPATH' ) || exit;

define( 'KARTODESK_VERSION', '0.1.2' );
define( 'KARTODESK_FILE', __FILE__ );
define( 'KARTODESK_DIR', plugin_dir_path( __FILE__ ) );

require_once KARTODESK_DIR . 'includes/trait-kartodesk-catalog.php';
require_once KARTODESK_DIR . 'includes/class-kartodesk-rest.php';
require_once KARTODESK_DIR . 'includes/class-kartodesk-admin.php';

register_activation_hook( KARTODESK_FILE, static function () {
	KartoDesk_Admin::register_clean_route();
	flush_rewrite_rules();
} );
register_deactivation_hook( KARTODESK_FILE, static function () {
	global $wp_rewrite;
	unset( $wp_rewrite->extra_rules_top['^manage/?$'] );
	flush_rewrite_rules();
} );

// KartoDesk uses WooCommerce's REST controllers and order CRUD, which support High-Performance Order Storage.
add_action(
	'before_woocommerce_init',
	static function () {
		if ( class_exists( \Automattic\WooCommerce\Utilities\FeaturesUtil::class ) ) {
			\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'custom_order_tables', KARTODESK_FILE, true );
		}
	}
);

add_action(
	'plugins_loaded',
	static function () {
		if ( ! class_exists( 'WooCommerce' ) ) {
			add_action( 'admin_notices', array( 'KartoDesk_Admin', 'missing_woocommerce_notice' ) );
			return;
		}
		KartoDesk_Rest::init();
		KartoDesk_Admin::init();
	}
);
