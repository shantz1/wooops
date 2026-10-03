<?php
/**
 * Catalog, customer and report endpoints, using WooCommerce's own permissions and CRUD.
 *
 * @package KartoDesk
 */
defined( 'ABSPATH' ) || exit;

/** Shared operations used by the KartoDesk REST controller. */
trait KartoDesk_Catalog {

	/** Connection check exercises the same controller used by the products screen. */
	public static function connection() {
		self::wc( 'GET', 'products', array( 'per_page' => 1, '_fields' => 'id' ) );
		return new WP_REST_Response( array( 'configured' => true ) );
	}

	/** List products with bounded pagination and search. */
	public static function list_products( WP_REST_Request $request ) {
		return self::catalog_list( $request, 'products', 'date' );
	}

	/** Registered customers only; guest orders are not customer records. */
	public static function list_customers( WP_REST_Request $request ) {
		return self::catalog_list( $request, 'customers', 'registered_date' );
	}

	/** Common list response matching the standalone panel. */
	private static function catalog_list( $request, $resource, $orderby ) {
		$query = array(
			'page' => self::page_param( $request->get_param( 'page' ), 1 ),
			'per_page' => self::page_param( $request->get_param( 'per_page' ), 20, 100 ),
			'orderby' => $orderby, 'order' => 'desc',
			'_fields' => 'products' === $resource ? 'id,name,sku,price,regular_price,manage_stock,stock_quantity,stock_status,images' : 'id,first_name,last_name,email,billing.phone,orders_count,total_spent',
		);
		$search = mb_substr( trim( sanitize_text_field( (string) $request->get_param( 'search' ) ) ), 0, 200 );
		if ( '' !== $search ) {
			$query['search'] = $search;
		}
		list( $rows, $headers ) = self::wc( 'GET', $resource, $query );
		return new WP_REST_Response( array(
			'configured' => true, $resource => $rows,
			'total' => (int) ( $headers['X-WP-Total'] ?? 0 ),
			'pages' => (int) ( $headers['X-WP-TotalPages'] ?? 1 ),
		) );
	}

	/** Read one product. */
	public static function get_product( WP_REST_Request $request ) {
		list( $product ) = self::wc( 'GET', 'products/' . (int) $request['id'] );
		return new WP_REST_Response( $product );
	}

	/** Update a non-negative integer stock quantity, matching the standalone behavior. */
	public static function update_stock( WP_REST_Request $request ) {
		$quantity = $request->get_param( 'stock_quantity' );
		$enable = $request->get_param( 'enable_stock_management' );
		if ( ! is_int( $quantity ) || $quantity < 0 || $quantity > 9007199254740991 || ( null !== $enable && ! is_bool( $enable ) ) ) {
			return self::error( esc_html__( 'Provide a non-negative whole stock quantity.', 'kartodesk-for-woocommerce' ), 400 );
		}
		list( $current ) = self::wc( 'GET', 'products/' . (int) $request['id'] );
		if ( empty( $current['manage_stock'] ) && true !== $enable ) {
			return self::error( esc_html__( 'Explicitly confirm enabling stock management for this product first.', 'kartodesk-for-woocommerce' ), 409 );
		}
		$payload = array( 'stock_quantity' => $quantity );
		if ( empty( $current['manage_stock'] ) ) {
			$payload['manage_stock'] = true;
		}
		list( $product ) = self::wc( 'PUT', 'products/' . (int) $request['id'], array(), $payload );
		return new WP_REST_Response( $product );
	}

	/** Create a simple product with explicitly allowed fields. */
	public static function create_product( WP_REST_Request $request ) {
		$name = $request->get_param( 'name' );
		$price = $request->get_param( 'regular_price' );
		$sku = $request->get_param( 'sku' ) ?? '';
		$description = $request->get_param( 'description' ) ?? '';
		$image = $request->get_param( 'image_url' ) ?? '';
		$status = $request->get_param( 'status' );
		$managed = $request->get_param( 'manage_stock' );
		$quantity = $request->get_param( 'stock_quantity' );
		if ( ! is_string( $name ) || '' === trim( $name ) || mb_strlen( $name ) > 200 ||
			! is_string( $price ) || ! preg_match( '/^\d+(?:\.\d{1,2})?$/', $price ) ||
			! is_string( $sku ) || mb_strlen( $sku ) > 100 || ! is_string( $description ) || mb_strlen( $description ) > 10000 ||
			! is_string( $image ) || ! in_array( $status, array( 'draft', 'publish' ), true ) || ! is_bool( $managed ) ||
			( $managed && ( ! is_int( $quantity ) || $quantity < 0 || $quantity > 9007199254740991 ) ) ) {
			return self::error( esc_html__( 'Invalid simple product details.', 'kartodesk-for-woocommerce' ), 400 );
		}
		$image = trim( $image );
		$images = array();
		if ( '' !== $image ) {
			// Use a local attachment ID, never download an arbitrary user-provided URL.
			$attachment = attachment_url_to_postid( $image );
			if ( strlen( $image ) > 2048 || ! $attachment || ! wp_attachment_is_image( $attachment ) ) {
				return self::error( esc_html__( 'Use an existing image URL from this store Media Library.', 'kartodesk-for-woocommerce' ), 400 );
			}
			$images[] = array( 'id' => $attachment );
		}
		$payload = array( 'name' => trim( $name ), 'type' => 'simple', 'regular_price' => $price,
			'sku' => trim( $sku ), 'description' => wp_kses_post( trim( $description ) ), 'status' => $status,
			'manage_stock' => $managed, 'images' => $images );
		if ( $managed ) {
			$payload['stock_quantity'] = $quantity;
		}
		list( $product ) = self::wc( 'POST', 'products', array(), $payload );
		return new WP_REST_Response( $product, 201 );
	}

	/** Order and inventory reports are bounded live reads, never durable snapshots. */
	public static function reports( WP_REST_Request $request ) {
		$kind = $request->get_param( 'kind' ) ?? 'orders';
		$query = array( 'per_page' => 100, 'orderby' => 'id', 'order' => 'asc' );
		if ( ! in_array( $kind, array( 'orders', 'inventory' ), true ) ) {
			return self::error( esc_html__( 'Invalid report type.', 'kartodesk-for-woocommerce' ), 400 );
		}
		$filters = array();
		if ( 'orders' === $kind ) {
			$from = $request->get_param( 'from' );
			$to = $request->get_param( 'to' );
			$status = $request->get_param( 'status' ) ?? 'all';
			if ( ! is_string( $from ) || ! is_string( $to ) || '' === $from || '' === $to ||
				! self::valid_date( $from ) || ! self::valid_date( $to ) || $from > $to ||
				strtotime( $to ) - strtotime( $from ) > 366 * DAY_IN_SECONDS ||
				( 'all' !== $status && ! self::is_settable_status( $status ) ) ) {
				return self::error( esc_html__( 'Choose a valid date range of up to one year and a supported status.', 'kartodesk-for-woocommerce' ), 400 );
			}
			$start = new DateTimeImmutable( $from . ' 00:00:00', wp_timezone() );
			$end = ( new DateTimeImmutable( $to . ' 00:00:00', wp_timezone() ) )->modify( '+1 day' )->modify( '-1 second' );
			if ( $start->format( 'Y-m-d' ) !== $from ) {
				return self::error( esc_html__( 'Invalid date in the store timezone.', 'kartodesk-for-woocommerce' ), 400 );
			}
			$utc = new DateTimeZone( 'UTC' );
			$query['after'] = $start->setTimezone( $utc )->format( 'Y-m-d\TH:i:s' );
			$query['before'] = $end->setTimezone( $utc )->format( 'Y-m-d\TH:i:s' );
			$query['dates_are_gmt'] = true;
			if ( 'all' !== $status ) {
				$query['status'] = $status;
			}
			$filters = array( 'from' => $from, 'to' => $to, 'status' => $status );
		} else {
			$stock = $request->get_param( 'stock' ) ?? 'all';
			if ( ! in_array( $stock, array( 'all', 'instock', 'outofstock', 'onbackorder' ), true ) ) {
				return self::error( esc_html__( 'Invalid stock filter.', 'kartodesk-for-woocommerce' ), 400 );
			}
			if ( 'all' !== $stock ) {
				$query['stock_status'] = $stock;
			}
			$filters['stock'] = $stock;
		}
		$query['_fields'] = 'orders' === $kind ? 'id,number,status,currency,total,date_created,date_created_gmt,refunds.total' : 'id,name,sku,stock_status,stock_quantity,manage_stock';
		$resource = 'orders' === $kind ? 'orders' : 'products';
		$started = microtime( true );
		$rows = array();
		$complete = true;
		$total = 0;
		$pages = 1;
		for ( $page = 1; $page <= min( $pages, 5 ); ++$page ) {
			if ( microtime( true ) - $started > 20 ) {
				$complete = false;
				break;
			}
			$query['page'] = $page;
			list( $data, $headers ) = self::wc( 'GET', $resource, $query );
			$current_total = (int) ( $headers['X-WP-Total'] ?? 0 );
			if ( 1 === $page ) {
				$total = $current_total;
				$pages = max( 1, (int) ( $headers['X-WP-TotalPages'] ?? 1 ) );
			} elseif ( $current_total !== $total ) {
				$complete = false;
			}
			foreach ( $data as $row ) {
				$fields = 'orders' === $kind ? array( 'id', 'number', 'status', 'currency', 'total', 'date_created', 'date_created_gmt' ) : array( 'id', 'name', 'sku', 'stock_status', 'manage_stock', 'stock_quantity' );
				$record = array_intersect_key( $row, array_flip( $fields ) );
				if ( 'orders' === $kind ) {
					$record['refunds'] = array_map( static function ( $refund ) { return array( 'total' => $refund['total'] ); }, $row['refunds'] ?? array() );
				}
				$rows[ $row['id'] ] = $record;
			}
		}
		return new WP_REST_Response( array( 'configured' => true, 'kind' => $kind, 'timezone' => wp_timezone_string(), 'timezone_warning' => null,
			'total' => $total, 'loaded' => count( $rows ), 'limit' => 500, 'complete' => $complete && $pages <= 5 && count( $rows ) === $total,
			'generated_at' => gmdate( 'c' ), 'filters' => $filters,
			'orders' => 'orders' === $kind ? array_values( $rows ) : array(), 'products' => 'inventory' === $kind ? array_values( $rows ) : array(),
		) );
	}
}
