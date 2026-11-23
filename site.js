/* ============================================================
   다시책방 공통 스크립트 (site.js)
   회원가입 · 로그인 세션 · 장바구니 · 찜 · 주문 · 리뷰
   ※ 학습/시연용입니다. 데이터는 이 브라우저의 localStorage에만 저장됩니다.
     (실제 서비스는 서버·DB와 서버 측 인증/결제가 필요합니다)
   ============================================================ */
(function () {
  'use strict';

  /* ---------- 저장소 (localStorage, 막힌 환경에서는 메모리) ---------- */
  var mem = {};
  var LS = {
    get: function (k, d) {
      try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); }
      catch (e) { return (k in mem) ? mem[k] : d; }
    },
    set: function (k, v) {
      try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { mem[k] = v; }
    },
    del: function (k) {
      try { localStorage.removeItem(k); } catch (e) {}
      delete mem[k];
    }
  };

  /* ---------- 유틸 ---------- */
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var won = function (n) { return Number(n || 0).toLocaleString('ko-KR') + '원'; };
  var pad = function (n) { return String(n).padStart(2, '0'); };
  var fmtPhone = function (v) {
    var d = String(v).replace(/\D/g, '').slice(0, 11);
    if (d.length < 4) return d;
    if (d.length < 8) return d.slice(0, 3) + '-' + d.slice(3);
    return d.slice(0, 3) + '-' + d.slice(3, d.length - 4) + '-' + d.slice(-4);
  };
  var page = function () {
    var f = location.pathname.split('/').pop();
    return (/\.html$/.test(f) ? f : 'index.html') + location.hash;
  };
  /* 로그인 후 돌아갈 주소: 같은 폴더의 .html 만 허용 (엉뚱한 주소로 보내지 않기) */
  var safeNext = function (n) {
    return /^[a-z]+\.html(#[a-z]+)?$/.test(n || '') ? n : 'index.html';
  };

  /* ---------- 상품 (메인페이지와 장바구니가 같은 데이터를 사용) ---------- */
  var PRODUCTS = [
    { id: 'b1', name: '밤의 도서관',     cat: '소설',   color: '#2f5d50', price: 7800,  old: 13800, grade: 'A' },
    { id: 'b2', name: '천천히 걷는 법',   cat: '에세이', color: '#b5432c', price: 6500,  old: 14000, grade: 'A' },
    { id: 'b3', name: '작은 문장 수업',   cat: '인문',   color: '#6b4a2f', price: 8200,  old: 16000, grade: 'B' },
    { id: 'b4', name: '기초 통계학',     cat: '학습',   color: '#3b3550', price: 9000,  old: 28000, grade: 'B' },
    { id: 's1', name: '빈티지 노트 3권', cat: '문구',   color: '#c9972b', price: 5500,  old: 9000,  grade: 'S' },
    { id: 's2', name: '만년필 세트',     cat: '문구',   color: '#1f3a4d', price: 18000, old: 39000, grade: 'A' },
    { id: 'v1', name: '절판 시집 모음',   cat: '절판',   color: '#8a3a26', price: 15000, old: 0,     grade: 'A' },
    { id: 'v2', name: '낡은 일기장',     cat: '빈티지', color: '#5a6b3a', price: 11000, old: 0,     grade: 'B' }
  ];
  var product = function (id) { return PRODUCTS.find(function (p) { return p.id === id; }); };
  var cover = function (p) {
    return '<span class="mini" style="background:' + esc(p.color) + '">' + esc(p.name) + '</span>';
  };

  var FREE_SHIP = 30000, SHIP_FEE = 3000, MAX_QTY = 5;
  var ship = function (sum) { return (sum === 0 || sum >= FREE_SHIP) ? 0 : SHIP_FEE; };

  /* ---------- 입력값 검사 (회원가입/정보수정 공용) ---------- */
  var v = {
    uid:   function (s) { return /^[a-z0-9]{4,16}$/.test(s) ? '' : '아이디는 영문 소문자·숫자 4~16자로 입력해 주세요.'; },
    pw:    function (s) { return /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(s) ? '' : '비밀번호는 영문과 숫자를 포함해 8자 이상이어야 해요.'; },
    name:  function (s) { return String(s).trim().length >= 2 ? '' : '이름을 2자 이상 입력해 주세요.'; },
    email: function (s) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s).trim()) ? '' : '올바른 이메일 형식이 아니에요.'; },
    phone: function (s) { return /^01[016789]-\d{3,4}-\d{4}$/.test(s) ? '' : '휴대폰 번호를 010-1234-5678 형식으로 입력해 주세요.'; },
    addr:  function (s) { return String(s).trim().length >= 5 ? '' : '주소를 입력해 주세요.'; }
  };

  /* ---------- 비밀번호 해시 (평문 저장 금지) ---------- */
  function hash(pw, salt) {
    var s = salt + ':' + pw;
    try {
      if (window.crypto && crypto.subtle) {
        return crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)).then(function (buf) {
          return 'sha256:' + Array.prototype.map.call(new Uint8Array(buf), function (b) {
            return b.toString(16).padStart(2, '0');
          }).join('');
        });
      }
    } catch (e) {}
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (var i = 0, ch; i < s.length; i++) {
      ch = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return Promise.resolve('x:' + (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16));
  }

  /* ---------- 회원 ---------- */
  var U_KEY = 'dasi_users', S_KEY = 'dasi_session';
  var users = function () { return LS.get(U_KEY, []); };
  var findUser = function (id) {
    id = String(id || '').trim().toLowerCase();
    return users().find(function (u) { return u.id === id; }) || null;
  };
  function current() {
    var s = LS.get(S_KEY, null);
    return s && s.id ? findUser(s.id) : null;
  }
  function updateUser(id, patch) {
    var a = users();
    for (var i = 0; i < a.length; i++) {
      if (a[i].id === id) { Object.assign(a[i], patch); LS.set(U_KEY, a); return a[i]; }
    }
    return null;
  }

  function register(d) {
    var id = String(d.id).trim().toLowerCase();
    if (findUser(id)) return Promise.resolve({ ok: false, msg: '이미 사용 중인 아이디입니다.' });
    var salt = Math.random().toString(36).slice(2, 10);
    return hash(d.pw, salt).then(function (h) {
      var u = {
        id: id, salt: salt, pw: h,
        name: d.name.trim(), email: d.email.trim(), phone: d.phone.trim(),
        address: d.address.trim(), addressDetail: (d.addressDetail || '').trim(),
        marketing: !!d.marketing, joinedAt: new Date().toISOString(),
        coupon: { amount: 1000, used: false }          // 신규 가입 쿠폰
      };
      var a = users(); a.push(u); LS.set(U_KEY, a);
      return { ok: true, user: u };
    });
  }

  function login(id, pw) {
    var bad = { ok: false, msg: '아이디 또는 비밀번호가 올바르지 않습니다.' };
    var u = findUser(id);
    if (!u) return Promise.resolve(bad);
    return hash(pw, u.salt).then(function (h) {
      if (h !== u.pw) return bad;
      LS.set(S_KEY, { id: u.id, at: Date.now() });
      mergeGuestCart(u.id);
      return { ok: true, user: u };
    });
  }
  function logout() { LS.del(S_KEY); }

  function changePassword(id, oldPw, newPw) {
    var u = findUser(id);
    if (!u) return Promise.resolve({ ok: false, msg: '회원 정보를 찾을 수 없어요.' });
    return hash(oldPw, u.salt).then(function (h) {
      if (h !== u.pw) return { ok: false, msg: '현재 비밀번호가 일치하지 않아요.' };
      return setPassword(id, newPw);
    });
  }
  function setPassword(id, newPw) {
    var salt = Math.random().toString(36).slice(2, 10);
    return hash(newPw, salt).then(function (h) {
      updateUser(id, { salt: salt, pw: h });
      return { ok: true };
    });
  }
  function verifyPassword(id, pw) {
    var u = findUser(id);
    if (!u) return Promise.resolve(false);
    return hash(pw, u.salt).then(function (h) { return h === u.pw; });
  }
  function findId(name, email) {
    var u = users().find(function (x) {
      return x.name === String(name).trim() && x.email.toLowerCase() === String(email).trim().toLowerCase();
    });
    if (!u) return null;
    return u.id.slice(0, 2) + '*'.repeat(Math.max(u.id.length - 2, 2));   // 앞 2글자만 공개
  }
  function resetPassword(id, name, email, newPw) {
    var u = findUser(id);
    if (!u || u.name !== String(name).trim() || u.email.toLowerCase() !== String(email).trim().toLowerCase()) {
      return Promise.resolve({ ok: false, msg: '입력하신 정보와 일치하는 회원이 없어요.' });
    }
    return setPassword(u.id, newPw);
  }
  function removeUser(id) {
    LS.set(U_KEY, users().filter(function (u) { return u.id !== id; }));
    ['dasi_cart_', 'dasi_wish_', 'dasi_orders_', 'dasi_reviews_'].forEach(function (p) { LS.del(p + id); });
    LS.del(S_KEY);
  }
  function requireLogin() {
    var u = current();
    if (!u) location.replace('login.html?next=' + encodeURIComponent(page()));
    return u;
  }

  /* ---------- 장바구니 (회원별 저장, 비회원은 임시 저장 후 로그인 시 합치기) ---------- */
  var cartKey = function (uid) { return 'dasi_cart_' + (uid || 'guest'); };
  var cart = {
    _k: function () { var u = current(); return cartKey(u && u.id); },
    get: function () { return LS.get(this._k(), []).filter(function (i) { return product(i.id); }); },
    save: function (a) { LS.set(this._k(), a); badge(); },
    add: function (id, qty) {
      qty = qty || 1;
      var p = product(id); if (!p) return;
      var a = this.get(), it = a.find(function (i) { return i.id === id; });
      if (it) {
        if (it.qty >= MAX_QTY) { toast('한 상품은 최대 ' + MAX_QTY + '개까지 담을 수 있어요.'); return; }
        it.qty = Math.min(MAX_QTY, it.qty + qty);
      } else a.push({ id: id, qty: Math.min(MAX_QTY, qty) });
      this.save(a);
      toast('🛒 「' + p.name + '」을(를) 담았어요.', '장바구니 보기', 'cart.html');
    },
    setQty: function (id, q) {
      q = Math.max(1, Math.min(MAX_QTY, q));
      this.save(this.get().map(function (i) { return i.id === id ? { id: id, qty: q } : i; }));
    },
    remove: function (ids) {
      ids = [].concat(ids);
      this.save(this.get().filter(function (i) { return ids.indexOf(i.id) < 0; }));
    },
    count: function () { return this.get().reduce(function (s, i) { return s + i.qty; }, 0); }
  };
  function mergeGuestCart(uid) {
    var g = LS.get(cartKey(), []);
    if (!g.length) return;
    var a = LS.get(cartKey(uid), []);
    g.forEach(function (gi) {
      var it = a.find(function (x) { return x.id === gi.id; });
      if (it) it.qty = Math.min(MAX_QTY, it.qty + gi.qty); else a.push(gi);
    });
    LS.set(cartKey(uid), a);
    LS.del(cartKey());
  }

  /* ---------- 찜 ---------- */
  var wish = {
    _k: function () { var u = current(); return u ? 'dasi_wish_' + u.id : null; },
    get: function () { var k = this._k(); return k ? LS.get(k, []) : []; },
    has: function (id) { return this.get().indexOf(id) >= 0; },
    toggle: function (id, btn) {
      var k = this._k();
      if (!k) { toast('찜하려면 로그인이 필요해요.', '로그인', 'login.html?next=' + encodeURIComponent(page())); return false; }
      var a = this.get(), on = a.indexOf(id) < 0;
      a = on ? a.concat(id) : a.filter(function (x) { return x !== id; });
      LS.set(k, a);
      if (btn) btn.classList.toggle('on', on);
      if (on) toast('♥ 찜 목록에 담았어요.', '찜 목록 보기', 'mypage.html#wish'); else toast('찜을 해제했어요.');
      return on;
    }
  };

  /* ---------- 주문 / 리뷰 ---------- */
  var orders = {
    list: function (uid) { return LS.get('dasi_orders_' + uid, []); },
    add: function (uid, o) { var a = this.list(uid); a.unshift(o); LS.set('dasi_orders_' + uid, a); },
    newNo: function () {
      var d = new Date();
      return 'D' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + Math.floor(1000 + Math.random() * 9000);
    }
  };
  var reviews = {
    list: function (uid) { return LS.get('dasi_reviews_' + uid, []); },
    add: function (uid, r) { var a = this.list(uid); a.unshift(r); LS.set('dasi_reviews_' + uid, a); },
    remove: function (uid, rid) { LS.set('dasi_reviews_' + uid, this.list(uid).filter(function (r) { return r.rid !== rid; })); }
  };

  /* ---------- 공통 UI: 토스트, 헤더 로그인 표시, 장바구니 배지 ---------- */
  var css = document.createElement('style');
  css.textContent =
    '.dasi-toast{position:fixed;left:50%;bottom:28px;transform:translate(-50%,20px);background:#2b2118;color:#f6efe2;' +
    'border:2px solid #c9972b;border-radius:40px;padding:11px 22px;font:500 14px/1.4 "Noto Sans KR",sans-serif;z-index:300;' +
    'opacity:0;pointer-events:none;transition:.3s;display:flex;gap:14px;align-items:center;box-shadow:4px 4px 0 rgba(0,0,0,.25);' +
    'max-width:calc(100vw - 32px)}' +
    '.dasi-toast.on{opacity:1;transform:translate(-50%,0);pointer-events:auto}' +
    '.dasi-toast a{color:#c9972b;font-weight:700;white-space:nowrap;text-decoration:underline}' +
    '.user-nav a.me{max-width:150px;overflow:hidden;text-overflow:ellipsis}';
  document.head.appendChild(css);

  var toastTimer;
  function toast(msg, linkText, href) {
    var t = document.getElementById('dasiToast');
    if (!t) { t = document.createElement('div'); t.id = 'dasiToast'; t.className = 'dasi-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.innerHTML = '<span>' + esc(msg) + '</span>' + (linkText ? '<a href="' + esc(href) + '">' + esc(linkText) + '</a>' : '');
    void t.offsetWidth;
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('on'); }, 3200);
  }

  function badge() {
    var n = cart.count(), el = document.getElementById('cartN');
    if (el) el.textContent = n;
  }
  function renderHeader() {
    var box = document.querySelector('.user-nav');
    if (!box) return;
    var u = current();
    var cartA = '<a href="cart.html" class="cart" aria-label="장바구니" style="border:0">🛒<i id="cartN">' + cart.count() + '</i></a>';
    box.innerHTML = u
      ? '<a href="mypage.html" class="btn-login me" title="마이페이지">👤 ' + esc(u.name) + '님</a>' +
        '<a href="#" class="btn-join" id="logoutBtn">로그아웃</a>' + cartA
      : '<a href="login.html" class="btn-login">로그인</a><a href="join.html" class="btn-join">회원가입</a>' + cartA;
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('#logoutBtn');
    if (!b) return;
    e.preventDefault();
    logout();
    if (/mypage\.html/.test(location.pathname)) { location.href = 'index.html'; return; }
    renderHeader();
    toast('로그아웃되었어요.');
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderHeader);
  else renderHeader();

  /* ---------- 외부로 공개 ---------- */
  window.DASI = {
    PRODUCTS: PRODUCTS, product: product, cover: cover, won: won, esc: esc, fmtPhone: fmtPhone, v: v,
    FREE_SHIP: FREE_SHIP, MAX_QTY: MAX_QTY, ship: ship, safeNext: safeNext,
    findUser: findUser, current: current, register: register, login: login, logout: logout,
    updateUser: updateUser, changePassword: changePassword, verifyPassword: verifyPassword,
    findId: findId, resetPassword: resetPassword, removeUser: removeUser, requireLogin: requireLogin,
    cart: cart, wish: wish, orders: orders, reviews: reviews,
    toast: toast, renderHeader: renderHeader, badge: badge
  };
})();
