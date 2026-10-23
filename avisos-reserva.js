/* FROTA MASTER - Avisos com som das reservas (com a página aberta).
   Solicitante: aviso quando a reserva é aprovada/recusada.
   Administrador: aviso quando chega uma nova solicitação. */
(function () {
  "use strict";
  var visto = { reserva: null, admin: null };
  var ctx = null;
  function som() {
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") ctx.resume();
      [0, 0.22].forEach(function (t, i) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = i ? 1046 : 784; o.type = "sine";
        g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.35);
        o.connect(g); g.connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.4);
      });
    } catch (e) {}
    try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) {}
  }
  // Libera som e pede permissão no primeiro toque (navegadores exigem gesto).
  document.addEventListener("click", function lib() {
    document.removeEventListener("click", lib, true);
    try { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); ctx.resume(); } catch (e) {}
    try { if ("Notification" in window && Notification.permission === "default" && window.top === window.self) Notification.requestPermission(); } catch (e) {}
  }, true);

  function faixa(titulo, texto, cor) {
    var d = document.createElement("div");
    d.setAttribute("role", "alert");
    d.style.cssText = "position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:99999;max-width:92vw;width:420px;background:" + cor + ";color:#fff;border-radius:12px;padding:12px 40px 12px 14px;box-shadow:0 8px 24px rgba(0,0,0,.3);font:14px/1.35 system-ui,sans-serif";
    d.innerHTML = "<b style='display:block;font-size:15px;margin-bottom:2px'></b><span></span><button aria-label='Fechar' style='position:absolute;top:6px;right:8px;background:none;border:0;color:#fff;font-size:20px;cursor:pointer'>×</button>";
    d.querySelector("b").textContent = titulo; d.querySelector("span").textContent = texto;
    d.querySelector("button").onclick = function () { d.remove(); };
    document.body.appendChild(d);
    setTimeout(function () { if (d.parentNode) d.remove(); }, 15000);
  }
  function avisar(titulo, texto, cor) {
    som(); faixa(titulo, texto, cor);
    try {
      if ("Notification" in window && Notification.permission === "granted") {
        var n = new Notification(titulo, { body: texto, icon: "./icon-192.png", tag: titulo + texto });
        n.onclick = function () { window.focus(); n.close(); };
      }
    } catch (e) {}
    try { var t0 = document.title; document.title = "🔔 " + titulo; setTimeout(function () { document.title = t0; }, 8000); } catch (e) {}
  }
  function mapa(l) { var m = {}; l.forEach(function (s) { m[s.id] = s.status; }); return m; }

  window.FMAvisos = {
    // Lista das solicitações do próprio usuário.
    reserva: function (minhas) {
      var antes = visto.reserva; visto.reserva = mapa(minhas);
      if (!antes) return;
      minhas.forEach(function (s) {
        if (antes[s.id] === s.status) return;
        if (s.status === "Aprovada") avisar("Reserva aprovada ✅", s.placa + " · " + (s.destino || "") + (s.numeroReserva ? " · Nº " + s.numeroReserva : ""), "#198754");
        else if (s.status === "Recusada") avisar("Reserva recusada", s.placa + (s.motivoRecusa ? " · Motivo: " + s.motivoRecusa : ""), "#dc3545");
      });
    },
    // Lista completa para o administrador.
    admin: function (lista) {
      var antes = visto.admin; visto.admin = mapa(lista);
      if (!antes) return;
      lista.forEach(function (s) {
        if (antes[s.id] === s.status) return;
        if (s.status === "Pendente") avisar("Nova solicitação de reserva", (s.solicitante || "") + " · " + s.placa + " · " + (s.destino || ""), "#0d6efd");
        else if (s.status === "Devolução informada") avisar("Devolução informada", (s.solicitante || "") + " · " + s.placa, "#0dcaf0");
      });
    },
    limpar: function () { visto.reserva = null; visto.admin = null; }
  };
})();
