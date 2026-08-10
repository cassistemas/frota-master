/* ==========================================================
   FROTA MASTER - REGISTRO DE AUTORIA
   Grava automaticamente QUEM registrou (e quem alterou)
   cada lançamento, em todos os módulos, sem precisar
   alterar cada formulário.
   ========================================================== */
(function () {
  "use strict";

  var jaCarregados = new WeakSet();

  // "db" e "usuarioLogado" são declarados com let no index.html:
  // existem no escopo global léxico, mas não em window.
  function getDb() {
    try { return typeof db !== "undefined" ? db : null; } catch (e) { return null; }
  }
  function getUsuario() {
    try { return typeof usuarioLogado !== "undefined" ? usuarioLogado : null; } catch (e) { return null; }
  }

  function nomeUsuarioAtual() {
    try {
      var u = getUsuario();
      if (u && (u.nome || u.email)) {
        return u.nome || u.email;
      }
      if (window.auth && auth.currentUser) {
        return auth.currentUser.displayName || auth.currentUser.email || "Usuário";
      }
    } catch (e) {}
    return "Usuário";
  }
  window.nomeUsuarioAtual = nomeUsuarioAtual;

  // Marca os registros que vieram da nuvem para não sobrescrever a autoria original
  window.marcarRegistrosCarregados = function (lista) {
    if (!Array.isArray(lista)) return;
    lista.forEach(function (o) {
      if (o && typeof o === "object") jaCarregados.add(o);
    });
  };

  // Carimba todo registro novo/alterado antes de subir para a nuvem
  window.carimbarRegistros = function () {
    var base = getDb();
    if (!base) return;
    var nome = nomeUsuarioAtual();
    var agora = new Date().toISOString();

    Object.keys(base).forEach(function (mod) {
      var lista = base[mod];
      if (!Array.isArray(lista)) return;

      lista.forEach(function (obj) {
        if (!obj || typeof obj !== "object") return;
        if (jaCarregados.has(obj)) return;

        if (!obj._registradoPor) {
          obj._registradoPor = nome;
          obj._registradoEm = agora;
        }
        obj._alteradoPor = nome;
        obj._alteradoEm = agora;

        jaCarregados.add(obj);
      });
    });
  };

  function dataBRCurta(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR").slice(0, 5);
  }

  // Mostra a autoria como dica (tooltip) em cada linha das tabelas
  function aplicarAutoriaNasTabelas() {
    document.querySelectorAll("table tbody tr").forEach(function (tr) {
      var btn = tr.querySelector("[onclick^='editar(']");
      if (!btn) return;

      var m = (btn.getAttribute("onclick") || "").match(/editar\('([^']+)',\s*(\d+)\)/);
      if (!m) return;

      var base = getDb();
      var lista = base && base[m[1]];
      var reg = Array.isArray(lista) ? lista[Number(m[2])] : null;
      if (!reg) return;

      var partes = [];
      if (reg._registradoPor) {
        partes.push("Registrado por: " + reg._registradoPor + (reg._registradoEm ? " em " + dataBRCurta(reg._registradoEm) : ""));
      }
      if (reg._alteradoPor && reg._alteradoPor !== reg._registradoPor) {
        partes.push("Última alteração: " + reg._alteradoPor + (reg._alteradoEm ? " em " + dataBRCurta(reg._alteradoEm) : ""));
      }
      if (!partes.length) return;

      tr.title = partes.join("\n");
      tr.setAttribute("data-autoria", reg._registradoPor || "");
    });
  }
  window.aplicarAutoriaNasTabelas = aplicarAutoriaNasTabelas;

  // Reaplica após cada renderização de módulo
  function instalarHook() {
    if (typeof window.renderModulo !== "function" || window.renderModulo.__autoria) return false;
    var original = window.renderModulo;
    var wrapper = function () {
      var r = original.apply(this, arguments);
      setTimeout(aplicarAutoriaNasTabelas, 0);
      return r;
    };
    wrapper.__autoria = true;
    window.renderModulo = wrapper;
    return true;
  }

  if (!instalarHook()) {
    var tentativas = 0;
    var t = setInterval(function () {
      if (instalarHook() || ++tentativas > 40) clearInterval(t);
    }, 250);
  }
})();
