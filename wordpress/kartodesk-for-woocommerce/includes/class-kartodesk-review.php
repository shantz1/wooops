<?php
/**
 * An optional, dismissible request for an honest review.
 *
 * Shown only on the KartoDesk screen, only to people who can use KartoDesk, and only after the panel has been
 * in use for two weeks. One link to WordPress.org (the same for everyone, whatever they think of the plugin) and
 * one permanent "do not show this again". No reward, no rating gate, nothing on other admin pages.
 *
 * @package KartoDesk
 */

defined( 'ABSPATH' ) || exit;

/**
 * Review request.
 */
class KartoDesk_Review {

	const URL          = 'https://wordpress.org/support/plugin/kartodesk-for-woocommerce/reviews/#new-post';
	const SINCE_OPTION = 'kartodesk_first_seen';
	const DISMISS_META = 'kartodesk_review_dismissed';
	const ACTION       = 'kartodesk_dismiss_review';
	const DELAY        = 1209600; // Fourteen days in seconds.

	/**
	 * Registers hooks.
	 */
	public static function init() {
		add_action( 'admin_notices', array( __CLASS__, 'maybe_show' ) );
		add_action( 'admin_post_' . self::ACTION, array( __CLASS__, 'dismiss' ) );
		add_filter( 'plugin_row_meta', array( __CLASS__, 'row_meta' ), 10, 2 );
	}

	/**
	 * Adds a plain "Rate this plugin" link to the Plugins screen. It opens WordPress.org; nothing is sent from the site.
	 *
	 * @param string[] $links Existing links.
	 * @param string   $file  Plugin file.
	 * @return string[]
	 */
	public static function row_meta( $links, $file ) {
		if ( plugin_basename( KARTODESK_FILE ) === $file ) {
			$links[] = '<a href="' . esc_url( self::URL ) . '" target="_blank" rel="noopener noreferrer">' . esc_html__( 'Rate this plugin', 'kartodesk-for-woocommerce' ) . '</a>';
		}
		return $links;
	}

	/**
	 * Shows the request on the KartoDesk screen once it is due.
	 */
	public static function maybe_show() {
		$screen = get_current_screen();
		if ( ! $screen || 'toplevel_page_' . KartoDesk_Admin::PAGE !== $screen->id || ! current_user_can( KartoDesk_Access::MENU_CAPABILITY ) ) {
			return;
		}
		// The two weeks start the first time the panel is opened, so a site that never uses it is never asked.
		$since = (int) get_option( self::SINCE_OPTION, 0 );
		if ( ! $since ) {
			update_option( self::SINCE_OPTION, time(), false );
			return;
		}
		if ( time() - $since < self::DELAY || get_user_meta( get_current_user_id(), self::DISMISS_META, true ) ) {
			return;
		}
		$dismiss = wp_nonce_url( admin_url( 'admin-post.php?action=' . self::ACTION ), self::ACTION );
		echo '<div class="notice notice-info"><p>';
		esc_html_e( 'If KartoDesk is useful to you, an honest review on WordPress.org helps other store owners decide. It is entirely optional.', 'kartodesk-for-woocommerce' );
		echo ' <a href="' . esc_url( self::URL ) . '" target="_blank" rel="noopener noreferrer">' . esc_html__( 'Leave a review', 'kartodesk-for-woocommerce' ) . '</a> &middot; ';
		echo '<a href="' . esc_url( $dismiss ) . '">' . esc_html__( 'Do not show this again', 'kartodesk-for-woocommerce' ) . '</a>';
		echo '</p></div>';
	}

	/**
	 * Permanently hides the request for the current user.
	 */
	public static function dismiss() {
		if ( ! current_user_can( KartoDesk_Access::MENU_CAPABILITY ) ) {
			wp_die( esc_html__( 'Your role does not allow this action.', 'kartodesk-for-woocommerce' ), '', array( 'response' => 403 ) );
		}
		check_admin_referer( self::ACTION );
		if ( ! get_user_meta( get_current_user_id(), self::DISMISS_META, true ) && ! update_user_meta( get_current_user_id(), self::DISMISS_META, 1 ) ) {
			wp_die( esc_html__( 'Could not save your preference. Please go back and try again.', 'kartodesk-for-woocommerce' ), '', array( 'response' => 500 ) );
		}
		wp_safe_redirect( admin_url( 'admin.php?page=' . KartoDesk_Admin::PAGE ) );
		exit;
	}
}
