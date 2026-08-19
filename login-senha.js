/* ============================================================
   LOGIN: olho para ver a senha + "Esqueci a senha"
   + alerta em tempo real no centro da tela para o Administrador
   ============================================================ */
(function () {
  "use strict";

  var COL = "solicitacoesSenha";

  function injetarCss() {
    if (document.getElementById("cssLoginSenha")) return;
    var s = document.createElement("style");
    s.id = "cssLoginSenha";
    s.textContent = [
      "#loginPassWrap{position:relative;margin-bottom:1rem;}",
      "#loginPassWrap .form-control{padding-right:44px;margin-bottom:0;}",
      "#btnOlhoSenha{position:absolute;top:50%;right:6px;transform:translateY(-50%);border:0;background:transparent;cursor:pointer;padding:6px;line-height:0;color:#6c757d;}",
      "#btnOlhoSenha:hover{color:#0d6efd;}",
      "#linkEsqueciSenha{display:inline-block;margin-top:10px;font-size:13px;color:#0d6efd;cursor:pointer;text-decoration:underline;}",
      ".fmOverlay{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:99999;padding:16px;}",
      ".fmCard{background:#fff;border-radius:14px;padding:24px;width:100%;max-width:430px;box-shadow:0 20px 50px rgba(0,0,0,.35);text-align:left;animation:fmPop .18s ease-out;}",
      "@keyframes fmPop{from{transform:scale(.94);opacity:0}to{transform:scale(1);opacity:1}}",
      ".fmCard h5{font-weight:700;margin-bottom:6px;}",
      ".fmCard .fmMsg{font-size:13px;color:#555;margin-bottom:14px;}",
      ".fmCard .fmAcoes{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px;}",
      ".fmBadge{display:inline-block;background:#dc3545;color:#fff;border-radius:999px;font-size:12px;padding:2px 9px;margin-left:6px;}",
      ".fmItem{border:1px solid #e6e6e6;border-radius:10px;padding:10px 12px;margin-bottom:8px;}",
      ".fmItem b{display:block;font-size:14px;}",
      ".fmItem small{color:#777;}"
    ].join("");
    document.head.appendChild(s);
  }

  function olhoSvg(aberto) {
    return aberto
      ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>'
      : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M3 3l18 18"/></svg>';
  }

  function montarLogin() {
    var pass = document.getElementById("loginPass");
    if (!pass || document.getElementById("btnOlhoSenha")) return;

    var wrap = document.createElement("div");
    wrap.id = "loginPassWrap";
    pass.parentNode.insertBefore(wrap, pass);
    wrap.appendChild(pass);

    var btn = document.createElement("button");
    btn.type = "button";
    btn.id = "btnOlhoSenha";
    btn.title = "Mostrar senha";
    btn.setAttribute("aria-label", "Mostrar senha");
    btn.innerHTML = olhoSvg(false);
    btn.onclick = function () {
      var ver = pass.type === "password";
      pass.type = ver ? "text" : "password";
      btn.innerHTML = olhoSvg(ver);
      btn.title = ver ? "Ocultar senha" : "Mostrar senha";
      btn.setAttribute("aria-label", btn.title);
      pass.focus();
    };
    wrap.appendChild(btn);

    var erro = document.getElementById("loginErro");
    if (erro && !document.getElementById("linkEsqueciSenha")) {
      var link = document.createElement("span");
      link.id = "linkEsqueciSenha";
      link.textContent = "Esqueci a senha";
      link.onclick = abrirSolicitacao;
      erro.parentNode.insertBefore(link, erro);
    }
  }

  function fechar(id) {
    var el = document.getElementById(id);
    if (el) el.remove();
  }

  function overlay(id, html) {
    fechar(id);
    var o = document.createElement("div");
    o.className = "fmOverlay";
    o.id = id;
    o.innerHTML = '<div class="fmCard">' + html + "</div>";
    document.body.appendChild(o);
    return o;
  }

  function esc(t) {
    return String(t == null ? "" : t).replace(/[<>&"]/g, function (c) {
      return { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c];
    });
  }

  /* ---------- recuperação de senha (auto-atendimento por email) ---------- */
  function abrirSolicitacao() {
    var email = (document.getElementById("loginUser") || {}).value || "";
    overlay(
      "fmSolicitaSenha",
      '<h5>Recuperar senha</h5>' +
        '<div class="fmMsg">Informe o email cadastrado no sistema. Se houver cadastro, enviaremos um link seguro para criar uma nova senha. Caso nao tenha cadastro, solicite ao administrador.</div>' +
        '<input id="fmSolEmail" class="form-control mb-2" type="email" maxlength="120" placeholder="Seu email cadastrado" value="' + esc(email) + '">' +
        '<div id="fmSolFeedback" style="font-size:13px;margin-top:6px;"></div>' +
        '<div class="fmAcoes"><button class="btn btn-primary" id="fmSolEnviar">Enviar link de redefinição</button>' +
        '<button class="btn btn-secondary" id="fmSolCancelar">Cancelar</button></div>'
    );
    document.getElementById("fmSolCancelar").onclick = function () { fechar("fmSolicitaSenha"); };
    document.getElementById("fmSolEnviar").onclick = enviarSolicitacao;
    var inp = document.getElementById("fmSolEmail");
    inp.focus();
    inp.onkeydown = function (ev) { if (ev.key === "Enter") enviarSolicitacao(); };
  }

  function registrarSolicitacao(email) {
    // Log opcional para o administrador. Se as regras do Firestore não
    // permitirem escrita anônima, o erro é ignorado silenciosamente.
    try {
      if (typeof dbCloud === "undefined") return;
      dbCloud.collection(COL).add({
        email: email,
        origem: "auto-atendimento",
        status: "pendente",
        criadoEm: new Date().toISOString()
      }).catch(function () {});
    } catch (e) {}
  }

  function msgNaoCadastrado(fb, email) {
    fb.style.color = "#dc3545";
    fb.innerHTML = "O email <b>" + esc(email) + "</b> nao esta cadastrado no sistema.<br>" +
      "Confira se digitou corretamente ou solicite ao administrador a alteracao da senha.";
  }

  // Confirma se o email existe no Firebase Auth antes de enviar qualquer link.
  function emailCadastrado(email) {
    if (typeof auth === "undefined" || !auth.fetchSignInMethodsForEmail) {
      return Promise.resolve(null); // indeterminado
    }
    return auth.fetchSignInMethodsForEmail(email)
      .then(function (m) { return !!(m && m.length); })
      .catch(function () { return null; });
  }

  function enviarSolicitacao() {
    var fb = document.getElementById("fmSolFeedback");
    var btn = document.getElementById("fmSolEnviar");
    var email = (document.getElementById("fmSolEmail").value || "").trim().toLowerCase().slice(0, 120);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      fb.style.color = "#dc3545";
      fb.innerText = "Informe um email valido.";
      return;
    }
    if (typeof auth === "undefined" || !auth.sendPasswordResetEmail) {
      fb.style.color = "#dc3545";
      fb.innerText = "Sem conexao com o servidor. Tente novamente.";
      return;
    }

    btn.disabled = true;
    fb.style.color = "#555";
    fb.innerText = "Verificando cadastro...";

    emailCadastrado(email).then(function (existe) {
      if (existe === false) {
        btn.disabled = false;
        msgNaoCadastrado(fb, email);
        return;
      }
      fb.innerText = "Enviando...";
      // Sem actionCodeSettings: evita auth/invalid-continue-uri em file:// ou
      // dominios nao autorizados. O Firebase usa a pagina padrao de reset.
      return auth.sendPasswordResetEmail(email)
        .then(function () {
          registrarSolicitacao(email);
          fb.style.color = "#198754";
          fb.innerHTML = "Link enviado para <b>" + esc(email) +
            "</b>.<br>Abra seu email e clique no link para criar uma nova senha. Verifique tambem a caixa de spam.";
          btn.remove();
          setTimeout(function () { fechar("fmSolicitaSenha"); }, 7000);
        })
        .catch(function (e) {
          btn.disabled = false;
          var c = (e && e.code) || "";
          if (c === "auth/user-not-found") {
            msgNaoCadastrado(fb, email);
          } else if (c === "auth/invalid-email") {
            fb.style.color = "#dc3545";
            fb.innerText = "Email invalido.";
          } else if (c === "auth/too-many-requests") {
            fb.style.color = "#dc3545";
            fb.innerText = "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
          } else {
            fb.style.color = "#dc3545";
            fb.innerText = "Nao foi possivel enviar: " + ((e && e.message) || e);
          }
        });
    });
  }

  /* ---------- alerta em tempo real (Admin) ---------- */
  var unsub = null, vistos = {}, primeira = true;

  function escutarSolicitacoes() {
    if (typeof usuarioLogado === "undefined" || !usuarioLogado) return;
    if (usuarioLogado.tipo !== "admin") return;
    if (unsub || typeof dbCloud === "undefined") return;

    unsub = dbCloud.collection(COL).where("status", "==", "pendente").onSnapshot(function (snap) {
      var itens = [];
      snap.forEach(function (d) { itens.push(Object.assign({ id: d.id }, d.data())); });
      itens.sort(function (a, b) { return String(b.criadoEm || "").localeCompare(String(a.criadoEm || "")); });

      var novas = itens.filter(function (i) { return !vistos[i.id]; });
      itens.forEach(function (i) { vistos[i.id] = true; });

      if (!itens.length) { fechar("fmAlertaSenha"); primeira = false; return; }
      if (novas.length || primeira || document.getElementById("fmAlertaSenha")) renderAlerta(itens);
      primeira = false;
    }, function (e) { console.warn("solicitacoesSenha:", e && e.message); });
  }

  function renderAlerta(itens) {
    var html = '<h5>Solicitações de nova senha<span class="fmBadge">' + itens.length + "</span></h5>" +
      '<div class="fmMsg">Usuários pediram redefinição de senha:</div>' +
      '<div style="max-height:260px;overflow:auto">' +
      itens.map(function (i) {
        var quando = i.criadoEm ? new Date(i.criadoEm).toLocaleString("pt-BR") : "";
        return '<div class="fmItem"><b>' + esc(i.email) + "</b>" +
          (i.nome ? "<small>" + esc(i.nome) + "</small><br>" : "") +
          (i.observacao ? "<small>" + esc(i.observacao) + "</small><br>" : "") +
          "<small>" + esc(quando) + "</small>" +
          '<div class="fmAcoes">' +
          '<button class="btn btn-sm btn-primary" data-reset="' + esc(i.id) + '" data-email="' + esc(i.email) + '">Enviar link de redefinição</button>' +
          '<button class="btn btn-sm btn-outline-secondary" data-ok="' + esc(i.id) + '">Marcar como resolvida</button>' +
          "</div></div>";
      }).join("") + "</div>" +
      '<div id="fmAlertaFeedback" style="font-size:13px;margin-top:8px;"></div>' +
      '<div class="fmAcoes"><button class="btn btn-secondary" id="fmAlertaFechar">Fechar</button></div>';

    var o = overlay("fmAlertaSenha", html);
    o.querySelector("#fmAlertaFechar").onclick = function () { fechar("fmAlertaSenha"); };
    Array.prototype.forEach.call(o.querySelectorAll("[data-ok]"), function (b) {
      b.onclick = function () { resolver(b.getAttribute("data-ok")); };
    });
    Array.prototype.forEach.call(o.querySelectorAll("[data-reset]"), function (b) {
      b.onclick = function () {
        var fb = document.getElementById("fmAlertaFeedback");
        fb.style.color = "#555";
        fb.innerText = "Enviando link...";
        auth.sendPasswordResetEmail(b.getAttribute("data-email")).then(function () {
          fb.style.color = "#198754";
          fb.innerText = "Link enviado para " + b.getAttribute("data-email");
          resolver(b.getAttribute("data-reset"));
        }).catch(function (e) {
          fb.style.color = "#dc3545";
          fb.innerText = "Erro: " + (e.message || e);
        });
      };
    });
  }

  function resolver(id) {
    dbCloud.collection(COL).doc(id).set({
      status: "resolvida",
      resolvidoEm: new Date().toISOString(),
      resolvidoPor: (typeof usuarioLogado !== "undefined" && usuarioLogado && (usuarioLogado.email || usuarioLogado.nome)) || "admin"
    }, { merge: true }).catch(function (e) { console.warn(e); });
  }

  /* ---------- integração com o sistema ---------- */
  function hookIniciarSistema() {
    if (typeof window.iniciarSistema !== "function") return false;
    if (window.iniciarSistema.__fmSenha) return true;
    var orig = window.iniciarSistema;
    window.iniciarSistema = function () {
      var r = orig.apply(this, arguments);
      setTimeout(escutarSolicitacoes, 800);
      return r;
    };
    window.iniciarSistema.__fmSenha = true;
    return true;
  }

  function boot() {
    injetarCss();
    montarLogin();
    if (!hookIniciarSistema()) setTimeout(hookIniciarSistema, 1200);
    setTimeout(escutarSolicitacoes, 2500);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.abrirSolicitacaoSenha = abrirSolicitacao;
})();
