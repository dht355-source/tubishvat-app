<?php
/**
 * Plugin Name: טו בשבט – אפליקציית ניהול
 * Description: מערכת פנימית לניהול לקוחות, מלאי והגדרות מארזים לטו בשבט. נפתחת בכתובת /app.
 * Version: 2.4.0
 * Requires at least: 6.4
 * Requires PHP: 8.0
 * Author: מור ולבונה
 * Text Domain: tubishvat-app
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'TBS_VERSION', '2.4.0' );
define( 'TBS_DB_VERSION', '4' );
define( 'TBS_FILE', __FILE__ );
define( 'TBS_DIR', plugin_dir_path( __FILE__ ) );
define( 'TBS_URL', plugin_dir_url( __FILE__ ) );

require_once TBS_DIR . 'includes/db.php';
require_once TBS_DIR . 'includes/seasons.php';
require_once TBS_DIR . 'includes/log.php';
require_once TBS_DIR . 'includes/updater.php';
require_once TBS_DIR . 'includes/mail.php';
require_once TBS_DIR . 'includes/seed.php';
require_once TBS_DIR . 'includes/access.php';
require_once TBS_DIR . 'includes/google.php';
require_once TBS_DIR . 'includes/gmail.php';
require_once TBS_DIR . 'includes/routes.php';
require_once TBS_DIR . 'includes/xlsx.php';
require_once TBS_DIR . 'includes/backup.php';
require_once TBS_DIR . 'includes/rest.php';

register_activation_hook( __FILE__, 'tbs_activate' );
register_deactivation_hook( __FILE__, 'tbs_deactivate' );

function tbs_activate() {
	tbs_install_tables();
	tbs_seed_if_empty();
	tbs_ensure_secrets();
	tbs_register_rewrites();
	flush_rewrite_rules();
	tbs_schedule_backup();
}

function tbs_deactivate() {
	wp_clear_scheduled_hook( 'tbs_daily_backup' );
	wp_clear_scheduled_hook( 'tbs_daily_reminders' );
	flush_rewrite_rules();
}

add_action( 'plugins_loaded', function () {
	if ( get_option( 'tbs_db_version' ) !== TBS_DB_VERSION ) {
		tbs_install_tables();
		tbs_seed_if_empty();
		tbs_ensure_secrets();
		tbs_upgrade_data();
	}
} );

/** Settings link on the Plugins screen. */
add_filter( 'plugin_action_links_' . plugin_basename( __FILE__ ), function ( $links ) {
	array_unshift( $links, '<a href="' . esc_url( home_url( '/app/' ) ) . '">פתיחת האפליקציה</a>' );
	return $links;
} );
