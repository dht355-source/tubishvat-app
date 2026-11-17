<?php
/**
 * REST API under /wp-json/tbs/v1/. Every route checks the app role server-side.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * @param bool $seasonal Whether the route writes season data (blocked while the season is archived).
 */
function tbs_rest_can( $area, $level, $seasonal = true ) {
	return function () use ( $area, $level, $seasonal ) {
		if ( ! tbs_me() ) {
			return new WP_Error( 'tbs_auth', 'צריך להתחבר מחדש.', array( 'status' => 401 ) );
		}
		$ok = 'edit' === $level ? tbs_can_edit( $area ) : tbs_can_view( $area );
		if ( ! $ok ) {
			return new WP_Error( 'tbs_forbidden', 'אין לך הרשאה לפעולה הזו.', array( 'status' => 403 ) );
		}
		if ( $seasonal && 'edit' === $level && tbs_season_locked() ) {
			return new WP_Error( 'tbs_locked', 'העונה הזו בארכיון ופתוחה לצפייה בלבד.', array( 'status' => 403 ) );
		}
		return true;
	};
}

/** Every response carries the global change counter, so the app knows when a teammate saved something. */
add_filter( 'rest_post_dispatch', function ( $response, $server, $request ) {
	if ( 0 === strpos( $request->get_route(), '/tbs/v1/' ) && $response instanceof WP_REST_Response ) {
		$response->header( 'X-TBS-Rev', (string) (int) get_option( 'tbs_rev', 0 ) );
		$response->header( 'Cache-Control', 'no-store' );
	}
	return $response;
}, 10, 3 );

function tbs_err( $msg, $status = 400 ) {
	return new WP_Error( 'tbs_error', $msg, array( 'status' => $status ) );
}

add_action( 'rest_api_init', function () {
	$ns = 'tbs/v1';
	$signed_in_early = function () {
		return tbs_me() ? true : new WP_Error( 'tbs_auth', 'צריך להתחבר מחדש.', array( 'status' => 401 ) );
	};

	register_rest_route( $ns, '/bootstrap', array(
		'methods'             => 'GET',
		'callback'            => 'tbs_rest_bootstrap',
		'permission_callback' => function () {
			return tbs_me() ? true : new WP_Error( 'tbs_auth', 'צריך להתחבר מחדש.', array( 'status' => 401 ) );
		},
	) );

	register_rest_route( $ns, '/clients', array(
		'methods'             => 'POST',
		'callback'            => 'tbs_rest_client_create',
		'permission_callback' => tbs_rest_can( 'clients', 'edit' ),
	) );
	register_rest_route( $ns, '/clients/(?P<id>\d+)', array(
		array(
			'methods'             => 'PUT',
			'callback'            => 'tbs_rest_client_update',
			'permission_callback' => tbs_rest_can( 'clients', 'edit' ),
		),
		array(
			'methods'             => 'DELETE',
			'callback'            => 'tbs_rest_client_delete',
			'permission_callback' => tbs_rest_can( 'settings', 'edit' ),
		),
	) );

	register_rest_route( $ns, '/clients/(?P<id>\d+)/send', array(
		'methods'             => 'POST',
		'callback'            => 'tbs_rest_client_send',
		'permission_callback' => tbs_rest_can( 'clients', 'edit' ),
	) );

	register_rest_route( $ns, '/gmail', array(
		'methods'             => 'DELETE',
		'callback'            => function () {
			tbs_gmail_disconnect( get_current_user_id() );
			return array( 'gmail' => tbs_gmail_status() );
		},
		'permission_callback' => $signed_in_early,
	) );

	register_rest_route( $ns, '/catalog', array(
		'methods'             => 'PUT',
		'callback'            => 'tbs_rest_catalog_save',
		'permission_callback' => tbs_rest_can( 'settings', 'edit' ),
	) );
	register_rest_route( $ns, '/stock', array(
		'methods'             => 'PUT',
		'callback'            => 'tbs_rest_stock_save',
		'permission_callback' => tbs_rest_can( 'inventory', 'edit' ),
	) );
	register_rest_route( $ns, '/texts', array(
		'methods'             => 'PUT',
		'callback'            => 'tbs_rest_texts_save',
		'permission_callback' => tbs_rest_can( 'settings', 'edit' ),
	) );
	register_rest_route( $ns, '/app-settings', array(
		'methods'             => 'PUT',
		'callback'            => 'tbs_rest_app_settings_save',
		'permission_callback' => tbs_rest_can( 'settings', 'edit', false ),
	) );

	register_rest_route( $ns, '/staff', array(
		'methods'             => 'POST',
		'callback'            => 'tbs_rest_staff_create',
		'permission_callback' => tbs_rest_can( 'users', 'edit', false ),
	) );
	register_rest_route( $ns, '/staff/(?P<id>\d+)', array(
		array(
			'methods'             => 'PUT',
			'callback'            => 'tbs_rest_staff_update',
			'permission_callback' => tbs_rest_can( 'users', 'edit', false ),
		),
		array(
			'methods'             => 'DELETE',
			'callback'            => 'tbs_rest_staff_delete',
			'permission_callback' => tbs_rest_can( 'users', 'edit', false ),
		),
	) );

	register_rest_route( $ns, '/backups', array(
		array(
			'methods'             => 'GET',
			'callback'            => function () {
				return array( 'backups' => tbs_backup_list(), 'last' => get_option( 'tbs_last_backup' ) );
			},
			'permission_callback' => tbs_rest_can( 'settings', 'edit', false ),
		),
		array(
			'methods'             => 'POST',
			'callback'            => function () {
				$name = tbs_backup_create( 'manual' );
				return is_wp_error( $name ) ? $name : array( 'file' => $name, 'backups' => tbs_backup_list() );
			},
			'permission_callback' => tbs_rest_can( 'settings', 'edit', false ),
		),
	) );
	register_rest_route( $ns, '/backups/download', array(
		'methods'             => 'GET',
		'callback'            => 'tbs_rest_backup_download',
		'permission_callback' => tbs_rest_can( 'settings', 'edit', false ),
	) );
	register_rest_route( $ns, '/backups/restore', array(
		'methods'             => 'POST',
		'callback'            => 'tbs_rest_backup_restore',
		'permission_callback' => tbs_rest_can( 'settings', 'edit' ),
	) );

	$signed_in = function () {
		return tbs_me() ? true : new WP_Error( 'tbs_auth', 'צריך להתחבר מחדש.', array( 'status' => 401 ) );
	};
	register_rest_route( $ns, '/rev', array(
		'methods'             => 'GET',
		'callback'            => function () {
			return array( 'rev' => (int) get_option( 'tbs_rev', 0 ) );
		},
		'permission_callback' => $signed_in,
	) );
	register_rest_route( $ns, '/log', array(
		'methods'             => 'GET',
		'callback'            => 'tbs_rest_log',
		'permission_callback' => $signed_in,
	) );
	register_rest_route( $ns, '/log/(?P<id>\d+)/undo', array(
		'methods'             => 'POST',
		'callback'            => 'tbs_rest_log_undo',
		'permission_callback' => $signed_in, // The area is checked per entry.
	) );

	register_rest_route( $ns, '/seasons', array(
		'methods'             => 'POST',
		'callback'            => 'tbs_rest_season_create',
		'permission_callback' => tbs_rest_can( 'settings', 'edit', false ),
	) );
	register_rest_route( $ns, '/seasons/(?P<id>[a-z0-9]+)', array(
		'methods'             => 'PUT',
		'callback'            => 'tbs_rest_season_update',
		'permission_callback' => tbs_rest_can( 'settings', 'edit', false ),
	) );

	register_rest_route( $ns, '/schedule/(?P<id>\d+)', array(
		'methods'             => 'PUT',
		'callback'            => 'tbs_rest_schedule',
		'permission_callback' => function () {
			if ( ! tbs_me() ) {
				return new WP_Error( 'tbs_auth', 'צריך להתחבר מחדש.', array( 'status' => 401 ) );
			}
			if ( ! tbs_can_edit( 'clients' ) && ! tbs_can_edit( 'inventory' ) ) {
				return new WP_Error( 'tbs_forbidden', 'אין לך הרשאה לפעולה הזו.', array( 'status' => 403 ) );
			}
			return tbs_season_locked() ? new WP_Error( 'tbs_locked', 'העונה הזו בארכיון ופתוחה לצפייה בלבד.', array( 'status' => 403 ) ) : true;
		},
	) );

	register_rest_route( $ns, '/orders', array(
		'methods'             => 'PUT',
		'callback'            => 'tbs_rest_orders_save',
		'permission_callback' => tbs_rest_can( 'purchase', 'edit' ),
	) );
	register_rest_route( $ns, '/orders/receive', array(
		'methods'             => 'POST',
		'callback'            => 'tbs_rest_order_receive',
		'permission_callback' => tbs_rest_can( 'purchase', 'edit' ),
	) );
	register_rest_route( $ns, '/suppliers', array(
		'methods'             => 'PUT',
		'callback'            => 'tbs_rest_suppliers_save',
		'permission_callback' => tbs_rest_can( 'purchase', 'edit' ),
	) );

	register_rest_route( $ns, '/update', array(
		array(
			'methods'             => 'POST',
			'callback'            => 'tbs_rest_update_check',
			'permission_callback' => tbs_rest_can( 'settings', 'edit', false ),
		),
	) );
	register_rest_route( $ns, '/update/install', array(
		'methods'             => 'POST',
		'callback'            => 'tbs_rest_update_install',
		'permission_callback' => function () {
			return current_user_can( 'update_plugins' ) ? true : new WP_Error( 'tbs_forbidden', 'רק מנהל האתר יכול להתקין עדכונים.', array( 'status' => 403 ) );
		},
	) );

	register_rest_route( $ns, '/tally', array(
		'methods'             => 'POST',
		'callback'            => 'tbs_rest_tally',
		'permission_callback' => '__return_true', // Checked inside with the shared key or signature.
	) );
} );

/* ---------- bootstrap ---------- */

function tbs_rest_bootstrap() {
	$me      = tbs_me();
	$clients = array_values( array_filter( tbs_clients_all(), 'tbs_client_visible' ) );
	$staff   = tbs_staff_all();
	$reps    = array();
	foreach ( $staff as $s ) {
		if ( in_array( $s['role'], array( 'sales', 'admin' ), true ) && $s['name'] ) {
			$reps[] = $s['name'];
		}
	}
	foreach ( $clients as $c ) {
		if ( $c['rep'] ) {
			$reps[] = $c['rep'];
		}
	}
	$reps = array_values( array_unique( $reps ) );
	sort( $reps );

	$out = array(
		'me'      => $me,
		'catalog' => tbs_kv_get( 'catalog', array( 'boxes' => array(), 'ingredients' => array(), 'accessories' => array() ) ),
		'stock'   => tbs_kv_get( 'stock', array() ),
		'texts'   => wp_parse_args( (array) tbs_kv_get( 'texts', array() ), tbs_default_texts() ),
		'clients' => $clients,
		'reps'    => $reps,
		'orders'  => tbs_can_view( 'purchase' ) ? array_values( (array) tbs_kv_get( 'orders', array() ) ) : array(),
		'seasons' => tbs_seasons(),
		'season'  => tbs_season(),
		'active'  => tbs_active_season(),
		'locked'  => tbs_season_locked(),
		'rev'     => (int) get_option( 'tbs_rev', 0 ),
		'revs'    => array(
			'catalog' => (int) tbs_blob_rev( 'catalog' )['rev'],
			'stock'   => (int) tbs_blob_rev( 'stock' )['rev'],
			'orders'  => (int) tbs_blob_rev( 'orders' )['rev'],
		),
		'version' => TBS_VERSION,
		'gmail'   => tbs_gmail_status(),
	);
	if ( tbs_can_edit( 'users' ) ) {
		$out['staff'] = array_map( function ( $s ) {
			return array(
				'id'         => (int) $s['id'],
				'email'      => $s['email'],
				'name'       => $s['name'],
				'role'       => $s['role'],
				'status'     => $s['status'],
				'last_login' => $s['last_login'],
			);
		}, $staff );
		$admins = get_users( array( 'role' => 'administrator', 'fields' => array( 'display_name', 'user_email' ) ) );
		$out['wpAdmins'] = array_map( function ( $u ) {
			return array( 'name' => $u->display_name, 'email' => $u->user_email );
		}, $admins );
	}
	if ( tbs_can_edit( 'settings' ) ) {
		$out['appSettings'] = array(
			'google_client_id'  => (string) get_option( 'tbs_google_client_id' ),
			'google_secret_set' => '' !== (string) get_option( 'tbs_google_client_secret' ),
			'redirect_uri'      => tbs_google_redirect_uri(),
			'origin'            => untrailingslashit( home_url() ),
			'tally_url'         => add_query_arg( 'key', get_option( 'tbs_tally_key' ), rest_url( 'tbs/v1/tally' ) ),
			'tally_unmatched'   => tbs_kv_get( 'tally_unmatched', array() ),
			'last_backup'       => get_option( 'tbs_last_backup' ),
			'zip_ok'            => class_exists( 'ZipArchive' ),
			'update_source'     => (string) get_option( 'tbs_update_source', '' ),
			'update'            => tbs_update_status( false ),
			'can_install'       => current_user_can( 'update_plugins' ),
		);
	}
	return $out;
}

/* ---------- clients ---------- */

function tbs_rest_client_create( WP_REST_Request $req ) {
	$body = (array) $req->get_json_params();
	$me   = tbs_me();
	unset( $body['mail'] );
	if ( 'sales' === $me['role'] ) {
		$body['rep'] = $me['name'];
	}
	if ( '' === trim( (string) ( $body['name'] ?? '' ) ) ) {
		return tbs_err( 'צריך שם לקוח.' );
	}
	if ( ! isset( $body['steps'] ) ) {
		$body['steps'] = array(
			array( 'key' => 'details', 'label' => 'להשלים פרטי הזמנה', 'owner' => 'us', 'done' => false ),
			array( 'key' => 'opening', 'label' => 'לשלוח מייל פתיחה', 'owner' => 'us', 'done' => false ),
			array( 'key' => 'form', 'label' => 'ממתין לטופס אספקה מהלקוח', 'owner' => 'client', 'done' => false ),
			array( 'key' => 'delivery', 'label' => 'לתאם אספקה', 'owner' => 'us', 'done' => false ),
		);
	}
	if ( ! isset( $body['status'] ) ) {
		$texts          = wp_parse_args( (array) tbs_kv_get( 'texts', array() ), tbs_default_texts() );
		$body['status'] = $texts['statuses'][0] ?? '';
	}
	$id     = tbs_client_insert( tbs_client_sanitize( $body ) );
	$client = tbs_client_get( $id );
	tbs_log_add( array( 'entity' => 'client', 'entity_id' => $id, 'title' => $client['name'], 'summary' => 'הלקוח נוצר' ) );
	tbs_bump_rev();
	return array( 'client' => $client );
}

function tbs_rest_client_update( WP_REST_Request $req ) {
	$client = tbs_client_get( (int) $req['id'] );
	if ( ! $client || $client['season'] !== tbs_season() || ! tbs_client_visible( $client ) ) {
		return tbs_err( 'הלקוח לא נמצא.', 404 );
	}
	$body = (array) $req->get_json_params();
	$me   = tbs_me();
	if ( 'sales' === $me['role'] ) {
		unset( $body['rep'] );
	}
	if ( array_key_exists( 'name', $body ) && '' === trim( (string) $body['name'] ) ) {
		return tbs_err( 'שם הלקוח לא יכול להיות ריק.' );
	}
	$base = isset( $body['_rev'] ) ? (int) $body['_rev'] : null;
	unset( $body['_rev'], $body['mail'] );
	$data = tbs_client_sanitize( $body );
	// Lists are saved whole, so a stale copy would wipe a teammate's change. Refuse and hand back the fresh client.
	if ( null !== $base ) {
		$lists = array_values( array_intersect( array( 'steps', 'points', 'box_lines' ), array_keys( $data ) ) );
		$clash = tbs_client_conflict( $client['id'], $base, $lists );
		if ( $clash ) {
			$labels = array( 'steps' => 'הצעדים', 'points' => 'נקודות האספקה', 'box_lines' => 'המארזים' );
			return new WP_Error(
				'tbs_conflict',
				$clash['user_name'] . ' עדכן/ה את ' . ( $labels[ $clash['field'] ] ?? 'הרשימה' ) . ' בינתיים. הגרסה העדכנית נטענה, אפשר לנסות שוב.',
				array( 'status' => 409, 'client' => $client )
			);
		}
	}
	tbs_client_update( $client['id'], $data );
	$after = tbs_client_get( $client['id'] );
	tbs_log_client_diff( $client, $after, array_keys( $data ) );
	return array( 'client' => $after );
}

function tbs_rest_client_delete( WP_REST_Request $req ) {
	$client = tbs_client_get( (int) $req['id'] );
	if ( ! $client ) {
		return tbs_err( 'הלקוח לא נמצא.', 404 );
	}
	if ( $client['season'] !== tbs_season() ) {
		return tbs_err( 'הלקוח לא נמצא.', 404 );
	}
	tbs_client_delete( $client['id'] );
	tbs_log_add( array( 'entity' => 'client', 'entity_id' => $client['id'], 'title' => $client['name'], 'summary' => 'הלקוח נמחק' ) );
	tbs_bump_rev();
	return array( 'deleted' => true );
}

/* ---------- catalog, stock, texts ---------- */

function tbs_num_map( $in ) {
	$out = array();
	foreach ( (array) $in as $k => $v ) {
		if ( null === $v || '' === $v || ! is_numeric( $v ) ) {
			continue;
		}
		$out[ sanitize_key( $k ) ] = $v + 0;
	}
	return (object) $out;
}

/** box id => accessory id (which נספק an ingredient goes in, per box). */
function tbs_key_map( $in ) {
	$out = array();
	foreach ( (array) $in as $k => $v ) {
		$v = sanitize_key( (string) $v );
		if ( '' !== $v ) {
			$out[ sanitize_key( $k ) ] = $v;
		}
	}
	return (object) $out;
}

function tbs_clean_suppliers( $list ) {
	$out = array();
	foreach ( (array) $list as $sp ) {
		if ( ! is_array( $sp ) || empty( $sp['id'] ) || '' === trim( (string) ( $sp['name'] ?? '' ) ) ) {
			continue;
		}
		$out[] = array(
			'id'    => sanitize_key( $sp['id'] ),
			'name'  => sanitize_text_field( $sp['name'] ),
			'phone' => sanitize_text_field( $sp['phone'] ?? '' ),
			'email' => sanitize_email( (string) ( $sp['email'] ?? '' ) ),
			'notes' => sanitize_text_field( $sp['notes'] ?? '' ),
		);
	}
	return $out;
}

function tbs_rest_catalog_save( WP_REST_Request $req ) {
	$in    = (array) $req->get_json_params();
	$clash = tbs_blob_conflict( 'catalog', $in['_rev'] ?? null, 'הגדרות המארזים' );
	if ( $clash ) {
		return $clash;
	}
	$before = (array) tbs_kv_get( 'catalog', array() );
	$out    = array( 'boxes' => array(), 'ingredients' => array(), 'accessories' => array(), 'suppliers' => tbs_clean_suppliers( $in['suppliers'] ?? ( $before['suppliers'] ?? array() ) ) );
	foreach ( (array) ( $in['boxes'] ?? array() ) as $b ) {
		if ( empty( $b['id'] ) || '' === trim( (string) ( $b['name'] ?? '' ) ) ) {
			continue;
		}
		$out['boxes'][] = array( 'id' => sanitize_key( $b['id'] ), 'name' => sanitize_text_field( $b['name'] ), 'image' => esc_url_raw( (string) ( $b['image'] ?? '' ) ), 'supplier' => sanitize_key( (string) ( $b['supplier'] ?? '' ) ) );
	}
	foreach ( (array) ( $in['ingredients'] ?? array() ) as $i ) {
		if ( empty( $i['id'] ) || '' === trim( (string) ( $i['name'] ?? '' ) ) ) {
			continue;
		}
		$out['ingredients'][] = array(
			'id'    => sanitize_key( $i['id'] ),
			'emoji' => mb_substr( sanitize_text_field( $i['emoji'] ?? '' ), 0, 8 ),
			'image' => esc_url_raw( (string) ( $i['image'] ?? '' ) ),
			'name'  => sanitize_text_field( $i['name'] ),
			'unit'  => sanitize_text_field( $i['unit'] ?? 'ק״ג' ),
			'grams' => tbs_num_map( $i['grams'] ?? array() ),
			'packs' => tbs_num_map( $i['packs'] ?? array() ),
			'pack'  => tbs_key_map( $i['pack'] ?? array() ),
			'supplier' => sanitize_key( (string) ( $i['supplier'] ?? '' ) ),
		);
	}
	foreach ( (array) ( $in['accessories'] ?? array() ) as $a ) {
		if ( empty( $a['id'] ) || '' === trim( (string) ( $a['name'] ?? '' ) ) ) {
			continue;
		}
		$out['accessories'][] = array(
			'id'    => sanitize_key( $a['id'] ),
			'emoji' => mb_substr( sanitize_text_field( $a['emoji'] ?? '' ), 0, 8 ),
			'name'  => sanitize_text_field( $a['name'] ),
			'per'   => tbs_num_map( $a['per'] ?? array() ),
			'supplier' => sanitize_key( (string) ( $a['supplier'] ?? '' ) ),
		);
	}
	tbs_kv_set( 'catalog', $out );
	$after = tbs_kv_get( 'catalog' );
	if ( wp_json_encode( $before ) !== wp_json_encode( $after ) ) {
		tbs_log_blob( 'catalog', 'הגדרות', tbs_describe_catalog_change( $before, $after ), $before, $after );
	}
	return array( 'catalog' => $after, 'rev' => tbs_blob_touch( 'catalog' ) );
}

/** Suppliers and "who supplies what" can be edited from the purchasing screen without the settings permission. */
function tbs_rest_suppliers_save( WP_REST_Request $req ) {
	$in      = (array) $req->get_json_params();
	$before  = (array) tbs_kv_get( 'catalog', array() );
	$catalog = $before;
	if ( isset( $in['suppliers'] ) ) {
		$catalog['suppliers'] = tbs_clean_suppliers( $in['suppliers'] );
	}
	foreach ( array( 'boxes', 'ingredients', 'accessories' ) as $g ) {
		$map = (array) ( $in['assign'][ $g ] ?? array() );
		foreach ( (array) ( $catalog[ $g ] ?? array() ) as $i => $item ) {
			if ( array_key_exists( $item['id'], $map ) ) {
				$catalog[ $g ][ $i ]['supplier'] = sanitize_key( (string) $map[ $item['id'] ] );
			}
		}
	}
	tbs_kv_set( 'catalog', $catalog );
	$after = tbs_kv_get( 'catalog' );
	if ( wp_json_encode( $before ) !== wp_json_encode( $after ) ) {
		tbs_log_blob( 'catalog', 'ספקים', tbs_describe_catalog_change( $before, $after ), $before, $after );
	}
	return array( 'catalog' => $after, 'rev' => tbs_blob_touch( 'catalog' ) );
}

function tbs_rest_stock_save( WP_REST_Request $req ) {
	$in    = (array) $req->get_json_params();
	$clash = tbs_blob_conflict( 'stock', $in['_rev'] ?? null, 'המלאי' );
	if ( $clash ) {
		return $clash;
	}
	$before = json_decode( wp_json_encode( tbs_kv_get( 'stock', array() ) ), true );
	$out    = array(
		'boxes'       => tbs_num_map( $in['boxes'] ?? array() ),
		'accessories' => tbs_num_map( $in['accessories'] ?? array() ),
		'ingredients' => tbs_num_map( $in['ingredients'] ?? array() ),
	);
	tbs_kv_set( 'stock', $out );
	$after = tbs_kv_get( 'stock' );
	$sum   = tbs_describe_stock_change( (array) $before, (array) $after );
	if ( '' !== $sum ) {
		tbs_log_blob( 'stock', 'מלאי', $sum, $before, $after );
	}
	return array( 'stock' => $after, 'rev' => tbs_blob_touch( 'stock' ) );
}

/* ---------- purchase orders ---------- */

function tbs_clean_orders( $list ) {
	$out = array();
	foreach ( (array) $list as $o ) {
		if ( ! is_array( $o ) || empty( $o['id'] ) ) {
			continue;
		}
		$items = array();
		foreach ( (array) ( $o['items'] ?? array() ) as $it ) {
			if ( ! is_array( $it ) || empty( $it['id'] ) || ! in_array( $it['group'] ?? '', array( 'boxes', 'accessories', 'ingredients' ), true ) ) {
				continue;
			}
			$items[] = array(
				'group' => $it['group'],
				'id'    => sanitize_key( $it['id'] ),
				'qty'   => max( 0, (float) ( $it['qty'] ?? 0 ) ),
				'got'   => isset( $it['got'] ) && '' !== $it['got'] && null !== $it['got'] ? max( 0, (float) $it['got'] ) : null,
			);
		}
		$status = in_array( $o['status'] ?? '', array( 'draft', 'ordered', 'received' ), true ) ? $o['status'] : 'draft';
		$dt     = function ( $v ) {
			return preg_match( '/^\d{4}-\d{2}-\d{2}/', (string) $v ) ? substr( (string) $v, 0, 19 ) : '';
		};
		$out[] = array(
			'id'          => sanitize_key( $o['id'] ),
			'no'          => (int) ( $o['no'] ?? 0 ),
			'supplier'    => sanitize_key( (string) ( $o['supplier'] ?? '' ) ),
			'status'      => $status,
			'note'        => sanitize_text_field( $o['note'] ?? '' ),
			'eta'         => substr( $dt( $o['eta'] ?? '' ), 0, 10 ),
			'created_at'  => $dt( $o['created_at'] ?? '' ),
			'created_by'  => sanitize_text_field( $o['created_by'] ?? '' ),
			'ordered_at'  => $dt( $o['ordered_at'] ?? '' ),
			'received_at' => $dt( $o['received_at'] ?? '' ),
			'items'       => $items,
		);
	}
	return $out;
}

function tbs_rest_orders_save( WP_REST_Request $req ) {
	$in    = (array) $req->get_json_params();
	$clash = tbs_blob_conflict( 'orders', $in['_rev'] ?? null, 'הזמנות הרכש' );
	if ( $clash ) {
		return $clash;
	}
	$before = array_values( (array) tbs_kv_get( 'orders', array() ) );
	$after  = tbs_clean_orders( $in['orders'] ?? array() );
	// A received order already went into stock: it can't be changed back from here.
	$was = tbs_index_by_id( $before );
	foreach ( $after as $i => $o ) {
		if ( isset( $was[ $o['id'] ] ) && 'received' === $was[ $o['id'] ]['status'] ) {
			$after[ $i ] = $was[ $o['id'] ];
		} elseif ( 'received' === $o['status'] ) {
			$after[ $i ]['status'] = isset( $was[ $o['id'] ] ) ? $was[ $o['id'] ]['status'] : 'draft';
		}
	}
	tbs_kv_set( 'orders', $after );
	if ( wp_json_encode( $before ) !== wp_json_encode( $after ) ) {
		$sum = count( $after ) > count( $before ) ? 'נוצרה הזמנת רכש' : ( count( $after ) < count( $before ) ? 'נמחקה הזמנת רכש' : 'הזמנת רכש עודכנה' );
		tbs_log_blob( 'orders', 'רכש', $sum, $before, $after );
	}
	return array( 'orders' => $after, 'rev' => tbs_blob_touch( 'orders' ) );
}

/** Goods arrived: add what came to stock and close the order, in one step. */
function tbs_rest_order_receive( WP_REST_Request $req ) {
	$in     = (array) $req->get_json_params();
	$orders = array_values( (array) tbs_kv_get( 'orders', array() ) );
	$idx    = null;
	foreach ( $orders as $i => $o ) {
		if ( $o['id'] === ( $in['id'] ?? '' ) ) {
			$idx = $i;
		}
	}
	if ( null === $idx ) {
		return tbs_err( 'ההזמנה לא נמצאה.', 404 );
	}
	if ( 'received' === $orders[ $idx ]['status'] ) {
		return tbs_err( 'ההזמנה הזו כבר התקבלה.' );
	}
	$got   = (array) ( $in['got'] ?? array() );
	$stock = json_decode( wp_json_encode( tbs_kv_get( 'stock', array() ) ), true );
	$stock = is_array( $stock ) ? $stock : array();
	$sb    = $stock;
	$lines = 0;
	foreach ( $orders[ $idx ]['items'] as $j => $it ) {
		$k = $it['group'] . ':' . $it['id'];
		$q = array_key_exists( $k, $got ) && is_numeric( $got[ $k ] ) ? max( 0, (float) $got[ $k ] ) : (float) $it['qty'];
		$orders[ $idx ]['items'][ $j ]['got'] = $q;
		if ( $q > 0 ) {
			$stock[ $it['group'] ]              = (array) ( $stock[ $it['group'] ] ?? array() );
			$stock[ $it['group'] ][ $it['id'] ] = round( (float) ( $stock[ $it['group'] ][ $it['id'] ] ?? 0 ) + $q, 3 );
			$lines++;
		}
	}
	$orders[ $idx ]['status']      = 'received';
	$orders[ $idx ]['received_at'] = current_time( 'mysql' );
	foreach ( array( 'boxes', 'accessories', 'ingredients' ) as $g ) {
		$stock[ $g ] = (object) ( $stock[ $g ] ?? array() );
	}
	tbs_kv_set( 'stock', $stock );
	tbs_kv_set( 'orders', $orders );
	$catalog = (array) tbs_kv_get( 'catalog', array() );
	$sup     = tbs_index_by_id( $catalog['suppliers'] ?? array() );
	tbs_log_add( array(
		'entity'  => 'orders',
		'title'   => 'רכש',
		'summary' => 'התקבלה הזמנה מס\' ' . $orders[ $idx ]['no'] . ( isset( $sup[ $orders[ $idx ]['supplier'] ] ) ? ' מ' . $sup[ $orders[ $idx ]['supplier'] ]['name'] : '' ) . ': ' . $lines . ' פריטים נכנסו למלאי',
	) );
	tbs_blob_touch( 'stock' );
	return array(
		'orders' => $orders,
		'stock'  => tbs_kv_get( 'stock' ),
		'revs'   => array( 'stock' => (int) tbs_blob_rev( 'stock' )['rev'], 'orders' => tbs_blob_touch( 'orders' ) ),
	);
}

/* ---------- packing and delivery days ---------- */

/**
 * Dates and "packed" / "delivered" marks. Open to the warehouse role too, which can't edit the rest of a client.
 * Works on the stored row, so it never overwrites a teammate's change to another point.
 */
function tbs_rest_schedule( WP_REST_Request $req ) {
	$client = tbs_client_get( (int) $req['id'] );
	if ( ! $client || $client['season'] !== tbs_season() || ! tbs_client_visible( $client ) ) {
		return tbs_err( 'הלקוח לא נמצא.', 404 );
	}
	$in    = (array) $req->get_json_params();
	$patch = array();
	foreach ( array( 'pack_date', 'delivery_date' ) as $f ) {
		if ( array_key_exists( $f, $in ) ) {
			$patch[ $f ] = $in[ $f ];
		}
	}
	if ( array_key_exists( 'packed', $in ) ) {
		$patch['packed_at'] = $in['packed'] ? current_time( 'mysql' ) : null;
	}
	if ( ! empty( $in['point'] ) ) {
		$pts = $client['points'];
		$hit = false;
		foreach ( $pts as $i => $p ) {
			if ( ( $p['id'] ?? '' ) !== $in['point'] ) {
				continue;
			}
			$hit = true;
			if ( array_key_exists( 'delivered', $in ) ) {
				$pts[ $i ]['delivered'] = (bool) $in['delivered'];
			}
			if ( array_key_exists( 'point_date', $in ) ) {
				$pts[ $i ]['date'] = (string) $in['point_date'];
			}
		}
		if ( ! $hit ) {
			return tbs_err( 'נקודת האספקה לא נמצאה. ייתכן שמישהו הסיר אותה.', 409 );
		}
		$patch['points'] = $pts;
	}
	$data = tbs_client_sanitize( $patch );
	if ( ! $data ) {
		return array( 'client' => $client );
	}
	tbs_client_update( $client['id'], $data );
	$after = tbs_client_get( $client['id'] );
	tbs_log_client_diff( $client, $after, array_keys( $data ) );
	return array( 'client' => $after );
}

/* ---------- history ---------- */

function tbs_rest_log( WP_REST_Request $req ) {
	$entity = sanitize_key( (string) $req->get_param( 'entity' ) );
	$id     = (int) $req->get_param( 'id' );
	if ( 'client' === $entity && $id ) {
		$c = tbs_client_get( $id );
		if ( ! $c || ! tbs_client_visible( $c ) ) {
			return tbs_err( 'הלקוח לא נמצא.', 404 );
		}
	} elseif ( ! tbs_can_edit( 'settings' ) ) {
		return tbs_err( 'אין לך הרשאה לפעולה הזו.', 403 );
	}
	return array( 'log' => tbs_log_list( $entity, $id, (int) ( $req->get_param( 'limit' ) ?: 60 ) ) );
}

function tbs_rest_log_undo( WP_REST_Request $req ) {
	global $wpdb;
	$row = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . tbs_table( 'log' ) . ' WHERE id = %d', (int) $req['id'] ), ARRAY_A );
	if ( ! $row || $row['season'] !== tbs_season() || (int) $row['undone'] || null === $row['before_v'] ) {
		return tbs_err( 'אי אפשר לבטל את השינוי הזה.' );
	}
	if ( tbs_season_locked() ) {
		return tbs_err( 'העונה הזו בארכיון ופתוחה לצפייה בלבד.', 403 );
	}
	$before = json_decode( $row['before_v'], true );
	switch ( $row['entity'] ) {
		case 'client':
			$c = tbs_client_get( (int) $row['entity_id'] );
			if ( ! $c || ! tbs_client_visible( $c ) || ! tbs_can_edit( 'clients' ) ) {
				return tbs_err( 'אין לך הרשאה לפעולה הזו.', 403 );
			}
			$patch = array( $row['field'] => $before );
			if ( 'steps' === $row['field'] ) {
				// Keep the form status in step with its checklist line.
				foreach ( (array) $before as $st ) {
					if ( 'form' === ( $st['key'] ?? '' ) ) {
						$patch['form_status'] = ! empty( $st['done'] ) ? 'received' : 'waiting';
					}
				}
			}
			tbs_client_update( $c['id'], tbs_client_sanitize( $patch ) );
			$after = tbs_client_get( $c['id'] );
			tbs_log_add( array(
				'entity'    => 'client',
				'entity_id' => $c['id'],
				'title'     => $after['name'],
				'field'     => $row['field'],
				'summary'   => 'בוטל: ' . $row['summary'],
				'before'    => $c[ $row['field'] ] ?? null,
				'after'     => $after[ $row['field'] ] ?? null,
				'rev'       => $after['rev'],
			) );
			break;
		case 'catalog':
		case 'stock':
		case 'orders':
			$area = 'catalog' === $row['entity'] ? 'settings' : ( 'stock' === $row['entity'] ? 'inventory' : 'purchase' );
			if ( ! tbs_can_edit( $area ) ) {
				return tbs_err( 'אין לך הרשאה לפעולה הזו.', 403 );
			}
			$cur = tbs_kv_get( $row['entity'] );
			tbs_kv_set( $row['entity'], $before );
			tbs_blob_touch( $row['entity'] );
			tbs_log_add( array( 'entity' => $row['entity'], 'title' => $row['title'], 'summary' => 'בוטל: ' . $row['summary'], 'before' => $cur, 'after' => $before ) );
			break;
		default:
			return tbs_err( 'אי אפשר לבטל את השינוי הזה.' );
	}
	$wpdb->update( tbs_table( 'log' ), array( 'undone' => 1 ), array( 'id' => (int) $row['id'] ) );
	return array( 'data' => tbs_rest_bootstrap() );
}

/* ---------- seasons ---------- */

function tbs_rest_season_create( WP_REST_Request $req ) {
	$in   = (array) $req->get_json_params();
	$name = sanitize_text_field( (string) ( $in['name'] ?? '' ) );
	if ( '' === $name ) {
		return tbs_err( 'צריך שם לעונה.' );
	}
	foreach ( tbs_seasons() as $s ) {
		if ( $s['name'] === $name ) {
			return tbs_err( 'כבר יש עונה בשם הזה.' );
		}
	}
	tbs_backup_create( 'before-season' );
	$id = tbs_season_create( $name, ! empty( $in['copy_catalog'] ) );
	tbs_log_add( array( 'entity' => 'season', 'title' => $name, 'summary' => 'נפתחה עונה חדשה: ' . $name ) );
	return array( 'season' => $id, 'data' => tbs_rest_bootstrap() );
}

function tbs_rest_season_update( WP_REST_Request $req ) {
	$in   = (array) $req->get_json_params();
	$list = tbs_seasons();
	$hit  = false;
	foreach ( $list as $i => $s ) {
		if ( $s['id'] !== $req['id'] ) {
			continue;
		}
		$hit = true;
		if ( isset( $in['archived'] ) ) {
			$list[ $i ]['archived'] = (bool) $in['archived'];
		}
		if ( ! empty( $in['active'] ) ) {
			$list[ $i ]['archived'] = false;
			update_option( 'tbs_active_season', $s['id'], false );
		}
	}
	if ( ! $hit ) {
		return tbs_err( 'העונה לא נמצאה.', 404 );
	}
	if ( isset( $in['archived'] ) && $in['archived'] && tbs_active_season() === $req['id'] ) {
		return tbs_err( 'אי אפשר להעביר לארכיון את העונה הפעילה. קודם בחרו עונה פעילה אחרת.' );
	}
	update_option( 'tbs_seasons', $list, false );
	tbs_bump_rev();
	return array( 'data' => tbs_rest_bootstrap() );
}

/* ---------- updates ---------- */

function tbs_rest_update_check() {
	return array( 'update' => tbs_update_status( true ) );
}

function tbs_rest_update_install() {
	$res = tbs_update_install();
	if ( is_wp_error( $res ) ) {
		$res->add_data( array( 'status' => 400 ) );
		return $res;
	}
	return array( 'installed' => $res );
}

function tbs_rest_texts_save( WP_REST_Request $req ) {
	$in    = (array) $req->get_json_params();
	$texts = wp_parse_args( (array) tbs_kv_get( 'texts', array() ), tbs_default_texts() );
	foreach ( array( 'reminder_days' => array( 1, 30 ), 'reminder_max' => array( 1, 5 ) ) as $k => $range ) {
		if ( isset( $in[ $k ] ) ) {
			$texts[ $k ] = max( $range[0], min( $range[1], (int) $in[ $k ] ) );
		}
	}
	foreach ( array( 'sig_on', 'sig_logos' ) as $k ) {
		if ( array_key_exists( $k, $in ) ) {
			$texts[ $k ] = ! empty( $in[ $k ] ) && 'false' !== $in[ $k ];
		}
	}
	if ( array_key_exists( 'auto_remind', $in ) ) {
		$texts['auto_remind'] = ! empty( $in['auto_remind'] ) && 'false' !== $in['auto_remind'];
	}
	foreach ( array( 'season', 'brand', 'email_subject', 'form_link_text', 'card_link_text', 'reminder_subject', 'sig_title', 'sig_phone' ) as $k ) {
		if ( isset( $in[ $k ] ) ) {
			$texts[ $k ] = sanitize_text_field( $in[ $k ] );
		}
	}
	foreach ( array( 'form_base', 'card_designer_url' ) as $k ) {
		if ( isset( $in[ $k ] ) ) {
			$texts[ $k ] = esc_url_raw( $in[ $k ] );
		}
	}
	foreach ( array( 'email_template', 'card_section', 'reminder_template' ) as $k ) {
		if ( isset( $in[ $k ] ) ) {
			$texts[ $k ] = sanitize_textarea_field( $in[ $k ] );
		}
	}
	foreach ( array( 'statuses', 'extras' ) as $k ) {
		if ( isset( $in[ $k ] ) ) {
			$texts[ $k ] = array_values( array_filter( array_map( 'sanitize_text_field', (array) $in[ $k ] ) ) );
		}
	}
	tbs_kv_set( 'texts', $texts );
	$list = tbs_seasons();
	foreach ( $list as $i => $s ) {
		if ( $s['id'] === tbs_season() && $s['name'] !== $texts['season'] && '' !== $texts['season'] ) {
			$list[ $i ]['name'] = $texts['season'];
			update_option( 'tbs_seasons', $list, false );
		}
	}
	tbs_bump_rev();
	return array( 'texts' => $texts, 'seasons' => $list );
}

function tbs_rest_app_settings_save( WP_REST_Request $req ) {
	$in = (array) $req->get_json_params();
	if ( isset( $in['google_client_id'] ) ) {
		update_option( 'tbs_google_client_id', sanitize_text_field( $in['google_client_id'] ), false );
	}
	if ( ! empty( $in['google_client_secret'] ) ) {
		update_option( 'tbs_google_client_secret', sanitize_text_field( $in['google_client_secret'] ), false );
	}
	if ( ! empty( $in['clear_google'] ) ) {
		update_option( 'tbs_google_client_id', '', false );
		update_option( 'tbs_google_client_secret', '', false );
	}
	if ( ! empty( $in['new_tally_key'] ) ) {
		update_option( 'tbs_tally_key', wp_generate_password( 32, false ), false );
	}
	if ( isset( $in['update_source'] ) ) {
		$src = trim( sanitize_text_field( (string) $in['update_source'] ) );
		if ( '' !== $src && ! preg_match( '#^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$#', $src ) && ! preg_match( '#^https://#i', $src ) ) {
			return tbs_err( 'מקור העדכונים צריך להיות owner/repo של GitHub או כתובת https של קובץ עדכון.' );
		}
		update_option( 'tbs_update_source', $src, false );
		delete_site_transient( 'tbs_update_info' );
		delete_site_transient( 'update_plugins' );
	}
	if ( ! empty( $in['clear_unmatched'] ) ) {
		tbs_kv_set( 'tally_unmatched', array() );
	}
	return tbs_rest_bootstrap();
}

/* ---------- staff ---------- */

function tbs_rest_staff_create( WP_REST_Request $req ) {
	global $wpdb;
	$in    = (array) $req->get_json_params();
	$email = strtolower( sanitize_email( $in['email'] ?? '' ) );
	$name  = sanitize_text_field( $in['name'] ?? '' );
	$role  = sanitize_key( $in['role'] ?? 'viewer' );
	if ( ! is_email( $email ) || '' === $name ) {
		return tbs_err( 'צריך שם וכתובת מייל תקינה.' );
	}
	if ( ! isset( tbs_roles()[ $role ] ) ) {
		$role = 'viewer';
	}
	if ( tbs_staff_by_email( $email ) ) {
		return tbs_err( 'המייל הזה כבר ברשימה.' );
	}
	$user = get_user_by( 'email', $email );
	$wpdb->insert( tbs_table( 'staff' ), array(
		'email'      => $email,
		'name'       => $name,
		'role'       => $role,
		'status'     => 'invited',
		'wp_user_id' => $user ? $user->ID : null,
		'created_at' => current_time( 'mysql' ),
	) );
	return tbs_rest_bootstrap();
}

function tbs_rest_staff_update( WP_REST_Request $req ) {
	global $wpdb;
	$s = tbs_staff_get( (int) $req['id'] );
	if ( ! $s ) {
		return tbs_err( 'המשתמש לא נמצא.', 404 );
	}
	$in   = (array) $req->get_json_params();
	$data = array();
	if ( isset( $in['name'] ) && '' !== trim( (string) $in['name'] ) ) {
		$data['name'] = sanitize_text_field( $in['name'] );
	}
	if ( isset( $in['role'] ) && isset( tbs_roles()[ $in['role'] ] ) ) {
		$me = tbs_me();
		if ( strtolower( $me['email'] ) === $s['email'] && 'admin' !== $in['role'] && ! $me['wp_admin'] ) {
			return tbs_err( 'אי אפשר להוריד לעצמך את הרשאת המנהל.' );
		}
		$data['role'] = $in['role'];
	}
	if ( $data ) {
		$wpdb->update( tbs_table( 'staff' ), $data, array( 'id' => (int) $s['id'] ) );
	}
	return tbs_rest_bootstrap();
}

function tbs_rest_staff_delete( WP_REST_Request $req ) {
	global $wpdb;
	$s = tbs_staff_get( (int) $req['id'] );
	if ( ! $s ) {
		return tbs_err( 'המשתמש לא נמצא.', 404 );
	}
	if ( strtolower( tbs_me()['email'] ) === $s['email'] ) {
		return tbs_err( 'אי אפשר להסיר את עצמך.' );
	}
	$wpdb->delete( tbs_table( 'staff' ), array( 'id' => (int) $s['id'] ), array( '%d' ) );
	return tbs_rest_bootstrap();
}

/* ---------- backups ---------- */

function tbs_rest_backup_download( WP_REST_Request $req ) {
	$path = tbs_backup_path( $req->get_param( 'file' ) );
	if ( ! $path ) {
		return tbs_err( 'הקובץ לא נמצא.', 404 );
	}
	nocache_headers();
	header( 'Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' );
	header( 'Content-Disposition: attachment; filename="' . basename( $path ) . '"' );
	header( 'Content-Length: ' . filesize( $path ) );
	header( 'X-Content-Type-Options: nosniff' );
	readfile( $path );
	exit;
}

function tbs_rest_backup_restore( WP_REST_Request $req ) {
	$files = $req->get_file_params();
	if ( ! empty( $files['file']['tmp_name'] ) ) {
		$f = $files['file'];
		if ( ! empty( $f['error'] ) || ! is_uploaded_file( $f['tmp_name'] ) ) {
			return tbs_err( 'ההעלאה נכשלה.' );
		}
		if ( ! preg_match( '/\.xlsx$/i', (string) $f['name'] ) ) {
			return tbs_err( 'אפשר להעלות רק קובץ ‎.xlsx‎ שהורד ממסך הגיבויים.' );
		}
		$path = $f['tmp_name'];
	} else {
		$path = tbs_backup_path( $req->get_param( 'file' ) );
		if ( ! $path ) {
			return tbs_err( 'הקובץ לא נמצא.', 404 );
		}
	}
	$res = tbs_backup_restore( $path );
	if ( is_wp_error( $res ) ) {
		$res->add_data( array( 'status' => 400 ) );
		return $res;
	}
	return array( 'restored' => $res, 'data' => tbs_rest_bootstrap() );
}

/* ---------- Tally webhook ---------- */

function tbs_tally_value( $field ) {
	$v = $field['value'] ?? null;
	if ( null === $v ) {
		return '';
	}
	if ( is_bool( $v ) ) {
		return $v ? 'כן' : 'לא';
	}
	if ( is_array( $v ) ) {
		$opts = array();
		foreach ( (array) ( $field['options'] ?? array() ) as $o ) {
			if ( isset( $o['id'] ) ) {
				$opts[ $o['id'] ] = $o['text'] ?? '';
			}
		}
		$parts = array();
		foreach ( $v as $item ) {
			if ( is_array( $item ) ) {
				$parts[] = $item['url'] ?? ( $item['name'] ?? wp_json_encode( $item, JSON_UNESCAPED_UNICODE ) );
			} else {
				$parts[] = $opts[ $item ] ?? (string) $item;
			}
		}
		return implode( ', ', $parts );
	}
	return (string) $v;
}

function tbs_rest_tally( WP_REST_Request $req ) {
	$key = (string) get_option( 'tbs_tally_key' );
	$ok  = '' !== $key && hash_equals( $key, (string) $req->get_param( 'key' ) );
	$sig = (string) $req->get_header( 'tally_signature' );
	if ( ! $ok && '' !== $sig && '' !== $key ) {
		$ok = hash_equals( base64_encode( hash_hmac( 'sha256', $req->get_body(), $key, true ) ), $sig );
	}
	if ( ! $ok ) {
		return tbs_err( 'forbidden', 403 );
	}

	$payload = (array) $req->get_json_params();
	$fields  = (array) ( $payload['data']['fields'] ?? array() );
	$name    = '';
	$answers = array();
	foreach ( $fields as $f ) {
		$label = trim( (string) ( $f['label'] ?? '' ) );
		$value = tbs_tally_value( $f );
		if ( 'HIDDEN_FIELDS' === ( $f['type'] ?? '' ) || in_array( $label, array( 'name', 'number_of_locals' ), true ) ) {
			if ( 'name' === $label ) {
				$name = trim( $value );
			}
			continue;
		}
		if ( '' === $label && '' === $value ) {
			continue;
		}
		$answers[] = array( 'label' => $label, 'value' => $value );
	}

	$match = null;
	if ( '' !== $name ) {
		foreach ( tbs_clients_all() as $c ) {
			if ( mb_strtolower( trim( $c['name'] ) ) === mb_strtolower( $name ) ) {
				$match = $c;
				break;
			}
		}
	}

	if ( ! $match ) {
		$list   = (array) tbs_kv_get( 'tally_unmatched', array() );
		$list[] = array(
			'name'    => $name,
			'at'      => current_time( 'mysql' ),
			'answers' => tbs_clean_answers( $answers ),
		);
		tbs_kv_set( 'tally_unmatched', array_slice( $list, -50 ) );
		return array( 'ok' => true, 'matched' => false );
	}

	$steps = $match['steps'];
	foreach ( $steps as &$s ) {
		if ( 'form' === ( $s['key'] ?? '' ) ) {
			$s['done'] = true;
		}
	}
	unset( $s );
	tbs_client_update( $match['id'], tbs_client_sanitize( array(
		'form_status'      => 'received',
		'form_received_at' => current_time( 'mysql' ),
		'form_answers'     => $answers,
		'steps'            => $steps,
	) ) );
	$fresh = tbs_client_get( $match['id'] );
	tbs_log_add( array(
		'user_name' => 'טופס Tally',
		'entity'    => 'client',
		'entity_id' => $match['id'],
		'title'     => $match['name'],
		'field'     => 'steps',
		'summary'   => 'הלקוח מילא את טופס האספקה',
		'before'    => $match['steps'],
		'after'     => $fresh['steps'],
		'rev'       => $fresh['rev'],
	) );
	return array( 'ok' => true, 'matched' => true );
}
