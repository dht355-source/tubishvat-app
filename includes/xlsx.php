<?php
/**
 * Minimal .xlsx writer and reader (no external libraries; needs PHP's ZipArchive).
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

function tbs_xlsx_col( $i ) {
	$s = '';
	$i++;
	while ( $i > 0 ) {
		$m = ( $i - 1 ) % 26;
		$s = chr( 65 + $m ) . $s;
		$i = intdiv( $i - $m, 26 );
	}
	return $s;
}

function tbs_xlsx_esc( $s ) {
	// Drop characters XML 1.0 does not allow.
	$s = preg_replace( '/[^\x{9}\x{A}\x{D}\x{20}-\x{D7FF}\x{E000}-\x{FFFD}\x{10000}-\x{10FFFF}]/u', '', (string) $s );
	return htmlspecialchars( (string) $s, ENT_QUOTES | ENT_XML1, 'UTF-8' );
}

/**
 * @param string $path   Output file.
 * @param array  $sheets List of [ 'name' => string, 'rows' => array[], 'hidden' => bool ].
 * @return true|WP_Error
 */
function tbs_xlsx_write( $path, $sheets ) {
	if ( ! class_exists( 'ZipArchive' ) ) {
		return new WP_Error( 'tbs_zip', 'בשרת חסר רכיב ZipArchive של PHP, ולכן אי אפשר ליצור קובץ Excel.' );
	}
	$zip = new ZipArchive();
	if ( true !== $zip->open( $path, ZipArchive::CREATE | ZipArchive::OVERWRITE ) ) {
		return new WP_Error( 'tbs_zip', 'לא הצלחתי ליצור את קובץ הגיבוי.' );
	}
	$ct_sheets = '';
	$wb_sheets = '';
	$rels      = '';
	foreach ( array_values( $sheets ) as $n => $sheet ) {
		$idx        = $n + 1;
		$ct_sheets .= '<Override PartName="/xl/worksheets/sheet' . $idx . '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
		$name       = mb_substr( preg_replace( '/[\[\]\*\?\/\\\\:]/u', ' ', $sheet['name'] ), 0, 31 );
		$wb_sheets .= '<sheet name="' . tbs_xlsx_esc( $name ) . '" sheetId="' . $idx . '"' . ( ! empty( $sheet['hidden'] ) ? ' state="hidden"' : '' ) . ' r:id="rId' . $idx . '"/>';
		$rels      .= '<Relationship Id="rId' . $idx . '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' . $idx . '.xml"/>';

		$xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
			. '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
			. '<sheetViews><sheetView workbookViewId="0"' . ( empty( $sheet['ltr'] ) ? ' rightToLeft="1"' : '' ) . '><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
			. '<sheetData>';
		foreach ( array_values( $sheet['rows'] ) as $r => $row ) {
			$xml .= '<row r="' . ( $r + 1 ) . '">';
			foreach ( array_values( $row ) as $c => $val ) {
				if ( null === $val || '' === $val ) {
					continue;
				}
				$ref   = tbs_xlsx_col( $c ) . ( $r + 1 );
				$style = 0 === $r ? ' s="1"' : '';
				if ( is_int( $val ) || is_float( $val ) ) {
					$xml .= '<c r="' . $ref . '"' . $style . '><v>' . $val . '</v></c>';
				} elseif ( is_bool( $val ) ) {
					$xml .= '<c r="' . $ref . '"' . $style . ' t="b"><v>' . ( $val ? 1 : 0 ) . '</v></c>';
				} else {
					$xml .= '<c r="' . $ref . '"' . $style . ' t="inlineStr"><is><t xml:space="preserve">' . tbs_xlsx_esc( $val ) . '</t></is></c>';
				}
			}
			$xml .= '</row>';
		}
		$xml .= '</sheetData></worksheet>';
		$zip->addFromString( 'xl/worksheets/sheet' . $idx . '.xml', $xml );
	}

	$zip->addFromString( '[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
		. '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
		. '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
		. '<Default Extension="xml" ContentType="application/xml"/>'
		. '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
		. '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
		. $ct_sheets . '</Types>' );
	$zip->addFromString( '_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
		. '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
		. '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
		. '</Relationships>' );
	$zip->addFromString( 'xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
		. '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
		. '<sheets>' . $wb_sheets . '</sheets></workbook>' );
	$zip->addFromString( 'xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
		. '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' . $rels
		. '<Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
		. '</Relationships>' );
	$zip->addFromString( 'xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
		. '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
		. '<fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><name val="Arial"/></font></fonts>'
		. '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
		. '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
		. '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
		. '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>'
		. '</styleSheet>' );
	$zip->close();
	return true;
}

/** Text of an <si> or <is> node, joining rich-text runs. */
function tbs_xlsx_text( $node ) {
	if ( isset( $node->t ) ) {
		return (string) $node->t;
	}
	$s = '';
	foreach ( $node->r as $run ) {
		$s .= (string) $run->t;
	}
	return $s;
}

/**
 * @return array|WP_Error [ sheet name => rows (each row: array col index => value) ]
 */
function tbs_xlsx_read( $path ) {
	if ( ! class_exists( 'ZipArchive' ) ) {
		return new WP_Error( 'tbs_zip', 'בשרת חסר רכיב ZipArchive של PHP.' );
	}
	$zip = new ZipArchive();
	if ( true !== $zip->open( $path ) ) {
		return new WP_Error( 'tbs_zip', 'הקובץ לא נפתח. ודאו שזה קובץ Excel (.xlsx).' );
	}
	$prev = libxml_use_internal_errors( true );
	$wb   = simplexml_load_string( (string) $zip->getFromName( 'xl/workbook.xml' ) );
	$rels = simplexml_load_string( (string) $zip->getFromName( 'xl/_rels/workbook.xml.rels' ) );
	if ( ! $wb || ! $rels ) {
		$zip->close();
		libxml_use_internal_errors( $prev );
		return new WP_Error( 'tbs_xlsx', 'הקובץ לא נראה כמו קובץ Excel תקין.' );
	}
	$targets = array();
	foreach ( $rels->Relationship as $rel ) {
		$targets[ (string) $rel['Id'] ] = ltrim( preg_replace( '#^/?xl/#', '', (string) $rel['Target'] ), '/' );
	}
	$shared = array();
	$ss_raw = $zip->getFromName( 'xl/sharedStrings.xml' );
	if ( $ss_raw ) {
		$ss = simplexml_load_string( $ss_raw );
		if ( $ss ) {
			foreach ( $ss->si as $si ) {
				$shared[] = tbs_xlsx_text( $si );
			}
		}
	}
	$out = array();
	foreach ( $wb->sheets->sheet as $sheet ) {
		$rid    = (string) $sheet->attributes( 'http://schemas.openxmlformats.org/officeDocument/2006/relationships' )['id'];
		$target = $targets[ $rid ] ?? '';
		$raw    = $target ? $zip->getFromName( 'xl/' . $target ) : false;
		$rows   = array();
		if ( $raw ) {
			$sx = simplexml_load_string( $raw );
			if ( $sx && isset( $sx->sheetData ) ) {
				foreach ( $sx->sheetData->row as $row ) {
					$cells = array();
					$auto  = 0;
					foreach ( $row->c as $c ) {
						$ref = (string) $c['r'];
						if ( preg_match( '/^([A-Z]+)/', $ref, $m ) ) {
							$col = 0;
							foreach ( str_split( $m[1] ) as $ch ) {
								$col = $col * 26 + ( ord( $ch ) - 64 );
							}
							$col--;
						} else {
							$col = $auto;
						}
						$auto = $col + 1;
						$t    = (string) $c['t'];
						if ( 's' === $t ) {
							$val = $shared[ (int) $c->v ] ?? '';
						} elseif ( 'inlineStr' === $t ) {
							$val = tbs_xlsx_text( $c->is );
						} elseif ( 'b' === $t ) {
							$val = '1' === (string) $c->v;
						} elseif ( 'str' === $t || 'e' === $t ) {
							$val = (string) $c->v;
						} else {
							$v   = (string) $c->v;
							$val = '' === $v ? '' : ( ctype_digit( ltrim( $v, '-' ) ) ? (int) $v : (float) $v );
						}
						$cells[ $col ] = $val;
					}
					$rows[ ( (int) $row['r'] ) - 1 ] = $cells;
				}
			}
		}
		$out[ (string) $sheet['name'] ] = $rows;
	}
	$zip->close();
	libxml_use_internal_errors( $prev );
	return $out;
}
