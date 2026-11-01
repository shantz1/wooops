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
	const FOCUS_OPTION = 'kartodesk_shop_manager_focus';
	const FOCUS_ROLES_OPTION = 'kartodesk_focus_roles';

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
		add_action( 'admin_head', array( __CLASS__, 'focus_styles' ) );
		add_action( 'admin_post_kartodesk_focus_settings', array( __CLASS__, 'save_focus_settings' ) );
		add_filter( 'plugin_action_links_' . plugin_basename( KARTODESK_FILE ), array( __CLASS__, 'action_links' ) );
	}

	/**
	 * Adds the top-level KartoDesk menu for users who can manage WooCommerce.
	 */
	public static function register_menu() {
		self::$hook = add_menu_page(
			__( 'KartoDesk', 'kartodesk-for-woocommerce' ),
			__( 'KartoDesk', 'kartodesk-for-woocommerce' ),
			KartoDesk_Access::MENU_CAPABILITY,
			self::PAGE,
			array( __CLASS__, 'render' ),
			'dashicons-clipboard',
			56
		);
		add_submenu_page( self::PAGE, __( 'Display settings', 'kartodesk-for-woocommerce' ), __( 'Display settings', 'kartodesk-for-woocommerce' ), 'manage_options', 'kartodesk-display-settings', array( __CLASS__, 'focus_settings' ) );
	}

	/** Administrator-controlled display preference, separate from access permissions. */
	public static function focus_settings() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You cannot change these settings.', 'kartodesk-for-woocommerce' ) );
		}
		echo '<div class="wrap"><h1>' . esc_html__( 'KartoDesk display settings', 'kartodesk-for-woocommerce' ) . '</h1><form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
		wp_nonce_field( 'kartodesk_focus_settings' );
		echo '<input type="hidden" name="action" value="kartodesk_focus_settings"><p>' . esc_html__( 'Hide the WordPress sidebar and toolbar on the KartoDesk screen for selected roles:', 'kartodesk-for-woocommerce' ) . '</p>';
		$selected = self::focus_roles();
		foreach ( wp_roles()->get_names() as $role => $name ) {
			if ( 'administrator' === $role ) {
				continue;
			}
			echo '<p><label><input type="checkbox" name="roles[]" value="' . esc_attr( $role ) . '" ' . checked( in_array( $role, $selected, true ), true, false ) . '> ' . esc_html( translate_user_role( $name ) ) . '</label></p>';
		}
		echo '<p>' . esc_html__( 'Administrators keep the normal WordPress interface. This changes the display only; permissions and direct links are unchanged.', 'kartodesk-for-woocommerce' ) . '</p>';
		submit_button();
		echo '</form></div>';
	}

	public static function save_focus_settings() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You cannot change these settings.', 'kartodesk-for-woocommerce' ) );
		}
		check_admin_referer( 'kartodesk_focus_settings' );
		$submitted = isset( $_POST['roles'] ) && is_array( $_POST['roles'] ) ? array_map( 'sanitize_text_field', wp_unslash( $_POST['roles'] ) ) : array();
		$allowed   = array_keys( wp_roles()->get_names() );
		$selected  = array();
		foreach ( $submitted as $role ) {
			if ( is_string( $role ) && 'administrator' !== $role && in_array( $role, $allowed, true ) ) {
				$selected[] = $role;
			}
		}
		update_option( self::FOCUS_ROLES_OPTION, array_values( array_unique( $selected ) ) );
		delete_option( self::FOCUS_OPTION );
		wp_safe_redirect( admin_url( 'admin.php?page=kartodesk-display-settings' ) );
		exit;
	}

	private static function focus_roles() {
		$roles = get_option( self::FOCUS_ROLES_OPTION, null );
		if ( ! is_array( $roles ) ) {
			return '1' === get_option( self::FOCUS_OPTION, '0' ) ? array( 'shop_manager' ) : array();
		}
		return $roles;
	}

	/** Apply only to the workspace, never administrators or other admin screens. */
	public static function focus_styles() {
		$screen = get_current_screen();
		$user   = wp_get_current_user();
		if ( ! $screen || $screen->id !== self::$hook || current_user_can( 'manage_options' ) || is_super_admin() || ! array_intersect( (array) $user->roles, self::focus_roles() ) ) {
			return;
		}
		echo '<style>body.kartodesk-admin{background:#f3f5f7}html.dark body.kartodesk-admin{background:#17191c}body.kartodesk-admin #adminmenumain,body.kartodesk-admin #wpadminbar{display:none!important}body.kartodesk-admin #wpcontent,body.kartodesk-admin #wpfooter{margin-left:0!important}html.wp-toolbar{padding-top:0!important}@media screen and (max-width:782px){html.wp-toolbar{padding-top:0!important}body.kartodesk-admin #wpcontent{padding-left:10px}}</style>';
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
