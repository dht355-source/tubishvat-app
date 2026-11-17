<?php
/**
 * Seasons. Each season is its own year: its own clients, catalog, stock, texts and purchase orders.
 * Staff, sign-in and app settings are shared.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** Keys of the key/value store that belong to a season. */
function tbs_season_keys() {
	return array( 'catalog', 'stock', 'texts', 'orders', 'tally_unmatched' );
}

/** The first season keeps the original, un-suffixed keys, so existing data needs no migration. */
function tbs_skey( $key, $season = null ) {
	if ( ! in_array( $key, tbs_season_keys(), true ) ) {
		return $key;
	}
	$season = null === $season ? tbs_season() : $season;
	return 'main' === $season ? $key : $key . '@' . $season;
}

function tbs_seasons() {
	$list = get_option( 'tbs_seasons' );
	if ( ! is_array( $list ) || ! $list ) {
		global $wpdb;
		$raw   = $wpdb->get_var( $wpdb->prepare( 'SELECT v FROM ' . tbs_table( 'kv' ) . ' WHERE k = %s', 'texts' ) );
		$texts = $raw ? json_decode( $raw, true ) : null;
		$list  = array(
			array(
				'id'         => 'main',
				'name'       => is_array( $texts ) && ! empty( $texts['season'] ) ? $texts['season'] : tbs_default_texts()['season'],
				'created_at' => current_time( 'mysql' ),
				'archived'   => false,
			),
		);
		update_option( 'tbs_seasons', $list, false );
	}
	return $list;
}

function tbs_season_find( $id ) {
	foreach ( tbs_seasons() as $s ) {
		if ( $s['id'] === $id ) {
			return $s;
		}
	}
	return null;
}

function tbs_active_season() {
	$id = (string) get_option( 'tbs_active_season', 'main' );
	return tbs_season_find( $id ) ? $id : tbs_seasons()[0]['id'];
}

/**
 * The season this request works in: the one the person picked in the app (X-TBS-Season header),
 * otherwise the active one. Webhooks and the nightly backup always use the active season.
 */
function tbs_season( $set = null ) {
	static $current = null;
	if ( null !== $set ) {
		$current = $set;
		return $current;
	}
	if ( null !== $current ) {
		return $current;
	}
	$picked = isset( $_SERVER['HTTP_X_TBS_SEASON'] ) ? sanitize_key( wp_unslash( $_SERVER['HTTP_X_TBS_SEASON'] ) ) : '';
	if ( '' !== $picked && is_user_logged_in() && tbs_season_find( $picked ) ) {
		$current = $picked;
	} else {
		$current = tbs_active_season();
	}
	return $current;
}

function tbs_season_locked() {
	$s = tbs_season_find( tbs_season() );
	return $s && ! empty( $s['archived'] );
}

/** Global change counter: open tabs poll it to pick up what teammates changed. */
function tbs_bump_rev() {
	$rev = (int) get_option( 'tbs_rev', 0 ) + 1;
	update_option( 'tbs_rev', $rev, false );
	return $rev;
}

/** Per-blob revision (catalog, stock, orders) so two people don't silently overwrite each other. */
function tbs_blob_rev( $key ) {
	$revs = (array) get_option( 'tbs_blob_revs', array() );
	return $revs[ tbs_skey( $key ) ] ?? array( 'rev' => 0, 'by' => '' );
}

function tbs_blob_touch( $key ) {
	$revs = (array) get_option( 'tbs_blob_revs', array() );
	$k    = tbs_skey( $key );
	$me   = tbs_me();
	$revs[ $k ] = array( 'rev' => (int) ( $revs[ $k ]['rev'] ?? 0 ) + 1, 'by' => $me ? strtolower( $me['email'] ) : '' );
	update_option( 'tbs_blob_revs', $revs, false );
	tbs_bump_rev();
	return $revs[ $k ]['rev'];
}

/** @return WP_Error|null Conflict when someone else saved this blob after the caller loaded it. */
function tbs_blob_conflict( $key, $base, $label ) {
	if ( null === $base ) {
		return null;
	}
	$cur = tbs_blob_rev( $key );
	$me  = tbs_me();
	if ( (int) $cur['rev'] !== (int) $base && $cur['by'] !== strtolower( (string) $me['email'] ) ) {
		return new WP_Error( 'tbs_conflict', 'מישהו אחר עדכן את ' . $label . ' בינתיים. הגרסה העדכנית נטענה, אפשר לנסות שוב.', array( 'status' => 409 ) );
	}
	return null;
}

/**
 * Open a new season: a fresh year with no clients, no stock and no orders.
 * Texts carry over (with the new name); the catalog carries over only when asked.
 */
function tbs_season_create( $name, $copy_catalog ) {
	$list = tbs_seasons();
	$from = tbs_season();
	$id   = 's' . gmdate( 'ymd' ) . strtolower( wp_generate_password( 4, false ) );

	$texts   = wp_parse_args( (array) tbs_kv_get( 'texts', array() ), tbs_default_texts() );
	$catalog = (array) tbs_kv_get( 'catalog', array() );

	$list[] = array( 'id' => $id, 'name' => $name, 'created_at' => current_time( 'mysql' ), 'archived' => false, 'from' => $from );
	update_option( 'tbs_seasons', $list, false );

	tbs_season( $id );
	$texts['season'] = $name;
	tbs_kv_set( 'texts', $texts );
	tbs_kv_set( 'catalog', $copy_catalog ? $catalog : array( 'boxes' => array(), 'ingredients' => array(), 'accessories' => array(), 'suppliers' => array() ) );
	tbs_kv_set( 'stock', array( 'boxes' => (object) array(), 'accessories' => (object) array(), 'ingredients' => (object) array() ) );
	tbs_kv_set( 'orders', array() );
	update_option( 'tbs_active_season', $id, false );
	tbs_bump_rev();
	return $id;
}
