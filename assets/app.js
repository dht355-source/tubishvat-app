/* טו בשבט – אפליקציית ניהול. Plain JS, no build step. */
(function () {
	'use strict';

	var CFG = window.TBS_CFG || {};
	var $app = document.getElementById('app');
	var S = {
		data: null,
		route: { name: 'clients' },
		ui: {
			search: '',
			settingsTab: 'recipes',
			backups: null,
			showUnneeded: false,
			invite: { name: '', email: '', role: 'sales' },
			newStep: '',
			newIng: '',
			newAcc: '',
			google: { id: null, secret: '' }
		}
	};

	/* ---------------- utils ---------------- */

	function esc(s) {
		return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
			return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
		});
	}
	function fmt(n, digits) {
		if (n === null || n === undefined || n === '' || isNaN(n)) return '';
		return Number(n).toLocaleString('en-US', { maximumFractionDigits: digits == null ? 2 : digits });
	}
	function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
	function uid(p) { return p + Math.random().toString(36).slice(2, 9); }
	function numOrNull(v) {
		if (v === '' || v === null || v === undefined) return null;
		var n = Number(String(v).replace(',', '.'));
		return isNaN(n) ? null : n;
	}
	function date(d) {
		if (!d) return '';
		var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
		return m ? m[3] + '.' + m[2] + '.' + m[1].slice(2) : d;
	}
	function level(area) {
		var me = S.data ? S.data.me : CFG.me;
		var p = (CFG.permissions || {})[area] || {};
		return (me && p[me.role]) || 'none';
	}
	function canView(area) { return level(area) !== 'none'; }
	function canEdit(area) {
		if (S.data && S.data.locked && (area === 'clients' || area === 'inventory' || area === 'purchase' || area === 'catalog')) return false;
		return level(area === 'catalog' ? 'settings' : area) === 'edit';
	}
	function pickedSeason() { try { return localStorage.getItem('tbs-season') || ''; } catch (e) { return ''; } }
	function pickSeason(id) { try { if (id) localStorage.setItem('tbs-season', id); else localStorage.removeItem('tbs-season'); } catch (e) { /* private mode */ } }
	function attrs(o) {
		var s = '';
		Object.keys(o).forEach(function (k) {
			var v = o[k];
			if (v === false || v === null || v === undefined) return;
			s += ' ' + k + (v === true ? '' : '="' + esc(v) + '"');
		});
		return s;
	}

	/** Material Symbol. cls: '', 'sm', 'fill', 'lg' … */
	function ic(name, cls) {
		return '<span class="ms' + (cls ? ' ' + cls : '') + '" aria-hidden="true">' + name + '</span>';
	}

	/* M3 Expressive shapes, generated as real SVG paths (polar modulation), not CSS corner hacks. */
	var SHAPES = {
		cookie9: { n: 9, a: 0.075 },
		cookie12: { n: 12, a: 0.05 },
		cookie4: { n: 4, a: 0.12 },
		flower: { n: 8, a: 0.13 },
		clover: { n: 4, a: 0.24 },
		gem: { n: 5, a: 0.07 },
		sunny: { n: 8, a: 0.035 }
	};
	var shapeCache = {};
	function shapePath(kind) {
		if (shapeCache[kind]) return shapeCache[kind];
		var s = SHAPES[kind] || SHAPES.cookie9;
		var pts = [], N = 240, i, th, r, maxR = 1 + s.a;
		for (i = 0; i < N; i++) {
			th = (i / N) * Math.PI * 2;
			r = (1 + s.a * Math.cos(s.n * th)) / maxR;
			pts.push((50 + 50 * r * Math.cos(th - Math.PI / 2)).toFixed(2) + ' ' + (50 + 50 * r * Math.sin(th - Math.PI / 2)).toFixed(2));
		}
		shapeCache[kind] = 'M' + pts.join('L') + 'Z';
		return shapeCache[kind];
	}
	function shape(kind, cls) {
		return '<svg class="shape' + (cls ? ' ' + cls : '') + '" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><path d="' + shapePath(kind) + '"/></svg>';
	}
	function avatar(name, alt) {
		var kinds = ['cookie9', 'flower', 'gem', 'cookie4', 'clover', 'sunny'];
		var h = 0, s = String(name || '?');
		for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
		return '<span class="avatar' + (alt ? ' alt' : '') + '">' + shape(kinds[h % kinds.length]) + '<span>' + esc(s.trim().charAt(0) || '?') + '</span></span>';
	}
	function sectionTitle(id, icon, text) {
		return '<h2 class="h2" id="' + id + '">' + ic(icon) + esc(text) + '</h2>';
	}
	/** Table column header with a symbol. */
	function th(text, icon, extra) {
		return '<th scope="col"' + (extra || '') + '><span class="th-in">' + (icon ? ic(icon, 'sm') : '') + '<span>' + text + '</span></span></th>';
	}
	function emptyRow(cols, text, kind) {
		return '<tr><td colspan="' + cols + '" class="empty">' + shape(kind || 'cookie9') + esc(text) + '</td></tr>';
	}

	var timers = {};
	var pendingSaves = {};
	function debounce(key, fn, ms) {
		clearTimeout(timers[key]);
		pendingSaves[key] = true;
		timers[key] = setTimeout(function () { delete pendingSaves[key]; fn(); }, ms || 500);
	}

	function toast(msg, isErr) {
		var t = document.getElementById('toast');
		if (!t) return;
		t.innerHTML = ic(isErr ? 'error' : 'check_circle', 'fill') + '<span>' + esc(msg) + '</span>';
		t.className = 'toast show' + (isErr ? ' err' : '');
		clearTimeout(timers._toast);
		timers._toast = setTimeout(function () { t.className = 'toast'; }, isErr ? 5000 : 1800);
	}

	/* ---------- M3 dialogs (replace window.prompt / window.confirm) ----------
	 * ask({ title, text, icon, confirm, danger, input: { label, value, placeholder, ltr, required } })
	 * resolves to the typed text (input dialogs), true (confirm dialogs) or null when cancelled.
	 */
	function ask(o) {
		return new Promise(function (resolve) {
			var d = document.createElement('dialog');
			d.className = 'm3-dialog' + (o.danger ? ' is-danger' : '');
			d.setAttribute('dir', 'rtl');
			d.setAttribute('aria-labelledby', 'dlg-h');
			var inp = o.input;
			d.innerHTML = '<form method="dialog" class="dlg-form">' +
				(o.icon ? '<span class="dlg-icon">' + ic(o.icon) + '</span>' : '') +
				'<h2 class="dlg-title" id="dlg-h">' + esc(o.title) + '</h2>' +
				(o.text ? '<p class="dlg-text">' + esc(o.text) + '</p>' : '') +
				(inp ? '<div class="field tf' + (inp.placeholder ? ' tf-float' : '') + '"><input id="dlg-in" class="input' + (inp.ltr ? ' input-ltr' : '') + '" autocomplete="off" placeholder="' + esc(inp.placeholder || ' ') + '" value="' + esc(inp.value || '') + '"><label for="dlg-in">' + esc(inp.label) + '</label></div>' : '') +
				(o.check ? '<label class="check dlg-check" for="dlg-ck"><input id="dlg-ck" type="checkbox"' + (o.check.checked ? ' checked' : '') + '> <span>' + esc(o.check.label) + '</span></label>' : '') +
				'<div class="dlg-actions"><button type="button" class="btn btn-ghost" value="cancel" data-dlg="cancel">' + esc(o.cancel || 'ביטול') + '</button>' +
				'<button type="submit" class="btn ' + (o.danger ? 'btn-danger-fill' : 'btn-primary') + '" value="ok" data-dlg="ok">' + esc(o.confirm || 'אישור') + '</button></div>' +
				'</form>';
			document.body.appendChild(d);
			var field = d.querySelector('#dlg-in'), done = false;
			function finish(v) {
				if (done) return;
				done = true;
				d.classList.add('closing');
				setTimeout(function () { try { d.close(); } catch (e) { /* already closed */ } d.remove(); }, 150);
				resolve(v);
			}
			d.querySelector('[data-dlg="cancel"]').addEventListener('click', function () { finish(null); });
			d.addEventListener('cancel', function (e) { e.preventDefault(); finish(null); });
			d.addEventListener('mousedown', function (e) { if (e.target === d) finish(null); }); // click on the scrim
			d.querySelector('form').addEventListener('submit', function (e) {
				e.preventDefault();
				if (field) {
					var v = field.value.trim();
					if (inp.required && !v) { field.focus(); field.closest('.tf').classList.add('tf-error'); return; }
					finish(o.check ? { text: v, check: d.querySelector('#dlg-ck').checked } : v);
				} else finish(true);
			});
			if (d.showModal) d.showModal(); else d.setAttribute('open', '');
			requestAnimationFrame(function () { d.classList.add('open'); });
			if (field) { field.focus(); field.select(); } else d.querySelector(o.danger ? '[data-dlg="cancel"]' : '[data-dlg="ok"]').focus();
		});
	}

	/* ---------- M3 menus for <select> and an M3 date picker ----------
	 * The native controls stay in the DOM (value, change events, a11y labels);
	 * we only swap the popup the browser would show for a Material one.
	 */
	var M3 = { menu: null, anchor: null, date: null };
	function m3Place(pop, anchor, prefW) {
		var r = anchor.getBoundingClientRect();
		var vw = window.innerWidth, vh = window.innerHeight;
		var w = Math.min(vw - 16, Math.max(prefW || 0, r.width));
		pop.style.width = w + 'px';
		var right = Math.min(vw - 8, Math.max(w + 8, r.right)); // RTL: align to the field's right edge
		pop.style.left = (right - w) + 'px';
		var h = pop.scrollHeight;
		var below = vh - r.bottom - 12, above = r.top - 12;
		if (h <= below || below >= above) {
			pop.style.top = (r.bottom + 4) + 'px';
			pop.style.maxHeight = Math.max(160, below) + 'px';
			pop.style.transformOrigin = 'top';
		} else {
			var mh = Math.min(h, above);
			pop.style.top = Math.max(8, r.top - 4 - mh) + 'px';
			pop.style.maxHeight = mh + 'px';
			pop.style.transformOrigin = 'bottom';
		}
	}
	function m3Commit(el, value) {
		if (el.value === value) return;
		el.value = value;
		el.dispatchEvent(new Event('input', { bubbles: true }));
		el.dispatchEvent(new Event('change', { bubbles: true }));
	}

	function menuClose(refocus) {
		var m = M3.menu, a = M3.anchor;
		if (!m) return;
		M3.menu = M3.anchor = M3.cb = null;
		M3.closedAnchor = a; M3.closedAt = Date.now();
		if (a) { a.classList.remove('is-open'); a.removeAttribute('aria-expanded'); }
		m.classList.remove('open');
		setTimeout(function () { m.remove(); }, 160);
		if (refocus && a && document.contains(a)) a.focus({ preventScroll: true });
	}
	function menuOpen(sel) {
		if (M3.anchor === sel) { menuClose(true); return; }
		menuClose(false); dateClose(false);
		M3.cb = null;
		var m = document.createElement('div');
		m.className = 'm3-menu tbs-pop';
		m.setAttribute('role', 'listbox');
		m.setAttribute('dir', 'rtl');
		var lab = sel.labels && sel.labels[0] ? sel.labels[0].textContent : sel.getAttribute('aria-label');
		if (lab) m.setAttribute('aria-label', lab);
		var html = '';
		Array.prototype.forEach.call(sel.children, function (node) {
			var group = node.tagName === 'OPTGROUP';
			if (group) html += '<div class="m3-menu-group" role="presentation">' + esc(node.label) + '</div>';
			Array.prototype.forEach.call(group ? node.children : [node], function (o) {
				var on = o.selected;
				html += '<div class="m3-menu-item' + (on ? ' on' : '') + (o.disabled ? ' is-disabled' : '') + '" role="option" tabindex="-1" data-v="' + esc(o.value) + '" aria-selected="' + on + '"' + (o.disabled ? ' aria-disabled="true"' : '') + '>' +
					'<span class="m3-menu-text">' + esc(o.textContent) + '</span>' + (on ? ic('check', 'm3-menu-check') : '') + '</div>';
			});
		});
		m.innerHTML = html;
		document.body.appendChild(m);
		M3.menu = m; M3.anchor = sel;
		sel.classList.add('is-open');
		sel.setAttribute('aria-expanded', 'true');
		m3Place(m, sel.closest('.tf') || sel, 200);
		var cur = m.querySelector('.m3-menu-item.on:not(.is-disabled)') || m.querySelector('.m3-menu-item:not(.is-disabled)');
		if (cur) { cur.focus({ preventScroll: true }); cur.scrollIntoView({ block: 'nearest' }); }
		requestAnimationFrame(function () { m.classList.add('open'); });
	}
	/** A Material menu on any button. items: [{ v, label, hint, icon, on, divider }] */
	function menuCustom(anchor, items, cb) {
		if (M3.closedAnchor === anchor && Date.now() - M3.closedAt < 350) return; // the same click that closed it
		menuClose(false); dateClose(false);
		var m = document.createElement('div');
		m.className = 'm3-menu tbs-pop';
		m.setAttribute('role', 'menu');
		m.setAttribute('dir', 'rtl');
		m.innerHTML = items.map(function (it) {
			if (it.divider) return '<div class="m3-menu-divider" role="separator"></div>';
			return '<div class="m3-menu-item' + (it.on ? ' on' : '') + '" role="menuitem" tabindex="-1" data-v="' + esc(it.v) + '">' + (it.icon ? ic(it.icon) : '') +
				'<span class="m3-menu-text">' + esc(it.label) + (it.hint ? '<span class="m3-menu-hint">' + esc(it.hint) + '</span>' : '') + '</span>' + (it.on ? ic('check', 'm3-menu-check') : '') + '</div>';
		}).join('');
		document.body.appendChild(m);
		M3.menu = m; M3.anchor = anchor; M3.cb = cb;
		anchor.setAttribute('aria-expanded', 'true');
		m3Place(m, anchor, 240);
		var cur = m.querySelector('.m3-menu-item.on') || m.querySelector('.m3-menu-item');
		if (cur) cur.focus({ preventScroll: true });
		requestAnimationFrame(function () { m.classList.add('open'); });
	}
	function menuItems() { return M3.menu ? Array.prototype.slice.call(M3.menu.querySelectorAll('.m3-menu-item:not(.is-disabled)')) : []; }
	function menuPick(item) {
		var sel = M3.anchor;
		if (!sel || !item || !item.classList.contains('m3-menu-item') || item.classList.contains('is-disabled')) return;
		var v = item.dataset.v, cb = M3.cb;
		menuClose(true);
		if (cb) cb(v); else m3Commit(sel, v);
	}

	/* ----- date picker ----- */
	var HE_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
	var HE_DAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
	function isoOf(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
	function parseIso(s) {
		var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
		return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
	}
	function dateLabel(iso) {
		var d = parseIso(iso);
		return d ? d.getDate() + ' ב' + HE_MONTHS[d.getMonth()] + ' ' + d.getFullYear() : '';
	}
	function dateClose(refocus) {
		var p = M3.date;
		if (!p) return;
		M3.date = null;
		p.input.classList.remove('is-open');
		p.input.removeAttribute('aria-expanded');
		p.el.classList.remove('open');
		if (p.scrim) p.scrim.classList.remove('open');
		setTimeout(function () { p.el.remove(); if (p.scrim) p.scrim.remove(); }, 180);
		if (refocus && document.contains(p.input)) p.input.focus({ preventScroll: true });
	}
	function dateCommit(iso) {
		var p = M3.date;
		if (!p) return;
		var inp = p.input;
		dateClose(true);
		if ((inp.dataset.date || '') === iso) return;
		inp.dataset.date = iso;
		inp.value = dateLabel(iso);
		inp.dispatchEvent(new Event('change', { bubbles: true }));
	}
	function dateRender() {
		var p = M3.date;
		var y = p.view.getFullYear(), mo = p.view.getMonth();
		var today = isoOf(new Date());
		var head = '<div class="dp-head">' +
			'<button type="button" class="dp-title" data-dp="years" aria-label="בחירת שנה, ' + HE_MONTHS[mo] + ' ' + y + '">' + HE_MONTHS[mo] + ' ' + y + ic(p.mode === 'years' ? 'arrow_drop_up' : 'arrow_drop_down') + '</button>' +
			(p.mode === 'days'
				? '<span class="dp-nav"><button type="button" class="icon-btn" data-dp="prev" aria-label="החודש הקודם">' + ic('chevron_right') + '</button>' +
				  '<button type="button" class="icon-btn" data-dp="next" aria-label="החודש הבא">' + ic('chevron_left') + '</button></span>'
				: '') + '</div>';
		var body = '';
		if (p.mode === 'years') {
			var y0 = new Date().getFullYear() - 3;
			body = '<div class="dp-years">';
			for (var yy = y0; yy < y0 + 12; yy++) body += '<button type="button" class="dp-year' + (yy === y ? ' on' : '') + '" data-dp="year" data-y="' + yy + '">' + yy + '</button>';
			body += '</div>';
		} else {
			body = '<div class="dp-grid" role="grid" aria-label="' + HE_MONTHS[mo] + ' ' + y + '">';
			HE_DAYS.forEach(function (d) { body += '<span class="dp-dow" aria-hidden="true">' + d + '</span>'; });
			var first = new Date(y, mo, 1).getDay(), days = new Date(y, mo + 1, 0).getDate();
			for (var b = 0; b < first; b++) body += '<span></span>';
			for (var d = 1; d <= days; d++) {
				var iso = isoOf(new Date(y, mo, d));
				body += '<button type="button" class="dp-day' + (iso === p.value ? ' on' : '') + (iso === today ? ' today' : '') + '" data-dp="day" data-iso="' + iso + '" tabindex="' + (iso === p.focus ? '0' : '-1') + '" aria-label="' + dateLabel(iso) + '"' + (iso === p.value ? ' aria-pressed="true"' : '') + '>' + d + '</button>';
			}
			body += '</div>';
		}
		var foot = '<div class="dp-foot">' +
			(p.value ? '<button type="button" class="btn btn-ghost btn-sm" data-dp="clear">ניקוי</button>' : '') +
			'<span class="dp-spacer"></span>' +
			'<button type="button" class="btn btn-ghost btn-sm" data-dp="today">היום</button>' +
			'<button type="button" class="btn btn-ghost btn-sm" data-dp="cancel">ביטול</button></div>';
		p.el.innerHTML = head + body + foot;
		var f = p.el.querySelector('.dp-day[tabindex="0"]') || p.el.querySelector('.dp-year.on') || p.el.querySelector('.dp-day');
		if (f) f.focus({ preventScroll: true });
	}
	function dateOpen(inp) {
		if (M3.date && M3.date.input === inp) { dateClose(true); return; }
		menuClose(false); dateClose(false);
		var v = inp.dataset.date || '';
		var start = parseIso(v) || new Date();
		var el = document.createElement('div');
		el.className = 'm3-datepicker tbs-pop';
		el.setAttribute('role', 'dialog');
		el.setAttribute('dir', 'rtl');
		el.setAttribute('aria-label', inp.labels && inp.labels[0] ? inp.labels[0].textContent : 'תאריך');
		var modal = window.innerWidth < 600, scrim = null;
		if (modal) {
			scrim = document.createElement('div');
			scrim.className = 'dp-scrim';
			document.body.appendChild(scrim);
			el.classList.add('modal');
			el.setAttribute('aria-modal', 'true');
		}
		document.body.appendChild(el);
		M3.date = { el: el, scrim: scrim, input: inp, value: v, view: new Date(start.getFullYear(), start.getMonth(), 1), focus: isoOf(start), mode: 'days' };
		inp.classList.add('is-open');
		inp.setAttribute('aria-expanded', 'true');
		dateRender();
		if (!modal) {
			var fr = (inp.closest('.tf') || inp).getBoundingClientRect();
			if (el.scrollHeight > Math.max(window.innerHeight - fr.bottom, fr.top) - 16) {
				// no room above or below the field: show it centred, as a modal
				scrim = document.createElement('div');
				scrim.className = 'dp-scrim';
				document.body.insertBefore(scrim, el);
				M3.date.scrim = scrim;
				el.classList.add('modal');
				el.setAttribute('aria-modal', 'true');
			} else {
				m3Place(el, inp.closest('.tf') || inp, 328);
			}
		}
		requestAnimationFrame(function () { el.classList.add('open'); if (scrim) scrim.classList.add('open'); });
	}
	function dateFocus(d) {
		var p = M3.date;
		p.focus = isoOf(d);
		p.view = new Date(d.getFullYear(), d.getMonth(), 1);
		dateRender();
	}

	/* ----- wiring (document level, so it survives every re-render) ----- */
	function m3SelectFrom(t) { var s = t && t.closest && t.closest('.tbs select.select, .tbs select.cell-select'); return s && !s.disabled && !s.multiple ? s : null; }
	function m3DateFrom(t) { var s = t && t.closest && t.closest('.tbs input.date-input'); return s && !s.disabled ? s : null; }
	document.addEventListener('mousedown', function (e) {
		if (e.button !== 0) return;
		var s = m3SelectFrom(e.target), d = m3DateFrom(e.target);
		if (s) { e.preventDefault(); s.focus({ preventScroll: true }); menuOpen(s); return; }
		if (d) { e.preventDefault(); d.focus({ preventScroll: true }); dateOpen(d); return; }
		if (M3.menu && !M3.menu.contains(e.target)) menuClose(false);
		if (M3.date && !M3.date.el.contains(e.target)) dateClose(false);
	}, true);
	var m3Touch = null;
	document.addEventListener('touchstart', function (e) { var t = e.touches[0]; m3Touch = t ? { x: t.clientX, y: t.clientY } : null; }, { capture: true, passive: true });
	document.addEventListener('touchend', function (e) {
		var t = e.changedTouches[0];
		if (m3Touch && t && Math.abs(t.clientX - m3Touch.x) + Math.abs(t.clientY - m3Touch.y) > 12) return; // it was a scroll
		var s = m3SelectFrom(e.target), d = m3DateFrom(e.target);
		if (s) { e.preventDefault(); menuOpen(s); }
		else if (d) { e.preventDefault(); dateOpen(d); }
		else {
			if (M3.menu && !M3.menu.contains(e.target)) menuClose(false);
			if (M3.date && !M3.date.el.contains(e.target) && e.target !== M3.date.scrim) dateClose(false);
		}
	}, { capture: true, passive: false });
	document.addEventListener('click', function (e) {
		var item = e.target.closest && e.target.closest('.m3-menu-item');
		if (item && M3.menu && M3.menu.contains(item)) { menuPick(item); return; }
		if (M3.date && e.target === M3.date.scrim) { dateClose(true); return; }
		var b = e.target.closest && e.target.closest('[data-dp]');
		if (!b || !M3.date || !M3.date.el.contains(b)) return;
		var p = M3.date, act = b.dataset.dp;
		if (act === 'day') dateCommit(b.dataset.iso);
		else if (act === 'prev' || act === 'next') { p.view = new Date(p.view.getFullYear(), p.view.getMonth() + (act === 'next' ? 1 : -1), 1); p.focus = isoOf(p.view); dateRender(); }
		else if (act === 'years') { p.mode = p.mode === 'years' ? 'days' : 'years'; dateRender(); }
		else if (act === 'year') { p.view = new Date(+b.dataset.y, p.view.getMonth(), 1); p.focus = isoOf(p.view); p.mode = 'days'; dateRender(); }
		else if (act === 'today') dateCommit(isoOf(new Date()));
		else if (act === 'clear') dateCommit('');
		else if (act === 'cancel') dateClose(true);
	});
	document.addEventListener('keydown', function (e) {
		var k = e.key;
		if (M3.menu) {
			var items = menuItems(), i = items.indexOf(document.activeElement);
			if (k === 'Escape') { e.preventDefault(); menuClose(true); }
			else if (k === 'Tab') menuClose(true);
			else if (k === 'ArrowDown' || k === 'ArrowUp') { e.preventDefault(); var n = items[Math.max(0, Math.min(items.length - 1, i + (k === 'ArrowDown' ? 1 : -1)))]; if (n) n.focus(); }
			else if (k === 'Home' || k === 'End') { e.preventDefault(); var h = items[k === 'Home' ? 0 : items.length - 1]; if (h) h.focus(); }
			else if (k === 'Enter' || k === ' ') { e.preventDefault(); menuPick(document.activeElement); }
			else if (k.length === 1) {
				var hit = items.filter(function (it) { return it.textContent.trim().charAt(0).toLowerCase() === k.toLowerCase(); })[0];
				if (hit) hit.focus();
			}
			return;
		}
		if (M3.date) {
			var p = M3.date, ae = document.activeElement;
			if (k === 'Escape') { e.preventDefault(); dateClose(true); return; }
			if (p.mode === 'days' && ae && ae.classList.contains('dp-day')) {
				var step = { ArrowLeft: 1, ArrowRight: -1, ArrowDown: 7, ArrowUp: -7 }[k]; // RTL: left = later
				var d = parseIso(p.focus);
				if (step) { e.preventDefault(); d.setDate(d.getDate() + step); dateFocus(d); return; }
				if (k === 'PageDown' || k === 'PageUp') { e.preventDefault(); d.setMonth(d.getMonth() + (k === 'PageDown' ? 1 : -1)); dateFocus(d); return; }
			}
			if (k === 'Tab') {
				var f = p.el.querySelectorAll('button:not([tabindex="-1"])');
				if (f.length && e.shiftKey && ae === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
				else if (f.length && !e.shiftKey && ae === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
			}
			return;
		}
		var s = m3SelectFrom(e.target);
		if (s && (k === 'Enter' || k === ' ' || k === 'ArrowDown' || k === 'ArrowUp')) { e.preventDefault(); menuOpen(s); return; }
		var di = m3DateFrom(e.target);
		if (di && (k === 'Enter' || k === ' ' || k === 'ArrowDown')) { e.preventDefault(); dateOpen(di); }
	}, true);
	window.addEventListener('resize', function () { menuClose(false); if (M3.date && !M3.date.el.classList.contains('modal')) dateClose(false); });
	document.addEventListener('scroll', function (e) {
		if (M3.menu && !M3.menu.contains(e.target)) menuClose(false);
		if (M3.date && !M3.date.el.contains(e.target) && !M3.date.el.classList.contains('modal')) dateClose(false);
	}, true);

	/* ---------- moments of joy: flower confetti ---------- */
	var JOY_COLORS = ['#E2485C', '#2A68A6', '#5E9E46', '#F2A23A', '#DF8C9E', '#A8283F', '#7FB069'];
	var JOY_LEAF = 'M50 0 C82 22 82 78 50 100 C18 78 18 22 50 0Z';
	var joyPaths = null;
	function joyReduced() {
		return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	}
	function joyKinds() {
		if (joyPaths) return joyPaths;
		joyPaths = {};
		if (!window.Path2D) return joyPaths;
		['cookie9', 'gem', 'clover', 'sunny'].forEach(function (k) { joyPaths[k] = new Path2D(shapePath(k)); });
		joyPaths.leaf = new Path2D(JOY_LEAF);
		return joyPaths;
	}
	function drawBlossom(ctx, petals, color) {
		// petals around a sunny centre, drawn in a 100x100 box
		ctx.fillStyle = color;
		for (var i = 0; i < petals; i++) {
			ctx.save();
			ctx.translate(50, 50);
			ctx.rotate((i / petals) * Math.PI * 2);
			ctx.beginPath();
			ctx.ellipse(0, -24, 15, 24, 0, 0, Math.PI * 2);
			ctx.fill();
			ctx.restore();
		}
		ctx.fillStyle = '#FFD45C';
		ctx.beginPath();
		ctx.arc(50, 50, 13, 0, Math.PI * 2);
		ctx.fill();
	}
	/**
	 * celebrate({ x, y, count, power }) – burst of blossoms, leaves and M3 shapes.
	 * x/y are viewport coordinates of the burst origin (defaults: lower centre).
	 */
	function celebrate(opts) {
		opts = opts || {};
		if (joyReduced() || !window.requestAnimationFrame) return;
		var W = window.innerWidth, H = window.innerHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
		var cv = document.createElement('canvas');
		cv.className = 'joy-canvas';
		cv.setAttribute('aria-hidden', 'true');
		cv.width = W * dpr; cv.height = H * dpr;
		document.body.appendChild(cv);
		var ctx = cv.getContext('2d');
		if (!ctx) { cv.remove(); return; }
		var paths = joyKinds();
		var shapeKinds = Object.keys(paths);
		// keep the origin on screen so a burst from a scrolled-away control still shows
		var ox = Math.min(W - 24, Math.max(24, opts.x != null ? opts.x : W / 2));
		var oy = Math.min(H - 24, Math.max(H * 0.35, opts.y != null ? opts.y : H * 0.7));
		var count = opts.count || 70;
		var power = opts.power || 1;
		var parts = [];
		for (var i = 0; i < count; i++) {
			// fan upward, biased toward the middle of the screen
			var ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.95 + (W / 2 - ox) / W * 0.6;
			var spd = (9 + Math.random() * 11) * power * Math.min(1.2, Math.max(0.75, H / 800));
			var r = Math.random();
			var kind = r < 0.5 ? 'blossom' : (r < 0.72 && paths.leaf ? 'leaf' : (shapeKinds.length ? shapeKinds[(Math.random() * shapeKinds.length) | 0] : 'blossom'));
			parts.push({
				x: ox + (Math.random() - 0.5) * 24, y: oy + (Math.random() - 0.5) * 12,
				vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
				size: kind === 'blossom' ? 16 + Math.random() * 14 : 10 + Math.random() * 10,
				rot: Math.random() * Math.PI * 2, spin: (Math.random() - 0.5) * 0.3,
				sway: Math.random() * Math.PI * 2, swayAmt: 0.6 + Math.random() * 1.2,
				petals: Math.random() < 0.5 ? 5 : 6,
				color: JOY_COLORS[(Math.random() * JOY_COLORS.length) | 0],
				kind: kind,
				delay: (i % 4) * 3,
				scale: 0
			});
		}
		var t0 = null, life = opts.life || 2600;
		function frame(ts) {
			if (t0 === null) t0 = ts;
			var el = ts - t0;
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			ctx.clearRect(0, 0, W, H);
			var alive = false;
			for (var j = 0; j < parts.length; j++) {
				var p = parts[j];
				if (p.delay > 0) { p.delay--; alive = true; continue; }
				// spring the scale in with overshoot (stiffness ~300, damping ~12)
				p.sv = (p.sv || 0) + ((1 - p.scale) * 0.3 - (p.sv || 0) * 0.2);
				p.scale += p.sv;
				p.vx *= 0.985; p.vy = p.vy * 0.985 + 0.32;
				if (p.vy > 3.2) p.vy = 3.2; // drift down like petals
				p.sway += 0.06;
				p.x += p.vx + (p.vy > 0 ? Math.sin(p.sway) * p.swayAmt : 0);
				p.y += p.vy;
				p.rot += p.spin;
				var fade = el > life - 700 ? Math.max(0, (life - el) / 700) : 1;
				if (fade <= 0 || p.y > H + 40) continue;
				alive = true;
				var s = p.size * Math.max(0, p.scale) / 100;
				ctx.save();
				ctx.globalAlpha = fade;
				ctx.translate(p.x, p.y);
				ctx.rotate(p.rot);
				// flip on one axis for a tumbling feel
				ctx.scale(s * Math.cos(p.sway * 0.7), s);
				ctx.translate(-50, -50);
				if (p.kind === 'blossom') {
					drawBlossom(ctx, p.petals, p.color);
				} else {
					ctx.fillStyle = p.kind === 'leaf' ? (j % 2 ? '#5E9E46' : '#7FB069') : p.color;
					ctx.fill(paths[p.kind]);
				}
				ctx.restore();
			}
			if (alive && el < life + 200) requestAnimationFrame(frame);
			else cv.remove();
		}
		requestAnimationFrame(frame);
	}
	function joyOrigin(el) {
		if (el && el.getBoundingClientRect) {
			var b = el.getBoundingClientRect();
			if (b.width) return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
		}
		return {};
	}
	function joyToast(msg, icon) {
		var t = document.getElementById('toast');
		if (!t) return;
		t.innerHTML = ic(icon || 'local_florist', 'fill') + '<span>' + esc(msg) + '</span>';
		t.className = 'toast show joy';
		clearTimeout(timers._toast);
		timers._toast = setTimeout(function () { t.className = 'toast'; }, 2800);
	}

	/* Quiet save status: a small chip in the corner instead of a toast after every field. */
	var saveTimer = null;
	function saveChip() {
		var el = document.getElementById('save-status');
		if (!el) {
			el = document.createElement('div');
			el.id = 'save-status';
			el.className = 'save-status';
			el.setAttribute('role', 'status');
			el.setAttribute('aria-live', 'polite');
			document.body.appendChild(el);
		}
		return el;
	}
	function saving() {
		var el = saveChip();
		clearTimeout(saveTimer);
		el.innerHTML = '<span class="spin" aria-hidden="true"></span><span>שומר…</span>';
		el.className = 'save-status show is-saving';
	}
	function saved() {
		var el = saveChip();
		clearTimeout(saveTimer);
		el.innerHTML = ic('cloud_done', 'fill') + '<span>נשמר</span>';
		el.className = 'save-status show';
		saveTimer = setTimeout(function () { el.className = 'save-status'; }, 1600);
	}
	function saveFailed() {
		var el = document.getElementById('save-status');
		clearTimeout(saveTimer);
		if (el) el.className = 'save-status';
	}

	function api(method, path, body, isForm) {
		var opts = { method: method, credentials: 'same-origin', headers: { 'X-WP-Nonce': CFG.nonce } };
		if (pickedSeason()) opts.headers['X-TBS-Season'] = pickedSeason();
		if (body !== undefined) {
			if (isForm) {
				opts.body = body;
			} else {
				opts.headers['Content-Type'] = 'application/json';
				opts.body = JSON.stringify(body);
			}
		}
		return fetch(CFG.rest + path, opts).then(function (r) {
			return r.text().then(function (txt) {
				var json = null;
				try { json = txt ? JSON.parse(txt) : null; } catch (e) { /* not json */ }
				// Our own writes move the counter too: remember it so the teammate-poll doesn't reload for them.
				var rv = Number(r.headers.get('X-TBS-Rev'));
				if (rv && path !== 'rev' && r.ok) S.rev = rv;
				if (!r.ok && r.status === 409) {
					var ce = new Error((json && json.message) || 'מישהו אחר שינה את זה בינתיים.');
					ce.status = 409;
					ce.data = json && json.data;
					throw ce;
				}
				if (!r.ok) {
					if (r.status === 401 || (json && json.code === 'rest_cookie_invalid_nonce')) {
						toast('החיבור פג. טוענים מחדש…', true);
						setTimeout(function () { location.reload(); }, 1500);
					}
					throw new Error((json && json.message) || 'השמירה נכשלה (' + r.status + ')');
				}
				return json;
			});
		});
	}
	function fail(e) { toast(e.message || 'משהו השתבש', true); }

	/** Copy rich HTML (links keep their display text when pasted into Gmail), plain text as fallback. */
	function copyRich(html, text, note) {
		function done() { toast(note || 'הועתק'); }
		if (navigator.clipboard && window.isSecureContext && window.ClipboardItem) {
			try {
				var item = new ClipboardItem({
					'text/html': new Blob([html], { type: 'text/html' }),
					'text/plain': new Blob([text], { type: 'text/plain' })
				});
				navigator.clipboard.write([item]).then(done, legacy);
				return;
			} catch (e) { /* fall through */ }
		}
		legacy();
		function legacy() {
			// Select a rendered copy of the HTML and use the browser's own copy, which keeps links.
			var box = document.createElement('div');
			box.innerHTML = html;
			box.setAttribute('contenteditable', 'true');
			box.style.position = 'fixed';
			box.style.left = '-9999px';
			document.body.appendChild(box);
			var range = document.createRange();
			range.selectNodeContents(box);
			var sel = window.getSelection();
			sel.removeAllRanges();
			sel.addRange(range);
			var ok = false;
			try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
			sel.removeAllRanges();
			document.body.removeChild(box);
			if (ok) done(); else copyText(text, note);
		}
	}

	function copyText(text, note) {
		function done() { toast(note || 'הועתק'); }
		if (navigator.clipboard && window.isSecureContext) {
			navigator.clipboard.writeText(text).then(done, fallback);
		} else {
			fallback();
		}
		function fallback() {
			var ta = document.createElement('textarea');
			ta.value = text;
			ta.setAttribute('readonly', '');
			ta.style.position = 'fixed';
			ta.style.opacity = '0';
			document.body.appendChild(ta);
			ta.select();
			try { document.execCommand('copy'); done(); } catch (e) { toast('ההעתקה נכשלה', true); }
			document.body.removeChild(ta);
		}
	}

	/* ---------------- data helpers ---------------- */

	function normalize(d) {
		d.catalog = d.catalog || {};
		d.catalog.boxes = d.catalog.boxes || [];
		d.catalog.ingredients = (d.catalog.ingredients || []).map(function (i) { i.grams = obj(i.grams); i.packs = obj(i.packs); i.pack = obj(i.pack); return i; });
		d.catalog.accessories = (d.catalog.accessories || []).map(function (a) { a.per = obj(a.per); return a; });
		d.catalog.suppliers = d.catalog.suppliers || [];
		d.orders = d.orders || [];
		d.seasons = d.seasons || [];
		d.revs = d.revs || {};
		if (d.rev) S.rev = d.rev;
		// The season we asked for may be gone (or this is the first visit): follow what the server chose.
		if (d.season && pickedSeason() && pickedSeason() !== d.season) pickSeason(d.season === d.active ? '' : d.season);
		d.stock = obj(d.stock);
		d.stock.boxes = obj(d.stock.boxes);
		d.stock.accessories = obj(d.stock.accessories);
		d.stock.ingredients = obj(d.stock.ingredients);
		d.texts = d.texts || {};
		d.texts.statuses = d.texts.statuses || [];
		d.clients = (d.clients || []).map(function (c) {
			if (!Array.isArray(c.box_lines)) c.box_lines = c.box ? [{ id: 'l1', box: c.box, qty: c.qty, contents: Array.isArray(c.contents) ? c.contents : null }] : [];
			return c;
		});
		return d;
	}

	function boxName(id) {
		var b = S.data.catalog.boxes.filter(function (x) { return x.id === id; })[0];
		return b ? b.name : '';
	}
	function ingById(id) {
		return S.data.catalog.ingredients.filter(function (x) { return x.id === id; })[0];
	}
	function clientById(id) {
		return S.data.clients.filter(function (c) { return String(c.id) === String(id); })[0];
	}

	function boxById(id) {
		return S.data.catalog.boxes.filter(function (x) { return x.id === id; })[0];
	}
	/** Product photo from the main site, or a shape placeholder. */
	function thumb(item, cls, fallbackIcon) {
		if (item && item.image) return '<img class="thumb' + (cls ? ' ' + cls : '') + '" src="' + esc(item.image) + '" alt="" loading="lazy" decoding="async">';
		if (item && item.emoji) return '<span class="thumb thumb-ph' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><span class="thumb-emoji">' + esc(item.emoji) + '</span></span>';
		return '<span class="thumb thumb-ph' + (cls ? ' ' + cls : '') + '" aria-hidden="true">' + ic(fallbackIcon || 'package_2') + '</span>';
	}

	/** The order's box lines: [{id, box, qty, contents}] */
	function linesOf(c) { return Array.isArray(c.box_lines) ? c.box_lines : []; }
	function totalQty(c) {
		var any = false, sum = 0;
		linesOf(c).forEach(function (l) { if (l.qty !== null && l.qty !== undefined && l.qty !== '') { any = true; sum += Number(l.qty) || 0; } });
		return any ? sum : null;
	}
	function linesText(c) {
		return linesOf(c).filter(function (l) { return l.box; }).map(function (l) { return boxName(l.box) + (l.qty ? ' × ' + fmt(l.qty) : ''); }).join(', ');
	}

	function accById(id) {
		return S.data.catalog.accessories.filter(function (x) { return x.id === id; })[0];
	}
	/** Measured grams (or units) of an ingredient in one נספק, or null if not measured yet. */
	function measured(ing, pack) {
		if (!ing || !pack) return null;
		var v = ing.packs[pack];
		return v === undefined || v === null || v === '' ? null : Number(v);
	}
	/** Standard recipe of an ingredient in a box: {pack, grams} or null if it isn't in that box. */
	function recipeItem(ing, box) {
		var pack = ing.pack[box] || null;
		var g = ing.grams[box];
		if (!pack && (g === undefined || g === null)) return null;
		return { pack: pack, grams: pack ? measured(ing, pack) : Number(g) };
	}

	/** Effective contents of one box line: [{id, pack, grams}] */
	function contentsOfLine(line) {
		var recipe = [];
		S.data.catalog.ingredients.forEach(function (i) {
			var r = recipeItem(i, line.box);
			if (r) recipe.push({ id: i.id, pack: r.pack, grams: r.grams });
		});
		if (!Array.isArray(line.contents)) return recipe;
		return line.contents.map(function (it) {
			var ing = ingById(it.id);
			if (it.pack) return { id: it.id, pack: it.pack, grams: measured(ing, it.pack) };
			if (it.grams !== null && it.grams !== undefined) return { id: it.id, pack: null, grams: it.grams };
			var r = ing ? recipeItem(ing, line.box) : null;
			return { id: it.id, pack: r ? r.pack : null, grams: r ? r.grams : null };
		});
	}

	/** Shared search box for the contents screens. */
	function searchBox(id, key, placeholder) {
		return '<div class="field search"><label for="' + id + '" class="sr-only">' + esc(placeholder) + '</label>' + ic('search') +
			'<input id="' + id + '" class="input" type="search" placeholder="' + esc(placeholder) + '" value="' + esc(S.ui[key] || '') + '" data-input="uiSearch" data-key="' + key + '"></div>';
	}
	function matches(ing, key) {
		var q = String(S.ui[key] || '').trim().toLowerCase();
		return !q || String(ing.name).toLowerCase().indexOf(q) >= 0;
	}
	/** <option>s of נספקים for an ingredient, each with its measured weight. */
	function packOptions(ing, sel, withManual, manualSel) {
		var unit = ing.unit === 'ק״ג' ? 'גרם' : 'יח׳';
		return '<option value="">' + (withManual === 'recipe' ? 'לא במארז' : 'בחירת נספק') + '</option>' +
			S.data.catalog.accessories.map(function (a) {
				var g = measured(ing, a.id);
				return '<option value="' + esc(a.id) + '"' + (a.id === sel ? ' selected' : '') + '>' + esc(a.name) + ' · ' + (g === null ? 'טרם נמדד' : fmt(g) + ' ' + unit) + '</option>';
			}).join('') +
			(withManual ? '<option value="__manual"' + (manualSel ? ' selected' : '') + '>כמות ידנית</option>' : '');
	}

	/** Accessories (מוצרים נלווים) as checkbox options. */
	function extrasList() {
		var x = S.data.texts.extras;
		return Array.isArray(x) && x.length ? x : ['כרטיסי ברכה', 'מארז ממותג'];
	}
	function extrasOf(c) {
		return String(c.accessories || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
	}
	function hasExtra(c, opt) {
		var have = extrasOf(c);
		if (have.indexOf(opt) >= 0) return true;
		if (/כרטיס/.test(opt)) return have.some(function (h) { return /כרטיס/.test(h); });
		return false;
	}

	function nextStep(c) {
		var open = (c.steps || []).filter(function (s) { return !s.done; });
		return { first: open[0], second: open[1] };
	}

	/** Needed quantities across all visible clients. */
	function requirements(list) {
		var need = { boxes: {}, accessories: {}, ingredients: {} };
		(list || S.data.clients).forEach(function (c) {
			linesOf(c).forEach(function (line) {
				var q = Number(line.qty) || 0;
				if (!q || !line.box) return;
				need.boxes[line.box] = (need.boxes[line.box] || 0) + q;
				S.data.catalog.accessories.forEach(function (a) {
					var per = a.per[line.box];
					if (per) need.accessories[a.id] = (need.accessories[a.id] || 0) + per * q;
				});
				contentsOfLine(line).forEach(function (it) {
					if (!it.grams) return;
					var ing = ingById(it.id);
					if (!ing) return;
					var amount = ing.unit === 'ק״ג' ? (it.grams * q) / 1000 : it.grams * q;
					need.ingredients[it.id] = (need.ingredients[it.id] || 0) + amount;
				});
			});
		});
		return need;
	}

	function formLink(c) {
		var base = S.data.texts.form_base || '';
		if (!base) return '';
		return base + (base.indexOf('?') >= 0 ? '&' : '?') + 'name=' + encodeURIComponent(c.name) + '&number_of_locals=' + (c.spots || 1);
	}

	/**
	 * Opening email. body = plain text (mailto, fallback); html = same text with the links
	 * as short display text, for pasting into Gmail.
	 */
	/** The signature under every email. Kept identical to tbs_mail_signature() on the server. */
	function mailSignature(sender) {
		var t = S.data.texts;
		if (!t.sig_on) return { html: '', text: '' };
		var title = String(t.sig_title || '').trim(), phone = String(t.sig_phone || '').trim();
		var lines = ['<strong>' + esc(sender) + '</strong>'], plain = [sender];
		if (title) { lines.push(esc(title)); plain.push(title); }
		if (phone) { lines.push('טלפון: <span dir="ltr">' + esc(phone) + '</span>'); plain.push('טלפון: ' + phone); }
		var html = '<div dir="rtl" style="margin-top:22px;font-family:Arial,sans-serif;font-size:14px;line-height:1.6;text-align:right;color:#222222">--<br>' + lines.join('<br>');
		if (t.sig_logos) {
			html += '<table role="presentation" dir="rtl" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;border-collapse:collapse"><tr>' +
				'<td style="padding:0 0 0 18px"><img src="' + esc(CFG.mailImg + 'logo.png') + '" width="100" height="100" alt="' + esc(t.brand || '') + '" style="display:block;border:0"></td>' +
				'<td style="padding:0"><img src="' + esc(CFG.mailImg + 'iso-9001.png') + '" width="100" height="100" alt="ISO 9001:2015" style="display:block;border:0"></td>' +
				'</tr></table>';
		}
		return { html: html + '</div>', text: '\n\n--\n' + plain.join('\n') };
	}
	function buildEmail(c) {
		var t = S.data.texts;
		var form = formLink(c);
		var card = t.card_designer_url || '';
		var text = {
			contact: c.contact || '[שם איש הקשר]',
			client: c.name,
			sender: S.data.me.name,
			form_link: form,
			card_designer_url: card
		};
		function a(href, label) {
			return href ? '<a href="' + esc(href) + '" style="color:#2A68A6;font-weight:bold;text-decoration:underline">' + esc(label) + '</a>' : '';
		}
		var html = {
			contact: esc(text.contact),
			client: esc(text.client),
			sender: esc(text.sender),
			form_link: a(form, t.form_link_text || 'למילוי טופס פרטי האספקה'),
			card_designer_url: a(card, t.card_link_text || 'לעיצוב כרטיס הברכה')
		};
		function fill(s, vars, isHtml) {
			var src = isHtml ? esc(String(s || '')) : String(s || '');
			return src.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] !== undefined ? vars[k] : m; });
		}
		var wantsCard = extrasList().some(function (o) { return /כרטיס/.test(o) && hasExtra(c, o); });
		text.card_section = wantsCard ? fill(t.card_section, text) : '';
		html.card_section = wantsCard ? fill(t.card_section, html, true) : '';
		var sig = mailSignature(S.data.me.name);
		var tpl = String(t.email_template || '');
		if (sig.html) {
			// The signature already carries the name: drop a closing "{sender}" line (and the brand line under it).
			var brand = String(t.brand || '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			tpl = tpl.replace(new RegExp('\\n[ \\t]*\\{sender\\}[ \\t]*(\\n[ \\t]*' + brand + '[ \\t]*)?\\s*$'), '');
		}
		var body = fill(tpl, text) + sig.text;
		var bodyHtml = fill(tpl, html, true);
		return {
			subject: fill(t.email_subject, text),
			body: body,
			html: '<div dir="rtl" style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;text-align:right">' + bodyHtml.replace(/\n/g, '<br>') + sig.html + '</div>'
		};
	}

	/* ---------------- routing ---------------- */

	function parseRoute() {
		var h = location.hash.replace(/^#\/?/, '');
		var parts = h.split('/');
		var name = parts[0] || 'clients';
		var r = { name: name, id: parts[1] };
		var areas = { clients: 'clients', client: 'clients', schedule: 'clients', inventory: 'inventory', settings: 'settings', users: 'users' };
		if (!areas[name] || !canView(areas[name])) r = { name: 'clients' };
		if (r.name !== S.route.name || r.id !== S.route.id) S.ui.otp = null;
		S.route = r;
	}

	/* ---------------- render ---------------- */

	// Deferred so that focus has already moved (e.g. after Tab) before the DOM is rebuilt.
	var renderTimer = null;
	function render() {
		clearTimeout(renderTimer);
		renderTimer = setTimeout(doRender, 0);
	}

	function doRender() {
		if (!S.data) return;
		var active = document.activeElement;
		var fid = active && active.id && $app.contains(active) ? active.id : null;
		var sel = null;
		try { if (fid && active.selectionStart != null) sel = [active.selectionStart, active.selectionEnd]; } catch (e) { /* not a text input */ }
		// Keep what the person is typing if a save comes back while the field still has focus.
		var typing = fid && (active.tagName === 'TEXTAREA' || (active.tagName === 'INPUT' && /^(text|number|email|tel|search|url|)$/.test(active.type))) ? active.value : null;

		var view = { clients: viewClients, client: viewClient, schedule: viewSchedule, inventory: viewInventory, settings: viewSettings, users: viewUsers }[S.route.name] || viewClients;
		var fab = S.route.name === 'clients' && canEdit('clients')
			? '<button type="button" class="fab' + (window.scrollY > 160 ? ' is-compact' : '') + '" data-act="newClient" aria-label="לקוח חדש">' + ic('person_add') + '<span class="fab-label">לקוח חדש</span></button>' : '';
		$app.innerHTML = '<div class="shell">' + topbar() + '<main class="main" id="main">' + seasonBanner() + view() + '</main></div>' + fab;

		if (fid) {
			var el = document.getElementById(fid);
			if (el) {
				if (typing !== null && el.value !== typing && 'value' in el) el.value = typing;
				el.focus({ preventScroll: true });
				try { if (sel) el.setSelectionRange(sel[0], sel[1]); } catch (e) { /* ignore */ }
			}
		}
		otpWatch();
	}

	function topbar() {
		var r = S.route.name === 'client' ? 'clients' : S.route.name;
		var items = [['clients', 'לקוחות', 'clients', 'groups'], ['schedule', 'אריזה ואספקה', 'clients', 'local_shipping'], ['inventory', canView('purchase') ? 'מלאי ורכש' : 'מלאי', 'inventory', 'inventory_2'], ['settings', 'הגדרות', 'settings', 'tune'], ['users', 'משתמשים', 'users', 'manage_accounts']];
		var vis = items.filter(function (i) { return canView(i[2]); });
		function links(cls) {
			return vis.map(function (i) {
				return '<a class="' + cls + '" href="#/' + i[0] + '"' + (r === i[0] ? ' aria-current="page"' : '') + '><span class="rail-ind">' + ic(i[3]) + '</span>' + i[1] + '</a>';
			}).join('');
		}
		var me = S.data.me;
		var role = (CFG.roles || {})[me.role] || '';
		var brand = esc(S.data.texts.brand || CFG.brand) + ' · ' + esc(S.data.texts.season || CFG.season);
		var mark = '<a class="rail-brand" href="#/clients" aria-label="' + brand + '" title="' + brand + '">' + shape('cookie9') + '<img class="brand-logo" src="' + esc(CFG.logo || '') + '" alt="" width="48" height="48"></a>';
		var out = (CFG.wpAdmin ? '<a class="icon-btn" href="' + esc(CFG.wpAdmin) + '" aria-label="לוח הבקרה של וורדפרס" title="לוח הבקרה של וורדפרס">' + ic('space_dashboard') + '</a>' : '') +
			'<a class="icon-btn" href="' + esc(CFG.logout) + '" aria-label="יציאה" title="יציאה">' + ic('logout') + '</a>';
		return '<nav class="rail" aria-label="ניווט ראשי">' + mark + seasonButton('rail-season') + links('rail-item') +
			'<div class="rail-foot">' + out + '<span title="' + esc(me.name + ' · ' + role) + '">' + avatar(me.name) + '</span><span class="who-name">' + esc(me.name) + '<br><span class="muted">' + esc(role) + '</span></span></div></nav>' +
			'<header class="appbar">' + mark + seasonButton('appbar-season') + out + avatar(me.name) + '</header>' +
			'<nav class="navbar" aria-label="ניווט ראשי">' + links('nav-item') + '</nav>';
	}

	var PILL_ICONS = { ok: 'check_circle', us: 'pending_actions', client: 'schedule', warn: 'hourglass_top', err: 'error', gray: '' };
	function pill(text, kind, icon) {
		var i = icon === undefined ? PILL_ICONS[kind] : icon;
		return '<span class="pill pill-' + kind + '">' + (i ? ic(i) : '') + '<span class="pill-t">' + esc(text) + '</span></span>';
	}
	function na(v, isNum) {
		if (v === null || v === undefined || v === '') return '<span class="na">טרם הוזן</span>';
		return isNum ? '<span class="num">' + esc(fmt(v)) + '</span>' : esc(v);
	}

	/* ---------- data viz helpers ---------- */

	/** Stock against need: stock is the fill, need is the marker. The text label carries the state, never colour alone. */
	function coverage(need, stock, unit) {
		var n = Number(need) || 0, s = Number(stock) || 0;
		var u = unit ? ' ' + unit : '';
		if (!n && !s) return '<div class="cov cov-none"><span class="cov-label">' + ic('remove', 'sm') + 'לא נדרש</span></div>';
		var max = Math.max(n, s) || 1;
		var state = !n ? 'none' : (n > s ? 'short' : 'ok');
		var label = state === 'none' ? 'לא נדרש · יש ' + fmt(s, 2) + u : (state === 'short' ? 'חסר ' + fmt(n - s, 2) + u : (s > n ? 'מכוסה · עודף ' + fmt(s - n, 2) + u : 'מכוסה בדיוק'));
		var tip = 'נדרש ' + fmt(n, 2) + u + ' · במלאי ' + fmt(s, 2) + u;
		return '<div class="cov cov-' + state + '" title="' + esc(tip) + '">' +
			'<div class="cov-track" role="img" aria-label="' + esc(tip + '. ' + label) + '"><span class="cov-fill" style="width:' + (s / max * 100).toFixed(1) + '%"></span>' +
			(n ? '<span class="cov-target" style="inset-inline-start:calc(' + (n / max * 100).toFixed(1) + '% - 1px)"></span>' : '') + '</div>' +
			'<span class="cov-label">' + ic(state === 'short' ? 'warning' : (state === 'ok' ? 'check_circle' : 'remove'), 'sm fill') + esc(label) + '</span></div>';
	}

	/** Part-to-whole bar with a legend that also carries the numbers. parts: [{label, value, key, icon}] */
	function stackBar(parts, total, aria) {
		var segs = parts.filter(function (p) { return p.value > 0; }).map(function (p) {
			return '<span class="sb-seg sb-' + p.key + '" style="flex-grow:' + p.value + '" title="' + esc(p.label + ': ' + p.value) + '"></span>';
		}).join('');
		var legend = parts.map(function (p) {
			return '<li><span class="sb-key sb-' + p.key + '" aria-hidden="true"></span>' + ic(p.icon, 'sm') + '<span>' + esc(p.label) + '</span><strong class="num">' + p.value + '</strong><span class="small muted num">' + (total ? Math.round(p.value / total * 100) : 0) + '%</span></li>';
		}).join('');
		return '<div class="stackbar" role="img" aria-label="' + esc(aria) + '">' + (segs || '<span class="sb-seg sb-empty" style="flex-grow:1"></span>') + '</div><ul class="legend">' + legend + '</ul>';
	}

	/** Ranked horizontal bars, one series (one hue), value labelled at the end of each bar. */
	function barList(items, unit) {
		var max = 0;
		items.forEach(function (it) { max = Math.max(max, it.value); });
		return '<div class="hbars">' + items.map(function (it) {
			var tip = it.label + ': ' + fmt(it.value) + (unit ? ' ' + unit : '');
			return '<div class="hbar" title="' + esc(tip) + '">' + (it.thumb || '') + '<span class="hbar-label">' + esc(it.label) + '</span>' +
				'<div class="hbar-track" role="img" aria-label="' + esc(tip) + '"><span class="hbar-fill" style="width:' + (max ? (it.value / max * 100).toFixed(1) : 0) + '%"></span></div>' +
				'<span class="hbar-val num">' + fmt(it.value) + '</span></div>';
		}).join('') + '</div>';
	}

	/** Small progress meter for a stat tile. */
	function meter(value, of) {
		var pct = of ? Math.min(100, Math.round(value / of * 100)) : 0;
		return '<div class="meter" role="img" aria-label="' + pct + '%"><span style="width:' + pct + '%"></span></div><span class="small muted num">' + pct + '%</span>';
	}

	/* ---------- clients list ---------- */

	function clientsView() {
		var narrow = window.matchMedia && window.matchMedia('(max-width: 840px)').matches;
		if (narrow) return 'cards';
		if (!S.ui.clientsView) { try { S.ui.clientsView = localStorage.getItem('tbs-clients-view') || 'table'; } catch (e) { S.ui.clientsView = 'table'; } }
		return S.ui.clientsView;
	}

	function viewClients() {
		var all = S.data.clients;
		var q = S.ui.search.trim().toLowerCase();
		var list = !q ? all : all.filter(function (c) {
			return (c.name + ' ' + c.contact + ' ' + c.rep + ' ' + linesText(c)).toLowerCase().indexOf(q) >= 0;
		});
		var boxes = all.reduce(function (s, c) { return s + (totalQty(c) || 0); }, 0);
		var forms = all.filter(function (c) { return c.form_status === 'received'; }).length;
		var counts = { us: 0, client: 0, done: 0 };
		all.forEach(function (c) { var n = nextStep(c).first; counts[!n ? 'done' : (n.owner === 'us' ? 'us' : 'client')]++; });

		// boxes ordered, by type
		var byBox = {};
		all.forEach(function (c) { linesOf(c).forEach(function (l) { if (l.box && l.qty) byBox[l.box] = (byBox[l.box] || 0) + Number(l.qty); }); });
		var boxItems = Object.keys(byBox).map(function (id) { return { label: boxName(id) || '?', value: byBox[id], thumb: thumb(boxById(id), 'xs') }; })
			.sort(function (a, b) { return b.value - a.value; });

		var view = clientsView();
		var body;
		if (!list.length) {
			body = q
				? '<div class="empty">' + shape('flower') + 'אין לקוחות שמתאימים לחיפוש.</div>'
				: '<div class="empty empty-art"><img src="' + esc(CFG.art + 'dancer.webp') + '" alt="" width="300" height="426"><strong>עדיין אין לקוחות</strong><span class="muted">כל הזמנה מתחילה כאן. הלקוח הראשון יקבל גם קונפטי.</span>' +
					(canEdit('clients') ? '<button type="button" class="btn btn-primary" data-act="newClient">' + ic('person_add') + 'לקוח חדש</button>' : '') + '</div>';
		} else if (view === 'cards') {
			body = '<div class="ccards">' + list.map(clientCard).join('') + '</div>';
		} else {
			body = clientsTable(list);
		}

		var toggle = '<div class="seg view-toggle" role="group" aria-label="תצוגה">' +
			'<button type="button" aria-pressed="' + (view === 'table') + '" data-act="clientsView" data-view="table" title="טבלה">' + ic('table_rows') + 'טבלה</button>' +
			'<button type="button" aria-pressed="' + (view === 'cards') + '" data-act="clientsView" data-view="cards" title="כרטיסים">' + ic('grid_view') + 'כרטיסים</button></div>';

		return '<div class="page-head"><div class="stack-6"><span class="eyebrow">' + esc(S.data.texts.season) + '</span><h1 class="h1">לקוחות</h1>' +
			'<p class="lead">הצעד הבא וטופס האספקה של כל לקוח' +
			(S.data.me.role === 'sales' ? ' (רק הלקוחות שלך)' : '') + '</p></div></div>' +
			'<div class="stats">' +
			'<div class="stat stat-hero">' + heroArt() + '<div class="stat-top"><span class="stat-label">ממתינים לטיפול שלנו</span>' + ic('pending_actions') + '</div>' +
			'<div><div class="stat-value">' + counts.us + '</div><div class="stat-sub">מתוך ' + all.length + ' לקוחות</div></div></div>' +
			stat('לקוחות', all.length, undefined, 'groups') +
			stat('מארזים שהוזמנו', fmt(boxes), undefined, 'package_2') +
			stat('טפסי אספקה', forms, all.length, 'assignment_turned_in', meter(forms, all.length)) +
			'</div>' +
			(all.length ? '<div class="overview">' +
				'<section class="card card-pad" aria-labelledby="where-h">' + sectionTitle('where-h', 'donut_large', 'איפה כל לקוח עומד') +
				stackBar([
					{ key: 'us', label: 'הצעד הבא אצלנו', value: counts.us, icon: 'pending_actions' },
					{ key: 'client', label: 'מחכים ללקוח', value: counts.client, icon: 'schedule' },
					{ key: 'done', label: 'הכול סגור', value: counts.done, icon: 'check_circle' }
				], all.length, counts.us + ' אצלנו, ' + counts.client + ' אצל הלקוח, ' + counts.done + ' סגורים') + '</section>' +
				'<section class="card card-pad" aria-labelledby="bybox-h"><div class="row-between">' + sectionTitle('bybox-h', 'bar_chart', 'מארזים לפי סוג') + '<span class="small muted num">' + fmt(boxes) + ' בסך הכול</span></div>' +
				(boxItems.length ? barList(boxItems, 'מארזים') : '<p class="p0 muted">עדיין אין כמויות בהזמנות.</p>') + '</section>' +
				'</div>' : '') +
			'<section class="card" aria-labelledby="clients-h"><div class="card-head">' + sectionTitle('clients-h', 'list_alt', 'רשימת לקוחות') +
			'<div class="row" style="gap:10px">' + toggle +
			'<div class="field search"><label for="client-search" class="sr-only">חיפוש לקוח</label>' + ic('search') + '<input id="client-search" class="input" type="search" style="width:320px;max-width:100%" placeholder="חיפוש לפי לקוח, איש קשר, נציג או מארז" value="' + esc(S.ui.search) + '" data-input="search"></div></div></div>' +
			body + '</section>';
	}

	function nextBadge(n) {
		return !n.first ? pill('הכול סגור', 'ok') : (n.first.owner === 'us' ? pill('אצלנו', 'us') : pill('אצל הלקוח', 'client'));
	}

	function clientsTable(list) {
		var rows = list.map(function (c) {
			var n = nextStep(c);
			return '<tr>' +
				'<td class="num muted">' + esc(c.no) + '</td>' +
				'<td><a class="client-link" href="#/client/' + c.id + '">' + esc(c.name) + '</a></td>' +
				'<td><div class="stack-4">' + nextBadge(n) + '<strong>' + esc(n.first ? n.first.label : 'אין צעד פתוח') + '</strong>' +
				(n.second ? '<span class="small muted">אחר כך: ' + esc(n.second.label) + '</span>' : '') + '</div></td>' +
				'<td>' + na(c.contact) + '</td>' +
				'<td>' + linesCell(c) + '</td>' +
				'<td>' + extrasCell(c) + '</td>' +
				'<td>' + na(c.spots, true) + '</td>' +
				'<td><strong>' + na(totalQty(c), true) + '</strong></td>' +
				'<td>' + na(c.rep) + '</td>' +
				'<td class="num">' + na(date(c.close_date)) + '</td>' +
				'<td>' + na(c.status) + '</td>' +
				'<td>' + (c.form_status === 'received' ? pill('התקבל', 'ok') : pill('ממתין', 'warn')) + '</td>' +
				'</tr>';
		}).join('');
		return '<div class="table-wrap freeze freeze-2"><table class="t" style="min-width:1180px"><thead><tr>' +
			th('מס\'', 'tag') + th('לקוח', 'storefront') + th('הצעד הבא', 'pending_actions', ' style="min-width:240px"') + th('איש קשר', 'contact_phone') + th('מארזים', 'package_2', ' style="min-width:200px"') + th('מוצרים נלווים', 'redeem') + th('נק\' אספקה', 'location_on') + th('כמות', 'stacks') + th('נציג', 'badge') + th('סגירה', 'event') + th('סטטוס', 'flag') + th('טופס אספקה', 'assignment') +
			'</tr></thead><tbody>' + rows + '</tbody></table></div>';
	}

	function clientCard(c) {
		var n = nextStep(c);
		var done = (c.steps || []).filter(function (s) { return s.done; }).length;
		var steps = (c.steps || []).length;
		var meta = [
			['stacks', totalQty(c) ? fmt(totalQty(c)) + ' מארזים' : ''],
			['location_on', c.spots ? c.spots + ' נק׳ אספקה' : ''],
			['badge', c.rep || ''],
			['event', c.close_date ? date(c.close_date) : '']
		].filter(function (m) { return m[1]; }).map(function (m) { return '<span>' + ic(m[0], 'sm') + esc(m[1]) + '</span>'; }).join('');
		return '<a class="ccard" href="#/client/' + c.id + '">' +
			'<div class="ccard-head"><div class="stack-4"><span class="small muted num">לקוח ' + esc(c.no) + (c.status ? ' · ' + esc(c.status) : '') + '</span><h3 class="ccard-name">' + esc(c.name) + '</h3></div>' +
			(c.form_status === 'received' ? pill('טופס התקבל', 'ok') : pill('טופס ממתין', 'warn')) + '</div>' +
			'<div class="ccard-next">' + nextBadge(n) + '<strong>' + esc(n.first ? n.first.label : 'אין צעד פתוח') + '</strong></div>' +
			(steps ? '<div class="ccard-steps"><div class="meter" role="img" aria-label="' + done + ' מתוך ' + steps + ' צעדים"><span style="width:' + Math.round(done / steps * 100) + '%"></span></div><span class="small muted num">' + done + '/' + steps + ' צעדים</span></div>' : '') +
			linesCell(c) +
			(meta ? '<div class="ccard-meta">' + meta + '</div>' : '') +
			'</a>';
	}

	function linesCell(c) {
		var ls = linesOf(c).filter(function (l) { return l.box; });
		if (!ls.length) return '<span class="na">טרם הוזן</span>';
		return '<div class="line-chips">' + ls.map(function (l) {
			return '<span class="line-chip">' + thumb(boxById(l.box), 'xs') + '<span>' + esc(boxName(l.box)) + '</span>' + (l.qty ? '<span class="num muted">× ' + esc(fmt(l.qty)) + '</span>' : '') + '</span>';
		}).join('') + '</div>';
	}
	function extrasCell(c) {
		var have = extrasList().filter(function (o) { return hasExtra(c, o); });
		if (!have.length) return '<span class="na">—</span>';
		return '<div class="line-chips">' + have.map(function (o) { return pill(o, 'gray', /כרטיס/.test(o) ? 'mail' : 'redeem'); }).join('') + '</div>';
	}

	/** Brand illustration for hero tiles: the Tu BiShvat art from the main site, on an M3 shape. */
	function heroArt(kind) {
		var img = kind === 'strawberry' ? ['strawberry.webp', 'hero-berry', 96, 129] : kind === 'leaf' ? ['leaf.webp', 'hero-wheat', 40, 172] : ['dancer.webp', 'hero-dancer', 300, 426];
		return '<div class="hero-art" aria-hidden="true">' + shape('cookie9') + '<img src="' + esc(CFG.art + img[0]) + '" alt="" class="' + img[1] + '" width="' + img[2] + '" height="' + img[3] + '"></div>';
	}
	function stat(label, value, of, icon, extra, kind) {
		return '<div class="stat' + (kind ? ' stat-' + kind : '') + '"><div class="stat-top"><span class="stat-label">' + esc(label) + '</span>' + (icon ? ic(icon) : '') + '</div><span class="stat-value">' + esc(value) +
			(of !== undefined ? ' <span class="stat-of">/ ' + esc(of) + '</span>' : '') + '</span>' + (extra ? '<div class="stat-extra">' + extra + '</div>' : '') + '</div>';
	}

	/* =====================================================================
	 * v2: seasons, history, packing & delivery days, purchasing, updates
	 * ===================================================================== */

	var HE_WEEKDAYS = ['יום ראשון', 'יום שני', 'יום שלישי', 'יום רביעי', 'יום חמישי', 'יום שישי', 'שבת'];
	function todayIso() { return isoOf(new Date()); }
	function dayTitle(iso) {
		var d = parseIso(iso);
		return d ? HE_WEEKDAYS[d.getDay()] + ', ' + d.getDate() + ' ב' + HE_MONTHS[d.getMonth()] : 'ללא תאריך';
	}
	/** "היום 14:32", "אתמול 09:10" or "12.1 14:32" from a server date-time. */
	function when(at) {
		var m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(at || '');
		if (!m) return '';
		var day = m[1] + '-' + m[2] + '-' + m[3], t = m[4] + ':' + m[5];
		var y = new Date(); y.setDate(y.getDate() - 1);
		if (day === todayIso()) return 'היום ' + t;
		if (day === isoOf(y)) return 'אתמול ' + t;
		return Number(m[3]) + '.' + Number(m[2]) + ' ' + t;
	}
	/** A date field that opens the Material date picker. */
	function dateInput(id, iso, attrsExtra, label, disabled) {
		iso = String(iso || '').slice(0, 10);
		return '<input' + attrs(Object.assign({
			id: id, class: 'input date-input', type: 'text', readonly: true, inputmode: 'none', autocomplete: 'off',
			value: dateLabel(iso), placeholder: label || 'בחירת תאריך', 'data-date': iso, 'aria-haspopup': 'dialog', 'aria-label': label || 'תאריך', disabled: !!disabled
		}, attrsExtra || {})) + '>';
	}

	/* ---------------- seasons ---------------- */

	function seasonById(id) { return (S.data.seasons || []).filter(function (s) { return s.id === id; })[0]; }
	function seasonBanner() {
		var d = S.data;
		if (d.season === d.active && !d.locked) return '';
		var s = seasonById(d.season) || {};
		var act = seasonById(d.active) || {};
		return '<div class="season-banner" role="status">' + ic(d.locked ? 'lock' : 'history') +
			'<div class="grow"><strong>' + esc(s.name || '') + (d.locked ? ' · בארכיון, לצפייה בלבד' : ' · לא העונה הפעילה') + '</strong>' +
			'<span class="small">העונה הפעילה היא ' + esc(act.name || '') + '.</span></div>' +
			'<button type="button" class="btn btn-sm btn-secondary" data-act="seasonGo" data-id="' + esc(d.active) + '">חזרה ל' + esc(act.name || 'עונה הפעילה') + '</button></div>';
	}
	function seasonButton(cls) {
		var name = S.data.texts.season || CFG.season;
		return '<button type="button" class="' + cls + '" data-act="seasonMenu" aria-haspopup="menu" aria-label="עונה: ' + esc(name) + '. החלפת עונה" title="החלפת עונה">' +
			(cls === 'rail-season' ? '<span class="rail-ind">' + ic('calendar_month') + '</span><span class="rail-season-name">' + esc(name) + '</span>' : '<span class="appbar-title">' + esc(name) + '</span>' + ic('arrow_drop_down')) + '</button>';
	}
	function switchSeason(id) {
		pickSeason(id === S.data.active ? '' : id);
		S.ui.history = {}; S.ui.log = null; S.ui.lineIdx = 0; S.ui.backups = null;
		if (location.hash !== '#/clients' && S.route.name === 'client') location.hash = '#/clients';
		load().then(function () { window.scrollTo(0, 0); toast('עברתם ל' + S.data.texts.season); });
	}
	function settingsSeasons() {
		var d = S.data;
		var cards = d.seasons.slice().reverse().map(function (s) {
			var isActive = s.id === d.active, isShown = s.id === d.season;
			return '<article class="season-card' + (isShown ? ' is-shown' : '') + (s.archived ? ' is-archived' : '') + '">' +
				'<div class="row-between"><div class="stack-4"><h3 class="h3">' + esc(s.name) + '</h3><span class="small muted">נפתחה ב-' + esc(date(s.created_at)) + '</span></div>' +
				'<div class="row" style="gap:6px">' + (isActive ? pill('פעילה', 'ok', 'check_circle') : '') + (s.archived ? pill('ארכיון', 'gray', 'inventory_2') : '') + (isShown ? pill('מוצגת עכשיו', 'us', 'visibility') : '') + '</div></div>' +
				'<div class="row" style="gap:8px;flex-wrap:wrap">' +
				(isShown ? '' : '<button type="button" class="btn btn-sm btn-secondary" data-act="seasonGo" data-id="' + esc(s.id) + '">' + ic('visibility') + 'מעבר לעונה</button>') +
				(isActive ? '' : '<button type="button" class="btn btn-sm btn-ghost" data-act="seasonActive" data-id="' + esc(s.id) + '">' + ic('check_circle') + 'הפיכה לפעילה</button>') +
				(isActive ? '' : '<button type="button" class="btn btn-sm btn-ghost" data-act="seasonArchive" data-id="' + esc(s.id) + '" data-on="' + (s.archived ? '0' : '1') + '">' + ic(s.archived ? 'unarchive' : 'inventory_2') + (s.archived ? 'הוצאה מהארכיון' : 'העברה לארכיון') + '</button>') +
				'</div></article>';
		}).join('');
		return '<section class="card" aria-labelledby="se-h"><div class="card-head"><div class="stack-4">' + sectionTitle('se-h', 'calendar_month', 'עונות') +
			'<span class="small muted">כל עונה היא שנה נפרדת לגמרי: לקוחות, מלאי, הזמנות רכש, מארזים ונוסחים משלה. המשתמשים וההגדרות הכלליות משותפים.</span></div>' +
			'<button type="button" class="btn btn-primary" data-act="seasonNew">' + ic('add') + 'עונה חדשה</button></div>' +
			'<div class="card-body"><div class="season-grid">' + cards + '</div>' +
			'<p class="note" style="margin-top:16px">' + ic('info') + '<span>העונה הפעילה היא זו שכולם רואים כשהם נכנסים. אליה מגיעים טופסי האספקה מ-Tally, והיא מגובה כל לילה. עונה בארכיון נשארת לצפייה בלבד.</span></p></div></section>';
	}

	/* ---------------- history ---------------- */

	var LOG_ICONS = { client: 'storefront', catalog: 'tune', stock: 'warehouse', orders: 'shopping_cart', season: 'calendar_month' };
	function logRows(list, showTitle) {
		return '<ol class="log">' + list.map(function (r) {
			var undo = r.can_undo && ((r.entity === 'client' && canEdit('clients')) || (r.entity === 'catalog' && canEdit('catalog')) || (r.entity === 'stock' && canEdit('inventory')) || (r.entity === 'orders' && canEdit('purchase')));
			return '<li class="log-row' + (r.undone ? ' is-undone' : '') + '">' + avatar(r.user) +
				'<div class="log-body"><span class="log-what">' + esc(r.summary) + '</span>' +
				'<span class="log-meta">' + esc(r.user) + ' · ' + esc(when(r.at)) +
				(showTitle && r.title ? ' · ' + (r.entity === 'client' && clientById(r.entity_id) ? '<a href="#/client/' + r.entity_id + '">' + esc(r.title) + '</a>' : esc(r.title)) : '') +
				(r.undone ? ' · <em>בוטל</em>' : '') + '</span></div>' +
				(undo ? '<button type="button" class="btn btn-ghost btn-sm" data-act="logUndo" data-id="' + r.id + '" aria-label="ביטול השינוי: ' + esc(r.summary) + '">' + ic('undo') + 'ביטול</button>' : '') + '</li>';
		}).join('') + '</ol>';
	}
	function historySection(c) {
		S.ui.history = S.ui.history || {};
		var h = S.ui.history[c.id];
		if (h === undefined) {
			S.ui.history[c.id] = 'loading';
			api('GET', 'log?entity=client&id=' + c.id + '&limit=80').then(function (r) { S.ui.history[c.id] = r.log; if (S.route.name === 'client' && String(S.route.id) === String(c.id)) render(); })
				.catch(function () { S.ui.history[c.id] = []; });
			h = 'loading';
		}
		var body;
		if (h === 'loading') body = '<p class="p0 muted">טוען…</p>';
		else if (!h.length) body = '<p class="p0 muted">עדיין אין שינויים רשומים ללקוח הזה.</p>';
		else {
			var all = S.ui.historyAll === c.id;
			body = logRows(all ? h : h.slice(0, 6)) + (h.length > 6 ? '<button type="button" class="btn btn-ghost btn-sm" style="align-self:flex-start" data-act="historyAll" data-id="' + c.id + '">' + (all ? 'הצגת פחות' : 'כל ' + h.length + ' השינויים') + '</button>' : '');
		}
		return '<section class="card card-pad" aria-labelledby="history-h"><div class="stack-4">' + sectionTitle('history-h', 'history', 'היסטוריה') +
			'<span class="small muted">מי שינה מה. אפשר לבטל שינוי, והביטול עצמו נרשם.</span></div>' + body + '</section>';
	}
	function settingsHistory() {
		if (S.ui.log == null) {
			S.ui.log = 'loading';
			api('GET', 'log?limit=150').then(function (r) { S.ui.log = r.log; if (S.route.name === 'settings') render(); }).catch(function (e) { S.ui.log = []; fail(e); });
		}
		var l = S.ui.log;
		return '<section class="card" aria-labelledby="hi-h"><div class="card-head"><div class="stack-4">' + sectionTitle('hi-h', 'history', 'היסטוריה') +
			'<span class="small muted">150 השינויים האחרונים בעונה הזו: לקוחות, מלאי, רכש והגדרות.</span></div>' +
			'<button type="button" class="btn btn-secondary btn-sm" data-act="logRefresh">' + ic('autorenew') + 'רענון</button></div>' +
			'<div class="card-body">' + (l === 'loading' ? '<p class="p0 muted">טוען…</p>' : (l.length ? logRows(l, true) : '<div class="empty">' + shape('clover') + 'עדיין אין שינויים רשומים.</div>')) + '</div></section>';
	}

	/* ---------------- updates ---------------- */

	function settingsUpdates() {
		var a = S.data.appSettings || {}, u = a.update || {};
		var src = S.ui.updateSource == null ? (a.update_source || '') : S.ui.updateSource;
		var status;
		if (!a.update_source) status = '<div class="alert alert-warn">' + ic('info', 'fill') + '<div><strong>עוד לא הוגדר מקור עדכונים</strong><span>עד אז מעדכנים כמו היום, בהעלאת קובץ zip במסך התוספים.</span></div></div>';
		else if (u.error) status = '<div class="alert alert-error">' + ic('error', 'fill') + '<div><strong>הבדיקה נכשלה</strong><span>' + esc(u.error) + '</span></div></div>';
		else if (u.available) status = '<div class="update-box is-new">' + ic('system_update_alt') + '<div class="grow"><strong>גרסה ' + esc(u.latest) + ' זמינה</strong>' +
			(u.changelog ? '<p class="update-notes">' + esc(u.changelog) + '</p>' : '') + '</div>' +
			(a.can_install ? '<button type="button" class="btn btn-primary" data-act="updateInstall">' + ic('download') + 'עדכון עכשיו</button>' : '<span class="small muted">רק מנהל האתר יכול להתקין.</span>') + '</div>';
		else if (u.latest) status = '<div class="update-box">' + ic('check_circle', 'fill') + '<div class="grow"><strong>מותקנת הגרסה העדכנית</strong><span class="small muted">נבדק ' + esc(when(u.checked) || 'עכשיו') + '</span></div></div>';
		else status = '<p class="p0 muted">לחצו על "בדיקה עכשיו" כדי לבדוק אם יש גרסה חדשה.</p>';
		return '<form class="card card-pad" data-submit="saveUpdateSource" aria-labelledby="up-h"><div class="row-between">' + sectionTitle('up-h', 'system_update_alt', 'עדכונים') + pill('גרסה ' + (S.data.version || ''), 'gray', 'tag') + '</div>' +
			'<p class="p0 muted">כשמוגדר מקור עדכונים, גרסה חדשה מופיעה גם כאן וגם במסך התוספים של וורדפרס עם כפתור "עדכון" רגיל, ואפשר להפעיל שם עדכון אוטומטי. לפני כל עדכון נשמר גיבוי.</p>' +
			status +
			'<div class="grid-fields" style="grid-template-columns:minmax(0,1fr) auto;align-items:end">' +
			field('up-src', 'מקור עדכונים', '<input id="up-src" class="input input-ltr" placeholder="owner/repo  או  https://…/update.json" value="' + esc(src) + '" data-input="updateSource" autocomplete="off">', 'link') +
			'<div class="row" style="gap:8px"><button type="submit" class="btn btn-secondary">' + ic('check') + 'שמירה</button>' +
			(a.update_source ? '<button type="button" class="btn btn-primary" data-act="updateCheck">' + ic('autorenew') + 'בדיקה עכשיו</button>' : '') + '</div></div>' +
			'<p class="note">' + ic('info') + '<span>שתי אפשרויות: מאגר ציבורי ב-GitHub (כותבים <code>owner/repo</code>, וכל גרסה היא Release עם הקובץ <code>tubishvat-app.zip</code>), או כתובת https של קובץ JSON עם <code>version</code> ו-<code>download_url</code>.</span></p></form>';
	}

	/* ---------------- packing & delivery days ---------------- */

	function canSchedule() { return canEdit('clients') || canEdit('inventory'); }
	function deliveriesOf(c) {
		var pts = c.points || [];
		if (!pts.length) return [{ client: c, point: null, date: c.delivery_date || '', qty: totalQty(c), delivered: false }];
		return pts.map(function (p) { return { client: c, point: p, date: p.date || c.delivery_date || '', qty: p.qty, delivered: !!p.delivered, own: !!p.date }; });
	}
	function groupByDate(rows, keyOf) {
		var map = {};
		rows.forEach(function (r) { var k = (keyOf ? keyOf(r) : r.date) || ''; (map[k] = map[k] || []).push(r); });
		var keys = Object.keys(map).filter(Boolean).sort();
		if (map['']) keys.push('');
		return keys.map(function (k) { return { date: k, rows: map[k] }; });
	}
	function dayPills(dateIso, done, total) {
		var t = todayIso();
		if (!dateIso) return pill('צריך לקבוע תאריך', 'warn', 'event');
		if (total && done === total) return pill('הושלם', 'ok', 'check_circle');
		if (dateIso < t) return pill('באיחור', 'us', 'warning');
		if (dateIso === t) return pill('היום', 'client', 'today');
		var days = Math.round((parseIso(dateIso) - parseIso(t)) / 86400000);
		return pill(days === 1 ? 'מחר' : 'בעוד ' + days + ' ימים', 'gray', 'schedule');
	}
	function pickList(clients) {
		var need = requirements(clients), cat = S.data.catalog;
		function col(title, icon, rows) {
			if (!rows.length) return '';
			return '<div class="pick-col"><h4 class="pick-h">' + ic(icon) + title + '</h4><ul class="pick-ul">' + rows.map(function (r) {
				return '<li><span>' + esc(r[0]) + '</span><strong class="num">' + r[1] + '</strong></li>';
			}).join('') + '</ul></div>';
		}
		var boxes = cat.boxes.filter(function (b) { return need.boxes[b.id]; }).map(function (b) { return [b.name, fmt(need.boxes[b.id])]; });
		var accs = cat.accessories.filter(function (a) { return need.accessories[a.id]; }).map(function (a) { return [a.name, fmt(Math.ceil(need.accessories[a.id])) + ' יח׳']; });
		var ings = cat.ingredients.filter(function (i) { return need.ingredients[i.id]; }).map(function (i) { return [i.name, fmt(need.ingredients[i.id], 2) + ' ' + (i.unit === 'ק״ג' ? 'ק״ג' : 'יח׳')]; });
		if (!boxes.length) return '<p class="p0 muted">אין מה ללקט: ללקוחות של היום הזה אין עדיין מארז וכמות.</p>';
		return '<div class="pick-grid">' + col('מארזים', 'package_2', boxes) + col('נספקים', 'takeout_dining', accs) + col('תכולות', 'nutrition', ings) + '</div>';
	}
	function packDay(g, edit) {
		var total = 0, doneQty = 0, doneN = 0;
		g.rows.forEach(function (c) { var q = totalQty(c) || 0; total += q; if (c.packed_at) { doneQty += q; doneN++; } });
		var key = 'p' + (g.date || 'none');
		var open = S.ui.pickOpen === key;
		var rows = g.rows.map(function (c) {
			var id = 'pk-' + c.id;
			return '<li class="day-row' + (c.packed_at ? ' is-done' : '') + '">' +
				'<label class="day-check" for="' + id + '"><input id="' + id + '" type="checkbox"' + (c.packed_at ? ' checked' : '') + (edit ? '' : ' disabled') + ' data-change="schedPacked" data-id="' + c.id + '"><span class="sr-only">נארז: ' + esc(c.name) + '</span></label>' +
				'<div class="day-main"><a class="day-name" href="#/client/' + c.id + '">' + esc(c.name) + '</a>' +
				'<span class="day-sub">' + (linesText(c) ? esc(linesText(c)) : 'עדיין לא נבחר מארז') + (c.delivery_date ? ' · אספקה ' + esc(date(c.delivery_date)) : '') + '</span></div>' +
				'<strong class="day-qty num">' + (totalQty(c) == null ? '—' : fmt(totalQty(c))) + '</strong>' +
				(edit ? '<div class="day-date">' + dateInput('pd-' + c.id, c.pack_date, { 'data-change': 'schedDate', 'data-id': c.id, 'data-key': 'pack_date' }, 'תאריך אריזה: ' + c.name) + '</div>' : '') + '</li>';
		}).join('');
		return '<section class="day-card" data-day="' + key + '" aria-labelledby="dh-' + key + '">' +
			'<header class="day-head"><div class="stack-4"><h2 class="day-title" id="dh-' + key + '">' + esc(dayTitle(g.date)) + '</h2>' +
			'<span class="small muted">' + g.rows.length + ' לקוחות · ' + fmt(total) + ' מארזים' + (total ? ' · נארזו ' + fmt(doneQty) : '') + '</span></div>' +
			'<div class="row day-tools" style="gap:8px">' + dayPills(g.date, doneN, g.rows.length) +
			'<button type="button" class="btn btn-sm btn-secondary" data-act="pickToggle" data-key="' + key + '" aria-expanded="' + open + '">' + ic('checklist') + 'רשימת ליקוט</button>' +
			'<button type="button" class="icon-btn" data-act="printDay" data-key="' + key + '" aria-label="הדפסת ' + esc(dayTitle(g.date)) + '" title="הדפסה">' + ic('print') + '</button></div></header>' +
			(total ? '<div class="day-meter">' + meter(doneQty, total) + '</div>' : '') +
			'<ul class="day-list">' + rows + '</ul>' +
			'<div class="day-pick' + (open ? ' open' : '') + '"><h3 class="h3">' + ic('checklist') + ' רשימת ליקוט ל' + esc(dayTitle(g.date)) + '</h3>' + pickList(g.rows) + '</div></section>';
	}
	function deliveryDay(g, edit) {
		var total = 0, doneN = 0, withPoint = 0;
		g.rows.forEach(function (r) { total += Number(r.qty) || 0; if (r.point) { withPoint++; if (r.delivered) doneN++; } });
		var key = 'd' + (g.date || 'none');
		var rows = g.rows.map(function (r) {
			var c = r.client, p = r.point;
			if (!p) {
				return '<li class="day-row"><span class="day-check"></span><div class="day-main"><a class="day-name" href="#/client/' + c.id + '">' + esc(c.name) + '</a>' +
					'<span class="day-sub">אין עדיין נקודות אספקה. מוסיפים בכרטיס הלקוח או מחכים לטופס.</span></div>' +
					'<strong class="day-qty num">' + (r.qty == null ? '—' : fmt(r.qty)) + '</strong>' +
					(edit ? '<div class="day-date">' + dateInput('dd-' + c.id, c.delivery_date, { 'data-change': 'schedDate', 'data-id': c.id, 'data-key': 'delivery_date' }, 'תאריך אספקה: ' + c.name) + '</div>' : '') + '</li>';
			}
			var id = 'dl-' + c.id + '-' + p.id;
			var place = [p.city, p.address].filter(Boolean).join(', ') || 'נקודה ללא כתובת';
			var extra = [p.region, p.person ? 'איש קשר: ' + p.person : '', p.manual ? 'פריקה ידנית: ' + p.manual : '', p.forklift ? 'מלגזה: ' + p.forklift : '', p.notes].filter(Boolean).join(' · ');
			return '<li class="day-row' + (r.delivered ? ' is-done' : '') + '">' +
				'<label class="day-check" for="' + id + '"><input id="' + id + '" type="checkbox"' + (r.delivered ? ' checked' : '') + (edit ? '' : ' disabled') + ' data-change="schedDelivered" data-id="' + c.id + '" data-point="' + esc(p.id) + '"><span class="sr-only">סופק: ' + esc(c.name) + ', ' + esc(place) + '</span></label>' +
				'<div class="day-main"><span class="day-name-row"><a class="day-name" href="#/client/' + c.id + '">' + esc(c.name) + '</a><span class="day-place">' + ic('location_on') + esc(place) + '</span></span>' +
				(extra ? '<span class="day-sub">' + esc(extra) + '</span>' : '') + '</div>' +
				'<strong class="day-qty num">' + (r.qty == null ? '—' : fmt(r.qty)) + '</strong>' +
				(edit ? '<div class="day-date">' + dateInput('dd-' + c.id + '-' + p.id, r.date, { 'data-change': 'schedPointDate', 'data-id': c.id, 'data-point': p.id }, 'תאריך אספקה: ' + c.name + ', ' + place) + '</div>' : '') + '</li>';
		}).join('');
		return '<section class="day-card" data-day="' + key + '" aria-labelledby="dh-' + key + '">' +
			'<header class="day-head"><div class="stack-4"><h2 class="day-title" id="dh-' + key + '">' + esc(dayTitle(g.date)) + '</h2>' +
			'<span class="small muted">' + g.rows.length + ' עצירות · ' + fmt(total) + ' מארזים' + (withPoint ? ' · סופקו ' + doneN + ' מתוך ' + withPoint : '') + '</span></div>' +
			'<div class="row day-tools" style="gap:8px">' + dayPills(g.date, doneN, withPoint) +
			'<button type="button" class="icon-btn" data-act="printDay" data-key="' + key + '" aria-label="הדפסת ' + esc(dayTitle(g.date)) + '" title="הדפסה">' + ic('print') + '</button></div></header>' +
			(withPoint ? '<div class="day-meter">' + meter(doneN, withPoint) + '</div>' : '') +
			'<ul class="day-list">' + rows + '</ul></section>';
	}
	function viewSchedule() {
		var edit = canSchedule();
		var tab = S.ui.schedTab || 'pack';
		var clients = S.data.clients.filter(function (c) { return linesOf(c).some(function (l) { return l.box; }) || (c.points || []).length; });
		var packGroups = groupByDate(clients.filter(function (c) { return linesOf(c).some(function (l) { return l.box; }); }), function (c) { return c.pack_date; });
		var dels = [];
		clients.forEach(function (c) { dels = dels.concat(deliveriesOf(c)); });
		var delGroups = groupByDate(dels);

		var boxesAll = 0, boxesPacked = 0, noPack = 0;
		clients.forEach(function (c) { var q = totalQty(c) || 0; boxesAll += q; if (c.packed_at) boxesPacked += q; if (!c.pack_date) noPack++; });
		var stops = dels.filter(function (d) { return d.point; }), stopsDone = stops.filter(function (d) { return d.delivered; }).length;
		var noDel = dels.filter(function (d) { return !d.date; }).length;
		var t = todayIso();
		var nextPack = packGroups.filter(function (g) { return g.date && g.date >= t && g.rows.some(function (c) { return !c.packed_at; }); })[0];
		var late = packGroups.filter(function (g) { return g.date && g.date < t && g.rows.some(function (c) { return !c.packed_at; }); }).length +
			delGroups.filter(function (g) { return g.date && g.date < t && g.rows.some(function (r) { return r.point && !r.delivered; }); }).length;
		var heroQty = nextPack ? nextPack.rows.reduce(function (s, c) { return s + (c.packed_at ? 0 : totalQty(c) || 0); }, 0) : 0;

		var body = tab === 'pack'
			? (packGroups.length ? packGroups.map(function (g) { return packDay(g, edit); }).join('') : '')
			: (delGroups.length ? delGroups.map(function (g) { return deliveryDay(g, edit); }).join('') : '');
		if (!body) body = '<div class="card card-pad"><div class="empty empty-art"><img src="' + esc(CFG.art + 'dancer.webp') + '" alt="" width="300" height="426"><strong>עדיין אין מה לתזמן</strong><span class="muted">כשיהיו לקוחות עם מארזים, הם יופיעו כאן לפי יום האריזה ויום האספקה.</span></div></div>';

		return '<div class="page-head"><div class="stack-6"><span class="eyebrow">' + esc(S.data.texts.season) + '</span><h1 class="h1">אריזה ואספקה</h1><p class="lead">מה אורזים בכל יום, מה צריך ללקט ולאן יוצאת כל אספקה</p></div></div>' +
			'<div class="stats">' +
			'<div class="stat stat-hero' + (late ? ' stat-alert' : '') + '">' + heroArt(late ? 'strawberry' : undefined) + '<div class="stat-top"><span class="stat-label">' + (late ? 'ימים באיחור' : (nextPack ? 'האריזה הבאה' : 'אין אריזה מתוזמנת')) + '</span>' + ic(late ? 'warning' : 'inventory_2') + '</div>' +
			'<div><div class="stat-value">' + (late ? late : fmt(heroQty)) + '</div><div class="stat-sub">' + (late ? 'יש ימים שעברו ולא הושלמו' : (nextPack ? 'מארזים · ' + dayTitle(nextPack.date) : 'קבעו תאריכי אריזה למטה')) + '</div></div></div>' +
			stat('מארזים שנארזו', fmt(boxesPacked), fmt(boxesAll), 'package_2', meter(boxesPacked, boxesAll)) +
			stat('אספקות שבוצעו', stopsDone, stops.length, 'local_shipping', meter(stopsDone, stops.length)) +
			stat('בלי תאריך', tab === 'pack' ? noPack : noDel, undefined, 'event', '<span class="small muted">' + (tab === 'pack' ? 'לקוחות בלי יום אריזה' : 'אספקות בלי יום') + '</span>') +
			'</div>' +
			'<div class="row-between sched-bar"><div class="seg" role="tablist" aria-label="תצוגה">' +
			'<button type="button" role="tab" aria-selected="' + (tab === 'pack') + '" data-act="schedTab" data-tab="pack">' + ic('inventory_2') + 'ימי אריזה</button>' +
			'<button type="button" role="tab" aria-selected="' + (tab === 'deliver') + '" data-act="schedTab" data-tab="deliver">' + ic('local_shipping') + 'ימי אספקה</button></div>' +
			(edit ? '<span class="small muted">בוחרים תאריך בכל שורה כדי להעביר אותה ליום אחר.</span>' : '') + '</div>' +
			'<div class="days">' + body + '</div>';
	}

	/* ---------------- purchasing ---------------- */

	var GROUP_WORD = { boxes: 'מארז', accessories: 'נספק', ingredients: 'תכולה' };
	function supplierById(id) { return S.data.catalog.suppliers.filter(function (s) { return s.id === id; })[0]; }
	function catItem(group, id) { return (S.data.catalog[group] || []).filter(function (x) { return x.id === id; })[0]; }
	function unitOf(group, item) { return group === 'ingredients' && item && item.unit === 'ק״ג' ? 'ק״ג' : 'יח׳'; }
	function roundUp(group, item, v) { return unitOf(group, item) === 'ק״ג' ? Math.ceil(v * 10) / 10 : Math.ceil(v); }
	function onOrderMap() {
		var m = {};
		S.data.orders.forEach(function (o) {
			if (o.status === 'received') return;
			o.items.forEach(function (it) { var k = it.group + ':' + it.id; m[k] = (m[k] || 0) + (Number(it.qty) || 0); });
		});
		return m;
	}
	/** Everything still missing after stock and open orders. */
	function shortages() {
		var need = requirements(), st = S.data.stock, on = onOrderMap(), out = [];
		['boxes', 'accessories', 'ingredients'].forEach(function (g) {
			S.data.catalog[g].forEach(function (it) {
				var n = need[g][it.id] || 0;
				if (!n) return;
				var have = Number(st[g][it.id]) || 0, coming = on[g + ':' + it.id] || 0;
				var miss = n - have - coming;
				if (miss > 0.0001) out.push({ group: g, item: it, need: n, stock: have, coming: coming, miss: roundUp(g, it, miss), supplier: it.supplier && supplierById(it.supplier) ? it.supplier : '' });
			});
		});
		return out;
	}
	function orderText(o) {
		var sup = supplierById(o.supplier);
		return 'הזמנה מס\' ' + o.no + ' – ' + (S.data.texts.brand || '') + (sup ? '\nלכבוד: ' + sup.name : '') + '\n\n' +
			o.items.map(function (it) { var x = catItem(it.group, it.id); return (x ? (it.group === 'boxes' ? 'מארז ' : '') + x.name : '?') + ': ' + fmt(it.qty, 2) + ' ' + unitOf(it.group, x); }).join('\n') +
			(o.note ? '\n\n' + o.note : '') + '\n\nתודה!';
	}
	function orderCard(o, edit) {
		var sup = supplierById(o.supplier);
		var st = { draft: ['טיוטה', 'gray', 'edit_note'], ordered: ['הוזמן, ממתין לסחורה', 'client', 'schedule'], received: ['התקבל', 'ok', 'check_circle'] }[o.status];
		var items = o.items.map(function (it, j) {
			var x = catItem(it.group, it.id), unit = unitOf(it.group, x), iid = 'oq-' + o.id + '-' + j;
			var qty = o.status === 'draft' && edit
				? '<label class="sr-only" for="' + iid + '">כמות להזמנה</label><input id="' + iid + '" class="cell" type="number" min="0" step="any" inputmode="decimal" value="' + esc(it.qty) + '" data-change="orderQty" data-order="' + esc(o.id) + '" data-j="' + j + '"> <span class="small muted">' + unit + '</span>'
				: '<span class="num">' + fmt(it.qty, 2) + ' ' + unit + '</span>';
			var got = o.status === 'ordered' && edit
				? '<td><label class="sr-only" for="og-' + o.id + '-' + j + '">התקבל בפועל</label><input id="og-' + o.id + '-' + j + '" class="cell" type="number" min="0" step="any" inputmode="decimal" value="' + esc(it.got == null ? it.qty : it.got) + '" data-change="orderGot" data-order="' + esc(o.id) + '" data-j="' + j + '"> <span class="small muted">' + unit + '</span></td>'
				: (o.status === 'received' ? '<td class="num">' + fmt(it.got == null ? it.qty : it.got, 2) + ' ' + unit + '</td>' : '');
			return '<tr><th scope="row"><span class="person">' + (it.group === 'boxes' ? thumb(x, 'sm') : thumb(x && (x.image || it.group === 'ingredients') ? x : { emoji: (x && x.emoji) || '📦' }, 'sm', 'nutrition')) + '<span>' + esc(x ? x.name : 'פריט שנמחק') + '<span class="small muted"> · ' + GROUP_WORD[it.group] + '</span></span></span></th>' +
				'<td>' + qty + '</td>' + got +
				(o.status === 'draft' && edit ? '<td class="c"><button type="button" class="icon-btn danger" data-act="orderItemRemove" data-order="' + esc(o.id) + '" data-j="' + j + '" aria-label="הסרת ' + esc(x ? x.name : 'הפריט') + ' מההזמנה">' + ic('close') + '</button></td>' : '') + '</tr>';
		}).join('');
		var actions = '';
		if (edit && o.status === 'draft') actions = '<button type="button" class="btn btn-primary btn-sm" data-act="orderSend" data-id="' + esc(o.id) + '">' + ic('send') + 'סימון כהוזמן</button>' +
			'<button type="button" class="btn btn-secondary btn-sm" data-act="orderCopy" data-id="' + esc(o.id) + '">' + ic('content_copy') + 'העתקה לספק</button>' +
			'<button type="button" class="btn btn-ghost btn-sm" data-act="orderDelete" data-id="' + esc(o.id) + '">' + ic('delete') + 'מחיקה</button>';
		if (edit && o.status === 'ordered') actions = '<button type="button" class="btn btn-primary btn-sm" data-act="orderReceive" data-id="' + esc(o.id) + '">' + ic('warehouse') + 'הסחורה הגיעה</button>' +
			'<button type="button" class="btn btn-secondary btn-sm" data-act="orderCopy" data-id="' + esc(o.id) + '">' + ic('content_copy') + 'העתקה לספק</button>' +
			'<button type="button" class="btn btn-ghost btn-sm" data-act="orderBack" data-id="' + esc(o.id) + '">' + ic('undo') + 'חזרה לטיוטה</button>';
		var meta = [o.created_by ? 'נוצרה ע״י ' + o.created_by : '', o.created_at ? when(o.created_at) : '', o.ordered_at ? 'הוזמן ' + when(o.ordered_at) : '', o.received_at ? 'התקבל ' + when(o.received_at) : ''].filter(Boolean).join(' · ');
		return '<article class="order-card is-' + o.status + '"><div class="row-between"><div class="stack-4"><h3 class="h3">הזמנה ' + o.no + ' · ' + esc(sup ? sup.name : 'ללא ספק') + '</h3><span class="small muted">' + esc(meta) + '</span></div>' + pill(st[0], st[1], st[2]) + '</div>' +
			'<div class="table-wrap"><table class="t t-compact"><thead><tr>' + th('פריט', 'category') + th(o.status === 'received' ? 'הוזמן' : 'כמות', 'shopping_cart') + (o.status === 'ordered' && edit ? th('התקבל בפועל', 'warehouse') : (o.status === 'received' ? th('התקבל', 'warehouse') : '')) + (o.status === 'draft' && edit ? '<th scope="col"><span class="sr-only">הסרה</span></th>' : '') + '</tr></thead><tbody>' + (items || emptyRow(3, 'אין פריטים בהזמנה.', 'gem')) + '</tbody></table></div>' +
			(o.status !== 'received' && edit ? field('on-' + o.id, 'הערה לספק', '<input id="on-' + o.id + '" class="input" value="' + esc(o.note || '') + '" data-change="orderNote" data-id="' + esc(o.id) + '">', 'notes') : (o.note ? '<p class="p0 small muted">' + esc(o.note) + '</p>' : '')) +
			(actions ? '<div class="row" style="gap:8px;flex-wrap:wrap">' + actions + '</div>' : '') + '</article>';
	}
	function purchaseTab() {
		var edit = canEdit('purchase');
		var cat = S.data.catalog, sups = cat.suppliers;
		var miss = shortages();
		var bySup = {};
		miss.forEach(function (m) { (bySup[m.supplier] = bySup[m.supplier] || []).push(m); });
		var supOpts = function (sel) {
			return '<option value="">בחירת ספק</option>' + sups.map(function (s) { return '<option value="' + esc(s.id) + '"' + (s.id === sel ? ' selected' : '') + '>' + esc(s.name) + '</option>'; }).join('');
		};
		function missRows(list, assign) {
			return list.map(function (m) {
				var unit = unitOf(m.group, m.item), sid = 'sa-' + m.group + '-' + m.item.id;
				return '<tr><th scope="row"><span class="person">' + (m.group === 'boxes' ? thumb(m.item, 'sm') : thumb(m.item.image || m.group === 'ingredients' ? m.item : { emoji: m.item.emoji || '📦' }, 'sm', 'nutrition')) + '<span>' + esc(m.item.name) + '<span class="small muted"> · ' + GROUP_WORD[m.group] + '</span></span></span></th>' +
					'<td class="num">' + fmt(m.need, 2) + '</td><td class="num">' + fmt(m.stock, 2) + (m.coming ? '<span class="small muted"> + ' + fmt(m.coming, 2) + ' בדרך</span>' : '') + '</td>' +
					'<td class="num"><strong>' + fmt(m.miss, 2) + ' ' + unit + '</strong></td>' +
					(assign ? '<td>' + (edit ? '<label class="sr-only" for="' + sid + '">ספק של ' + esc(m.item.name) + '</label><select id="' + sid + '" class="select cell-select" data-change="supplierAssign" data-group="' + m.group + '" data-id="' + esc(m.item.id) + '">' + supOpts('') + '</select>' : '') + '</td>' : '') + '</tr>';
			}).join('');
		}
		var head = '<thead><tr>' + th('פריט', 'category') + th('נדרש', 'assignment') + th('במלאי', 'warehouse') + th('חסר', 'shopping_cart');
		var cards = sups.filter(function (s) { return bySup[s.id]; }).map(function (s) {
			var list = bySup[s.id];
			return '<article class="sup-card"><div class="row-between"><div class="stack-4"><h3 class="h3">' + esc(s.name) + '</h3><span class="small muted">' + list.length + ' פריטים חסרים' + (s.phone ? ' · ' + esc(s.phone) : '') + '</span></div>' +
				(edit ? '<button type="button" class="btn btn-primary btn-sm" data-act="orderCreate" data-supplier="' + esc(s.id) + '">' + ic('add_shopping_cart') + 'יצירת הזמנה</button>' : '') + '</div>' +
				'<div class="table-wrap"><table class="t t-compact">' + head + '</tr></thead><tbody>' + missRows(list, false) + '</tbody></table></div></article>';
		}).join('');
		var loose = bySup[''] || [];
		var looseCard = loose.length ? '<article class="sup-card is-loose"><div class="row-between"><div class="stack-4"><h3 class="h3">עדיין בלי ספק</h3><span class="small muted">' + loose.length + ' פריטים. ' + (sups.length ? 'בוחרים ספק לכל פריט והוא עובר לרשימה שלו.' : 'קודם מוסיפים ספק למטה.') + '</span></div>' +
			(edit ? '<button type="button" class="btn btn-secondary btn-sm" data-act="orderCreate" data-supplier="">' + ic('add_shopping_cart') + 'הזמנה בלי ספק</button>' : '') + '</div>' +
			'<div class="table-wrap"><table class="t t-compact">' + head + th('ספק', 'storefront') + '</tr></thead><tbody>' + missRows(loose, true) + '</tbody></table></div></article>' : '';

		var open = S.data.orders.filter(function (o) { return o.status !== 'received'; }).sort(function (a, b) { return (a.status === 'ordered') - (b.status === 'ordered') || b.no - a.no; });
		var done = S.data.orders.filter(function (o) { return o.status === 'received'; }).sort(function (a, b) { return b.no - a.no; });
		var showDone = S.ui.ordersDone;

		var supCards = sups.map(function (s, i) {
			function sf(key, label, icon, extra) {
				var id = 'sp-' + s.id + '-' + key;
				return field(id, label, '<input' + attrs(Object.assign({ id: id, class: 'input' + (key === 'email' || key === 'phone' ? ' input-ltr' : ''), value: s[key] || '', 'data-change': 'supplierField', 'data-i': i, 'data-key': key, disabled: !edit }, extra || {})) + '>', icon);
			}
			var count = ['boxes', 'accessories', 'ingredients'].reduce(function (n, g) { return n + cat[g].filter(function (x) { return x.supplier === s.id; }).length; }, 0);
			return '<article class="pcard"><div class="row-between"><span class="person">' + avatar(s.name) + '<span class="stack-4"><strong>' + esc(s.name) + '</strong><span class="small muted">' + count + ' פריטים</span></span></span>' +
				(edit ? '<button type="button" class="icon-btn danger" data-act="supplierRemove" data-i="' + i + '" aria-label="מחיקת הספק ' + esc(s.name) + '">' + ic('delete') + '</button>' : '') + '</div>' +
				sf('name', 'שם הספק', 'storefront') + sf('phone', 'טלפון', 'call', { type: 'tel' }) + sf('email', 'מייל', 'mail', { type: 'email' }) + sf('notes', 'הערות (ימי אספקה, מינימום הזמנה…)', 'notes') + '</article>';
		}).join('');

		// what each supplier supplies – only needed for items that are not short right now
		var totalMiss = miss.length;
		return '<section class="card" aria-labelledby="pm-h"><div class="card-head"><div class="stack-4">' + sectionTitle('pm-h', 'shopping_cart', 'מה צריך להזמין') +
			'<span class="small muted">' + (totalMiss ? totalMiss + ' פריטים חסרים, אחרי מה שבמלאי ומה שכבר בהזמנה' : 'אין מה להזמין: המלאי וההזמנות הפתוחות מכסים את כל ההזמנות') + '</span></div>' +
			(totalMiss ? '<button type="button" class="btn btn-secondary btn-sm" data-act="copyBuy">' + ic('content_copy') + 'העתקת כל הרשימה</button>' : '') + '</div>' +
			'<div class="card-body">' + (totalMiss ? '<div class="sup-grid">' + cards + looseCard + '</div>' : '<div class="empty">' + shape('sunny') + 'הכול מכוסה.</div>') + '</div></section>' +
			'<section class="card" aria-labelledby="po-h"><div class="card-head"><div class="stack-4">' + sectionTitle('po-h', 'receipt_long', 'הזמנות רכש') +
			'<span class="small muted">' + open.length + ' פתוחות · ' + done.length + ' התקבלו</span></div>' +
			(done.length ? '<label class="check" for="orders-done"><input id="orders-done" type="checkbox"' + (showDone ? ' checked' : '') + ' data-change="ordersDone"> הצגת הזמנות שהתקבלו</label>' : '') + '</div>' +
			'<div class="card-body">' + (open.length || (showDone && done.length) ? '<div class="order-grid">' + open.concat(showDone ? done : []).map(function (o) { return orderCard(o, edit); }).join('') + '</div>' : '<p class="p0 muted">אין הזמנות פתוחות. יוצרים הזמנה מהרשימה למעלה.</p>') + '</div></section>' +
			'<section class="card" aria-labelledby="ps-h"><div class="card-head"><div class="stack-4">' + sectionTitle('ps-h', 'storefront', 'ספקים') + '<span class="small muted">' + sups.length + ' ספקים</span></div>' +
			(edit ? '<button type="button" class="btn btn-secondary" data-act="supplierAdd">' + ic('add') + 'ספק חדש</button>' : '') + '</div>' +
			'<div class="card-body">' + (supCards ? '<div class="pcards">' + supCards + '</div>' : '<div class="empty">' + shape('clover') + 'עדיין אין ספקים.</div>') + '</div></section>' +
			(sups.length ? supplierMatrix(edit) : '');
	}
	/** Who supplies what: one select per catalog item. */
	function supplierMatrix(edit) {
		var cat = S.data.catalog;
		var opts = function (sel) { return '<option value="">ללא ספק</option>' + cat.suppliers.map(function (s) { return '<option value="' + esc(s.id) + '"' + (s.id === sel ? ' selected' : '') + '>' + esc(s.name) + '</option>'; }).join(''); };
		var rows = [];
		[['boxes', 'מארז'], ['accessories', 'נספק'], ['ingredients', 'תכולה']].forEach(function (g) {
			cat[g[0]].forEach(function (it) {
				var sid = 'sm-' + g[0] + '-' + it.id, cur = it.supplier && supplierById(it.supplier) ? it.supplier : '';
				rows.push('<tr><th scope="row">' + esc(it.name) + '</th><td class="small muted">' + g[1] + '</td><td>' +
					(edit ? '<label class="sr-only" for="' + sid + '">ספק של ' + esc(it.name) + '</label><select id="' + sid + '" class="select cell-select" data-change="supplierAssign" data-group="' + g[0] + '" data-id="' + esc(it.id) + '">' + opts(cur) + '</select>' : esc(cur ? supplierById(cur).name : '—')) + '</td></tr>');
			});
		});
		var open = S.ui.supMatrix;
		return '<section class="card" aria-labelledby="pw-h"><div class="card-head"><div class="stack-4">' + sectionTitle('pw-h', 'hub', 'מי מספק מה') + '<span class="small muted">לכל פריט בוחרים ספק פעם אחת, ומאז החוסרים שלו מופיעים ברשימה של הספק.</span></div>' +
			'<button type="button" class="btn btn-ghost btn-sm" data-act="supMatrix" aria-expanded="' + !!open + '">' + ic(open ? 'expand_less' : 'expand_more') + (open ? 'הסתרה' : 'הצגת ' + rows.length + ' הפריטים') + '</button></div>' +
			(open ? '<div class="table-wrap freeze freeze-1"><table class="t t-compact"><thead><tr>' + th('פריט', 'category') + th('סוג', 'label') + th('ספק', 'storefront') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>' : '') + '</section>';
	}
	function saveSuppliers(body) {
		saving();
		return api('PUT', 'suppliers', body).then(function (r) {
			var c = r.catalog;
			S.data.catalog.suppliers = c.suppliers || [];
			['boxes', 'accessories', 'ingredients'].forEach(function (g) {
				var map = {}; (c[g] || []).forEach(function (x) { map[x.id] = x.supplier || ''; });
				S.data.catalog[g].forEach(function (x) { x.supplier = map[x.id] || ''; });
			});
			S.data.revs.catalog = r.rev;
			saved(); render();
		}).catch(function (e) { saveFailed(); fail(e); load(); });
	}
	function schedSave(clientId, body) {
		var c = clientById(clientId);
		if (!c) return;
		saving();
		return api('PUT', 'schedule/' + c.id, body).then(function (r) {
			var i = S.data.clients.indexOf(c);
			if (i >= 0) S.data.clients[i] = r.client;
			if (S.ui.history) delete S.ui.history[c.id];
			saved(); render();
		}).catch(function (e) { saveFailed(); fail(e); load(); });
	}

	/* ---------- client card ---------- */

	/**
	 * M3 filled text field: the label sits inside the field and floats up when there is a value or focus.
	 * Anything that isn't a single control (a row with a button…) falls back to a label above it.
	 */
	function field(id, label, html, icon) {
		if (!/^<(input|select|textarea)\b/.test(html)) {
			return '<div class="field"><label for="' + id + '">' + esc(label) + '</label>' + html + '</div>';
		}
		var float = /placeholder="[^" ]/.test(html) || /type="(date|file)"/.test(html) || /^<select/.test(html);
		if (!/placeholder=/.test(html) && /^<(input|textarea)/.test(html)) html = html.replace(/^<(input|textarea)/, '<$1 placeholder=" "');
		return '<div class="field tf' + (icon ? ' has-icon' : '') + (float ? ' tf-float' : '') + '">' + (icon ? ic(icon, 'tf-icon') : '') + html + '<label for="' + id + '">' + esc(label) + '</label></div>';
	}
	var FIELD_ICONS = { name: 'storefront', contact: 'person', contact_email: 'mail', contact_phone: 'call', spots: 'location_on', rep: 'badge', close_date: 'event', pack_date: 'inventory_2', delivery_date: 'local_shipping', status: 'flag', notes: 'notes' };
	function input(c, key, label, type, extra) {
		var id = 'c-' + key;
		var v = c[key] == null ? '' : c[key];
		if (type === 'date') {
			var iso = String(v).slice(0, 10);
			return field(id, label, '<input' + attrs(Object.assign({
				id: id, class: 'input date-input', type: 'text', readonly: true, inputmode: 'none', autocomplete: 'off',
				value: dateLabel(iso), placeholder: 'בחירת תאריך', 'data-date': iso, 'aria-haspopup': 'dialog',
				'data-change': 'clientField', 'data-key': key, disabled: !canEdit('clients')
			}, extra || {})) + '>', FIELD_ICONS[key]);
		}
		return field(id, label, '<input' + attrs(Object.assign({
			id: id, class: 'input' + (type === 'email' || type === 'tel' ? ' input-ltr' : ''), type: type || 'text', value: v,
			'data-change': 'clientField', 'data-key': key, disabled: !canEdit('clients')
		}, extra || {})) + '>', FIELD_ICONS[key]);
	}

	function viewClient() {
		var c = clientById(S.route.id);
		if (!c) return '<a class="back" href="#/clients">' + ic('arrow_forward') + 'כל הלקוחות</a><p>הלקוח לא נמצא, או שאין לך גישה אליו.</p>';
		var edit = canEdit('clients');
		var t = S.data.texts;

		var statuses = t.statuses.slice();
		if (c.status && statuses.indexOf(c.status) < 0) statuses.unshift(c.status);
		var statusOpts = '<option value="">ללא</option>' + statuses.map(function (s) {
			return '<option' + (s === c.status ? ' selected' : '') + '>' + esc(s) + '</option>';
		}).join('');
		var repField = S.data.me.role === 'sales'
			? field('c-rep', 'נציג מכירות', '<input id="c-rep" class="input" value="' + esc(c.rep) + '" disabled>', 'badge')
			: input(c, 'rep', 'נציג מכירות', 'text', { list: 'reps-list' }) +
				'<datalist id="reps-list">' + S.data.reps.map(function (r) { return '<option value="' + esc(r) + '">'; }).join('') + '</datalist>';

		var details = '<section class="card card-pad" aria-labelledby="order-h">' + sectionTitle('order-h', 'receipt_long', 'פרטי ההזמנה') + '<div class="grid-fields">' +
			input(c, 'name', 'שם הלקוח') +
			input(c, 'contact', 'איש קשר') +
			input(c, 'contact_email', 'מייל איש קשר', 'email') +
			input(c, 'contact_phone', 'טלפון איש קשר', 'tel') +
			input(c, 'spots', 'מספר נקודות אספקה', 'number', { min: 0, inputmode: 'numeric' }) +
			repField +
			input(c, 'close_date', 'תאריך סגירה', 'date') +
			input(c, 'pack_date', 'תאריך אריזה', 'date') +
			input(c, 'delivery_date', 'תאריך אספקה', 'date') +
			field('c-status', 'סטטוס', '<select id="c-status" class="select" data-change="clientField" data-key="status"' + (edit ? '' : ' disabled') + '>' + statusOpts + '</select>', 'flag') +
			'</div>' +
			'<fieldset class="extras"><legend>מוצרים נלווים</legend><div class="row" style="gap:8px">' + extrasList().map(function (o, i) {
				var on = hasExtra(c, o);
				return '<label class="chip-check' + (on ? ' on' : '') + '" for="ex-' + i + '"><input id="ex-' + i + '" type="checkbox"' + (on ? ' checked' : '') + (edit ? '' : ' disabled') + ' data-change="extraToggle" data-opt="' + esc(o) + '">' + ic(on ? 'check' : (/כרטיס/.test(o) ? 'mail' : 'redeem')) + '<span>' + esc(o) + '</span></label>';
			}).join('') + '</div></fieldset>' +
			field('c-notes', 'הערות', '<textarea id="c-notes" class="textarea" style="min-height:80px" data-change="clientField" data-key="notes"' + (edit ? '' : ' disabled') + '>' + esc(c.notes || '') + '</textarea>', 'notes') +
			'</section>';

		var nx = nextStep(c).first;
		var list = S.data.clients, at = list.indexOf(c);
		var prev = list[at - 1], next = list[at + 1];
		var pager = list.length > 1 ? '<div class="pager" role="navigation" aria-label="מעבר בין לקוחות">' +
			(prev ? '<a class="icon-btn" href="#/client/' + prev.id + '" title="' + esc(prev.name) + '" aria-label="הלקוח הקודם: ' + esc(prev.name) + '">' + ic('chevron_right') + '</a>' : '<span class="icon-btn is-off" aria-hidden="true">' + ic('chevron_right') + '</span>') +
			'<span class="pager-pos num">' + (at + 1) + ' / ' + list.length + '</span>' +
			(next ? '<a class="icon-btn" href="#/client/' + next.id + '" title="' + esc(next.name) + '" aria-label="הלקוח הבא: ' + esc(next.name) + '">' + ic('chevron_left') + '</a>' : '<span class="icon-btn is-off" aria-hidden="true">' + ic('chevron_left') + '</span>') +
			'</div>' : '';
		var danger = canEdit('settings') ? '<section class="danger-zone" aria-labelledby="dz-h"><div class="stack-4"><h2 class="h3" id="dz-h">מחיקת הלקוח</h2><span class="small muted">מוחק את ההזמנה, הצעדים ונקודות האספקה. אפשר לשחזר רק מגיבוי.</span></div>' +
			'<button type="button" class="btn btn-danger btn-sm" data-act="deleteClient">' + ic('delete') + 'מחיקת ' + esc(c.name) + '</button></section>' : '';
		return '<div class="row-between client-top"><a class="back" href="#/clients">' + ic('arrow_forward') + 'כל הלקוחות</a>' + pager + '</div>' +
			'<div class="page-head"><div class="stack-6"><span class="eyebrow">לקוח מס\' ' + esc(c.no) + (c.rep ? ' · ' + esc(c.rep) : '') + '</span><h1 class="h1">' + esc(c.name) + '</h1>' +
			'<div class="row" style="margin-top:6px">' + (nx ? pill('הצעד הבא: ' + nx.label, nx.owner === 'us' ? 'us' : 'client') : pill('הכול סגור', 'ok')) + (c.status ? pill(c.status, 'gray', 'flag') : '') + '</div></div>' +
			'</div>' +
			'<div class="client-layout"><div class="client-main">' +
			details +
			linesSection(c, edit) +
			contentsSection(c, edit) +
			'<div class="split"><div class="side">' + stepsSection(c, edit) + formSection(c, edit) + pointsSection(c, edit) + '</div>' +
			'<div class="wide">' + mailSection(c) + '</div></div>' +
			historySection(c) +
			danger +
			'</div>' + onThisPage(c) + '</div>';
	}

	/** "On this page" navigation for the long client page: a side rail on wide screens, a chip row on narrow ones. */
	function onThisPage(c) {
		var steps = c.steps || [];
		var done = steps.filter(function (s) { return s.done; }).length;
		var pts = c.points || [];
		var opening = steps.filter(function (s) { return s.key === 'opening'; })[0];
		var lines = linesOf(c).filter(function (l) { return l.box; }).length;
		var items = [
			['order-h', 'receipt_long', 'פרטי ההזמנה', c.status || ''],
			['lines-h', 'package_2', 'מארזים', totalQty(c) ? fmt(totalQty(c)) + ' מארזים' : 'טרם נבחר'],
			['contents-h', 'nutrition', 'תכולה', lines ? (lines > 1 ? lines + ' סוגים' : 'סוג אחד') : ''],
			['steps-h', 'checklist', 'צעדים', steps.length ? done + ' מתוך ' + steps.length : '', steps.length ? done / steps.length : null],
			['form-h', 'assignment', 'טופס אספקה', c.form_status === 'received' ? 'התקבל' : 'ממתין'],
			['points-h', 'local_shipping', 'נקודות אספקה', pts.length ? pts.length + (c.spots ? ' מתוך ' + c.spots : '') : 'אין עדיין'],
			['mail-h', 'mail', 'מייל פתיחה', opening ? (opening.done ? 'נשלח' : 'לא נשלח') : ''],
			['history-h', 'history', 'היסטוריה', '']
		];
		var active = S.ui.otp || 'order-h';
		return '<nav class="otp" aria-label="בעמוד הזה">' +
			'<div class="otp-card">' +
			'<span class="otp-eyebrow">בעמוד הזה</span>' +
			'<p class="otp-title">' + esc(c.name) + '</p>' +
			'<ol class="otp-list">' + items.map(function (it) {
				var on = it[0] === active;
				return '<li><a class="otp-link' + (on ? ' on' : '') + '" href="#' + it[0] + '" data-act="otpGo" data-target="' + it[0] + '"' + (on ? ' aria-current="location"' : '') + '>' +
					ic(it[1]) + '<span class="otp-text"><span class="otp-label">' + it[2] + '</span>' +
					(it[3] ? '<span class="otp-hint">' + esc(it[3]) + '</span>' : '') +
					(it[4] != null ? '<span class="otp-meter" aria-hidden="true"><span style="width:' + Math.round(it[4] * 100) + '%"></span></span>' : '') +
					'</span></a></li>';
			}).join('') + '</ol>' +
			'<div class="otp-art" aria-hidden="true"><img src="' + esc(CFG.art + 'leaf.webp') + '" alt="" class="otp-wheat" width="40" height="172"><img src="' + esc(CFG.art + 'strawberry.webp') + '" alt="" class="otp-berry" width="96" height="129"></div>' +
			'</div></nav>';
	}
	/* Scroll-spy: highlight the section being read (works with every re-render, and at the page bottom). */
	var otpTick = false, otpLock = 0;
	function otpUpdate() {
		otpTick = false;
		if (Date.now() < otpLock) return; // a click on the nav is scrolling us there
		var links = document.querySelectorAll('.otp-link');
		if (!links.length) return;
		var band = window.innerHeight * 0.35, id = null, lastVisible = null;
		Array.prototype.forEach.call(links, function (a) {
			var h = document.getElementById(a.dataset.target);
			if (!h) return;
			var sec = h.closest('section, form') || h, r = sec.getBoundingClientRect();
			if (r.top <= band) id = a.dataset.target;
			if (r.top < window.innerHeight && r.bottom > 0) lastVisible = a.dataset.target;
		});
		var atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
		if (atBottom && lastVisible) id = lastVisible;
		otpSet(id || links[0].dataset.target);
	}
	function otpWatch() { if (document.querySelector('.otp')) requestAnimationFrame(otpUpdate); }
	/* Extended FAB collapses to its icon while scrolling down, expands again near the top or when scrolling up. */
	var fabY = 0;
	window.addEventListener('scroll', function () {
		var f = document.querySelector('.fab'), y = window.scrollY;
		if (f) f.classList.toggle('is-compact', y > 160 && y > fabY);
		fabY = y;
	}, { passive: true });
	window.addEventListener('scroll', function () {
		if (!otpTick && S.route && S.route.name === 'client') { otpTick = true; requestAnimationFrame(otpUpdate); }
	}, { passive: true });
	function otpSet(id) {
		if (S.ui.otp === id) return;
		S.ui.otp = id;
		Array.prototype.forEach.call(document.querySelectorAll('.otp-link'), function (a) {
			var on = a.dataset.target === id;
			a.classList.toggle('on', on);
			if (on) {
				a.setAttribute('aria-current', 'location');
				var row = a.closest('.otp-list');
				if (row && row.scrollWidth > row.clientWidth) {
					var r = a.getBoundingClientRect(), rr = row.getBoundingClientRect();
					if (r.left < rr.left || r.right > rr.right) row.scrollBy({ left: r.left - rr.left - (rr.width - r.width) / 2, behavior: 'smooth' });
				}
			} else a.removeAttribute('aria-current');
		});
	}

	function linesSection(c, edit) {
		var ls = linesOf(c);
		var total = totalQty(c);
		var cards = ls.map(function (l, i) {
			var b = boxById(l.box);
			var opts = '<option value="">בחירת מארז</option>' + S.data.catalog.boxes.map(function (x) {
				return '<option value="' + esc(x.id) + '"' + (x.id === l.box ? ' selected' : '') + '>' + esc(x.name) + '</option>';
			}).join('');
			return '<div class="line">' + thumb(b, 'lg') +
				'<div class="line-body">' +
				'<div class="row-between" style="gap:8px"><span class="eyebrow">מארז ' + (i + 1) + '</span>' +
				(edit ? '<button type="button" class="icon-btn danger" aria-label="הסרת ' + esc(b ? b.name : 'המארז') + ' מההזמנה" title="הסרה מההזמנה" data-act="lineRemove" data-i="' + i + '">' + ic('delete') + '</button>' : '') + '</div>' +
				field('ln-box-' + i, 'סוג מארז', '<select id="ln-box-' + i + '" class="select" data-change="lineBox" data-i="' + i + '"' + (edit ? '' : ' disabled') + '>' + opts + '</select>', 'package_2') +
				field('ln-qty-' + i, 'כמות', '<input id="ln-qty-' + i + '" class="input" type="number" min="0" inputmode="numeric" value="' + esc(l.qty == null ? '' : l.qty) + '" data-change="lineQty" data-i="' + i + '"' + (edit ? '' : ' disabled') + '>', 'stacks') +
				(Array.isArray(l.contents) ? '<span class="small muted row" style="gap:4px">' + ic('edit', 'sm') + 'תכולה מותאמת</span>' : '') +
				'</div></div>';
		}).join('');

		var picker = '';
		if (edit && S.ui.pickBox) {
			picker = '<div class="picker" role="group" aria-label="בחירת מארז להוספה">' + S.data.catalog.boxes.map(function (b) {
				var n = ls.filter(function (l) { return l.box === b.id; }).length;
				return '<button type="button" class="pick" data-act="lineAdd" data-box="' + esc(b.id) + '">' + thumb(b, 'md') + '<span class="pick-name">' + esc(b.name) + '</span>' + (n ? '<span class="pick-badge">' + ic('check', 'sm') + 'בהזמנה</span>' : '') + '</button>';
			}).join('') + '</div>';
		}

		return '<section class="card card-pad" aria-labelledby="lines-h">' +
			'<div class="row-between"><div class="stack-6">' + sectionTitle('lines-h', 'package_2', 'מארזים בהזמנה') +
			'<p class="p0 muted">' + (ls.length ? ls.length + ' סוגי מארזים' + (total ? ' · ' + fmt(total) + ' מארזים בסך הכול' : '') : 'עדיין לא נבחר מארז. אפשר להוסיף כמה סוגים לאותה הזמנה.') + '</p></div>' +
			(edit ? '<button type="button" class="btn ' + (S.ui.pickBox ? 'btn-ghost' : 'btn-primary') + '" data-act="togglePick" aria-expanded="' + !!S.ui.pickBox + '">' + ic(S.ui.pickBox ? 'close' : 'add') + (S.ui.pickBox ? 'סגירה' : 'הוספת מארז להזמנה') + '</button>' : '') + '</div>' +
			picker +
			(cards ? '<div class="lines">' + cards + '</div>' : '') +
			'</section>';
	}

	function contentsSection(c, edit) {
		var ls = linesOf(c).filter(function (l) { return l.box; });
		if (!ls.length) {
			return '<section class="card card-pad">' + sectionTitle('contents-h', 'nutrition', 'תכולת המארז') + '<p class="p0 muted">הוסיפו מארז להזמנה כדי לראות את התכולה.</p></section>';
		}
		var idx = Math.min(S.ui.lineIdx || 0, ls.length - 1);
		var line = ls[idx];
		var li = linesOf(c).indexOf(line);
		var eff = contentsOfLine(line);
		var on = {};
		eff.forEach(function (it) { on[it.id] = it; });
		var grams = 0;
		eff.forEach(function (it) { var ing = ingById(it.id); if (ing && ing.unit === 'ק״ג' && it.grams) grams += Number(it.grams); });
		var q = Number(line.qty) || 0;
		var custom = Array.isArray(line.contents);
		var seg = ls.length > 1 ? '<div class="seg" role="tablist" aria-label="בחירת מארז">' + ls.map(function (l, i) {
			return '<button type="button" role="tab" aria-selected="' + (i === idx) + '" data-act="lineTab" data-i="' + i + '">' + thumb(boxById(l.box), 'xs') + esc(boxName(l.box)) + (l.qty ? ' <span class="num">× ' + fmt(l.qty) + '</span>' : '') + '</button>';
		}).join('') + '</div>' : '';

		var missing = eff.filter(function (it) { return it.grams === null || it.grams === undefined; }).length;
		var shown = S.data.catalog.ingredients.filter(function (ing) { return matches(ing, 'ingQ') && (!S.ui.onlyIn || on[ing.id]); });
		var cards = shown.map(function (ing) {
			var sel = on[ing.id];
			var isUnit = ing.unit !== 'ק״ג';
			var unit = isUnit ? 'יח׳' : 'גרם';
			var body = '<span class="small muted">לא במארז</span>';
			if (sel) {
				var pid = 'pk-' + ing.id, gid = 'g-' + ing.id;
				var manual = !sel.pack;
				body = '<label class="sr-only" for="' + pid + '">נספק עבור ' + esc(ing.name) + '</label>' +
					'<select id="' + pid + '" class="select item-pack" data-change="itemPack" data-line="' + li + '" data-id="' + esc(ing.id) + '"' + (edit ? '' : ' disabled') + '>' + packOptions(ing, sel.pack, true, manual) + '</select>' +
					(manual
						? '<label class="item-grams" for="' + gid + '"><input id="' + gid + '" type="number" min="0" inputmode="decimal" value="' + esc(sel.grams == null ? '' : sel.grams) + '" data-change="itemGrams" data-line="' + li + '" data-id="' + esc(ing.id) + '"' + (edit ? '' : ' disabled') + '> ' + (isUnit ? 'יחידות למארז' : 'גרם למארז') + '</label>'
						: (sel.grams === null
							? '<span class="item-meta warn">' + ic('hourglass_top', 'sm') + 'עוד לא נמדד ב' + esc((accById(sel.pack) || {}).name || 'נספק') + '</span>'
							: '<span class="item-meta">' + ic('scale', 'sm') + '<span class="num">' + fmt(sel.grams) + '</span> ' + unit + ' למארז</span>'));
			}
			return '<div class="item' + (sel ? ' on' : '') + '">' +
				'<label class="item-toggle" for="t-' + esc(ing.id) + '"><input id="t-' + esc(ing.id) + '" type="checkbox"' + (sel ? ' checked' : '') + (edit ? '' : ' disabled') + ' data-change="itemToggle" data-line="' + li + '" data-id="' + esc(ing.id) + '">' + thumb(ing, 'sm', 'nutrition') + '<span class="item-name">' + esc(ing.name) + '</span>' + ic(sel ? 'check_circle' : 'add_circle') + '</label>' +
				body + '</div>';
		}).join('');
		var tools = '<div class="row filter-row">' + searchBox('ing-search', 'ingQ', 'חיפוש בתכולה') +
			'<label class="chip-check' + (S.ui.onlyIn ? ' on' : '') + '" for="only-in"><input id="only-in" type="checkbox"' + (S.ui.onlyIn ? ' checked' : '') + ' data-change="onlyIn">' + ic(S.ui.onlyIn ? 'check' : 'filter_list') + '<span>רק מה שבמארז</span></label>' +
			'<span class="small muted">' + shown.length + ' מתוך ' + S.data.catalog.ingredients.length + '</span></div>';

		var bn = esc(boxName(line.box));
		return '<section class="card card-pad" aria-labelledby="contents-h">' +
			'<div class="row-between"><div class="stack-6">' + sectionTitle('contents-h', 'nutrition', ls.length > 1 ? 'תכולת המארזים' : 'תכולת מארז ' + bn) +
			'<p class="p0 muted">' + (custom ? 'התכולה של ' + bn + ' הותאמה ללקוח הזה.' : 'זו התכולה הרגילה של מארז ' + bn + '. סימון או ביטול של פריט ישמור תכולה מותאמת ללקוח.') + '</p></div>' +
			(edit && custom ? '<button type="button" class="btn btn-secondary" data-act="resetContents" data-line="' + li + '">' + ic('restart_alt') + 'איפוס לתכולת ' + bn + '</button>' : '') + '</div>' +
			seg +
			'<div class="summary" role="status">' + ic('package_2', 'fill') + '<strong>' + eff.length + ' פריטים במארז</strong><span class="num">' + fmt(grams) + ' גרם למארז</span>' +
			(q ? '<span class="num">' + fmt(grams * q / 1000, 1) + ' ק״ג ל-' + fmt(q) + ' מארזים</span>' : '<span>הזינו כמות כדי לחשב סה״כ</span>') + '</div>' +
			(missing ? '<div class="alert alert-warn">' + ic('hourglass_top', 'fill') + '<div>' + missing + ' פריטים עוד בלי משקל: הנספק שלהם טרם נמדד. אפשר להזין מדידות בהגדרות › מדידות נספקים.</div></div>' : '') +
			tools +
			(cards ? '<div class="items">' + cards + '</div>' : '<p class="p0 muted">אין תכולות שמתאימות לחיפוש.</p>') + '</section>';
	}

	function stepsSection(c, edit) {
		var steps = c.steps || [];
		var items = steps.map(function (s, i) {
			return '<li class="step' + (s.done ? ' done' : '') + '">' +
				'<label class="tick" for="s-done-' + i + '"><input id="s-done-' + i + '" type="checkbox"' + (s.done ? ' checked' : '') + (edit ? '' : ' disabled') + ' data-change="stepDone" data-i="' + i + '"><span class="sr-only">בוצע: ' + esc(s.label) + '</span>' + ic(s.done ? 'check_circle' : 'radio_button_unchecked') + '</label>' +
				'<span class="step-label">' + esc(s.label) + '</span>' +
				(edit
					? '<label class="sr-only" for="s-owner-' + i + '">אצל מי</label><select id="s-owner-' + i + '" class="select" data-change="stepOwner" data-i="' + i + '"><option value="us"' + (s.owner === 'us' ? ' selected' : '') + '>אצלנו</option><option value="client"' + (s.owner === 'client' ? ' selected' : '') + '>אצל הלקוח</option></select>' +
						'<button type="button" class="icon-btn danger" aria-label="הסרת הצעד ' + esc(s.label) + '" data-act="stepRemove" data-i="' + i + '">' + ic('close') + '</button>'
					: (s.done ? pill('בוצע', 'ok') : pill(s.owner === 'us' ? 'אצלנו' : 'אצל הלקוח', s.owner === 'us' ? 'us' : 'client'))) +
				'</li>';
		}).join('');
		return '<section class="card card-pad" aria-labelledby="steps-h">' + sectionTitle('steps-h', 'checklist', 'צעדים') +
			'<ul class="steps">' + (items || '<li class="muted">אין צעדים.</li>') + '</ul>' +
			(edit ? '<form class="row" data-submit="addStep"><label class="sr-only" for="new-step">צעד חדש</label><input id="new-step" class="input" style="flex:1 1 200px;width:auto" placeholder="צעד חדש" value="' + esc(S.ui.newStep) + '" data-input="newStep"><button type="submit" class="btn btn-secondary">' + ic('add') + 'הוספה</button></form>' : '') +
			'</section>';
	}

	function formSection(c, edit) {
		var answers = Array.isArray(c.form_answers) ? c.form_answers : [];
		var link = formLink(c);
		return '<section class="card card-pad" aria-labelledby="form-h"><div class="row-between">' + sectionTitle('form-h', 'assignment', 'טופס אספקה') +
			(c.form_status === 'received' ? pill('התקבל' + (c.form_received_at ? ' ' + date(c.form_received_at) : ''), 'ok') : pill('ממתין ללקוח', 'warn')) + '</div>' +
			(answers.length ? '<dl class="answers">' + answers.map(function (a) { return '<dt>' + esc(a.label) + '</dt><dd>' + esc(a.value) + '</dd>'; }).join('') + '</dl>'
				: '<p class="p0 muted small">כשהלקוח ממלא את הטופס ב-Tally, התשובות יופיעו כאן והסטטוס יתעדכן לבד.</p>') +
			'<div class="row">' +
			(link ? '<button type="button" class="btn btn-secondary btn-sm" data-act="copyLink">' + ic('link') + 'העתקת לינק לטופס</button>' : '') +
			(edit ? '<button type="button" class="btn btn-ghost btn-sm" data-act="toggleForm">' + ic(c.form_status === 'received' ? 'undo' : 'task_alt') + (c.form_status === 'received' ? 'סימון כממתין' : 'סימון כהתקבל') + '</button>' : '') +
			'</div></section>';
	}

	function pointsSection(c, edit) {
		var pts = c.points || [];
		var total = pts.reduce(function (s, p) { return s + (Number(p.qty) || 0); }, 0);
		function pf(i, key, label, extra) {
			var id = 'p-' + i + '-' + key;
			return field(id, label, '<input' + attrs(Object.assign({ id: id, class: 'input', value: pts[i][key] == null ? '' : pts[i][key], 'data-change': 'pointField', 'data-i': i, 'data-key': key, disabled: !edit }, extra || {})) + '>');
		}
		var list = pts.map(function (p, i) {
			return '<div class="point"><div class="row-between"><h3 class="h3 row" style="gap:8px">' + ic('location_on', 'fill') + 'נקודה ' + (i + 1) + (p.city ? ' · ' + esc(p.city) : '') + '</h3>' +
				(edit ? '<button type="button" class="icon-btn danger" aria-label="הסרת נקודה ' + (i + 1) + '" data-act="pointRemove" data-i="' + i + '">' + ic('delete') + '</button>' : '') + '</div>' +
				'<div class="grid-fields" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">' +
				pf(i, 'city', 'עיר') + pf(i, 'region', 'אזור') + pf(i, 'address', 'כתובת') +
				pf(i, 'qty', 'כמות מארזים', { type: 'number', min: 0, inputmode: 'numeric' }) +
				pf(i, 'manual', 'פריקה ידנית') + pf(i, 'forklift', 'מלגזה במקום') +
				pf(i, 'person', 'איש קשר לתיאום') + pf(i, 'notes', 'אילוצים ובקשות') +
				field('p-' + i + '-date', 'תאריך אספקה לנקודה', dateInput('p-' + i + '-date', p.date, { 'data-change': 'pointField', 'data-i': i, 'data-key': 'date', placeholder: c.delivery_date ? 'כמו הלקוח: ' + date(c.delivery_date) : 'בחירת תאריך' }, 'תאריך אספקה לנקודה', !edit), 'event') +
				'</div></div>';
		}).join('');
		var ordered = totalQty(c);
		var warn = pts.length && ordered && total !== ordered ? '<div class="alert alert-warn">' + ic('warning', 'fill') + '<div>סך המארזים בנקודות (' + fmt(total) + ') לא שווה לכמות שהוזמנה (' + fmt(ordered) + ').</div></div>' : '';
		return '<section class="card card-pad" aria-labelledby="points-h">' + sectionTitle('points-h', 'local_shipping', 'נקודות אספקה') + warn +
			(list || '<p class="p0 muted">עדיין אין נקודות אספקה.</p>') +
			(edit ? '<button type="button" class="btn btn-secondary" style="align-self:flex-start" data-act="pointAdd">' + ic('add_location_alt') + 'הוספת נקודת אספקה</button>' : '') + '</section>';
	}

	/** Where the next email will be sent from, with the Gmail connect / disconnect control. */
	function senderBox() {
		var g = S.data.gmail || {}, me = S.data.me;
		if (g.connected && !g.broken) {
			return '<div class="sender-box is-gmail">' + ic('alternate_email') + '<div class="grow"><span class="small muted">נשלח מ</span><strong dir="ltr">' + esc(g.email) + '</strong></div>' +
				'<button type="button" class="btn btn-ghost btn-sm" data-act="gmailDisconnect">' + ic('link_off') + 'ניתוק</button></div>';
		}
		if (g.connected && g.broken) {
			return '<div class="sender-box is-broken">' + ic('error', 'fill') + '<div class="grow"><strong>החיבור ל-Gmail כבר לא בתוקף</strong><span class="small">עד שמחברים מחדש אי אפשר לשלוח מכאן מ-' + esc(g.email) + '.</span></div>' +
				'<a class="btn btn-primary btn-sm" href="' + esc(CFG.gmailUrl) + '">' + ic('link') + 'חיבור מחדש</a>' +
				'<button type="button" class="btn btn-ghost btn-sm" data-act="gmailDisconnect">שליחה דרך האתר</button></div>';
		}
		return '<div class="sender-box">' + ic('mail') + '<div class="grow"><span class="small muted">נשלח דרך האתר, בשם</span><strong>' + esc(me.name) + '</strong></div>' +
			(g.available ? '<a class="btn btn-secondary btn-sm" href="' + esc(CFG.gmailUrl) + '">' + ic('alternate_email') + 'שליחה מה-Gmail שלי</a>'
				: (canEdit('settings') ? '<button type="button" class="btn btn-ghost btn-sm" data-act="gmailSetup">' + ic('info') + 'איך שולחים מ-Gmail?</button>' : '')) + '</div>';
	}
	function mailStatus(c) {
		var m = c.mail || {}, rem = m.reminders || [];
		if (!m.sent_at) return '';
		var t = S.data.texts, max = Number(t.reminder_max) || 2, days = Number(t.reminder_days) || 3;
		var waiting = c.form_status !== 'received';
		var next = '';
		if (waiting && t.auto_remind && rem.length < max) {
			var last = parseIso((rem.length ? rem[rem.length - 1].at : m.sent_at));
			if (last) { last.setDate(last.getDate() + days); while (last.getDay() === 5 || last.getDay() === 6) last.setDate(last.getDate() + 1); next = 'תזכורת אוטומטית תצא ב-' + dateLabel(isoOf(last)) + ' אם הטופס לא יתקבל.'; }
		} else if (waiting && !t.auto_remind) next = 'תזכורות אוטומטיות כבויות. אפשר להפעיל אותן בהגדרות.';
		else if (waiting) next = 'נשלחו כל התזכורות (' + max + ').';
		return '<div class="mail-status' + (waiting ? '' : ' is-done') + '">' + ic(waiting ? 'mark_email_read' : 'task_alt', 'fill') + '<div class="stack-4">' +
			'<strong>נשלח ' + esc(when(m.sent_at)) + ' אל <span dir="ltr">' + esc(m.to || c.contact_email || '') + '</span>' + (m.by_name ? ' · ' + esc(m.by_name) : '') + '</strong>' +
			'<span class="small">' + (m.via === 'gmail' && m.from ? 'נשלח מהכתובת <span dir="ltr">' + esc(m.from) + '</span>' : 'נשלח דרך כתובת האתר') + '</span>' +
			rem.map(function (r, i) { return '<span class="small">תזכורת ' + (i + 1) + (r.auto ? ' (אוטומטית)' : '') + ' · ' + esc(when(r.at)) + (r.via === 'gmail' ? ' · Gmail' : '') + '</span>'; }).join('') +
			'<span class="small muted">' + (waiting ? next : 'הלקוח מילא את הטופס' + (c.form_received_at ? ' ב-' + esc(date(c.form_received_at)) : '') + '.') + '</span></div></div>';
	}
	function mailSection(c) {
		var edit = canEdit('clients');
		var sent = !!(c.mail && c.mail.sent_at);
		var waiting = c.form_status !== 'received';
		var m = buildEmail(c);
		var mailto = c.contact_email ? 'mailto:' + encodeURIComponent(c.contact_email) + '?subject=' + encodeURIComponent(m.subject) + '&body=' + encodeURIComponent(m.body) : '';
		return '<section class="card card-pad" aria-labelledby="mail-h">' + sectionTitle('mail-h', 'mail', 'מייל פתיחה ללקוח') +
			'<div class="mail-subject">' + ic('subject') + '<div class="stack-4"><span class="small muted" style="font-weight:700">נושא</span><strong>' + esc(m.subject) + '</strong></div></div>' +
			'<div class="mail mail-html">' + m.html + '</div>' +
			mailStatus(c) +
			(edit ? senderBox() : '') +
			'<div class="row" style="flex-wrap:wrap">' +
			(edit && !sent ? '<button type="button" class="btn btn-primary" data-act="mailSend" data-kind="opening"' + (c.contact_email ? '' : ' disabled') + '>' + ic('send') + 'שליחה ללקוח</button>' : '') +
			(edit && sent && waiting ? '<button type="button" class="btn btn-primary" data-act="mailSend" data-kind="reminder">' + ic('notifications_active') + 'שליחת תזכורת לטופס</button>' : '') +
			(edit && sent ? '<button type="button" class="btn btn-secondary" data-act="mailSend" data-kind="opening">' + ic('send') + 'שליחה חוזרת</button>' : '') +
			(edit ? '<button type="button" class="btn btn-secondary" data-act="mailSend" data-kind="test">' + ic('forward_to_inbox') + 'בדיקה אליי</button>' : '') +
			'</div>' +
			(edit && !c.contact_email ? '<p class="p0 small" style="color:var(--error)">כדי לשלוח מכאן צריך למלא "מייל איש קשר" בפרטי ההזמנה.</p>' : '') +
			'<details class="mail-more"><summary>שליחה ידנית מתוכנת המייל שלך</summary><div class="row" style="flex-wrap:wrap;margin-top:12px">' +
			'<button type="button" class="btn btn-secondary btn-sm" data-act="copyMail">' + ic('content_copy') + 'העתקת המייל</button>' +
			(mailto ? '<a class="btn btn-secondary btn-sm" href="' + esc(mailto) + '">' + ic('mail') + 'פתיחה בתוכנת המייל</a>' : '') +
			(edit ? '<button type="button" class="btn btn-ghost btn-sm" data-act="markOpening">' + ic('mark_email_read') + 'סימון שהמייל נשלח</button>' : '') +
			'</div><p class="p0 small muted" style="margin-top:8px">להדבקה ב-Gmail: מעתיקים כאן ומדביקים בגוף המייל, והקישורים יופיעו כטקסט קצר.</p></details>' +
			'<p class="p0 small muted">' + ((S.data.gmail || {}).connected ? 'המייל יוצא מה-Gmail שלך ונשמר אצלך ב"נשלחו".' : 'המייל יוצא מכתובת האתר, עם השם שלך. תשובות של הלקוח מגיעות ישירות אליך, ועותק של כל מייל נשלח גם אליך.') + ' את הנוסח משנים בהגדרות.</p></section>';
	}

	/* ---------- inventory ---------- */

	function viewInventory() {
		var need = requirements();
		var edit = canEdit('inventory');
		var st = S.data.stock;
		var cat = S.data.catalog;

		function stockInput(group, id, v) {
			if (!edit) return '<span class="num">' + (v == null ? '<span class="na">טרם הוזן</span>' : esc(fmt(v))) + '</span>';
			var iid = 'st-' + group + '-' + id;
			return '<label class="sr-only" for="' + iid + '">במלאי</label><input id="' + iid + '" class="cell" type="number" min="0" step="any" inputmode="decimal" value="' + esc(v == null ? '' : v) + '" data-change="stock" data-group="' + group + '" data-id="' + esc(id) + '">';
		}


		function stockField(group, id, v, label) {
			if (!edit) return '<div class="inv-stock"><span class="small muted">במלאי</span><strong class="num">' + (v == null ? '<span class="na">טרם הוזן</span>' : esc(fmt(v))) + '</strong></div>';
			var iid = 'st-' + group + '-' + id;
			return field(iid, 'במלאי', '<input id="' + iid + '" class="input" type="number" min="0" step="any" inputmode="decimal" value="' + esc(v == null ? '' : v) + '" aria-label="במלאי: ' + esc(label) + '" data-change="stock" data-group="' + group + '" data-id="' + esc(id) + '">', 'warehouse');
		}
		function invCard(group, item, n, s, img) {
			var short = n > (Number(s) || 0);
			return '<article class="inv-card' + (n && short ? ' is-short' : '') + (!n ? ' is-idle' : '') + '">' +
				'<div class="inv-head">' + img + '<div class="stack-4"><h3 class="inv-name">' + esc(item.name) + '</h3>' +
				'<span class="small muted">נדרש <strong class="num inv-need">' + fmt(n) + '</strong></span></div></div>' +
				stockField(group, item.id, s, item.name) + coverage(n, s, 'יח׳') + '</article>';
		}
		function byNeed(items, group) {
			return items.slice().sort(function (a, b) {
				var na_ = need[group][a.id] || 0, nb = need[group][b.id] || 0;
				var sa = na_ > (Number(st[group][a.id]) || 0), sb = nb > (Number(st[group][b.id]) || 0);
				return (sb - sa) || (nb - na_);
			});
		}
		var boxCards = byNeed(cat.boxes, 'boxes').map(function (b) { return invCard('boxes', b, need.boxes[b.id] || 0, st.boxes[b.id], thumb(b, 'md')); }).join('');
		var accCards = byNeed(cat.accessories, 'accessories').map(function (a) { return invCard('accessories', a, need.accessories[a.id] || 0, st.accessories[a.id], thumb({ emoji: a.emoji || '📦' }, 'md')); }).join('');

		var ings = cat.ingredients.map(function (i) {
			var n = need.ingredients[i.id] || 0;
			var s = st.ingredients[i.id];
			return { i: i, n: n, s: s, short: n > (Number(s) || 0) };
		});
		ings.sort(function (a, b) { return (b.short - a.short) || (b.n - a.n); });
		var hidden = 0;
		var ingRows = ings.filter(function (x) {
			if (!x.n && !S.ui.showUnneeded) { hidden++; return false; }
			return true;
		}).map(function (x) {
			var unit = x.i.unit === 'ק״ג' ? 'ק״ג' : 'יח׳';
			return '<tr><th scope="row"><span class="person">' + thumb(x.i, 'sm', 'nutrition') + '<span>' + esc(x.i.name) + '</span></span></th><td class="num">' + fmt(x.n, 2) + ' <span class="small muted">' + esc(unit) + '</span></td><td>' + stockInput('ingredients', x.i.id, x.s) + '</td>' +
				'<td style="min-width:240px">' + coverage(x.n, x.s, unit) + '</td></tr>';
		}).join('');

		// purchase list
		var buy = [];
		cat.boxes.forEach(function (b) { var d = (need.boxes[b.id] || 0) - (Number(st.boxes[b.id]) || 0); if (d > 0) buy.push({ name: 'מארז ' + b.name, need: need.boxes[b.id], stock: st.boxes[b.id] || 0, order: d, unit: 'יח׳' }); });
		cat.accessories.forEach(function (a) { var d = (need.accessories[a.id] || 0) - (Number(st.accessories[a.id]) || 0); if (d > 0) buy.push({ name: a.name, need: need.accessories[a.id], stock: st.accessories[a.id] || 0, order: d, unit: 'יח׳' }); });
		ings.forEach(function (x) { var d = x.n - (Number(x.s) || 0); if (d > 0) buy.push({ name: x.i.name, need: x.n, stock: x.s || 0, order: d, unit: x.i.unit === 'ק״ג' ? 'ק״ג' : x.i.unit }); });
		S.ui.buyText = buy.map(function (b) { return b.name + ': ' + fmt(Math.ceil(b.order * 100) / 100) + ' ' + b.unit; }).join('\n');

		var invTab = canView('purchase') && S.ui.invTab === 'purchase' ? 'purchase' : 'stock';
		var openOrders = S.data.orders.filter(function (o) { return o.status !== 'received'; }).length;
		var invTabs = canView('purchase') ? '<div class="tabs" role="tablist">' +
			'<button type="button" role="tab" aria-selected="' + (invTab === 'stock') + '" data-act="invTab" data-tab="stock">' + ic('warehouse') + 'מלאי</button>' +
			'<button type="button" role="tab" aria-selected="' + (invTab === 'purchase') + '" data-act="invTab" data-tab="purchase">' + ic('shopping_cart') + '<span class="tab-row">רכש' + (shortages().length ? ' <span class="tab-count" title="פריטים שחסרים">' + shortages().length + '</span>' : '') + (openOrders ? ' <span class="tab-count is-soft">' + openOrders + ' בהזמנה</span>' : '') + '</span></button></div>' : '';
		var buySection = false ? '<section class="card" aria-labelledby="buy-h"><div class="card-head"><div class="stack-4">' + sectionTitle('buy-h', 'shopping_cart', 'רשימת רכש') + '<span class="small muted">' +
			(buy.length ? buy.length + ' פריטים להזמין' : 'אין מה להזמין כרגע') + '</span></div>' +
			(buy.length ? '<button type="button" class="btn btn-primary" data-act="copyBuy">' + ic('content_copy') + 'העתקת הרשימה לספק</button>' : '') + '</div>' +
			(buy.length ? '<div class="table-wrap freeze freeze-1"><table class="t"><thead><tr>' + th('פריט', 'category') + '' + th('נדרש', 'assignment') + '' + th('במלאי', 'warehouse') + '' + th('להזמין', 'shopping_cart') + '</tr></thead><tbody>' +
				buy.map(function (b) { return '<tr><th scope="row">' + esc(b.name) + '</th><td class="num">' + fmt(b.need) + '</td><td class="num">' + fmt(b.stock) + '</td><td class="num"><strong>' + fmt(Math.ceil(b.order * 100) / 100) + ' ' + esc(b.unit) + '</strong></td></tr>'; }).join('') +
				'</tbody></table></div>' : '') + '</section>' : '';

		var groups = [['boxes', cat.boxes], ['accessories', cat.accessories], ['ingredients', cat.ingredients]];
		var needed = 0, shortN = 0;
		groups.forEach(function (g) { g[1].forEach(function (it) { var n = need[g[0]][it.id] || 0; if (n) { needed++; if (n > (Number(st[g[0]][it.id]) || 0)) shortN++; } }); });
		var boxesNeeded = 0; Object.keys(need.boxes).forEach(function (k) { boxesNeeded += need.boxes[k]; });
		var kg = 0; cat.ingredients.forEach(function (i) { if (i.unit === 'ק״ג') kg += need.ingredients[i.id] || 0; });

		return '<div class="page-head"><div class="stack-6"><span class="eyebrow">' + esc(S.data.texts.season) + '</span><h1 class="h1">' + (canView('purchase') ? 'מלאי ורכש' : 'מלאי') + '</h1><p class="lead">כמה נדרש לפי ההזמנות, כמה יש ומה חסר' + (edit ? '. אפשר לעדכן את המלאי ישירות כאן.' : '') + '</p></div></div>' +
			'<div class="stats">' +
			'<div class="stat stat-hero' + (shortN ? ' stat-alert' : '') + '">' + heroArt(shortN ? 'strawberry' : 'leaf') + '<div class="stat-top"><span class="stat-label">' + (shortN ? 'פריטים חסרים' : 'הכול מכוסה') + '</span>' + ic(shortN ? 'warning' : 'check_circle') + '</div>' +
			'<div><div class="stat-value">' + shortN + '</div><div class="stat-sub">מתוך ' + needed + ' פריטים נדרשים</div></div></div>' +
			stat('מכוסים', needed - shortN, needed, 'task_alt', meter(needed - shortN, needed)) +
			stat('מארזים נדרשים', fmt(boxesNeeded), undefined, 'package_2') +
			stat('תכולות נדרשות', fmt(kg, 1) + ' ק״ג', undefined, 'scale') +
			'</div>' +
			'<p class="note">' + ic('info') + '<span>הנדרש מחושב מכל הלקוחות שיש להם מארז וכמות: נספקים לפי מספר המארזים, ותכולות לפי התכולה של כל לקוח (רגילה או מותאמת) כפול הכמות. הקו האנכי בכל פס מסמן כמה נדרש; המילוי הוא מה שיש במלאי.</span></p>' +
			invTabs +
			(invTab === 'purchase' ? purchaseTab() :
			'<section class="card card-pad" aria-labelledby="boxes-h">' + sectionTitle('boxes-h', 'package_2', 'מלאי מארזים') + '<div class="inv-grid">' + boxCards + '</div></section>' +
			'<section class="card card-pad" aria-labelledby="acc-h">' + sectionTitle('acc-h', 'takeout_dining', 'מלאי נספקים') + '<div class="inv-grid">' + accCards + '</div></section>' +
			'<section class="card" aria-labelledby="ing-h"><div class="card-head">' + sectionTitle('ing-h', 'nutrition', 'מלאי תכולות') +
			'<label class="check" for="show-unneeded"><input id="show-unneeded" type="checkbox"' + (S.ui.showUnneeded ? ' checked' : '') + ' data-change="showUnneeded"> הצגת פריטים שלא נדרשים' + (hidden ? ' (' + hidden + ')' : '') + '</label></div>' +
			'<div class="table-wrap freeze freeze-1"><table class="t"><thead><tr>' + th('תכולה', 'nutrition') + th('נדרש', 'assignment') + th('במלאי', 'warehouse') + th('כיסוי', 'bar_chart') + '</tr></thead><tbody>' +
			(ingRows || emptyRow(4, 'אין תכולות נדרשות כרגע.', 'gem')) + '</tbody></table></div></section>');
	}

	/* ---------- settings ---------- */

	function viewSettings() {
		var tabs = [['recipes', 'תכולת מארזים', 'nutrition'], ['ingredients', 'חומרי גלם', 'category'], ['measure', 'מדידות נספקים', 'scale'], ['accessories', 'נספקים', 'takeout_dining'], ['texts', 'מייל ונוסחים', 'edit_note'], ['google', 'כניסה עם Google', 'key'], ['tally', 'טופס Tally', 'assignment'], ['backups', 'גיבויים', 'backup'], ['seasons', 'עונות', 'calendar_month'], ['history', 'היסטוריה', 'history'], ['updates', 'עדכונים', 'system_update_alt']];
		var tab = S.ui.settingsTab;
		var body = { recipes: settingsRecipes, ingredients: settingsIngredients, measure: settingsMeasure, accessories: settingsAccessories, texts: settingsTexts, google: settingsGoogle, tally: settingsTally, backups: settingsBackups, seasons: settingsSeasons, history: settingsHistory, updates: settingsUpdates }[tab]();
		return '<div class="page-head"><div class="stack-6"><span class="eyebrow">' + esc(S.data.texts.season) + '</span><h1 class="h1">הגדרות</h1><p class="lead">הנתונים שמהם מחושב המלאי, נוסח המייל, חיבורים וגיבויים</p></div></div>' +
			'<div class="tabs" role="tablist">' + tabs.map(function (t) {
				return '<button type="button" role="tab" id="tab-' + t[0] + '" aria-selected="' + (tab === t[0]) + '" data-act="settingsTab" data-tab="' + t[0] + '">' + ic(t[2]) + t[1] + '</button>';
			}).join('') + '</div>' + body;
	}

	/* ---------- box contents: one box at a time ---------- */
	function boxSummary(b) {
		var n = 0, grams = 0, units = 0, unmeasured = 0;
		S.data.catalog.ingredients.forEach(function (i) {
			var r = recipeItem(i, b.id);
			if (!r) return;
			n++;
			if (r.grams === null) unmeasured++;
			else if (i.unit === 'ק״ג') grams += Number(r.grams) || 0; else units += Number(r.grams) || 0;
		});
		return { n: n, grams: grams, units: units, unmeasured: unmeasured };
	}
	function settingsRecipes() {
		var cat = S.data.catalog, edit = canEdit('catalog');
		if (!cat.boxes.length) {
			return '<section class="card card-pad"><div class="empty empty-art"><img src="' + esc(CFG.art + 'dancer.webp') + '" alt="" width="300" height="426"><strong>עדיין אין מארזים</strong><span class="muted">מוסיפים מארז, ואז בוחרים מה נכנס אליו.</span>' +
				(edit ? '<button type="button" class="btn btn-primary" data-act="boxAdd">' + ic('add') + 'מארז חדש</button>' : '') + '</div></section>';
		}
		var box = boxById(S.ui.recBox) || cat.boxes[0];
		var picks = cat.boxes.map(function (b) {
			var s = boxSummary(b), on = b.id === box.id;
			return '<button type="button" class="box-pick' + (on ? ' on' : '') + '" role="tab" aria-selected="' + on + '" data-act="recBox" data-id="' + esc(b.id) + '">' + thumb(b, 'md') +
				'<span class="box-pick-text"><strong>' + esc(b.name) + '</strong><span class="small">' + (s.n ? s.n + ' פריטים · ' + fmt(s.grams) + ' ג׳' : 'ריק') + '</span></span>' +
				(s.unmeasured ? '<span class="box-pick-flag" title="יש פריטים שטרם נמדדו">' + ic('warning', 'fill') + '</span>' : '') + '</button>';
		}).join('');

		var sum = boxSummary(box);
		var inBox = [], outBox = [];
		cat.ingredients.forEach(function (i) { var r = recipeItem(i, box.id); if (r) inBox.push({ i: i, r: r }); else outBox.push(i); });
		inBox.sort(function (a, b) { return (Number(b.r.grams) || 0) - (Number(a.r.grams) || 0); });
		var maxG = inBox.reduce(function (m, x) { return x.i.unit === 'ק״ג' ? Math.max(m, Number(x.r.grams) || 0) : m; }, 0);

		var rows = inBox.map(function (x) {
			var i = x.i, r = x.r, unit = i.unit === 'ק״ג' ? 'ג׳' : 'יח׳', manual = !r.pack;
			var sid = 'r-' + i.id + '-' + box.id, gid = 'rg-' + i.id + '-' + box.id;
			var amount;
			if (manual && edit) amount = '<label class="sr-only" for="' + gid + '">כמות של ' + esc(i.name) + '</label><span class="rec-amount"><input id="' + gid + '" class="cell" type="number" min="0" step="any" inputmode="decimal" value="' + esc(r.grams == null ? '' : r.grams) + '" data-change="recipe" data-ing="' + esc(i.id) + '" data-box="' + esc(box.id) + '"><span class="small muted">' + unit + '</span></span>';
			else if (r.grams === null) amount = '<span class="rec-amount">' + pill('טרם נמדד', 'warn', 'scale') + '</span>';
			else amount = '<span class="rec-amount"><strong class="num">' + fmt(r.grams) + '</strong><span class="small muted">' + unit + '</span></span>';
			var share = i.unit === 'ק״ג' && maxG && r.grams ? Math.max(3, Math.round((Number(r.grams) / maxG) * 100)) : 0;
			return '<li class="rec-row">' + thumb(i, 'sm', 'nutrition') +
				'<div class="rec-main"><span class="rec-name">' + esc(i.name) + '</span>' +
				'<span class="rec-bar" aria-hidden="true"><span style="width:' + share + '%"></span></span></div>' +
				(edit ? '<label class="sr-only" for="' + sid + '">איך מודדים את ' + esc(i.name) + '</label><select id="' + sid + '" class="select rec-pack" data-change="recipePack" data-ing="' + esc(i.id) + '" data-box="' + esc(box.id) + '">' + packOptions(i, r.pack, true, manual).replace('<option value="">בחירת נספק</option>', '') + '</select>'
					: '<span class="small muted">' + esc(r.pack && accById(r.pack) ? accById(r.pack).name : 'כמות ידנית') + '</span>') +
				amount +
				(edit ? '<button type="button" class="icon-btn" data-act="recRemove" data-ing="' + esc(i.id) + '" data-box="' + esc(box.id) + '" aria-label="הוצאת ' + esc(i.name) + ' מהמארז" title="הוצאה מהמארז">' + ic('close') + '</button>' : '') + '</li>';
		}).join('');

		var q = (S.ui.recAdd || '').trim().toLowerCase();
		var avail = outBox.filter(function (i) { return !q || i.name.toLowerCase().indexOf(q) >= 0; });
		var adder = edit ? '<div class="rec-add"><div class="row-between"><h4 class="h3">' + ic('add_circle') + ' הוספה למארז</h4>' +
			'<div class="search rec-add-search"><label class="sr-only" for="rec-add">חיפוש חומר גלם להוספה</label>' + ic('search') + '<input id="rec-add" class="input" type="search" placeholder="חיפוש חומר גלם" value="' + esc(S.ui.recAdd || '') + '" data-input="recAdd"></div></div>' +
			(avail.length ? '<div class="add-chips">' + avail.map(function (i) {
				return '<button type="button" class="add-chip" data-act="recAddItem" data-ing="' + esc(i.id) + '" data-box="' + esc(box.id) + '">' + thumb(i, 'xs', 'nutrition') + '<span>' + esc(i.name) + '</span>' + ic('add') + '</button>';
			}).join('') + '</div>' : '<p class="p0 muted small">' + (outBox.length ? 'אין חומר גלם בשם הזה.' : 'כל חומרי הגלם כבר במארז.') + ' חומר גלם חדש מוסיפים בלשונית "חומרי גלם".</p>') + '</div>' : '';

		return '<div class="rec-layout">' +
			'<aside class="box-list" aria-label="מארזים"><div class="box-list-scroll" role="tablist" aria-orientation="vertical">' + picks + '</div>' +
			(edit ? '<button type="button" class="btn btn-secondary box-add" data-act="boxAdd">' + ic('add') + 'מארז חדש</button>' : '') + '</aside>' +
			'<section class="card rec-detail" aria-labelledby="rec-h">' +
			'<header class="rec-head">' +
			(edit ? '<button type="button" class="thumb-btn" data-act="setImage" data-group="boxes" data-id="' + esc(box.id) + '" title="החלפת תמונה" aria-label="החלפת התמונה של ' + esc(box.name) + '">' + thumb(box, 'lg') + '</button>' : thumb(box, 'lg')) +
			'<div class="rec-head-main"><span class="eyebrow">תכולת המארז</span>' +
			(edit ? '<label class="sr-only" for="bn-' + esc(box.id) + '">שם המארז</label><input id="bn-' + esc(box.id) + '" class="rec-title-input" value="' + esc(box.name) + '" data-change="boxName" data-id="' + esc(box.id) + '">' : '<h2 class="rec-title" id="rec-h">' + esc(box.name) + '</h2>') +
			'<div class="row rec-stats">' + pill(sum.n + ' פריטים', 'gray', 'nutrition') + pill(fmt(sum.grams) + ' גרם' + (sum.units ? ' + ' + fmt(sum.units) + ' יח׳' : ''), 'gray', 'scale') + (sum.unmeasured ? pill(sum.unmeasured + ' טרם נמדדו', 'warn', 'warning') : '') + '</div></div>' +
			(edit ? '<button type="button" class="icon-btn danger" data-act="boxRemove" data-id="' + esc(box.id) + '" aria-label="מחיקת המארז ' + esc(box.name) + '" title="מחיקת המארז">' + ic('delete') + '</button>' : '') +
			'</header>' +
			(edit ? '<h2 class="sr-only" id="rec-h">' + esc(box.name) + '</h2>' : '') +
			(rows ? '<ul class="rec-list">' + rows + '</ul>' : '<div class="empty">' + shape('flower') + 'המארז עדיין ריק. מוסיפים חומרי גלם מהרשימה למטה.</div>') +
			(sum.unmeasured ? '<p class="note">' + ic('info') + '<span>פריט שנבחר לו נספק לוקח את המשקל מלשונית "מדידות נספקים". עד שמודדים, הוא לא נספר במלאי.</span></p>' : '') +
			adder + '</section></div>';
	}
	/** Raw materials: names, units and photos in one plain list. */
	function settingsIngredients() {
		var cat = S.data.catalog, edit = canEdit('catalog');
		var shown = cat.ingredients.filter(function (i) { return matches(i, 'recQ'); });
		var rows = shown.map(function (i) {
			var used = cat.boxes.filter(function (b) { return recipeItem(i, b.id); });
			return '<li class="ing-row">' +
				(edit ? '<button type="button" class="thumb-btn" data-act="setImage" data-group="ingredients" data-id="' + esc(i.id) + '" title="החלפת תמונה" aria-label="החלפת התמונה של ' + esc(i.name) + '">' + thumb(i, 'sm', 'nutrition') + '</button>' : thumb(i, 'sm', 'nutrition')) +
				'<input class="cell ing-name" id="in-' + esc(i.id) + '" aria-label="שם חומר הגלם" value="' + esc(i.name) + '" data-change="ingField" data-id="' + esc(i.id) + '" data-key="name"' + (edit ? '' : ' disabled') + '>' +
				'<select class="select ing-unit" id="iu-' + esc(i.id) + '" aria-label="יחידת מידה של ' + esc(i.name) + '" data-change="ingField" data-id="' + esc(i.id) + '" data-key="unit"' + (edit ? '' : ' disabled') + '><option value="ק״ג"' + (i.unit === 'ק״ג' ? ' selected' : '') + '>נמדד במשקל</option><option value="יחידות"' + (i.unit === 'יחידות' ? ' selected' : '') + '>נספר ביחידות</option></select>' +
				'<span class="ing-used small muted" title="' + esc(used.map(function (b) { return b.name; }).join(', ')) + '">' + (used.length ? 'ב-' + used.length + ' מארזים' : 'לא בשימוש') + '</span>' +
				(edit ? '<button type="button" class="icon-btn danger" aria-label="מחיקת ' + esc(i.name) + '" data-act="ingRemove" data-id="' + esc(i.id) + '">' + ic('delete') + '</button>' : '') + '</li>';
		}).join('');
		return '<section class="card" aria-labelledby="ing2-h"><div class="card-head"><div class="stack-4">' + sectionTitle('ing2-h', 'nutrition', 'חומרי גלם') +
			'<span class="small muted">' + cat.ingredients.length + ' חומרי גלם. כאן קובעים שם, תמונה ואיך מודדים. מה נכנס לכל מארז קובעים בלשונית "תכולת מארזים".</span></div>' +
			searchBox('rec-search', 'recQ', 'חיפוש חומר גלם') + '</div>' +
			'<div class="card-body">' + (rows ? '<ul class="ing-list">' + rows + '</ul>' : '<div class="empty">' + shape('gem') + 'אין חומרי גלם שמתאימים לחיפוש.</div>') + '</div>' +
			(edit ? '<form class="row" style="padding:16px 28px;border-top:1px solid var(--outline-variant)" data-submit="addIng"><label class="sr-only" for="new-ing">חומר גלם חדש</label><input id="new-ing" class="input" style="max-width:320px" placeholder="חומר גלם חדש" value="' + esc(S.ui.newIng) + '" data-input="newIng"><button type="submit" class="btn btn-secondary">' + ic('add') + 'הוספה</button></form>' : '') + '</section>';
	}

	function settingsMeasure() {
		var cat = S.data.catalog;
		var used = {}; // ing|pack used in some box but not measured yet
		var missing = 0;
		cat.ingredients.forEach(function (i) {
			Object.keys(i.pack).forEach(function (box) {
				var pk = i.pack[box];
				if (pk && measured(i, pk) === null && !used[i.id + '|' + pk]) { used[i.id + '|' + pk] = true; missing++; }
			});
		});
		var head = cat.accessories.map(function (a) { return th(esc(a.emoji ? a.emoji + ' ' : '') + esc(a.name), '', ' class="c"'); }).join('');
		var rows = cat.ingredients.filter(function (i) { return matches(i, 'meaQ'); }).map(function (i) {
			var cells = cat.accessories.map(function (a) {
				var v = i.packs[a.id];
				var id = 'm-' + i.id + '-' + a.id;
				var need = used[i.id + '|' + a.id];
				return '<td class="c' + (need ? ' need' : '') + '"><label class="sr-only" for="' + id + '">' + esc(i.name) + ' ב' + esc(a.name) + '</label><input id="' + id + '" class="cell" type="number" min="0" step="any" value="' + esc(v == null ? '' : v) + '" placeholder="' + (need ? 'נדרש' : '') + '" data-change="measure" data-ing="' + esc(i.id) + '" data-acc="' + esc(a.id) + '"></td>';
			}).join('');
			return '<tr><th scope="row" style="white-space:nowrap"><span class="person">' + thumb(i, 'sm', 'nutrition') + '<span>' + esc(i.name) + ' <span class="small muted">(' + (i.unit === 'ק״ג' ? 'גרם' : 'יחידות') + ')</span></span></span></th>' + cells + '</tr>';
		}).join('');
		return '<section class="card" aria-labelledby="mea-h"><div class="card-head"><div class="stack-4">' + sectionTitle('mea-h', 'scale', 'מדידות נספקים') +
			'<span class="small muted">כמה גרם מכל מוצר נכנסים לכל נספק (במוצרים ביחידות: כמה יחידות). המשקל הזה נכנס אוטומטית לתכולת המארזים ולכרטיסי הלקוחות.' + (missing ? ' משבצות מסומנות עדיין צריכות מדידה (' + missing + ').' : '') + '</span></div>' +
			searchBox('mea-search', 'meaQ', 'חיפוש מוצר') + '</div>' +
			'<div class="table-wrap freeze freeze-1"><table class="t t-compact"><thead><tr>' + th('מוצר', 'nutrition') + head + '</tr></thead><tbody>' +
			(rows || emptyRow(cat.accessories.length + 1, 'אין מוצרים שמתאימים לחיפוש.', 'gem')) + '</tbody></table></div></section>';
	}

	function settingsAccessories() {
		var cat = S.data.catalog;
		var head = cat.boxes.map(function (b) { return '<th scope="col" class="c">' + esc(b.name) + '</th>'; }).join('');
		var rows = cat.accessories.map(function (a) {
			var cells = cat.boxes.map(function (b) {
				var v = a.per[b.id];
				var id = 'ac-' + a.id + '-' + b.id;
				return '<td class="c"><label class="sr-only" for="' + id + '">' + esc(a.name) + ' ב' + esc(b.name) + '</label><input id="' + id + '" class="cell" type="number" min="0" step="1" value="' + esc(v == null ? '' : v) + '" data-change="accPer" data-acc="' + esc(a.id) + '" data-box="' + esc(b.id) + '"></td>';
			}).join('');
			return '<tr><th scope="row" style="white-space:nowrap"><input class="cell cell-emoji" id="ae-' + esc(a.id) + '" aria-label="אימוג׳י" value="' + esc(a.emoji || '') + '" data-change="accField" data-id="' + esc(a.id) + '" data-key="emoji">' +
				'<input class="cell cell-wide" id="an-' + esc(a.id) + '" aria-label="שם הנספק" value="' + esc(a.name) + '" data-change="accField" data-id="' + esc(a.id) + '" data-key="name"></th>' + cells +
				'<td><button type="button" class="icon-btn danger" aria-label="מחיקת ' + esc(a.name) + '" data-act="accRemove" data-id="' + esc(a.id) + '">' + ic('close', 'sm') + '</button></td></tr>';
		}).join('');
		return '<section class="card" aria-labelledby="acs-h"><div class="card-head"><div class="stack-4">' + sectionTitle('acs-h', 'takeout_dining', 'נספקים במארזים') + '<span class="small muted">כמה יחידות מכל נספק (פלסטיקים) נכנסות למארז אחד.</span></div></div>' +
			'<div class="table-wrap freeze freeze-1"><table class="t t-compact"><thead><tr>' + th('נספק', 'takeout_dining') + head + '<th scope="col"><span class="sr-only">פעולות</span></th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
			'<form class="row" style="padding:16px 28px;border-top:1px solid var(--outline-variant)" data-submit="addAcc"><label class="sr-only" for="new-acc">נספק חדש</label><input id="new-acc" class="input" style="max-width:320px" placeholder="נספק חדש" value="' + esc(S.ui.newAcc) + '" data-input="newAcc"><button type="submit" class="btn btn-secondary">' + ic('add') + 'הוספה</button></form></section>';
	}

	function settingsTexts() {
		var t = S.data.texts;
		function f(key, label, type) {
			var id = 'tx-' + key;
			if (type === 'area') return field(id, label, '<textarea id="' + id + '" class="textarea" style="min-height:220px" name="' + key + '">' + esc(t[key] || '') + '</textarea>');
			return field(id, label, '<input id="' + id + '" class="input' + (type === 'url' ? ' input-ltr' : '') + '" type="' + (type || 'text') + '" name="' + key + '" value="' + esc(t[key] || '') + '">');
		}
		return '<form class="card card-pad" data-submit="saveTexts" aria-labelledby="tx-h">' + sectionTitle('tx-h', 'edit_note', 'מייל ונוסחים') +
			'<div class="grid-fields">' + f('brand', 'שם העסק') + f('season', 'שם העונה') + f('email_subject', 'נושא המייל') + f('form_base', 'קישור לטופס Tally', 'url') + f('card_designer_url', 'קישור לעיצוב כרטיס ברכה', 'url') + f('form_link_text', 'טקסט הקישור לטופס במייל') + f('card_link_text', 'טקסט הקישור לכרטיס הברכה במייל') + '</div>' +
			f('email_template', 'נוסח מייל הפתיחה', 'area') +
			'<p class="p0 small muted">מילים בסוגריים מסולסלים מתחלפות אוטומטית: {contact} איש הקשר, {client} שם הלקוח, {sender} השם שלך, {form_link} הקישור לטופס עם שם הלקוח (במייל המועתק יופיע כטקסט הקישור שלמעלה), {card_section} הפסקה על כרטיס ברכה (רק אם הלקוח הזמין כרטיס).</p>' +
			f('card_section', 'פסקת כרטיס הברכה', 'area') +
			'<fieldset class="set-group"><legend>' + ic('draw') + 'חתימה במייל</legend>' +
			'<p class="p0 small muted">מתווספת בסוף כל מייל שנשלח מהמערכת (מייל פתיחה ותזכורות) וגם למייל המועתק. השם הוא של מי ששולח.</p>' +
			'<label class="switch" for="tx-sig"><input id="tx-sig" type="checkbox" name="sig_on" value="1"' + (t.sig_on ? ' checked' : '') + '><span class="switch-track" aria-hidden="true"></span><span>הוספת חתימה</span></label>' +
			'<div class="grid-fields">' + f('sig_title', 'תפקיד') + f('sig_phone', 'טלפון', 'tel') + '</div>' +
			'<label class="switch" for="tx-siglogos"><input id="tx-siglogos" type="checkbox" name="sig_logos" value="1"' + (t.sig_logos ? ' checked' : '') + '><span class="switch-track" aria-hidden="true"></span><span>הצגת הלוגו ותו ISO 9001</span></label>' +
			'<div class="sig-preview" aria-label="תצוגה מקדימה של החתימה">' + (mailSignature(S.data.me.name).html || '<span class="muted small">החתימה כבויה.</span>') + '</div></fieldset>' +
			'<fieldset class="set-group"><legend>' + ic('notifications_active') + 'תזכורת לטופס האספקה</legend>' +
			'<p class="p0 small muted">נשלחת ללקוחות שקיבלו את מייל הפתיחה מהמערכת ועוד לא מילאו את הטופס. אפשר לשלוח ידנית מכרטיס הלקוח, או להפעיל שליחה אוטומטית.</p>' +
			'<label class="switch" for="tx-auto"><input id="tx-auto" type="checkbox" name="auto_remind" value="1"' + (t.auto_remind ? ' checked' : '') + '><span class="switch-track" aria-hidden="true"></span><span>שליחה אוטומטית, כל בוקר ב-9:00 (לא בשישי ושבת)</span></label>' +
			'<div class="grid-fields">' + f('reminder_days', 'כמה ימים לחכות בין מייל למייל', 'number') + f('reminder_max', 'כמה תזכורות לכל היותר', 'number') + f('reminder_subject', 'נושא התזכורת') + '</div>' +
			f('reminder_template', 'נוסח התזכורת', 'area') + '</fieldset>' +
			field('tx-statuses', 'סטטוסים לבחירה (אחד בכל שורה)', '<textarea id="tx-statuses" class="textarea" style="min-height:120px" name="statuses">' + esc(t.statuses.join('\n')) + '</textarea>') +
			field('tx-extras', 'מוצרים נלווים לסימון בכרטיס הלקוח (אחד בכל שורה)', '<textarea id="tx-extras" class="textarea" style="min-height:90px" name="extras">' + esc(extrasList().join('\n')) + '</textarea>') +
			'<div><button type="submit" class="btn btn-primary">' + ic('check') + 'שמירה</button></div></form>';
	}

	function settingsGoogle() {
		var a = S.data.appSettings || {};
		var on = a.google_client_id && a.google_secret_set;
		var gid = S.ui.google.id === null ? (a.google_client_id || '') : S.ui.google.id;
		return '<section class="card card-pad" aria-labelledby="g-h"><div class="row-between">' + sectionTitle('g-h', 'key', 'כניסה עם Google') + (on ? pill('פעיל', 'ok') : pill('לא מוגדר', 'gray')) + '</div>' +
			'<p class="p0 muted">עד שזה מוגדר, נכנסים עם חשבון האתר. אחרי ההגדרה, אנשי צוות שהוזמנו נכנסים עם חשבון Google שלהם, בלי סיסמה.</p>' +
			'<div class="grid-fields">' +
			field('g-origin', 'Authorized JavaScript origin (להעתקה ל-Google)', '<div class="row"><input id="g-origin" class="input input-ltr" readonly value="' + esc(a.origin) + '" style="flex:1;width:auto"><button type="button" class="btn btn-secondary btn-sm" data-act="copy" data-text="' + esc(a.origin) + '">' + ic('content_copy') + 'העתקה</button></div>') +
			field('g-redirect', 'Authorized redirect URI (להעתקה ל-Google)', '<div class="row"><input id="g-redirect" class="input input-ltr" readonly value="' + esc(a.redirect_uri) + '" style="flex:1;width:auto"><button type="button" class="btn btn-secondary btn-sm" data-act="copy" data-text="' + esc(a.redirect_uri) + '">' + ic('content_copy') + 'העתקה</button></div>') +
			'</div>' +
			'<form class="stack-16" data-submit="saveGoogle"><div class="grid-fields">' +
			field('g-id', 'Client ID', '<input id="g-id" class="input input-ltr" autocomplete="off" value="' + esc(gid) + '" data-input="googleId">') +
			field('g-secret', 'Client secret', '<input id="g-secret" class="input input-ltr" type="password" autocomplete="new-password" placeholder="' + (a.google_secret_set ? 'נשמר. השאירו ריק כדי לא לשנות' : '') + '" value="' + esc(S.ui.google.secret) + '" data-input="googleSecret">') +
			'</div><div class="row"><button type="submit" class="btn btn-primary">' + ic('check') + 'שמירה</button>' +
			(on ? '<button type="button" class="btn btn-danger" data-act="clearGoogle">' + ic('link_off') + 'ניתוק Google</button>' : '') + '</div></form>' +
			'<p class="p0 small muted">מדריך ההגדרה ב-Google Cloud: צרו פרויקט, מסך הסכמה עם openid, email ו-profile, ולקוח מסוג Web application עם שתי הכתובות שלמעלה.</p></section>' +
			'<section class="card card-pad" aria-labelledby="gm-h"><div class="row-between">' + sectionTitle('gm-h', 'alternate_email', 'שליחה מ-Gmail אישי') + (on ? pill('זמין לחיבור', 'ok') : pill('דורש כניסה עם Google', 'gray')) + '</div>' +
			'<p class="p0 muted">כל איש צוות יכול לחבר את ה-Gmail שלו מכרטיס לקוח, ואז המיילים שהוא שולח יוצאים מהכתובת שלו ונשמרים אצלו ב"נשלחו". ההרשאה היא לשליחה בלבד: המערכת לא יכולה לקרוא מיילים.</p>' +
			'<ol class="steps-list"><li>ב-Google Cloud, באותו פרויקט: <strong>APIs &amp; Services ← Library</strong>, מחפשים <strong>Gmail API</strong> ולוחצים Enable.</li>' +
			'<li>ב-<strong>OAuth consent screen ← Data access</strong> מוסיפים את ההרשאה <code dir="ltr">.../auth/gmail.send</code>.</li>' +
			'<li>ב-<strong>Audience</strong>: אם סוג המשתמשים הוא <strong>Internal</strong>, אין מה לשנות. אם הוא External, מעבירים ל-<strong>In production</strong>, כי במצב Testing החיבור פג כל 7 ימים.</li>' +
			'<li>אין צורך בכתובת redirect חדשה: משתמשים באותה כתובת שלמעלה.</li></ol>' +
			'<p class="note">' + ic('info') + '<span>באפליקציה מסוג Internal מתחברים רק עם חשבון Google של הארגון, בלי אזהרות ובלי הגבלות. כתובת ‎@gmail.com‎ פרטית אפשר לחבר רק אם האפליקציה External, ואז Google מציג פעם אחת אזהרה "Google hasn\'t verified this app" והמגבלה היא 100 משתמשים.</span></p></section>';
	}

	function settingsTally() {
		var a = S.data.appSettings || {};
		var un = a.tally_unmatched || [];
		return '<section class="card card-pad" aria-labelledby="ta-h">' + sectionTitle('ta-h', 'assignment', 'טופס אספקה ב-Tally') +
			'<p class="p0">כשלקוח ממלא את טופס האספקה, Tally שולח את התשובות לכאן. המערכת מוצאת את הלקוח לפי השדה הנסתר <code>name</code> שכבר נמצא בקישור, מסמנת שהטופס התקבל ושומרת את התשובות בכרטיס הלקוח.</p>' +
			'<ol class="p0" style="padding-inline-start:20px"><li>ב-Tally, פתחו את הטופס ובחרו <strong>Integrations › Webhooks › Connect</strong>.</li><li>הדביקו את הכתובת שלמטה ושמרו.</li><li>ודאו שבטופס יש שדה נסתר (Hidden field) בשם <code>name</code>.</li></ol>' +
			field('ta-url', 'כתובת ה-Webhook', '<div class="row"><input id="ta-url" class="input input-ltr" readonly value="' + esc(a.tally_url) + '" style="flex:1;width:auto"><button type="button" class="btn btn-secondary btn-sm" data-act="copy" data-text="' + esc(a.tally_url) + '">' + ic('content_copy') + 'העתקה</button></div>') +
			'<p class="p0 small muted">הכתובת כוללת מפתח סודי. אם היא דלפה, צרו מפתח חדש ועדכנו את Tally.</p>' +
			'<div><button type="button" class="btn btn-ghost" data-act="newTallyKey">' + ic('autorenew') + 'יצירת מפתח חדש</button></div>' +
			'<div class="divider"></div>' +
			'<div class="row-between"><h3 class="h3">טפסים שלא שויכו ללקוח (' + un.length + ')</h3>' + (un.length ? '<button type="button" class="btn btn-ghost" data-act="clearUnmatched">' + ic('clear_all') + 'ניקוי הרשימה</button>' : '') + '</div>' +
			(un.length ? un.slice().reverse().map(function (u) {
				return '<div class="point"><strong>' + esc(u.name || 'ללא שם') + ' · <span class="num">' + esc(u.at) + '</span></strong><dl class="answers">' +
					(u.answers || []).map(function (x) { return '<dt>' + esc(x.label) + '</dt><dd>' + esc(x.value) + '</dd>'; }).join('') + '</dl></div>';
			}).join('') : '<p class="p0 muted small">אין. טופס שהשם בו לא תואם לאף לקוח יופיע כאן.</p>') + '</section>';
	}

	function settingsBackups() {
		var a = S.data.appSettings || {};
		var b = S.ui.backups;
		if (b === null) {
			S.ui.backups = 'loading';
			api('GET', 'backups').then(function (r) { S.ui.backups = r.backups; render(); }).catch(function (e) { S.ui.backups = []; fail(e); render(); });
		}
		var list = Array.isArray(b) ? b : [];
		var rows = list.map(function (f) {
			var href = CFG.rest + 'backups/download?file=' + encodeURIComponent(f.file) + '&_wpnonce=' + encodeURIComponent(CFG.nonce);
			var kind = /before-restore/.test(f.file) ? 'לפני שחזור' : (/manual/.test(f.file) ? 'ידני' : 'יומי');
			return '<tr><td class="num">' + esc(f.created) + '</td><td>' + esc(kind) + '</td><td class="num">' + fmt(f.size / 1024, 0) + ' KB</td>' +
				'<td><div class="row" style="gap:6px"><a class="btn btn-secondary btn-sm" href="' + esc(href) + '" download>' + ic('download') + 'הורדה</a><button type="button" class="btn btn-ghost btn-sm" data-act="restoreFrom" data-file="' + esc(f.file) + '">' + ic('history') + 'שחזור</button></div></td></tr>';
		}).join('');
		return '<section class="card" aria-labelledby="bk-h"><div class="card-head"><div class="stack-4">' + sectionTitle('bk-h', 'backup', 'גיבויים') +
			'<span class="small muted">כל לילה ב-02:00 נשמר קובץ Excel עם כל הנתונים. נשמרים 30 הגיבויים האחרונים.' + (a.last_backup ? ' הגיבוי האחרון: ' + esc(a.last_backup) + '.' : '') + '</span></div>' +
			'<button type="button" class="btn btn-primary" data-act="backupNow">' + ic('cloud_download') + 'גיבוי והורדה עכשיו</button></div>' +
			(a.zip_ok === false ? '<div class="alert alert-error" style="margin:0 28px 16px">' + ic('error', 'fill') + '<div><strong>בשרת חסר רכיב ZipArchive של PHP</strong><span>בלעדיו אי אפשר ליצור קבצי Excel. חברת האחסון יכולה להפעיל אותו.</span></div></div>' : '') +
			'<div class="table-wrap freeze"><table class="t"><thead><tr>' + th('נוצר', 'schedule') + '' + th('סוג', 'category') + '' + th('גודל', 'hard_drive') + '<th scope="col"><span class="sr-only">פעולות</span></th></tr></thead><tbody>' +
			(b === 'loading' || b === null ? '<tr><td colspan="4" class="empty">טוען…</td></tr>' : (rows || emptyRow(4, 'עדיין אין גיבויים. הראשון ייווצר הלילה, או עכשיו בכפתור למעלה.', 'sunny'))) +
			'</tbody></table></div>' +
			'<form class="card-pad" style="border-top:1px solid var(--outline-variant)" data-submit="restoreUpload"><h3 class="h3">שחזור מקובץ</h3>' +
			'<p class="p0 muted small">שחזור מחליף את כל הנתונים במערכת בתוכן הקובץ. לפני השחזור נשמר גיבוי של המצב הנוכחי.</p>' +
			'<div class="row"><label class="sr-only" for="restore-file">קובץ גיבוי</label><input id="restore-file" type="file" accept=".xlsx" class="input" style="max-width:360px;padding-top:10px"><button type="submit" class="btn btn-secondary">' + ic('upload_file') + 'שחזור</button></div></form></section>';
	}

	/* ---------- users ---------- */

	function viewUsers() {
		var roles = CFG.roles || {};
		var me = S.data.me;
		function opts(sel) {
			return Object.keys(roles).map(function (k) { return '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + esc(roles[k]) + '</option>'; }).join('');
		}
		var staff = S.data.staff || [];
		var cards = staff.map(function (u) {
			var self = u.email.toLowerCase() === String(me.email).toLowerCase();
			return '<article class="pcard">' +
				'<div class="pcard-head">' + avatar(u.name, u.role !== 'admin') + '<div class="stack-4" style="min-width:0;flex:1"><h3 class="pcard-name">' + esc(u.name) + (self ? ' <span class="small muted">(את/ה)</span>' : '') + '</h3>' +
				'<span class="pcard-mail" dir="ltr">' + esc(u.email) + '</span></div>' +
				(self ? '' : '<button type="button" class="icon-btn danger" data-act="staffRemove" data-id="' + u.id + '" aria-label="הסרת ' + esc(u.name) + '" title="הסרה">' + ic('person_remove') + '</button>') + '</div>' +
				field('role-' + u.id, 'תפקיד', '<select id="role-' + u.id + '" class="select" data-change="staffRole" data-id="' + u.id + '">' + opts(u.role) + '</select>', 'badge') +
				'<div>' + (u.status === 'active' ? pill('פעיל', 'ok') : pill('הוזמן, טרם נכנס', 'warn', 'mail')) + '</div></article>';
		}).join('');
		var admins = (S.data.wpAdmins || []).map(function (a) { return a.name; }).join(', ');
		var areas = [['clients', 'לקוחות וכרטיס לקוח'], ['inventory', 'מלאי'], ['purchase', 'רשימת רכש'], ['settings', 'הגדרות וגיבויים'], ['users', 'משתמשים']];
		var names = { edit: 'עריכה', view: 'צפייה', none: '—' };
		var kinds = { edit: 'ok', view: 'client', none: 'gray' };
		var pIcons = { edit: 'edit', view: 'visibility', none: '' };
		var matrix = areas.map(function (a) {
			return '<tr><th scope="row">' + a[1] + '</th>' + Object.keys(roles).map(function (r) {
				var l = (CFG.permissions[a[0]] || {})[r] || 'none';
				return '<td class="c">' + (l === 'none' ? '<span class="na">—</span>' : pill(names[l], kinds[l], pIcons[l])) + '</td>';
			}).join('') + '</tr>';
		}).join('');
		var inv = S.ui.invite;

		return '<div class="page-head"><div class="stack-6"><span class="eyebrow">' + esc(S.data.texts.season) + '</span><h1 class="h1">משתמשים</h1><p class="lead">מי יכול להיכנס למערכת, ומה כל תפקיד רואה ויכול לשנות</p></div></div>' +
			(admins ? '<p class="note">' + ic('shield_person') + '<span>מנהלי האתר בוורדפרס נכנסים תמיד כמנהלים: ' + esc(admins) + '.</span></p>' : '') +
			'<section class="card" aria-labelledby="u-h"><div class="card-head">' + sectionTitle('u-h', 'groups', 'אנשי צוות') + '<span class="small muted">' + staff.length + ' משתמשים · ' + staff.filter(function (u) { return u.status === 'active'; }).length + ' פעילים</span></div>' +
			'<div class="card-body">' + (cards ? '<div class="pcards">' + cards + '</div>' : '<div class="empty">' + shape('clover') + 'עדיין לא הוזמנו אנשי צוות.</div>') + '</div></section>' +
			'<form class="card card-pad" data-submit="invite" aria-labelledby="inv-h">' + sectionTitle('inv-h', 'person_add', 'הזמנת משתמש') +
			'<div class="row-end">' +
			'<div style="flex:1 1 200px">' + field('inv-name', 'שם (כפי שיופיע כנציג)', '<input id="inv-name" class="input" value="' + esc(inv.name) + '" data-input="invName">', 'person') + '</div>' +
			'<div style="flex:1 1 260px">' + field('inv-email', 'חשבון Google (מייל)', '<input id="inv-email" class="input input-ltr" type="email" value="' + esc(inv.email) + '" data-input="invEmail">', 'mail') + '</div>' +
			'<div style="flex:0 1 200px">' + field('inv-role', 'תפקיד', '<select id="inv-role" class="select" data-input="invRole">' + opts(inv.role) + '</select>', 'badge') + '</div>' +
			'<button type="submit" class="btn btn-primary" style="min-height:56px">' + ic('person_add') + 'הוספה לרשימה</button></div>' +
			'<p class="p0 small muted">לא נשלח מייל הזמנה. אחרי ההוספה, שלחו לאדם את הכתובת ' + esc(location.origin + location.pathname) + ' והוא ייכנס עם Google. נציג מכירות רואה רק לקוחות שבהם השם שלו מופיע כנציג.</p></form>' +
			'<section class="card" aria-labelledby="perm-h"><div class="card-head">' + sectionTitle('perm-h', 'admin_panel_settings', 'מה כל תפקיד יכול') + '</div><div class="table-wrap"><table class="t" style="min-width:720px"><thead><tr>' + th('מסך', 'web') +
			Object.keys(roles).map(function (r) { return '<th scope="col" class="c">' + esc(roles[r]) + '</th>'; }).join('') + '</tr></thead><tbody>' + matrix + '</tbody></table></div></section>';
	}

	/* ---------------- saving ---------------- */

	function allStepsDone(steps) {
		return Array.isArray(steps) && steps.length > 0 && steps.every(function (s) { return s.done; });
	}
	function saveClient(c, patch, joy) {
		var wasAll = allStepsDone(c.steps);
		var wasReceived = c.form_status === 'received';
		Object.assign(c, patch);
		var nowAll = !wasAll && patch.steps && allStepsDone(patch.steps);
		var nowReceived = !wasReceived && patch.form_status === 'received';
		render();
		saving();
		return api('PUT', 'clients/' + c.id, Object.assign({ _rev: c.rev || 0 }, patch)).then(function (r) {
			var i = S.data.clients.indexOf(c);
			if (i >= 0) S.data.clients[i] = r.client;
			if (S.ui.history) delete S.ui.history[c.id];
			var origin = joy && joy.origin ? joy.origin : {};
			if (nowAll) {
				celebrate({ x: origin.x, y: origin.y, count: 110, power: 1.15 });
				joyToast('כל השלבים הושלמו ל' + (c.name || 'לקוח') + ' – כל הכבוד!', 'celebration');
			} else if (nowReceived) {
				celebrate({ x: origin.x, y: origin.y, count: 45, power: 0.8 });
				joyToast('טופס האספקה התקבל', 'mark_email_read');
			} else if (joy && joy.msg) {
				celebrate({ x: origin.x, y: origin.y, count: joy.count || 40, power: joy.power || 0.8 });
				joyToast(joy.msg, joy.icon);
			} else {
				saved();
			}
			if (nowAll || nowReceived || (joy && joy.msg)) saveFailed();
			render();
		}).catch(function (e) {
			saveFailed();
			if (e.status === 409 && e.data && e.data.client) {
				// A teammate changed the same list. Show their version; nothing of theirs is lost.
				var i = S.data.clients.indexOf(c);
				if (i >= 0) S.data.clients[i] = e.data.client;
				if (S.ui.history) delete S.ui.history[c.id];
				toast(e.message, true);
				render();
				return;
			}
			fail(e); load();
		});
	}

	function saveLines(c, lines) { return saveClient(c, { box_lines: lines }); }

	function saveCatalog() {
		debounce('catalog', function () {
			saving();
			api('PUT', 'catalog', Object.assign({ _rev: S.data.revs.catalog }, S.data.catalog)).then(function (r) { S.data.revs.catalog = r.rev; saved(); }).catch(function (e) { saveFailed(); fail(e); load(); });
		}, 600);
	}
	function saveStock() {
		debounce('stock', function () {
			saving();
			api('PUT', 'stock', Object.assign({ _rev: S.data.revs.stock }, S.data.stock)).then(function (r) { S.data.revs.stock = r.rev; saved(); }).catch(function (e) { saveFailed(); fail(e); load(); });
		}, 600);
	}
	function saveOrders() {
		debounce('orders', function () {
			saving();
			api('PUT', 'orders', { _rev: S.data.revs.orders, orders: S.data.orders }).then(function (r) { S.data.orders = r.orders; S.data.revs.orders = r.rev; saved(); render(); }).catch(function (e) { saveFailed(); fail(e); load(); });
		}, 600);
	}
	function applyBootstrap(d) {
		S.data = normalize(d);
		render();
	}

	function currentClient() { return clientById(S.route.id); }
	function orderById(id) { return S.data.orders.filter(function (o) { return o.id === id; })[0]; }
	function nowStamp() { var n = new Date(); return isoOf(n) + ' ' + String(n.getHours()).padStart(2, '0') + ':' + String(n.getMinutes()).padStart(2, '0') + ':00'; }

	/* ---------------- actions ---------------- */

	var actions = {
		/* seasons */
		seasonMenu: function (el) {
			var d = S.data;
			var items = d.seasons.slice().reverse().map(function (s) {
				return { v: s.id, label: s.name, hint: s.id === d.active ? 'העונה הפעילה' : (s.archived ? 'ארכיון' : ''), on: s.id === d.season };
			});
			if (canEdit('settings')) items.push({ divider: true }, { v: '__new', label: 'עונה חדשה…', icon: 'add' }, { v: '__manage', label: 'ניהול עונות', icon: 'tune' });
			menuCustom(el, items, function (v) {
				if (v === '__new') return actions.seasonNew();
				if (v === '__manage') { S.ui.settingsTab = 'seasons'; if (location.hash === '#/settings') render(); else location.hash = '#/settings'; return; }
				if (v !== d.season) switchSeason(v);
			});
		},
		seasonGo: function (el) { if (el.dataset.id !== S.data.season) switchSeason(el.dataset.id); },
		seasonNew: function () {
			ask({
				title: 'עונה חדשה', icon: 'calendar_month', confirm: 'פתיחת העונה',
				text: 'עונה היא שנה חדשה לגמרי: בלי לקוחות, בלי מלאי ובלי הזמנות רכש. ' + S.data.texts.season + ' נשמרת כמו שהיא, ואפשר לחזור אליה בכל רגע.',
				input: { label: 'שם העונה', placeholder: 'למשל: ראש השנה 2027', required: true },
				check: { label: 'להעתיק את המארזים, התכולות, המדידות והספקים', checked: true }
			}).then(function (res) {
				if (!res) return;
				return api('POST', 'seasons', { name: res.text, copy_catalog: res.check }).then(function (r) {
					pickSeason('');
					S.ui.history = {}; S.ui.log = null; S.ui.backups = null;
					S.data = normalize(r.data);
					if (location.hash !== '#/clients') location.hash = '#/clients'; else { parseRoute(); render(); }
					celebrate({ count: 130, power: 1.2 });
					joyToast('עונה חדשה נפתחה: ' + S.data.texts.season, 'celebration');
				});
			}).catch(fail);
		},
		seasonActive: function (el) {
			var s = seasonById(el.dataset.id);
			ask({ title: 'להפוך את ' + s.name + ' לעונה הפעילה?', text: 'כל הצוות יראה אותה בכניסה, ואליה יגיעו טופסי האספקה מ-Tally.', icon: 'check_circle', confirm: 'הפיכה לפעילה' }).then(function (ok) {
				if (!ok) return;
				return api('PUT', 'seasons/' + s.id, { active: true }).then(function (r) { applyBootstrap(r.data); toast('העונה הפעילה היא ' + s.name); });
			}).catch(fail);
		},
		seasonArchive: function (el) {
			var s = seasonById(el.dataset.id), on = el.dataset.on === '1';
			var go = function () { return api('PUT', 'seasons/' + s.id, { archived: on }).then(function (r) { applyBootstrap(r.data); toast(on ? 'העונה הועברה לארכיון' : 'העונה חזרה מהארכיון'); }); };
			if (!on) return go().catch(fail);
			ask({ title: 'להעביר את ' + s.name + ' לארכיון?', text: 'הנתונים נשארים וניתן לצפות בהם, אבל אי אפשר לערוך עד שמוציאים אותה מהארכיון.', icon: 'inventory_2', confirm: 'העברה לארכיון' }).then(function (ok) { if (ok) return go(); }).catch(fail);
		},
		/* box contents */
		recBox: function (el) {
			var strip = document.querySelector('.box-list-scroll'), left = strip ? strip.scrollLeft : 0, top = strip ? strip.scrollTop : 0;
			S.ui.recBox = el.dataset.id; S.ui.recAdd = '';
			doRender();
			// keep the list where it was, and bring the chosen box into view on the phone strip
			var s2 = document.querySelector('.box-list-scroll'), on = document.querySelector('.box-pick.on');
			if (!s2 || !on) return;
			s2.scrollLeft = left; s2.scrollTop = top;
			if (s2.scrollWidth > s2.clientWidth) {
				var r = on.getBoundingClientRect(), rr = s2.getBoundingClientRect();
				s2.scrollBy({ left: r.left - rr.left - (rr.width - r.width) / 2, behavior: 'smooth' });
			}
		},
		recAddItem: function (el) {
			var ing = ingById(el.dataset.ing), box = el.dataset.box;
			if (!ing) return;
			delete ing.pack[box];
			ing.grams[box] = 0;
			saveCatalog();
			render();
			setTimeout(function () { var g = document.getElementById('rg-' + ing.id + '-' + box); if (g) { g.scrollIntoView({ block: 'center', behavior: 'smooth' }); g.focus(); g.select(); } }, 40);
		},
		recRemove: function (el) {
			var ing = ingById(el.dataset.ing), box = el.dataset.box;
			if (!ing) return;
			delete ing.pack[box]; delete ing.grams[box];
			saveCatalog();
			render();
		},
		/* send from the app */
		mailSend: function (el) {
			var c = currentClient(), kind = el.dataset.kind;
			if (!c) return;
			var m = buildEmail(c), me = S.data.me, g = S.data.gmail || {};
			var gm = g.connected && !g.broken;
			if (g.connected && g.broken) { toast('החיבור ל-Gmail כבר לא בתוקף. מחברים מחדש או בוחרים "שליחה דרך האתר".', true); return; }
			var from = gm ? ' מה-Gmail שלך (' + g.email + ')' : '';
			var tail = gm ? ' המייל יישמר אצלך ב"נשלחו".' : ' עותק יגיע גם אליך, ותשובות של הלקוח יגיעו אליך.';
			var o = kind === 'test'
				? { title: 'לשלוח מייל בדיקה?', text: 'מייל הפתיחה של ' + c.name + ' יישלח' + from + ' רק אליך (' + (gm ? g.email : me.email) + '), כדי לראות איך הוא נראה. הלקוח לא מקבל כלום.', icon: 'forward_to_inbox', confirm: 'שליחת בדיקה' }
				: kind === 'reminder'
					? { title: 'לשלוח תזכורת ל' + (c.contact || c.name) + '?', text: 'תזכורת למילוי טופס האספקה תישלח' + from + ' אל ' + c.contact_email + '.' + tail, icon: 'notifications_active', confirm: 'שליחת תזכורת' }
					: { title: 'לשלוח את המייל ל' + (c.contact || c.name) + '?', text: '"' + m.subject + '" יישלח' + from + ' אל ' + c.contact_email + '.' + tail + (c.contact ? '' : ' שימו לב: לא מולא שם איש קשר, אז המייל ייפתח ב"היי שלום".'), icon: 'send', confirm: 'שליחה' };
			var origin = joyOrigin(el);
			ask(o).then(function (ok) {
				if (!ok) return;
				el.disabled = true;
				saving();
				return api('POST', 'clients/' + c.id + '/send', { kind: kind }).then(function (r) {
					saveFailed();
					var i = S.data.clients.indexOf(c);
					if (i >= 0) S.data.clients[i] = r.client;
					if (S.ui.history) delete S.ui.history[c.id];
					if (r.gmail) S.data.gmail = r.gmail;
					render();
					if (kind === 'test') { toast('מייל בדיקה נשלח אל ' + r.to); return; }
					celebrate({ x: origin.x, y: origin.y, count: kind === 'opening' ? 60 : 30, power: 0.8 });
					joyToast(kind === 'opening' ? 'המייל נשלח אל ' + r.to : 'התזכורת נשלחה אל ' + r.to, 'send');
				});
			}).catch(function (e) { saveFailed(); el.disabled = false; fail(e); load(); });
		},
		gmailDisconnect: function () {
			var g = S.data.gmail || {};
			ask({ title: 'לנתק את ' + g.email + '?', text: 'מיילים שתשלחו מכאן ייצאו שוב דרך כתובת האתר. ההרשאה תבוטל גם אצל Google. אפשר לחבר מחדש בכל רגע.', icon: 'link_off', confirm: 'ניתוק' }).then(function (ok) {
				if (!ok) return;
				return api('DELETE', 'gmail').then(function (r) { S.data.gmail = r.gmail; render(); toast('Gmail נותק'); });
			}).catch(fail);
		},
		gmailSetup: function () { S.ui.settingsTab = 'google'; location.hash = '#/settings'; },
		/* history */
		logUndo: function (el) {
			el.disabled = true;
			api('POST', 'log/' + el.dataset.id + '/undo').then(function (r) {
				S.ui.history = {}; S.ui.log = null;
				applyBootstrap(r.data);
				toast('השינוי בוטל');
			}).catch(function (e) { el.disabled = false; fail(e); });
		},
		logRefresh: function () { S.ui.log = null; render(); },
		historyAll: function (el) { S.ui.historyAll = S.ui.historyAll === Number(el.dataset.id) ? null : Number(el.dataset.id); render(); },
		/* updates */
		updateCheck: function (el) {
			el.disabled = true;
			api('POST', 'update').then(function (r) { S.data.appSettings.update = r.update; render(); if (!r.update.error) toast(r.update.available ? 'יש גרסה חדשה: ' + r.update.latest : 'מותקנת הגרסה העדכנית'); }).catch(function (e) { el.disabled = false; fail(e); });
		},
		updateInstall: function (el) {
			var u = S.data.appSettings.update;
			ask({ title: 'לעדכן לגרסה ' + u.latest + '?', text: 'לפני העדכון נשמר גיבוי. העדכון לוקח כמה שניות ואחריו העמוד ייטען מחדש.', icon: 'system_update_alt', confirm: 'עדכון' }).then(function (ok) {
				if (!ok) return;
				el.disabled = true;
				toast('מעדכן…');
				return api('POST', 'update/install').then(function (r) {
					toast('עודכן לגרסה ' + r.installed + '. טוען מחדש…');
					setTimeout(function () { location.reload(); }, 1500);
				});
			}).catch(function (e) { el.disabled = false; fail(e); });
		},
		/* packing & delivery */
		schedTab: function (el) { S.ui.schedTab = el.dataset.tab; render(); },
		pickToggle: function (el) { S.ui.pickOpen = S.ui.pickOpen === el.dataset.key ? null : el.dataset.key; render(); },
		printDay: function (el) {
			var card = document.querySelector('.day-card[data-day="' + el.dataset.key + '"]');
			if (!card) return;
			var root = document.getElementById('print-root') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'print-root' }));
			root.className = 'tbs-print';
			root.setAttribute('dir', 'rtl');
			root.innerHTML = '<p class="print-brand">' + esc(S.data.texts.brand) + ' · ' + esc(S.data.texts.season) + ' · ' + ((S.ui.schedTab || 'pack') === 'pack' ? 'יום אריזה' : 'יום אספקה') + '</p>' + card.outerHTML;
			document.body.classList.add('printing');
			var done = function () { document.body.classList.remove('printing'); root.innerHTML = ''; window.removeEventListener('afterprint', done); };
			window.addEventListener('afterprint', done);
			window.print();
		},
		/* purchasing */
		invTab: function (el) { S.ui.invTab = el.dataset.tab; render(); },
		supMatrix: function () { S.ui.supMatrix = !S.ui.supMatrix; render(); },
		supplierAdd: function () {
			ask({ title: 'ספק חדש', icon: 'storefront', confirm: 'הוספה', input: { label: 'שם הספק', required: true } }).then(function (name) {
				if (!name) return;
				return saveSuppliers({ suppliers: S.data.catalog.suppliers.concat([{ id: uid('sp'), name: name, phone: '', email: '', notes: '' }]) });
			});
		},
		supplierRemove: function (el) {
			var s = S.data.catalog.suppliers[Number(el.dataset.i)];
			if (!s) return;
			ask({ title: 'למחוק את הספק ' + s.name + '?', text: 'הפריטים שלו יחזרו ל"בלי ספק". הזמנות קיימות לא נמחקות.', icon: 'delete', confirm: 'מחיקה', danger: true }).then(function (ok) {
				if (ok) return saveSuppliers({ suppliers: S.data.catalog.suppliers.filter(function (x) { return x !== s; }) });
			});
		},
		orderCreate: function (el) {
			var sup = el.dataset.supplier || '';
			var items = shortages().filter(function (m) { return m.supplier === sup; }).map(function (m) { return { group: m.group, id: m.item.id, qty: m.miss, got: null }; });
			if (!items.length) return;
			var no = S.data.orders.reduce(function (n, o) { return Math.max(n, o.no || 0); }, 0) + 1;
			var now = new Date();
			S.data.orders.push({ id: uid('o'), no: no, supplier: sup, status: 'draft', note: '', eta: '', created_at: isoOf(now) + ' ' + String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0') + ':00', created_by: S.data.me.name, ordered_at: '', received_at: '', items: items });
			saveOrders(); render();
			toast('נוצרה הזמנה ' + no + ' (טיוטה)');
		},
		orderItemRemove: function (el) {
			var o = orderById(el.dataset.order); if (!o) return;
			o.items.splice(Number(el.dataset.j), 1);
			saveOrders(); render();
		},
		orderSend: function (el) {
			var o = orderById(el.dataset.id); if (!o) return;
			if (!o.items.length) { toast('אין פריטים בהזמנה', true); return; }
			o.status = 'ordered'; o.ordered_at = nowStamp();
			saveOrders(); render();
		},
		orderBack: function (el) { var o = orderById(el.dataset.id); if (!o) return; o.status = 'draft'; o.ordered_at = ''; saveOrders(); render(); },
		orderCopy: function (el) { var o = orderById(el.dataset.id); if (o) copyText(orderText(o), 'ההזמנה הועתקה'); },
		orderDelete: function (el) {
			var o = orderById(el.dataset.id); if (!o) return;
			ask({ title: 'למחוק את הזמנה ' + o.no + '?', text: 'הפריטים יחזרו לרשימת "מה צריך להזמין".', icon: 'delete', confirm: 'מחיקה', danger: true }).then(function (ok) {
				if (!ok) return;
				S.data.orders = S.data.orders.filter(function (x) { return x !== o; });
				saveOrders(); render();
			});
		},
		orderReceive: function (el) {
			var o = orderById(el.dataset.id); if (!o) return;
			var got = {};
			o.items.forEach(function (it) { got[it.group + ':' + it.id] = it.got == null ? it.qty : it.got; });
			var n = o.items.filter(function (it) { return (it.got == null ? it.qty : it.got) > 0; }).length;
			ask({ title: 'הסחורה של הזמנה ' + o.no + ' הגיעה?', text: n + ' פריטים ייכנסו למלאי בכמויות שבעמודת "התקבל בפועל". אי אפשר לפתוח הזמנה שהתקבלה.', icon: 'warehouse', confirm: 'הכנסה למלאי' }).then(function (ok) {
				if (!ok) return;
				clearTimeout(timers.orders); delete pendingSaves.orders;
				return api('POST', 'orders/receive', { id: o.id, got: got }).then(function (r) {
					S.data.orders = r.orders;
					var st = obj(r.stock);
					st.boxes = obj(st.boxes); st.accessories = obj(st.accessories); st.ingredients = obj(st.ingredients);
					S.data.stock = st;
					S.data.revs.stock = r.revs.stock; S.data.revs.orders = r.revs.orders;
					render();
					celebrate(Object.assign({ count: 50, power: 0.8 }, joyOrigin(el)));
					joyToast('המלאי עודכן מהזמנה ' + o.no, 'warehouse');
				});
			}).catch(fail);
		},
		otpGo: function (el) {
			var h = document.getElementById(el.dataset.target);
			if (!h) return;
			var sec = h.closest('section, form') || h;
			var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
			var offset = (document.querySelector('.appbar') || {}).offsetHeight || 0;
			var bar = document.querySelector('.otp');
			if (bar && getComputedStyle(bar).position === 'sticky' && window.innerWidth < 1200) offset += bar.offsetHeight;
			window.scrollTo({ top: sec.getBoundingClientRect().top + window.scrollY - offset - 16, behavior: reduce ? 'auto' : 'smooth' });
			otpSet(el.dataset.target);
			otpLock = Date.now() + (reduce ? 100 : 1000);
			sec.classList.remove('otp-flash'); void sec.offsetWidth; sec.classList.add('otp-flash');
			setTimeout(function () { var f = sec.querySelector('h2'); if (f) { f.setAttribute('tabindex', '-1'); f.focus({ preventScroll: true }); } }, reduce ? 0 : 450);
		},
		newClient: function () {
			var origin = joyOrigin(document.querySelector('.fab'));
			ask({ title: 'לקוח חדש', text: 'אפשר להשלים את שאר הפרטים בכרטיס הלקוח.', icon: 'person_add', confirm: 'יצירה', input: { label: 'שם הלקוח', required: true } }).then(function (name) {
				if (!name) return;
				return api('POST', 'clients', { name: name }).then(function (r) {
					S.data.clients.push(r.client);
					location.hash = '#/client/' + r.client.id;
					celebrate({ x: origin.x, y: origin.y, count: 120, power: 1.2 });
					joyToast('איזה כיף, ' + r.client.name + ' הצטרפו! 🌸', 'local_florist');
				});
			}).catch(fail);
		},
		deleteClient: function () {
			var c = currentClient();
			if (!c) return;
			ask({ title: 'למחוק את ' + c.name + '?', text: 'כל פרטי ההזמנה, הצעדים ונקודות האספקה יימחקו. אפשר לשחזר רק מגיבוי.', icon: 'delete', confirm: 'מחיקה', danger: true }).then(function (ok) {
				if (!ok) return;
				return api('DELETE', 'clients/' + c.id).then(function () {
					S.data.clients = S.data.clients.filter(function (x) { return x !== c; });
					location.hash = '#/clients';
					toast('הלקוח נמחק');
				});
			}).catch(fail);
		},
		resetContents: function (el) {
			var c = currentClient();
			var i = Number(el.dataset.line);
			saveLines(c, linesOf(c).map(function (l, j) { return j === i ? Object.assign({}, l, { contents: null }) : l; }));
		},
		togglePick: function () { S.ui.pickBox = !S.ui.pickBox; render(); },
		lineAdd: function (el) {
			var c = currentClient();
			var ls = linesOf(c).slice();
			ls.push({ id: uid('l'), box: el.dataset.box, qty: null, contents: null });
			S.ui.pickBox = false;
			S.ui.lineIdx = ls.filter(function (l) { return l.box; }).length - 1;
			saveLines(c, ls);
			setTimeout(function () { var q = document.getElementById('ln-qty-' + (ls.length - 1)); if (q) q.focus(); }, 60);
		},
		lineRemove: function (el) {
			var c = currentClient();
			var i = Number(el.dataset.i);
			var l = linesOf(c)[i];
			if (!l) return;
			ask({ title: 'להסיר את ' + (boxName(l.box) || 'המארז') + ' מההזמנה?', text: l.qty ? fmt(l.qty) + ' מארזים והתכולה שלהם יוסרו מההזמנה.' : '', icon: 'remove', confirm: 'הסרה', danger: true }).then(function (ok) {
				if (!ok) return;
				var ls = linesOf(c).slice();
				ls.splice(i, 1);
				S.ui.lineIdx = 0;
				saveLines(c, ls);
			});
		},
		lineTab: function (el) { S.ui.lineIdx = Number(el.dataset.i); render(); },
		setImage: function (el) {
			var group = el.dataset.group;
			var item = S.data.catalog[group].filter(function (x) { return x.id === el.dataset.id; })[0];
			if (!item) return;
			ask({ title: 'תמונה עבור ' + item.name, text: 'מדביקים כתובת של תמונה מהאתר. משאירים ריק כדי להסיר את התמונה.', icon: 'image', confirm: 'שמירה', input: { label: 'כתובת התמונה', value: item.image || '', ltr: true, placeholder: 'https://morvelevona.co.il/…' } }).then(function (v) {
				if (v === null) return;
				if (v && !/^https?:\/\//.test(v)) { toast('צריך כתובת שמתחילה ב-https://', true); return; }
				item.image = v;
				saveCatalog();
				render();
			});
		},
		stepRemove: function (el) {
			var c = currentClient();
			var steps = c.steps.slice();
			steps.splice(Number(el.dataset.i), 1);
			saveClient(c, { steps: steps });
		},
		toggleForm: function (el) {
			var c = currentClient();
			var received = c.form_status !== 'received';
			var steps = c.steps.map(function (s) { return s.key === 'form' ? Object.assign({}, s, { done: received }) : s; });
			var now = new Date();
			var stamp = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0') + ' 00:00:00';
			saveClient(c, { form_status: received ? 'received' : 'waiting', form_received_at: received ? stamp : null, steps: steps }, { origin: joyOrigin(el) });
		},
		markOpening: function (el) {
			var c = currentClient();
			var found = false;
			var steps = c.steps.map(function (s) { if (s.key === 'opening') { found = true; return Object.assign({}, s, { done: true }); } return s; });
			if (!found) { toast('אין צעד של מייל פתיחה ברשימה'); return; }
			saveClient(c, { steps: steps }, { msg: 'מייל הפתיחה סומן כנשלח', icon: 'send', count: 30, power: 0.7, origin: joyOrigin(el) });
		},
		pointAdd: function () {
			var c = currentClient();
			var pts = (c.points || []).slice();
			pts.push({ id: uid('p'), city: '', region: '', address: '', qty: pts.length ? null : totalQty(c), manual: '', forklift: '', person: '', notes: '' });
			saveClient(c, { points: pts, spots: Math.max(c.spots || 0, pts.length) });
		},
		pointRemove: function (el) {
			var c = currentClient();
			var i = Number(el.dataset.i), pt = c.points[i] || {};
			ask({ title: 'להסיר את נקודת האספקה?', text: [pt.name, pt.address].filter(Boolean).join(' · '), icon: 'location_off', confirm: 'הסרה', danger: true }).then(function (ok) {
				if (!ok) return;
				var pts = c.points.slice();
				pts.splice(i, 1);
				saveClient(c, { points: pts });
			});
		},
		copyMail: function () { var m = buildEmail(currentClient()); copyRich(m.html, m.body, 'המייל הועתק. הדביקו ב-Gmail'); },
		copyLink: function () { copyText(formLink(currentClient()), 'הלינק הועתק'); },
		copyBuy: function () {
			var txt = shortages().map(function (m) { return (m.group === 'boxes' ? 'מארז ' : '') + m.item.name + ': ' + fmt(m.miss, 2) + ' ' + unitOf(m.group, m.item); }).join('\n');
			copyText('רשימת רכש – ' + S.data.texts.season + '\n\n' + txt, 'הרשימה הועתקה');
		},
		copy: function (el) { copyText(el.dataset.text); },
		clientsView: function (el) {
			S.ui.clientsView = el.dataset.view;
			try { localStorage.setItem('tbs-clients-view', el.dataset.view); } catch (e) { /* private mode */ }
			render();
		},
		settingsTab: function (el) { S.ui.settingsTab = el.dataset.tab; if (el.dataset.tab === 'backups') S.ui.backups = null; if (el.dataset.tab === 'history') S.ui.log = null; render(); },
		boxAdd: function () {
			ask({ title: 'מארז חדש', icon: 'package_2', confirm: 'הוספה', input: { label: 'שם המארז', required: true } }).then(function (name) {
				if (!name) return;
				var nb = { id: uid('b'), name: name };
				S.data.catalog.boxes.push(nb);
				S.ui.recBox = nb.id;
				saveCatalog();
				render();
			});
		},
		boxRemove: function (el) {
			var id = el.dataset.id;
			var used = S.data.clients.filter(function (c) { return linesOf(c).some(function (l) { return l.box === id; }); });
			if (used.length) { toast('יש ' + used.length + ' לקוחות עם המארז הזה. קודם הסירו אותו מההזמנות שלהם.', true); return; }
			ask({ title: 'למחוק את המארז ' + boxName(id) + '?', text: 'גם התכולה שלו תימחק מההגדרות.', icon: 'delete', confirm: 'מחיקה', danger: true }).then(function (ok) {
				if (!ok) return;
				S.data.catalog.boxes = S.data.catalog.boxes.filter(function (b) { return b.id !== id; });
				saveCatalog();
				render();
			});
		},
		ingRemove: function (el) {
			var ing = ingById(el.dataset.id);
			if (!ing) return;
			ask({ title: 'למחוק את ' + ing.name + '?', text: 'הפריט יוסר מכל המארזים ומהמלאי.', icon: 'delete', confirm: 'מחיקה', danger: true }).then(function (ok) {
				if (!ok) return;
				S.data.catalog.ingredients = S.data.catalog.ingredients.filter(function (i) { return i !== ing; });
				saveCatalog();
				render();
			});
		},
		accRemove: function (el) {
			var a = S.data.catalog.accessories.filter(function (x) { return x.id === el.dataset.id; })[0];
			if (!a) return;
			ask({ title: 'למחוק את ' + a.name + '?', text: 'הנספק והמדידות שלו יוסרו מההגדרות.', icon: 'delete', confirm: 'מחיקה', danger: true }).then(function (ok) {
				if (!ok) return;
				S.data.catalog.accessories = S.data.catalog.accessories.filter(function (x) { return x !== a; });
				saveCatalog();
				render();
			});
		},
		clearGoogle: function () {
			ask({ title: 'לנתק את הכניסה עם Google?', text: 'אנשי צוות לא יוכלו להיכנס עד שתגדירו מחדש.', icon: 'link_off', confirm: 'ניתוק', danger: true }).then(function (ok) {
				if (!ok) return;
				return api('PUT', 'app-settings', { clear_google: true }).then(function (d) { S.ui.google = { id: null, secret: '' }; applyBootstrap(d); toast('נותק'); });
			}).catch(fail);
		},
		newTallyKey: function () {
			ask({ title: 'ליצור מפתח חדש?', text: 'הכתובת הישנה תפסיק לעבוד, וצריך להדביק את החדשה ב-Tally.', icon: 'key', confirm: 'יצירת מפתח' }).then(function (ok) {
				if (!ok) return;
				return api('PUT', 'app-settings', { new_tally_key: true }).then(function (d) { applyBootstrap(d); toast('נוצר מפתח חדש'); });
			}).catch(fail);
		},
		clearUnmatched: function () {
			api('PUT', 'app-settings', { clear_unmatched: true }).then(applyBootstrap).catch(fail);
		},
		backupNow: function (el) {
			el.disabled = true;
			api('POST', 'backups').then(function (r) {
				S.ui.backups = r.backups;
				S.data.appSettings.last_backup = new Date().toLocaleString('he-IL');
				render();
				location.href = CFG.rest + 'backups/download?file=' + encodeURIComponent(r.file) + '&_wpnonce=' + encodeURIComponent(CFG.nonce);
			}).catch(function (e) { el.disabled = false; fail(e); });
		},
		restoreFrom: function (el) {
			var file = el.dataset.file;
			ask({ title: 'לשחזר מהגיבוי הזה?', text: 'כל הנתונים הנוכחיים יוחלפו. לפני כן נשמר גיבוי שלהם.', icon: 'history', confirm: 'שחזור', danger: true }).then(function (ok) {
				if (!ok) return;
				return api('POST', 'backups/restore', { file: file }).then(afterRestore);
			}).catch(fail);
		},
		staffRemove: function (el) {
			var u = (S.data.staff || []).filter(function (x) { return String(x.id) === el.dataset.id; })[0];
			if (!u) return;
			ask({ title: 'להסיר את ' + u.name + '?', text: 'לא תהיה יותר גישה למערכת מהחשבון הזה.', icon: 'person_remove', confirm: 'הסרה', danger: true }).then(function (ok) {
				if (!ok) return;
				return api('DELETE', 'staff/' + u.id).then(function (d) { applyBootstrap(d); toast('הוסר'); });
			}).catch(fail);
		}
	};

	function afterRestore(r) {
		S.ui.backups = null;
		applyBootstrap(r.data);
		toast('שוחזרו ' + r.restored.clients + ' לקוחות ו-' + r.restored.staff + ' משתמשים');
	}

	var changes = {
		schedPacked: function (el) { schedSave(el.dataset.id, { packed: el.checked }); },
		schedDelivered: function (el) { schedSave(el.dataset.id, { point: el.dataset.point, delivered: el.checked }); },
		schedDate: function (el) { var b = {}; b[el.dataset.key] = el.dataset.date || ''; schedSave(el.dataset.id, b); },
		schedPointDate: function (el) { schedSave(el.dataset.id, { point: el.dataset.point, point_date: el.dataset.date || '' }); },
		ordersDone: function (el) { S.ui.ordersDone = el.checked; render(); },
		orderQty: function (el) { var o = orderById(el.dataset.order); if (!o) return; o.items[Number(el.dataset.j)].qty = Math.max(0, numOrNull(el.value) || 0); saveOrders(); },
		orderGot: function (el) { var o = orderById(el.dataset.order); if (!o) return; o.items[Number(el.dataset.j)].got = Math.max(0, numOrNull(el.value) || 0); saveOrders(); },
		orderNote: function (el) { var o = orderById(el.dataset.id); if (!o) return; o.note = el.value; saveOrders(); },
		supplierField: function (el) {
			var list = S.data.catalog.suppliers.map(function (x) { return Object.assign({}, x); });
			var sp = list[Number(el.dataset.i)]; if (!sp) return;
			if (el.dataset.key === 'name' && !el.value.trim()) { el.value = sp.name; toast('שם הספק לא יכול להיות ריק', true); return; }
			sp[el.dataset.key] = el.value.trim();
			saveSuppliers({ suppliers: list });
		},
		supplierAssign: function (el) {
			var a = { boxes: {}, accessories: {}, ingredients: {} };
			a[el.dataset.group][el.dataset.id] = el.value;
			saveSuppliers({ assign: a });
		},
		clientField: function (el) {
			var c = currentClient();
			var key = el.dataset.key;
			var v = el.classList.contains('date-input') ? (el.dataset.date || '') : el.value;
			if (key === 'spots') v = v === '' ? null : Math.max(0, parseInt(v, 10) || 0);
			if (key === 'name' && !v.trim()) { el.value = c.name; toast('שם הלקוח לא יכול להיות ריק', true); return; }
			var patch = {};
			patch[key] = v;
			saveClient(c, patch);
		},
		itemToggle: function (el) {
			var c = currentClient();
			var li = Number(el.dataset.line);
			var line = linesOf(c)[li];
			if (!line) return;
			var eff = contentsOfLine(line);
			var id = el.dataset.id;
			if (el.checked) {
				var ing = ingById(id);
				var r = ing ? recipeItem(ing, line.box) : null;
				eff.push(r && r.pack ? { id: id, pack: r.pack, grams: null } : { id: id, pack: null, grams: r ? r.grams : null });
			} else {
				eff = eff.filter(function (it) { return it.id !== id; });
			}
			saveLines(c, linesOf(c).map(function (l, j) { return j === li ? Object.assign({}, l, { contents: eff }) : l; }));
		},
		itemGrams: function (el) {
			var c = currentClient();
			var li = Number(el.dataset.line);
			var line = linesOf(c)[li];
			if (!line) return;
			var eff = contentsOfLine(line).map(function (it) { return it.id === el.dataset.id ? { id: it.id, pack: null, grams: numOrNull(el.value) } : it; });
			saveLines(c, linesOf(c).map(function (l, j) { return j === li ? Object.assign({}, l, { contents: eff }) : l; }));
		},
		itemPack: function (el) {
			var c = currentClient();
			var li = Number(el.dataset.line);
			var line = linesOf(c)[li];
			if (!line) return;
			var v = el.value;
			var eff = contentsOfLine(line).map(function (it) {
				if (it.id !== el.dataset.id) return it;
				if (v === '__manual') return { id: it.id, pack: null, grams: it.grams === null ? 0 : it.grams };
				if (!v) return { id: it.id, pack: null, grams: it.grams };
				return { id: it.id, pack: v, grams: null };
			});
			saveLines(c, linesOf(c).map(function (l, j) { return j === li ? Object.assign({}, l, { contents: eff }) : l; }));
			if (v === '__manual') setTimeout(function () { var g = document.getElementById('g-' + el.dataset.id); if (g) { g.focus(); g.select(); } }, 60);
		},
		onlyIn: function (el) { S.ui.onlyIn = el.checked; render(); },
		lineBox: function (el) {
			var c = currentClient();
			var i = Number(el.dataset.i);
			var l = linesOf(c)[i];
			if (!l || el.value === l.box) return;
			var n = Object.assign({}, l, { box: el.value });
			var apply = function () { saveLines(c, linesOf(c).map(function (x, j) { return j === i ? n : x; })); };
			if (Array.isArray(l.contents)) {
				ask({ title: 'להחליף מארז?', text: 'התכולה שהותאמה ללקוח תתאפס לתכולה הרגילה של המארז החדש.', icon: 'swap_horiz', confirm: 'החלפה' }).then(function (ok) {
					if (!ok) { el.value = l.box; return; }
					n.contents = null;
					apply();
				});
				return;
			}
			apply();
		},
		lineQty: function (el) {
			var c = currentClient();
			var i = Number(el.dataset.i);
			var v = el.value === '' ? null : Math.max(0, parseInt(el.value, 10) || 0);
			saveLines(c, linesOf(c).map(function (x, j) { return j === i ? Object.assign({}, x, { qty: v }) : x; }));
		},
		extraToggle: function (el) {
			var c = currentClient();
			var opts = extrasList();
			var opt = el.dataset.opt;
			var chosen = opts.filter(function (o) { return o === opt ? el.checked : hasExtra(c, o); });
			// keep anything that isn't one of the checkbox options (older free text)
			var other = extrasOf(c).filter(function (h) { return !opts.some(function (o) { return o === h || (/כרטיס/.test(o) && /כרטיס/.test(h)); }); });
			saveClient(c, { accessories: chosen.concat(other).join(', ') });
		},
		stepDone: function (el) {
			var c = currentClient();
			var i = Number(el.dataset.i);
			var steps = c.steps.map(function (s, j) { return j === i ? Object.assign({}, s, { done: el.checked }) : s; });
			var patch = { steps: steps };
			if (c.steps[i] && c.steps[i].key === 'form') patch.form_status = el.checked ? 'received' : 'waiting';
			saveClient(c, patch, { origin: joyOrigin(el) });
		},
		stepOwner: function (el) {
			var c = currentClient();
			var i = Number(el.dataset.i);
			saveClient(c, { steps: c.steps.map(function (s, j) { return j === i ? Object.assign({}, s, { owner: el.value }) : s; }) });
		},
		pointField: function (el) {
			var c = currentClient();
			var i = Number(el.dataset.i);
			var key = el.dataset.key;
			var pts = c.points.map(function (p, j) {
				if (j !== i) return p;
				var n = Object.assign({}, p);
				n[key] = key === 'qty' ? (el.value === '' ? null : parseInt(el.value, 10) || 0) : (key === 'date' ? (el.dataset.date || '') : el.value);
				return n;
			});
			saveClient(c, { points: pts });
		},
		stock: function (el) {
			S.data.stock[el.dataset.group][el.dataset.id] = numOrNull(el.value);
			if (S.data.stock[el.dataset.group][el.dataset.id] === null) delete S.data.stock[el.dataset.group][el.dataset.id];
			saveStock();
			render();
		},
		showUnneeded: function (el) { S.ui.showUnneeded = el.checked; render(); },
		/* handled below; kept next to the other recipe changes */
		recipePack: function (el) {
			var ing = ingById(el.dataset.ing);
			var box = el.dataset.box;
			var v = el.value;
			var cur = recipeItem(ing, box);
			if (!v) { delete ing.pack[box]; delete ing.grams[box]; }
			else if (v === '__manual') { delete ing.pack[box]; ing.grams[box] = cur && cur.grams != null ? cur.grams : 0; }
			else { ing.pack[box] = v; delete ing.grams[box]; }
			saveCatalog();
			render();
			if (v === '__manual') setTimeout(function () { var g = document.getElementById('rg-' + ing.id + '-' + box); if (g) { g.focus(); g.select(); } }, 30);
		},
		measure: function (el) {
			var ing = ingById(el.dataset.ing);
			var v = numOrNull(el.value);
			if (v === null) delete ing.packs[el.dataset.acc]; else ing.packs[el.dataset.acc] = v;
			saveCatalog();
			render();
		},
		recipe: function (el) {
			var ing = ingById(el.dataset.ing);
			var v = numOrNull(el.value);
			if (v === null) delete ing.grams[el.dataset.box]; else ing.grams[el.dataset.box] = v;
			saveCatalog();
			render();
		},
		boxName: function (el) {
			var b = S.data.catalog.boxes.filter(function (x) { return x.id === el.dataset.id; })[0];
			if (!el.value.trim()) { el.value = b.name; return; }
			b.name = el.value.trim();
			saveCatalog();
			render();
		},
		ingField: function (el) {
			var ing = ingById(el.dataset.id);
			if (el.dataset.key === 'name' && !el.value.trim()) { el.value = ing.name; return; }
			ing[el.dataset.key] = el.value.trim();
			saveCatalog();
			render();
		},
		accPer: function (el) {
			var a = S.data.catalog.accessories.filter(function (x) { return x.id === el.dataset.acc; })[0];
			var v = numOrNull(el.value);
			if (v === null) delete a.per[el.dataset.box]; else a.per[el.dataset.box] = v;
			saveCatalog();
		},
		accField: function (el) {
			var a = S.data.catalog.accessories.filter(function (x) { return x.id === el.dataset.id; })[0];
			if (el.dataset.key === 'name' && !el.value.trim()) { el.value = a.name; return; }
			a[el.dataset.key] = el.value.trim();
			saveCatalog();
		},
		staffRole: function (el) {
			api('PUT', 'staff/' + el.dataset.id, { role: el.value }).then(function (d) { applyBootstrap(d); saved(); }).catch(function (e) { fail(e); load(); });
		}
	};

	var inputs = {
		recAdd: function (el) { S.ui.recAdd = el.value; render(); },
		updateSource: function (el) { S.ui.updateSource = el.value; },
		search: function (el) { S.ui.search = el.value; render(); },
		uiSearch: function (el) { S.ui[el.dataset.key] = el.value; render(); },
		newStep: function (el) { S.ui.newStep = el.value; },
		newIng: function (el) { S.ui.newIng = el.value; },
		newAcc: function (el) { S.ui.newAcc = el.value; },
		googleId: function (el) { S.ui.google.id = el.value; },
		googleSecret: function (el) { S.ui.google.secret = el.value; },
		invName: function (el) { S.ui.invite.name = el.value; },
		invEmail: function (el) { S.ui.invite.email = el.value; },
		invRole: function (el) { S.ui.invite.role = el.value; }
	};

	var submits = {
		saveUpdateSource: function () {
			var a = S.data.appSettings;
			var src = (S.ui.updateSource == null ? a.update_source : S.ui.updateSource).trim();
			api('PUT', 'app-settings', { update_source: src }).then(function (d) {
				S.ui.updateSource = null;
				applyBootstrap(d);
				if (!src) { toast('מקור העדכונים הוסר'); return; }
				return api('POST', 'update').then(function (r) { S.data.appSettings.update = r.update; render(); if (!r.update.error) toast(r.update.available ? 'יש גרסה חדשה: ' + r.update.latest : 'נשמר. מותקנת הגרסה העדכנית'); });
			}).catch(fail);
		},
		addStep: function () {
			var label = S.ui.newStep.trim();
			if (!label) return;
			var c = currentClient();
			S.ui.newStep = '';
			saveClient(c, { steps: c.steps.concat([{ id: uid('s'), label: label, owner: 'us', done: false }]) });
		},
		addIng: function () {
			var name = S.ui.newIng.trim();
			if (!name) return;
			S.data.catalog.ingredients.push({ id: uid('i'), emoji: '', name: name, unit: 'ק״ג', grams: {}, packs: {}, pack: {} });
			S.ui.newIng = '';
			saveCatalog();
			render();
		},
		addAcc: function () {
			var name = S.ui.newAcc.trim();
			if (!name) return;
			S.data.catalog.accessories.push({ id: uid('a'), emoji: '', name: name, per: {} });
			S.ui.newAcc = '';
			saveCatalog();
			render();
		},
		saveTexts: function (form) {
			var fd = new FormData(form);
			var body = {};
			fd.forEach(function (v, k) { body[k] = v; });
			body.statuses = String(body.statuses || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
			body.extras = String(body.extras || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
			body.auto_remind = !!form.querySelector('[name="auto_remind"]').checked;
			body.sig_on = !!form.querySelector('[name="sig_on"]').checked;
			body.sig_logos = !!form.querySelector('[name="sig_logos"]').checked;
			api('PUT', 'texts', body).then(function (r) { S.data.texts = r.texts; if (r.seasons) S.data.seasons = r.seasons; S.data.texts.statuses = r.texts.statuses || []; S.data.texts.extras = r.texts.extras || []; toast('נשמר'); render(); }).catch(fail);
		},
		saveGoogle: function () {
			var body = { google_client_id: (S.ui.google.id === null ? (S.data.appSettings.google_client_id || '') : S.ui.google.id).trim() };
			if (S.ui.google.secret.trim()) body.google_client_secret = S.ui.google.secret.trim();
			api('PUT', 'app-settings', body).then(function (d) { S.ui.google = { id: null, secret: '' }; applyBootstrap(d); toast('נשמר'); }).catch(fail);
		},
		invite: function () {
			var inv = S.ui.invite;
			if (!inv.name.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(inv.email.trim())) { toast('צריך שם וכתובת מייל תקינה', true); return; }
			api('POST', 'staff', { name: inv.name.trim(), email: inv.email.trim(), role: inv.role }).then(function (d) {
				S.ui.invite = { name: '', email: '', role: inv.role };
				applyBootstrap(d);
				toast('נוסף לרשימה');
			}).catch(fail);
		},
		restoreUpload: function (form) {
			var file = form.querySelector('input[type=file]').files[0];
			if (!file) { toast('בחרו קובץ גיבוי', true); return; }
			ask({ title: 'לשחזר מהקובץ ' + file.name + '?', text: 'כל הנתונים הנוכחיים יוחלפו. לפני כן נשמר גיבוי שלהם.', icon: 'upload_file', confirm: 'שחזור', danger: true }).then(function (ok) {
				if (!ok) return;
				var fd = new FormData();
				fd.append('file', file);
				return api('POST', 'backups/restore', fd, true).then(afterRestore);
			}).catch(fail);
		}
	};

	/* ---------------- events ---------------- */

	$app.addEventListener('click', function (e) {
		var el = e.target.closest('[data-act]');
		if (!el || !$app.contains(el)) return;
		var fn = actions[el.dataset.act];
		if (fn) { e.preventDefault(); fn(el, e); }
	});
	$app.addEventListener('change', function (e) {
		var el = e.target.closest('[data-change]');
		if (el && changes[el.dataset.change]) changes[el.dataset.change](el, e);
		var inp = e.target.closest('select[data-input]');
		if (inp && inputs[inp.dataset.input]) inputs[inp.dataset.input](inp, e);
	});
	$app.addEventListener('input', function (e) {
		var el = e.target.closest('[data-input]');
		if (el && el.tagName !== 'SELECT' && inputs[el.dataset.input]) inputs[el.dataset.input](el, e);
	});
	$app.addEventListener('submit', function (e) {
		var form = e.target.closest('[data-submit]');
		if (!form) return;
		e.preventDefault();
		var fn = submits[form.dataset.submit];
		if (fn) fn(form, e);
	});
	// Enter in a number/text field commits it (change fires on blur otherwise).
	$app.addEventListener('keydown', function (e) {
		if (e.key === 'Enter' && e.target.matches('input[data-change]')) { e.preventDefault(); e.target.blur(); }
	});

	// Clients switch to cards on narrow screens; redraw when crossing the breakpoint.
	if (window.matchMedia) {
		var mq = window.matchMedia('(max-width: 840px)');
		var onMq = function () { if (S.route.name === 'clients') render(); };
		if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq);
	}
	window.addEventListener('hashchange', function () {
		parseRoute();
		render();
		window.scrollTo(0, 0);
	});

	/* Teamwork: every 20 seconds ask whether anybody saved something, and quietly refresh if so. */
	function busyEditing() {
		var a = document.activeElement;
		if (a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && !/^(checkbox|radio|button|submit)$/.test(a.type)))) return true;
		return !!(M3.menu || M3.date || document.querySelector('dialog[open]') || Object.keys(pendingSaves).length);
	}
	var pollWait = false;
	function pollTeam() {
		if (!S.data || document.hidden || pollWait) return;
		pollWait = true;
		api('GET', 'rev').then(function (r) {
			pollWait = false;
			if (!r || !r.rev || r.rev === S.rev) return;
			if (busyEditing()) return; // try again on the next tick, without interrupting typing
			var y = window.scrollY;
			return api('GET', 'bootstrap').then(function (d) {
				S.data = normalize(d);
				S.ui.history = {};
				S.ui.log = null;
				parseRoute();
				doRender();
				window.scrollTo(0, y);
				var el = saveChip();
				clearTimeout(saveTimer);
				el.innerHTML = ic('sync', 'fill') + '<span>התעדכן מהצוות</span>';
				el.className = 'save-status show';
				saveTimer = setTimeout(function () { el.className = 'save-status'; }, 2200);
			});
		}).catch(function () { pollWait = false; });
	}
	setInterval(pollTeam, 20000);
	document.addEventListener('visibilitychange', function () { if (!document.hidden) pollTeam(); });

	function gmailReturn() {
		var m = /[?&]gmail=([a-z]+)/.exec(location.search);
		if (!m) return;
		var msg = {
			connected: ['Gmail חובר: ' + ((S.data.gmail || {}).email || ''), false],
			cancelled: ['החיבור ל-Gmail בוטל', true],
			noscope: ['לא סומנה ההרשאה לשליחה. מחברים שוב ומסמנים את תיבת השליחה במסך של Google.', true],
			setup: ['קודם צריך להגדיר כניסה עם Google בהגדרות', true],
			error: ['החיבור ל-Gmail לא הושלם. מתחברים עם חשבון Google של הארגון (לא כתובת פרטית). אם זה חוזר, בודקים שה-Gmail API מופעל ב-Google Cloud.', true]
		}[m[1]];
		try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) { /* ignore */ }
		if (!msg) return;
		if (m[1] === 'connected') { celebrate({ count: 60, power: 0.9 }); joyToast(msg[0], 'alternate_email'); } else toast(msg[0], msg[1]);
	}
	var firstLoad = true;
	function load() {
		return api('GET', 'bootstrap').then(function (d) {
			S.data = normalize(d);
			parseRoute();
			render();
			if (firstLoad) { firstLoad = false; gmailReturn(); }
		}).catch(function (e) {
			$app.innerHTML = '<div class="main"><div class="alert alert-error"><strong>המערכת לא נטענה</strong><span>' + esc(e.message) + '</span></div></div>';
		});
	}

	load();
})();
