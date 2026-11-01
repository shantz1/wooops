<?php
/** Real WordPress screen, nonce, per-user dismissal and redirect checks on a disposable local site. */
if ( ! in_array( wp_parse_url( home_url(), PHP_URL_HOST ), array( 'localhost', '127.0.0.1' ), true ) ) { throw new RuntimeException( 'Local disposable site only.' ); }
require_once ABSPATH . 'wp-admin/includes/screen.php';
class KartoDesk_Review_Test_Redirect extends RuntimeException { public $target; public function __construct( $target ) { $this->target = $target; } }
class KartoDesk_Review_Test_Die extends RuntimeException {}
$checks = 0;
$expect = static function ( $value, $message ) use ( &$checks ) { if ( ! $value ) { throw new RuntimeException( $message ); } ++$checks; };
$render = static function () { ob_start(); KartoDesk_Review::maybe_show(); return ob_get_clean(); };
$admin = get_users( array( 'role' => 'administrator', 'number' => 1 ) )[0]->ID;
$old_since = get_option( KartoDesk_Review::SINCE_OPTION, null );
$old_dismissed = get_user_meta( $admin, KartoDesk_Review::DISMISS_META, true );
$redirect = static function ( $location ) { throw new KartoDesk_Review_Test_Redirect( $location ); };
$die_handler = static function () { return static function () { throw new KartoDesk_Review_Test_Die(); }; };
add_filter( 'wp_redirect', $redirect, 1 );
add_filter( 'wp_die_handler', $die_handler, PHP_INT_MAX );
try {
	wp_set_current_user( $admin );
	delete_user_meta( $admin, KartoDesk_Review::DISMISS_META );
	delete_option( KartoDesk_Review::SINCE_OPTION );
	set_current_screen( 'dashboard' );
	$expect( '' === $render() && ! get_option( KartoDesk_Review::SINCE_OPTION ), 'Dashboard never displays a review prompt or starts its clock' );
	set_current_screen( 'toplevel_page_kartodesk' );
	$expect( '' === $render() && get_option( KartoDesk_Review::SINCE_OPTION ) >= time() - 5, 'First panel visit starts the clock without a prompt' );
	update_option( KartoDesk_Review::SINCE_OPTION, time() - 13 * DAY_IN_SECONDS );
	$expect( '' === $render(), 'Real WordPress suppresses the prompt before fourteen days' );
	update_option( KartoDesk_Review::SINCE_OPTION, time() - 15 * DAY_IN_SECONDS );
	$html = $render();
	$expect( false !== strpos( $html, 'Leave a review' ) && false !== strpos( $html, 'Do not show this again' ), 'Due prompt includes review and permanent dismissal' );
	preg_match( '/href="([^"]*admin-post\.php[^"]*)"/', $html, $match );
	parse_str( wp_parse_url( html_entity_decode( $match[1], ENT_QUOTES, 'UTF-8' ), PHP_URL_QUERY ), $query );
	$expect( false !== wp_verify_nonce( $query['_wpnonce'], KartoDesk_Review::ACTION ), 'Dismiss URL contains a valid WordPress nonce' );
	$_REQUEST['_wpnonce'] = 'invalid';
	try { KartoDesk_Review::dismiss(); throw new RuntimeException( 'Invalid nonce was accepted' ); } catch ( KartoDesk_Review_Test_Die $expected ) {}
	$expect( ! get_user_meta( $admin, KartoDesk_Review::DISMISS_META, true ), 'Native nonce failure leaves preference untouched' );
	$_REQUEST['_wpnonce'] = $query['_wpnonce'];
	$_REQUEST['redirect_to'] = 'https://attacker.example.invalid';
	try { KartoDesk_Review::dismiss(); throw new RuntimeException( 'Expected native redirect' ); } catch ( KartoDesk_Review_Test_Redirect $result ) {
		$expect( admin_url( 'admin.php?page=kartodesk' ) === $result->target, 'Native safe redirect returns to the fixed local panel' );
	}
	$expect( '1' === get_user_meta( $admin, KartoDesk_Review::DISMISS_META, true ) && '' === $render(), 'Native user metadata permanently dismisses the prompt' );
	wp_set_current_user( 0 );
	$expect( '' === $render(), 'An unauthenticated user never sees the prompt' );
	echo $checks . " real WordPress review-prompt checks passed\n";
} finally {
	wp_set_current_user( $admin );
	if ( null === $old_since ) { delete_option( KartoDesk_Review::SINCE_OPTION ); } else { update_option( KartoDesk_Review::SINCE_OPTION, $old_since ); }
	if ( '' === $old_dismissed ) { delete_user_meta( $admin, KartoDesk_Review::DISMISS_META ); } else { update_user_meta( $admin, KartoDesk_Review::DISMISS_META, $old_dismissed ); }
	remove_filter( 'wp_redirect', $redirect, 1 );
	remove_filter( 'wp_die_handler', $die_handler, PHP_INT_MAX );
	unset( $_REQUEST['_wpnonce'], $_REQUEST['redirect_to'] );
}
