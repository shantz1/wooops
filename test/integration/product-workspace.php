<?php
// Run via wp-cli eval-file on a disposable localhost WordPress site only.
if ( ! defined( 'ABSPATH' ) || ! in_array( wp_parse_url( home_url(), PHP_URL_HOST ), array( 'localhost', '127.0.0.1' ), true ) ) { throw new RuntimeException( 'Local test site only.' ); }
add_filter( 'pre_wp_mail', '__return_true' );
$admins = get_users( array( 'role' => 'administrator', 'number' => 1, 'fields' => 'ID' ) );
wp_set_current_user( (int) $admins[0] );
$checks = 0;
$call = static function ( $path, $method = 'GET', $body = null, $query = array() ) {
	$request = new WP_REST_Request( $method, '/kartodesk/v1/' . $path );
	$request->set_query_params( $query );
	if ( null !== $body ) { $request->set_header( 'Content-Type', 'application/json' ); $request->set_body( wp_json_encode( $body ) ); }
	$response = rest_do_request( $request );
	return array( $response->get_status(), json_decode( wp_json_encode( $response->get_data() ), true ) );
};
$expect = static function ( $condition, $message ) use ( &$checks ) { if ( ! $condition ) { throw new RuntimeException( $message ); } ++$checks; };
$product = new WC_Product_Simple();
$product->set_name( 'Catalogue test ' . time() );
$product->set_status( 'draft' );
$product->set_regular_price( '12.00' );
$id = $product->save();
list( $status, $current ) = $call( 'woo/products/' . $id );
$expect( 200 === $status, 'Product read failed.' );
list( $status, $saved ) = $call( 'woo/products/' . $id, 'PATCH', array( 'details' => array( 'name' => 'Edited catalogue test', 'description' => '<p>Updated description</p>', 'short_description' => 'Short text', 'regular_price' => '14.00', 'weight' => '1.5', 'dimensions' => array( 'length' => '10', 'width' => '5', 'height' => '3' ), 'reviews_allowed' => true ), 'modified' => $current['date_modified_gmt'] ) );
$expect( 200 === $status && 'Edited catalogue test' === $saved['name'] && '14.00' === $saved['regular_price'], 'Details save failed: ' . wp_json_encode( $saved ) );
$expect( ! $saved['manage_stock'] && null === $saved['stock_quantity'], 'Catalogue edit changed stock management.' );
list( $status ) = $call( 'woo/products/' . $id, 'PATCH', array( 'details' => array( 'manage_stock' => true ), 'modified' => $saved['date_modified_gmt'] ) );
$expect( 400 === $status, 'Stock tracking enabled without a starting quantity.' );
list( $status ) = $call( 'woo/products/' . $id, 'PATCH', array( 'details' => array( 'name' => '' ), 'modified' => $saved['date_modified_gmt'] ) );
$expect( 400 === $status, 'Blank product name accepted.' );
list( $status ) = $call( 'woo/products/' . $id, 'PATCH', array( 'details' => array( 'description' => 'stale' ), 'modified' => '2000-01-01T00:00:00' ) );
$expect( 409 === $status, 'Stale edit accepted.' );
list( $status ) = $call( 'woo/products/' . $id, 'PATCH', array( 'details' => array( 'meta_data' => array() ), 'modified' => $saved['date_modified_gmt'] ) );
$expect( 400 === $status, 'Metadata write accepted.' );
list( $status ) = $call( 'woo/products/' . $id, 'PATCH', array( 'details' => array( 'images' => array( array( 'src' => 'https://outside.example/image.jpg' ) ) ), 'modified' => $saved['date_modified_gmt'] ) );
$expect( 400 === $status, 'External image URL accepted.' );
$images = array();
for ( $i = 0; $i < 2; ++$i ) {
	$upload = wp_upload_bits( 'catalogue-test-' . time() . '-' . $i . '.gif', null, base64_decode( 'R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==' ) );
	if ( $upload['error'] ) { throw new RuntimeException( $upload['error'] ); }
	$attachment = wp_insert_attachment( array( 'post_mime_type' => 'image/gif', 'post_title' => 'Catalogue test image', 'post_status' => 'inherit' ), $upload['file'] );
	$images[] = array( 'id' => $attachment, 'src' => wp_get_attachment_url( $attachment ) );
}
list( $status, $current ) = $call( 'woo/products/' . $id );
list( $status, $saved ) = $call( 'woo/products/' . $id, 'PATCH', array( 'details' => array( 'images' => array( array( 'src' => $images[0]['src'], 'alt' => 'Featured' ), array( 'id' => $images[1]['id'], 'alt' => 'Gallery' ) ) ), 'modified' => $current['date_modified_gmt'] ) );
$expect( 200 === $status && count( $saved['images'] ) === 2 && $images[0]['id'] === $saved['images'][0]['id'], 'Image URL or gallery save failed: ' . wp_json_encode( $saved ) );
$expect( $images[1]['id'] === $saved['images'][1]['id'], 'Gallery image lost.' );
foreach ( array( 'categories', 'attributes', 'reviews', 'shipping' ) as $resource ) {
	list( $status, $collection ) = $call( 'woo/catalog', 'GET', null, array( 'resource' => $resource ) );
	$expect( 200 === $status && isset( $collection['items'] ), 'Collection read failed: ' . $resource );
}
list( $status, $category ) = $call( 'woo/catalog', 'POST', array( 'name' => 'Catalogue test ' . time(), 'parent' => 0 ), array( 'resource' => 'categories' ) );
$expect( 201 === $status, 'Category create failed.' );
list( $status, $category ) = $call( 'woo/catalog', 'PATCH', array( 'name' => 'Edited test category' ), array( 'resource' => 'categories', 'id' => $category['id'] ) );
$expect( 200 === $status && 'Edited test category' === $category['name'], 'Category edit failed.' );
list( $status, $attribute ) = $call( 'woo/catalog', 'POST', array( 'name' => 'Test ' . time(), 'type' => 'select', 'order_by' => 'name', 'has_archives' => false ), array( 'resource' => 'attributes' ) );
$expect( 201 === $status, 'Attribute create failed.' );
// In a browser the next request registers newly-created attribute taxonomies during init.
// This single-process test must register it before dispatching the next REST request.
if ( ! taxonomy_exists( $attribute['slug'] ) ) { register_taxonomy( $attribute['slug'], array( 'product' ) ); }
list( $status, $term ) = $call( 'woo/catalog', 'POST', array( 'name' => 'Small' ), array( 'resource' => 'terms', 'parent' => $attribute['id'] ) );
$expect( 201 === $status && 'Small' === $term['name'], 'Term create failed: ' . wp_json_encode( $term ) );
$variable = new WC_Product_Variable();
$variable->set_name( 'Variable test ' . time() );
$variable->set_status( 'draft' );
$option = new WC_Product_Attribute();
$option->set_name( 'Size' );
$option->set_options( array( 'Small', 'Large' ) );
$option->set_visible( true );
$option->set_variation( true );
$variable->set_attributes( array( $option ) );
$parent = $variable->save();
$variant_body = array( 'regular_price' => '10.00', 'status' => 'private', 'attributes' => array( array( 'id' => 0, 'name' => 'Size', 'option' => 'Small' ) ) );
list( $status, $variant ) = $call( 'woo/catalog', 'POST', $variant_body, array( 'resource' => 'variations', 'parent' => $parent ) );
$expect( 201 === $status, 'Variation create failed: ' . wp_json_encode( $variant ) );
list( $status ) = $call( 'woo/catalog', 'POST', $variant_body, array( 'resource' => 'variations', 'parent' => $parent ) );
$expect( 409 === $status, 'Duplicate variation accepted.' );
list( $status, $variant ) = $call( 'woo/catalog', 'PATCH', array( 'regular_price' => '11.00' ), array( 'resource' => 'variations', 'parent' => $parent, 'id' => $variant['id'] ) );
$expect( 200 === $status && '11.00' === $variant['regular_price'], 'Variation edit failed.' );
list( $status, $parent_data ) = $call( 'woo/products/' . $parent );
list( $status ) = $call( 'woo/products/' . $parent, 'PATCH', array( 'details' => array( 'regular_price' => '50' ), 'modified' => $parent_data['date_modified_gmt'] ) );
$expect( 400 === $status, 'Parent variation price accepted.' );
$comment = wp_insert_comment( array( 'comment_post_ID' => $id, 'comment_author' => 'Test reviewer', 'comment_author_email' => 'review@example.invalid', 'comment_content' => 'Test review', 'comment_type' => 'review', 'comment_approved' => 0 ) );
update_comment_meta( $comment, 'rating', 4 );
list( $status, $review ) = $call( 'woo/catalog', 'PATCH', array( 'status' => 'approved' ), array( 'resource' => 'reviews', 'id' => $comment ) );
$expect( 200 === $status && 'approved' === $review['status'], 'Review moderation failed.' );
$subscribers = get_users( array( 'role' => 'subscriber', 'number' => 1, 'fields' => 'ID' ) );
wp_set_current_user( (int) $subscribers[0] );
list( $status ) = $call( 'woo/catalog', 'GET', null, array( 'resource' => 'categories' ) );
$expect( 403 === $status, 'Subscriber read accepted.' );
list( $status ) = $call( 'woo/products/' . $id, 'PATCH', array( 'details' => array( 'name' => 'Unauthorised' ), 'modified' => $saved['date_modified_gmt'] ) );
$expect( 403 === $status, 'Subscriber write accepted.' );
echo $checks . " product workspace checks passed; disposable product IDs: " . $id . ", " . $parent . ".\n";
