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

// Personal panel/widget preferences contain no store data and can be removed on uninstall.
delete_metadata( 'user', 0, 'kartodesk_dashboard_preferences', '', true );

// The review request's timestamp and each user's dismissal contain no store data.
delete_option( 'kartodesk_first_seen' );
delete_metadata( 'user', 0, 'kartodesk_review_dismissed', '', true );
