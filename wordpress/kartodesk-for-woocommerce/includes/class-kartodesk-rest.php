<?php
/**
 * KartoDesk REST API.
 *
 * Mirrors the standalone WooOps `/api/*` routes so the same panel code runs in both. Store data is read and
 * written through WooCommerce's own REST controllers in-process, as the signed-in WordPress user, so
 * WooCommerce's permission checks and response shapes apply and no API keys are needed.
 *
 * @package KartoDesk
 */

defined( 'ABSPATH' ) || exit;

/**
 * An error with the HTTP status the KartoDesk route should return. Messages are HTML-escaped when created;
 * the panel decodes entities and renders them as plain text.
 */
class KartoDesk_Error extends Exception {

	/**
	 * HTTP status.
	 *
	 * @var int
	 */
	public $status;

	/**
	 * Constructor.
	 *
	 * @param string $message Safe message for the panel.
	 * @param int    $status  HTTP status.
	 */
	public function __construct( $message, $status ) {
		parent::__construct( $message );
		$this->status = $status;
	}
}

/**
 * Registers and implements the kartodesk/v1 routes.
 */
class KartoDesk_Rest {
	use KartoDesk_Catalog;

	const REST_NAMESPACE = 'kartodesk/v1';

	const SHIPMENTS_META_KEY = 'wooops_shipments';

	const EDITABLE_STATUSES = array( 'pending', 'processing', 'on-hold', 'completed', 'cancelled', 'refunded', 'failed' );

	/**
	 * Registers hooks.
	 */
	public static function init() {
		add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
	}

	/**
	 * Every route requires a user who can manage WooCommerce. Cookie requests also need a valid REST nonce,
	 * which WordPress core checks before this callback.
	 *
	 * @return bool
	 */
	public static function can_manage() {
		return current_user_can( 'manage_woocommerce' );
	}

	/**
	 * Registers routes. Paths match the standalone app with the leading `/api/` removed.
	 */
	public static function register_routes() {
		$order = '/woo/orders/(?P<id>[1-9]\d*)';
		$routes = array(
			'/settings'           => array( 'GET' => 'settings' ),
			'/reports'            => array( 'GET' => 'reports' ),
			'/woo/connection'     => array( 'GET' => 'connection' ),
			'/woo/products'       => array( 'GET' => 'list_products', 'POST' => 'create_product' ),
			'/woo/products/(?P<id>[1-9]\d*)' => array( 'GET' => 'get_product', 'PATCH' => 'update_stock' ),
			'/woo/customers'      => array( 'GET' => 'list_customers' ),
			'/woo/orders'         => array( 'GET' => 'list_orders' ),
			'/woo/orders/bulk'    => array( 'POST' => 'bulk_status' ),
			$order                => array( 'GET' => 'get_order', 'PATCH' => 'update_status' ),
			$order . '/notes'     => array( 'GET' => 'list_notes', 'POST' => 'add_note' ),
			$order . '/shipments' => array( 'GET' => 'list_shipments', 'POST' => 'add_shipment', 'PATCH' => 'email_shipment', 'DELETE' => 'remove_shipment' ),
		);
		foreach ( $routes as $path => $methods ) {
			$endpoints = array();
			foreach ( $methods as $method => $callback ) {
				$endpoints[] = array(
					'methods'             => $method,
					'callback'            => self::handler( $callback ),
					'permission_callback' => array( __CLASS__, 'can_manage' ),
				);
			}
			register_rest_route( self::REST_NAMESPACE, $path, $endpoints );
		}
	}

	/**
	 * Wraps a route so thrown KartoDesk_Error values become `{ error }` JSON responses like the standalone app.
	 *
	 * @param string $callback Method name.
	 * @return callable
	 */
	private static function handler( $callback ) {
		return static function ( WP_REST_Request $request ) use ( $callback ) {
			try {
				return call_user_func( array( __CLASS__, $callback ), $request );
			} catch ( KartoDesk_Error $error ) {
				return self::error( $error->getMessage(), $error->status );
			}
		};
	}

	/**
	 * JSON error response.
	 *
	 * @param string $message Message.
	 * @param int    $status  HTTP status.
	 * @param array  $extra   Additional fields.
	 * @return WP_REST_Response
	 */
	private static function error( $message, $status, $extra = array() ) {
		return new WP_REST_Response( array_merge( array( 'error' => $message ), $extra ), $status );
	}

	/**
	 * Calls a WooCommerce REST v3 route in-process as the current user.
	 *
	 * @param string     $method HTTP method.
	 * @param string     $route  Route below /wc/v3/.
	 * @param array      $query  Query parameters.
	 * @param array|null $body   Body parameters.
	 * @return array{0: mixed, 1: array} Response data and headers.
	 * @throws KartoDesk_Error When WooCommerce returns an error.
	 */
	private static function wc( $method, $route, $query = array(), $body = null ) {
		$request = new WP_REST_Request( $method, '/wc/v3/' . $route );
		if ( $query ) {
			$request->set_query_params( $query );
		}
		if ( null !== $body ) {
			$request->set_body_params( $body );
		}
		$response = rest_do_request( $request );
		// In-process responses can contain objects (for example WC_Meta_Data) that only become plain JSON when
		// sent over HTTP. Round-trip through JSON so KartoDesk reads exactly what an API client would.
		$data   = json_decode( wp_json_encode( rest_get_server()->response_to_data( $response, false ) ), true );
		$status = $response->get_status();
		if ( $response->is_error() || $status >= 400 ) {
			$message = is_array( $data ) && ! empty( $data['message'] ) ? wp_strip_all_tags( (string) $data['message'] ) : '';
			if ( 404 === $status ) {
				throw new KartoDesk_Error( esc_html__( 'The store could not find that record (404).', 'kartodesk-for-woocommerce' ), 404 );
			}
			if ( 401 === $status || 403 === $status ) {
				throw new KartoDesk_Error( esc_html__( 'Your WordPress user is not allowed to do this in WooCommerce.', 'kartodesk-for-woocommerce' ), 403 );
			}
			if ( 400 === $status ) {
				throw new KartoDesk_Error( $message ? esc_html( $message ) : esc_html__( 'WooCommerce rejected the request.', 'kartodesk-for-woocommerce' ), 400 );
			}
			/* translators: %d: HTTP status code. */
			throw new KartoDesk_Error( $message ? esc_html( $message ) : esc_html( sprintf( __( 'WooCommerce returned an error (%d).', 'kartodesk-for-woocommerce' ), $status ) ), 502 );
		}
		return array( $data, $response->get_headers() );
	}

	/**
	 * Positive integer query parameter with a fallback and an upper bound.
	 *
	 * @param mixed $value    Raw value.
	 * @param int   $fallback Default.
	 * @param int   $max      Maximum.
	 * @return int
	 */
	private static function page_param( $value, $fallback, $max = PHP_INT_MAX ) {
		if ( ! is_string( $value ) || ! preg_match( '/^[1-9]\d*$/', $value ) ) {
			return $fallback;
		}
		return min( (int) $value, $max );
	}

	/**
	 * GET /settings — store timezone and currency details used for display.
	 *
	 * @return WP_REST_Response
	 */
	public static function settings() {
		$timezone = wp_timezone_string();
		if ( '+00:00' === $timezone ) {
			$timezone = 'UTC';
		}
		return new WP_REST_Response(
			array(
				'timezone'         => $timezone,
				'timezone_warning' => null,
				'configured'       => true,
				'store_url'        => home_url(),
				'access'           => array( 'protected' => true, 'session_ready' => true ),
				'store'            => array(
					'currency'           => get_woocommerce_currency(),
					'decimal_places'     => (string) wc_get_price_decimals(),
					'country'            => (string) get_option( 'woocommerce_default_country' ),
					'prices_include_tax' => (string) get_option( 'woocommerce_prices_include_tax' ),
				),
			)
		);
	}

	/**
	 * GET /woo/orders
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function list_orders( WP_REST_Request $request ) {
		$status = (string) ( $request->get_param( 'status' ) ?? 'all' );
		if ( '' === $status ) {
			$status = 'all';
		}
		// Custom statuses from extensions are allowed, but only as plain slugs.
		if ( ! preg_match( '/^[a-z0-9_-]{1,40}$/', $status ) ) {
			return self::error( __( 'Invalid status filter.', 'kartodesk-for-woocommerce' ), 400 );
		}
		$query = array(
			'page'     => self::page_param( $request->get_param( 'page' ), 1 ),
			'per_page' => self::page_param( $request->get_param( 'per_page' ), 20, 100 ),
			'orderby'  => 'date',
			'order'    => 'desc',
		);
		$search = mb_substr( trim( sanitize_text_field( (string) $request->get_param( 'search' ) ) ), 0, 200 );
		if ( '' !== $search ) {
			$query['search'] = $search;
		}
		if ( 'all' !== $status ) {
			$query['status'] = $status;
		}
		list( $orders, $headers ) = self::wc( 'GET', 'orders', $query );
		return new WP_REST_Response(
			array(
				'configured' => true,
				'orders'     => $orders,
				'total'      => (int) ( $headers['X-WP-Total'] ?? 0 ),
				'pages'      => (int) ( $headers['X-WP-TotalPages'] ?? 1 ),
			)
		);
	}

	/**
	 * GET /woo/orders/{id}
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function get_order( WP_REST_Request $request ) {
		list( $order ) = self::wc( 'GET', 'orders/' . (int) $request['id'] );
		return new WP_REST_Response( $order );
	}

	/**
	 * PATCH /woo/orders/{id} — changes the status only.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function update_status( WP_REST_Request $request ) {
		$status = $request->get_param( 'status' );
		if ( ! in_array( $status, self::EDITABLE_STATUSES, true ) ) {
			return self::error( __( 'Invalid order ID or status.', 'kartodesk-for-woocommerce' ), 400 );
		}
		list( $order ) = self::wc( 'PUT', 'orders/' . (int) $request['id'], array(), array( 'status' => $status ) );
		return new WP_REST_Response( $order );
	}

	/**
	 * POST /woo/orders/bulk — sets one status on up to 100 orders and reports partial failure.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function bulk_status( WP_REST_Request $request ) {
		$ids    = $request->get_param( 'ids' );
		$status = $request->get_param( 'status' );
		$valid  = is_array( $ids ) && count( $ids ) >= 1 && count( $ids ) <= 100 && in_array( $status, self::EDITABLE_STATUSES, true );
		if ( $valid ) {
			foreach ( $ids as $id ) {
				if ( ! ( is_int( $id ) && $id > 0 ) && ! ( is_string( $id ) && preg_match( '/^[1-9]\d*$/', $id ) ) ) {
					$valid = false;
				}
			}
		}
		if ( ! $valid ) {
			return self::error( __( 'Provide 1 to 100 valid order IDs and a valid status.', 'kartodesk-for-woocommerce' ), 400 );
		}
		$updated = 0;
		foreach ( $ids as $id ) {
			try {
				self::wc( 'PUT', 'orders/' . (int) $id, array(), array( 'status' => $status ) );
				++$updated;
			} catch ( KartoDesk_Error $error ) {
				continue;
			}
		}
		if ( count( $ids ) !== $updated ) {
			/* translators: 1: updated count, 2: requested count. */
			return self::error( sprintf( __( '%1$d of %2$d orders updated. Refresh before retrying.', 'kartodesk-for-woocommerce' ), $updated, count( $ids ) ), 502, array( 'updated' => $updated ) );
		}
		return new WP_REST_Response( array( 'updated' => $updated ) );
	}

	/**
	 * GET /woo/orders/{id}/notes
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function list_notes( WP_REST_Request $request ) {
		$type = $request->get_param( 'type' ) ?? 'any';
		if ( ! in_array( $type, array( 'any', 'customer', 'internal' ), true ) ) {
			return self::error( __( 'Invalid order ID or note type.', 'kartodesk-for-woocommerce' ), 400 );
		}
		list( $notes ) = self::wc( 'GET', 'orders/' . (int) $request['id'] . '/notes', array( 'type' => $type ) );
		return new WP_REST_Response( $notes );
	}

	/**
	 * POST /woo/orders/{id}/notes — a customer note is shown to the customer and WooCommerce may email it.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function add_note( WP_REST_Request $request ) {
		$note          = $request->get_param( 'note' );
		$customer_note = $request->get_param( 'customer_note' );
		if ( ! is_string( $note ) || '' === trim( $note ) || mb_strlen( $note ) > 5000 || ( null !== $customer_note && ! is_bool( $customer_note ) ) ) {
			return self::error( __( 'Provide a valid order ID and a note of up to 5,000 characters.', 'kartodesk-for-woocommerce' ), 400 );
		}
		list( $created ) = self::wc(
			'POST',
			'orders/' . (int) $request['id'] . '/notes',
			array(),
			array( 'note' => trim( $note ), 'customer_note' => true === $customer_note )
		);
		return new WP_REST_Response( $created, 201 );
	}

	/**
	 * Validates one stored shipment the same way as the standalone app.
	 *
	 * @param mixed $item Decoded item.
	 * @return bool
	 */
	private static function is_shipment( $item ) {
		if ( ! is_array( $item ) ) {
			return false;
		}
		foreach ( array( 'id', 'carrier', 'tracking_number', 'tracking_url', 'shipped_at' ) as $field ) {
			if ( ! isset( $item[ $field ] ) || ! is_string( $item[ $field ] ) ) {
				return false;
			}
		}
		return '' !== $item['id'] && '' !== trim( $item['carrier'] ) && mb_strlen( $item['carrier'] ) <= 80 &&
			'' !== trim( $item['tracking_number'] ) && mb_strlen( $item['tracking_number'] ) <= 120 &&
			self::valid_tracking_url( $item['tracking_url'] ) && self::valid_date( $item['shipped_at'] );
	}

	/**
	 * Empty, or an HTTPS URL without credentials.
	 *
	 * @param string $value URL.
	 * @return bool
	 */
	private static function valid_tracking_url( $value ) {
		if ( '' === $value ) {
			return true;
		}
		$parts = wp_parse_url( $value );
		return is_array( $parts ) && strlen( $value ) <= 2048 && isset( $parts['scheme'], $parts['host'] ) &&
			'https' === strtolower( $parts['scheme'] ) && empty( $parts['user'] ) && empty( $parts['pass'] );
	}

	/**
	 * Empty, or a real calendar date as YYYY-MM-DD.
	 *
	 * @param string $value Date.
	 * @return bool
	 */
	private static function valid_date( $value ) {
		if ( '' === $value ) {
			return true;
		}
		if ( ! preg_match( '/^(\d{4})-(\d{2})-(\d{2})$/', $value, $match ) ) {
			return false;
		}
		return checkdate( (int) $match[2], (int) $match[3], (int) $match[1] );
	}

	/**
	 * Reads shipments from an order response. Malformed or duplicated metadata is a conflict, so a later
	 * write can never overwrite data KartoDesk does not understand.
	 *
	 * @param array $order Order data from WooCommerce.
	 * @return array{0: int|null, 1: array} Metadata ID and shipments.
	 * @throws KartoDesk_Error On unreadable data.
	 */
	private static function read_shipments( $order ) {
		$entries = array_values(
			array_filter(
				isset( $order['meta_data'] ) && is_array( $order['meta_data'] ) ? $order['meta_data'] : array(),
				static function ( $meta ) {
					return is_array( $meta ) && isset( $meta['key'] ) && self::SHIPMENTS_META_KEY === $meta['key'];
				}
			)
		);
		if ( count( $entries ) > 1 ) {
			throw new KartoDesk_Error( esc_html__( 'This order has more than one wooops_shipments metadata entry. Resolve it in your store before editing tracking.', 'kartodesk-for-woocommerce' ), 409 );
		}
		if ( ! $entries ) {
			return array( null, array() );
		}
		$value = $entries[0]['value'];
		if ( is_string( $value ) ) {
			// Associative decoding would turn an empty JSON object into an empty list.
			if ( ! is_array( json_decode( $value ) ) ) {
				throw new KartoDesk_Error( esc_html__( 'Stored tracking must be a JSON list. It was left unchanged.', 'kartodesk-for-woocommerce' ), 409 );
			}
			$value = json_decode( $value, true );
		}
		$valid = is_array( $value ) && array_values( $value ) === $value;
		if ( $valid ) {
			foreach ( $value as $item ) {
				$valid = $valid && self::is_shipment( $item );
			}
			$valid = $valid && count( array_unique( array_column( $value, 'id' ) ) ) === count( $value );
		}
		if ( ! $valid ) {
			throw new KartoDesk_Error( esc_html__( 'Stored shipment data on this order is not in the expected tracking format. It was left unchanged.', 'kartodesk-for-woocommerce' ), 409 );
		}
		$shipments = array_map(
			static function ( $item ) {
				return array(
					'id'              => $item['id'],
					'carrier'         => $item['carrier'],
					'tracking_number' => $item['tracking_number'],
					'tracking_url'    => $item['tracking_url'],
					'shipped_at'      => $item['shipped_at'],
				);
			},
			$value
		);
		return array( (int) $entries[0]['id'], $shipments );
	}

	/**
	 * Loads an order through WooCommerce.
	 *
	 * @param int $id Order ID.
	 * @return array
	 */
	private static function load_order( $id ) {
		list( $order ) = self::wc( 'GET', 'orders/' . $id );
		return $order;
	}

	/**
	 * Saves the shipment list and returns what WooCommerce reports after the update.
	 * This is a read/modify/write of one metadata value; simultaneous editors can still overwrite each other.
	 *
	 * @param int      $id        Order ID.
	 * @param int|null $meta_id   Existing metadata ID.
	 * @param array    $shipments Shipments.
	 * @return array
	 */
	private static function write_shipments( $id, $meta_id, $shipments ) {
		$meta = array(
			'key'   => self::SHIPMENTS_META_KEY,
			'value' => wp_json_encode( $shipments, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ),
		);
		if ( $meta_id ) {
			$meta = array( 'id' => $meta_id ) + $meta;
		}
		list( $saved ) = self::wc( 'PUT', 'orders/' . $id, array(), array( 'meta_data' => array( $meta ) ) );
		list( , $list ) = self::read_shipments( $saved );
		return $list;
	}

	/**
	 * Adds a customer-facing tracking note. WooCommerce accepting it does not confirm an email was delivered.
	 *
	 * @param int   $id       Order ID.
	 * @param array $order    Order data.
	 * @param array $shipment Shipment.
	 * @throws KartoDesk_Error When the order has no billing email.
	 */
	private static function notify_customer( $id, $order, $shipment ) {
		if ( empty( $order['billing']['email'] ) ) {
			throw new KartoDesk_Error( esc_html__( 'This order has no billing email address, so no customer note was added.', 'kartodesk-for-woocommerce' ), 400 );
		}
		$link = '' !== $shipment['tracking_url']
			? ' Track it here: <a href="' . esc_url( $shipment['tracking_url'] ) . '">' . esc_html( $shipment['tracking_url'] ) . '</a>.'
			: '';
		$date = '' !== $shipment['shipped_at'] ? ' on ' . esc_html( $shipment['shipped_at'] ) : '';
		$note = 'Your order was shipped via ' . esc_html( $shipment['carrier'] ) . $date . '. Tracking number: ' . esc_html( $shipment['tracking_number'] ) . '.' . $link;
		self::wc( 'POST', 'orders/' . $id . '/notes', array(), array( 'note' => $note, 'customer_note' => true ) );
	}

	/**
	 * GET /woo/orders/{id}/shipments
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function list_shipments( WP_REST_Request $request ) {
		list( , $shipments ) = self::read_shipments( self::load_order( (int) $request['id'] ) );
		return new WP_REST_Response( array( 'shipments' => $shipments ) );
	}

	/**
	 * POST /woo/orders/{id}/shipments — saves first; a failed customer note is reported as partial success.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function add_shipment( WP_REST_Request $request ) {
		$id     = (int) $request['id'];
		$fields = array();
		foreach ( array( 'carrier', 'tracking_number', 'tracking_url', 'shipped_at' ) as $field ) {
			$fields[ $field ] = $request->get_param( $field );
		}
		$notify = $request->get_param( 'notify_customer' );
		$valid  = is_string( $fields['carrier'] ) && '' !== trim( $fields['carrier'] ) && mb_strlen( $fields['carrier'] ) <= 80 &&
			is_string( $fields['tracking_number'] ) && '' !== trim( $fields['tracking_number'] ) && mb_strlen( $fields['tracking_number'] ) <= 120 &&
			is_string( $fields['tracking_url'] ) && self::valid_tracking_url( trim( $fields['tracking_url'] ) ) &&
			is_string( $fields['shipped_at'] ) && self::valid_date( $fields['shipped_at'] ) &&
			( null === $notify || is_bool( $notify ) );
		if ( ! $valid ) {
			return self::error( __( 'Provide a carrier, tracking number, and valid optional HTTPS link and date.', 'kartodesk-for-woocommerce' ), 400 );
		}

		$order                     = self::load_order( $id );
		list( $meta_id, $existing ) = self::read_shipments( $order );
		if ( count( $existing ) >= 50 ) {
			return self::error( __( 'This order already has 50 shipments.', 'kartodesk-for-woocommerce' ), 400 );
		}
		foreach ( $existing as $item ) {
			if ( strtolower( $item['carrier'] ) === strtolower( trim( $fields['carrier'] ) ) &&
				strtolower( $item['tracking_number'] ) === strtolower( trim( $fields['tracking_number'] ) ) ) {
				return self::error( __( 'This tracking number is already saved for that carrier.', 'kartodesk-for-woocommerce' ), 409, array( 'shipments' => $existing ) );
			}
		}
		$shipment = array(
			'id'              => wp_generate_uuid4(),
			'carrier'         => trim( $fields['carrier'] ),
			'tracking_number' => trim( $fields['tracking_number'] ),
			'tracking_url'    => trim( $fields['tracking_url'] ),
			'shipped_at'      => $fields['shipped_at'],
		);
		$saved = self::write_shipments( $id, $meta_id, array_merge( $existing, array( $shipment ) ) );
		if ( ! in_array( $shipment, $saved, true ) ) {
			return self::error( __( 'Store responded, but the new shipment was not in the saved order. Reload before retrying.', 'kartodesk-for-woocommerce' ), 502, array( 'shipments' => $saved ) );
		}

		// The shipment is saved from here on; a notification failure is partial success, never a failed save.
		if ( true !== $notify ) {
			return new WP_REST_Response( array( 'saved' => true, 'shipments' => $saved, 'email_requested' => false ), 201 );
		}
		try {
			self::notify_customer( $id, $order, $shipment );
			return new WP_REST_Response( array( 'saved' => true, 'shipments' => $saved, 'email_requested' => true ), 201 );
		} catch ( KartoDesk_Error $error ) {
			return new WP_REST_Response(
				array(
					'saved'                 => true,
					'shipments'             => $saved,
					'email_requested'       => false,
					'email_shipment_id'     => $shipment['id'],
					'email_error'           => $error->getMessage(),
					'email_outcome_unknown' => $error->status >= 500,
				),
				201
			);
		}
	}

	/**
	 * PATCH /woo/orders/{id}/shipments — adds the customer tracking note again for one shipment.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function email_shipment( WP_REST_Request $request ) {
		$shipment_id = $request->get_param( 'shipment_id' );
		if ( ! is_string( $shipment_id ) || '' === $shipment_id ) {
			return self::error( __( 'Invalid order or shipment ID.', 'kartodesk-for-woocommerce' ), 400 );
		}
		$id                  = (int) $request['id'];
		$order               = self::load_order( $id );
		list( , $shipments ) = self::read_shipments( $order );
		foreach ( $shipments as $shipment ) {
			if ( $shipment['id'] === $shipment_id ) {
				self::notify_customer( $id, $order, $shipment );
				return new WP_REST_Response( array( 'email_requested' => true ) );
			}
		}
		return self::error( __( 'Shipment not found. Reload the order.', 'kartodesk-for-woocommerce' ), 404 );
	}

	/**
	 * DELETE /woo/orders/{id}/shipments — removes one shipment and confirms it is gone.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function remove_shipment( WP_REST_Request $request ) {
		$shipment_id = $request->get_param( 'shipment_id' );
		if ( ! is_string( $shipment_id ) || '' === $shipment_id ) {
			return self::error( __( 'Invalid order or shipment ID.', 'kartodesk-for-woocommerce' ), 400 );
		}
		$id                         = (int) $request['id'];
		list( $meta_id, $shipments ) = self::read_shipments( self::load_order( $id ) );
		$updated                    = array_values(
			array_filter(
				$shipments,
				static function ( $item ) use ( $shipment_id ) {
					return $item['id'] !== $shipment_id;
				}
			)
		);
		if ( count( $updated ) === count( $shipments ) ) {
			return self::error( __( 'Shipment not found. It may already have been removed.', 'kartodesk-for-woocommerce' ), 404, array( 'shipments' => $shipments ) );
		}
		$saved = self::write_shipments( $id, $meta_id, $updated );
		if ( in_array( $shipment_id, array_column( $saved, 'id' ), true ) ) {
			return self::error( __( 'Store responded, but the shipment is still on the order. Reload before retrying.', 'kartodesk-for-woocommerce' ), 502, array( 'shipments' => $saved ) );
		}
		return new WP_REST_Response( array( 'shipments' => $saved ) );
	}
}
