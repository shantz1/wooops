<?php
// Run via wp-cli eval-file on a disposable localhost WordPress site only.
if ( ! defined( 'ABSPATH' ) || ! in_array( wp_parse_url( home_url(), PHP_URL_HOST ), array( 'localhost', '127.0.0.1' ), true ) ) { throw new RuntimeException( 'Local test site only.' ); }
add_filter( 'pre_wp_mail', '__return_true' );
$admin = get_users( array( 'role' => 'administrator', 'number' => 1, 'fields' => 'ID' ) )[0];
$checks = 0;
$expect = static function ( $ok, $label ) use ( &$checks ) { if ( ! $ok ) { throw new RuntimeException( $label ); } ++$checks; };
$call = static function ( $user, $path, $method = 'GET', $body = null ) {
	// Model a fresh HTTP request after a role change, rather than retaining WP_User's cached grants.
	wp_set_current_user( 0 );
	wp_set_current_user( $user );
	$parts = explode( '?', $path, 2 );
	$request = new WP_REST_Request( $method, '/kartodesk/v1/' . $parts[0] );
	if ( isset( $parts[1] ) ) { parse_str( $parts[1], $query ); $request->set_query_params( $query ); }
	if ( null !== $body ) { $request->set_header( 'Content-Type', 'application/json' ); $request->set_body( wp_json_encode( $body ) ); }
	$response = rest_do_request( $request );
	return array( $response->get_status(), json_decode( wp_json_encode( $response->get_data() ), true ) );
};
$suffix = 'kdtest_' . wp_generate_password( 8, false );
$role = add_role( $suffix, 'Permission test', array( 'read' => true, 'read_private_shop_orders' => true, 'publish_shop_orders' => true, 'edit_shop_orders' => true, 'edit_others_shop_orders' => true, 'read_private_products' => true, 'edit_products' => true, 'edit_others_products' => true ) );
$user = wp_insert_user( array( 'user_login' => $suffix, 'user_pass' => wp_generate_password(), 'role' => $suffix ) );
$order = wc_create_order( array( 'status' => 'processing' ) );
$product = new WC_Product_Simple(); $product->set_name( 'Permission test' ); $product->set_status( 'draft' ); $product->set_manage_stock( true ); $product->set_stock_quantity( 5 ); $product->save();
try {
	KartoDesk_Access::update_role( $suffix, array( 'orders.view', 'orders.notes', 'orders.shipments' ) );
	list( $status, $data ) = $call( $user, 'timezone' );
	$expect( 200 === $status && 3 === count( $data['access']['permissions'] ), 'Packer grants' );
	list( $status ) = $call( $user, 'woo/orders/' . $order->get_id() ); $expect( 200 === $status, 'Packer read' );
	foreach ( array( array( 'woo/orders/' . $order->get_id(), 'PATCH', array( 'status' => 'completed' ) ), array( 'woo/orders/bulk', 'POST', array( 'ids' => array( $order->get_id() ), 'status' => 'completed' ) ), array( 'woo/orders/' . $order->get_id() . '/notes', 'POST', array( 'note' => 'No email', 'customer_note' => true ) ), array( 'woo/orders/' . $order->get_id() . '/shipments', 'POST', array( 'carrier' => 'Test', 'tracking_number' => 'T1', 'tracking_url' => '', 'shipped_at' => '', 'notify_customer' => true ) ) ) as $action ) {
		list( $status ) = $call( $user, $action[0], $action[1], $action[2] ); $expect( 403 === $status, 'Refused packer action ' . $action[0] );
	}
	list( $status ) = $call( $user, 'woo/orders/' . $order->get_id() . '/notes', 'POST', array( 'note' => 'Packed', 'customer_note' => false ) ); $expect( 201 === $status, 'Private note' );
	list( $status, $data ) = $call( $user, 'woo/orders/' . $order->get_id() . '/shipments', 'POST', array( 'carrier' => 'Test', 'tracking_number' => 'T1', 'tracking_url' => '', 'shipped_at' => '' ) ); $expect( 201 === $status, 'Tracking save' );
	$shipment = $data['shipments'][0]['id'];
	list( $status ) = $call( $user, 'woo/orders/' . $order->get_id() . '/shipments', 'PATCH', array( 'shipment_id' => $shipment ) ); $expect( 403 === $status, 'Tracking email refused' );
	list( $status ) = $call( $user, 'woo/orders/' . $order->get_id() . '/shipments', 'DELETE', array( 'shipment_id' => $shipment ) ); $expect( 200 === $status, 'Tracking remove' );
	foreach ( array( 'woo/products', 'woo/customers', 'reports', 'woo/connection', 'access' ) as $path ) { list( $status ) = $call( $user, $path ); $expect( 403 === $status, 'Read denied ' . $path ); }
	list( $status, $data ) = $call( $user, 'settings' ); $expect( 200 === $status && null === $data['access']['rules'], 'Hidden role definitions' );
	list( $status ) = $call( $user, 'access', 'PUT', array( 'role' => $suffix, 'permissions' => array() ) ); $expect( 403 === $status, 'Role escalation refused' );
	KartoDesk_Access::update_role( $suffix, array( 'products.view', 'inventory.edit' ) );
	list( $status ) = $call( $user, 'woo/products' ); $expect( 200 === $status, 'Stock clerk read' );
	list( $status ) = $call( $user, 'woo/products/' . $product->get_id(), 'PATCH', array( 'stock_quantity' => 9 ) ); $expect( 200 === $status, 'Stock clerk write' );
	list( $status ) = $call( $user, 'woo/products/' . $product->get_id(), 'PATCH', array( 'details' => array( 'name' => 'Refused' ), 'modified' => 'x' ) ); $expect( 403 === $status, 'Stock clerk cannot edit catalogue' );
	list( $status ) = $call( $user, 'woo/orders' ); $expect( 403 === $status, 'Role change applies immediately' );
	KartoDesk_Access::update_role( $suffix, array( 'products.view', 'products.edit' ) );
	list( $status ) = $call( $user, 'woo/products/' . $product->get_id(), 'PATCH', array( 'details' => array( 'stock_quantity' => 2 ), 'modified' => 'x' ) ); $expect( 403 === $status, 'Catalogue editor also needs stock permission' );
	list( $status ) = $call( $user, 'woo/catalog?resource=variations&parent=' . $product->get_id(), 'POST', array( 'attributes' => array( array( 'id' => 0, 'name' => 'Size', 'option' => 'S' ) ), 'manage_stock' => true, 'stock_quantity' => 2 ) ); $expect( 403 === $status, 'Variation stock permission' );
	KartoDesk_Access::update_role( $suffix, array( 'orders.view', 'orders.notify' ) );
	list( $status ) = $call( $user, 'woo/orders/' . $order->get_id() . '/notes', 'POST', array( 'note' => 'No email', 'customer_note' => true ) ); $expect( 403 === $status, 'Notification-only role also needs note creation' );
	KartoDesk_Access::update_role( $suffix, array() );
	list( $status ) = $call( $user, 'timezone' ); $expect( 403 === $status, 'No-grant user refused' );
	list( $status, $data ) = $call( $admin, 'access' ); $expect( 200 === $status, 'Administrator access' );
	$entry = array_values( array_filter( $data['roles'], static function ( $r ) use ( $suffix ) { return $suffix === $r['slug']; } ) )[0];
	$expect( isset( $entry['missing']['customers.view'] ), 'Warnings available before granting permissions' );
	foreach ( array( array( 'role' => 'administrator', 'permissions' => array() ), array( 'role' => $suffix, 'permissions' => array( 'unknown' ) ), array( 'role' => $suffix, 'permissions' => array( array( 'orders.view' ) ) ) ) as $body ) { list( $status ) = $call( $admin, 'access', 'PUT', $body ); $expect( 400 === $status, 'Invalid role edit refused' ); }
	echo $checks . " WordPress permission checks passed.\n";
} finally {
	wp_set_current_user( $admin );
	$order->delete( true ); $product->delete( true );
	require_once ABSPATH . 'wp-admin/includes/user.php'; wp_delete_user( $user ); remove_role( $suffix );
}
