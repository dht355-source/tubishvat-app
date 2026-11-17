<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
$texts     = wp_parse_args( (array) tbs_kv_get( 'texts', array() ), tbs_default_texts() );
$signin    = isset( $_GET['signin'] ) ? sanitize_key( wp_unslash( $_GET['signin'] ) ) : '';
$logged_in = is_user_logged_in();
if ( $logged_in ) {
	$signin = 'denied';
}
$messages = array(
	'denied'    => array( 'החשבון הזה עדיין לא מורשה', 'כדי להיכנס צריך שמנהל המערכת יזמין את כתובת המייל שלכם במסך המשתמשים.' ),
	'expired'   => array( 'הכניסה לא הושלמה', 'עבר יותר מדי זמן או שהדפדפן חסם עוגיות. נסו שוב.' ),
	'cancelled' => array( 'הכניסה בוטלה', 'אפשר לנסות שוב בכל רגע.' ),
	'google'    => array( 'Google לא אישר את הכניסה', 'נסו שוב. אם זה חוזר, בדקו את פרטי Google בהגדרות המערכת.' ),
);
?><!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>כניסה – <?php echo esc_html( $texts['season'] ); ?></title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Assistant:wght@400;500;600;700&amp;family=Rubik:wght@500;600;700;800&amp;display=swap">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..40,400..500,0..1,0&amp;icon_names=add,add_circle,add_location_alt,add_shopping_cart,admin_panel_settings,alternate_email,arrow_drop_down,arrow_drop_up,arrow_forward,assignment,assignment_turned_in,autorenew,backup,badge,bar_chart,calendar_month,call,category,celebration,check,check_circle,checklist,chevron_left,chevron_right,clear_all,close,cloud_done,cloud_download,contact_phone,content_copy,delete,difference,donut_large,download,draw,edit,edit_note,error,event,expand_less,expand_more,filter_list,flag,forest,forward_to_inbox,grid_view,groups,hard_drive,history,hourglass_top,hub,image,info,inventory_2,key,label,link,link_off,list_alt,local_florist,local_shipping,location_off,location_on,lock,login,logout,mail,manage_accounts,mark_email_read,notes,notifications_active,nutrition,package_2,pending_actions,person,person_add,person_remove,print,radio_button_unchecked,receipt_long,redeem,remove,restart_alt,scale,schedule,search,send,shield_person,shopping_cart,space_dashboard,stacks,storefront,subject,swap_horiz,sync,system_update_alt,table_rows,tag,takeout_dining,task_alt,today,tune,unarchive,undo,upload_file,visibility,warehouse,warning,web&amp;display=block">
<meta name="theme-color" content="#2A68A6">
<link rel="icon" type="image/webp" href="<?php echo esc_url( TBS_URL . 'assets/logo.webp' ); ?>">
<link rel="stylesheet" href="<?php echo esc_url( TBS_URL . 'assets/app.css?v=' . TBS_VERSION ); ?>">
</head>
<body class="tbs">
<div class="signin-page">
	<section class="signin-hero" aria-hidden="true">
		<?php echo tbs_shape_svg( 'cookie9', 's1' ); ?>
		<?php echo tbs_shape_svg( 'flower', 's2' ); ?>
		<?php echo tbs_shape_svg( 'gem', 's3' ); ?>
		<img class="signin-dancer" src="<?php echo esc_url( TBS_URL . 'assets/art/dancer.webp' ); ?>" alt="" width="300" height="426">
		<img class="signin-berry" src="<?php echo esc_url( TBS_URL . 'assets/art/strawberry.webp' ); ?>" alt="" width="96" height="129">
		<img class="signin-wheat" src="<?php echo esc_url( TBS_URL . 'assets/art/leaf.webp' ); ?>" alt="" width="40" height="172">
		<div class="signin-brand"><img class="brand-logo" src="<?php echo esc_url( TBS_URL . 'assets/logo.webp' ); ?>" alt="" width="64" height="64"><?php echo esc_html( $texts['brand'] ); ?></div>
		<p class="signin-title"><?php echo esc_html( $texts['season'] ); ?></p>
	</section>
	<main class="signin-main">
		<div class="signin-card">
			<div class="stack-6">
				<span class="eyebrow">מערכת פנימית</span>
				<h1 class="h1">כניסה</h1>
				<p class="lead">ניהול הזמנות, מלאי ואספקה ל<?php echo esc_html( $texts['season'] ); ?></p>
			</div>
			<?php if ( isset( $messages[ $signin ] ) ) : ?>
				<div class="alert alert-error" role="alert">
					<span class="ms fill" aria-hidden="true">error</span>
					<div>
						<strong><?php echo esc_html( $messages[ $signin ][0] ); ?></strong>
						<span><?php echo esc_html( $messages[ $signin ][1] ); ?></span>
					</div>
				</div>
			<?php endif; ?>

			<?php if ( $logged_in ) : ?>
				<p class="p0">מחוברים כרגע בתור <strong dir="ltr"><?php echo esc_html( wp_get_current_user()->user_email ); ?></strong>.</p>
				<a class="btn btn-secondary btn-lg" href="<?php echo esc_url( wp_nonce_url( home_url( '/app/auth/logout' ), 'tbs_logout' ) ); ?>"><span class="ms" aria-hidden="true">logout</span>יציאה וכניסה עם חשבון אחר</a>
			<?php else : ?>
				<?php if ( tbs_google_configured() ) : ?>
					<a class="btn btn-lg btn-google" href="<?php echo esc_url( home_url( '/app/auth/google' ) ); ?>">
						<svg aria-hidden="true" width="20" height="20" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
						כניסה עם Google
					</a>
					<p class="p0 muted small">הכניסה מותרת רק לחשבונות שהוזמנו. אין סיסמה נפרדת למערכת.</p>
					<div class="or">או</div>
					<a class="btn btn-ghost" style="align-self:flex-start" href="<?php echo esc_url( wp_login_url( home_url( '/app/' ) ) ); ?>"><span class="ms" aria-hidden="true">login</span>כניסה עם חשבון האתר (למנהלי האתר)</a>
				<?php else : ?>
					<a class="btn btn-primary btn-lg" href="<?php echo esc_url( wp_login_url( home_url( '/app/' ) ) ); ?>"><span class="ms" aria-hidden="true">login</span>כניסה עם חשבון האתר</a>
					<p class="p0 muted small">כניסה עם Google תופעל אחרי שיוזנו פרטי Google במסך ההגדרות.</p>
				<?php endif; ?>
			<?php endif; ?>
		</div>
	</main>
</div>
</body>
</html>
