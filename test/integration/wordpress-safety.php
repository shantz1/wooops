<?php
// Run via wp-cli eval-file against a disposable localhost installation only.
if ( ! defined( 'ABSPATH' ) || ! in_array( wp_parse_url( home_url(), PHP_URL_HOST ), array( 'localhost', '127.0.0.1' ), true ) ) {
	throw new RuntimeException( 'Use a disposable localhost WordPress site only.' );
}
$reader = new ReflectionMethod( 'KartoDesk_Rest', 'read_shipments' );
$reader->setAccessible( true );
$checks = 0;
foreach ( array( '{}', '{not json', 'null', '[{}]' ) as $value ) {
	try {
		$reader->invoke( null, array( 'meta_data' => array( array( 'id' => 1, 'key' => 'wooops_shipments', 'value' => $value ) ) ) );
		throw new RuntimeException( 'Malformed tracking was accepted.' );
	} catch ( KartoDesk_Error $error ) {
		if ( 409 !== $error->status ) { throw $error; }
		++$checks;
	}
}
$empty = $reader->invoke( null, array( 'meta_data' => array( array( 'id' => 1, 'key' => 'wooops_shipments', 'value' => '[]' ) ) ) );
if ( array( 1, array() ) !== $empty ) { throw new RuntimeException( 'Empty tracking list was not preserved.' ); }
++ $checks;

$admins = get_users( array( 'role' => 'administrator', 'number' => 1, 'fields' => 'ID' ) );
if ( ! $admins ) { throw new RuntimeException( 'The disposable site needs an administrator.' ); }
wp_set_current_user( (int) $admins[0] );
$old_timezone = get_option( 'timezone_string' );
update_option( 'timezone_string', 'Asia/Kolkata' );
$capture = array();
$mock = static function ( $result, $server, $request ) use ( &$capture ) {
	if ( '/wc/v3/orders' !== $request->get_route() ) { return $result; }
	$capture[] = $request->get_query_params();
	$page = (int) $request->get_param( 'page' );
	$rows = array();
	for ( $id = ( $page - 1 ) * 100 + 1; $id <= $page * 100; ++$id ) {
		$rows[] = array( 'id' => $id, 'number' => (string) $id, 'status' => 'completed', 'currency' => 'INR', 'total' => '10.00', 'date_created' => '2026-10-01T12:00:00', 'billing' => array( 'email' => 'private@example.invalid' ), 'refunds' => array() );
	}
	return new WP_REST_Response( $rows, 200, array( 'X-WP-Total' => 505, 'X-WP-TotalPages' => 6 ) );
};
add_filter( 'rest_pre_dispatch', $mock, 10, 3 );
try {
	$request = new WP_REST_Request( 'GET', '/kartodesk/v1/reports' );
	$request->set_query_params( array( 'kind' => 'orders', 'from' => '2026-10-01', 'to' => '2026-10-02' ) );
	$response = rest_do_request( $request );
	$data = $response->get_data();
	if ( 200 !== $response->get_status() || 500 !== $data['loaded'] || $data['complete'] || 505 !== $data['total'] || count( $capture ) !== 5 ) {
		throw new RuntimeException( 'Report limit or completeness failed.' );
	}
	if ( '2026-09-30T18:30:00' !== $capture[0]['after'] || '2026-10-02T18:29:59' !== $capture[0]['before'] || ! $capture[0]['dates_are_gmt'] ) {
		throw new RuntimeException( 'Store timezone conversion failed.' );
	}
	if ( isset( $data['orders'][0]['billing'] ) ) { throw new RuntimeException( 'Report exposed contact fields.' ); }
	$checks += 3;
} finally {
	remove_filter( 'rest_pre_dispatch', $mock, 10 );
	update_option( 'timezone_string', $old_timezone );
}
echo $checks . " tracking/report safety checks passed.\n";

// The plugin must not register any front-end URL (the pre-release /manage/ route was removed).
global $wp_rewrite;
foreach ( array_keys( (array) $wp_rewrite->extra_rules_top ) as $rule ) {
	if ( false !== strpos( (string) $wp_rewrite->extra_rules_top[ $rule ], 'storeops_panel' ) || '^manage/?$' === $rule ) {
		throw new RuntimeException( 'KartoDesk still registers a front-end route.' );
	}
}
if ( has_action( 'template_redirect', array( 'KartoDesk_Admin', 'clean_panel' ) ) ) {
	throw new RuntimeException( 'KartoDesk still intercepts front-end requests.' );
}
echo "No front-end routes are registered.\n";
