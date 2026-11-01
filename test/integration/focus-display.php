<?php
// Isolated checks for the scope of the optional admin display.
define( 'ABSPATH', __DIR__ );
$test_screen = (object) array( 'id' => 'toplevel_page_kartodesk' );
$test_roles = array( 'shop_manager' );
$test_admin = false;
$test_super = false;
$test_option = '1';
function get_current_screen() { global $test_screen; return $test_screen; }
function wp_get_current_user() { global $test_roles; return (object) array( 'roles' => $test_roles ); }
function current_user_can( $capability ) { global $test_admin; return $test_admin; }
function is_super_admin() { global $test_super; return $test_super; }
function get_option( $name, $default = false ) { global $test_option; return $name === 'kartodesk_focus_roles' ? ( $test_option === '1' ? array( 'shop_manager' ) : array() ) : $default; }
require __DIR__ . '/../../wordpress/kartodesk-for-woocommerce/includes/class-kartodesk-admin.php';
$hook = new ReflectionProperty( 'KartoDesk_Admin', 'hook' );
$hook->setAccessible( true );
$hook->setValue( null, 'toplevel_page_kartodesk' );
function focus_output() { ob_start(); KartoDesk_Admin::focus_styles(); return ob_get_clean(); }
if ( ! str_contains( focus_output(), '#adminmenumain' ) ) { throw new Exception( 'Shop manager focus styles missing' ); }
$test_admin = true;
if ( focus_output() !== '' ) { throw new Exception( 'Administrator was affected' ); }
$test_admin = false;
$test_super = true;
if ( focus_output() !== '' ) { throw new Exception( 'Super administrator was affected' ); }
$test_super = false;
$test_roles = array( 'editor' );
if ( focus_output() !== '' ) { throw new Exception( 'Other role was affected' ); }
$test_roles = array( 'shop_manager' );
$test_screen->id = 'dashboard';
if ( focus_output() !== '' ) { throw new Exception( 'Other screen was affected' ); }
$test_screen->id = 'toplevel_page_kartodesk';
$test_option = '0';
if ( focus_output() !== '' ) { throw new Exception( 'Disabled option was applied' ); }
echo "Focus display scope checks passed.\n";
