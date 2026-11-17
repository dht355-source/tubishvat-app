<?php
/**
 * "Sign in with Google" (OAuth 2.0 authorization code flow), restricted to invited emails.
 * Turns on once a Client ID and secret are saved on the app's Settings screen.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

function tbs_google_redirect_uri() {
	return home_url( '/app/auth/callback' );
}

function tbs_google_configured() {
	return '' !== (string) get_option( 'tbs_google_client_id' ) && '' !== (string) get_option( 'tbs_google_client_secret' );
}

function tbs_google_start() {
	if ( ! tbs_google_configured() ) {
		wp_safe_redirect( home_url( '/app/' ) );
		exit;
	}
	$state = wp_generate_password( 32, false );
	set_transient( 'tbs_oauth_' . $state, 1, 10 * MINUTE_IN_SECONDS );
	setcookie( 'tbs_oauth_state', $state, array(
		'expires'  => time() + 600,
		'path'     => '/',
		'secure'   => is_ssl(),
		'httponly' => true,
		'samesite' => 'Lax',
	) );
	$url = add_query_arg(
		array(
			'client_id'     => rawurlencode( get_option( 'tbs_google_client_id' ) ),
			'redirect_uri'  => rawurlencode( tbs_google_redirect_uri() ),
			'response_type' => 'code',
			'scope'         => rawurlencode( 'openid email profile' ),
			'state'         => $state,
			'prompt'        => 'select_account',
		),
		'https://accounts.google.com/o/oauth2/v2/auth'
	);
	wp_redirect( $url ); // phpcs:ignore WordPress.Security.SafeRedirect -- external Google URL.
	exit;
}

function tbs_google_fail( $code ) {
	wp_safe_redirect( add_query_arg( 'signin', $code, home_url( '/app/' ) ) );
	exit;
}

function tbs_google_callback() {
	$state  = isset( $_GET['state'] ) ? sanitize_text_field( wp_unslash( $_GET['state'] ) ) : '';
	$cookie = isset( $_COOKIE['tbs_oauth_state'] ) ? sanitize_text_field( wp_unslash( $_COOKIE['tbs_oauth_state'] ) ) : '';
	$kind   = '' === $state ? false : get_transient( 'tbs_oauth_' . $state );
	if ( '' === $state || ! hash_equals( $cookie, $state ) || ! $kind ) {
		tbs_google_fail( 'expired' );
	}
	delete_transient( 'tbs_oauth_' . $state );
	setcookie( 'tbs_oauth_state', '', array( 'expires' => time() - 3600, 'path' => '/' ) );

	// The same callback address serves "Connect Gmail" (see gmail.php).
	if ( is_string( $kind ) && 0 === strpos( $kind, 'gmail:' ) ) {
		tbs_gmail_finish( (int) substr( $kind, 6 ) );
	}

	if ( empty( $_GET['code'] ) ) {
		tbs_google_fail( 'cancelled' );
	}
	$code = sanitize_text_field( wp_unslash( $_GET['code'] ) );

	$res = wp_remote_post( 'https://oauth2.googleapis.com/token', array(
		'timeout' => 15,
		'body'    => array(
			'code'          => $code,
			'client_id'     => get_option( 'tbs_google_client_id' ),
			'client_secret' => get_option( 'tbs_google_client_secret' ),
			'redirect_uri'  => tbs_google_redirect_uri(),
			'grant_type'    => 'authorization_code',
		),
	) );
	if ( is_wp_error( $res ) ) {
		tbs_google_fail( 'google' );
	}
	$token = json_decode( wp_remote_retrieve_body( $res ), true );
	if ( empty( $token['access_token'] ) ) {
		tbs_google_fail( 'google' );
	}

	$res = wp_remote_get( 'https://openidconnect.googleapis.com/v1/userinfo', array(
		'timeout' => 15,
		'headers' => array( 'Authorization' => 'Bearer ' . $token['access_token'] ),
	) );
	if ( is_wp_error( $res ) ) {
		tbs_google_fail( 'google' );
	}
	$info  = json_decode( wp_remote_retrieve_body( $res ), true );
	$email = isset( $info['email'] ) ? strtolower( sanitize_email( $info['email'] ) ) : '';
	if ( '' === $email || empty( $info['email_verified'] ) ) {
		tbs_google_fail( 'google' );
	}

	$staff = tbs_staff_by_email( $email );
	$user  = get_user_by( 'email', $email );
	$is_wp_admin = $user && user_can( $user, 'manage_options' );
	if ( ! $staff && ! $is_wp_admin ) {
		tbs_google_fail( 'denied' );
	}

	if ( ! $user ) {
		$base  = sanitize_user( strstr( $email, '@', true ), true );
		$base  = $base ? $base : 'staff';
		$login = $base;
		$n     = 1;
		while ( username_exists( $login ) ) {
			$login = $base . ( ++$n );
		}
		$name    = $staff && $staff['name'] ? $staff['name'] : ( $info['name'] ?? $login );
		$user_id = wp_insert_user( array(
			'user_login'   => $login,
			'user_email'   => $email,
			'user_pass'    => wp_generate_password( 32, true, true ),
			'display_name' => $name,
			'first_name'   => $info['given_name'] ?? '',
			'last_name'    => $info['family_name'] ?? '',
			'role'         => 'subscriber',
		) );
		if ( is_wp_error( $user_id ) ) {
			tbs_google_fail( 'google' );
		}
		$user = get_user_by( 'id', $user_id );
	}

	wp_set_current_user( $user->ID );
	wp_set_auth_cookie( $user->ID, true, is_ssl() );
	do_action( 'wp_login', $user->user_login, $user );
	wp_safe_redirect( home_url( '/app/' ) );
	exit;
}

/* Staff who are not WordPress editors never see wp-admin or the admin bar. */
function tbs_is_plain_staff() {
	if ( ! is_user_logged_in() || current_user_can( 'edit_posts' ) ) {
		return false;
	}
	return (bool) tbs_staff_by_email( wp_get_current_user()->user_email );
}

add_filter( 'show_admin_bar', function ( $show ) {
	return tbs_is_plain_staff() ? false : $show;
} );

add_action( 'admin_init', function () {
	if ( wp_doing_ajax() || ! tbs_is_plain_staff() ) {
		return;
	}
	wp_safe_redirect( home_url( '/app/' ) );
	exit;
} );
