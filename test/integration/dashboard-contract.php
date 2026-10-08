<?php
/** Deterministic WordPress/REST contract fixture; no database or real store is contacted. */
define( 'ABSPATH', __DIR__ );
define( 'KARTODESK_FILE', 'kartodesk.php' );
define( 'KARTODESK_VERSION', 'test' );
define( 'KARTODESK_DIR', __DIR__ . '/../../wordpress/kartodesk-for-woocommerce/' );
$user = 1;
$permissions = array( 'orders.view', 'settings.view' );
$meta = array();
$timezone = 'Asia/Kolkata';
$wc_allowed = true;
$missing_total = false;
$reads = array();
$widgets = array( 'existing' => 'unchanged' );
$styles = array();
$scripts = array();
$contexts = array();
$routes = array();
$statuses = array( 'wc-processing' => 'Processing', 'wc-awaiting-payment' => 'Awaiting payment', 'wc-ready-to-ship' => 'Ready <b>to ship</b>' );
class KartoDesk_Access {
	const MENU_CAPABILITY = 'kartodesk_access';
	public static function can( $permission ) { return in_array( $permission, $GLOBALS['permissions'], true ); }
}
trait KartoDesk_Catalog {}
class WP_REST_Request {
	public $method;
	public $route;
	public $query = array();
	public $body;
	public function __construct( $method, $route ) { $this->method = $method; $this->route = $route; }
	public function set_query_params( $query ) { $this->query = $query; }
	public function get_param( $key ) { return isset( $this->query[ $key ] ) ? $this->query[ $key ] : null; }
	public function get_json_params() { return $this->body; }
	public function get_body() { return json_encode( $this->body ); }
}
class WP_REST_Response {
	public $data;
	public $status;
	public $headers;
	public function __construct( $data, $status = 200, $headers = array() ) { $this->data = $data; $this->status = $status; $this->headers = $headers; }
	public function get_data() { return $this->data; }
	public function get_status() { return $this->status; }
	public function get_headers() { return $this->headers; }
	public function is_error() { return $this->status >= 400; }
}
function __( $text, $domain = null ) { return $text; }
function esc_html( $text ) { return htmlspecialchars( (string) $text, ENT_QUOTES, 'UTF-8' ); }
function esc_html__( $text, $domain = null ) { return esc_html( $text ); }
function esc_url( $text ) { return esc_html( $text ); }
function wp_strip_all_tags( $text ) { return strip_tags( $text ); }
function wp_timezone() { return new DateTimeZone( $GLOBALS['timezone'] ); }
function wp_timezone_string() { return $GLOBALS['timezone']; }
function get_current_user_id() { return $GLOBALS['user']; }
function get_user_meta( $user, $key, $single ) { return isset( $GLOBALS['meta'][ $user ][ $key ] ) ? $GLOBALS['meta'][ $user ][ $key ] : ''; }
function update_user_meta( $user, $key, $value ) { $GLOBALS['meta'][ $user ][ $key ] = $value; return true; }
function wc_get_order_statuses() { return $GLOBALS['statuses']; }
function current_user_can( $capability ) { return 'read_private_shop_orders' === $capability ? $GLOBALS['wc_allowed'] : (bool) $GLOBALS['permissions']; }
function register_rest_route( $namespace, $route, $endpoints ) { $GLOBALS['routes'][ $route ] = $endpoints; }
function add_action( $hook, $callback ) {}
function wp_add_dashboard_widget( $id, $title, $callback, $control = null, $args = null, $context = 'normal' ) { $GLOBALS['widgets'][ $id ] = $callback; $GLOBALS['contexts'][ $id ] = $context; }
function wp_enqueue_style( $handle, $src, $dependencies, $version ) { $GLOBALS['styles'][] = $handle; }
function wp_enqueue_script( $handle, $src, $dependencies, $version, $footer ) { $GLOBALS['scripts'][] = array( $handle, $dependencies, $footer ); }
function do_meta_boxes( $screen, $context, $object ) { echo '<div id="' . esc_html( $context ) . '-sortables" class="meta-box-sortables"></div>'; }
function plugins_url( $path, $file ) { return '/plugins/kartodesk/' . $path; }
function admin_url( $path ) { return '/wp-admin/' . $path; }
function number_format_i18n( $number ) { return number_format( $number ); }
function wc_get_price_decimals() { return 2; }
function wc_price( $amount, $args ) { return '<span>' . $args['currency'] . ' ' . number_format( $amount, 2, '.', '' ) . '</span>'; }
function rest_do_request( $request ) {
	$GLOBALS['reads'][] = $request->query;
	if ( ! $GLOBALS['wc_allowed'] ) { return new WP_REST_Response( array(), 403 ); }
	if ( 5 === $request->query['per_page'] ) {
		return new WP_REST_Response( array(
			array( 'status' => 'processing', 'customer_id' => 9, 'currency' => 'INR', 'total' => '0.10' ),
			array( 'status' => 'on-hold', 'customer_id' => 9, 'currency' => 'INR', 'total' => '0.20' ),
			array( 'status' => 'completed', 'customer_id' => 0, 'currency' => 'INR', 'total' => '1.01' ),
		) );
	}
	return new WP_REST_Response( array( array( 'id' => 1 ) ), 200, $GLOBALS['missing_total'] ? array() : array( 'X-WP-Total' => '23' ) );
}
require __DIR__ . '/../../wordpress/kartodesk-for-woocommerce/includes/class-kartodesk-rest.php';
require __DIR__ . '/../../wordpress/kartodesk-for-woocommerce/includes/class-kartodesk-dashboard.php';
$checks = 0;
function expect( $condition, $message ) {
	if ( ! $condition ) { throw new RuntimeException( $message ); }
	++$GLOBALS['checks'];
}
function expect_error( $callback, $status ) {
	try { $callback(); } catch ( KartoDesk_Error $error ) { expect( $error->status === $status, 'Wrong error status' ); return; }
	throw new RuntimeException( 'Expected error ' . $status );
}

expect( KartoDesk_Dashboard::preferences()['cards'] === KartoDesk_Dashboard::DEFAULT_CARDS, 'Default cards preserved' );
KartoDesk_Dashboard::register_widget();
expect( isset( $widgets['kartodesk_overview'] ) && 'unchanged' === $widgets['existing'], 'Widget enabled by default; existing widgets preserved' );
expect( 'kartodesk' === $contexts['kartodesk_overview'], 'Full-width widget has its own native context' );
expect( array( 'dashboard' ) === $scripts[0][1] && true === $scripts[0][2], 'Placement script loads with WordPress dashboard controls' );
ob_start(); KartoDesk_Dashboard::render_widget_area(); $area = ob_get_clean();
expect( false !== strpos( $area, 'id="kartodesk-dashboard-wide"' ) && false !== strpos( $area, 'id="kartodesk-sortables"' ), 'Full-width row uses native sortable wrapper' );
unset( $widgets['kartodesk_overview'] );
$selection = array( 'cards' => array( 'orders_today', 'orders_week', 'status:awaiting-payment', 'status:ready-to-ship' ), 'widget_enabled' => true );
KartoDesk_Dashboard::save_preferences( $selection );
expect( KartoDesk_Dashboard::preferences() === $selection, 'Selection order preserved' );
$user = 2;
expect( true === KartoDesk_Dashboard::preferences()['widget_enabled'] && KartoDesk_Dashboard::DEFAULT_CARDS === KartoDesk_Dashboard::preferences()['cards'], 'New user gets defaults, not another user selection' );
KartoDesk_Dashboard::save_preferences( array( 'cards' => array( 'orders_today' ), 'widget_enabled' => false ) );
KartoDesk_Dashboard::register_widget();
expect( ! isset( $widgets['kartodesk_overview'] ), 'Saved off choice is preserved' );
ob_start(); KartoDesk_Dashboard::render_widget_area(); $area = ob_get_clean();
expect( '' === $area, 'Disabled widget adds no full-width area' );
$user = 1;
foreach ( array( array(), array( 'orders_today', 'orders_today' ), array( 'status:trash' ), array( 'status:checkout-draft' ), array( 'status:unknown' ), array( 'orders_today', 'orders_week', 'recent_orders', 'recent_value', 'recent_customers' ) ) as $cards ) {
	expect_error( static function () use ( $cards ) { KartoDesk_Dashboard::save_preferences( array( 'cards' => $cards, 'widget_enabled' => true ) ); }, 400 );
}
expect( KartoDesk_Dashboard::preferences() === $selection, 'Bad input never overwrites preferences' );
$permissions = array( 'orders.view' );
expect_error( static function () use ( $selection ) { KartoDesk_Dashboard::save_preferences( $selection ); }, 403 );
$permissions = array( 'settings.view' );
expect_error( static function () { KartoDesk_Dashboard::metrics( array( 'orders_today' ) ); }, 403 );
KartoDesk_Dashboard::register_widget();
expect( ! isset( $widgets['kartodesk_overview'] ), 'No orders permission means no widget' );
$permissions = array( 'orders.view', 'settings.view' );
$wc_allowed = false;
KartoDesk_Dashboard::register_widget();
expect( ! isset( $widgets['kartodesk_overview'] ), 'WooCommerce permission also required' );
expect_error( static function () { KartoDesk_Dashboard::metrics( array( 'orders_today' ) ); }, 403 );
$wc_allowed = true;
KartoDesk_Dashboard::register_widget();
expect( isset( $widgets['kartodesk_overview'] ) && 'unchanged' === $widgets['existing'], 'Native widget preserves existing widgets' );
$metrics = KartoDesk_Dashboard::metrics( $selection['cards'] );
expect( array_fill_keys( $selection['cards'], 23 ) === $metrics['counts'], 'Total headers used, not returned row count' );
expect( 1 === $reads[count( $reads ) - 1]['per_page'], 'Count reads bounded to one row' );
$before = count( $reads );
expect_error( static function () { KartoDesk_Dashboard::metrics( array( 'recent_value' ) ); }, 400 );
expect_error( static function () { KartoDesk_Dashboard::metrics( array( 'status:unknown' ) ); }, 400 );
expect( $before === count( $reads ), 'Invalid count reads never reach WooCommerce' );
$missing_total = true;
expect_error( static function () { KartoDesk_Dashboard::metrics( array( 'orders_today' ) ); }, 502 );
$missing_total = false;
$query = KartoDesk_Dashboard::count_query( 'orders_today', new DateTimeImmutable( '2026-10-07T20:00:00Z' ) );
expect( '2026-10-07T18:30:00' === $query['after'] && '2026-10-08T18:29:59' === $query['before'], 'IST midnight boundaries' );
$timezone = 'America/New_York';
$query = KartoDesk_Dashboard::count_query( 'orders_week', new DateTimeImmutable( '2026-03-08T18:00:00Z' ) );
expect( '2026-03-02T05:00:00' === $query['after'] && '2026-03-09T03:59:59' === $query['before'], 'DST week boundaries' );
$timezone = 'Asia/Kolkata';
ob_start(); KartoDesk_Dashboard::render_widget(); $html = ob_get_clean();
expect( false !== strpos( $html, 'Ready to ship' ) && false === strpos( $html, '<b>' ), 'Custom status label is plain text' );
expect( 4 === substr_count( $html, 'class="kartodesk-widget-card"' ), 'Widget uses the same selected cards' );
KartoDesk_Dashboard::save_preferences( array( 'cards' => KartoDesk_Dashboard::DEFAULT_CARDS, 'widget_enabled' => true ) );
ob_start(); KartoDesk_Dashboard::render_widget(); $html = ob_get_clean();
expect( false !== strpos( $html, 'INR 1.31' ), 'Recent values sum currency amounts' );
expect( false !== strpos( $html, '<strong>1</strong>' ), 'Registered customers exclude guests and duplicates' );
KartoDesk_Rest::register_routes();
$preferences_route = $routes['/dashboard/preferences'];
$metrics_route = $routes['/dashboard/metrics'][0];
$permissions = array( 'orders.view' );
expect( call_user_func( $preferences_route[0]['permission_callback'] ), 'Preference reads allowed to panel users' );
expect( ! call_user_func( $preferences_route[1]['permission_callback'] ), 'Preference writes need Settings permission' );
expect( call_user_func( $metrics_route['permission_callback'] ), 'Order readers allowed metric route' );
$permissions = array( 'products.view' );
expect( ! call_user_func( $metrics_route['permission_callback'] ), 'Catalogue-only users refused metric route' );
$permissions = array( 'settings.view', 'orders.view' );
$request = new WP_REST_Request( 'PUT', '/dashboard/preferences' );
$request->body = $selection;
expect( $selection === call_user_func( $preferences_route[1]['callback'], $request )->get_data(), 'REST preference body contract' );
$request = new WP_REST_Request( 'GET', '/dashboard/metrics' );
$request->set_query_params( array( 'cards' => 'orders_today,status:ready-to-ship' ) );
expect( array( 'orders_today' => 23, 'status:ready-to-ship' => 23 ) === call_user_func( $metrics_route['callback'], $request )->get_data()['counts'], 'REST metrics query contract' );
echo $checks . " dashboard contract checks passed\n";
