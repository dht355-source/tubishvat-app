<?php
/**
 * Who may use the app, and what each role may do.
 *
 * WordPress administrators are always managers. Everyone else needs an
 * invitation (a row in the staff table) matching their account email.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

function tbs_roles() {
	return array(
		'admin'  => 'מנהל',
		'sales'  => 'נציג מכירות',
		'ops'    => 'מחסן ואספקה',
		'viewer' => 'צפייה בלבד',
	);
}

/** area => role => none|view|edit */
function tbs_permissions() {
	return array(
		'clients'   => array( 'admin' => 'edit', 'sales' => 'edit', 'ops' => 'view', 'viewer' => 'view' ),
		'inventory' => array( 'admin' => 'edit', 'sales' => 'view', 'ops' => 'edit', 'viewer' => 'view' ),
		'purchase'  => array( 'admin' => 'edit', 'sales' => 'none', 'ops' => 'edit', 'viewer' => 'view' ),
		'settings'  => array( 'admin' => 'edit', 'sales' => 'none', 'ops' => 'none', 'viewer' => 'none' ),
		'users'     => array( 'admin' => 'edit', 'sales' => 'none', 'ops' => 'none', 'viewer' => 'none' ),
	);
}

/**
 * The signed-in person as the app sees them, or null.
 *
 * @return array|null { id, name, email, role, wp_admin }
 */
function tbs_me() {
	static $cache = false;
	if ( false !== $cache ) {
		return $cache;
	}
	$cache = null;
	if ( ! is_user_logged_in() ) {
		return null;
	}
	$u = wp_get_current_user();
	if ( user_can( $u, 'manage_options' ) ) {
		$staff = tbs_staff_by_email( $u->user_email );
		$cache = array(
			'id'       => $staff ? (int) $staff['id'] : 0,
			'name'     => $staff && $staff['name'] ? $staff['name'] : ( $u->display_name ? $u->display_name : $u->user_login ),
			'email'    => $u->user_email,
			'role'     => 'admin',
			'wp_admin' => true,
		);
		return $cache;
	}
	$staff = tbs_staff_by_email( $u->user_email );
	if ( ! $staff || ! isset( tbs_roles()[ $staff['role'] ] ) ) {
		return null;
	}
	$cache = array(
		'id'       => (int) $staff['id'],
		'name'     => $staff['name'] ? $staff['name'] : $u->display_name,
		'email'    => $u->user_email,
		'role'     => $staff['role'],
		'wp_admin' => false,
	);
	return $cache;
}

function tbs_level( $area ) {
	$me = tbs_me();
	if ( ! $me ) {
		return 'none';
	}
	$p = tbs_permissions();
	return $p[ $area ][ $me['role'] ] ?? 'none';
}

function tbs_can_view( $area ) {
	return in_array( tbs_level( $area ), array( 'view', 'edit' ), true );
}

function tbs_can_edit( $area ) {
	return 'edit' === tbs_level( $area );
}

/** Sales reps only see and edit clients where they are the rep. */
function tbs_client_visible( $client ) {
	$me = tbs_me();
	if ( ! $me || ! tbs_can_view( 'clients' ) ) {
		return false;
	}
	if ( 'sales' !== $me['role'] ) {
		return true;
	}
	return '' !== trim( (string) $client['rep'] ) && trim( (string) $client['rep'] ) === trim( $me['name'] );
}

/** Mark an invited staff member active on first sign-in. */
function tbs_touch_login( $email, $wp_user_id ) {
	global $wpdb;
	$staff = tbs_staff_by_email( $email );
	if ( ! $staff ) {
		return;
	}
	$wpdb->update(
		tbs_table( 'staff' ),
		array(
			'status'     => 'active',
			'wp_user_id' => (int) $wp_user_id,
			'last_login' => current_time( 'mysql' ),
		),
		array( 'id' => (int) $staff['id'] )
	);
}

add_action( 'wp_login', function ( $login, $user ) {
	tbs_touch_login( $user->user_email, $user->ID );
}, 10, 2 );
