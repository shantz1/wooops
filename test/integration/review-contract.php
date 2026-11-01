<?php
/** Review-prompt contract tests with WordPress function stubs. No real site or email is contacted. */
define( 'ABSPATH', __DIR__ );
define( 'KARTODESK_FILE', '/plugins/kartodesk-for-woocommerce/kartodesk-for-woocommerce.php' );
$screen = null;
$allowed = true;
$user = 1;
$options = array();
$meta = array();
$nonce_valid = true;
$write_fails = false;
$writes = 0;
$nonce_checks = 0;
$hooks = array();
class KartoDesk_Admin { const PAGE = 'kartodesk'; }
class KartoDesk_Access { const MENU_CAPABILITY = 'kartodesk_access'; }
class Review_Fixture_Error extends RuntimeException { public $status; public function __construct( $status ) { $this->status = $status; } }
class Review_Fixture_Redirect extends RuntimeException { public $url; public function __construct( $url ) { $this->url = $url; } }
function add_action( $hook, $callback ) { $GLOBALS['hooks'][ $hook ] = $callback; }
function add_filter( $hook, $callback, $priority, $args ) { $GLOBALS['hooks'][ $hook ] = array( $callback, $args ); }
function get_current_screen() { return $GLOBALS['screen']; }
function current_user_can( $capability ) { return KartoDesk_Access::MENU_CAPABILITY === $capability && $GLOBALS['allowed']; }
function get_current_user_id() { return $GLOBALS['user']; }
function get_option( $key, $fallback ) { return isset( $GLOBALS['options'][ $key ] ) ? $GLOBALS['options'][ $key ] : $fallback; }
function update_option( $key, $value, $autoload ) { $GLOBALS['options'][ $key ] = $value; $GLOBALS['autoload'] = $autoload; return true; }
function get_user_meta( $user, $key, $single ) { return isset( $GLOBALS['meta'][ $user ][ $key ] ) ? $GLOBALS['meta'][ $user ][ $key ] : ''; }
function update_user_meta( $user, $key, $value ) { ++$GLOBALS['writes']; if ( $GLOBALS['write_fails'] ) { return false; } $GLOBALS['meta'][ $user ][ $key ] = $value; return true; }
function plugin_basename( $file ) { return 'kartodesk-for-woocommerce/' . basename( $file ); }
function admin_url( $path ) { return 'https://store.example.invalid/wp-admin/' . $path; }
function wp_nonce_url( $url, $action ) { $GLOBALS['nonce_action'] = $action; return $url . '&_wpnonce=fixture'; }
function check_admin_referer( $action ) { ++$GLOBALS['nonce_checks']; if ( ! $GLOBALS['nonce_valid'] || KartoDesk_Review::ACTION !== $action ) { throw new Review_Fixture_Error( 403 ); } }
function esc_html( $text ) { return htmlspecialchars( (string) $text, ENT_QUOTES, 'UTF-8' ); }
function esc_url( $text ) { return esc_html( $text ); }
function esc_html__( $text, $domain ) { return esc_html( $text ); }
function esc_html_e( $text, $domain ) { echo esc_html( $text ); }
function wp_die( $message, $title, $args ) { throw new Review_Fixture_Error( $args['response'] ); }
function wp_safe_redirect( $url ) { throw new Review_Fixture_Redirect( $url ); }
require __DIR__ . '/../../wordpress/kartodesk-for-woocommerce/includes/class-kartodesk-review.php';
$checks = 0;
function expect( $condition, $message ) { if ( ! $condition ) { throw new RuntimeException( $message ); } ++$GLOBALS['checks']; }
function notice() { ob_start(); KartoDesk_Review::maybe_show(); return ob_get_clean(); }
function error_status( $callback ) { try { $callback(); } catch ( Review_Fixture_Error $error ) { return $error->status; } throw new RuntimeException( 'Expected failure' ); }
function dismissal_redirect() { try { KartoDesk_Review::dismiss(); } catch ( Review_Fixture_Redirect $redirect ) { return $redirect->url; } throw new RuntimeException( 'Expected fixed redirect' ); }

KartoDesk_Review::init();
expect( isset( $hooks['admin_notices'], $hooks['admin_post_' . KartoDesk_Review::ACTION], $hooks['plugin_row_meta'] ), 'Hooks registered' );
expect( ! isset( $hooks['admin_post_nopriv_' . KartoDesk_Review::ACTION] ), 'No anonymous dismissal handler' );
expect( '' === notice() && ! $options, 'No screen means no prompt or clock' );
foreach ( array( 'dashboard', 'plugins', 'woocommerce_page_wc-admin', 'toplevel_page_another-plugin' ) as $id ) {
	$screen = (object) array( 'id' => $id );
	expect( '' === notice() && ! $options, 'No prompt or clock on ' . $id );
}
$screen = (object) array( 'id' => 'toplevel_page_kartodesk' );
$allowed = false;
expect( '' === notice() && ! $options, 'Unauthorised user cannot start the clock' );
$allowed = true;
$before = time();
expect( '' === notice(), 'First open never asks for a review' );
expect( $options[KartoDesk_Review::SINCE_OPTION] >= $before && $options[KartoDesk_Review::SINCE_OPTION] <= time(), 'Clock starts at first authorised panel open' );
expect( false === $autoload, 'Review timestamp does not autoload on every site request' );
$started = $options[KartoDesk_Review::SINCE_OPTION];
expect( '' === notice() && $started === $options[KartoDesk_Review::SINCE_OPTION], 'Later visits do not reset the clock' );
$options[KartoDesk_Review::SINCE_OPTION] = time() - KartoDesk_Review::DELAY + 60;
expect( '' === notice(), 'Not shown before 14 days' );
$options[KartoDesk_Review::SINCE_OPTION] = time() + 100;
expect( '' === notice(), 'A future timestamp cannot make the prompt due' );
$options[KartoDesk_Review::SINCE_OPTION] = time() - KartoDesk_Review::DELAY;
$html = notice();
expect( false !== strpos( $html, 'an honest review' ) && false !== strpos( $html, 'entirely optional' ), 'Neutral, optional wording at the 14-day boundary' );
expect( false !== strpos( $html, KartoDesk_Review::URL ), 'Direct link to the review page' );
expect( false !== strpos( $html, 'Do not show this again' ) && false !== strpos( $html, '_wpnonce=fixture' ), 'Permanent dismissal link contains a nonce' );
expect( KartoDesk_Review::ACTION === $nonce_action, 'Nonce is specific to dismissal' );
expect( false !== strpos( $html, 'rel="noopener noreferrer"' ), 'External link opens without an opener or referrer' );
$options_before = $options;
$writes_before = $writes;
notice();
expect( $options === $options_before && $writes === $writes_before, 'Showing a due notice does not write user data' );
$allowed = false;
expect( '' === notice(), 'Permission revocation suppresses an already-due prompt' );
expect( 403 === error_status( static function () { KartoDesk_Review::dismiss(); } ) && $writes_before === $writes && 0 === $nonce_checks, 'Capability denial happens before dismissal writes' );
$allowed = true;
$nonce_valid = false;
expect( 403 === error_status( static function () { KartoDesk_Review::dismiss(); } ) && $writes_before === $writes, 'Invalid nonce never changes dismissal state' );
$nonce_valid = true;
$write_fails = true;
expect( 500 === error_status( static function () { KartoDesk_Review::dismiss(); } ) && ! get_user_meta( 1, KartoDesk_Review::DISMISS_META, true ), 'A failed write reports failure instead of a success redirect' );
$write_fails = false;
$_REQUEST['redirect_to'] = 'https://attacker.example.invalid';
expect( admin_url( 'admin.php?page=kartodesk' ) === dismissal_redirect(), 'Redirect is fixed to the panel, never a supplied URL' );
expect( 1 === get_user_meta( 1, KartoDesk_Review::DISMISS_META, true ) && '' === notice(), 'Successful dismissal is permanent for this user' );
$options[KartoDesk_Review::SINCE_OPTION] = time() - KartoDesk_Review::DELAY * 3;
expect( '' === notice(), 'Dismissal stays effective well beyond the delay' );
$writes_before = $writes;
expect( admin_url( 'admin.php?page=kartodesk' ) === dismissal_redirect() && $writes === $writes_before, 'Repeated dismissal is idempotent' );
$user = 2;
expect( false !== strpos( notice(), KartoDesk_Review::URL ), 'One user cannot dismiss the prompt for another' );
expect( ! get_user_meta( 2, KartoDesk_Review::DISMISS_META, true ), 'Other users retain their own dismissal state' );
$original = array( 'existing link' );
expect( $original === KartoDesk_Review::row_meta( $original, 'another-plugin/plugin.php' ), 'Other plugin rows stay unchanged' );
$links = KartoDesk_Review::row_meta( $original, plugin_basename( KARTODESK_FILE ) );
expect( 2 === count( $links ) && 'existing link' === $links[0], 'Own plugin row appends one link' );
expect( false !== strpos( $links[1], KartoDesk_Review::URL ) && false !== strpos( $links[1], 'Rate this plugin' ), 'Plugin row uses the same review destination' );
echo $checks . " review-prompt contract checks passed\n";
