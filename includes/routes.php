<?php
/**
 * The /app page (full screen, no theme) and its sign-in routes.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

function tbs_register_rewrites() {
	add_rewrite_rule( '^app/?$', 'index.php?tbs_app=home', 'top' );
	add_rewrite_rule( '^app/auth/(google|gmail|callback|logout)/?$', 'index.php?tbs_app=$matches[1]', 'top' );
}
add_action( 'init', 'tbs_register_rewrites' );

add_action( 'init', function () {
	if ( get_option( 'tbs_rewrite_version' ) !== TBS_VERSION ) {
		flush_rewrite_rules( false );
		update_option( 'tbs_rewrite_version', TBS_VERSION, false );
	}
}, 20 );

add_filter( 'query_vars', function ( $vars ) {
	$vars[] = 'tbs_app';
	return $vars;
} );

add_action( 'template_redirect', function () {
	$route = get_query_var( 'tbs_app' );
	if ( ! $route ) {
		return;
	}
	if ( ! defined( 'DONOTCACHEPAGE' ) ) {
		define( 'DONOTCACHEPAGE', true );
	}
	nocache_headers();
	header( 'X-Robots-Tag: noindex, nofollow', true );
	header( 'Referrer-Policy: same-origin', true );

	switch ( $route ) {
		case 'google':
			tbs_google_start();
			break;
		case 'gmail':
			tbs_gmail_start();
			break;
		case 'callback':
			tbs_google_callback();
			break;
		case 'logout':
			if ( isset( $_GET['_wpnonce'] ) && wp_verify_nonce( sanitize_text_field( wp_unslash( $_GET['_wpnonce'] ) ), 'tbs_logout' ) ) {
				wp_logout();
			}
			wp_safe_redirect( home_url( '/app/' ) );
			exit;
		default:
			status_header( 200 );
			if ( tbs_me() ) {
				include TBS_DIR . 'templates/app.php';
			} else {
				include TBS_DIR . 'templates/signin.php';
			}
			exit;
	}
} );

/** Keep /app out of sitemaps and search engines. */
add_filter( 'wp_robots', function ( $robots ) {
	if ( get_query_var( 'tbs_app' ) ) {
		$robots['noindex']  = true;
		$robots['nofollow'] = true;
	}
	return $robots;
} );

/**
 * M3 Expressive shape as inline SVG (same polar-modulation math as app.js).
 */
function tbs_shape_svg( $kind, $class = '' ) {
	$shapes = array(
		'cookie9' => array( 9, 0.075 ),
		'flower'  => array( 8, 0.13 ),
		'gem'     => array( 5, 0.07 ),
	);
	list( $n, $a ) = isset( $shapes[ $kind ] ) ? $shapes[ $kind ] : $shapes['cookie9'];
	$pts  = array();
	$max  = 1 + $a;
	$steps = 240;
	for ( $i = 0; $i < $steps; $i++ ) {
		$th    = ( $i / $steps ) * M_PI * 2;
		$r     = ( 1 + $a * cos( $n * $th ) ) / $max;
		$pts[] = sprintf( '%.2f %.2f', 50 + 50 * $r * cos( $th - M_PI / 2 ), 50 + 50 * $r * sin( $th - M_PI / 2 ) );
	}
	return '<svg class="shape ' . esc_attr( $class ) . '" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><path d="M' . implode( 'L', $pts ) . 'Z"/></svg>';
}

