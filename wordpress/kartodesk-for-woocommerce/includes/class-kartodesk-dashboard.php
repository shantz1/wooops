<?php
/**
 * Personal overview preferences and a native WordPress dashboard widget.
 *
 * @package KartoDesk
 */

defined( 'ABSPATH' ) || exit;

/** No dashboard redirects, replacements or changes to other widgets. */
class KartoDesk_Dashboard {

	const META_KEY = 'kartodesk_dashboard_preferences';
	const DEFAULT_CARDS = array( 'recent_orders', 'recent_pending', 'recent_value', 'recent_customers' );
	const BASE_CARDS = array( 'recent_orders', 'recent_pending', 'recent_value', 'recent_customers', 'orders_today', 'orders_week' );

	/** Register only on the WordPress dashboard. */
	public static function init() {
		add_action( 'wp_dashboard_setup', array( __CLASS__, 'register_widget' ) );
	}

	/** Read only the signed-in user's preferences. */
	public static function preferences() {
		$value = get_user_meta( get_current_user_id(), self::META_KEY, true );
		return self::valid_preferences( $value ) ? $value : array( 'cards' => self::DEFAULT_CARDS, 'widget_enabled' => true );
	}

	/** Strict shape validation, matching src/lib/dashboard.ts. */
	public static function valid_preferences( $value ) {
		if ( ! is_array( $value ) || ! isset( $value['cards'], $value['widget_enabled'] ) || ! is_array( $value['cards'] ) || ! is_bool( $value['widget_enabled'] ) || count( $value['cards'] ) < 1 || count( $value['cards'] ) > 4 || array_values( $value['cards'] ) !== $value['cards'] ) {
			return false;
		}
		foreach ( $value['cards'] as $card ) {
			if ( ! self::valid_card( $card ) ) {
				return false;
			}
		}
		return count( array_unique( $value['cards'] ) ) === count( $value['cards'] );
	}

	/** Exclude internal statuses even when someone sends a request directly. */
	private static function valid_card( $card ) {
		return is_string( $card ) && ( in_array( $card, self::BASE_CARDS, true ) || ( preg_match( '/^status:[a-z0-9_-]{1,40}$/D', $card ) && ! in_array( substr( $card, 7 ), array( 'trash', 'draft', 'auto-draft', 'checkout-draft' ), true ) ) );
	}

	/** A custom status must still be registered. No arbitrary status queries. */
	private static function registered_card( $card ) {
		return 0 !== strpos( $card, 'status:' ) || isset( wc_get_order_statuses()[ 'wc-' . substr( $card, 7 ) ] );
	}

	/** Save personal layout, not roles or store settings. REST checks the nonce and permission. */
	public static function save_preferences( $value ) {
		if ( ! KartoDesk_Access::can( 'settings.view' ) ) {
			throw new KartoDesk_Error( esc_html__( 'Your role does not allow this action.', 'kartodesk-for-woocommerce' ), 403 );
		}
		if ( ! self::valid_preferences( $value ) ) {
			throw new KartoDesk_Error( esc_html__( 'Choose between one and four unique dashboard cards.', 'kartodesk-for-woocommerce' ), 400 );
		}
		foreach ( $value['cards'] as $card ) {
			if ( ! self::registered_card( $card ) ) {
				throw new KartoDesk_Error( esc_html__( 'A selected order status is no longer available.', 'kartodesk-for-woocommerce' ), 400 );
			}
		}
		$next = array( 'cards' => $value['cards'], 'widget_enabled' => $value['widget_enabled'] );
		$old  = get_user_meta( get_current_user_id(), self::META_KEY, true );
		if ( $old !== $next && ! update_user_meta( get_current_user_id(), self::META_KEY, $next ) ) {
			throw new KartoDesk_Error( esc_html__( 'Could not save dashboard preferences. Please retry.', 'kartodesk-for-woocommerce' ), 500 );
		}
		return $next;
	}

	/** GMT query bounds for a whole store calendar day or week (Monday start). */
	public static function count_query( $card, $now = null ) {
		if ( ! self::valid_card( $card ) || in_array( $card, self::DEFAULT_CARDS, true ) ) {
			throw new KartoDesk_Error( esc_html__( 'Invalid dashboard count card.', 'kartodesk-for-woocommerce' ), 400 );
		}
		$query = array( 'per_page' => 1, '_fields' => 'id', 'status' => 'any' );
		if ( 0 === strpos( $card, 'status:' ) ) {
			$query['status'] = substr( $card, 7 );
			return $query;
		}
		$today = ( $now ? $now : new DateTimeImmutable( 'now', wp_timezone() ) )->setTimezone( wp_timezone() )->setTime( 0, 0 );
		$start = 'orders_week' === $card ? $today->modify( '-' . ( (int) $today->format( 'N' ) - 1 ) . ' days' ) : $today;
		$utc   = new DateTimeZone( 'UTC' );
		$query['after']         = $start->setTimezone( $utc )->format( 'Y-m-d\TH:i:s' );
		$query['before']        = $today->modify( '+1 day' )->modify( '-1 second' )->setTimezone( $utc )->format( 'Y-m-d\TH:i:s' );
		$query['dates_are_gmt'] = true;
		return $query;
	}

	/** Read through WooCommerce's REST controller so its capabilities also apply. */
	private static function read_orders( $query ) {
		$request = new WP_REST_Request( 'GET', '/wc/v3/orders' );
		$request->set_query_params( $query );
		$response = rest_do_request( $request );
		if ( $response->is_error() || $response->get_status() >= 400 ) {
			throw new KartoDesk_Error( esc_html__( 'Order data could not be read. Check your store permissions and retry.', 'kartodesk-for-woocommerce' ), $response->get_status() >= 400 ? $response->get_status() : 502 );
		}
		return $response;
	}

	/** Count only requested cards; per_page=1 avoids downloading the store's orders. */
	public static function metrics( $cards ) {
		if ( ! KartoDesk_Access::can( 'orders.view' ) ) {
			throw new KartoDesk_Error( esc_html__( 'Your role does not allow viewing orders.', 'kartodesk-for-woocommerce' ), 403 );
		}
		if ( ! self::valid_preferences( array( 'cards' => $cards, 'widget_enabled' => false ) ) ) {
			throw new KartoDesk_Error( esc_html__( 'Invalid dashboard cards.', 'kartodesk-for-woocommerce' ), 400 );
		}
		$counts = array();
		$now    = new DateTimeImmutable( 'now', wp_timezone() );
		foreach ( $cards as $card ) {
			if ( ! self::registered_card( $card ) ) {
				throw new KartoDesk_Error( esc_html__( 'A selected order status is no longer available.', 'kartodesk-for-woocommerce' ), 400 );
			}
			$response = self::read_orders( self::count_query( $card, $now ) );
			$headers  = array_change_key_case( $response->get_headers(), CASE_LOWER );
			if ( ! isset( $headers['x-wp-total'] ) || ! preg_match( '/^\d+$/D', (string) $headers['x-wp-total'] ) ) {
				throw new KartoDesk_Error( esc_html__( 'The store did not return an order count.', 'kartodesk-for-woocommerce' ), 502 );
			}
			$counts[ $card ] = (int) $headers['x-wp-total'];
		}
		return array( 'configured' => true, 'counts' => $counts, 'timezone' => wp_timezone_string(), 'timezone_warning' => null );
	}

	/** Enabled by default; saved preferences and WordPress hide/collapse controls are respected. */
	public static function register_widget() {
		if ( ! KartoDesk_Access::can( 'orders.view' ) || ! current_user_can( 'read_private_shop_orders' ) || ! self::preferences()['widget_enabled'] ) {
			return;
		}
		wp_add_dashboard_widget( 'kartodesk_overview', __( 'KartoDesk overview', 'kartodesk-for-woocommerce' ), array( __CLASS__, 'render_widget' ), null, null, 'kartodesk' );
		add_action( 'admin_footer-index.php', array( __CLASS__, 'render_widget_area' ) );
		wp_enqueue_style( 'kartodesk-dashboard-widget', plugins_url( 'dashboard-widget.css', KARTODESK_FILE ), array(), KARTODESK_VERSION . '-' . filemtime( KARTODESK_DIR . 'dashboard-widget.css' ) );
		wp_enqueue_script( 'kartodesk-dashboard-widget', plugins_url( 'dashboard-widget.js', KARTODESK_FILE ), array( 'dashboard' ), KARTODESK_VERSION . '-' . filemtime( KARTODESK_DIR . 'dashboard-widget.js' ), true );
	}

	/** An additional native sortable context, leaving the four standard dashboard columns intact. */
	public static function render_widget_area() {
		if ( ! KartoDesk_Access::can( 'orders.view' ) || ! current_user_can( 'read_private_shop_orders' ) || ! self::preferences()['widget_enabled'] ) {
			return;
		}
		echo '<div id="kartodesk-dashboard-wide" class="metabox-holder">';
		do_meta_boxes( 'dashboard', 'kartodesk', '' );
		echo '</div>';
	}

	/** Escaped, scoped widget content. No promotions, global notices or customer details. */
	public static function render_widget() {
		if ( ! KartoDesk_Access::can( 'orders.view' ) || ! current_user_can( 'read_private_shop_orders' ) ) {
			return;
		}
		$cards = self::preferences()['cards'];
		try {
			$count_cards = array_values( array_filter( $cards, static function ( $card ) { return ! in_array( $card, self::DEFAULT_CARDS, true ); } ) );
			$counts      = $count_cards ? self::metrics( $count_cards )['counts'] : array();
			$recent      = array_intersect( $cards, self::DEFAULT_CARDS ) ? self::read_orders( array( 'per_page' => 5, 'orderby' => 'date', 'order' => 'desc', '_fields' => 'status,currency,total,customer_id' ) )->get_data() : array();
			$customers   = array();
			$currencies  = array();
			$pending     = 0;
			foreach ( $recent as $order ) {
				if ( ! empty( $order['customer_id'] ) ) { $customers[ $order['customer_id'] ] = true; }
				$currencies[ $order['currency'] ][] = $order['total'];
				if ( in_array( $order['status'], array( 'processing', 'on-hold' ), true ) ) { ++$pending; }
			}
			$values = array( 'recent_orders' => count( $recent ), 'recent_pending' => $pending, 'recent_customers' => count( $customers ), 'recent_value' => '—' );
			if ( count( $currencies ) > 1 ) {
				$values['recent_value'] = __( 'Mixed currencies', 'kartodesk-for-woocommerce' );
			} elseif ( $currencies ) {
				$currency = key( $currencies );
				// Sum integer minor units to avoid binary rounding. Each order total is already a currency amount.
				$decimals = wc_get_price_decimals();
				$sum      = 0;
				foreach ( $currencies[ $currency ] as $total ) { $sum += (int) round( (float) $total * pow( 10, $decimals ) ); }
				$values['recent_value'] = html_entity_decode( wp_strip_all_tags( wc_price( $sum / pow( 10, $decimals ), array( 'currency' => $currency ) ) ), ENT_QUOTES, 'UTF-8' );
			}
			$labels = array(
				'recent_orders' => __( 'Recent orders', 'kartodesk-for-woocommerce' ),
				'recent_pending' => __( 'Processing or on hold', 'kartodesk-for-woocommerce' ),
				'recent_value' => __( 'Recent order value', 'kartodesk-for-woocommerce' ),
				'recent_customers' => __( 'Registered customers', 'kartodesk-for-woocommerce' ),
				'orders_today' => __( 'Orders today', 'kartodesk-for-woocommerce' ),
				'orders_week' => __( 'Orders this week', 'kartodesk-for-woocommerce' ),
			);
			$statuses = wc_get_order_statuses();
			echo '<div class="kartodesk-widget-cards">';
			foreach ( $cards as $card ) {
				$label = isset( $labels[ $card ] ) ? $labels[ $card ] : wp_strip_all_tags( $statuses[ 'wc-' . substr( $card, 7 ) ] );
				$hint  = in_array( $card, self::DEFAULT_CARDS, true ) ? __( 'Latest 5 orders only', 'kartodesk-for-woocommerce' ) : ( 'orders_week' === $card ? __( 'Since Monday · store timezone', 'kartodesk-for-woocommerce' ) : ( 'orders_today' === $card ? __( 'Today · store timezone', 'kartodesk-for-woocommerce' ) : __( 'All orders in this status', 'kartodesk-for-woocommerce' ) ) );
				$value = isset( $counts[ $card ] ) ? number_format_i18n( $counts[ $card ] ) : $values[ $card ];
				echo '<div class="kartodesk-widget-card"><span>' . esc_html( $label ) . '</span><strong>' . esc_html( $value ) . '</strong><small>' . esc_html( $hint ) . '</small></div>';
			}
			echo '</div>';
		} catch ( KartoDesk_Error $error ) {
			echo '<p>' . esc_html__( 'Overview data is unavailable. Open KartoDesk to retry or change your selected cards.', 'kartodesk-for-woocommerce' ) . '</p>';
		}
		echo '<p><a href="' . esc_url( admin_url( 'admin.php?page=kartodesk#/' ) ) . '">' . esc_html__( 'Open KartoDesk', 'kartodesk-for-woocommerce' ) . '</a>';
		if ( KartoDesk_Access::can( 'settings.view' ) ) {
			echo ' · <a href="' . esc_url( admin_url( 'admin.php?page=kartodesk#/settings' ) ) . '">' . esc_html__( 'Customize cards', 'kartodesk-for-woocommerce' ) . '</a>';
		}
		echo '</p>';
	}
}
