<?php
/**
 * Catalog, customer and report endpoints, using WooCommerce's own permissions and CRUD.
 *
 * @package KartoDesk
 */
defined( 'ABSPATH' ) || exit;

/** Shared operations used by the KartoDesk REST controller. */
trait KartoDesk_Catalog {
	/** Positive IDs only; never accept a caller-provided route. */
	private static function is_id( $value ) {
		return ( is_int( $value ) && $value > 0 && $value <= 9007199254740991 ) || ( is_string( $value ) && preg_match( '/^[1-9]\d*$/', $value ) && (float) $value <= 9007199254740991 );
	}

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
			'_fields' => 'products' === $resource ? 'id,name,type,status,sku,price,regular_price,manage_stock,stock_quantity,stock_status,images,low_stock_amount' : 'id,first_name,last_name,email,billing.phone,orders_count,total_spent',
		);
		$search = mb_substr( trim( sanitize_text_field( (string) $request->get_param( 'search' ) ) ), 0, 200 );
		if ( 'products' === $resource ) {
			foreach ( array( 'stock_status' => array( 'instock', 'outofstock', 'onbackorder' ), 'type' => array( 'simple', 'variable', 'grouped', 'external' ) ) as $key => $values ) {
				if ( $request->has_param( $key ) ) {
					$value = $request->get_param( $key );
					if ( ! in_array( $value, $values, true ) ) { return self::error( esc_html__( 'Invalid product filter.', 'kartodesk-for-woocommerce' ), 400 ); }
					$query[ $key ] = $value;
				}
			}
		}
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
		// A product edit needs "Create and edit products" (and "Change stock" when it changes stock); a stock update needs "Change stock".
		if ( $request->has_param( 'details' ) ) {
			self::require_permission( 'products.edit' );
			if ( self::touches_stock( $request->get_param( 'details' ) ) ) {
				self::require_permission( 'inventory.edit' );
			}
			return self::update_product_details( $request );
		}
		self::require_permission( 'inventory.edit' );
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

	/** Save explicitly permitted catalogue fields, with stale-edit detection and local images only. */
	private static function update_product_details( WP_REST_Request $request ) {
		$details = $request->get_param( 'details' );
		$modified = $request->get_param( 'modified' );
		$allowed = array( 'name', 'status', 'sku', 'regular_price', 'sale_price', 'description', 'short_description', 'catalog_visibility', 'featured', 'manage_stock', 'stock_quantity', 'stock_status', 'backorders', 'sold_individually', 'weight', 'dimensions', 'shipping_class', 'images', 'categories', 'attributes', 'upsell_ids', 'cross_sell_ids', 'grouped_products', 'purchase_note', 'reviews_allowed', 'menu_order', 'virtual' );
		if ( ! is_array( $details ) || empty( $details ) || array_diff( array_keys( $details ), $allowed ) || ! is_string( $modified ) || strlen( $modified ) > 40 ) {
			return self::error( esc_html__( 'Invalid product details.', 'kartodesk-for-woocommerce' ), 400 );
		}
		foreach ( $details as $key => $value ) {
			$limits = array( 'name' => 200, 'sku' => 100, 'description' => 10000, 'short_description' => 5000, 'purchase_note' => 5000, 'shipping_class' => 200 );
			if ( isset( $limits[ $key ] ) && ( ! is_string( $value ) || mb_strlen( $value ) > $limits[ $key ] || ( 'name' === $key && '' === trim( $value ) ) ) ) {
				return self::error( esc_html__( 'Invalid product text.', 'kartodesk-for-woocommerce' ), 400 );
			}
			if ( in_array( $key, array( 'featured', 'manage_stock', 'sold_individually', 'reviews_allowed', 'virtual' ), true ) && ! is_bool( $value ) ) {
				return self::error( esc_html__( 'Invalid product option.', 'kartodesk-for-woocommerce' ), 400 );
			}
			if ( in_array( $key, array( 'images', 'categories', 'attributes', 'upsell_ids', 'cross_sell_ids', 'grouped_products' ), true ) && ( ! is_array( $value ) || count( $value ) > 100 ) ) {
				return self::error( esc_html__( 'Invalid product collection.', 'kartodesk-for-woocommerce' ), 400 );
			}
			if ( in_array( $key, array( 'regular_price', 'sale_price', 'weight' ), true ) && ( ! is_string( $value ) || strlen( $value ) > 30 || ( '' !== $value && ! preg_match( '/^\d+(?:\.\d{1,6})?$/', $value ) ) ) ) {
				return self::error( esc_html__( 'Enter a non-negative decimal value.', 'kartodesk-for-woocommerce' ), 400 );
			}
			if ( 'stock_quantity' === $key && null !== $value && ( ! is_int( $value ) || $value < 0 || $value > 9007199254740991 ) ) {
				return self::error( esc_html__( 'Enter a non-negative whole stock quantity.', 'kartodesk-for-woocommerce' ), 400 );
			}
			if ( is_string( $value ) && strlen( $value ) > 10000 ) {
				return self::error( esc_html__( 'Product text is too long.', 'kartodesk-for-woocommerce' ), 400 );
			}
		}
		list( $current ) = self::wc( 'GET', 'products/' . (int) $request['id'] );
		if ( $modified !== $current['date_modified_gmt'] ) {
			return self::error( esc_html__( 'This product changed since you opened it. Reload before saving.', 'kartodesk-for-woocommerce' ), 409 );
		}
		if ( isset( $details['manage_stock'] ) && true === $details['manage_stock'] && ! $current['manage_stock'] && ( ! isset( $details['stock_quantity'] ) || ! is_int( $details['stock_quantity'] ) ) ) {
			return self::error( esc_html__( 'Provide a starting quantity when enabling stock management.', 'kartodesk-for-woocommerce' ), 400 );
		}
		if ( 'variable' === $current['type'] && ( isset( $details['regular_price'] ) || isset( $details['sale_price'] ) ) ) {
			return self::error( esc_html__( 'Edit prices on each variation.', 'kartodesk-for-woocommerce' ), 400 );
		}
		foreach ( array( 'upsell_ids', 'cross_sell_ids', 'grouped_products' ) as $key ) {
			if ( isset( $details[ $key ] ) && ( ! is_array( $details[ $key ] ) || count( $details[ $key ] ) > 100 || in_array( (int) $request['id'], $details[ $key ], true ) ) ) {
				return self::error( esc_html__( 'Invalid related products.', 'kartodesk-for-woocommerce' ), 400 );
			}
		}
		if ( isset( $details['images'] ) ) {
			if ( ! is_array( $details['images'] ) || count( $details['images'] ) > 20 ) {
				return self::error( esc_html__( 'Use at most 20 product images.', 'kartodesk-for-woocommerce' ), 400 );
			}
			$images = array();
			foreach ( $details['images'] as $image ) {
				if ( ! is_array( $image ) ) { return self::error( esc_html__( 'Invalid product image.', 'kartodesk-for-woocommerce' ), 400 ); }
				$id = isset( $image['id'] ) ? $image['id'] : 0;
				if ( ! $id && isset( $image['src'] ) && is_string( $image['src'] ) && strlen( $image['src'] ) <= 2048 ) { $id = attachment_url_to_postid( $image['src'] ); }
				if ( ! is_int( $id ) || $id < 1 || ! wp_attachment_is_image( $id ) ) {
					return self::error( esc_html__( 'Use an existing image URL from this store Media Library.', 'kartodesk-for-woocommerce' ), 400 );
				}
				$images[] = array( 'id' => $id, 'alt' => isset( $image['alt'] ) && is_string( $image['alt'] ) ? sanitize_text_field( $image['alt'] ) : '' );
			}
			$details['images'] = $images;
		}
		foreach ( array( 'description', 'short_description', 'purchase_note' ) as $key ) { if ( isset( $details[ $key ] ) && is_string( $details[ $key ] ) ) { $details[ $key ] = wp_kses_post( $details[ $key ] ); } }
		list( $saved ) = self::wc( 'PUT', 'products/' . (int) $request['id'], array(), $details );
		return new WP_REST_Response( $saved );
	}

	/** Bounded catalogue collections. Underlying WooCommerce controllers enforce their own permissions and schemas. */
	public static function catalog( WP_REST_Request $request ) {
		$resource = $request->get_param( 'resource' );
		if ( ! is_string( $resource ) || ! in_array( $resource, array( 'categories', 'attributes', 'terms', 'reviews', 'shipping', 'variations' ), true ) ) {
			return self::error( esc_html__( 'Invalid catalogue resource.', 'kartodesk-for-woocommerce' ), 400 );
		}
		$paths = array( 'categories' => 'products/categories', 'attributes' => 'products/attributes', 'reviews' => 'products/reviews', 'shipping' => 'products/shipping_classes' );
		$parent = $request->get_param( 'parent' );
		if ( in_array( $resource, array( 'terms', 'variations' ), true ) && self::is_id( $parent ) ) {
			$path = 'terms' === $resource ? 'products/attributes/' . (int) $parent . '/terms' : 'products/' . (int) $parent . '/variations';
		} else { $path = $paths[ $resource ] ?? null; }
		if ( ! $path ) { return self::error( esc_html__( 'Invalid catalogue resource.', 'kartodesk-for-woocommerce' ), 400 ); }
		$method = $request->get_method();
		if ( 'GET' === $method ) {
			$query = array( 'page' => self::page_param( $request->get_param( 'page' ), 1 ), 'per_page' => self::page_param( $request->get_param( 'per_page' ), 20, 100 ) );
			$search = $request->get_param( 'search' );
			if ( is_string( $search ) && '' !== trim( $search ) ) { $query['search'] = mb_substr( sanitize_text_field( $search ), 0, 200 ); }
			if ( 'reviews' === $resource ) {
				$query['status'] = 'all';
				if ( $request->has_param( 'product' ) ) {
					if ( ! self::is_id( $request->get_param( 'product' ) ) ) { return self::error( esc_html__( 'Invalid product ID.', 'kartodesk-for-woocommerce' ), 400 ); }
					$query['product'] = (int) $request->get_param( 'product' );
				}
			}
			list( $items, $headers ) = self::wc( 'GET', $path, $query );
			return new WP_REST_Response( array( 'items' => $items, 'total' => (int) ( $headers['X-WP-Total'] ?? count( $items ) ), 'pages' => (int) ( $headers['X-WP-TotalPages'] ?? 1 ) ) );
		}
		$allowed = array( 'categories' => array( 'name', 'slug', 'description', 'parent' ), 'terms' => array( 'name', 'slug', 'description' ), 'attributes' => array( 'name', 'slug', 'type', 'order_by', 'has_archives' ), 'reviews' => array( 'status' ), 'variations' => array( 'sku', 'regular_price', 'sale_price', 'manage_stock', 'stock_quantity', 'stock_status', 'status', 'attributes' ) );
		$body = $request->get_json_params();
		$id = $request->get_param( 'id' );
		if ( ! isset( $allowed[ $resource ] ) || ! is_array( $body ) || empty( $body ) || array_diff( array_keys( $body ), $allowed[ $resource ] ) || ( 'PATCH' === $method && ! self::is_id( $id ) ) || ( 'reviews' === $resource && ( 'PATCH' !== $method || ! in_array( $body['status'] ?? '', array( 'approved', 'hold', 'spam' ), true ) ) ) ) {
			return self::error( esc_html__( 'Invalid catalogue details.', 'kartodesk-for-woocommerce' ), 400 );
		}
		foreach ( array( 'regular_price', 'sale_price' ) as $key ) {
			if ( isset( $body[ $key ] ) && ( ! is_string( $body[ $key ] ) || strlen( $body[ $key ] ) > 30 || ( '' !== $body[ $key ] && ! preg_match( '/^\d+(?:\.\d{1,6})?$/', $body[ $key ] ) ) ) ) { return self::error( esc_html__( 'Invalid price.', 'kartodesk-for-woocommerce' ), 400 ); }
		}
		if ( isset( $body['stock_quantity'] ) && ( ! is_int( $body['stock_quantity'] ) || $body['stock_quantity'] < 0 ) ) { return self::error( esc_html__( 'Invalid stock quantity.', 'kartodesk-for-woocommerce' ), 400 ); }
		if ( self::touches_stock( $body ) ) {
			self::require_permission( 'inventory.edit' );
		}
		if ( 'variations' === $resource && 'POST' === $method ) {
			self::check_variation_options( (int) $parent, $body['attributes'] ?? null, $path );
		}
		list( $saved ) = self::wc( 'POST' === $method ? 'POST' : 'PUT', 'POST' === $method ? $path : $path . '/' . (int) $id, array(), $body );
		return new WP_REST_Response( $saved, 'POST' === $method ? 201 : 200 );
	}

	/** Check saved options and overlapping variants before creating a new one. */
	private static function check_variation_options( $parent, $options, $path ) {
		if ( ! is_array( $options ) || count( $options ) > 30 ) { throw new KartoDesk_Error( esc_html__( 'Choose saved variation options.', 'kartodesk-for-woocommerce' ), 400 ); }
		foreach ( $options as $option ) {
			if ( ! is_array( $option ) || ! isset( $option['id'], $option['name'], $option['option'] ) || ! is_int( $option['id'] ) || $option['id'] < 0 || ! is_string( $option['name'] ) || ! is_string( $option['option'] ) ) {
				throw new KartoDesk_Error( esc_html__( 'Invalid variation options.', 'kartodesk-for-woocommerce' ), 400 );
			}
		}
		list( $product ) = self::wc( 'GET', 'products/' . $parent );
		$required = array_values( array_filter( $product['attributes'], static function ( $attribute ) { return $attribute['variation']; } ) );
		$matches = static function ( $left, $right ) { return $left['id'] > 0 ? $left['id'] === $right['id'] : 0 === $right['id'] && mb_strtolower( $left['name'] ) === mb_strtolower( $right['name'] ); };
		if ( 'variable' !== $product['type'] || ! $required || count( $required ) !== count( $options ) ) { throw new KartoDesk_Error( esc_html__( 'Choose an option for every saved variation attribute.', 'kartodesk-for-woocommerce' ), 400 ); }
		foreach ( $required as $attribute ) {
			$selected = array_values( array_filter( $options, static function ( $option ) use ( $matches, $attribute ) { return $matches( $option, $attribute ); } ) );
			if ( 1 !== count( $selected ) || ! in_array( $selected[0]['option'], $attribute['options'], true ) ) { throw new KartoDesk_Error( esc_html__( 'Choose saved variation options.', 'kartodesk-for-woocommerce' ), 400 ); }
		}
		$pages = 1;
		for ( $page = 1; $page <= $pages; ++$page ) {
			list( $existing, $headers ) = self::wc( 'GET', $path, array( 'per_page' => 100, 'page' => $page ) );
			$pages = max( 1, (int) ( $headers['X-WP-TotalPages'] ?? 1 ) );
			if ( $pages > 5 || (int) ( $headers['X-WP-Total'] ?? 0 ) > 500 ) { throw new KartoDesk_Error( esc_html__( 'This product has too many variations to verify safely here.', 'kartodesk-for-woocommerce' ), 409 ); }
			foreach ( $existing as $variation ) {
				$overlap = true;
				foreach ( $options as $option ) {
					$found = false;
					foreach ( $variation['attributes'] as $attribute ) { if ( $matches( $attribute, $option ) && ( '' === $attribute['option'] || $attribute['option'] === $option['option'] ) ) { $found = true; break; } }
					if ( ! $found ) { $overlap = false; break; }
				}
				if ( $overlap ) { throw new KartoDesk_Error( esc_html__( 'A variation already covers these options. Edit it instead.', 'kartodesk-for-woocommerce' ), 409 ); }
			}
		}
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
		if ( true === $managed ) {
			self::require_permission( 'inventory.edit' );
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
