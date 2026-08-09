/* ==========================================================
   FROTA MASTER - TRAVA DE SEGURANÇA (v3)
   - Bloqueia tentativas de abrir ferramentas de desenvolvedor
     (F12, Ctrl+Shift+I/J/C/K, Ctrl+U/S/P, botão direito, menu do
     navegador)
   - NOVO: é possível LIBERAR o modo desenvolvedor informando
     usuário e senha de desenvolvedor. Liberado, o F12 e as demais
     ferramentas funcionam normalmente durante a sessão.
   - Logout automático por inatividade (15 minutos)

   >>> ALTERE AQUI O USUÁRIO E A SENHA DE DESENVOLVEDOR <<<
   ========================================================== */
(function () {
  "use strict";

  var DEV_USUARIO = "carlos";
  var DEV_SENHA = "J@ky1075@";

  var TEMPO_INATIVIDADE = 15 * 60 * 1000; // 15 minutos
  var CHAVE_DEV = "frotaDevLiberado";
  var bloqueado = false;

  function devLiberado() {
    try {
      return sessionStorage.getItem(CHAVE_DEV) === "1";
    } catch (e) {
      return false;
    }
  }

  /* ---------- 1. Overlay de bloqueio + login de desenvolvedor ---------- */
  function criarOverlay() {
    if (document.getElementById("segurancaOverlay")) return;
    var d = document.createElement("div");
    d.id = "segurancaOverlay";
    d.style.cssText =
      "display:none;position:fixed;inset:0;z-index:2147483647;background:#0f172a;" +
      "color:#fff;flex-direction:column;align-items:center;justify-content:center;" +
      "text-align:center;font-family:Inter,sans-serif;padding:24px";
    d.innerHTML =
      '<div style="font-size:52px;margin-bottom:10px">🔒</div>' +
      '<h3 style="font-weight:800;margin-bottom:8px">Acesso bloqueado</h3>' +
      '<p style="color:#94a3b8;max-width:460px">Foi detectada uma tentativa de abrir as ferramentas de desenvolvedor.<br>' +
      "Se você é o desenvolvedor, informe usuário e senha para liberar o acesso.</p>" +
      '<div style="margin-top:18px;display:flex;flex-direction:column;gap:8px;width:280px">' +
      '<input id="segDevUser" type="text" placeholder="Usuário do desenvolvedor" autocomplete="off" ' +
      'style="padding:10px 12px;border-radius:8px;border:1px solid #334155;background:#1e293b;color:#fff">' +
      '<input id="segDevPass" type="password" placeholder="Senha do desenvolvedor" ' +
      'style="padding:10px 12px;border-radius:8px;border:1px solid #334155;background:#1e293b;color:#fff">' +
      '<button id="segDevBtn" style="background:#22c55e;border:none;color:#052e16;padding:10px 22px;' +
      'border-radius:8px;font-weight:800;cursor:pointer">Liberar ferramentas</button>' +
      '<div id="segDevErro" style="color:#f87171;font-size:13px;min-height:18px"></div>' +
      '<button id="segurancaBtnReload" style="background:#3b82f6;border:none;color:#fff;padding:10px 22px;' +
      'border-radius:8px;font-weight:700;cursor:pointer">Voltar ao login</button>' +
      "</div>";
    document.body.appendChild(d);

    document.getElementById("segurancaBtnReload").addEventListener("click", function () {
      location.reload();
    });
    document.getElementById("segDevBtn").addEventListener("click", tentarLiberar);
    document.getElementById("segDevPass").addEventListener("keydown", function (e) {
      if (e.key === "Enter") tentarLiberar();
    });
  }

  function tentarLiberar() {
    var u = (document.getElementById("segDevUser").value || "").trim();
    var p = document.getElementById("segDevPass").value || "";
    var erro = document.getElementById("segDevErro");
    if (u === DEV_USUARIO && p === DEV_SENHA) {
      try {
        sessionStorage.setItem(CHAVE_DEV, "1");
      } catch (e) {}
      erro.style.color = "#4ade80";
      erro.textContent = "Modo desenvolvedor liberado. Recarregando...";
      setTimeout(function () {
        location.reload();
      }, 700);
    } else {
      erro.style.color = "#f87171";
      erro.textContent = "Usuário ou senha de desenvolvedor inválidos.";
    }
  }

  function esconderSistema() {
    ["sistema", "sistemaMain"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.style.display = "none";
    });
    var login = document.getElementById("loginTela");
    if (login) login.style.display = "none";
  }

  function bloquear() {
    if (bloqueado || devLiberado()) return;
    bloqueado = true;
    criarOverlay();
    esconderSistema();
    var ov = document.getElementById("segurancaOverlay");
    if (ov) ov.style.display = "flex";
    // encerra a sessão -> obriga usuário e senha novamente
    try {
      if (window.auth && auth.currentUser) auth.signOut();
    } catch (e) {}
  }
  window.bloquearSistema = bloquear;

  /* ---------- Modo desenvolvedor: libera tudo ---------- */
  function mostrarAvisoDev() {
    if (document.getElementById("segDevBadge")) return;
    var b = document.createElement("div");
    b.id = "segDevBadge";
    b.textContent = "MODO DESENVOLVEDOR LIBERADO — clique para sair";
    b.style.cssText =
      "position:fixed;bottom:12px;right:12px;z-index:2147483000;background:#f59e0b;color:#1c1917;" +
      "font:700 12px Inter,sans-serif;padding:8px 12px;border-radius:8px;cursor:pointer;opacity:.9";
    b.addEventListener("click", function () {
      try {
        sessionStorage.removeItem(CHAVE_DEV);
      } catch (e) {}
      location.reload();
    });
    document.body.appendChild(b);
  }

  window.sairModoDev = function () {
    try {
      sessionStorage.removeItem(CHAVE_DEV);
    } catch (e) {}
    location.reload();
  };

  if (devLiberado()) {
    // Nenhuma proteção ativa: F12, botão direito e console funcionam normalmente.
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", mostrarAvisoDev);
    } else {
      mostrarAvisoDev();
    }
    return;
  }

  /* ---------- 2. Atalhos de inspeção ---------- */
  function ehAtalhoInspecao(e) {
    var k = (e.key || "").toUpperCase();
    var code = e.keyCode || 0;
    var ctrl = e.ctrlKey || e.metaKey;
    if (k === "F12" || code === 123) return true;
    if (ctrl && e.shiftKey && (k === "I" || k === "J" || k === "C" || k === "K")) return true;
    if (ctrl && (k === "U" || k === "S" || k === "P")) return true;
    // macOS: Cmd+Option+I / J / C / U
    if (e.metaKey && e.altKey && (k === "I" || k === "J" || k === "C" || k === "U")) return true;
    return false;
  }

  document.addEventListener(
    "keydown",
    function (e) {
      if (!ehAtalhoInspecao(e)) return;
      e.preventDefault();
      e.stopPropagation();
      bloquear();
      return false;
    },
    true
  );

  document.addEventListener("contextmenu", function (e) {
    e.preventDefault();
  });

  document.addEventListener("dragstart", function (e) {
    e.preventDefault();
  });

  /* ---------- 3. Menu do navegador (Inspecionar / Ver código-fonte) ---------- */
  var sonda = /./;
  var detectado = false;
  Object.defineProperty(sonda, "id", {
    get: function () {
      detectado = true;
      return "";
    },
  });
  setInterval(function () {
    if (bloqueado) return;
    detectado = false;
    try {
      console.debug(sonda);
      console.clear();
    } catch (e) {}
    if (detectado) bloquear();
  }, 2000);

  /* ---------- 4. Logout automático por inatividade ---------- */
  var timerInativo = null;
  function reiniciarTimer() {
    clearTimeout(timerInativo);
    timerInativo = setTimeout(function () {
      var logado = false;
      try {
        logado = !!(window.auth && auth.currentUser);
      } catch (e) {}
      if (logado) bloquear();
    }, TEMPO_INATIVIDADE);
  }
  ["click", "keydown", "mousemove", "touchstart", "scroll"].forEach(function (ev) {
    document.addEventListener(ev, reiniciarTimer, { passive: true });
  });
  reiniciarTimer();
})();
