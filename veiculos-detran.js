/* ============================================================
   FROTA MASTER - MODULO: CONSULTA DETRAN (aba dentro de Veiculos)
   ------------------------------------------------------------
   COMO USAR:
   1) Salve este arquivo como  veiculos-detran.js  na mesma pasta
      do seu index.html
   2) No FINAL do index.html, ANTES de </body>, adicione:

        <script src="veiculos-detran.js"></script>

   Pronto. O script cria sozinho as abas "Cadastro de Veiculos"
   e "Consulta DETRAN" dentro da div #veiculos.

   FUNCIONAMENTO (com a FIPE API de Deivid Fortuna -
   parallelum.com.br/fipe/api/v1):
   - Busca por PLACA ou RENAVAM na base local (db.detran) e no
     cadastro da frota.
   - Consulta FIPE gratuita pela API do Deivid Fortuna (sem token,
     sem cadastro): Tipo > Marca > Modelo > Ano, retornando marca,
     modelo, ano, combustivel, codigo FIPE e valor de tabela.
   - Os demais campos (chassi, RENAVAM, proprietario, restricoes,
     licenciamento) sao de preenchimento MANUAL, pois a FIPE API
     nao expoe a base do DETRAN por placa.
   - Tudo fica salvo no navegador (localStorage) e e sincronizado
     com a nuvem se a funcao salvarNuvem() existir.
============================================================ */
(function () {
  "use strict";

  var STORAGE = "FM_DETRAN";
  var FIPEAPI = "https://parallelum.com.br/fipe/api/v1";
  var TIMEOUT = 20000;
  var PAG = { pagina: 1, porPagina: 10 };
  var editIdx = -1;
  var FIPE = { marcas: [], modelos: [], anos: [], marcaNome: "", modeloNome: "", atual: null };

  /* ---------------- normalizacao ---------------- */
  function normPlaca(v) {
    return String(v || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 7);
  }
  function normRenavam(v) {
    return String(v || "").replace(/\D/g, "").slice(0, 11);
  }
  function soAno(v) {
    var m = String(v || "").match(/\d{4}/);
    return m ? m[0] : "";
  }
  function normFipe(v) {
    var d = String(v || "").replace(/[^0-9]/g, "");
    if (d.length === 7) return d.slice(0, 6) + "-" + d.slice(6);
    return String(v || "").trim();
  }

  /* ---------------- FIPE API (Deivid Fortuna) ---------------- */
  function getJson(caminho) {
    var url = FIPEAPI + caminho;
    var opts = { method: "GET", headers: { Accept: "application/json" } };
    var ctrl = null;
    var timer = null;
    if (typeof AbortController !== "undefined") {
      ctrl = new AbortController();
      opts.signal = ctrl.signal;
      timer = setTimeout(function () {
        ctrl.abort();
      }, TIMEOUT);
    }
    return fetch(url, opts).then(
      function (r) {
        if (timer) clearTimeout(timer);
        return r.text().then(function (txt) {
          var j = null;
          try {
            j = txt ? JSON.parse(txt) : null;
          } catch (e) {
            j = null;
          }
          if (!r.ok) {
            var msg = (j && (j.erro || j.message)) || "";
            if (r.status === 404) msg = "Nao encontrado na FIPE API.";
            else if (r.status === 429)
              msg =
                "Limite de consultas da FIPE API atingido. Aguarde alguns instantes e tente novamente.";
            else if (r.status >= 500)
              msg =
                "A FIPE API esta temporariamente indisponivel. Preencha os dados manualmente.";
            else if (!msg) msg = "FIPE API retornou erro " + r.status + ".";
            throw new Error(msg);
          }
          if (!j) throw new Error("Resposta invalida da FIPE API.");
          return j;
        });
      },
      function (e) {
        if (timer) clearTimeout(timer);
        if (e && e.name === "AbortError")
          throw new Error("Tempo esgotado ao consultar a FIPE API (20s).");
        throw new Error(
          "Nao foi possivel acessar a FIPE API (sem internet ou bloqueio de rede)."
        );
      }
    );
  }

  function fipeMarcas(tipo) {
    return getJson("/" + encodeURIComponent(tipo) + "/marcas");
  }
  function fipeModelos(tipo, codigoMarca) {
    return getJson(
      "/" + encodeURIComponent(tipo) + "/marcas/" + encodeURIComponent(codigoMarca) + "/modelos"
    ).then(function (j) {
      return (j && j.modelos) || [];
    });
  }
  function fipeAnos(tipo, codigoMarca, codigoModelo) {
    return getJson(
      "/" +
        encodeURIComponent(tipo) +
        "/marcas/" +
        encodeURIComponent(codigoMarca) +
        "/modelos/" +
        encodeURIComponent(codigoModelo) +
        "/anos"
    );
  }
  function fipeValor(tipo, codigoMarca, codigoModelo, codigoAno) {
    return getJson(
      "/" +
        encodeURIComponent(tipo) +
        "/marcas/" +
        encodeURIComponent(codigoMarca) +
        "/modelos/" +
        encodeURIComponent(codigoModelo) +
        "/anos/" +
        encodeURIComponent(codigoAno)
    );
  }

  var CAMPOS = [
    ["dtPlaca", "Placa", "text"],
    ["dtRenavam", "RENAVAM", "text"],
    ["dtChassi", "Chassi", "text"],
    ["dtMarca", "Marca / Modelo", "text"],
    ["dtAnoFab", "Ano Fabricação", "number"],
    ["dtAnoMod", "Ano Modelo", "number"],
    ["dtCor", "Cor", "text"],
    ["dtCombustivel", "Combustível", "text"],
    ["dtCategoria", "Categoria", "text"],
    ["dtEspecie", "Espécie / Tipo", "text"],
    ["dtMunicipio", "Município", "text"],
    ["dtUf", "UF", "text"],
    ["dtProprietario", "Proprietário", "select", [
      ["MVT LOCADORA DE VEÍCULOS LTDA", "MVT LOCADORA DE VEÍCULOS LTDA"],
      ["CARGOCENTER AGÊNCIA DE CARGAS LTDA", "CARGOCENTER AGÊNCIA DE CARGAS LTDA"],
    ]],
    ["dtLicVenc", "Venc. Licenciamento", "date"],
    ["dtIpva", "Situação IPVA", "select", [
      ["Pago", "Pago"],
      ["Pendente", "Pendente"],
      ["Atrasado", "Atrasado"],
    ]],
    ["dtRestricao", "Restrições", "text"],
    ["dtSituacao", "Situação do Veículo", "text"],
    ["dtObs", "Observações", "text"],
  ];

  /* ---------------- base de dados ---------------- */
  function local() {
    var s = null;
    try {
      s = JSON.parse(localStorage.getItem(STORAGE) || "[]");
    } catch (e) {
      s = null;
    }
    return Array.isArray(s) ? s : [];
  }

  function base() {
    if (typeof db === "undefined") window.db = {};
    if (!Array.isArray(db.detran) || db.detran.length === 0) {
      var salvos = local();
      if (!Array.isArray(db.detran)) db.detran = [];
      if (db.detran.length === 0 && salvos.length) db.detran = salvos;
    }
    return db.detran;
  }

  /* ---------------- nuvem (Firestore: frota/detran) ---------------- */
  function nuvem() {
    try {
      return typeof dbCloud !== "undefined" && dbCloud ? dbCloud : null;
    } catch (e) {
      return null;
    }
  }

  function chave(r) {
    return norm(r && r.dtPlaca) || "R" + norm(r && r.dtRenavam) || "";
  }

  function maisNovo(a, b) {
    var da = String((a && a.dtAtualizado) || "");
    var dbb = String((b && b.dtAtualizado) || "");
    return dbb > da ? b : a;
  }

  // Une registros locais e da nuvem sem perder nada (dedup por placa/renavam).
  function mesclar(a, b) {
    var mapa = {};
    var ordem = [];
    [a || [], b || []].forEach(function (lista) {
      lista.forEach(function (r) {
        if (!r) return;
        var k = chave(r);
        if (!k) {
          ordem.push(r);
          return;
        }
        if (mapa[k]) mapa[k] = maisNovo(mapa[k], r);
        else {
          mapa[k] = r;
          ordem.push(k);
        }
      });
    });
    return ordem.map(function (k) {
      return typeof k === "string" ? mapa[k] : k;
    });
  }

  function gravarLocal(lista) {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(lista));
    } catch (e) {}
  }

  var escutando = false;
  var salvamentoPendente = false;
  var detalhesAbertos = {};

  function escutarNuvem() {
    var cloud = nuvem();
    if (!cloud || escutando) return;
    escutando = true;
    try {
      cloud
        .collection("frota")
        .doc("detran")
        .onSnapshot(
          { includeMetadataChanges: true },
          function (doc) {
            var remoto = [];
            if (doc && doc.exists) {
              var payload = doc.data() || {};
              remoto = Array.isArray(payload.dados) ? payload.dados : [];
            }
            if (typeof db === "undefined") window.db = {};
            db.detran = mesclar(remoto, base());
            gravarLocal(db.detran);
            renderDetran();
            if (!(doc.metadata && doc.metadata.fromCache)) {
              window.fmModulosCarregados = window.fmModulosCarregados || {};
              window.fmModulosCarregados.detran = true;
              if (salvamentoPendente) persistir();
              else {
                // Limpa uma pendencia antiga que ja corresponde ao conteudo
                // confirmado pelo banco, evitando o indicador preso em 1.
                try { if (typeof fmFilaRemover === "function") fmFilaRemover(["detran"]); } catch (e) {}
              }
            }
          },
          function () {
            escutando = false;
          }
        );
    } catch (e) {
      escutando = false;
    }
  }

  function persistir() {
    var lista = base();
    gravarLocal(lista);
    var cloud = nuvem();
    if (cloud) {
      if (typeof window.fmModuloCarregado === "function" && !window.fmModuloCarregado("detran")) {
        salvamentoPendente = true;
        try { if (typeof fmFilaAdicionar === "function") fmFilaAdicionar(["detran"]); } catch (e) {}
        return;
      }
      salvamentoPendente = false;
      try {
        cloud
          .collection("frota")
          .doc("detran")
          .set({ dados: lista, atualizadoEm: new Date().toISOString() }, { merge: true })
          .then(function () {
            try { if (typeof fmFilaRemover === "function") fmFilaRemover(["detran"]); } catch (e) {}
            if (typeof statusNuvem === "function") statusNuvem("Salvo no banco de dados", "#198754");
          })
          .catch(function (err) {
            console.error("Erro ao gravar DETRAN no banco:", err);
            if (typeof statusNuvem === "function")
              statusNuvem("ERRO ao gravar DETRAN: " + ((err && err.code) || ""), "#dc3545");
          });
      } catch (e) {}
    } else if (typeof salvarNuvem === "function") {
      try {
        salvarNuvem();
      } catch (e) {}
    }
  }

  function norm(v) {
    return String(v || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
  }
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function d(v) {
    return v === undefined || v === null || v === "" ? "--" : esc(v);
  }
  function dataBR(v) {
    if (!v) return "--";
    var p = String(v).split("-");
    return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : esc(v);
  }
  function val(id) {
    var e = document.getElementById(id);
    return e ? e.value.trim() : "";
  }
  function set(id, v) {
    var e = document.getElementById(id);
    if (e) e.value = v == null ? "" : v;
  }

  /* ---------------- montagem da interface ---------------- */
  function montar() {
    var box = document.getElementById("veiculos");
    if (!box || document.getElementById("abaDetranPane")) return;

    var titulo = box.querySelector("h3");
    var conteudoOriginal = document.createElement("div");
    conteudoOriginal.id = "abaCadastroPane";

    var nodes = [];
    for (var i = 0; i < box.children.length; i++) {
      if (box.children[i] !== titulo) nodes.push(box.children[i]);
    }
    nodes.forEach(function (n) {
      conteudoOriginal.appendChild(n);
    });

    var nav = document.createElement("div");
    nav.className = "fm-tabs";
    nav.innerHTML =
      '<button type="button" class="fm-tab active" data-pane="abaCadastroPane">🚗 Cadastro de Veículos</button>' +
      '<button type="button" class="fm-tab" data-pane="abaDetranPane">🔎 Consulta DETRAN</button>';

    var pane = document.createElement("div");
    pane.id = "abaDetranPane";
    pane.style.display = "none";
    pane.innerHTML = htmlConsulta();

    box.appendChild(nav);
    box.appendChild(conteudoOriginal);
    box.appendChild(pane);

    nav.addEventListener("click", function (ev) {
      var b = ev.target.closest(".fm-tab");
      if (!b) return;
      nav.querySelectorAll(".fm-tab").forEach(function (x) {
        x.classList.remove("active");
      });
      b.classList.add("active");
      conteudoOriginal.style.display =
        b.dataset.pane === "abaCadastroPane" ? "" : "none";
      pane.style.display = b.dataset.pane === "abaDetranPane" ? "" : "none";
      if (b.dataset.pane === "abaDetranPane") renderDetran();
    });

    estilo();
    ligarEventos();
    renderDetran();
  }

  function campoHtml(c, larg) {
    var tipo = c[2] === "date" ? "date" : c[2];
    if (c[2] === "select") {
      return (
        '<div class="col-md-' +
        (larg || 3) +
        '"><label class="fm-lbl">' +
        c[1] +
        '</label><select id="' +
        c[0] +
        '" class="form-select"><option value="">Selecione...</option>' +
        (c[3] || [])
          .map(function (op) {
            return '<option value="' + esc(op[0]) + '">' + esc(op[1]) + "</option>";
          })
          .join("") +
        "</select></div>"
      );
    }
    return (
      '<div class="col-md-' +
      (larg || 3) +
      '"><label class="fm-lbl">' +
      c[1] +
      "</label>" +
      '<input id="' +
      c[0] +
      '" type="' +
      tipo +
      '" class="form-control" placeholder="' +
      c[1] +
      '"></div>'
    );
  }

  function htmlConsulta() {
    return (
      '<div class="glass-container">' +
      '<div class="titulo-filtro">🔎 Buscar veículo por Placa ou RENAVAM</div>' +
      '<div class="row g-2 align-items-end">' +
      '<div class="col-md-3"><label class="fm-lbl">Placa</label>' +
      '<input id="dtBuscaPlaca" class="form-control" placeholder="ABC1D23" maxlength="7"></div>' +
      '<div class="col-md-3"><label class="fm-lbl">RENAVAM</label>' +
      '<input id="dtBuscaRenavam" class="form-control" placeholder="00000000000" maxlength="11"></div>' +
      '<div class="col-md-6 d-flex gap-2">' +
      '<button class="btn btn-primary" id="dtBtnBuscar">Buscar</button>' +
      '<button class="btn btn-outline-secondary" id="dtBtnLimpar">Limpar</button>' +
      '<button class="btn btn-outline-secondary" id="dtBtnFipe">🚗 Consulta FIPE</button>' +
      "</div></div>" +
      '<div id="dtFipeBox" class="row g-2 mt-2 align-items-end" style="display:none">' +
      '<div class="col-12"><div class="fm-lbl" style="color:#64748b">Tabela FIPE gratuita via FIPE API (Deivid Fortuna) — selecione Tipo, Marca, Modelo e Ano para preencher marca/modelo, ano, combustível, código FIPE e valor. Demais campos são manuais.</div></div>' +
      '<div class="col-md-2"><label class="fm-lbl">Tipo</label>' +
      '<select id="fipeTipo" class="form-select">' +
      '<option value="caminhoes" selected>Caminhões</option>' +
      '<option value="carros">Carros</option>' +
      '<option value="motos">Motos</option>' +
      "</select></div>" +
      '<div class="col-md-3"><label class="fm-lbl">Marca</label>' +
      '<select id="fipeMarca" class="form-select"><option value="">Carregando...</option></select></div>' +
      '<div class="col-md-4"><label class="fm-lbl">Modelo</label>' +
      '<select id="fipeModelo" class="form-select"><option value="">Selecione a marca...</option></select></div>' +
      '<div class="col-md-3 d-flex gap-2">' +
      '<button class="btn btn-outline-secondary w-100" id="fipeBtnUsar">Usar marca/modelo</button></div>' +
      '<div class="col-md-4"><label class="fm-lbl">Ano / combustível</label>' +
      '<select id="fipeAno" class="form-select"><option value="">Selecione o modelo...</option></select></div>' +
      '<div class="col-md-3"><label class="fm-lbl">Código FIPE</label>' +
      '<input id="fipeCodigo" class="form-control" placeholder="021004-0" readonly></div>' +
      '<div class="col-md-3"><label class="fm-lbl">Valor FIPE</label>' +
      '<input id="fipeValor" class="form-control" placeholder="R$ --" readonly></div>' +
      '<div class="col-md-2"><label class="fm-lbl">&nbsp;</label>' +
      '<button class="btn btn-primary w-100" id="fipeBtnPreco">Aplicar FIPE</button></div>' +
      "</div>" +
      '<div id="dtStatus" class="fm-status"></div>' +
      "</div>" +

      '<div class="glass-container">' +
      '<input type="hidden" id="dt_idx">' +
      '<div class="titulo-filtro">📄 Dados do veículo (DETRAN)</div>' +
      '<div class="row g-2">' +
      CAMPOS.map(function (c) {
        return campoHtml(c, c[0] === "dtObs" || c[0] === "dtMarca" ? 6 : 3);
      }).join("") +
      '<div class="col-12 text-end mt-3">' +
      '<button class="btn btn-outline-secondary" id="dtBtnCancelar">Cancelar</button> ' +
      '<button class="btn btn-primary" id="dtBtnSalvar">Salvar consulta</button>' +
      "</div></div></div>" +
      '<div class="glass-container">' +
      '<div class="d-flex justify-content-end flex-wrap gap-2 mb-3">' +
      '<button class="btn btn-outline-secondary" id="dtBtnCsv">⬇️ Download CSV</button>' +
      '<button class="btn-excel" id="dtBtnExcel">📥 Exportar Excel</button>' +
      '<button class="btn btn-outline-secondary" id="dtBtnPdf">🧾 Relatório PDF</button>' +
      '<button class="btn btn-outline-secondary" id="dtBtnImprimir">🖨️ Imprimir</button>' +
      "</div>" +
      '<div class="filtros-avancados">' +
      '<div class="titulo-filtro">🔍 Filtros</div>' +
      '<div class="row g-2">' +
      '<div class="col-md-2"><input id="fdPlaca" class="form-control" placeholder="Placa"></div>' +
      '<div class="col-md-2"><input id="fdRenavam" class="form-control" placeholder="RENAVAM"></div>' +
      '<div class="col-md-2"><input id="fdChassi" class="form-control" placeholder="Chassi"></div>' +
      '<div class="col-md-2"><input id="fdMarca" class="form-control" placeholder="Marca/Modelo"></div>' +
      '<div class="col-md-1"><input id="fdUf" class="form-control" placeholder="UF"></div>' +
      '<div class="col-md-3"><input id="fdSituacao" class="form-control" placeholder="Situação"></div>' +
      '<div class="col-md-2"><input id="fdAnoMin" type="number" class="form-control" placeholder="Ano mín"></div>' +
      '<div class="col-md-2"><input id="fdAnoMax" type="number" class="form-control" placeholder="Ano máx"></div>' +
      '<div class="col-md-3 d-flex gap-2">' +
      '<button class="btn btn-primary w-100" id="dtBtnFiltrar">Filtrar</button>' +
      '<button class="btn btn-outline-secondary w-100" id="dtBtnLimparFiltro">Limpar</button>' +
      "</div>" +
      '<div class="col-12 cont-filtro" id="dtContFiltro"></div>' +
      "</div></div>" +
      '<div class="table-responsive"><table class="table align-middle"><thead><tr>' +
      "<th>Placa</th><th>RENAVAM</th><th>Chassi</th><th>Marca/Modelo</th><th>Ano</th>" +
      "<th>Cor</th><th>UF</th><th>Licenciamento</th><th>Situação</th><th>Ações</th>" +
      '</tr></thead><tbody id="listaDetran"></tbody></table></div>' +
      '<div id="paginacaoDetran" class="paginacao-global"></div>' +
      "</div>"
    );
  }

  function estilo() {
    if (document.getElementById("fmDetranCss")) return;
    var s = document.createElement("style");
    s.id = "fmDetranCss";
    s.textContent =
      ".fm-tabs{display:flex;gap:8px;margin:6px 0 16px;flex-wrap:wrap}" +
      ".fm-tab{border:1px solid #e2e8f0;background:#fff;color:#475569;font-weight:700;" +
      "font-size:.82rem;padding:9px 18px;border-radius:10px;cursor:pointer;transition:.18s}" +
      ".fm-tab:hover{border-color:#93c5fd;color:#1d4ed8}" +
      ".fm-tab.active{background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:#fff;border-color:transparent;" +
      "box-shadow:0 6px 16px rgba(37,99,235,.32)}" +
      ".fm-lbl{font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#64748b;margin-bottom:3px;display:block}" +
      ".fm-status{margin-top:12px;font-size:.8rem;font-weight:600;min-height:20px}" +
      ".fm-ok{color:#10b981}.fm-warn{color:#f59e0b}.fm-err{color:#ef4444}" +
      ".fm-pg{display:flex;gap:6px;justify-content:center;align-items:center;margin-top:14px;flex-wrap:wrap}" +
      ".fm-pg button{border:1px solid #e2e8f0;background:#fff;border-radius:8px;padding:5px 11px;font-size:.78rem;font-weight:700;color:#475569;cursor:pointer}" +
      ".fm-pg button[disabled]{opacity:.4;cursor:default}" +
      ".fm-pg .fm-info{font-size:.75rem;color:#64748b;font-weight:600}" +
      ".fm-det{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px}" +
      ".fm-det-tit{font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#1d4ed8;margin-bottom:8px}" +
      ".fm-det-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px 16px}" +
      ".fm-det-item{display:flex;flex-direction:column;border-bottom:1px dashed #e2e8f0;padding-bottom:4px}" +
      ".fm-det-k{font-size:.64rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#64748b}" +
      ".fm-det-v{font-size:.83rem;font-weight:600;color:#0f172a;word-break:break-word}" +
      "@media print{body *{visibility:hidden}#fmPrint,#fmPrint *{visibility:visible}" +
      "#fmPrint{position:absolute;left:0;top:0;width:100%}}";
    document.head.appendChild(s);
  }

  /* ---------------- busca ---------------- */
  function buscar() {
    var placa = norm(val("dtBuscaPlaca"));
    var renavam = norm(val("dtBuscaRenavam"));
    var st = document.getElementById("dtStatus");

    if (!placa && !renavam) {
      st.className = "fm-status fm-err";
      st.textContent = "Informe a placa ou o RENAVAM para buscar.";
      return;
    }

    var lista = base();
    var idx = -1;
    for (var i = 0; i < lista.length; i++) {
      var r = lista[i];
      if (
        (placa && norm(r.dtPlaca) === placa) ||
        (renavam && norm(r.dtRenavam) === renavam)
      ) {
        idx = i;
        break;
      }
    }

    if (idx >= 0) {
      preencher(lista[idx]);
      editIdx = idx;
      set("dt_idx", idx);
      st.className = "fm-status fm-ok";
      st.textContent =
        "✔ Veículo encontrado na base DETRAN. Dados preenchidos automaticamente.";
      return;
    }

    // procura no cadastro de veículos da frota
    var vei =
      (typeof db !== "undefined" && db.veiculos ? db.veiculos : []).find(
        function (v) {
          return placa && norm(v.vplaca) === placa;
        }
      ) || null;

    limparForm();
    editIdx = -1;
    set("dt_idx", "");
    set("dtPlaca", normPlaca(val("dtBuscaPlaca")));
    set("dtRenavam", normRenavam(val("dtBuscaRenavam")));

    if (vei) {
      set("dtMarca", vei.vmodelo || "");
      set("dtSituacao", vei.vstatus || "");
    }

    st.className = "fm-status fm-warn";
    st.textContent = vei
      ? "⚠ Nenhuma consulta salva. Dados básicos vieram do cadastro da frota — complete manualmente ou use a Consulta FIPE."
      : "⚠ Nenhuma consulta salva para este veículo. Preencha os dados manualmente ou use a Consulta FIPE. A FIPE API não fornece dados do DETRAN por placa.";
  }

  function preencher(r) {
    CAMPOS.forEach(function (c) {
      set(c[0], r[c[0]] || "");
    });
  }

  function limparForm() {
    CAMPOS.forEach(function (c) {
      set(c[0], "");
    });
    set("dt_idx", "");
    editIdx = -1;
  }

  /* ---------------- salvar / editar / excluir ---------------- */
  function salvarDetran() {
    var st = document.getElementById("dtStatus");
    var placa = val("dtPlaca");
    var renavam = val("dtRenavam");

    if (!placa && !renavam) {
      st.className = "fm-status fm-err";
      st.textContent = "Informe pelo menos a Placa ou o RENAVAM.";
      return;
    }

    var obj = { dtAtualizado: new Date().toISOString().slice(0, 10) };
    CAMPOS.forEach(function (c) {
      obj[c[0]] = val(c[0]);
    });
    obj.dtPlaca = obj.dtPlaca.toUpperCase();

    var lista = base();
    var idx = document.getElementById("dt_idx").value;
    if (typeof window.fmPrepararRegistro === "function") {
      window.fmPrepararRegistro("detran", obj, idx !== "" ? lista[Number(idx)] : null);
    }

    function manterFipe(antigo, novo) {
      if (!antigo) return novo;
      ["dtFipeCodigo", "dtFipeValor", "dtFipeRef", "dtFipeAtualizado", "dtFipeMarca", "dtFipeModelo"].forEach(
        function (k) {
          if (antigo[k] && !novo[k]) novo[k] = antigo[k];
        }
      );
      return novo;
    }

    if (idx !== "" && lista[Number(idx)]) {
      lista[Number(idx)] = manterFipe(lista[Number(idx)], obj);
    } else {
      var dup = lista.findIndex(function (r) {
        return (
          (obj.dtPlaca && norm(r.dtPlaca) === norm(obj.dtPlaca)) ||
          (obj.dtRenavam && norm(r.dtRenavam) === norm(obj.dtRenavam))
        );
      });
      if (dup >= 0) lista[dup] = manterFipe(lista[dup], obj);
      else lista.push(obj);
    }

    persistir();
    limparForm();
    st.className = "fm-status fm-ok";
    st.textContent = "✔ Consulta salva com sucesso.";
    renderDetran();
  }

  window.editarDetran = function (i) {
    var r = base()[i];
    if (!r) return;
    preencher(r);
    set("dt_idx", i);
    editIdx = i;
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  window.excluirDetran = function (i) {
    if (!confirm("Excluir esta consulta DETRAN?")) return;
    base().splice(i, 1);
    persistir();
    renderDetran();
  };

  /* ---------------- filtros ---------------- */
  function filtrados() {
    var f = {
      placa: norm(val("fdPlaca")),
      renavam: norm(val("fdRenavam")),
      chassi: norm(val("fdChassi")),
      marca: val("fdMarca").toUpperCase(),
      uf: val("fdUf").toUpperCase(),
      sit: val("fdSituacao").toUpperCase(),
      min: Number(val("fdAnoMin")) || 0,
      max: Number(val("fdAnoMax")) || 0,
    };

    return base()
      .map(function (x, i) {
        return { x: x, i: i };
      })
      .filter(function (o) {
        var x = o.x;
        if (f.placa && norm(x.dtPlaca).indexOf(f.placa) < 0) return false;
        if (f.renavam && norm(x.dtRenavam).indexOf(f.renavam) < 0) return false;
        if (f.chassi && norm(x.dtChassi).indexOf(f.chassi) < 0) return false;
        if (
          f.marca &&
          String(x.dtMarca || "").toUpperCase().indexOf(f.marca) < 0
        )
          return false;
        if (f.uf && String(x.dtUf || "").toUpperCase().indexOf(f.uf) < 0)
          return false;
        if (
          f.sit &&
          String(x.dtSituacao || "").toUpperCase().indexOf(f.sit) < 0
        )
          return false;
        var ano = Number(x.dtAnoMod || x.dtAnoFab || 0);
        if (f.min && ano < f.min) return false;
        if (f.max && ano > f.max) return false;
        return true;
      });
  }

  /* ---------------- detalhes (todos os dados salvos) ---------------- */
  function detalheHtml(x, idx) {
    var itens = CAMPOS.map(function (c) {
      var v = c[2] === "date" ? dataBR(x[c[0]]) : d(x[c[0]]);
      return (
        '<div class="fm-det-item"><span class="fm-det-k">' +
        esc(c[1]) +
        '</span><span class="fm-det-v">' +
        v +
        "</span></div>"
      );
    }).join("");
    itens +=
      '<div class="fm-det-item"><span class="fm-det-k">Código FIPE</span>' +
      '<span class="fm-det-v">' + d(x.dtFipeCodigo) + "</span></div>" +
      '<div class="fm-det-item"><span class="fm-det-k">Valor FIPE</span>' +
      '<span class="fm-det-v">' + d(x.dtFipeValor) + "</span></div>" +
      '<div class="fm-det-item"><span class="fm-det-k">Referência FIPE</span>' +
      '<span class="fm-det-v">' + d(x.dtFipeRef) + "</span></div>" +
      '<div class="fm-det-item"><span class="fm-det-k">FIPE atualizada em</span>' +
      '<span class="fm-det-v">' + dataBR(x.dtFipeAtualizado) + "</span></div>";
    itens +=
      '<div class="fm-det-item"><span class="fm-det-k">Atualizado em</span>' +
      '<span class="fm-det-v">' +
      dataBR(x.dtAtualizado) +
      "</span></div>";
    return (
      '<div class="fm-det"><div class="fm-det-tit">📋 Dados completos salvos</div>' +
      '<div class="mb-2 d-flex align-items-center gap-2 flex-wrap">' +
      '<button type="button" class="btn btn-sm btn-primary" id="fipeUpBtn' + idx + '" onclick="atualizarFipeDetran(' + idx + ')">🔄 Atualizar FIPE</button>' +
      '<span id="fipeUpMsg' + idx + '" style="font-size:.8rem;color:#64748b"></span>' +
      "</div>" +
      '<div class="fm-det-grid">' + itens + "</div></div>"
    );
  }


  window.verDetran = function (i) {
    var tr = document.getElementById("fmDet" + i);
    if (!tr) return;
    var visivel = tr.style.display !== "none";
    detalhesAbertos[i] = !visivel;
    tr.style.display = visivel ? "none" : "";
    tr.setAttribute("aria-hidden", visivel ? "true" : "false");
    var btn = document.querySelector('[data-ver-detran="' + i + '"]');
    if (btn) {
      btn.textContent = visivel ? "👁️" : "🙈";
      btn.title = visivel ? "Ver todos os dados salvos" : "Ocultar dados salvos";
      btn.setAttribute("aria-expanded", visivel ? "false" : "true");
    }
  };

  /* ---------------- render + paginação ---------------- */
  function renderDetran() {
    var tbody = document.getElementById("listaDetran");
    if (!tbody) return;

    var lista = filtrados();
    var total = lista.length;
    var totalPag = Math.max(1, Math.ceil(total / PAG.porPagina));
    if (PAG.pagina > totalPag) PAG.pagina = totalPag;
    if (PAG.pagina < 1) PAG.pagina = 1;

    var ini = (PAG.pagina - 1) * PAG.porPagina;
    var pagina = lista.slice(ini, ini + PAG.porPagina);

    tbody.innerHTML = pagina.length
      ? pagina
          .map(function (o) {
            var x = o.x;
            return (
              "<tr><td><b>" +
              d(x.dtPlaca) +
              "</b></td><td>" +
              d(x.dtRenavam) +
              "</td><td>" +
              d(x.dtChassi) +
              "</td><td>" +
              d(x.dtMarca) +
              "</td><td>" +
              d(
                x.dtAnoFab && x.dtAnoMod
                  ? x.dtAnoFab + "/" + x.dtAnoMod
                  : x.dtAnoMod || x.dtAnoFab
              ) +
              "</td><td>" +
              d(x.dtCor) +
              "</td><td>" +
              d(x.dtUf) +
              "</td><td>" +
              dataBR(x.dtLicVenc) +
              "</td><td>" +
              d(x.dtSituacao) +
              '</td><td class="text-nowrap">' +
               '<button type="button" class="btn btn-sm btn-outline-secondary me-1" data-ver-detran="' + o.i + '" aria-expanded="' + (detalhesAbertos[o.i] ? "true" : "false") + '" onclick="verDetran(' +
              o.i +
               ')" title="' + (detalhesAbertos[o.i] ? "Ocultar dados salvos" : "Ver todos os dados salvos") + '">' + (detalhesAbertos[o.i] ? "🙈" : "👁️") + '</button>' +
              '<button class="btn btn-sm btn-outline-primary me-1" onclick="editarDetran(' +
              o.i +
              ')">✏️</button>' +
              '<button class="btn btn-sm btn-outline-danger" onclick="excluirDetran(' +
              o.i +
              ')">🗑️</button>' +
              "</td></tr>" +
               '<tr class="fm-det-row" id="fmDet' + o.i + '" style="display:' + (detalhesAbertos[o.i] ? "" : "none") + '" aria-hidden="' + (detalhesAbertos[o.i] ? "false" : "true") + '">' +
              '<td colspan="10">' + detalheHtml(x, o.i) + "</td></tr>"
            );
          })
          .join("")
      : '<tr><td colspan="10" class="text-center text-muted py-4">Nenhuma consulta registrada.</td></tr>';


    var cont = document.getElementById("dtContFiltro");
    if (cont)
      cont.innerHTML =
        "<b>" + total + "</b> registro(s) encontrado(s).";

    document.getElementById("paginacaoDetran").innerHTML =
      '<div class="fm-pg">' +
      '<button ' + (PAG.pagina === 1 ? "disabled" : "") + ' onclick="pagDetran(1)">« Primeira</button>' +
      '<button ' + (PAG.pagina === 1 ? "disabled" : "") + ' onclick="pagDetran(' + (PAG.pagina - 1) + ')">‹ Anterior</button>' +
      '<span class="fm-info">Página ' + PAG.pagina + " de " + totalPag + "</span>" +
      '<button ' + (PAG.pagina === totalPag ? "disabled" : "") + ' onclick="pagDetran(' + (PAG.pagina + 1) + ')">Próxima ›</button>' +
      '<button ' + (PAG.pagina === totalPag ? "disabled" : "") + ' onclick="pagDetran(' + totalPag + ')">Última »</button>' +
      "</div>";
  }

  window.pagDetran = function (p) {
    PAG.pagina = p;
    renderDetran();
  };

  /* ---------------- exportações ---------------- */
  function dadosExport() {
    return filtrados().map(function (o) {
      var x = o.x;
      var r = {};
      CAMPOS.forEach(function (c) {
        r[c[1]] = x[c[0]] || "";
      });
      return r;
    });
  }

  function exportarExcelDetran() {
    var dados = dadosExport();
    if (!dados.length) return alert("Nada para exportar.");
    if (typeof XLSX === "undefined") return baixarCsv();
    var ws = XLSX.utils.json_to_sheet(dados);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "DETRAN");
    XLSX.writeFile(wb, "consulta-detran.xlsx");
  }

  function baixarCsv() {
    var dados = dadosExport();
    if (!dados.length) return alert("Nada para exportar.");
    var cab = Object.keys(dados[0]);
    var linhas = [cab.join(";")].concat(
      dados.map(function (r) {
        return cab
          .map(function (k) {
            return '"' + String(r[k]).replace(/"/g, '""') + '"';
          })
          .join(";");
      })
    );
    var blob = new Blob(["\ufeff" + linhas.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "consulta-detran.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function relatorioHtml() {
    var lista = filtrados();
    var hoje = new Date().toLocaleString("pt-BR");
    return (
      "<html><head><meta charset='utf-8'><title>Relatório DETRAN</title><style>" +
      "body{font-family:Inter,Arial,sans-serif;padding:26px;color:#0f172a}" +
      "h1{font-size:19px;margin:0 0 3px}.sub{color:#64748b;font-size:12px;margin-bottom:16px}" +
      "table{width:100%;border-collapse:collapse;font-size:10.5px}" +
      "th{background:#0f172a;color:#fff;text-align:left;padding:6px 7px}" +
      "td{border-bottom:1px solid #e2e8f0;padding:5px 7px}" +
      "tr:nth-child(even) td{background:#f8fafc}" +
      ".ft{margin-top:14px;font-size:10px;color:#94a3b8}" +
      "</style></head><body id='fmPrint'>" +
      "<h1>Relatório de Consultas DETRAN</h1>" +
      "<div class='sub'>Frota Master &nbsp;•&nbsp; Emitido em " +
      hoje +
      " &nbsp;•&nbsp; " +
      lista.length +
      " registro(s)</div>" +
      "<table><thead><tr>" +
      "<th>Placa</th><th>RENAVAM</th><th>Chassi</th><th>Marca/Modelo</th><th>Ano</th>" +
      "<th>Cor</th><th>Comb.</th><th>Município/UF</th><th>Proprietário</th>" +
      "<th>Licenc.</th><th>Restrições</th><th>Situação</th></tr></thead><tbody>" +
      lista
        .map(function (o) {
          var x = o.x;
          return (
            "<tr><td><b>" +
            d(x.dtPlaca) +
            "</b></td><td>" +
            d(x.dtRenavam) +
            "</td><td>" +
            d(x.dtChassi) +
            "</td><td>" +
            d(x.dtMarca) +
            "</td><td>" +
            d(
              x.dtAnoFab && x.dtAnoMod
                ? x.dtAnoFab + "/" + x.dtAnoMod
                : x.dtAnoMod || x.dtAnoFab
            ) +
            "</td><td>" +
            d(x.dtCor) +
            "</td><td>" +
            d(x.dtCombustivel) +
            "</td><td>" +
            d(x.dtMunicipio) +
            (x.dtUf ? "/" + esc(x.dtUf) : "") +
            "</td><td>" +
            d(x.dtProprietario) +
            "</td><td>" +
            dataBR(x.dtLicVenc) +
            "</td><td>" +
            d(x.dtRestricao) +
            "</td><td>" +
            d(x.dtSituacao) +
            "</td></tr>"
          );
        })
        .join("") +
      "</tbody></table>" +
      "<div class='ft'>Documento gerado automaticamente pelo Frota Master.</div>" +
      "</body></html>"
    );
  }

  function abrirRelatorio(auto) {
    if (!filtrados().length) return alert("Nenhum registro para o relatório.");
    var w = window.open("", "_blank");
    if (!w) return alert("Permita pop-ups para gerar o relatório.");
    w.document.write(relatorioHtml());
    w.document.close();
    w.focus();
    setTimeout(function () {
      w.print();
    }, auto ? 400 : 400);
  }

  /* ---------------- eventos ---------------- */
  function ligarEventos() {
    var on = function (id, fn) {
      var e = document.getElementById(id);
      if (e) e.addEventListener("click", fn);
    };

    on("dtBtnBuscar", buscar);
    on("dtBtnLimpar", function () {
      set("dtBuscaPlaca", "");
      set("dtBuscaRenavam", "");
      limparForm();
      var st = document.getElementById("dtStatus");
      st.className = "fm-status";
      st.textContent = "";
    });
    on("dtBtnSalvar", salvarDetran);
    on("dtBtnFipe", function () {
      var box = document.getElementById("dtFipeBox");
      if (!box) return;
      var abrir = box.style.display === "none";
      box.style.display = abrir ? "" : "none";
      if (abrir && !FIPE.marcas.length) carregarMarcas();
    });

    var onCh = function (id, fn) {
      var e = document.getElementById(id);
      if (e) e.addEventListener("change", fn);
    };
    onCh("fipeTipo", carregarMarcas);
    onCh("fipeMarca", carregarModelos);
    onCh("fipeModelo", carregarAnos);
    onCh("fipeAno", buscarPrecoFipe);
    on("fipeBtnUsar", usarMarcaModelo);
    on("fipeBtnPreco", aplicarAnoFipe);

    on("dtBtnCancelar", limparForm);
    on("dtBtnExcel", exportarExcelDetran);
    on("dtBtnCsv", baixarCsv);
    on("dtBtnPdf", function () {
      abrirRelatorio(true);
    });
    on("dtBtnImprimir", function () {
      abrirRelatorio(false);
    });
    on("dtBtnFiltrar", function () {
      PAG.pagina = 1;
      renderDetran();
    });
    on("dtBtnLimparFiltro", function () {
      [
        "fdPlaca",
        "fdRenavam",
        "fdChassi",
        "fdMarca",
        "fdUf",
        "fdSituacao",
        "fdAnoMin",
        "fdAnoMax",
      ].forEach(function (i) {
        set(i, "");
      });
      PAG.pagina = 1;
      renderDetran();
    });

    var iPlaca = document.getElementById("dtBuscaPlaca");
    if (iPlaca)
      iPlaca.addEventListener("input", function () {
        this.value = normPlaca(this.value);
      });
    var iRen = document.getElementById("dtBuscaRenavam");
    if (iRen)
      iRen.addEventListener("input", function () {
        this.value = normRenavam(this.value);
      });

    ["dtBuscaPlaca", "dtBuscaRenavam"].forEach(function (id) {
      var e = document.getElementById(id);
      if (e)
        e.addEventListener("keydown", function (ev) {
          if (ev.key === "Enter") buscar();
        });
    });
  }

  /* ---------------- consulta FIPE (Deivid Fortuna) ---------------- */
  function statusMsg(classe, texto) {
    var st = document.getElementById("dtStatus");
    if (!st) return;
    st.className = "fm-status" + (classe ? " " + classe : "");
    st.textContent = texto;
  }

  function opts(sel, itens, vazio) {
    var e = document.getElementById(sel);
    if (!e) return;
    e.innerHTML =
      '<option value="">' +
      vazio +
      "</option>" +
      itens
        .map(function (i) {
          return '<option value="' + i.v + '">' + i.t + "</option>";
        })
        .join("");
  }

  function limparResultadoFipe() {
    FIPE.atual = null;
    set("fipeCodigo", "");
    set("fipeValor", "");
  }

  function carregarMarcas() {
    var tipo = val("fipeTipo") || "carros";
    FIPE.marcas = [];
    FIPE.modelos = [];
    FIPE.anos = [];
    limparResultadoFipe();
    opts("fipeMarca", [], "Carregando...");
    opts("fipeModelo", [], "Selecione a marca...");
    opts("fipeAno", [], "Selecione o modelo...");
    fipeMarcas(tipo)
      .then(function (lista) {
        FIPE.marcas = lista || [];
        opts(
          "fipeMarca",
          FIPE.marcas.map(function (m) {
            return { v: m.codigo, t: m.nome };
          }),
          "Selecione..."
        );
        statusMsg("fm-ok", "✔ " + FIPE.marcas.length + " marcas carregadas da FIPE API.");
      })
      .catch(function (e) {
        opts("fipeMarca", [], "Indisponível");
        statusMsg("fm-err", "✖ " + e.message);
      });
  }

  function carregarModelos() {
    var tipo = val("fipeTipo") || "carros";
    var cod = val("fipeMarca");
    var m = FIPE.marcas.filter(function (x) {
      return String(x.codigo) === String(cod);
    })[0];
    FIPE.marcaNome = m ? m.nome : "";
    FIPE.modelos = [];
    FIPE.anos = [];
    FIPE.modeloNome = "";
    limparResultadoFipe();
    opts("fipeAno", [], "Selecione o modelo...");
    if (!cod) {
      opts("fipeModelo", [], "Selecione a marca...");
      return;
    }
    opts("fipeModelo", [], "Carregando...");
    fipeModelos(tipo, cod)
      .then(function (lista) {
        FIPE.modelos = lista || [];
        opts(
          "fipeModelo",
          FIPE.modelos.map(function (x) {
            return { v: x.codigo, t: x.nome };
          }),
          "Selecione..."
        );
        statusMsg("fm-ok", "✔ " + FIPE.modelos.length + " modelos carregados.");
      })
      .catch(function (e) {
        opts("fipeModelo", [], "Indisponível");
        statusMsg("fm-err", "✖ " + e.message);
      });
  }

  function carregarAnos() {
    var tipo = val("fipeTipo") || "carros";
    var marca = val("fipeMarca");
    var modelo = val("fipeModelo");
    var mm = FIPE.modelos.filter(function (x) {
      return String(x.codigo) === String(modelo);
    })[0];
    FIPE.modeloNome = mm ? mm.nome : "";
    FIPE.anos = [];
    limparResultadoFipe();
    if (!marca || !modelo) {
      opts("fipeAno", [], "Selecione o modelo...");
      return;
    }
    opts("fipeAno", [], "Carregando...");
    fipeAnos(tipo, marca, modelo)
      .then(function (lista) {
        FIPE.anos = lista || [];
        opts(
          "fipeAno",
          FIPE.anos.map(function (a) {
            return { v: a.codigo, t: a.nome };
          }),
          "Selecione o ano..."
        );
        statusMsg("fm-ok", "✔ " + FIPE.anos.length + " anos disponíveis para este modelo.");
      })
      .catch(function (e) {
        opts("fipeAno", [], "Indisponível");
        statusMsg("fm-err", "✖ " + e.message);
      });
  }

  function usarMarcaModelo() {
    var modelo = FIPE.modeloNome || "";
    if (!FIPE.marcaNome && !modelo) {
      statusMsg("fm-err", "Selecione a marca e o modelo.");
      return;
    }
    set("dtMarca", [FIPE.marcaNome, modelo].filter(Boolean).join(" / "));
    var tipo = val("fipeTipo");
    if (!val("dtCategoria"))
      set(
        "dtCategoria",
        tipo === "motos" ? "Motocicleta" : tipo === "caminhoes" ? "Caminhão" : "Automóvel"
      );
    statusMsg("fm-ok", "✔ Marca/modelo preenchidos. Complete os demais campos e salve.");
  }

  function buscarPrecoFipe() {
    var tipo = val("fipeTipo") || "carros";
    var marca = val("fipeMarca");
    var modelo = val("fipeModelo");
    var ano = val("fipeAno");
    limparResultadoFipe();
    if (!marca || !modelo || !ano) return;
    var btn = document.getElementById("fipeBtnPreco");
    if (btn) btn.disabled = true;
    statusMsg("fm-warn", "⏳ Consultando tabela FIPE...");
    fipeValor(tipo, marca, modelo, ano)
      .then(function (p) {
        FIPE.atual = p || null;
        if (!FIPE.atual) {
          statusMsg("fm-warn", "⚠ Nenhum resultado para esta seleção.");
          return;
        }
        set("fipeCodigo", normFipe(p.CodigoFipe || ""));
        set("fipeValor", p.Valor || "");
        statusMsg(
          "fm-ok",
          "✔ " +
            [p.Marca, p.Modelo].filter(Boolean).join(" / ") +
            " " +
            (p.AnoModelo || "") +
            " — " +
            (p.Valor || "") +
            (p.MesReferencia ? " (ref. " + String(p.MesReferencia).trim() + ")" : "") +
            ". Clique em “Aplicar FIPE” para preencher o formulário."
        );
      })
      .catch(function (e) {
        statusMsg("fm-err", "✖ " + e.message);
      })
      .then(function () {
        if (btn) btn.disabled = false;
      });
  }

  function aplicarAnoFipe() {
    var p = FIPE.atual;
    if (!p) {
      statusMsg("fm-err", "Selecione Tipo, Marca, Modelo e Ano antes de aplicar.");
      return;
    }

    if (p.Marca || p.Modelo) set("dtMarca", [p.Marca, p.Modelo].filter(Boolean).join(" / "));
    if (p.AnoModelo) set("dtAnoMod", soAno(p.AnoModelo));
    if (p.Combustivel) set("dtCombustivel", p.Combustivel);
    var tipo = val("fipeTipo");
    if (!val("dtCategoria"))
      set(
        "dtCategoria",
        tipo === "motos" ? "Motocicleta" : tipo === "caminhoes" ? "Caminhão" : "Automóvel"
      );

    var obs = val("dtObs");
    var linha =
      "FIPE " +
      (normFipe(p.CodigoFipe || "") || val("fipeCodigo")) +
      ": " +
      (p.Valor || "") +
      (p.MesReferencia ? " — ref. " + String(p.MesReferencia).trim() : "");
    set("dtObs", obs ? obs + " | " + linha : linha);

    statusMsg("fm-ok", "✔ Dados da FIPE aplicados. Confira e clique em Salvar consulta.");
  }

  /* ---------------- atualizacao automatica da FIPE (por registro) ---------------- */
  function txtNorm(v) {
    return String(v || "")
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function pontuar(alvo, candidato) {
    var a = txtNorm(alvo).split(" ").filter(Boolean);
    var b = txtNorm(candidato);
    var bt = b.split(" ").filter(Boolean);
    if (!a.length || !bt.length) return 0;
    var acertos = 0;
    var totalAlvo = 0;
    a.forEach(function (t) {
      totalAlvo += t.length;
      var achou = bt.some(function (o) {
        return o === t || (t.length >= 4 && o.indexOf(t) === 0) || (o.length >= 4 && t.indexOf(o) === 0);
      });
      if (achou) acertos += t.length;
    });
    if (!acertos) return 0;
    // proporcao do alvo encontrada, com leve penalidade para candidatos muito maiores
    var cobertura = acertos / totalAlvo;
    var excesso = Math.max(0, bt.length - a.length) * 0.05;
    return Math.max(0, cobertura - excesso);
  }

  function melhor(lista, campoNome, alvo, minimo) {
    var top = null;
    var topPontos = 0;
    var empate = false;
    (lista || []).forEach(function (item) {
      var p = pontuar(alvo, item[campoNome]);
      if (p > topPontos) {
        topPontos = p;
        top = item;
        empate = false;
      } else if (p > 0 && p === topPontos) {
        empate = true;
      }
    });
    if (topPontos < (minimo || 0.6)) return null;
    // se houver empate exato entre candidatos diferentes, nao adivinha
    if (empate && topPontos < 1) return null;
    return top;
  }

  function tipoDoRegistro(x) {
    var t = txtNorm([x.dtCategoria, x.dtEspecie, x.dtMarca].join(" "));
    if (/MOTO|CICLOMOTOR|TRICICLO/.test(t)) return "motos";
    if (/CAMINHAO|CAMINHONETE TRATOR|TRATOR|ONIBUS|MICRO ONIBUS|CARGA|REBOQUE|CAVALO/.test(t))
      return "caminhoes";
    return "carros";
  }

  function partesMarcaModelo(x) {
    var txt = String(x.dtMarca || "").trim();
    var sep = txt.indexOf("/") >= 0 ? "/" : " ";
    var p = txt.split(sep);
    var marca = (p.shift() || "").trim();
    var modelo = p.join(sep === "/" ? "/" : " ").trim();
    return { marca: marca, modelo: modelo || txt };
  }

  function buscarFipeAuto(x) {
    var tipos = [tipoDoRegistro(x)];
    ["carros", "caminhoes", "motos"].forEach(function (t) {
      if (tipos.indexOf(t) < 0) tipos.push(t);
    });
    var mm = partesMarcaModelo(x);
    if (!mm.marca) return Promise.reject(new Error("Registro sem marca/modelo para consultar."));
    if (!mm.modelo || txtNorm(mm.modelo) === txtNorm(mm.marca))
      return Promise.reject(
        new Error("Modelo do veículo não informado — cadastre marca e modelo antes de atualizar a FIPE.")
      );
    var ano = soAno(x.dtAnoMod) || soAno(x.dtAnoFab);
    if (!ano)
      return Promise.reject(
        new Error("Ano do veículo não informado — sem o ano a FIPE traria valor de outro ano.")
      );

    function tentar(i) {
      if (i >= tipos.length)
        return Promise.reject(
          new Error("Não encontrei este veículo exato na tabela FIPE. Use a Consulta FIPE manual.")
        );
      var tipo = tipos[i];
      return fipeMarcas(tipo)
        .then(function (marcas) {
          var m = melhor(marcas, "nome", mm.marca, 0.8);
          if (!m) throw new Error("marca");
          return fipeModelos(tipo, m.codigo).then(function (modelos) {
            var mo = melhor(modelos, "nome", mm.modelo, 0.7);
            if (!mo) throw new Error("modelo");
            return fipeAnos(tipo, m.codigo, mo.codigo).then(function (anos) {
              var lista = anos || [];
              var comb = txtNorm(x.dtCombustivel);
              var doAno = lista.filter(function (a) {
                return soAno(a.nome) === ano;
              });
              if (!doAno.length) throw new Error("ano");
              var escolhido = null;
              if (comb)
                escolhido = doAno.filter(function (a) {
                  return txtNorm(a.nome).indexOf(comb.split(" ")[0]) >= 0;
                })[0];
              // sem combustivel informado e mais de uma opcao: nao adivinha
              if (!escolhido) {
                if (doAno.length > 1) throw new Error("combustivel");
                escolhido = doAno[0];
              }
              return fipeValor(tipo, m.codigo, mo.codigo, escolhido.codigo).then(function (p) {
                // confere se o retorno bate com o veiculo antes de aceitar
                if (p && soAno(p.AnoModelo) && soAno(p.AnoModelo) !== ano) throw new Error("ano");
                if (p && pontuar(mm.marca, p.Marca) < 0.8) throw new Error("marca");
                return p;
              });
            });
          });
        })
        .catch(function () {
          return tentar(i + 1);
        });
    }
    return tentar(0);
  }

  window.atualizarFipeDetran = function (i) {
    var lista = base();
    var x = lista[i];
    if (!x) return;
    detalhesAbertos[i] = true;
    var btn = document.getElementById("fipeUpBtn" + i);
    var msg = document.getElementById("fipeUpMsg" + i);
    function aviso(t, cor) {
      if (msg) {
        msg.textContent = t;
        msg.style.color = cor || "#64748b";
      }
    }
    if (btn) btn.disabled = true;
    aviso("⏳ Consultando a tabela FIPE...", "#b45309");

    buscarFipeAuto(x)
      .then(function (p) {
        if (!p) throw new Error("Sem resultado na FIPE.");
        // atualiza SOMENTE os campos da FIPE, preservando o cadastro existente
        x.dtFipeCodigo = normFipe(p.CodigoFipe || "");
        x.dtFipeValor = p.Valor || "";
        x.dtFipeRef = p.MesReferencia ? String(p.MesReferencia).trim() : "";
        x.dtFipeMarca = p.Marca || "";
        x.dtFipeModelo = p.Modelo || "";
        x.dtFipeAtualizado = new Date().toISOString().slice(0, 10);
        if (!x.dtCombustivel && p.Combustivel) x.dtCombustivel = p.Combustivel;

        // atualiza tambem o campo Observacoes com os dados da FIPE
        var linhaFipe = "FIPE " + (x.dtFipeCodigo || "") + ": " + (x.dtFipeValor || "") +
          (x.dtFipeRef ? " — ref. " + x.dtFipeRef : "");
        var obsAtual = String(x.dtObs || "").trim();
        if (obsAtual.toUpperCase().indexOf("FIPE ") < 0) {
          x.dtObs = obsAtual ? obsAtual + " | " + linhaFipe : linhaFipe;
        } else {
          x.dtObs = obsAtual.replace(/FIPE [^|]+/i, linhaFipe);
        }

        persistir();

        // atualiza apenas o detalhe ja aberto, sem recarregar a tabela inteira
        var tr = document.getElementById("fmDet" + i);
        if (tr) {
          tr.querySelector("td").innerHTML = detalheHtml(x, i);
          tr.style.display = "";
          tr.setAttribute("aria-hidden", "false");
        }
        var btn = document.querySelector('[data-ver-detran="' + i + '"]');
        if (btn) {
          btn.textContent = "🙈";
          btn.title = "Ocultar dados salvos";
          btn.setAttribute("aria-expanded", "true");
        }

        var m2 = document.getElementById("fipeUpMsg" + i);
        if (m2) {
          m2.textContent =
            "✔ FIPE atualizada: " +
            (x.dtFipeValor || "") +
            (x.dtFipeRef ? " (ref. " + x.dtFipeRef + ")" : "");
          m2.style.color = "#198754";
        }

      })
      .catch(function (e) {
        aviso("✖ " + (e && e.message ? e.message : "Falha ao consultar a FIPE."), "#dc2626");
      })
      .then(function () {
        var b2 = document.getElementById("fipeUpBtn" + i);
        if (b2) b2.disabled = false;
      });
  };


  /* ---------------- boot ---------------- */
  function iniciar() {
    montar();
    escutarNuvem();
    try {
      if (typeof firebase !== "undefined" && firebase.auth) {
        firebase.auth().onAuthStateChanged(function (u) {
          if (u) escutarNuvem();
        });
      }
    } catch (e) {}
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
