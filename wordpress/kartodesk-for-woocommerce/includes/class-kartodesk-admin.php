<?php
/**
 * The wp-admin page that hosts the KartoDesk panel.
 *
 * @package KartoDesk
 */

defined( 'ABSPATH' ) || exit;

/**
 * Registers the admin menu and loads the panel bundle on that page only.
 */
class KartoDesk_Admin {

	const PAGE = 'kartodesk';

	/**
	 * Screens implemented by the plugin. Keep in sync with wordpress/app/main.tsx.
	 */
	const FEATURES = array( '/', '/orders', '/products', '/customers', '/inventory', '/reports', '/settings' );

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
		add_filter( 'script_loader_tag', array( __CLASS__, 'module_script' ), 10, 2 );
		add_filter( 'admin_body_class', array( __CLASS__, 'body_class' ) );
		add_filter( 'plugin_action_links_' . plugin_basename( KARTODESK_FILE ), array( __CLASS__, 'action_links' ) );
	}

	/**
	 * Adds the top-level KartoDesk menu for users who can manage WooCommerce.
	 */
	public static function register_menu() {
		self::$hook = add_menu_page(
			__( 'KartoDesk', 'kartodesk-for-woocommerce' ),
			__( 'KartoDesk', 'kartodesk-for-woocommerce' ),
			'manage_woocommerce',
			self::PAGE,
			array( __CLASS__, 'render' ),
			'dashicons-clipboard',
			56
		);
	}

	/**
	 * Prints the mount point. The workspace stays inside its own wp-admin page.
	 */
	public static function render() {
		echo '<div id="kartodesk-root" class="kartodesk-root"><p style="padding:2rem">' . esc_html__( 'Loading KartoDesk…', 'kartodesk-for-woocommerce' ) . '</p><noscript><p>' . esc_html__( 'KartoDesk needs JavaScript enabled.', 'kartodesk-for-woocommerce' ) . '</p></noscript></div>';
	}

	/**
	 * Loads the bundle and prints its configuration on the KartoDesk page only.
	 *
	 * @param string $hook_suffix Current admin page hook.
	 */
	public static function enqueue( $hook_suffix ) {
		if ( $hook_suffix !== self::$hook ) {
			return;
		}
		$build = KARTODESK_DIR . 'build/';
		if ( ! file_exists( $build . 'app.js' ) ) {
			add_action( 'admin_notices', array( __CLASS__, 'missing_build_notice' ) );
			return;
		}
		$url = plugins_url( 'build/', KARTODESK_FILE );
		wp_enqueue_style( 'kartodesk-app', $url . 'app.css', array(), KARTODESK_VERSION . '-' . filemtime( $build . 'app.css' ) );
		wp_enqueue_script( 'kartodesk-app', $url . 'app.js', array(), KARTODESK_VERSION . '-' . filemtime( $build . 'app.js' ), true );

		$config = array(
			'platform'  => 'wordpress',
			'restRoot'  => esc_url_raw( rest_url( KartoDesk_Rest::REST_NAMESPACE . '/' ) ),
			'nonce'     => wp_create_nonce( 'wp_rest' ),
			'assetsUrl' => $url,
			'adminUrl'  => admin_url(),
			'features'  => self::FEATURES,
		);
		wp_add_inline_script( 'kartodesk-app', 'window.kartoDeskConfig = ' . wp_json_encode( $config ) . ';', 'before' );
	}

	/** The entry uses local ES modules so each screen can load its own chunk. */
	public static function module_script( $tag, $handle ) {
		if ( 'kartodesk-app' !== $handle ) {
			return $tag;
		}
		$tag = preg_replace( '/\s+type=([\x27\x22]).*?\1/', '', $tag );
		return str_replace( '<script ', '<script type="module" ', $tag );
	}

	/**
	 * Marks only the KartoDesk page for scoped embedded workspace styles.
	 *
	 * @param string $classes Space-separated body classes.
	 * @return string
	 */
	public static function body_class( $classes ) {
		$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
		if ( $screen && $screen->id === self::$hook ) {
			$classes .= ' kartodesk-admin';
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
		array_unshift( $links, '<a href="' . esc_url( admin_url( 'admin.php?page=' . self::PAGE ) ) . '">' . esc_html__( 'Open', 'kartodesk-for-woocommerce' ) . '</a>' );
		return $links;
	}

	/**
	 * Shown when WooCommerce is not active.
	 */
	public static function missing_woocommerce_notice() {
		$screen = get_current_screen();
		if ( ! $screen || 'plugins' !== $screen->id ) {
			return;
		}
		echo '<div class="notice notice-error is-dismissible"><p>' . esc_html__( 'KartoDesk for WooCommerce requires WooCommerce to be installed and active.', 'kartodesk-for-woocommerce' ) . '</p></div>';
	}

	/**
	 * Shown when the plugin was installed from source without running the build.
	 */
	public static function missing_build_notice() {
		echo '<div class="notice notice-error"><p>' . esc_html__( 'KartoDesk is missing its build files. Install a packaged release, or run "npm run build:wp" in the source repository.', 'kartodesk-for-woocommerce' ) . '</p></div>';
	}
}
