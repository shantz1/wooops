<?php
/**
 * Runs when KartoDesk is deleted from the Plugins screen: removes its permissions from every role.
 * Store data (orders, notes and shipment tracking on orders) is left untouched.
 *
 * @package KartoDesk
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

require_once __DIR__ . '/includes/class-kartodesk-access.php';

KartoDesk_Access::remove_all();
