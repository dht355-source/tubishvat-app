<?php
/**
 * Sending from the app: the opening email, reminders for the delivery form, and a test email.
 * Goes out through wp_mail(), so it uses whatever the site already sends with (WP Mail SMTP).
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

function tbs_mail_fill( $template, $vars, $is_html ) {
	$src = $is_html ? esc_html( (string) $template ) : (string) $template;
	return preg_replace_callback( '/\{(\w+)\}/', function ( $m ) use ( $vars ) {
		return array_key_exists( $m[1], $vars ) ? $vars[ $m[1] ] : $m[0];
	}, $src );
}

/**
 * The signature under every email: name, role, phone and the two logos.
 * Kept identical to mailSignature() in app.js.
 *
 * @return array { html, text }
 */
function tbs_mail_signature( $sender, $texts ) {
	if ( empty( $texts['sig_on'] ) ) {
		return array( 'html' => '', 'text' => '' );
	}
	$title = trim( (string) ( $texts['sig_title'] ?? '' ) );
	$phone = trim( (string) ( $texts['sig_phone'] ?? '' ) );
	$lines = array( '<strong>' . esc_html( $sender ) . '</strong>' );
	$plain = array( $sender );
	if ( '' !== $title ) {
		$lines[] = esc_html( $title );
		$plain[] = $title;
	}
	if ( '' !== $phone ) {
		$lines[] = 'טלפון: <span dir="ltr">' . esc_html( $phone ) . '</span>';
		$plain[] = 'טלפון: ' . $phone;
	}
	$html = '<div dir="rtl" style="margin-top:22px;font-family:Arial,sans-serif;font-size:14px;line-height:1.6;text-align:right;color:#222222">--<br>' . implode( '<br>', $lines );
	if ( ! empty( $texts['sig_logos'] ) ) {
		$base  = TBS_URL . 'assets/mail/';
		$brand = esc_attr( (string) ( $texts['brand'] ?? '' ) );
		$html .= '<table role="presentation" dir="rtl" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;border-collapse:collapse"><tr>' .
			'<td style="padding:0 0 0 18px"><img src="' . esc_url( $base . 'logo.png' ) . '" width="100" height="100" alt="' . $brand . '" style="display:block;border:0"></td>' .
			'<td style="padding:0"><img src="' . esc_url( $base . 'iso-9001.png' ) . '" width="100" height="100" alt="ISO 9001:2015" style="display:block;border:0"></td>' .
			'</tr></table>';
	}
	return array( 'html' => $html . '</div>', 'text' => "\n\n--\n" . implode( "\n", $plain ) );
}

function tbs_form_link( $client, $texts ) {
	$base = (string) ( $texts['form_base'] ?? '' );
	if ( '' === $base ) {
		return '';
	}
	return $base . ( false !== strpos( $base, '?' ) ? '&' : '?' ) . 'name=' . rawurlencode( $client['name'] ) . '&number_of_locals=' . ( (int) $client['spots'] ? (int) $client['spots'] : 1 );
}

/**
 * Same result as buildEmail() in app.js, so what is sent is what the screen shows.
 *
 * @param string $kind opening|reminder
 * @return array { subject, html, text }
 */
function tbs_mail_build( $client, $kind, $sender ) {
	$texts = wp_parse_args( (array) tbs_kv_get( 'texts', array() ), tbs_default_texts() );
	$form  = tbs_form_link( $client, $texts );
	$card  = (string) $texts['card_designer_url'];
	$link  = function ( $href, $label ) {
		return '' === $href ? '' : '<a href="' . esc_url( $href ) . '" style="color:#2A68A6;font-weight:bold;text-decoration:underline">' . esc_html( $label ) . '</a>';
	};
	$text = array(
		'contact'           => '' !== trim( (string) $client['contact'] ) ? $client['contact'] : 'שלום',
		'client'            => $client['name'],
		'sender'            => $sender,
		'form_link'         => $form,
		'card_designer_url' => $card,
	);
	$html = array(
		'contact'           => esc_html( $text['contact'] ),
		'client'            => esc_html( $text['client'] ),
		'sender'            => esc_html( $text['sender'] ),
		'form_link'         => $link( $form, $texts['form_link_text'] ? $texts['form_link_text'] : 'למילוי טופס פרטי האספקה' ),
		'card_designer_url' => $link( $card, $texts['card_link_text'] ? $texts['card_link_text'] : 'לעיצוב כרטיס הברכה' ),
	);
	$wants_card           = false !== mb_strpos( (string) $client['accessories'], 'כרטיס' );
	$text['card_section'] = $wants_card ? tbs_mail_fill( $texts['card_section'], $text, false ) : '';
	$html['card_section'] = $wants_card ? tbs_mail_fill( $texts['card_section'], $html, true ) : '';

	$subject  = 'reminder' === $kind ? $texts['reminder_subject'] : $texts['email_subject'];
	$template = 'reminder' === $kind ? $texts['reminder_template'] : $texts['email_template'];
	$sig      = tbs_mail_signature( $sender, $texts );
	if ( '' !== $sig['html'] ) {
		// The signature already carries the name: drop a closing "{sender}" line (and the brand line under it).
		$template = preg_replace( '/\n[ \t]*\{sender\}[ \t]*(\n[ \t]*' . preg_quote( trim( (string) $texts['brand'] ), '/' ) . '[ \t]*)?\s*$/u', '', (string) $template );
	}
	return array(
		'subject' => tbs_mail_fill( $subject, $text, false ),
		'text'    => tbs_mail_fill( $template, $text, false ) . $sig['text'],
		'html'    => '<div dir="rtl" style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;text-align:right">' . nl2br( tbs_mail_fill( $template, $html, true ), false ) . $sig['html'] . '</div>',
	);
}

function tbs_client_set_mail( $client_id, $mail ) {
	global $wpdb;
	$wpdb->update( tbs_table( 'clients' ), array( 'mail' => wp_json_encode( $mail, JSON_UNESCAPED_UNICODE ) ), array( 'id' => (int) $client_id ) );
}

/**
 * @param string     $kind   opening|reminder|test
 * @param array|null $sender { name, email } – null means the signed-in person.
 * @return array|WP_Error The fresh client.
 */
function tbs_mail_send( $client, $kind, $sender = null, $auto = false ) {
	if ( null === $sender ) {
		$me     = tbs_me();
		$sender = array( 'name' => $me['name'], 'email' => $me['email'], 'user' => get_current_user_id() );
	}
	// Send from the person's own Gmail when they connected it; otherwise through the site.
	$uid   = (int) ( $sender['user'] ?? 0 );
	$gmail = $uid && tbs_google_configured() ? tbs_gmail_get( $uid ) : null;
	$to = 'test' === $kind ? ( $gmail ? $gmail['email'] : $sender['email'] ) : (string) $client['contact_email'];
	if ( ! is_email( $to ) ) {
		return new WP_Error( 'tbs_mail', 'test' === $kind ? 'אין לך כתובת מייל במערכת.' : 'ללקוח אין כתובת מייל תקינה. מוסיפים אותה בפרטי ההזמנה.' );
	}
	$texts = wp_parse_args( (array) tbs_kv_get( 'texts', array() ), tbs_default_texts() );
	$msg   = tbs_mail_build( $client, 'reminder' === $kind ? 'reminder' : 'opening', $sender['name'] );
	if ( '' === trim( $msg['text'] ) ) {
		return new WP_Error( 'tbs_mail', 'נוסח המייל ריק. מעדכנים אותו בהגדרות, בלשונית "מייל ונוסחים".' );
	}

	$headers = array( 'Content-Type: text/html; charset=UTF-8' );
	if ( is_email( $sender['email'] ) ) {
		$headers[] = 'Reply-To: ' . str_replace( array( "\r", "\n", '<', '>', '"' ), '', $sender['name'] ) . ' <' . $sender['email'] . '>';
		if ( 'test' !== $kind ) {
			$headers[] = 'Bcc: ' . $sender['email']; // the sender keeps a copy in their own inbox
		}
	}
	$from_name = function () use ( $sender, $texts ) {
		return trim( $sender['name'] . ' · ' . $texts['brand'] );
	};
	$error  = '';
	$failed = function ( $e ) use ( &$error ) {
		$error = is_wp_error( $e ) ? $e->get_error_message() : '';
	};
	$subject = ( 'test' === $kind ? '[בדיקה] ' : '' ) . $msg['subject'];
	$via     = 'site';
	$ok      = false;
	if ( $gmail ) {
		$sent = tbs_gmail_send( $uid, $sender['name'], $to, $subject, $msg['html'] );
		if ( true === $sent ) {
			$ok  = true;
			$via = 'gmail';
		} elseif ( ! $auto ) {
			return $sent; // tell the person exactly what Gmail said; never switch address behind their back
		}
		// An automatic reminder still goes out, through the site.
	}
	if ( ! $ok ) {
		add_filter( 'wp_mail_from_name', $from_name, 99 );
		add_action( 'wp_mail_failed', $failed );
		$ok = wp_mail( $to, $subject, $msg['html'], $headers );
		remove_filter( 'wp_mail_from_name', $from_name, 99 );
		remove_action( 'wp_mail_failed', $failed );
	}
	if ( ! $ok ) {
		return new WP_Error( 'tbs_mail', 'המייל לא נשלח' . ( '' !== $error ? ': ' . $error : '. בודקים את הגדרות המייל של האתר (WP Mail SMTP).' ) );
	}
	if ( 'test' === $kind ) {
		return $client;
	}
	$from = 'gmail' === $via ? $gmail['email'] : '';

	$mail = is_array( $client['mail'] ?? null ) ? $client['mail'] : array();
	$now  = current_time( 'mysql' );
	if ( 'opening' === $kind ) {
		$mail['sent_at']  = $now;
		$mail['to']       = $to;
		$mail['by_name']  = $sender['name'];
		$mail['by_email'] = $sender['email'];
		$mail['by_user']  = $uid;
		$mail['via']      = $via;
		$mail['from']     = $from;
		$mail['reminders'] = array();
		$steps = $client['steps'];
		foreach ( $steps as $i => $s ) {
			if ( 'opening' === ( $s['key'] ?? '' ) ) {
				$steps[ $i ]['done'] = true;
			}
		}
		tbs_client_update( $client['id'], tbs_client_sanitize( array( 'steps' => $steps ) ) );
	} else {
		$mail['reminders']   = array_values( (array) ( $mail['reminders'] ?? array() ) );
		$mail['reminders'][] = array( 'at' => $now, 'auto' => (bool) $auto, 'to' => $to, 'via' => $via );
		if ( empty( $mail['by_email'] ) ) {
			$mail['by_name']  = $sender['name'];
			$mail['by_email'] = $sender['email'];
			$mail['by_user']  = $uid;
		}
	}
	tbs_client_set_mail( $client['id'], $mail );
	tbs_bump_rev();
	$after = tbs_client_get( $client['id'] );
	tbs_log_add( array(
		'user_name' => $auto ? 'תזכורת אוטומטית' : $sender['name'],
		'entity'    => 'client',
		'entity_id' => $client['id'],
		'title'     => $client['name'],
		'summary'   => ( 'opening' === $kind ? 'מייל הפתיחה נשלח אל ' : 'נשלחה תזכורת לטופס האספקה אל ' ) . $to . ( 'gmail' === $via ? ' (מ-Gmail: ' . $from . ')' : ' (דרך האתר)' ),
		'rev'       => $after['rev'],
	) );
	return $after;
}

/** Is this client due for a reminder? Returns the reason it is not, or '' when it is. */
function tbs_reminder_block( $client, $texts ) {
	$mail = is_array( $client['mail'] ?? null ) ? $client['mail'] : array();
	if ( 'received' === $client['form_status'] ) {
		return 'הטופס כבר התקבל';
	}
	if ( empty( $mail['sent_at'] ) ) {
		return 'מייל הפתיחה עוד לא נשלח מהמערכת';
	}
	if ( ! is_email( (string) $client['contact_email'] ) ) {
		return 'אין כתובת מייל';
	}
	$rem = (array) ( $mail['reminders'] ?? array() );
	if ( count( $rem ) >= max( 1, (int) $texts['reminder_max'] ) ) {
		return 'נשלחו כבר כל התזכורות';
	}
	$last = $rem ? end( $rem )['at'] : $mail['sent_at'];
	$days = ( strtotime( current_time( 'Y-m-d' ) ) - strtotime( substr( (string) $last, 0, 10 ) ) ) / DAY_IN_SECONDS;
	if ( $days < max( 1, (int) $texts['reminder_days'] ) ) {
		return 'עוד לא עבר מספיק זמן';
	}
	return '';
}

/** Every morning: remind clients of the active season who still owe the delivery form. Off unless turned on in settings. */
function tbs_send_due_reminders() {
	$texts = wp_parse_args( (array) tbs_kv_get( 'texts', array() ), tbs_default_texts() );
	if ( empty( $texts['auto_remind'] ) || tbs_season_locked() ) {
		return 0;
	}
	if ( in_array( (int) wp_date( 'w' ), array( 5, 6 ), true ) ) {
		return 0; // not on Friday or Shabbat
	}
	$sent = 0;
	foreach ( tbs_clients_all() as $c ) {
		if ( '' !== tbs_reminder_block( $c, $texts ) ) {
			continue;
		}
		$res = tbs_mail_send( $c, 'reminder', array( 'name' => $c['mail']['by_name'], 'email' => $c['mail']['by_email'], 'user' => (int) ( $c['mail']['by_user'] ?? 0 ) ), true );
		if ( ! is_wp_error( $res ) ) {
			$sent++;
		}
		if ( $sent >= 40 ) {
			break; // the rest go tomorrow
		}
	}
	return $sent;
}
add_action( 'tbs_daily_reminders', 'tbs_send_due_reminders' );

function tbs_schedule_reminders() {
	if ( wp_next_scheduled( 'tbs_daily_reminders' ) ) {
		return;
	}
	$next = new DateTime( 'today 09:00', wp_timezone() );
	if ( $next->getTimestamp() <= time() ) {
		$next->modify( '+1 day' );
	}
	wp_schedule_event( $next->getTimestamp(), 'daily', 'tbs_daily_reminders' );
}
add_action( 'init', 'tbs_schedule_reminders' );

function tbs_rest_client_send( WP_REST_Request $req ) {
	$client = tbs_client_get( (int) $req['id'] );
	if ( ! $client || $client['season'] !== tbs_season() || ! tbs_client_visible( $client ) ) {
		return tbs_err( 'הלקוח לא נמצא.', 404 );
	}
	$in   = (array) $req->get_json_params();
	$kind = in_array( $in['kind'] ?? '', array( 'opening', 'reminder', 'test' ), true ) ? $in['kind'] : 'opening';
	if ( 'reminder' === $kind && 'received' === $client['form_status'] ) {
		return tbs_err( 'הטופס כבר התקבל, אין צורך בתזכורת.' );
	}
	$res = tbs_mail_send( $client, $kind );
	if ( is_wp_error( $res ) ) {
		$res->add_data( array( 'status' => 400, 'gmail' => tbs_gmail_status() ) );
		return $res;
	}
	$g = tbs_gmail_status();
	return array( 'client' => $res, 'to' => 'test' === $kind ? ( $g['connected'] ? $g['email'] : tbs_me()['email'] ) : $client['contact_email'], 'gmail' => $g );
}
