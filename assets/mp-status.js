/* ── 琥比水果盤・連線版：主機 ONLINE／OFFLINE 狀態燈（2026-10-01 加）──────────
   頁面上只要放一個 <span data-mp-lamp>◎ OFFLINE</span>（可再加 <span data-mp-sub>），
   再引用這支檔案，就會自動判斷並點燈 —— 樣式也由這支檔案注入，兩邊不用各加 CSS。

   判斷順序（任何一個說「在線」就算在線）：
     1. window.HOOBE_STATUS_URL ─ 主機自己提供的狀態端點，HTTP 200 即算在線
     2. window.HOOBE_STATUS_WS  ─ 指定的 WebSocket 位址，連得上即算在線
     3. 同源 WebSocket          ─ 頁面本身就是主機送出來的（例：在主機位址開啟）
     4. Abacus 心跳桶           ─ 公開站唯一查得到的方式，也不洩漏主機位址：
                                  主機每 5 分鐘打一次 hit/hoobe-hubi/hk-<時間桶>

   查不到一律顯示 OFFLINE（亮紅，2026-10-03 由使用者指示：灰色不夠醒目）—— 不謊報在線；查詢中顯示「⋯」。
   本機（localhost）預覽固定顯示「本機預覽」，完全不對外查詢。
   關掉自動查詢：window.HOOBE_STATUS_OFF = true
─────────────────────────────────────────────────────────────────────────── */
(function () {
  if (window.HOOBE_STATUS_OFF) return;

  var NS = 'hoobe-hubi';                       /* 與訪客計數同一個免費計數服務 */
  var API = 'https://abacus.jasoncameron.dev/';
  var BUCKET = 600;                            /* 心跳時間桶：10 分鐘（秒） */
  var LOOKBACK = 2;                            /* 往回看幾個桶（含現在） */
  var CHECK_EVERY = 30000;                     /* 每 30 秒重查 */
  var TIMEOUT = 2500;                          /* 單次查詢上限（毫秒） */

  var lamps = [].slice.call(document.querySelectorAll('[data-mp-lamp]'));
  if (!lamps.length) return;
  var subs = [].slice.call(document.querySelectorAll('[data-mp-sub]'));

  /* 樣式（單一來源） */
  var st = document.createElement('style');
  st.textContent =
    '.mplamp{display:inline-block; vertical-align:middle; margin-left:9px; padding:3px 10px; border-radius:99px;' +
      'font:700 12px/1 "Courier New",monospace; letter-spacing:1.5px; white-space:nowrap;' +
      'color:#9aa0a3; background:rgba(255,255,255,.05); box-shadow:inset 0 0 0 1px rgba(255,255,255,.10);' +
      'transition:color .2s ease, background .2s ease}' +
    '.mplamp.on{color:#062e29; background:linear-gradient(180deg,#5fe0cf,#2fb8a8);' +
      'box-shadow:0 0 14px rgba(47,184,168,.45), inset 0 0 0 1px rgba(255,255,255,.35)}' +
    '.mplamp.na{color:#c9a227; background:rgba(201,162,39,.10); box-shadow:inset 0 0 0 1px rgba(201,162,39,.35)}' +
    '.mplamp.off{color:#fff; background:linear-gradient(180deg,#ff6a5e,#d81600);' +
      'box-shadow:0 0 16px rgba(216,22,0,.6), inset 0 0 0 1px rgba(255,255,255,.40)}' +
    '.mpsub{display:block; margin:7px 0 0; font:11.5px/1.6 "Courier New",monospace; color:#7f8688; letter-spacing:.5px}';
  document.head.appendChild(st);

  function paint(cls, text, sub) {
    for (var i = 0; i < lamps.length; i++) {
      lamps[i].className = 'mplamp' + (cls ? ' ' + cls : '');
      lamps[i].textContent = text;
    }
    if (sub !== undefined) for (var j = 0; j < subs.length; j++) subs[j].textContent = sub;
  }

  /* 本機預覽：不查（也不要讓本機檢查被誤認成主機離線） */
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/.test(location.hostname)) {
    paint('na', '◎ 本機預覽', '（本機開啟時不對外查詢主機狀態）');
    return;
  }

  var CFG_STATUS_URL = window.HOOBE_STATUS_URL || '';
  var CFG_WS = window.HOOBE_STATUS_WS || '';

  function checkHttp(url) {
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, TIMEOUT);
    var opt = { cache: 'no-store' };
    if (ctl) opt.signal = ctl.signal;
    return fetch(url, opt).then(function (r) {
      clearTimeout(timer);
      return r.ok ? { on: true, sub: '主機在線（狀態端點有回應）' }
                  : { on: false, sub: '主機沒回應（狀態端點 ' + r.status + '）' };
    }).catch(function () {
      clearTimeout(timer);
      return { on: false, sub: '連不上主機（狀態端點沒有回應）' };
    });
  }

  function checkWS(url) {
    return new Promise(function (resolve) {
      var done = false, ws;
      try { ws = new WebSocket(url); }
      catch (e) { resolve({ on: false, sub: '連不上主機（' + url + '）' }); return; }
      function end(v) { if (done) return; done = true; clearTimeout(t); try { ws.close(); } catch (e) {} resolve(v); }
      var t = setTimeout(function () { end({ on: false, sub: '主機沒有回應（' + url + '）' }); }, TIMEOUT);
      ws.onopen = function () { end({ on: true, sub: '主機在線（連上 ' + url + '）' }); };
      ws.onerror = function () { end({ on: false, sub: '連不上主機（' + url + '）' }); };
    });
  }

  function getKey(k) {
    return fetch(API + 'get/' + NS + '/' + k).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return (j && typeof j.value === 'number') ? j.value : null; })
      .catch(function () { return null; });
  }

  /* 心跳桶：主機每 5 分鐘打一次 hit，頁面往回看兩個桶（最多約 20 分鐘的容忍度） */
  function checkHeartbeat() {
    var b = Math.floor(Date.now() / 1000 / BUCKET), keys = [], i;
    for (i = 0; i < LOOKBACK; i++) keys.push('hk-' + (b - i));
    return Promise.all(keys.map(getKey)).then(function (vals) {
      for (i = 0; i < vals.length; i++) {
        if (vals[i] && vals[i] > 0) {
          return { on: true, sub: (i === 0) ? '主機在線（剛剛回報）' : '主機在線（約 ' + (i * BUCKET / 60) + ' 分鐘前回報）' };
        }
      }
      return { on: false, sub: '主機離線，或還沒裝好回報（最近 ' + (LOOKBACK * BUCKET / 60) + ' 分鐘沒有回報）' };
    });
  }

  function probes() {
    var list = [];
    if (CFG_STATUS_URL) list.push(checkHttp(CFG_STATUS_URL));
    if (CFG_WS) list.push(checkWS(CFG_WS));
    /* 頁面由主機送出時（例：在主機位址開啟）才做同源探測；GitHub Pages 上不做 */
    else if (!/\.github\.io$/.test(location.hostname)) {
      list.push(checkWS((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host));
    }
    list.push(checkHeartbeat());
    return list;
  }

  var running = false;
  function check() {
    if (running) return;
    running = true;
    paint('', '◎ ⋯', '查詢主機狀態…');
    Promise.all(probes()).then(function (rs) {
      var i, sub = '';
      for (i = 0; i < rs.length; i++) if (rs[i] && rs[i].on) { paint('on', '◉ ONLINE', rs[i].sub); running = false; return; }
      for (i = 0; i < rs.length; i++) if (rs[i] && rs[i].sub) sub = rs[i].sub;
      paint('off', '◎ OFFLINE', sub);
      running = false;
    })['catch'](function () {
      paint('off', '◎ OFFLINE', '狀態查詢失敗（網路或瀏覽器阻擋）');
      running = false;
    });
  }

  check();
  setInterval(function () { if (!document.hidden) check(); }, CHECK_EVERY);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) check(); });
})();
