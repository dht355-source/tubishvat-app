<?php
/**
 * Starting data, taken from the design mockup (box recipes, stock, two clients).
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

function tbs_ensure_secrets() {
	if ( ! get_option( 'tbs_tally_key' ) ) {
		update_option( 'tbs_tally_key', wp_generate_password( 32, false ), false );
	}
}

function tbs_default_texts() {
	return array(
		'season'            => 'טו בשבט 2027',
		'brand'             => 'מור ולבונה',
		'form_base'         => 'https://tally.so/r/xVrQdG',
		'card_designer_url' => 'https://morvelevona.co.il/card-designer/',
		'email_subject'     => 'המארזים שלכם לטו בשבט',
		'email_template'    => "היי {contact},\n\nכאן {sender} ממור ולבונה.\nשמחים שבחרתם בנו לטו בשבט! אני אלווה אתכם מכאן ועד שהמארזים מגיעים אליכם, אז אם צריך משהו, אני הכתובת.\n\nכדי שנדע לאן לשלוח, אשמח שתמלאו טופס קצר עם פרטי האספקה:\n{form_link}\n{card_section}\nיש שאלה? משהו השתנה? כתבו לי, אני כאן.\n\nתודה, ושיהיה חג שמח!\n{sender}\nמור ולבונה",
		'card_section'      => "\nולגבי כרטיס הברכה שבחרתם, אפשר לעצב אותו לבד, בקלות, כאן:\n{card_designer_url}\nכשסיימתם, פשוט שלחו לי את הקובץ במייל חוזר.\n",
		'statuses'          => array( 'תחילת עבודה', 'בטיפול', 'מוכן לאספקה', 'סופק' ),
		'extras'            => array( 'כרטיסי ברכה', 'מארז ממותג' ),
		'form_link_text'    => 'למילוי טופס פרטי האספקה',
		'card_link_text'    => 'לעיצוב כרטיס הברכה',
		'reminder_subject'  => 'תזכורת: פרטי האספקה למארזים שלכם',
		'reminder_template' => "היי {contact},\n\nרק מזכירים בעדינות: כדי שנוכל לתאם את האספקה של המארזים, נשאר למלא טופס קצר עם פרטי האספקה:\n{form_link}\n\nאם כבר מילאתם, אפשר להתעלם מהמייל הזה. יש שאלה? אני כאן.\n\nתודה,\n{sender}\nמור ולבונה",
		'reminder_days'     => 3,
		'reminder_max'      => 2,
		'auto_remind'       => false,
		'sig_on'            => true,
		'sig_title'         => 'שירות לקוחות',
		'sig_phone'         => '08-6161301',
		'sig_logos'         => true,
	);
}

/** Product photos already on morvelevona.co.il, matched by catalog name. */
function tbs_catalog_images() {
	$u = 'https://morvelevona.co.il/wp-content/uploads/';
	return array(
		'boxes'       => array(
			'אלה' => $u . '2026/11/mvl-opt-p9301.webp',
			'ברוש' => $u . '2026/11/מארז-ברוש-א-הדמיית-רקע-לבן.webp',
			'מגש טו בשבט' => $u . '2026/11/mvl-opt-p9790.webp',
			'עומר' => $u . '2026/11/מארז-עומר-א-הדמיית-רקע-לבן.webp',
			'עמק' => $u . '2026/11/מארז-עמק-הדמיית-רקע-לבן.webp',
			'צור' => $u . '2025/11/מארז-צור-הדמיית-רקע-לבן.webp',
			'צור פלוס' => $u . '2026/11/tzur-plus.webp',
			'שורשים' => $u . '2026/11/מארז-שורשים-הדמיית-רקע-לבן.webp',
			'שיבולים' => $u . '2026/11/מארז-שיבולים-הדמיית-רקע-לבן.webp',
			'שקדיה' => $u . '2026/11/מארז-שקדיה-א-הדמיית-רקע-לבן.webp',
			'תמר (שקדיה מוזל)' => $u . '2026/11/tamar-box-poster.jpg',
			'קופסאות תמרים' => $u . '2026/11/majhool-big-box.webp',
			'נטע' => $u . '2026/11/neta-box-1.webp',
		),
		'ingredients' => array(
			"תמר מג'הול" => $u . '2026/11/mvl-opt-p9795.webp',
			'תות מיובש' => $u . '2026/11/mvl-opt-p9814.webp',
			'מנגו מיובש' => $u . '2026/11/mvl-opt-p9804.webp',
			'שזיף מגולען' => $u . '2026/11/mvl-opt-p9834.webp',
			'אננס טבעי' => $u . '2026/11/mvl-opt-p9810.webp',
			'משמש גודל 1' => $u . '2026/11/mvl-opt-p9808.webp',
			'משמש מיובש' => $u . '2026/11/mvl-opt-p9808.webp',
			'חמוציות ללא סוכר' => $u . '2026/11/mvl-opt-p9798.webp',
			'חמוציות מסוכרות' => $u . '2026/11/tbs-תמוציות-מסוכרות-1859.png',
			'תפוח מיובש' => $u . '2026/11/dried-apple.webp',
			'אננס טבעות' => $u . '2026/11/mvl-opt-p9811.webp',
			'גינגר מיובש' => $u . '2025/11/גינגר-מיובש.webp',
			'בננה ציפס' => $u . '2026/11/mvl-opt-p9800.webp',
			'קוקוס מיובש' => $u . '2026/11/mvl-opt-p9802.webp',
			'אגוז מלך' => $u . '2026/11/mvl-opt-p9796.webp',
			'גרנולה' => $u . '2026/11/mvl-opt-p9803.webp',
			'שקד טבעי' => $u . '2026/11/almond-natural.webp',
			'צימוק אדום גמבו' => $u . '2026/11/mvl-opt-p9806.webp',
			'קשיו קוקוס' => $u . '2026/11/mvl-opt-p9817.webp',
			'בוטן קלוי' => $u . '2026/11/mvl-opt-p9797.webp',
			'בוטן חלווה' => $u . '2026/11/mvl-opt-p9807.webp',
			'תערובת לסלט' => $u . '2026/11/mvl-opt-p9816.webp',
			'קשיו קלוי' => $u . '2026/11/mvl-opt-p9793.webp',
			'בוטן אמריקאי' => $u . '2026/11/mvl-opt-p9819.webp',
			'פקאן סיני' => $u . '2026/11/mvl-opt-p9805.webp',
			'אפונה קלויה' => $u . '2026/11/mvl-opt-p9812.webp',
			'מנצס' => $u . '2026/11/mvl-opt-p9801.webp',
			'מיאסי' => $u . '2026/11/mvl-opt-p9815.webp',
			'חטיף אורז' => $u . '2026/11/mvl-opt-p9818.webp',
			'רביולי' => $u . '2026/11/mvl-opt-p9813.webp',
			'מיקס משוקלדים טו בשבט' => $u . '2026/11/mvl-opt-p9943.webp',
			'שמן זית' => $u . '2026/11/mvl-opt-p9948.webp',
			'סילאן' => $u . '2026/11/mvl-opt-p9947.webp',
		),
	);
}

/** Fill in missing images by name. Never overwrites an image someone set. */
function tbs_apply_catalog_images( $catalog ) {
	$map = tbs_catalog_images();
	foreach ( array( 'boxes', 'ingredients' ) as $group ) {
		foreach ( (array) ( $catalog[ $group ] ?? array() ) as $i => $item ) {
			if ( empty( $item['image'] ) && isset( $map[ $group ][ $item['name'] ?? '' ] ) ) {
				$catalog[ $group ][ $i ]['image'] = $map[ $group ][ $item['name'] ];
			}
		}
	}
	return $catalog;
}

/** One-time data upgrades when the plugin's data version changes. */
function tbs_upgrade_data() {
	global $wpdb;
	$catalog = tbs_kv_get( 'catalog' );
	if ( is_array( $catalog ) ) {
		tbs_kv_set( 'catalog', tbs_apply_catalog_images( $catalog ) );
	}
	foreach ( tbs_clients_all() as $c ) {
		$patch = array();
		// Single-box orders become one order line.
		$raw = $wpdb->get_var( $wpdb->prepare( 'SELECT box_lines FROM ' . tbs_table( 'clients' ) . ' WHERE id = %d', $c['id'] ) );
		if ( null === $raw && $c['box_lines'] ) {
			$patch['box_lines'] = $c['box_lines'];
		}
		// Free-text extras become the two checkbox values; anything else is kept in the notes.
		$acc = trim( (string) $c['accessories'] );
		if ( '' !== $acc && ! preg_match( '/^(כרטיסי ברכה|מארז ממותג)(, (כרטיסי ברכה|מארז ממותג))?$/u', $acc ) ) {
			$extras = array();
			if ( preg_match( '/כרטיס/u', $acc ) ) {
				$extras[] = 'כרטיסי ברכה';
			}
			if ( preg_match( '/ממותג|מיתוג/u', $acc ) ) {
				$extras[] = 'מארז ממותג';
			}
			$patch['accessories'] = implode( ', ', $extras );
			if ( ! preg_match( '/^(כרטיס|כרטיסים|כרטיס ברכה|כרטיסי ברכה|מארז ממותג|ממותג)$/u', $acc ) ) {
				$patch['notes'] = trim( $c['notes'] . "\nמוצרים נלווים לפני העדכון: " . $acc );
			}
		}
		if ( $patch ) {
			tbs_client_update( $c['id'], tbs_client_sanitize( $patch ) );
		}
	}
}

function tbs_seed_catalog() {
	// Box names as in the design. ids are stable slugs.
	$box_names = array( 'אלה', 'ברוש', 'מגש טו בשבט', 'עומר', 'עמק', 'צור', 'שורשים', 'שיבולים', 'שקדיה', 'תמר (שקדיה מוזל)', 'קופסאות תמרים', 'נטע' );
	$boxes     = array();
	foreach ( $box_names as $i => $n ) {
		$boxes[] = array( 'id' => 'b' . ( $i + 1 ), 'name' => $n );
	}
	$bid = function ( $name ) use ( $boxes ) {
		foreach ( $boxes as $b ) {
			if ( $b['name'] === $name ) {
				return $b['id'];
			}
		}
		return null;
	};

	// Grams per box. Column order = first 10 boxes above.
	$cols = array( 'אלה', 'ברוש', 'מגש טו בשבט', 'עומר', 'עמק', 'צור', 'שורשים', 'שיבולים', 'שקדיה', 'תמר (שקדיה מוזל)' );
	$rows = array(
		array( '🌴', "תמר מג'הול", 'ק״ג', array( 150, 150, 100, 200, 150, 300, 300, 75, 100, 1000 ) ),
		array( '🍓', 'תות מיובש', 'ק״ג', array( null, null, null, 60, null, 150, null, null, null, null ) ),
		array( '🥭', 'מנגו מיובש', 'ק״ג', array( 110, 110, null, 50, 75, 110, 110, null, 70, null ) ),
		array( '🫐', 'שזיף מגולען', 'ק״ג', array( 140, 170, 80, 55, null, 170, 170, null, 100, null ) ),
		array( '🍍', 'אננס טבעי', 'ק״ג', array( null, 120, null, null, null, 70, 80, null, null, null ) ),
		array( '🍑', 'משמש גודל 1', 'ק״ג', array( 150, null, 70, 55, null, 170, 170, null, 100, null ) ),
		array( '🍒', 'חמוציות ללא סוכר', 'ק״ג', array( 100, 120, 50, 45, null, 120, 120, 75, 80, 1000 ) ),
		array( '🍎', 'תפוח מיובש', 'ק״ג', array( null, null, null, null, null, null, null, null, null, 1000 ) ),
		array( '🍍', 'אננס טבעות', 'ק״ג', array( 100, null, 50, null, null, null, null, null, null, 1000 ) ),
		array( '🫚', 'גינגר מיובש', 'ק״ג', array( null, null, null, null, null, null, null, null, null, null ) ),
		array( '🍌', 'בננה ציפס', 'ק״ג', array( 70, 90, null, 35, 100, 90, null, null, null, 1000 ) ),
		array( '🥥', 'קוקוס מיובש', 'ק״ג', array( 60, 90, null, 35, null, 80, 90, null, 40, 1000 ) ),
		array( '🌰', 'אגוז מלך', 'ק״ג', array( 70, 90, 40, 35, 100, 180, 180, 50, 40, 1000 ) ),
		array( '🥣', 'גרנולה', 'ק״ג', array( null, null, null, 35, null, null, null, null, null, null ) ),
		array( '🌰', 'שקד טבעי', 'ק״ג', array( null, null, null, null, null, null, null, null, 60, null ) ),
		array( '🍇', 'צימוק אדום גמבו', 'ק״ג', array( 130, 170, 70, 50, 160, 170, 170, null, 100, 1000 ) ),
		array( '🥜', 'פיסטוק קלוי', 'ק״ג', array( null, null, null, null, null, null, null, null, null, null ) ),
		array( '🥥', 'קשיו קוקוס', 'ק״ג', array( null, null, null, 40, null, null, null, null, null, null ) ),
		array( '🥜', 'בוטן קלוי', 'ק״ג', array( null, null, null, null, null, 130, null, null, null, null ) ),
		array( '🍯', 'בוטן בקרמל', 'ק״ג', array( null, null, null, null, null, null, null, null, null, null ) ),
		array( '🍯', 'בוטן חלווה', 'ק״ג', array( 100, 140, null, null, 50, 140, 140, null, null, null ) ),
		array( '🥗', 'תערובת לסלט', 'ק״ג', array( null, null, null, null, null, 140, null, null, null, null ) ),
		array( '🥜', 'קשיו קלוי', 'ק״ג', array( 100, 120, null, 40, 75, 120, 120, 60, 70, null ) ),
		array( '🥜', 'בוטן מטוגן', 'ק״ג', array( null, null, null, null, null, null, null, null, null, null ) ),
		array( '🥜', 'בוטן אמריקאי', 'ק״ג', array( 100, null, null, 55, null, null, null, null, 70, 1000 ) ),
		array( '🌰', 'פקאן סיני', 'ק״ג', array( null, null, null, 40, null, 130, null, 40, null, null ) ),
		array( '🥜', 'קבוקים', 'ק״ג', array( null, null, null, null, null, null, null, null, null, null ) ),
		array( '🫛', 'אפונה קלויה', 'ק״ג', array( null, null, null, null, null, null, null, null, null, 1000 ) ),
		array( '🍿', 'מנצס', 'ק״ג', array( null, null, null, null, null, null, null, null, 40, 1000 ) ),
		array( '🍘', 'מיאסי', 'ק״ג', array( null, null, null, null, null, null, null, null, null, 1000 ) ),
		array( '🍘', 'חטיף אורז', 'ק״ג', array( null, null, null, null, null, null, null, null, null, 1000 ) ),
		array( '🥟', 'רביולי', 'ק״ג', array( 80, 90, null, 35, null, 90, 90, null, 50, 1000 ) ),
		array( '🍒', 'חמוציות מסוכרות', 'ק״ג', array( null, null, null, null, null, null, null, null, null, null ) ),
		array( '🍊', 'רצועות הדרים בשוקולד', 'ק״ג', array( null, null, null, null, null, null, null, null, null, null ) ),
		array( '🌶️', 'חטיף סויה מתובל', 'ק״ג', array( null, null, null, null, null, null, null, null, null, null ) ),
		array( '🍯', 'בוטן מקורמל בציפוי שומשום', 'ק״ג', array( null, null, null, null, null, null, null, null, null, null ) ),
		array( '🌽', 'תירס קלוי', 'ק״ג', array( null, null, null, null, null, null, null, null, null, null ) ),
		array( '🍑', 'משמש מיובש', 'ק״ג', array( null, null, null, null, null, null, null, null, null, null ) ),
		array( '🥥', 'בוטן קוקוס', 'ק״ג', array( null, null, null, null, null, null, null, null, null, null ) ),
		array( '🌰', 'פקאן טבעי', 'ק״ג', array( null, null, null, null, null, null, null, null, null, null ) ),
		array( '🍫', 'מיקס משוקלדים טו בשבט', 'ק״ג', array( null, null, null, 55, 70, 170, 170, 70, 80, null ) ),
		array( '🫒', 'שמן זית', 'יחידות', array( null, null, null, null, null, null, null, null, null, null ) ),
		array( '🍯', 'דבש', 'יחידות', array( null, null, null, null, null, null, null, null, null, null ) ),
		array( '🫗', 'סילאן', 'יחידות', array( null, null, null, null, null, null, null, null, null, null ) ),
	);
	$ingredients = array();
	foreach ( $rows as $i => $r ) {
		$grams = array();
		foreach ( $cols as $ci => $cname ) {
			if ( null !== $r[3][ $ci ] ) {
				$grams[ $bid( $cname ) ] = $r[3][ $ci ];
			}
		}
		$ingredients[] = array(
			'id'    => 'i' . ( $i + 1 ),
			'emoji' => $r[0],
			'name'  => $r[1],
			'unit'  => $r[2],
			'grams' => (object) $grams,
		);
	}

	// Accessories (plastics) per box. Duplicate rows in the sheet were merged; the last
	// "מחולק נמוך" row is the small bags (5 per box), as the stock screen showed.
	$acc_cols = array( 'אלה', 'ברוש', 'מגש טו בשבט', 'עומר', 'עמק', 'שורשים', 'שיבולים', 'שקדיה' );
	$acc_rows = array(
		array( '🥣', 'רטבית', array( 5, 4, 4, 3, 4, 4, 4, 4 ) ),
		array( '🫙', 'מוברגת', array( 1, 4, 4, 3, 2, 2, 2, 2 ) ),
		array( '🍱', 'מחולק נמוך', array( 3, 4, 4, 4, 2, 2, 2, 2 ) ),
		array( '🥡', 'מחולק גבוה', array( 3, 4, 4, 5, 2, 2, 2, 2 ) ),
		array( '🧊', 'ריבועית 250', array( null, 4, 4, 4, 3, 3, 3, 3 ) ),
		array( '🧊', 'ריבועית 375', array( 5, 4, 4, 5, 4, 4, 4, 4 ) ),
		array( '🛍️', 'שקיות קטנות', array( 4, 4, 4, 5, 5, 5, 5, 5 ) ),
	);
	$accessories = array();
	foreach ( $acc_rows as $i => $r ) {
		$per = array();
		foreach ( $acc_cols as $ci => $cname ) {
			if ( null !== $r[2][ $ci ] ) {
				$per[ $bid( $cname ) ] = $r[2][ $ci ];
			}
		}
		$accessories[] = array(
			'id'    => 'a' . ( $i + 1 ),
			'emoji' => $r[0],
			'name'  => $r[1],
			'per'   => (object) $per,
		);
	}

	$box_stock = array(
		'עמק' => 7200, 'אלה' => 6900, 'עומר' => 8800, 'ברוש' => 5000, 'שורשים' => 4200,
		'צור' => 2300, 'שיבולים' => 5000, 'קופסאות תמרים' => 6500, 'נטע' => 0,
	);
	$stock = array( 'boxes' => array(), 'accessories' => (object) array(), 'ingredients' => (object) array() );
	foreach ( $box_stock as $n => $v ) {
		$stock['boxes'][ $bid( $n ) ] = $v;
	}
	$stock['boxes'] = (object) $stock['boxes'];

	return array(
		'catalog' => array(
			'boxes'       => $boxes,
			'ingredients' => $ingredients,
			'accessories' => $accessories,
		),
		'stock'   => $stock,
		'emek'    => $bid( 'עמק' ),
		'omer'    => $bid( 'עומר' ),
	);
}

function tbs_seed_if_empty() {
	if ( null !== tbs_kv_get( 'catalog' ) ) {
		return;
	}
	$seed = tbs_seed_catalog();
	tbs_kv_set( 'catalog', tbs_apply_catalog_images( $seed['catalog'] ) );
	tbs_kv_set( 'stock', $seed['stock'] );
	tbs_kv_set( 'texts', tbs_default_texts() );

	global $wpdb;
	if ( (int) $wpdb->get_var( 'SELECT COUNT(*) FROM ' . tbs_table( 'clients' ) ) > 0 ) {
		return;
	}
	tbs_client_insert(
		tbs_client_sanitize(
			array(
				'no'          => 1,
				'name'        => 'גאמידור',
				'contact'     => 'רויטל',
				'box'         => $seed['emek'],
				'accessories' => 'כרטיסי ברכה',
				'spots'       => 1,
				'qty'         => 88,
				'rep'         => 'כפיר',
				'close_date'  => '2026-11-16',
				'status'      => 'תחילת עבודה',
				'form_status' => 'received',
				'form_received_at' => '2026-11-16 00:00:00',
				'steps'       => array(
					array( 'key' => 'opening', 'label' => 'לשלוח מייל פתיחה', 'owner' => 'us', 'done' => false ),
					array( 'key' => 'form', 'label' => 'ממתין לטופס אספקה מהלקוח', 'owner' => 'client', 'done' => true ),
					array( 'key' => 'card', 'label' => 'ממתין לקובץ כרטיס ברכה מהלקוח', 'owner' => 'client', 'done' => false ),
					array( 'key' => 'delivery', 'label' => 'לתאם אספקה', 'owner' => 'us', 'done' => false ),
				),
				'points'      => array(
					array( 'city' => 'גדרה', 'region' => 'מרכז', 'qty' => 88, 'manual' => 'לא', 'forklift' => 'כן' ),
				),
			)
		)
	);
	tbs_client_insert(
		tbs_client_sanitize(
			array(
				'no'          => 2,
				'name'        => 'הוט מובייל',
				'box'         => $seed['omer'],
				'form_status' => 'waiting',
				'steps'       => array(
					array( 'key' => 'details', 'label' => 'להשלים פרטי הזמנה', 'owner' => 'us', 'done' => false ),
					array( 'key' => 'opening', 'label' => 'לשלוח מייל פתיחה', 'owner' => 'us', 'done' => false ),
					array( 'key' => 'form', 'label' => 'ממתין לטופס אספקה מהלקוח', 'owner' => 'client', 'done' => false ),
					array( 'key' => 'delivery', 'label' => 'לתאם אספקה', 'owner' => 'us', 'done' => false ),
				),
			)
		)
	);
}
