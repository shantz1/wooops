<?php
/** Run with wp eval-file on a disposable local WordPress + WooCommerce site; blocks all outgoing mail. */
if ( ! in_array( wp_parse_url( home_url(), PHP_URL_HOST ), array( 'localhost', '127.0.0.1' ), true ) ) { throw new RuntimeException( 'Local disposable site only.' ); }
$checks = 0;
$expect = static function ( $condition, $message ) use ( &$checks ) { if ( ! $condition ) { throw new RuntimeException( $message ); } ++$checks; };
$call = static function ( $user, $path, $method = 'GET', $body = null ) {
	wp_set_current_user( 0 ); // Each simulated HTTP request gets a fresh capability snapshot.
	wp_set_current_user( $user );
	$request = new WP_REST_Request( $method, '/kartodesk/v1/' . $path );
	if ( null !== $body ) { $request->set_header( 'Content-Type', 'application/json' ); $request->set_body( wp_json_encode( $body ) ); }
	$response = rest_do_request( $request );
	return array( $response->get_status(), json_decode( wp_json_encode( $response->get_data() ), true ) );
};
$mail = array();
$intercept = static function ( $result, $attributes ) use ( &$mail ) { $mail[] = $attributes; return true; };
add_filter( 'pre_wp_mail', $intercept, PHP_INT_MAX, 2 );
$admin = get_users( array( 'role' => 'administrator', 'number' => 1 ) )[0]->ID;
$suffix = 'qa020_' . wp_generate_password( 8, false );
$customer = wp_insert_user( array( 'user_login' => $suffix, 'user_email' => $suffix . '@example.invalid', 'user_pass' => wp_generate_password(), 'role' => 'customer' ) );
$shop_caps = get_role( 'shop_manager' )->capabilities;
foreach ( array_keys( $shop_caps ) as $cap ) { if ( 0 === strpos( $cap, 'kartodesk_' ) ) { unset( $shop_caps[$cap] ); } }
unset( $shop_caps['list_users'], $shop_caps['edit_users'], $shop_caps['promote_users'], $shop_caps['create_users'] );
$role = add_role( $suffix, 'Order workspace test', $shop_caps );
$staff = wp_insert_user( array( 'user_login' => $suffix . '_staff', 'user_pass' => wp_generate_password(), 'role' => $suffix ) );
foreach ( array( 'billing_first_name' => 'Saved', 'billing_email' => 'saved@example.invalid', 'billing_city' => 'Mumbai', 'billing_country' => 'IN', 'shipping_address_1' => 'Saved street', 'shipping_city' => 'Mumbai', 'shipping_country' => 'IN' ) as $key => $value ) { update_user_meta( $customer, $key, $value ); }
wp_set_current_user( $admin );
$order = wc_create_order( array( 'status' => 'pending' ) );
$order->set_billing_email( 'buyer@example.invalid' );
$order->set_billing_city( 'Pune' );
$order->set_billing_phone( 'PRIVATE-BILLING-PHONE' );
$order->set_shipping_city( 'Pune' );
$order->set_shipping_address_1( 'Original street' );
$order->save();
$id = $order->get_id();
try {
	list( $status, $loaded ) = $call( $admin, 'woo/orders/' . $id );
	$expect( 200 === $status && (bool) preg_match( '/^[a-f0-9]{64}$/D', $loaded['edit_token'] ), 'Order has a strong revision' );
	list( $status ) = $call( $admin, 'woo/orders/' . $id, 'PATCH', array( 'customer_id' => $customer ) );
	$expect( 400 === $status, 'Missing revision refused' );
	KartoDesk_Access::update_role( $suffix, array( 'orders.view', 'orders.status' ) );
	list( $status ) = $call( $staff, 'woo/orders/' . $id, 'PATCH', array( 'customer_id' => $customer, 'if_match' => $loaded['edit_token'] ) );
	$expect( 403 === $status, 'Assigning a registered account also needs customer access' );
	KartoDesk_Access::update_role( $suffix, array( 'orders.view', 'orders.status', 'customers.view' ) );
	list( $status ) = $call( $staff, 'woo/orders/' . $id, 'PATCH', array( 'customer_id' => $customer, 'replace_addresses' => true, 'if_match' => $loaded['edit_token'] ) );
	$expect( 403 === $status, 'WooCommerce native customer permissions still apply to address reads' );
	list( $status ) = $call( $admin, 'woo/orders/' . $id, 'PATCH', array( 'customer_id' => $admin, 'if_match' => $loaded['edit_token'] ) );
	$expect( 400 === $status, 'A staff account cannot be selected as a customer' );
	list( $status, $assigned ) = $call( $admin, 'woo/orders/' . $id, 'PATCH', array( 'customer_id' => $customer, 'if_match' => $loaded['edit_token'] ) );
	$expect( 200 === $status && $customer === $assigned['customer_id'], 'Registered customer assigned' );
	$expect( 'buyer@example.invalid' === $assigned['billing']['email'] && 'Original street' === $assigned['shipping']['address_1'], 'Assignment preserves existing addresses and email' );
	list( $status, $stale ) = $call( $admin, 'woo/orders/' . $id, 'PATCH', array( 'customer_id' => 0, 'if_match' => $loaded['edit_token'] ) );
	$expect( 409 === $status && ! empty( $stale['stale'] ), 'Old state refused even when timestamps share a second' );
	list( $status, $copied ) = $call( $admin, 'woo/orders/' . $id, 'PATCH', array( 'customer_id' => $customer, 'replace_addresses' => true, 'if_match' => $assigned['edit_token'] ) );
	$expect( 200 === $status && 'saved@example.invalid' === $copied['billing']['email'], 'Explicit address replacement copies saved billing email' );
	$expect( '' === $copied['billing']['phone'], 'Replacement clears omitted saved fields' );
	list( $status, $guest ) = $call( $admin, 'woo/orders/' . $id, 'PATCH', array( 'customer_id' => 0, 'if_match' => $copied['edit_token'] ) );
	$expect( 200 === $status && 0 === $guest['customer_id'], 'Return to guest checkout' );
	KartoDesk_Access::update_role( $suffix, array( 'orders.view' ) );
	$before = count( $mail );
	list( $status ) = $call( $staff, 'woo/orders/' . $id . '/email', 'POST', array( 'confirm_email' => 'saved@example.invalid' ) );
	$expect( 403 === $status && $before === count( $mail ), 'Reader cannot send mail' );
	list( $status ) = $call( $admin, 'woo/orders/' . $id . '/email', 'POST', array( 'confirm_email' => 'saved@example.invalid', 'email' => 'other@example.invalid' ) );
	$expect( 400 === $status && $before === count( $mail ), 'Address override refused' );
	list( $status ) = $call( $admin, 'woo/orders/' . $id . '/email', 'POST', array( 'confirm_email' => 'old@example.invalid' ) );
	$expect( 409 === $status && $before === count( $mail ), 'Changed recipient refused' );
	delete_transient( 'kartodesk_email_' . $id );
	list( $status, $sent ) = $call( $admin, 'woo/orders/' . $id . '/email', 'POST', array( 'confirm_email' => 'saved@example.invalid' ) );
	$expect( 200 === $status && ! empty( $sent['accepted'] ) && count( $mail ) === $before + 1, 'Exactly one native order email handed to the intercepted mailer' );
	$expect( false !== strpos( wp_json_encode( $mail[count( $mail ) - 1]['to'] ), 'saved@example.invalid' ), 'Mailer receives only confirmed billing recipient' );
	list( $status ) = $call( $admin, 'woo/orders/' . $id . '/email', 'POST', array( 'confirm_email' => 'saved@example.invalid' ) );
	$expect( 429 === $status && count( $mail ) === $before + 1, 'Immediate resend blocked' );
	delete_transient( 'kartodesk_email_' . $id );
	$change_before_send = static function ( $sending_order ) use ( $id ) { if ( $sending_order->get_id() === $id ) { $sending_order->set_billing_email( 'unconfirmed@example.invalid' ); } };
	add_action( 'woocommerce_before_resend_order_emails', $change_before_send, 1 );
	list( $status ) = $call( $admin, 'woo/orders/' . $id . '/email', 'POST', array( 'confirm_email' => 'saved@example.invalid' ) );
	remove_action( 'woocommerce_before_resend_order_emails', $change_before_send, 1 );
	$expect( $status >= 400 && count( $mail ) === $before + 1, 'Send-time recipient guard blocks an in-process address race' );
	list( $status, $updates ) = $call( $admin, 'updates' );
	$expect( 200 === $status && 'wordpress' === $updates['platform'] && ! empty( $updates['auto_updates']['can_manage'] ), 'Administrators see native update management' );
	list( $status ) = $call( $staff, 'updates' );
	$expect( 403 === $status, 'Update status needs Settings permission' );
	KartoDesk_Access::update_role( $suffix, array( 'settings.view' ) );
	list( $status, $updates ) = $call( $staff, 'updates' );
	$expect( 200 === $status && empty( $updates['auto_updates']['can_manage'] ) && null === $updates['auto_updates']['manage_url'], 'Settings access never grants update capability' );
	echo $checks . " real WordPress order-workspace checks passed\n";
} finally {
	wp_set_current_user( $admin );
	$order->delete( true );
	delete_transient( 'kartodesk_email_' . $id );
	require_once ABSPATH . 'wp-admin/includes/user.php';
	wp_delete_user( $staff ); wp_delete_user( $customer ); remove_role( $suffix );
	remove_filter( 'pre_wp_mail', $intercept, PHP_INT_MAX );
}
