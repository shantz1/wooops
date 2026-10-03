<?php
/**
 * The wp-admin page that hosts the StoreOps panel.
 *
 * @package StoreOps
 */

defined( 'ABSPATH' ) || exit;

/**
 * Registers the admin menu and loads the panel bundle on that page only.
 */
class StoreOps_Admin {

	const PAGE = 'storeops';

	/**
	 * Screens implemented by the plugin. Keep in sync with wordpress/app/main.tsx.
	 */
	const FEATURES = array( '/', '/orders' );

	/**
	 * Hook suffix returned by add_menu_page().
	 *
	 * @var string
	 */
	private static $hook = '';

	/**
	 * Registers hooks.
	 */
	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'register_menu' ) );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueue' ) );
		add_filter( 'admin_body_class', array( __CLASS__, 'body_class' ) );
		add_filter( 'plugin_action_links_' . plugin_basename( STOREOPS_FILE ), array( __CLASS__, 'action_links' ) );
	}

	/**
	 * Adds the top-level StoreOps menu for users who can manage WooCommerce.
	 */
	public static function register_menu() {
		self::$hook = add_menu_page(
			__( 'StoreOps', 'storeops-for-woocommerce' ),
			__( 'StoreOps', 'storeops-for-woocommerce' ),
			'manage_woocommerce',
			self::PAGE,
			array( __CLASS__, 'render' ),
			'dashicons-clipboard',
			56
		);
	}

	/**
	 * Prints the mount point. The panel renders full screen over wp-admin.
	 */
	public static function render() {
		echo '<div id="storeops-root" class="storeops-root"><p style="padding:2rem">' . esc_html__( 'Loading StoreOps…', 'storeops-for-woocommerce' ) . '</p></div>';
		echo '<noscript><p>' . esc_html__( 'StoreOps needs JavaScript enabled.', 'storeops-for-woocommerce' ) . '</p></noscript>';
	}

	/**
	 * Loads the bundle and prints its configuration on the StoreOps page only.
	 *
	 * @param string $hook_suffix Current admin page hook.
	 */
	public static function enqueue( $hook_suffix ) {
		if ( $hook_suffix !== self::$hook ) {
			return;
		}
		$build = STOREOPS_DIR . 'build/';
		if ( ! file_exists( $build . 'app.js' ) ) {
			add_action( 'admin_notices', array( __CLASS__, 'missing_build_notice' ) );
			return;
		}
		$url = plugins_url( 'build/', STOREOPS_FILE );
		wp_enqueue_style( 'storeops-app', $url . 'app.css', array(), STOREOPS_VERSION . '-' . filemtime( $build . 'app.css' ) );
		wp_enqueue_script( 'storeops-app', $url . 'app.js', array(), STOREOPS_VERSION . '-' . filemtime( $build . 'app.js' ), true );

		$config = array(
			'platform'  => 'wordpress',
			'restRoot'  => esc_url_raw( rest_url( StoreOps_Rest::REST_NAMESPACE . '/' ) ),
			'nonce'     => wp_create_nonce( 'wp_rest' ),
			'assetsUrl' => $url,
			'adminUrl'  => admin_url(),
			'features'  => self::FEATURES,
		);
		wp_add_inline_script( 'storeops-app', 'window.storeOpsConfig = ' . wp_json_encode( $config ) . ';', 'before' );
	}

	/**
	 * Marks the StoreOps page so its stylesheet can stop wp-admin from scrolling behind the panel.
	 *
	 * @param string $classes Space-separated body classes.
	 * @return string
	 */
	public static function body_class( $classes ) {
		$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
		if ( $screen && $screen->id === self::$hook ) {
			$classes .= ' storeops-app';
		}
		return $classes;
	}

	/**
	 * Adds an "Open" link on the Plugins screen.
	 *
	 * @param array $links Existing links.
	 * @return array
	 */
	public static function action_links( $links ) {
		array_unshift( $links, '<a href="' . esc_url( admin_url( 'admin.php?page=' . self::PAGE ) ) . '">' . esc_html__( 'Open', 'storeops-for-woocommerce' ) . '</a>' );
		return $links;
	}

	/**
	 * Shown when WooCommerce is not active.
	 */
	public static function missing_woocommerce_notice() {
		echo '<div class="notice notice-error"><p>' . esc_html__( 'StoreOps for WooCommerce requires WooCommerce to be installed and active.', 'storeops-for-woocommerce' ) . '</p></div>';
	}

	/**
	 * Shown when the plugin was installed from source without running the build.
	 */
	public static function missing_build_notice() {
		echo '<div class="notice notice-error"><p>' . esc_html__( 'StoreOps is missing its build files. Install a packaged release, or run "npm run build:wp" in the source repository.', 'storeops-for-woocommerce' ) . '</p></div>';
	}
}
