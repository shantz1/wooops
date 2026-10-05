<?php
/**
 * Permission-based access for KartoDesk.
 *
 * Each permission is a WordPress capability, granted per role from KartoDesk > Settings > Access.
 * KartoDesk only narrows access: every data request still goes through WooCommerce's REST controllers as
 * the signed-in user, so WooCommerce's own capability checks apply on top.
 *
 * @package KartoDesk
 */

defined( 'ABSPATH' ) || exit;

/**
 * Registers KartoDesk capabilities, their defaults and the access settings endpoint.
 */
class KartoDesk_Access {

	/**
	 * Permission key => WordPress capability. Keep in sync with src/lib/permissions.ts.
	 */
	const PERMISSIONS = array(
		'orders.view'      => 'kartodesk_view_orders',
		'orders.status'    => 'kartodesk_change_order_status',
		'orders.notes'     => 'kartodesk_add_order_notes',
		'orders.notify'    => 'kartodesk_notify_customers',
		'orders.shipments' => 'kartodesk_manage_shipments',
		'products.view'    => 'kartodesk_view_products',
		'products.edit'    => 'kartodesk_edit_products',
		'inventory.edit'   => 'kartodesk_edit_stock',
		'customers.view'   => 'kartodesk_view_customers',
		'reports.view'     => 'kartodesk_view_reports',
		'settings.view'    => 'kartodesk_manage_settings',
		'orders.refund'    => 'kartodesk_refund_orders',
		'orders.delete'    => 'kartodesk_delete_orders',
		'discounts.manage' => 'kartodesk_manage_discounts',
		'customers.edit'   => 'kartodesk_edit_customers',
		'tools.run'        => 'kartodesk_run_tools',
	);

	/**
	 * WooCommerce capabilities each permission relies on. WooCommerce checks these itself; they are shown
	 * as warnings when a role has a KartoDesk permission without the matching WooCommerce capability.
	 */
	const WOOCOMMERCE_CAPS = array(
		'orders.view'      => array( 'read_private_shop_orders' ),
		'orders.status'    => array( 'edit_shop_orders', 'edit_others_shop_orders' ),
		'orders.notes'     => array( 'publish_shop_orders' ),
		'orders.notify'    => array( 'publish_shop_orders' ),
		'orders.shipments' => array( 'edit_shop_orders', 'edit_others_shop_orders' ),
		'products.view'    => array( 'read_private_products' ),
		'products.edit'    => array( 'edit_products', 'edit_others_products', 'publish_products', 'manage_product_terms' ),
		'inventory.edit'   => array( 'edit_products', 'edit_others_products' ),
		'customers.view'   => array( 'list_users' ),
		'reports.view'     => array( 'view_woocommerce_reports' ),
		'settings.view'    => array( 'manage_woocommerce' ),
		'orders.refund'    => array( 'publish_shop_orders' ),
		'orders.delete'    => array( 'delete_shop_orders', 'delete_others_shop_orders' ),
		'discounts.manage' => array( 'read_private_shop_coupons', 'edit_shop_coupons', 'edit_others_shop_coupons', 'publish_shop_coupons' ),
		'customers.edit'   => array( 'list_users', 'create_users', 'edit_users' ),
		'tools.run'        => array( 'manage_woocommerce' ),
	);

	/** Meta capability for the admin menu: granted to anyone with at least one KartoDesk permission. */
	const MENU_CAPABILITY = 'kartodesk_access';

	/** Roles that receive every permission on first install, matching the previous all-or-nothing access. */
	const DEFAULT_ROLES = array( 'administrator', 'shop_manager' );

	const DEFAULTS_OPTION = 'kartodesk_access_defaults';
	const DEFAULTS_VERSION_OPTION = 'kartodesk_access_version';

	const PERMISSION_SETS = array(
		1 => array( 'orders.view', 'orders.status', 'orders.notes', 'orders.notify', 'orders.shipments', 'products.view', 'products.edit', 'inventory.edit', 'customers.view', 'reports.view', 'settings.view' ),
		2 => array( 'orders.refund', 'orders.delete', 'discounts.manage', 'customers.edit', 'tools.run' ),
	);

	/**
	 * Registers hooks.
	 */
	public static function init() {
		add_filter( 'user_has_cap', array( __CLASS__, 'user_has_cap' ), 10, 1 );
		// Runs on every request type (including REST) so an in-place update also installs the defaults.
		add_action( 'init', array( __CLASS__, 'install_defaults' ) );
	}

	/**
	 * Administrators always hold every KartoDesk permission, so nobody can be locked out; anyone with at
	 * least one permission can open the KartoDesk menu.
	 *
	 * @param array $allcaps Capabilities the user has.
	 * @return array
	 */
	public static function user_has_cap( $allcaps ) {
		if ( ! empty( $allcaps['manage_options'] ) ) {
			foreach ( self::PERMISSIONS as $capability ) {
				$allcaps[ $capability ] = true;
			}
		}
		foreach ( self::PERMISSIONS as $capability ) {
			if ( ! empty( $allcaps[ $capability ] ) ) {
				$allcaps[ self::MENU_CAPABILITY ] = true;
				break;
			}
		}
		return $allcaps;
	}

	/**
	 * Grants permissions to the default roles incrementally by version. On activation or when updating,
	 * only new permissions from versions not yet applied are granted. Later changes made in Settings > Access
	 * are never overwritten.
	 */
	public static function install_defaults() {
		$applied_version = (int) get_option(
			self::DEFAULTS_VERSION_OPTION,
			get_option( self::DEFAULTS_OPTION ) ? 1 : 0
		);

		$max_version = max( array_keys( self::PERMISSION_SETS ) );

		if ( $applied_version >= $max_version ) {
			return;
		}

		foreach ( self::DEFAULT_ROLES as $slug ) {
			$role = get_role( $slug );
			if ( ! $role ) {
				continue;
			}

			foreach ( self::PERMISSION_SETS as $version => $permission_keys ) {
				if ( $version > $applied_version ) {
					foreach ( $permission_keys as $permission ) {
						if ( isset( self::PERMISSIONS[ $permission ] ) ) {
							$role->add_cap( self::PERMISSIONS[ $permission ] );
						}
					}
				}
			}
		}

		update_option( self::DEFAULTS_VERSION_OPTION, $max_version, true );
	}

	/**
	 * Removes every KartoDesk capability from every role (used on uninstall).
	 */
	public static function remove_all() {
		foreach ( array_keys( wp_roles()->roles ) as $slug ) {
			$role = get_role( $slug );
			if ( $role ) {
				foreach ( self::PERMISSIONS as $capability ) {
					$role->remove_cap( $capability );
				}
			}
		}
		delete_option( self::DEFAULTS_OPTION );
		delete_option( self::DEFAULTS_VERSION_OPTION );
	}

	/**
	 * Whether the current user has a permission.
	 *
	 * @param string $permission Permission key.
	 * @return bool
	 */
	public static function can( $permission ) {
		return isset( self::PERMISSIONS[ $permission ] ) && current_user_can( self::PERMISSIONS[ $permission ] );
	}

	/**
	 * The current user's permission keys.
	 *
	 * @return string[]
	 */
	public static function current_permissions() {
		return array_values( array_filter( array_keys( self::PERMISSIONS ), array( __CLASS__, 'can' ) ) );
	}

	/**
	 * Whether the current user may change which role has which permission.
	 *
	 * @return bool
	 */
	public static function can_edit_roles() {
		return current_user_can( 'manage_options' );
	}

	/**
	 * Every role with its permissions and any WooCommerce capability it is missing for them.
	 *
	 * @return array
	 */
	public static function roles() {
		$roles = array();
		foreach ( wp_roles()->roles as $slug => $definition ) {
			$capabilities = isset( $definition['capabilities'] ) && is_array( $definition['capabilities'] ) ? $definition['capabilities'] : array();
			$locked       = ! empty( $capabilities['manage_options'] );
			$permissions  = array();
			$missing      = array();
			foreach ( self::PERMISSIONS as $permission => $capability ) {
				$lacking = array_values( array_filter( self::WOOCOMMERCE_CAPS[ $permission ], static function ( $woo_cap ) use ( $capabilities ) {
					return empty( $capabilities[ $woo_cap ] );
				} ) );
				if ( $lacking ) {
					$missing[ $permission ] = $lacking;
				}
				if ( $locked || ! empty( $capabilities[ $capability ] ) ) {
					$permissions[] = $permission;
				}
			}
			$roles[] = array(
				'slug'        => $slug,
				'label'       => translate_user_role( isset( $definition['name'] ) ? $definition['name'] : $slug ),
				'permissions' => $permissions,
				'built_in'    => $locked,
				'locked'      => $locked,
				'missing'     => (object) $missing,
			);
		}
		return $roles;
	}

	/**
	 * Sets one role's permissions. Roles that can manage the site keep full access and cannot be edited.
	 *
	 * @param string   $slug        Role slug.
	 * @param string[] $permissions Permission keys to grant; all others are removed.
	 * @return true|WP_Error
	 */
	public static function update_role( $slug, $permissions ) {
		$role = is_string( $slug ) ? get_role( $slug ) : null;
		if ( ! $role ) {
			return new WP_Error( 'kartodesk_unknown_role', __( 'That role does not exist.', 'kartodesk-for-woocommerce' ) );
		}
		if ( $role->has_cap( 'manage_options' ) ) {
			return new WP_Error( 'kartodesk_locked_role', __( 'Roles that can manage the site always have full KartoDesk access.', 'kartodesk-for-woocommerce' ) );
		}
		if ( ! is_array( $permissions ) || count( $permissions ) > count( self::PERMISSIONS ) || count( array_filter( $permissions, 'is_string' ) ) !== count( $permissions ) || array_diff( $permissions, array_keys( self::PERMISSIONS ) ) ) {
			return new WP_Error( 'kartodesk_invalid_permissions', __( 'Unknown permission.', 'kartodesk-for-woocommerce' ) );
		}
		foreach ( self::PERMISSIONS as $permission => $capability ) {
			if ( in_array( $permission, $permissions, true ) ) {
				$role->add_cap( $capability );
			} else {
				$role->remove_cap( $capability );
			}
		}
		return true;
	}
}
