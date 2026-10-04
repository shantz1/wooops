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
		add_action( 'init', array( __CLASS__, 'redirect_legacy_page' ), 1 );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueue' ) );
		add_filter( 'script_loader_tag', array( __CLASS__, 'module_script' ), 10, 2 );
		add_filter( 'admin_body_class', array( __CLASS__, 'body_class' ) );
		add_filter( 'plugin_action_links_' . plugin_basename( KARTODESK_FILE ), array( __CLASS__, 'action_links' ) );
		add_action( 'init', array( __CLASS__, 'register_clean_route' ) );
		add_filter( 'query_vars', array( __CLASS__, 'query_vars' ) );
		add_action( 'parse_request', array( __CLASS__, 'preserve_manage_page' ) );
		add_action( 'template_redirect', array( __CLASS__, 'clean_panel' ), 0 );
	}

	/** Preserve old bookmarks while moving the visible admin URL to the new name. */
	public static function redirect_legacy_page() {
		// A read-only navigation redirect; no state is changed and no nonce is required.
		$page = isset( $_GET['page'] ) ? sanitize_text_field( wp_unslash( $_GET['page'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		if ( is_admin() && 'storeops' === $page && current_user_can( 'manage_woocommerce' ) ) {
			wp_safe_redirect( admin_url( 'admin.php?page=' . self::PAGE ) );
			exit;
		}
	}

	/** A clean entry point; never replace an existing /manage page. */
	public static function register_clean_route() {
		if ( ! get_page_by_path( 'manage' ) ) {
			add_rewrite_rule( '^manage/?$', 'index.php?storeops_panel=1', 'top' );
		}
	}

	/** Register the private panel route flag. */
	public static function query_vars( $vars ) {
		$vars[] = 'storeops_panel';
		return $vars;
	}

	/** A page created after activation also wins over a previously saved rewrite rule. */
	public static function preserve_manage_page( $wp ) {
		if ( ! empty( $wp->query_vars['storeops_panel'] ) && get_page_by_path( 'manage' ) ) {
			unset( $wp->query_vars['storeops_panel'] );
			$wp->query_vars['pagename'] = 'manage';
		}
	}

	/** Serve just the panel, without loading the storefront theme or wp-admin. */
	public static function clean_panel() {
		if ( ! get_query_var( 'storeops_panel' ) || get_page_by_path( 'manage' ) ) {
			return;
		}
		nocache_headers();
		header( 'X-Frame-Options: DENY' );
		header( "Content-Security-Policy: frame-ancestors 'none'; base-uri 'self'; object-src 'none'" );
		header( 'X-Content-Type-Options: nosniff' );
		header( 'Referrer-Policy: no-referrer' );
		if ( ! is_user_logged_in() ) {
			wp_safe_redirect( wp_login_url( home_url( '/manage/' ) ) );
			exit;
		}
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_die( esc_html__( 'You do not have permission to open KartoDesk.', 'kartodesk-for-woocommerce' ), '', array( 'response' => 403 ) );
		}
		status_header( 200 );
		self::enqueue_assets();
		echo '<!doctype html><html ';
		language_attributes();
		echo '><head><meta charset="' . esc_attr( get_bloginfo( 'charset' ) ) . '"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><link rel="icon" type="image/svg+xml" href="' . esc_url( plugins_url( 'build/kartodesk.svg', KARTODESK_FILE ) ) . '"><title>' . esc_html__( 'KartoDesk', 'kartodesk-for-woocommerce' ) . '</title>';
		wp_print_styles( array( 'storeops-app' ) );
		echo '</head><body class="storeops-app">';
		self::render();
		wp_print_scripts( array( 'storeops-app' ) );
		echo '</body></html>';
		exit;
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
		echo '<div id="storeops-root" class="storeops-root"><p style="padding:2rem">' . esc_html__( 'Loading KartoDesk…', 'kartodesk-for-woocommerce' ) . '</p><noscript><p>' . esc_html__( 'KartoDesk needs JavaScript enabled.', 'kartodesk-for-woocommerce' ) . '</p></noscript></div>';
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
		self::enqueue_assets();
	}

	/** Enqueue the same assets and authenticated configuration in either entry point. */
	private static function enqueue_assets() {
		$build = KARTODESK_DIR . 'build/';
		if ( ! file_exists( $build . 'app.js' ) ) {
			add_action( 'admin_notices', array( __CLASS__, 'missing_build_notice' ) );
			return;
		}
		$url = plugins_url( 'build/', KARTODESK_FILE );
		wp_enqueue_style( 'storeops-app', $url . 'app.css', array(), KARTODESK_VERSION . '-' . filemtime( $build . 'app.css' ) );
		wp_enqueue_script( 'storeops-app', $url . 'app.js', array(), KARTODESK_VERSION . '-' . filemtime( $build . 'app.js' ), true );

		$config = array(
			'platform'  => 'wordpress',
			'restRoot'  => esc_url_raw( rest_url( KartoDesk_Rest::REST_NAMESPACE . '/' ) ),
			'nonce'     => wp_create_nonce( 'wp_rest' ),
			'assetsUrl' => $url,
			'adminUrl'  => admin_url(),
			'features'  => self::FEATURES,
		);
		wp_add_inline_script( 'storeops-app', 'window.kartoDeskConfig = ' . wp_json_encode( $config ) . ';', 'before' );
	}

	/** The entry uses local ES modules so each screen can load its own chunk. */
	public static function module_script( $tag, $handle ) {
		if ( 'storeops-app' !== $handle ) {
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
			$classes .= ' storeops-admin';
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
