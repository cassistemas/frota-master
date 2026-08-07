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
    ["dtProprietario", "Proprietário", "text"],
    ["dtLicVenc", "Venc. Licenciamento", "date"],
    ["dtIpva", "Situação IPVA", "text"],
    ["dtRestricao", "Restrições", "text"],
    ["dtSituacao", "Situação do Veículo", "text"],
    ["dtObs", "Observações", "text"],
  ];

  /* ---------------- base de dados ---------------- */
  function base() {
    if (typeof db === "undefined") window.db = {};
    if (!db.detran) {
      var s = null;
      try {
        s = JSON.parse(localStorage.getItem(STORAGE) || "[]");
      } catch (e) {
        s = [];
      }
      db.detran = Array.isArray(s) ? s : [];
    }
    return db.detran;
  }

  function persistir() {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(base()));
    } catch (e) {}
    if (typeof salvarNuvem === "function") {
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

    if (idx !== "" && lista[Number(idx)]) {
      lista[Number(idx)] = obj;
    } else {
      var dup = lista.findIndex(function (r) {
        return (
          (obj.dtPlaca && norm(r.dtPlaca) === norm(obj.dtPlaca)) ||
          (obj.dtRenavam && norm(r.dtRenavam) === norm(obj.dtRenavam))
        );
      });
      if (dup >= 0) lista[dup] = obj;
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
  function detalheHtml(x) {
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
      '<div class="fm-det-item"><span class="fm-det-k">Atualizado em</span>' +
      '<span class="fm-det-v">' +
      dataBR(x.dtAtualizado) +
      "</span></div>";
    return '<div class="fm-det"><div class="fm-det-tit">📋 Dados completos salvos</div><div class="fm-det-grid">' + itens + "</div></div>";
  }

  window.verDetran = function (i) {
    var tr = document.getElementById("fmDet" + i);
    if (!tr) return;
    tr.style.display = tr.style.display === "none" ? "" : "none";
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
              '<button class="btn btn-sm btn-outline-secondary me-1" onclick="verDetran(' +
              o.i +
              ')" title="Ver todos os dados salvos">👁️</button>' +
              '<button class="btn btn-sm btn-outline-primary me-1" onclick="editarDetran(' +
              o.i +
              ')">✏️</button>' +
              '<button class="btn btn-sm btn-outline-danger" onclick="excluirDetran(' +
              o.i +
              ')">🗑️</button>' +
              "</td></tr>" +
              '<tr class="fm-det-row" id="fmDet' + o.i + '">' +
              '<td colspan="10">' + detalheHtml(x) + "</td></tr>"
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

  /* ---------------- boot ---------------- */
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", montar);
  else montar();
})();
