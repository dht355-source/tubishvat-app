<?php
/**
 * History: who changed what, with undo.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

function tbs_log_add( $e ) {
	global $wpdb;
	$me  = tbs_me();
	$row = array(
		'season'     => tbs_season(),
		'at'         => current_time( 'mysql' ),
		'user_name'  => $e['user_name'] ?? ( $me ? $me['name'] : 'מערכת' ),
		'user_email' => $me ? strtolower( $me['email'] ) : '',
		'entity'     => $e['entity'],
		'entity_id'  => (int) ( $e['entity_id'] ?? 0 ),
		'title'      => mb_substr( (string) ( $e['title'] ?? '' ), 0, 190 ),
		'field'      => (string) ( $e['field'] ?? '' ),
		'summary'    => (string) ( $e['summary'] ?? '' ),
		'before_v'   => array_key_exists( 'before', $e ) ? wp_json_encode( $e['before'], JSON_UNESCAPED_UNICODE ) : null,
		'after_v'    => array_key_exists( 'after', $e ) ? wp_json_encode( $e['after'], JSON_UNESCAPED_UNICODE ) : null,
		'rev'        => (int) ( $e['rev'] ?? 0 ),
	);
	$wpdb->insert( tbs_table( 'log' ), $row );
	$id = (int) $wpdb->insert_id;
	if ( 0 === $id % 200 ) {
		// Keep the newest 4000 rows.
		$cut = (int) $wpdb->get_var( 'SELECT id FROM ' . tbs_table( 'log' ) . ' ORDER BY id DESC LIMIT 1 OFFSET 4000' );
		if ( $cut ) {
			$wpdb->query( $wpdb->prepare( 'DELETE FROM ' . tbs_table( 'log' ) . ' WHERE id <= %d', $cut ) );
		}
	}
	return $id;
}

/**
 * Whole-blob saves (catalog, stock, orders) arrive every few keystrokes. Fold a run of saves by
 * the same person into one history row: the first "before", the latest "after".
 */
function tbs_log_blob( $entity, $title, $summary, $before, $after ) {
	global $wpdb;
	$me   = tbs_me();
	$mail = $me ? strtolower( $me['email'] ) : '';
	$last = $wpdb->get_row( $wpdb->prepare(
		'SELECT * FROM ' . tbs_table( 'log' ) . ' WHERE season = %s AND entity = %s ORDER BY id DESC LIMIT 1',
		tbs_season(),
		$entity
	), ARRAY_A );
	$fresh = $last && $last['user_email'] === $mail && ! (int) $last['undone'] && '' === $last['field']
		&& ( strtotime( current_time( 'mysql' ) ) - strtotime( $last['at'] ) ) < 600;
	if ( $fresh ) {
		$sum = $last['summary'];
		if ( '' !== $summary && false === mb_strpos( $sum, $summary ) ) {
			$sum = mb_substr( $sum . ' · ' . $summary, 0, 600 );
		}
		$wpdb->update( tbs_table( 'log' ), array(
			'at'      => current_time( 'mysql' ),
			'summary' => $sum,
			'after_v' => wp_json_encode( $after, JSON_UNESCAPED_UNICODE ),
		), array( 'id' => (int) $last['id'] ) );
		return (int) $last['id'];
	}
	return tbs_log_add( array( 'entity' => $entity, 'title' => $title, 'summary' => $summary, 'before' => $before, 'after' => $after ) );
}

function tbs_log_public( $r ) {
	return array(
		'id'        => (int) $r['id'],
		'at'        => $r['at'],
		'user'      => $r['user_name'],
		'entity'    => $r['entity'],
		'entity_id' => (int) $r['entity_id'],
		'title'     => $r['title'],
		'field'     => $r['field'],
		'summary'   => $r['summary'],
		'undone'    => (bool) (int) $r['undone'],
		'can_undo'  => ! (int) $r['undone'] && null !== $r['before_v'] && in_array( $r['entity'], array( 'client', 'catalog', 'stock', 'orders' ), true ),
	);
}

function tbs_log_list( $entity = '', $entity_id = 0, $limit = 60 ) {
	global $wpdb;
	$sql  = 'SELECT * FROM ' . tbs_table( 'log' ) . ' WHERE season = %s';
	$args = array( tbs_season() );
	if ( '' !== $entity ) {
		$sql   .= ' AND entity = %s';
		$args[] = $entity;
		if ( $entity_id ) {
			$sql   .= ' AND entity_id = %d';
			$args[] = $entity_id;
		}
	}
	$sql   .= ' ORDER BY id DESC LIMIT %d';
	$args[] = max( 1, min( 200, (int) $limit ) );
	$rows   = $wpdb->get_results( $wpdb->prepare( $sql, $args ), ARRAY_A );
	if ( ! tbs_can_view( 'purchase' ) ) {
		$rows = array_filter( $rows, function ( $r ) {
			return 'orders' !== $r['entity'];
		} );
	}
	return array_values( array_map( 'tbs_log_public', $rows ) );
}

/* ---------- describing a client change in words ---------- */

function tbs_client_field_labels() {
	return array(
		'name'             => 'שם הלקוח',
		'contact'          => 'איש קשר',
		'contact_email'    => 'מייל איש קשר',
		'contact_phone'    => 'טלפון איש קשר',
		'accessories'      => 'מוצרים נלווים',
		'spots'            => 'מספר נקודות אספקה',
		'rep'              => 'נציג מכירות',
		'close_date'       => 'תאריך סגירה',
		'pack_date'        => 'תאריך אריזה',
		'delivery_date'    => 'תאריך אספקה',
		'packed_at'        => 'אריזה',
		'status'           => 'סטטוס',
		'form_status'      => 'טופס אספקה',
		'notes'            => 'הערות',
		'steps'            => 'צעדים',
		'box_lines'        => 'מארזים',
		'points'           => 'נקודות אספקה',
	);
}

function tbs_short( $v ) {
	$v = trim( (string) $v );
	if ( '' === $v ) {
		return 'ריק';
	}
	if ( preg_match( '/^(\d{4})-(\d{2})-(\d{2})/', $v, $m ) ) {
		return (int) $m[3] . '.' . (int) $m[2] . '.' . $m[1];
	}
	return mb_strlen( $v ) > 40 ? mb_substr( $v, 0, 40 ) . '…' : $v;
}

function tbs_index_by_id( $list ) {
	$out = array();
	foreach ( (array) $list as $x ) {
		if ( is_array( $x ) && isset( $x['id'] ) ) {
			$out[ $x['id'] ] = $x;
		}
	}
	return $out;
}

function tbs_describe_client_change( $field, $before, $after ) {
	$labels = tbs_client_field_labels();
	$label  = $labels[ $field ] ?? $field;
	switch ( $field ) {
		case 'steps':
			$b     = tbs_index_by_id( $before );
			$a     = tbs_index_by_id( $after );
			$parts = array();
			foreach ( $a as $id => $s ) {
				if ( ! isset( $b[ $id ] ) ) {
					$parts[] = 'נוסף צעד: ' . $s['label'];
				} elseif ( ! empty( $s['done'] ) !== ! empty( $b[ $id ]['done'] ) ) {
					$parts[] = ( ! empty( $s['done'] ) ? 'סומן כבוצע: ' : 'בוטל הסימון: ' ) . $s['label'];
				} elseif ( $s['label'] !== $b[ $id ]['label'] ) {
					$parts[] = 'צעד שונה: ' . $s['label'];
				} elseif ( $s['owner'] !== $b[ $id ]['owner'] ) {
					$parts[] = $s['label'] . ': עבר ' . ( 'us' === $s['owner'] ? 'אלינו' : 'ללקוח' );
				}
			}
			foreach ( $b as $id => $s ) {
				if ( ! isset( $a[ $id ] ) ) {
					$parts[] = 'הוסר צעד: ' . $s['label'];
				}
			}
			return $parts ? implode( ' · ', $parts ) : 'סדר הצעדים שונה';
		case 'points':
			$b     = tbs_index_by_id( $before );
			$a     = tbs_index_by_id( $after );
			$parts = array();
			$name  = function ( $p ) {
				$n = trim( ( $p['city'] ?? '' ) . ' ' . ( $p['address'] ?? '' ) );
				return '' === $n ? 'נקודה' : $n;
			};
			foreach ( $a as $id => $p ) {
				if ( ! isset( $b[ $id ] ) ) {
					$parts[] = 'נוספה נקודת אספקה';
				} elseif ( ! empty( $p['delivered'] ) !== ! empty( $b[ $id ]['delivered'] ) ) {
					$parts[] = ( ! empty( $p['delivered'] ) ? 'סופק: ' : 'בוטל "סופק": ' ) . $name( $p );
				} elseif ( array_merge( array( 'date' => '', 'delivered' => false ), $p ) != array_merge( array( 'date' => '', 'delivered' => false ), $b[ $id ] ) ) { // phpcs:ignore Universal.Operators.StrictComparisons
					$parts[] = 'עודכנה נקודה: ' . $name( $p );
				}
			}
			foreach ( $b as $id => $p ) {
				if ( ! isset( $a[ $id ] ) ) {
					$parts[] = 'הוסרה נקודה: ' . $name( $p );
				}
			}
			return $parts ? implode( ' · ', array_unique( $parts ) ) : 'נקודות האספקה עודכנו';
		case 'box_lines':
			$catalog = (array) tbs_kv_get( 'catalog', array() );
			$names   = array();
			foreach ( (array) ( $catalog['boxes'] ?? array() ) as $bx ) {
				$names[ $bx['id'] ] = $bx['name'];
			}
			$fmt = function ( $lines ) use ( $names ) {
				$out = array();
				foreach ( (array) $lines as $l ) {
					if ( empty( $l['box'] ) ) {
						continue;
					}
					$out[] = ( $names[ $l['box'] ] ?? '?' ) . ( null === ( $l['qty'] ?? null ) ? '' : ' × ' . $l['qty'] );
				}
				return $out ? implode( ', ', $out ) : 'ללא מארזים';
			};
			$fb = $fmt( $before );
			$fa = $fmt( $after );
			return $fb === $fa ? 'תכולת המארזים הותאמה' : 'מארזים: ' . $fb . ' ← ' . $fa;
		case 'form_status':
			return 'received' === $after ? 'טופס האספקה סומן כהתקבל' : 'טופס האספקה חזר ל"ממתין"';
		case 'packed_at':
			return $after ? 'סומן כנארז' : 'בוטל הסימון "נארז"';
		case 'notes':
			return 'ההערות עודכנו';
		default:
			return $label . ': ' . tbs_short( $before ) . ' ← ' . tbs_short( $after );
	}
}

/** Fields of a client row that are worth a history line. */
function tbs_client_logged_fields() {
	return array_keys( tbs_client_field_labels() );
}

/** Compare two loaded clients and write one history row per changed field. */
function tbs_log_client_diff( $before, $after, $only = null ) {
	foreach ( tbs_client_logged_fields() as $f ) {
		if ( null !== $only && ! in_array( $f, $only, true ) ) {
			continue;
		}
		$b = $before[ $f ] ?? null;
		$a = $after[ $f ] ?? null;
		if ( wp_json_encode( $b ) === wp_json_encode( $a ) ) {
			continue;
		}
		tbs_log_add( array(
			'entity'    => 'client',
			'entity_id' => $after['id'],
			'title'     => $after['name'],
			'field'     => $f,
			'summary'   => tbs_describe_client_change( $f, $b, $a ),
			'before'    => $b,
			'after'     => $a,
			'rev'       => $after['rev'],
		) );
	}
}

/** Did somebody else change one of these fields after revision $base? */
function tbs_client_conflict( $client_id, $base, $fields ) {
	global $wpdb;
	$me = tbs_me();
	if ( ! $fields ) {
		return null;
	}
	$in   = implode( ',', array_fill( 0, count( $fields ), '%s' ) );
	$args = array_merge( array( $client_id, (int) $base, strtolower( (string) $me['email'] ) ), $fields );
	return $wpdb->get_row( $wpdb->prepare(
		'SELECT user_name, field FROM ' . tbs_table( 'log' ) . " WHERE entity = 'client' AND entity_id = %d AND rev > %d AND user_email <> %s AND field IN ($in) ORDER BY id DESC LIMIT 1", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$args
	), ARRAY_A );
}

/* ---------- describing catalog / stock changes ---------- */

function tbs_describe_stock_change( $before, $after ) {
	$catalog = (array) tbs_kv_get( 'catalog', array() );
	$parts   = array();
	foreach ( array( 'boxes' => 'boxes', 'accessories' => 'accessories', 'ingredients' => 'ingredients' ) as $g => $cg ) {
		$names = array();
		foreach ( (array) ( $catalog[ $cg ] ?? array() ) as $x ) {
			$names[ $x['id'] ] = $x['name'];
		}
		$b = (array) ( $before[ $g ] ?? array() );
		$a = (array) ( $after[ $g ] ?? array() );
		foreach ( array_unique( array_merge( array_keys( $b ), array_keys( $a ) ) ) as $id ) {
			$bv = $b[ $id ] ?? 0;
			$av = $a[ $id ] ?? 0;
			if ( (float) $bv !== (float) $av ) {
				$parts[] = ( $names[ $id ] ?? $id ) . ': ' . ( $bv + 0 ) . ' ← ' . ( $av + 0 );
			}
		}
	}
	if ( ! $parts ) {
		return '';
	}
	return 'מלאי – ' . implode( ', ', array_slice( $parts, 0, 4 ) ) . ( count( $parts ) > 4 ? ' ועוד ' . ( count( $parts ) - 4 ) : '' );
}

function tbs_describe_catalog_change( $before, $after ) {
	$parts  = array();
	$groups = array( 'boxes' => 'מארז', 'ingredients' => 'תכולה', 'accessories' => 'נספק', 'suppliers' => 'ספק' );
	foreach ( $groups as $g => $word ) {
		$b = tbs_index_by_id( $before[ $g ] ?? array() );
		$a = tbs_index_by_id( $after[ $g ] ?? array() );
		foreach ( $a as $id => $x ) {
			if ( ! isset( $b[ $id ] ) ) {
				$parts[] = 'נוסף ' . $word . ': ' . $x['name'];
			} elseif ( $b[ $id ]['name'] !== $x['name'] ) {
				$parts[] = $word . ' שונה: ' . $b[ $id ]['name'] . ' ← ' . $x['name'];
			}
		}
		foreach ( $b as $id => $x ) {
			if ( ! isset( $a[ $id ] ) ) {
				$parts[] = 'הוסר ' . $word . ': ' . $x['name'];
			}
		}
	}
	return $parts ? implode( ' · ', array_slice( $parts, 0, 4 ) ) : 'עודכנו הגדרות המארזים (תכולה, מדידות או ספקים)';
}
