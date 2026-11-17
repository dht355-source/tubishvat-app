<?php
/**
 * Tables and data access.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

function tbs_table( $name ) {
	global $wpdb;
	return $wpdb->prefix . 'tbs_' . $name;
}

function tbs_install_tables() {
	global $wpdb;
	require_once ABSPATH . 'wp-admin/includes/upgrade.php';
	$charset = $wpdb->get_charset_collate();
	$clients = tbs_table( 'clients' );
	$staff   = tbs_table( 'staff' );
	$kv      = tbs_table( 'kv' );

	dbDelta( "CREATE TABLE $clients (
		id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
		no int(11) NOT NULL DEFAULT 0,
		name varchar(190) NOT NULL DEFAULT '',
		contact varchar(190) NOT NULL DEFAULT '',
		contact_email varchar(190) NOT NULL DEFAULT '',
		contact_phone varchar(64) NOT NULL DEFAULT '',
		box varchar(64) NOT NULL DEFAULT '',
		accessories varchar(255) NOT NULL DEFAULT '',
		spots int(11) DEFAULT NULL,
		qty int(11) DEFAULT NULL,
		rep varchar(190) NOT NULL DEFAULT '',
		close_date date DEFAULT NULL,
		status varchar(64) NOT NULL DEFAULT '',
		form_status varchar(20) NOT NULL DEFAULT 'waiting',
		form_received_at datetime DEFAULT NULL,
		steps longtext NULL,
		contents longtext NULL,
		box_lines longtext NULL,
		points longtext NULL,
		form_answers longtext NULL,
		notes text NULL,
		season varchar(32) NOT NULL DEFAULT 'main',
		rev int(11) NOT NULL DEFAULT 0,
		pack_date date DEFAULT NULL,
		delivery_date date DEFAULT NULL,
		packed_at datetime DEFAULT NULL,
		mail longtext NULL,
		created_at datetime NOT NULL,
		updated_at datetime NOT NULL,
		PRIMARY KEY  (id),
		KEY name (name),
		KEY season (season)
	) $charset;" );

	$log = tbs_table( 'log' );
	dbDelta( "CREATE TABLE $log (
		id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
		season varchar(32) NOT NULL DEFAULT 'main',
		at datetime NOT NULL,
		user_name varchar(190) NOT NULL DEFAULT '',
		user_email varchar(190) NOT NULL DEFAULT '',
		entity varchar(20) NOT NULL DEFAULT '',
		entity_id bigint(20) unsigned NOT NULL DEFAULT 0,
		title varchar(190) NOT NULL DEFAULT '',
		field varchar(40) NOT NULL DEFAULT '',
		summary text NULL,
		before_v longtext NULL,
		after_v longtext NULL,
		rev int(11) NOT NULL DEFAULT 0,
		undone tinyint(1) NOT NULL DEFAULT 0,
		PRIMARY KEY  (id),
		KEY entity (season, entity, entity_id),
		KEY at (at)
	) $charset;" );

	dbDelta( "CREATE TABLE $staff (
		id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
		email varchar(190) NOT NULL,
		name varchar(190) NOT NULL DEFAULT '',
		role varchar(20) NOT NULL DEFAULT 'viewer',
		status varchar(20) NOT NULL DEFAULT 'invited',
		wp_user_id bigint(20) unsigned DEFAULT NULL,
		created_at datetime NOT NULL,
		last_login datetime DEFAULT NULL,
		PRIMARY KEY  (id),
		UNIQUE KEY email (email)
	) $charset;" );

	dbDelta( "CREATE TABLE $kv (
		k varchar(64) NOT NULL,
		v longtext NULL,
		updated_at datetime NOT NULL,
		PRIMARY KEY  (k)
	) $charset;" );

	update_option( 'tbs_db_version', TBS_DB_VERSION, false );
}

/* ---------- key/value store (catalog, stock, texts) ---------- */

function tbs_kv_get( $key, $default = null ) {
	global $wpdb;
	$key = tbs_skey( $key );
	$raw = $wpdb->get_var( $wpdb->prepare( 'SELECT v FROM ' . tbs_table( 'kv' ) . ' WHERE k = %s', $key ) );
	if ( null === $raw ) {
		return $default;
	}
	$val = json_decode( $raw, true );
	return null === $val ? $default : $val;
}

function tbs_kv_set( $key, $value ) {
	global $wpdb;
	$key = tbs_skey( $key );
	$wpdb->replace(
		tbs_table( 'kv' ),
		array(
			'k'          => $key,
			'v'          => wp_json_encode( $value, JSON_UNESCAPED_UNICODE ),
			'updated_at' => current_time( 'mysql' ),
		),
		array( '%s', '%s', '%s' )
	);
}

/* ---------- clients ---------- */

function tbs_client_json_fields() {
	return array( 'steps', 'contents', 'box_lines', 'points', 'form_answers', 'mail' );
}

function tbs_client_from_row( $row ) {
	if ( ! $row ) {
		return null;
	}
	$c = (array) $row;
	foreach ( tbs_client_json_fields() as $f ) {
		$c[ $f ] = isset( $c[ $f ] ) && '' !== $c[ $f ] && null !== $c[ $f ] ? json_decode( $c[ $f ], true ) : null;
	}
	foreach ( array( 'id', 'no', 'rev' ) as $f ) {
		$c[ $f ] = (int) ( $c[ $f ] ?? 0 );
	}
	foreach ( array( 'spots', 'qty' ) as $f ) {
		$c[ $f ] = null === $c[ $f ] ? null : (int) $c[ $f ];
	}
	if ( ! is_array( $c['steps'] ) ) {
		$c['steps'] = array();
	}
	if ( ! is_array( $c['points'] ) ) {
		$c['points'] = array();
	}
	if ( ! is_array( $c['box_lines'] ) ) {
		// Clients saved before multi-box orders: one line from the old single box.
		$c['box_lines'] = '' === (string) $c['box'] ? array() : array(
			array( 'id' => 'l1', 'box' => $c['box'], 'qty' => $c['qty'], 'contents' => is_array( $c['contents'] ) ? $c['contents'] : null ),
		);
	}
	return $c;
}

function tbs_clients_all() {
	global $wpdb;
	$rows = $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM ' . tbs_table( 'clients' ) . ' WHERE season = %s ORDER BY no ASC, id ASC', tbs_season() ) );
	return array_map( 'tbs_client_from_row', $rows );
}

function tbs_client_get( $id ) {
	global $wpdb;
	return tbs_client_from_row( $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . tbs_table( 'clients' ) . ' WHERE id = %d', $id ) ) );
}

/** Whitelist + sanitize a client payload. Returns DB-ready array. */
function tbs_client_sanitize( $in ) {
	$out  = array();
	$text = array( 'name', 'contact', 'contact_phone', 'box', 'accessories', 'rep', 'status' );
	foreach ( $text as $f ) {
		if ( array_key_exists( $f, $in ) ) {
			$out[ $f ] = sanitize_text_field( (string) $in[ $f ] );
		}
	}
	if ( array_key_exists( 'contact_email', $in ) ) {
		$out['contact_email'] = sanitize_email( (string) $in['contact_email'] );
	}
	if ( array_key_exists( 'notes', $in ) ) {
		$out['notes'] = sanitize_textarea_field( (string) $in['notes'] );
	}
	foreach ( array( 'no' ) as $f ) {
		if ( array_key_exists( $f, $in ) ) {
			$out[ $f ] = (int) $in[ $f ];
		}
	}
	foreach ( array( 'spots', 'qty' ) as $f ) {
		if ( array_key_exists( $f, $in ) ) {
			$out[ $f ] = ( null === $in[ $f ] || '' === $in[ $f ] ) ? null : max( 0, (int) $in[ $f ] );
		}
	}
	foreach ( array( 'close_date', 'pack_date', 'delivery_date' ) as $f ) {
		if ( array_key_exists( $f, $in ) ) {
			$d         = substr( (string) $in[ $f ], 0, 10 );
			$out[ $f ] = preg_match( '/^\d{4}-\d{2}-\d{2}$/', $d ) ? $d : null;
		}
	}
	if ( array_key_exists( 'packed_at', $in ) ) {
		$d                = (string) $in['packed_at'];
		$out['packed_at'] = preg_match( '/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/', $d ) ? $d : null;
	}
	if ( array_key_exists( 'form_status', $in ) ) {
		$out['form_status'] = 'received' === $in['form_status'] ? 'received' : 'waiting';
	}
	if ( array_key_exists( 'form_received_at', $in ) ) {
		$d                       = (string) $in['form_received_at'];
		$out['form_received_at'] = preg_match( '/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/', $d ) ? $d : null;
	}
	if ( array_key_exists( 'steps', $in ) ) {
		$steps = array();
		foreach ( (array) $in['steps'] as $s ) {
			if ( ! is_array( $s ) || '' === trim( (string) ( $s['label'] ?? '' ) ) ) {
				continue;
			}
			$steps[] = array(
				'id'    => sanitize_key( $s['id'] ?? wp_generate_password( 8, false ) ),
				'key'   => sanitize_key( $s['key'] ?? '' ),
				'label' => sanitize_text_field( $s['label'] ),
				'owner' => 'client' === ( $s['owner'] ?? '' ) ? 'client' : 'us',
				'done'  => ! empty( $s['done'] ),
			);
		}
		$out['steps'] = wp_json_encode( $steps, JSON_UNESCAPED_UNICODE );
	}
	if ( array_key_exists( 'contents', $in ) ) {
		$items           = tbs_clean_contents( $in['contents'] );
		$out['contents'] = null === $items ? null : wp_json_encode( $items );
	}
	if ( array_key_exists( 'box_lines', $in ) ) {
		$lines = array();
		$total = null;
		foreach ( (array) $in['box_lines'] as $l ) {
			if ( ! is_array( $l ) ) {
				continue;
			}
			$qty     = ( isset( $l['qty'] ) && '' !== $l['qty'] && null !== $l['qty'] ) ? max( 0, (int) $l['qty'] ) : null;
			$lines[] = array(
				'id'       => sanitize_key( $l['id'] ?? wp_generate_password( 8, false ) ),
				'box'      => sanitize_key( $l['box'] ?? '' ),
				'qty'      => $qty,
				'contents' => tbs_clean_contents( $l['contents'] ?? null ),
			);
			if ( null !== $qty ) {
				$total = (int) $total + $qty;
			}
		}
		$out['box_lines'] = wp_json_encode( $lines, JSON_UNESCAPED_UNICODE );
		// Keep the legacy single-box columns in step for lists and exports.
		$out['box']      = $lines ? $lines[0]['box'] : '';
		$out['qty']      = $total;
		$out['contents'] = null;
	}
	if ( array_key_exists( 'points', $in ) ) {
		$pts = array();
		foreach ( (array) $in['points'] as $p ) {
			if ( ! is_array( $p ) ) {
				continue;
			}
			$pts[] = array(
				'id'       => sanitize_key( $p['id'] ?? wp_generate_password( 8, false ) ),
				'city'     => sanitize_text_field( $p['city'] ?? '' ),
				'region'   => sanitize_text_field( $p['region'] ?? '' ),
				'address'  => sanitize_text_field( $p['address'] ?? '' ),
				'qty'      => ( isset( $p['qty'] ) && '' !== $p['qty'] && null !== $p['qty'] ) ? max( 0, (int) $p['qty'] ) : null,
				'manual'   => sanitize_text_field( $p['manual'] ?? '' ),
				'forklift' => sanitize_text_field( $p['forklift'] ?? '' ),
				'person'   => sanitize_text_field( $p['person'] ?? '' ),
				'notes'    => sanitize_text_field( $p['notes'] ?? '' ),
				'date'     => preg_match( '/^\d{4}-\d{2}-\d{2}$/', (string) ( $p['date'] ?? '' ) ) ? $p['date'] : '',
				'delivered' => ! empty( $p['delivered'] ),
			);
		}
		$out['points'] = wp_json_encode( $pts, JSON_UNESCAPED_UNICODE );
	}
	if ( array_key_exists( 'mail', $in ) ) {
		// Written by the server when it sends; accepted here only so a backup can be restored.
		$m    = is_array( $in['mail'] ) ? $in['mail'] : array();
		$dt   = function ( $v ) {
			return preg_match( '/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/', (string) $v ) ? (string) $v : '';
		};
		$rems = array();
		foreach ( (array) ( $m['reminders'] ?? array() ) as $r ) {
			if ( is_array( $r ) && '' !== $dt( $r['at'] ?? '' ) ) {
				$rems[] = array( 'at' => $dt( $r['at'] ), 'auto' => ! empty( $r['auto'] ), 'to' => sanitize_email( (string) ( $r['to'] ?? '' ) ), 'via' => 'gmail' === ( $r['via'] ?? '' ) ? 'gmail' : 'site' );
			}
		}
		$out['mail'] = '' === $dt( $m['sent_at'] ?? '' ) && ! $rems ? null : wp_json_encode( array(
			'sent_at'   => $dt( $m['sent_at'] ?? '' ),
			'to'        => sanitize_email( (string) ( $m['to'] ?? '' ) ),
			'by_name'   => sanitize_text_field( (string) ( $m['by_name'] ?? '' ) ),
			'by_email'  => sanitize_email( (string) ( $m['by_email'] ?? '' ) ),
			'by_user'   => (int) ( $m['by_user'] ?? 0 ),
			'via'       => 'gmail' === ( $m['via'] ?? '' ) ? 'gmail' : 'site',
			'from'      => sanitize_email( (string) ( $m['from'] ?? '' ) ),
			'reminders' => $rems,
		), JSON_UNESCAPED_UNICODE );
	}
	if ( array_key_exists( 'form_answers', $in ) ) {
		$out['form_answers'] = null === $in['form_answers'] ? null : wp_json_encode( tbs_clean_answers( $in['form_answers'] ), JSON_UNESCAPED_UNICODE );
	}
	return $out;
}

/** Box contents override: null = the box's standard recipe. */
function tbs_clean_contents( $contents ) {
	if ( null === $contents ) {
		return null;
	}
	$items = array();
	foreach ( (array) $contents as $it ) {
		if ( ! is_array( $it ) || empty( $it['id'] ) ) {
			continue;
		}
		$g       = $it['grams'] ?? null;
		$items[] = array(
			'id'    => sanitize_key( $it['id'] ),
			'grams' => ( null === $g || '' === $g ) ? null : max( 0, (float) $g ),
			'pack'  => empty( $it['pack'] ) ? null : sanitize_key( (string) $it['pack'] ),
		);
	}
	return $items;
}

function tbs_clean_answers( $answers ) {
	$clean = array();
	foreach ( (array) $answers as $a ) {
		if ( ! is_array( $a ) ) {
			continue;
		}
		$clean[] = array(
			'label' => sanitize_text_field( (string) ( $a['label'] ?? '' ) ),
			'value' => sanitize_textarea_field( (string) ( $a['value'] ?? '' ) ),
		);
	}
	return $clean;
}

function tbs_client_insert( $data ) {
	global $wpdb;
	$now               = current_time( 'mysql' );
	$data['created_at'] = $now;
	$data['updated_at'] = $now;
	if ( empty( $data['season'] ) ) {
		$data['season'] = tbs_season();
	}
	if ( empty( $data['no'] ) ) {
		$data['no'] = 1 + (int) $wpdb->get_var( $wpdb->prepare( 'SELECT MAX(no) FROM ' . tbs_table( 'clients' ) . ' WHERE season = %s', $data['season'] ) );
	}
	$wpdb->insert( tbs_table( 'clients' ), $data );
	return (int) $wpdb->insert_id;
}

function tbs_client_update( $id, $data ) {
	global $wpdb;
	if ( empty( $data ) ) {
		return;
	}
	$data['updated_at'] = current_time( 'mysql' );
	$wpdb->update( tbs_table( 'clients' ), $data, array( 'id' => (int) $id ) );
	$wpdb->query( $wpdb->prepare( 'UPDATE ' . tbs_table( 'clients' ) . ' SET rev = rev + 1 WHERE id = %d', $id ) );
	tbs_bump_rev();
}

function tbs_client_delete( $id ) {
	global $wpdb;
	$wpdb->delete( tbs_table( 'clients' ), array( 'id' => (int) $id ), array( '%d' ) );
}

/* ---------- staff ---------- */

function tbs_staff_all() {
	global $wpdb;
	return $wpdb->get_results( 'SELECT * FROM ' . tbs_table( 'staff' ) . ' ORDER BY id ASC', ARRAY_A );
}

function tbs_staff_by_email( $email ) {
	global $wpdb;
	return $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . tbs_table( 'staff' ) . ' WHERE email = %s', strtolower( $email ) ), ARRAY_A );
}

function tbs_staff_get( $id ) {
	global $wpdb;
	return $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . tbs_table( 'staff' ) . ' WHERE id = %d', $id ), ARRAY_A );
}
