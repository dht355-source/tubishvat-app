<?php
/**
 * Daily Excel backups: created at 02:00 site time, last 30 kept, downloadable by managers.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'TBS_BACKUP_KEEP', 30 );

function tbs_backup_dir() {
	$suffix = get_option( 'tbs_backup_suffix' );
	if ( ! $suffix ) {
		$suffix = strtolower( wp_generate_password( 16, false ) );
		update_option( 'tbs_backup_suffix', $suffix, false );
	}
	$up  = wp_upload_dir( null, false );
	$dir = trailingslashit( $up['basedir'] ) . 'tbs-backups-' . $suffix;
	if ( ! is_dir( $dir ) ) {
		wp_mkdir_p( $dir );
	}
	if ( ! file_exists( $dir . '/.htaccess' ) ) {
		file_put_contents( $dir . '/.htaccess', "Require all denied\nDeny from all\n" );
	}
	if ( ! file_exists( $dir . '/index.php' ) ) {
		file_put_contents( $dir . '/index.php', "<?php // Silence.\n" );
	}
	return $dir;
}

function tbs_client_columns() {
	return array(
		'id'               => 'מזהה',
		'no'               => "מס'",
		'name'             => 'לקוח',
		'contact'          => 'איש קשר',
		'contact_email'    => 'מייל איש קשר',
		'contact_phone'    => 'טלפון איש קשר',
		'box_name'         => 'מארזים',
		'box'              => 'קוד מארז',
		'accessories'      => 'מוצרים נלווים',
		'spots'            => 'מספר נקודות אספקה',
		'qty'              => 'כמות מארזים',
		'rep'              => 'נציג מכירות',
		'close_date'       => 'תאריך סגירה',
		'status'           => 'סטטוס',
		'form_status'      => 'טופס אספקה',
		'form_received_at' => 'טופס התקבל ב',
		'notes'            => 'הערות',
		'pack_date'        => 'תאריך אריזה',
		'delivery_date'    => 'תאריך אספקה',
		'packed_at'        => 'נארז ב',
		'steps'            => 'צעדים (JSON)',
		'contents'         => 'תכולה מותאמת (JSON)',
		'box_lines'        => 'מארזים בהזמנה (JSON)',
		'points'           => 'נקודות אספקה (JSON)',
		'form_answers'     => 'תשובות טופס (JSON)',
		'mail'             => 'מיילים שנשלחו (JSON)',
		'created_at'       => 'נוצר',
		'updated_at'       => 'עודכן',
	);
}

function tbs_backup_sheets() {
	$catalog   = tbs_kv_get( 'catalog', array() );
	$stock     = tbs_kv_get( 'stock', array() );
	$texts     = tbs_kv_get( 'texts', array() );
	$box_names = array();
	foreach ( (array) ( $catalog['boxes'] ?? array() ) as $b ) {
		$box_names[ $b['id'] ] = $b['name'];
	}
	$clients = tbs_clients_all();

	$cols   = tbs_client_columns();
	$rows   = array( array_values( $cols ) );
	$points = array( array( 'לקוח', 'עיר', 'אזור', 'כתובת', 'כמות', 'פריקה ידנית', 'מלגזה במקום', 'איש קשר לתיאום', 'אילוצים ובקשות' ) );
	foreach ( $clients as $c ) {
		$row = array();
		foreach ( array_keys( $cols ) as $k ) {
			switch ( $k ) {
				case 'box_name':
					$row[] = implode( ', ', array_map( function ( $l ) use ( $box_names ) {
						return ( $box_names[ $l['box'] ] ?? '?' ) . ( null === $l['qty'] ? '' : ' × ' . $l['qty'] );
					}, (array) $c['box_lines'] ) );
					break;
				case 'form_status':
					$row[] = 'received' === $c['form_status'] ? 'התקבל' : 'ממתין';
					break;
				case 'steps':
				case 'contents':
				case 'box_lines':
				case 'points':
				case 'form_answers':
				case 'mail':
					$row[] = null === $c[ $k ] ? '' : wp_json_encode( $c[ $k ], JSON_UNESCAPED_UNICODE );
					break;
				default:
					$row[] = $c[ $k ];
			}
		}
		$rows[] = $row;
		foreach ( (array) $c['points'] as $p ) {
			$points[] = array( $c['name'], $p['city'] ?? '', $p['region'] ?? '', $p['address'] ?? '', $p['qty'] ?? null, $p['manual'] ?? '', $p['forklift'] ?? '', $p['person'] ?? '', $p['notes'] ?? '' );
		}
	}

	$staff = array( array( 'מייל', 'שם', 'תפקיד', 'מצב' ) );
	$roles = tbs_roles();
	foreach ( tbs_staff_all() as $s ) {
		$staff[] = array( $s['email'], $s['name'], $roles[ $s['role'] ] ?? $s['role'], 'active' === $s['status'] ? 'פעיל' : 'הוזמן' );
	}

	$boxes     = (array) ( $catalog['boxes'] ?? array() );
	$acc_names = array();
	foreach ( (array) ( $catalog['accessories'] ?? array() ) as $a ) {
		$acc_names[ $a['id'] ] = $a['name'];
	}
	$recipe = array( array_merge( array( 'חומר גלם', 'יחידה' ), array_column( $boxes, 'name' ) ) );
	foreach ( (array) ( $catalog['ingredients'] ?? array() ) as $ing ) {
		$r = array( trim( ( $ing['emoji'] ?? '' ) . ' ' . $ing['name'] ), $ing['unit'] ?? '' );
		foreach ( $boxes as $b ) {
			$pk = ( (array) ( $ing['pack'] ?? array() ) )[ $b['id'] ] ?? '';
			if ( '' !== $pk ) {
				// Readable sheet only: "נספק (grams)". The full data is in the JSON sheet.
				$g   = ( (array) ( $ing['packs'] ?? array() ) )[ $pk ] ?? null;
				$r[] = ( $acc_names[ $pk ] ?? $pk ) . ' (' . ( null === $g ? 'טרם נמדד' : $g ) . ')';
				continue;
			}
			$g   = ( (array) ( $ing['grams'] ?? array() ) )[ $b['id'] ] ?? null;
			$r[] = null === $g ? null : $g;
		}
		$recipe[] = $r;
	}

	$stock_rows = array( array( 'סוג', 'פריט', 'במלאי' ) );
	foreach ( $boxes as $b ) {
		$stock_rows[] = array( 'מארז', $b['name'], ( (array) ( $stock['boxes'] ?? array() ) )[ $b['id'] ] ?? null );
	}
	foreach ( (array) ( $catalog['accessories'] ?? array() ) as $a ) {
		$stock_rows[] = array( 'נספק (יחידות)', $a['name'], ( (array) ( $stock['accessories'] ?? array() ) )[ $a['id'] ] ?? null );
	}
	foreach ( (array) ( $catalog['ingredients'] ?? array() ) as $i ) {
		$stock_rows[] = array( 'תכולה (' . ( $i['unit'] ?? 'ק״ג' ) . ')', $i['name'], ( (array) ( $stock['ingredients'] ?? array() ) )[ $i['id'] ] ?? null );
	}

	// Machine-readable copy used for restore. Excel cells hold up to 32,767 characters.
	$data = array( array( 'key', 'part', 'json' ) );
	foreach ( array( 'catalog' => $catalog, 'stock' => $stock, 'texts' => $texts, 'orders' => array_values( (array) tbs_kv_get( 'orders', array() ) ) ) as $k => $v ) {
		$json = wp_json_encode( $v, JSON_UNESCAPED_UNICODE );
		$part = 0;
		foreach ( mb_str_split( $json, 8000 ) as $chunk ) {
			$data[] = array( $k, $part++, $chunk );
		}
	}
	$data[] = array( 'meta', 0, wp_json_encode( array( 'version' => TBS_VERSION, 'created' => current_time( 'mysql' ), 'season' => tbs_season(), 'season_name' => $texts['season'] ?? '' ) ) );

	return array(
		array( 'name' => 'לקוחות', 'rows' => $rows ),
		array( 'name' => 'נקודות אספקה', 'rows' => $points ),
		array( 'name' => 'משתמשים', 'rows' => $staff ),
		array( 'name' => 'תכולת מארזים (גרם)', 'rows' => $recipe ),
		array( 'name' => 'מלאי', 'rows' => $stock_rows ),
		array( 'name' => '_data', 'rows' => $data, 'hidden' => true, 'ltr' => true ),
	);
}

/** @return string|WP_Error File name. */
function tbs_backup_create( $kind = 'auto' ) {
	$dir  = tbs_backup_dir();
	$name = 'tubishvat-backup-' . current_time( 'Y-m-d-Hi' ) . ( 'main' === tbs_season() ? '' : '-' . tbs_season() ) . ( 'auto' === $kind ? '' : '-' . sanitize_key( $kind ) ) . '-' . strtolower( wp_generate_password( 6, false ) ) . '.xlsx';
	$res  = tbs_xlsx_write( $dir . '/' . $name, tbs_backup_sheets() );
	if ( is_wp_error( $res ) ) {
		return $res;
	}
	tbs_backup_prune();
	update_option( 'tbs_last_backup', current_time( 'mysql' ), false );
	return $name;
}

function tbs_backup_list() {
	$dir   = tbs_backup_dir();
	$files = glob( $dir . '/tubishvat-backup-*.xlsx' );
	$out   = array();
	foreach ( (array) $files as $f ) {
		$out[] = array(
			'file'    => basename( $f ),
			'size'    => filesize( $f ),
			'created' => wp_date( 'Y-m-d H:i', filemtime( $f ) ),
			'ts'      => filemtime( $f ),
		);
	}
	usort( $out, function ( $a, $b ) {
		return $b['ts'] <=> $a['ts'];
	} );
	return $out;
}

function tbs_backup_prune() {
	$list = tbs_backup_list();
	foreach ( array_slice( $list, TBS_BACKUP_KEEP ) as $old ) {
		wp_delete_file( tbs_backup_dir() . '/' . $old['file'] );
	}
}

/** Resolve a backup file name to a safe path inside the backup folder, or null. */
function tbs_backup_path( $file ) {
	$file = basename( (string) $file );
	if ( ! preg_match( '/^tubishvat-backup-[a-z0-9\-]+\.xlsx$/', $file ) ) {
		return null;
	}
	$path = tbs_backup_dir() . '/' . $file;
	return file_exists( $path ) ? $path : null;
}

/**
 * Replace all app data with the contents of a backup file.
 *
 * @return array|WP_Error Counts.
 */
function tbs_backup_restore( $path ) {
	global $wpdb;
	$book = tbs_xlsx_read( $path );
	if ( is_wp_error( $book ) ) {
		return $book;
	}
	if ( empty( $book['_data'] ) || empty( $book['לקוחות'] ) ) {
		return new WP_Error( 'tbs_restore', 'זה לא קובץ גיבוי של המערכת. אפשר לשחזר רק מקובץ שהורד ממסך הגיבויים.' );
	}

	$parts = array();
	foreach ( $book['_data'] as $i => $row ) {
		if ( 0 === $i || empty( $row[0] ) ) {
			continue;
		}
		$parts[ $row[0] ][ (int) ( $row[1] ?? 0 ) ] = (string) ( $row[2] ?? '' );
	}
	$kv = array();
	foreach ( array( 'catalog', 'stock', 'texts' ) as $k ) {
		if ( empty( $parts[ $k ] ) ) {
			return new WP_Error( 'tbs_restore', 'קובץ הגיבוי חסר נתונים (' . $k . ').' );
		}
		ksort( $parts[ $k ] );
		$kv[ $k ] = json_decode( implode( '', $parts[ $k ] ), true );
		if ( ! is_array( $kv[ $k ] ) ) {
			return new WP_Error( 'tbs_restore', 'קובץ הגיבוי פגום (' . $k . ').' );
		}
	}

	// Map client columns by header label.
	$labels = array_flip( tbs_client_columns() );
	$sheet  = $book['לקוחות'];
	$header = $sheet[0] ?? array();
	$colkey = array();
	foreach ( $header as $ci => $label ) {
		if ( isset( $labels[ $label ] ) ) {
			$colkey[ $ci ] = $labels[ $label ];
		}
	}
	if ( ! in_array( 'name', $colkey, true ) ) {
		return new WP_Error( 'tbs_restore', 'בגיליון הלקוחות חסרה עמודת "לקוח".' );
	}
	$clients = array();
	foreach ( $sheet as $ri => $row ) {
		if ( 0 === $ri ) {
			continue;
		}
		$c = array();
		foreach ( $colkey as $ci => $k ) {
			$c[ $k ] = $row[ $ci ] ?? '';
		}
		if ( '' === trim( (string) ( $c['name'] ?? '' ) ) ) {
			continue;
		}
		foreach ( array( 'steps', 'contents', 'box_lines', 'points', 'form_answers', 'mail' ) as $j ) {
			$c[ $j ] = '' === ( $c[ $j ] ?? '' ) ? null : json_decode( (string) $c[ $j ], true );
		}
		if ( null === $c['box_lines'] ) {
			unset( $c['box_lines'] ); // older backup: rebuilt from box/qty when read.
		}
		$c['form_status'] = ( 'התקבל' === ( $c['form_status'] ?? '' ) ) ? 'received' : 'waiting';
		$clients[]        = $c;
	}

	$staff = array();
	$rmap  = array_flip( tbs_roles() );
	foreach ( (array) ( $book['משתמשים'] ?? array() ) as $ri => $row ) {
		if ( 0 === $ri || empty( $row[0] ) || ! is_email( $row[0] ) ) {
			continue;
		}
		$staff[] = array(
			'email'  => strtolower( sanitize_email( $row[0] ) ),
			'name'   => sanitize_text_field( (string) ( $row[1] ?? '' ) ),
			'role'   => $rmap[ $row[2] ?? '' ] ?? 'viewer',
			'status' => 'פעיל' === ( $row[3] ?? '' ) ? 'active' : 'invited',
		);
	}

	// Safety copy of the current state first.
	$safety = tbs_backup_create( 'before-restore' );
	if ( is_wp_error( $safety ) ) {
		return $safety;
	}

	tbs_kv_set( 'catalog', $kv['catalog'] );
	tbs_kv_set( 'stock', $kv['stock'] );
	tbs_kv_set( 'texts', $kv['texts'] );

	// A backup holds one season: only that season's clients are replaced.
	$wpdb->query( $wpdb->prepare( 'DELETE FROM ' . tbs_table( 'clients' ) . ' WHERE season = %s', tbs_season() ) );
	foreach ( $clients as $c ) {
		$data           = tbs_client_sanitize( $c );
		$data['season'] = tbs_season();
		$now            = current_time( 'mysql' );
		if ( ! empty( $c['id'] ) && ! $wpdb->get_var( $wpdb->prepare( 'SELECT id FROM ' . tbs_table( 'clients' ) . ' WHERE id = %d', (int) $c['id'] ) ) ) {
			$data['id'] = (int) $c['id'];
		}
		$data['created_at'] = preg_match( '/^\d{4}-\d{2}-\d{2}/', (string) ( $c['created_at'] ?? '' ) ) ? $c['created_at'] : $now;
		$data['updated_at'] = $now;
		$wpdb->insert( tbs_table( 'clients' ), $data );
	}

	$wpdb->query( 'DELETE FROM ' . tbs_table( 'staff' ) );
	foreach ( $staff as $s ) {
		$s['created_at'] = current_time( 'mysql' );
		$wpdb->insert( tbs_table( 'staff' ), $s );
	}

	if ( isset( $parts['orders'] ) ) {
		ksort( $parts['orders'] );
		$orders = json_decode( implode( '', $parts['orders'] ), true );
		tbs_kv_set( 'orders', is_array( $orders ) ? $orders : array() );
	}
	foreach ( array( 'catalog', 'stock', 'orders' ) as $k ) {
		tbs_blob_touch( $k );
	}
	tbs_log_add( array( 'entity' => 'season', 'title' => 'גיבוי', 'summary' => 'הנתונים שוחזרו מגיבוי (' . count( $clients ) . ' לקוחות)' ) );

	return array(
		'clients' => count( $clients ),
		'staff'   => count( $staff ),
		'safety'  => $safety,
	);
}

/* ---------- schedule ---------- */

function tbs_schedule_backup() {
	if ( wp_next_scheduled( 'tbs_daily_backup' ) ) {
		return;
	}
	$tz   = wp_timezone();
	$next = new DateTime( 'today 02:00', $tz );
	if ( $next->getTimestamp() <= time() ) {
		$next->modify( '+1 day' );
	}
	wp_schedule_event( $next->getTimestamp(), 'daily', 'tbs_daily_backup' );
}
add_action( 'init', 'tbs_schedule_backup' );
add_action( 'tbs_daily_backup', function () {
	tbs_backup_create( 'auto' );
} );
