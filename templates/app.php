<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
$me    = tbs_me();
$texts = wp_parse_args( (array) tbs_kv_get( 'texts', array() ), tbs_default_texts() );
$cfg   = array(
	'rest'        => esc_url_raw( rest_url( 'tbs/v1/' ) ),
	'nonce'       => wp_create_nonce( 'wp_rest' ),
	'me'          => $me,
	'roles'       => tbs_roles(),
	'permissions' => tbs_permissions(),
	'logout'      => wp_nonce_url( home_url( '/app/auth/logout' ), 'tbs_logout' ),
	'wpAdmin'     => $me['wp_admin'] ? admin_url() : '',
	'brand'       => $texts['brand'],
	'season'      => $texts['season'],
	'logo'        => TBS_URL . 'assets/logo.webp',
	'art'         => TBS_URL . 'assets/art/',
	'mailImg'     => TBS_URL . 'assets/mail/',
	'gmailUrl'    => wp_nonce_url( home_url( '/app/auth/gmail' ), 'tbs_gmail' ),
);
?><!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title><?php echo esc_html( $texts['season'] ); ?> – ניהול</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Assistant:wght@400;500;600;700&amp;family=Rubik:wght@500;600;700;800&amp;display=swap">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..40,400..500,0..1,0&amp;icon_names=add,add_circle,add_location_alt,add_shopping_cart,admin_panel_settings,alternate_email,arrow_drop_down,arrow_drop_up,arrow_forward,assignment,assignment_turned_in,autorenew,backup,badge,bar_chart,calendar_month,call,category,celebration,check,check_circle,checklist,chevron_left,chevron_right,clear_all,close,cloud_done,cloud_download,contact_phone,content_copy,delete,difference,donut_large,download,draw,edit,edit_note,error,event,expand_less,expand_more,filter_list,flag,forest,forward_to_inbox,grid_view,groups,hard_drive,history,hourglass_top,hub,image,info,inventory_2,key,label,link,link_off,list_alt,local_florist,local_shipping,location_off,location_on,lock,login,logout,mail,manage_accounts,mark_email_read,notes,notifications_active,nutrition,package_2,pending_actions,person,person_add,person_remove,print,radio_button_unchecked,receipt_long,redeem,remove,restart_alt,scale,schedule,search,send,shield_person,shopping_cart,space_dashboard,stacks,storefront,subject,swap_horiz,sync,system_update_alt,table_rows,tag,takeout_dining,task_alt,today,tune,unarchive,undo,upload_file,visibility,warehouse,warning,web&amp;display=block">
<meta name="theme-color" content="#2A68A6">
<link rel="icon" type="image/webp" href="<?php echo esc_url( TBS_URL . 'assets/logo.webp' ); ?>">
<link rel="stylesheet" href="<?php echo esc_url( TBS_URL . 'assets/app.css?v=' . TBS_VERSION ); ?>">
</head>
<body class="tbs">
<div id="app" class="page"><div class="boot" role="status"><img src="<?php echo esc_url( TBS_URL . 'assets/logo.webp' ); ?>" alt="" width="72" height="72"><svg class="m3-progress" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="20"/></svg><span class="sr-only">טוען…</span></div></div>
<div id="toast" class="toast" role="status" aria-live="polite"></div>
<script>window.TBS_CFG = <?php echo wp_json_encode( $cfg, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP ); ?>;</script>
<script src="<?php echo esc_url( TBS_URL . 'assets/app.js?v=' . TBS_VERSION ); ?>"></script>
</body>
</html>
