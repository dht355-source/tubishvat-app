<?php
/**
 * "Connect Gmail": each person can let the app send from their own Gmail address.
 * Uses the same Google client as the sign-in, with one extra permission: send only (gmail.send).
 * The app can never read the mailbox. The refresh token is stored encrypted, per WordPress user.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const TBS_GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.send';

function tbs_gmail_crypt( $value, $decrypt = false ) {
	$key = hash( 'sha256', wp_salt( 'auth' ) . 'tbs-gmail', true );
	if ( ! function_exists( 'openssl_encrypt' ) ) {
		return $decrypt ? base64_decode( $value ) : base64_encode( $value ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions
	}
	if ( $decrypt ) {
		$raw = base64_decode( (string) $value, true ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions
		if ( false === $raw || strlen( $raw ) < 17 ) {
			return '';
		}
		$out = openssl_decrypt( substr( $raw, 16 ), 'aes-256-cbc', $key, OPENSSL_RAW_DATA, substr( $raw, 0, 16 ) );
		return false === $out ? '' : $out;
	}
	$iv = random_bytes( 16 );
	return base64_encode( $iv . openssl_encrypt( $value, 'aes-256-cbc', $key, OPENSSL_RAW_DATA, $iv ) ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions
}

/** @return array|null { email, refresh, connected_at } */
function tbs_gmail_get( $user_id ) {
	$m = get_user_meta( (int) $user_id, 'tbs_gmail', true );
	return is_array( $m ) && ! empty( $m['email'] ) && ! empty( $m['refresh'] ) ? $m : null;
}

/** What the app shows about the signed-in person's connection. */
function tbs_gmail_status() {
	$m = is_user_logged_in() ? tbs_gmail_get( get_current_user_id() ) : null;
	return array(
		'available' => tbs_google_configured(),
		'connected' => (bool) $m,
		'email'     => $m ? $m['email'] : '',
		'since'     => $m ? ( $m['connected_at'] ?? '' ) : '',
		'broken'    => (bool) get_user_meta( get_current_user_id(), 'tbs_gmail_broken', true ),
	);
}

function tbs_gmail_back( $code ) {
	wp_safe_redirect( add_query_arg( 'gmail', $code, home_url( '/app/' ) ) );
	exit;
}

/** /app/auth/gmail – ask Google for the send permission. */
function tbs_gmail_start() {
	if ( ! tbs_me() || ! isset( $_GET['_wpnonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_GET['_wpnonce'] ) ), 'tbs_gmail' ) ) {
		wp_safe_redirect( home_url( '/app/' ) );
		exit;
	}
	if ( ! tbs_google_configured() ) {
		tbs_gmail_back( 'setup' );
	}
	$state = wp_generate_password( 32, false );
	set_transient( 'tbs_oauth_' . $state, 'gmail:' . get_current_user_id(), 10 * MINUTE_IN_SECONDS );
	setcookie( 'tbs_oauth_state', $state, array(
		'expires'  => time() + 600,
		'path'     => '/',
		'secure'   => is_ssl(),
		'httponly' => true,
		'samesite' => 'Lax',
	) );
	$url = add_query_arg(
		array(
			'client_id'              => rawurlencode( get_option( 'tbs_google_client_id' ) ),
			'redirect_uri'           => rawurlencode( tbs_google_redirect_uri() ),
			'response_type'          => 'code',
			'scope'                  => rawurlencode( 'openid email ' . TBS_GMAIL_SCOPE ),
			'state'                  => $state,
			'access_type'            => 'offline',
			'prompt'                 => 'consent',
			'include_granted_scopes' => 'false',
		),
		'https://accounts.google.com/o/oauth2/v2/auth'
	);
	wp_redirect( $url ); // phpcs:ignore WordPress.Security.SafeRedirect -- external Google URL.
	exit;
}

/** Called from the shared OAuth callback when the state belongs to a Gmail connection. */
function tbs_gmail_finish( $user_id ) {
	if ( ! is_user_logged_in() || get_current_user_id() !== (int) $user_id || ! tbs_me() ) {
		tbs_gmail_back( 'error' );
	}
	if ( empty( $_GET['code'] ) ) {
		tbs_gmail_back( 'cancelled' );
	}
	$res = wp_remote_post( 'https://oauth2.googleapis.com/token', array(
		'timeout' => 15,
		'body'    => array(
			'code'          => sanitize_text_field( wp_unslash( $_GET['code'] ) ),
			'client_id'     => get_option( 'tbs_google_client_id' ),
			'client_secret' => get_option( 'tbs_google_client_secret' ),
			'redirect_uri'  => tbs_google_redirect_uri(),
			'grant_type'    => 'authorization_code',
		),
	) );
	$token = is_wp_error( $res ) ? array() : json_decode( wp_remote_retrieve_body( $res ), true );
	if ( empty( $token['access_token'] ) ) {
		tbs_gmail_back( 'error' );
	}
	// The person can untick the permission on Google's screen.
	if ( false === strpos( ' ' . ( $token['scope'] ?? '' ) . ' ', ' ' . TBS_GMAIL_SCOPE . ' ' ) ) {
		tbs_gmail_back( 'noscope' );
	}
	if ( empty( $token['refresh_token'] ) ) {
		tbs_gmail_back( 'error' );
	}
	$res  = wp_remote_get( 'https://openidconnect.googleapis.com/v1/userinfo', array(
		'timeout' => 15,
		'headers' => array( 'Authorization' => 'Bearer ' . $token['access_token'] ),
	) );
	$info  = is_wp_error( $res ) ? array() : json_decode( wp_remote_retrieve_body( $res ), true );
	$email = isset( $info['email'] ) ? strtolower( sanitize_email( $info['email'] ) ) : '';
	if ( '' === $email ) {
		tbs_gmail_back( 'error' );
	}
	update_user_meta( $user_id, 'tbs_gmail', array(
		'email'        => $email,
		'refresh'      => tbs_gmail_crypt( $token['refresh_token'] ),
		'connected_at' => current_time( 'mysql' ),
	) );
	delete_user_meta( $user_id, 'tbs_gmail_broken' );
	set_transient( 'tbs_gmail_at_' . $user_id, $token['access_token'], max( 60, (int) ( $token['expires_in'] ?? 3600 ) - 300 ) );
	tbs_gmail_back( 'connected' );
}

function tbs_gmail_disconnect( $user_id ) {
	$m = tbs_gmail_get( $user_id );
	if ( $m ) {
		$refresh = tbs_gmail_crypt( $m['refresh'], true );
		if ( '' !== $refresh ) {
			wp_remote_post( 'https://oauth2.googleapis.com/revoke', array( 'timeout' => 10, 'body' => array( 'token' => $refresh ) ) );
		}
	}
	delete_user_meta( $user_id, 'tbs_gmail' );
	delete_user_meta( $user_id, 'tbs_gmail_broken' );
	delete_transient( 'tbs_gmail_at_' . $user_id );
}

/** @return string|WP_Error Access token. Error code "tbs_gmail_gone" = the person has to connect again. */
function tbs_gmail_token( $user_id ) {
	$cached = get_transient( 'tbs_gmail_at_' . $user_id );
	if ( $cached ) {
		return $cached;
	}
	$m = tbs_gmail_get( $user_id );
	if ( ! $m ) {
		return new WP_Error( 'tbs_gmail_gone', 'Gmail לא מחובר.' );
	}
	$res = wp_remote_post( 'https://oauth2.googleapis.com/token', array(
		'timeout' => 15,
		'body'    => array(
			'client_id'     => get_option( 'tbs_google_client_id' ),
			'client_secret' => get_option( 'tbs_google_client_secret' ),
			'refresh_token' => tbs_gmail_crypt( $m['refresh'], true ),
			'grant_type'    => 'refresh_token',
		),
	) );
	if ( is_wp_error( $res ) ) {
		return new WP_Error( 'tbs_gmail', 'לא הצלחנו להגיע ל-Google: ' . $res->get_error_message() );
	}
	$j = json_decode( wp_remote_retrieve_body( $res ), true );
	if ( empty( $j['access_token'] ) ) {
		if ( in_array( $j['error'] ?? '', array( 'invalid_grant', 'invalid_client', 'unauthorized_client' ), true ) ) {
			update_user_meta( $user_id, 'tbs_gmail_broken', 1 );
			return new WP_Error( 'tbs_gmail_gone', 'החיבור ל-Gmail כבר לא בתוקף. צריך לחבר מחדש.' );
		}
		return new WP_Error( 'tbs_gmail', 'Google לא אישר את השליחה (' . sanitize_text_field( (string) ( $j['error'] ?? wp_remote_retrieve_response_code( $res ) ) ) . ').' );
	}
	set_transient( 'tbs_gmail_at_' . $user_id, $j['access_token'], max( 60, (int) ( $j['expires_in'] ?? 3600 ) - 300 ) );
	return $j['access_token'];
}

function tbs_mime_word( $text ) {
	return preg_match( '/[^\x20-\x7E]/', $text ) ? '=?UTF-8?B?' . base64_encode( $text ) . '?=' : $text; // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions
}

/** The message as Gmail's API wants it: an RFC 822 email, base64url-encoded. */
function tbs_gmail_raw( $from_email, $from_name, $to, $subject, $html ) {
	$clean = function ( $v ) {
		return trim( str_replace( array( "\r", "\n" ), ' ', (string) $v ) );
	};
	$name  = str_replace( array( '"', '<', '>' ), '', $clean( $from_name ) );
	$lines = array(
		'From: ' . ( '' !== $name ? tbs_mime_word( $name ) . ' ' : '' ) . '<' . $clean( $from_email ) . '>',
		'To: <' . $clean( $to ) . '>',
		'Subject: ' . tbs_mime_word( $clean( $subject ) ),
		'MIME-Version: 1.0',
		'Content-Type: text/html; charset=UTF-8',
		'Content-Transfer-Encoding: base64',
		'',
		chunk_split( base64_encode( $html ), 76, "\r\n" ), // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions
	);
	return rtrim( strtr( base64_encode( implode( "\r\n", $lines ) ), '+/', '-_' ), '=' ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions
}

/** @return true|WP_Error */
function tbs_gmail_send( $user_id, $from_name, $to, $subject, $html ) {
	$m = tbs_gmail_get( $user_id );
	if ( ! $m ) {
		return new WP_Error( 'tbs_gmail_gone', 'Gmail לא מחובר.' );
	}
	for ( $try = 0; $try < 2; $try++ ) {
		$token = tbs_gmail_token( $user_id );
		if ( is_wp_error( $token ) ) {
			return $token;
		}
		$res = wp_remote_post( 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send', array(
			'timeout' => 20,
			'headers' => array( 'Authorization' => 'Bearer ' . $token, 'Content-Type' => 'application/json' ),
			'body'    => wp_json_encode( array( 'raw' => tbs_gmail_raw( $m['email'], $from_name, $to, $subject, $html ) ) ),
		) );
		if ( is_wp_error( $res ) ) {
			return new WP_Error( 'tbs_gmail', 'לא הצלחנו להגיע ל-Gmail: ' . $res->get_error_message() );
		}
		$code = (int) wp_remote_retrieve_response_code( $res );
		if ( 200 === $code ) {
			return true;
		}
		if ( 401 === $code && 0 === $try ) {
			delete_transient( 'tbs_gmail_at_' . $user_id ); // stale access token: get a new one and try once more
			continue;
		}
		$j   = json_decode( wp_remote_retrieve_body( $res ), true );
		$msg = sanitize_text_field( (string) ( $j['error']['message'] ?? $code ) );
		if ( 403 === $code && false !== stripos( $msg, 'has not been used' ) ) {
			return new WP_Error( 'tbs_gmail', 'ה-Gmail API לא מופעל בפרויקט ה-Google של האתר. מפעילים אותו ב-Google Cloud ומנסים שוב.' );
		}
		if ( 401 === $code || 403 === $code ) {
			update_user_meta( $user_id, 'tbs_gmail_broken', 1 );
			return new WP_Error( 'tbs_gmail_gone', 'Gmail דחה את השליחה (' . $msg . '). צריך לחבר מחדש.' );
		}
		return new WP_Error( 'tbs_gmail', 'Gmail החזיר שגיאה: ' . $msg );
	}
	return new WP_Error( 'tbs_gmail', 'השליחה דרך Gmail נכשלה.' );
}
