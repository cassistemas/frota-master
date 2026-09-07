/* =====================================================
   FROTA MASTER — INDICADOR DE CONEXÃO COM O BANCO
   Mostra sempre, de forma fixa, se o banco de dados está
   conectado, se os dados estão vindo do cache offline
   (fila de envio) ou se falta login.
   Os dados ficam em coleções compartilhadas (frota/*),
   portanto abrem em qualquer lugar e para qualquer usuário.
   ===================================================== */
(function () {
  "use strict";

  var ESTADOS = {
    conectado: { txt: "Banco conectado", cor: "#198754", ponto: "#7bffb0" },
    offline:   { txt: "Sem conexão — dados na fila", cor: "#fd7e14", ponto: "#ffe08a" },
    semlogin:  { txt: "Sem login — faça login para gravar", cor: "#dc3545", ponto: "#ffc9c9" },
    ligando:   { txt: "Conectando ao banco...", cor: "#0d6efd", ponto: "#cfe2ff" }
  };

  var el = null;
  var ultimoSync = null;
  var doCache = true;

  function criar() {
    if (el) return el;
    el = document.createElement("div");
    el.id = "fmBancoStatus";
    el.style.cssText =
      "position:fixed;left:16px;bottom:16px;z-index:99998;display:flex;align-items:center;gap:8px;" +
      "padding:8px 14px;border-radius:999px;font-size:12.5px;font-weight:700;color:#fff;" +
      "font-family:Arial,Helvetica,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,.25);cursor:default;";
    el.innerHTML = '<span class="fmbs-ponto" style="width:9px;height:9px;border-radius:50%;display:inline-block"></span><span class="fmbs-txt"></span>';
    document.body.appendChild(el);
    return el;
  }

  function pintar(estado) {
    var e = ESTADOS[estado] || ESTADOS.ligando;
    criar();
    el.style.background = e.cor;
    el.querySelector(".fmbs-txt").innerText = e.txt;
    el.querySelector(".fmbs-ponto").style.background = e.ponto;
    el.title = ultimoSync
      ? "Última sincronização com o banco: " + ultimoSync.toLocaleString("pt-BR")
      : "Aguardando primeira sincronização com o banco";
  }

  function avaliar() {
    var logado = false;
    try { logado = !!(window.auth && auth.currentUser); } catch (x) {}
    if (!logado) return pintar("semlogin");
    if (!navigator.onLine || doCache) return pintar("offline");
    pintar("conectado");
  }

  function ligarEscuta() {
    if (typeof dbCloud === "undefined" || !dbCloud) return false;
    try {
      dbCloud.collection("frota").doc("veiculos")
        .onSnapshot({ includeMetadataChanges: true }, function (doc) {
          doCache = !!(doc.metadata && doc.metadata.fromCache);
          if (!doCache) ultimoSync = new Date();
          avaliar();
        }, function () {
          doCache = true;
          avaliar();
        });
    } catch (x) { return false; }
    return true;
  }

  function iniciar() {
    pintar("ligando");
    var tentativas = 0;
    var t = setInterval(function () {
      if (ligarEscuta() || ++tentativas > 60) clearInterval(t);
    }, 500);

    window.addEventListener("online", avaliar);
    window.addEventListener("offline", function () { doCache = true; avaliar(); });

    try {
      if (window.auth && auth.onAuthStateChanged) auth.onAuthStateChanged(avaliar);
    } catch (x) {}

    setInterval(avaliar, 5000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar);
  } else {
    iniciar();
  }
})();
