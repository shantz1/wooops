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

	/** Statuses WooCommerce registers for internal use; listed but never offered as a new status. */
	const INTERNAL_STATUSES = array( 'trash', 'checkout-draft', 'draft', 'auto-draft' );

	/**
	 * Registers hooks.
	 */
	public static function init() {
		add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
		add_filter( 'rest_post_dispatch', array( __CLASS__, 'private_response' ), 10, 3 );
	}

	/** Never allow a shared cache to retain customer data or permission errors. */
	public static function private_response( $response, $server, $request ) {
		if ( 0 === strpos( $request->get_route(), '/' . self::REST_NAMESPACE . '/' ) ) {
			$response->header( 'Cache-Control', 'private, no-store, max-age=0' );
			$response->header( 'X-Robots-Tag', 'noindex, nofollow' );
			$response->header( 'X-Content-Type-Options', 'nosniff' );
		}
		return $response;
	}

	/**
	 * Builds a permission callback. A requirement is a list of permissions (all needed), array( 'any' => list )
	 * (one needed), or 'signed-in' (any KartoDesk permission). WordPress also checks REST nonces for cookies.
	 *
	 * @param array|string $requirement Requirement.
	 * @return callable
	 */
	private static function permission( $requirement ) {
		return static function () use ( $requirement ) {
			if ( 'signed-in' === $requirement ) {
				return current_user_can( KartoDesk_Access::MENU_CAPABILITY );
			}
			if ( isset( $requirement['any'] ) ) {
				foreach ( $requirement['any'] as $permission ) {
					if ( KartoDesk_Access::can( $permission ) ) {
						return true;
					}
				}
				return false;
			}
			foreach ( $requirement as $permission ) {
				if ( ! KartoDesk_Access::can( $permission ) ) {
					return false;
				}
			}
			return true;
		};
	}

	/**
	 * Body-dependent checks, e.g. a customer-facing note also needs the "Notify customers" permission.
	 *
	 * @param string $permission Permission key.
	 * @throws KartoDesk_Error When the current user lacks it.
	 */
	private static function require_permission( $permission ) {
		if ( ! KartoDesk_Access::can( $permission ) ) {
			throw new KartoDesk_Error( esc_html__( 'Your role does not allow this action.', 'kartodesk-for-woocommerce' ), 403 );
		}
	}

	/**
	 * Product and variation fields that change stock and therefore also need the "Change stock" permission.
	 *
	 * @param mixed $fields Submitted fields.
	 * @return bool
	 */
	public static function touches_stock( $fields ) {
		return is_array( $fields ) && (bool) array_intersect( array_keys( $fields ), array( 'manage_stock', 'stock_quantity', 'stock_status', 'backorders', 'low_stock_amount' ) );
	}

	/**
	 * Registers routes. Paths match the standalone app with the leading `/api/` removed; each method names
	 * its handler and the permissions it requires (src/lib/permissions.ts holds the same table).
	 */
	public static function register_routes() {
		$order   = '/woo/orders/(?P<id>[1-9]\d*)';
		$product = '/woo/products/(?P<id>[1-9]\d*)';
		$routes  = array(
			'/timezone'           => array( 'GET' => array( 'timezone', 'signed-in' ) ),
			'/settings'           => array( 'GET' => array( 'settings', 'signed-in' ) ),
			'/access'             => array(
				'GET' => array( 'access', array( 'settings.view' ) ),
				'PUT' => array( 'update_access', array( 'settings.view' ) ),
			),
			'/reports'            => array( 'GET' => array( 'reports', array( 'reports.view' ) ) ),
			'/woo/connection'     => array( 'GET' => array( 'connection', array( 'settings.view' ) ) ),
			'/woo/products'       => array(
				'GET'  => array( 'list_products', array( 'products.view' ) ),
				'POST' => array( 'create_product', array( 'products.edit' ) ),
			),
			'/woo/catalog'        => array(
				'GET'   => array( 'catalog', array( 'products.view' ) ),
				'POST'  => array( 'catalog', array( 'products.edit' ) ),
				'PATCH' => array( 'catalog', array( 'products.edit' ) ),
			),
			// A product edit or a stock change; the handler checks which permission applies.
			$product              => array(
				'GET'   => array( 'get_product', array( 'products.view' ) ),
				'PATCH' => array( 'update_stock', array( 'any' => array( 'products.edit', 'inventory.edit' ) ) ),
			),
			'/woo/customers'      => array( 'GET' => array( 'list_customers', array( 'customers.view' ) ) ),
			'/woo/orders'         => array( 'GET' => array( 'list_orders', array( 'orders.view' ) ) ),
			'/woo/order-statuses' => array( 'GET' => array( 'order_statuses', array( 'any' => array( 'orders.view', 'reports.view' ) ) ) ),
			'/woo/orders/bulk'    => array( 'POST' => array( 'bulk_status', array( 'orders.status' ) ) ),
			$order                => array(
				'GET'   => array( 'get_order', array( 'orders.view' ) ),
				'PATCH' => array( 'update_status', array( 'orders.status' ) ),
			),
			$order . '/notes'     => array(
				'GET'  => array( 'list_notes', array( 'orders.view' ) ),
				'POST' => array( 'add_note', array( 'orders.notes' ) ),
			),
			$order . '/shipments' => array(
				'GET'    => array( 'list_shipments', array( 'orders.view' ) ),
				'POST'   => array( 'add_shipment', array( 'orders.shipments' ) ),
				'PATCH'  => array( 'email_shipment', array( 'orders.notify' ) ),
				'DELETE' => array( 'remove_shipment', array( 'orders.shipments' ) ),
			),
		);
		foreach ( $routes as $path => $methods ) {
			$endpoints = array();
			foreach ( $methods as $method => $definition ) {
				$endpoints[] = array(
					'methods'             => $method,
					'callback'            => self::handler( $definition[0] ),
					'permission_callback' => self::permission( $definition[1] ),
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
				if ( strlen( $request->get_body() ) > 65536 ) {
					return self::error( esc_html__( 'Request body is too large.', 'kartodesk-for-woocommerce' ), 413 );
				}
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
	/** Lightweight workspace configuration; no catalog or system-status query. */
	public static function timezone() {
		return new WP_REST_Response( array(
			'timezone' => wp_timezone_string(), 'timezone_warning' => null,
			'access' => self::current_access(),
		) );
	}

	/**
	 * The signed-in user's role and KartoDesk permissions.
	 *
	 * @return array
	 */
	private static function current_access() {
		$user  = wp_get_current_user();
		$slug  = $user->roles ? (string) reset( $user->roles ) : '';
		$names = wp_roles()->get_names();
		return array(
			'role'        => $slug,
			'role_label'  => isset( $names[ $slug ] ) ? translate_user_role( $names[ $slug ] ) : $slug,
			'name'        => $user->display_name,
			'permissions' => KartoDesk_Access::current_permissions(),
		);
	}

	/**
	 * Roles and their permissions for Settings > Access.
	 *
	 * @return array
	 */
	private static function access_rules() {
		return array(
			'editable' => KartoDesk_Access::can_edit_roles(),
			'source'   => 'wordpress',
			'roles'    => KartoDesk_Access::roles(),
			'logins'   => array(),
		);
	}

	/**
	 * GET /access — which role has which permission.
	 *
	 * @return WP_REST_Response
	 */
	public static function access() {
		return new WP_REST_Response( self::access_rules() );
	}

	/**
	 * PUT /access — set one role's permissions. Only users who can manage the site may change roles.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function update_access( WP_REST_Request $request ) {
		if ( ! KartoDesk_Access::can_edit_roles() ) {
			return self::error( esc_html__( 'Only administrators can change role permissions.', 'kartodesk-for-woocommerce' ), 403 );
		}
		$permissions = $request->get_param( 'permissions' );
		$result      = KartoDesk_Access::update_role( $request->get_param( 'role' ), is_array( $permissions ) ? array_values( $permissions ) : null );
		if ( is_wp_error( $result ) ) {
			return self::error( esc_html( $result->get_error_message() ), 400 );
		}
		return new WP_REST_Response( self::access_rules() );
	}

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
				'access'           => array_merge(
					array( 'protected' => true, 'session_ready' => true, 'two_factor' => false ),
					self::current_access(),
					array( 'rules' => KartoDesk_Access::can( 'settings.view' ) ? self::access_rules() : null )
				),
				'store'            => array(
					'currency'           => get_woocommerce_currency(),
					'decimal_places'     => (string) wc_get_price_decimals(),
					'country'            => (string) get_option( 'woocommerce_default_country' ),
					'prices_include_tax' => (string) get_option( 'woocommerce_prices_include_tax' ),
					// Used on packing slips.
					'name'               => wp_strip_all_tags( get_bloginfo( 'name' ) ),
					'address'            => array(
						'address_1' => WC()->countries->get_base_address(),
						'address_2' => WC()->countries->get_base_address_2(),
						'city'      => WC()->countries->get_base_city(),
						'postcode'  => WC()->countries->get_base_postcode(),
						'state'     => WC()->countries->get_base_state(),
						'country'   => WC()->countries->get_base_country(),
					),
				),
			)
		);
	}

	/**
	 * Every registered order status without the wc- prefix, including custom statuses from extensions.
	 *
	 * @return array<string, string> Slug => label.
	 */
	private static function registered_statuses() {
		$statuses = array();
		foreach ( wc_get_order_statuses() as $key => $label ) {
			$slug = 0 === strpos( $key, 'wc-' ) ? substr( $key, 3 ) : $key;
			if ( preg_match( '/^[a-z0-9_-]{1,40}$/', $slug ) ) {
				$statuses[ $slug ] = wp_strip_all_tags( (string) $label );
			}
		}
		return $statuses;
	}

	/**
	 * Standard statuses are always accepted; custom ones must currently be registered in the store.
	 *
	 * @param mixed $status Requested status.
	 * @return bool
	 */
	private static function is_settable_status( $status ) {
		if ( in_array( $status, self::EDITABLE_STATUSES, true ) ) {
			return true;
		}
		return is_string( $status ) && ! in_array( $status, self::INTERNAL_STATUSES, true ) && array_key_exists( $status, self::registered_statuses() );
	}

	/**
	 * GET /woo/order-statuses — the store's statuses with order counts, same shape as the standalone app.
	 *
	 * @return WP_REST_Response
	 */
	public static function order_statuses() {
		$statuses = array();
		foreach ( self::registered_statuses() as $slug => $name ) {
			$statuses[] = array(
				'slug'     => $slug,
				'name'     => mb_substr( '' !== trim( $name ) ? trim( $name ) : $slug, 0, 80 ),
				'count'    => (int) wc_orders_count( $slug ),
				'settable' => ! in_array( $slug, self::INTERNAL_STATUSES, true ),
			);
		}
		return new WP_REST_Response( array( 'statuses' => $statuses ) );
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
			'_fields' => 'id,number,status,currency,total,date_created,date_created_gmt,customer_id,billing.first_name,billing.last_name,billing.email,payment_method_title',
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
		if ( ! self::is_settable_status( $status ) ) {
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
		$valid  = is_array( $ids ) && count( $ids ) >= 1 && count( $ids ) <= 100 && self::is_settable_status( $status );
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
		if ( true === $customer_note ) {
			self::require_permission( 'orders.notify' );
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
		if ( true === $notify ) {
			self::require_permission( 'orders.notify' );
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
