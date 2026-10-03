<?php
/**
 * Plugin Name:       StoreOps for WooCommerce
 * Plugin URI:        https://github.com/shantz1/wooops
 * Description:       A focused order operations workspace inside wp-admin: orders, order details, notes and shipment tracking.
 * Version:           0.1.0
 * Requires at least: 6.5
 * Requires PHP:      7.4
 * Requires Plugins:  woocommerce
 * Author:            Shantanu Udasi
 * License:           MIT
 * License URI:       https://opensource.org/licenses/MIT
 * Text Domain:       storeops-for-woocommerce
 *
 * WC requires at least: 8.0
 *
 * @package StoreOps
 */

defined( 'ABSPATH' ) || exit;

define( 'STOREOPS_VERSION', '0.1.0' );
define( 'STOREOPS_FILE', __FILE__ );
define( 'STOREOPS_DIR', plugin_dir_path( __FILE__ ) );

require_once STOREOPS_DIR . 'includes/class-storeops-rest.php';
require_once STOREOPS_DIR . 'includes/class-storeops-admin.php';

// StoreOps uses WooCommerce's REST controllers and order CRUD, which support High-Performance Order Storage.
add_action(
	'before_woocommerce_init',
	static function () {
		if ( class_exists( \Automattic\WooCommerce\Utilities\FeaturesUtil::class ) ) {
			\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'custom_order_tables', STOREOPS_FILE, true );
		}
	}
);

add_action(
	'plugins_loaded',
	static function () {
		if ( ! class_exists( 'WooCommerce' ) ) {
			add_action( 'admin_notices', array( 'StoreOps_Admin', 'missing_woocommerce_notice' ) );
			return;
		}
		StoreOps_Rest::init();
		StoreOps_Admin::init();
	}
);
