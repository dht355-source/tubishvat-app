<?php
/**
 * Updates through the normal WordPress "Update" button, instead of uploading a zip.
 *
 * The source is set in the app's settings and is one of:
 *  - a public GitHub repository, "owner/repo": the latest release is used. Attach tubishvat-app.zip
 *    to the release (otherwise GitHub's source zip is used).
 *  - an https URL of a JSON file: { "version": "2.1.0", "download_url": "https://…/tubishvat-app.zip", "changelog": "…" }
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

function tbs_update_basename() {
	return plugin_basename( TBS_FILE );
}

/** @return array|WP_Error { version, download_url, changelog, url } */
function tbs_update_fetch() {
	$src = trim( (string) get_option( 'tbs_update_source', '' ) );
	if ( '' === $src ) {
		return new WP_Error( 'tbs_update', 'לא הוגדר מקור עדכונים.' );
	}
	$args = array( 'timeout' => 12, 'headers' => array( 'Accept' => 'application/json', 'User-Agent' => 'wordpress-plugin-updater' ) );
	if ( preg_match( '#^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$#', $src ) ) {
		$res = wp_safe_remote_get( 'https://api.github.com/repos/' . $src . '/releases/latest', $args );
		if ( is_wp_error( $res ) ) {
			return new WP_Error( 'tbs_update', 'לא הצלחנו להגיע ל-GitHub: ' . $res->get_error_message() );
		}
		if ( 404 === (int) wp_remote_retrieve_response_code( $res ) ) {
			return new WP_Error( 'tbs_update', 'לא נמצאה גרסה (release) במאגר ' . $src . '. המאגר צריך להיות ציבורי ועם release אחד לפחות.' );
		}
		$j = json_decode( wp_remote_retrieve_body( $res ), true );
		if ( 200 !== (int) wp_remote_retrieve_response_code( $res ) || empty( $j['tag_name'] ) ) {
			return new WP_Error( 'tbs_update', 'GitHub החזיר תשובה לא צפויה (' . (int) wp_remote_retrieve_response_code( $res ) . ').' );
		}
		$zip = (string) ( $j['zipball_url'] ?? '' );
		foreach ( (array) ( $j['assets'] ?? array() ) as $a ) {
			if ( preg_match( '/\.zip$/i', (string) ( $a['name'] ?? '' ) ) && ! empty( $a['browser_download_url'] ) ) {
				$zip = $a['browser_download_url'];
				break;
			}
		}
		$info = array(
			'version'      => ltrim( (string) $j['tag_name'], 'vV' ),
			'download_url' => $zip,
			'changelog'    => (string) ( $j['body'] ?? '' ),
			'url'          => (string) ( $j['html_url'] ?? '' ),
		);
	} else {
		$res = wp_safe_remote_get( $src, $args );
		if ( is_wp_error( $res ) ) {
			return new WP_Error( 'tbs_update', 'לא הצלחנו להגיע לכתובת העדכונים: ' . $res->get_error_message() );
		}
		$j = json_decode( wp_remote_retrieve_body( $res ), true );
		if ( 200 !== (int) wp_remote_retrieve_response_code( $res ) || empty( $j['version'] ) || empty( $j['download_url'] ) ) {
			return new WP_Error( 'tbs_update', 'קובץ העדכון לא תקין: צריך version ו-download_url.' );
		}
		$info = array(
			'version'      => ltrim( (string) $j['version'], 'vV' ),
			'download_url' => (string) $j['download_url'],
			'changelog'    => (string) ( $j['changelog'] ?? '' ),
			'url'          => (string) ( $j['url'] ?? '' ),
		);
	}
	if ( ! preg_match( '/^\d+(\.\d+){1,3}$/', $info['version'] ) || 0 !== stripos( $info['download_url'], 'https://' ) ) {
		return new WP_Error( 'tbs_update', 'פרטי הגרסה לא תקינים (מספר גרסה או כתובת הורדה).' );
	}
	$info['download_url'] = esc_url_raw( $info['download_url'] );
	$info['changelog']    = sanitize_textarea_field( mb_substr( $info['changelog'], 0, 3000 ) );
	$info['url']          = esc_url_raw( $info['url'] );
	return $info;
}

/** Cached for six hours; $force re-checks now. */
function tbs_update_info( $force = false ) {
	if ( '' === trim( (string) get_option( 'tbs_update_source', '' ) ) ) {
		return null;
	}
	$cached = get_site_transient( 'tbs_update_info' );
	if ( ! $force && is_array( $cached ) ) {
		return $cached;
	}
	$info = tbs_update_fetch();
	if ( is_wp_error( $info ) ) {
		$info = array( 'error' => $info->get_error_message() );
		set_site_transient( 'tbs_update_info', $info, 30 * MINUTE_IN_SECONDS );
	} else {
		set_site_transient( 'tbs_update_info', $info, 6 * HOUR_IN_SECONDS );
	}
	$info['checked'] = current_time( 'mysql' );
	return $info;
}

/** What the settings screen shows. */
function tbs_update_status( $force ) {
	$info = $force ? tbs_update_info( true ) : get_site_transient( 'tbs_update_info' );
	$out  = array( 'current' => TBS_VERSION, 'latest' => null, 'available' => false, 'error' => null, 'changelog' => '', 'url' => '', 'checked' => null );
	if ( ! is_array( $info ) ) {
		return $out;
	}
	if ( ! empty( $info['error'] ) ) {
		$out['error'] = $info['error'];
		return $out;
	}
	$out['latest']    = $info['version'];
	$out['available'] = version_compare( $info['version'], TBS_VERSION, '>' );
	$out['changelog'] = $info['changelog'];
	$out['url']       = $info['url'];
	$out['checked']   = $info['checked'] ?? null;
	if ( $force ) {
		delete_site_transient( 'update_plugins' ); // let WordPress pick it up right away
	}
	return $out;
}

/** Tell WordPress about a newer version, so it shows in Plugins and Dashboard → Updates (and auto-updates, if enabled). */
add_filter( 'pre_set_site_transient_update_plugins', function ( $transient ) {
	if ( ! is_object( $transient ) ) {
		return $transient;
	}
	$info = tbs_update_info();
	if ( ! is_array( $info ) || ! empty( $info['error'] ) ) {
		return $transient;
	}
	$item = (object) array(
		'id'          => 'tubishvat-app',
		'slug'        => 'tubishvat-app',
		'plugin'      => tbs_update_basename(),
		'new_version' => $info['version'],
		'url'         => $info['url'],
		'package'     => $info['download_url'],
		'icons'       => array( 'default' => TBS_URL . 'assets/logo.webp' ),
	);
	if ( version_compare( $info['version'], TBS_VERSION, '>' ) ) {
		$transient->response[ tbs_update_basename() ] = $item;
	} else {
		$transient->no_update[ tbs_update_basename() ] = $item;
	}
	return $transient;
} );

/** "View details" popup in the Plugins screen. */
add_filter( 'plugins_api', function ( $result, $action, $args ) {
	if ( 'plugin_information' !== $action || empty( $args->slug ) || 'tubishvat-app' !== $args->slug ) {
		return $result;
	}
	$info = tbs_update_info();
	if ( ! is_array( $info ) || ! empty( $info['error'] ) ) {
		return $result;
	}
	return (object) array(
		'name'          => 'טו בשבט – אפליקציית ניהול',
		'slug'          => 'tubishvat-app',
		'version'       => $info['version'],
		'author'        => 'מור ולבונה',
		'homepage'      => $info['url'],
		'download_link' => $info['download_url'],
		'sections'      => array( 'changelog' => nl2br( esc_html( $info['changelog'] ? $info['changelog'] : 'אין פירוט.' ) ) ),
	);
}, 10, 3 );

/** GitHub's zips unpack to "repo-tag/…": put the plugin back in its own folder so it replaces the old one. */
add_filter( 'upgrader_source_selection', function ( $source, $remote_source, $upgrader, $extra = array() ) {
	global $wp_filesystem;
	if ( empty( $extra['plugin'] ) || tbs_update_basename() !== $extra['plugin'] || ! $wp_filesystem ) {
		return $source;
	}
	$want = trailingslashit( $remote_source ) . dirname( tbs_update_basename() ) . '/';
	if ( trailingslashit( $source ) === $want ) {
		return $source;
	}
	// The zip may also wrap the plugin folder one level down.
	$inner = trailingslashit( $source ) . dirname( tbs_update_basename() ) . '/';
	if ( $wp_filesystem->exists( $inner . basename( TBS_FILE ) ) ) {
		$source = $inner;
	}
	if ( ! $wp_filesystem->exists( trailingslashit( $source ) . basename( TBS_FILE ) ) ) {
		return new WP_Error( 'tbs_update', 'קובץ העדכון לא מכיל את התוסף.' );
	}
	if ( trailingslashit( $source ) !== $want && $wp_filesystem->move( untrailingslashit( $source ), untrailingslashit( $want ), true ) ) {
		return $want;
	}
	return $source;
}, 10, 4 );

/** One-click install from inside the app (site administrators only). A backup is taken first. */
function tbs_update_install() {
	$info = tbs_update_info( true );
	if ( ! is_array( $info ) || ! empty( $info['error'] ) ) {
		return new WP_Error( 'tbs_update', is_array( $info ) ? $info['error'] : 'לא הוגדר מקור עדכונים.' );
	}
	if ( ! version_compare( $info['version'], TBS_VERSION, '>' ) ) {
		return new WP_Error( 'tbs_update', 'כבר מותקנת הגרסה העדכנית.' );
	}
	tbs_backup_create( 'before-update' );
	require_once ABSPATH . 'wp-admin/includes/file.php';
	require_once ABSPATH . 'wp-admin/includes/plugin.php';
	require_once ABSPATH . 'wp-admin/includes/misc.php';
	require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';
	delete_site_transient( 'update_plugins' );
	wp_update_plugins();
	$upgrader = new Plugin_Upgrader( new Automatic_Upgrader_Skin() );
	$ok       = $upgrader->upgrade( tbs_update_basename() );
	if ( is_wp_error( $ok ) ) {
		return $ok;
	}
	if ( ! $ok ) {
		$errs = $upgrader->skin->get_errors();
		return new WP_Error( 'tbs_update', is_wp_error( $errs ) && $errs->has_errors() ? $errs->get_error_message() : 'ההתקנה נכשלה. אפשר לנסות דרך מסך התוספים של וורדפרס.' );
	}
	delete_site_transient( 'tbs_update_info' );
	return $info['version'];
}
