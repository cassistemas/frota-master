/* =====================================================
   ESTOQUE PRO — Entrada / Saída sincronizadas
   ===================================================== */
(function () {
  "use strict";

  function itensPorPagina() {
    return (typeof PAGINACAO !== "undefined" && PAGINACAO && PAGINACAO.itensPorPagina) || 15;
  }
  var pag = { entrada: 1, saida: 1, saldo: 1 };
  var abaAtual = "entrada";

  function num(v) {
    if (typeof v === "number") return v;
    var t = String(v || "").trim();
    if (!t) return 0;
    var n = t.indexOf(",") >= 0
      ? t.replace("R$", "").replace(/\./g, "").replace(",", ".")
      : t.replace("R$", "");
    return parseFloat(n.replace(/[^\d.-]/g, "")) || 0;
  }
  function chave(nome) { return String(nome || "").trim().toLowerCase(); }
  function qtd(m) { return parseFloat(m.equantidade) || 0; }
  function moeda(v) { return typeof floatParaMoeda === "function" ? floatParaMoeda(v) : "R$ " + (Number(v) || 0).toFixed(2); }
  function nBR(v) { return (Number(v) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 }); }
  function dataBRx(v) { return typeof formatarDataBR === "function" ? formatarDataBR(v) : (v || "--"); }

  /* O sistema declara o banco com "let db" (escopo lexical global), portanto ele
     NAO existe em window.db. Sem isto o modulo lia um objeto vazio: os produtos
     ja cadastrados nao apareciam e os veiculos nao eram carregados. */
  function raiz() {
    try { if (typeof db !== "undefined" && db) return db; } catch (e) {}
    if (!window.db) window.db = {};
    return window.db;
  }
  window.dbEstoqueRaiz = raiz;

  function movimentos() { return lista(); }

  /* ---- persistência segura ----
     O doc "estoque" pode não existir ainda na nuvem; nesse caso db.estoque fica
     indefinido e o push quebrava silenciosamente (nada era salvo). Garantimos a
     lista, gravamos na nuvem com tratamento de erro e mantemos cópia local. */
  var LS_KEY = "frota_estoque_backup";

  function lista() {
    var raizDb = raiz();
    if (!Array.isArray(raizDb.estoque)) raizDb.estoque = [];
    return raizDb.estoque;
  }
  window.listaEstoque = lista;

  function persistir() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(lista())); } catch (e) {}
    try {
      if (typeof carimbarRegistros === "function") carimbarRegistros();
      if (typeof dbCloud !== "undefined" && dbCloud && dbCloud.collection) {
        var p = dbCloud.collection("frota").doc("estoque").set({ dados: lista() }, { merge: true });
        if (p && p.catch) p.catch(function (err) {
          console.error("Erro ao salvar estoque na nuvem:", err);
          alert("Não foi possível salvar o estoque na nuvem: " + (err && err.message ? err.message : err) +
            "\nOs dados ficaram salvos neste navegador.");
        });
      } else if (typeof salvarNuvem === "function") {
        salvarNuvem();
      }
    } catch (err) {
      console.error(err);
    }
  }
  window.persistirEstoque = persistir;

  // Restaura a cópia local caso a nuvem ainda não tenha o documento de estoque.
  function restaurarBackupLocal() {
    if (lista().length) return;
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      var arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length) {
        var atual = lista();
        atual.push.apply(atual, arr);
        if (typeof renderModulo === "function") renderModulo("estoque");
      }
    } catch (e) {}
  }
  setTimeout(restaurarBackupLocal, 2500);

  /* ---- posição de estoque por item ---- */
  function posicaoEstoque(ignorarIndice) {
    var mapa = {};
    movimentos().forEach(function (m, i) {
      if (ignorarIndice != null && i === Number(ignorarIndice)) return;
      var k = chave(m.eitem);
      if (!k) return;
      if (!mapa[k]) mapa[k] = { item: String(m.eitem).trim(), categoria: m.ecategoria || "", entradas: 0, saidas: 0, valorEntradas: 0, minimo: 0 };
      if (m.ecategoria) mapa[k].categoria = m.ecategoria;
      if (num(m.eestoqueminimo) > 0) mapa[k].minimo = num(m.eestoqueminimo);
      if (m.etipo === "Saída") mapa[k].saidas += qtd(m);
      else { mapa[k].entradas += qtd(m); mapa[k].valorEntradas += qtd(m) * num(m.evalorunitario); }
    });
    Object.keys(mapa).forEach(function (k) {
      var it = mapa[k];
      it.saldo = it.entradas - it.saidas;
      it.custoMedio = it.entradas > 0 ? it.valorEntradas / it.entradas : 0;
      it.valorSaldo = Math.max(0, it.saldo) * it.custoMedio;
    });
    return mapa;
  }
  window.posicaoEstoque = posicaoEstoque;

  function saldoDoItem(nome, ignorarIndice) {
    var p = posicaoEstoque(ignorarIndice)[chave(nome)];
    return p ? p.saldo : 0;
  }
  window.saldoEstoqueItem = saldoDoItem;

  /* ---- abas ---- */
  window.estoqueTab = function (aba) {
    abaAtual = aba;
    ["entrada", "saida", "saldo"].forEach(function (a) {
      var pane = document.getElementById("estPane_" + a);
      if (pane) pane.classList.toggle("hidden", a !== aba);
      var btn = document.querySelector('.est-tab[data-est-tab="' + a + '"]');
      if (btn) btn.classList.toggle("active", a === aba);
    });
    renderModulo("estoque");
  };

  /* ---- filtros ---- */
  function filtro() {
    return {
      item: (document.getElementById("filtroEstoqueItem") || {}).value || "",
      cat: (document.getElementById("filtroEstoqueCategoria") || {}).value || "",
      ini: (document.getElementById("filtroEstoqueIni") || {}).value || "",
      fim: (document.getElementById("filtroEstoqueFim") || {}).value || ""
    };
  }
  function filtrados(tipo) {
    var f = filtro(), termo = f.item.trim().toLowerCase();
    return movimentos().map(function (m, i) { return { mov: m, i: i }; }).filter(function (x) {
      var m = x.mov;
      var eTipo = m.etipo === "Saída" ? "Saída" : "Entrada";
      return eTipo === tipo &&
        (!termo || String(m.eitem || "").toLowerCase().indexOf(termo) >= 0) &&
        (!f.cat || m.ecategoria === f.cat) &&
        (!f.ini || (m.edata || "") >= f.ini) &&
        (!f.fim || (m.edata || "") <= f.fim);
    }).sort(function (a, b) { return String(b.mov.edata || "").localeCompare(String(a.mov.edata || "")); });
  }

  /* ---- selects / datalist ---- */
  function preencherSelectVeiculos(id) {
    var sel = document.getElementById(id);
    if (!sel) return;
    var veiculos = raiz().veiculos;
    if (!Array.isArray(veiculos)) return;
    var atual = sel.value;
    sel.innerHTML = '<option value="">Veículo...</option>' +
      veiculos
        .filter(function (v) { return String(v.vstatus || "").toUpperCase() !== "VENDIDO"; })
        .map(function (v) { return '<option value="' + v.vplaca + '">' + v.vplaca + " - " + (v.vmodelo || "") + "</option>"; })
        .join("");
    if (atual) sel.value = atual;
  }
  window.recarregarVeiculosEstoque = function () { preencherSelectVeiculos("splaca"); };

  function preencherItensSaida() {
    var sel = document.getElementById("sitem");
    if (!sel) return;
    var atual = sel.value;
    var pos = posicaoEstoque();
    var itens = Object.keys(pos).map(function (k) { return pos[k]; })
      .sort(function (a, b) { return a.item.localeCompare(b.item, "pt-BR"); });
    sel.innerHTML = '<option value="">Selecione o item...</option>' + itens.map(function (it) {
      var zero = it.saldo <= 0;
      return '<option value="' + it.item.replace(/"/g, "&quot;") + '"' + (zero ? " disabled" : "") + ">" +
        it.item + " — saldo: " + nBR(it.saldo) + (zero ? " (sem estoque)" : "") + "</option>";
    }).join("");
    if (atual) sel.value = atual;

    var dl = document.getElementById("estoqueItensCadastrados");
    if (dl) dl.innerHTML = itens.map(function (it) { return '<option value="' + it.item.replace(/"/g, "&quot;") + '">'; }).join("");
  }

  window.atualizarSaldoItemSaida = function () {
    var sel = document.getElementById("sitem");
    var hint = document.getElementById("saldoItemSaida");
    var btn = document.getElementById("btnSalvarSaidaEstoque");
    if (!sel || !hint) return;
    var idx = (document.getElementById("s_idx") || {}).value;
    var nome = sel.value;
    if (!nome) {
      hint.className = "est-hint";
      hint.textContent = "Selecione um item para ver o saldo disponível.";
      if (btn) btn.disabled = false;
      return;
    }
    var pos = posicaoEstoque(idx === "" ? null : idx)[chave(nome)] || { saldo: 0, custoMedio: 0 };
    var q = parseFloat((document.getElementById("squantidade") || {}).value) || 0;
    if (pos.saldo <= 0) {
      hint.className = "est-hint danger";
      hint.textContent = "Sem estoque disponível para este item. Registre uma entrada primeiro.";
      if (btn) btn.disabled = true;
      return;
    }
    if (q > pos.saldo) {
      hint.className = "est-hint danger";
      hint.textContent = "Quantidade acima do saldo. Disponível: " + nBR(pos.saldo) + ".";
      if (btn) btn.disabled = true;
      return;
    }
    hint.className = "est-hint ok";
    hint.textContent = "Disponível: " + nBR(pos.saldo) + " • custo médio " + moeda(pos.custoMedio) +
      (q > 0 ? " • saldo após a saída: " + nBR(pos.saldo - q) : "");
    if (btn) btn.disabled = false;
  };

  /* ---- salvar ENTRADA ---- */
  window.salvarEstoque = function () {
    var item = (document.getElementById("eitem").value || "").trim();
    var quantidade = parseFloat(document.getElementById("equantidade").value) || 0;
    var valorUnitario = num(document.getElementById("evalorunitario").value);
    if (!item || quantidade <= 0) { alert("Informe o item e uma quantidade maior que zero."); return; }
    var idx = document.getElementById("e_idx").value;
    var obj = {
      eitem: item,
      ecategoria: document.getElementById("ecategoria").value,
      etipo: "Entrada",
      equantidade: quantidade,
      evalorunitario: valorUnitario,
      edata: document.getElementById("edata").value || new Date().toISOString().slice(0, 10),
      efornecedor: document.getElementById("efornecedor").value.trim(),
      elote: document.getElementById("elote").value.trim(),
      eestoqueminimo: num(document.getElementById("eestoqueminimo").value),
      eobservacoes: document.getElementById("eobservacoes").value.trim(),
      eplaca: "",
      etotal: quantidade * valorUnitario
    };
    if (idx !== "") {
      // editar entrada não pode deixar saldo negativo
      var saldoSem = saldoDoItem(item, idx);
      if (saldoSem + quantidade < 0) { alert("Esta alteração deixaria o saldo negativo."); return; }
      lista()[Number(idx)] = obj;
    } else {
      lista().push(obj);
    }
    persistir();
    limparFormEstoqueEntrada();
    renderModulo("estoque");
    if (typeof renderDashboard === "function") renderDashboard();
  };

  /* ---- salvar SAÍDA ---- */
  window.salvarSaidaEstoque = function () {
    var item = (document.getElementById("sitem").value || "").trim();
    var quantidade = parseFloat(document.getElementById("squantidade").value) || 0;
    var idx = document.getElementById("s_idx").value;
    if (!item) { alert("Selecione o item que sairá do estoque."); return; }
    if (quantidade <= 0) { alert("Informe uma quantidade maior que zero."); return; }

    var pos = posicaoEstoque(idx === "" ? null : idx)[chave(item)] || { saldo: 0, custoMedio: 0, categoria: "" };
    if (pos.saldo <= 0) { alert("Item sem estoque. Não é possível registrar saída de " + item + "."); return; }
    if (quantidade > pos.saldo) {
      alert("Saldo insuficiente para " + item + ". Disponível: " + nBR(pos.saldo) + ".");
      return;
    }

    var obj = {
      eitem: item,
      ecategoria: pos.categoria || "",
      etipo: "Saída",
      equantidade: quantidade,
      evalorunitario: pos.custoMedio,
      edata: document.getElementById("sdata").value || new Date().toISOString().slice(0, 10),
      efornecedor: "",
      elote: document.getElementById("slote").value.trim(),
      eresponsavel: document.getElementById("sresponsavel").value.trim(),
      eobservacoes: document.getElementById("sobservacoes").value.trim(),
      eplaca: document.getElementById("splaca").value || "",
      etotal: quantidade * pos.custoMedio
    };
    if (idx !== "") lista()[Number(idx)] = obj;
    else lista().push(obj);

    persistir();
    limparFormEstoqueSaida();
    renderModulo("estoque");
    if (typeof renderDashboard === "function") renderDashboard();
  };

  /* ---- limpar formulários ---- */
  window.limparFormEstoqueEntrada = function () {
    ["eitem", "ecategoria", "equantidade", "evalorunitario", "edata", "efornecedor", "elote", "eestoqueminimo", "eobservacoes", "e_idx"]
      .forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ""; });
  };
  window.limparFormEstoqueSaida = function () {
    ["sitem", "squantidade", "sdata", "splaca", "sresponsavel", "slote", "sobservacoes", "s_idx"]
      .forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ""; });
    atualizarSaldoItemSaida();
  };

  /* ---- editar / excluir ---- */
  window.editarEstoque = function (i) {
    var m = movimentos()[i];
    if (!m) return;
    if (m.etipo === "Saída") {
      estoqueTab("saida");
      preencherItensSaida();
      document.getElementById("s_idx").value = i;
      document.getElementById("sitem").value = m.eitem || "";
      document.getElementById("squantidade").value = m.equantidade || "";
      document.getElementById("sdata").value = m.edata || "";
      document.getElementById("splaca").value = m.eplaca || "";
      document.getElementById("sresponsavel").value = m.eresponsavel || "";
      document.getElementById("slote").value = m.elote || "";
      document.getElementById("sobservacoes").value = m.eobservacoes || "";
      atualizarSaldoItemSaida();
    } else {
      estoqueTab("entrada");
      document.getElementById("e_idx").value = i;
      document.getElementById("eitem").value = m.eitem || "";
      document.getElementById("ecategoria").value = m.ecategoria || "";
      document.getElementById("equantidade").value = m.equantidade || "";
      document.getElementById("evalorunitario").value = moeda(num(m.evalorunitario));
      document.getElementById("edata").value = m.edata || "";
      document.getElementById("efornecedor").value = m.efornecedor || "";
      document.getElementById("elote").value = m.elote || "";
      document.getElementById("eestoqueminimo").value = m.eestoqueminimo || "";
      document.getElementById("eobservacoes").value = m.eobservacoes || "";
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  window.excluirEstoque = function (i) {
    var m = movimentos()[i];
    if (!m) return;
    if (m.etipo !== "Saída") {
      var restante = movimentos().filter(function (x, j) { return j !== i; });
      var ent = 0, sai = 0;
      restante.forEach(function (x) {
        if (chave(x.eitem) !== chave(m.eitem)) return;
        if (x.etipo === "Saída") sai += qtd(x); else ent += qtd(x);
      });
      if (ent - sai < 0) {
        alert("Não é possível excluir esta entrada: existem saídas registradas que dependem dela.");
        return;
      }
    }
    if (!confirm("Excluir esta movimentação?")) return;
    lista().splice(i, 1);
    persistir();
    renderModulo("estoque");
    if (typeof renderDashboard === "function") renderDashboard();
  };

  window.novaSaidaDoItem = function (nome) {
    estoqueTab("saida");
    preencherItensSaida();
    var sel = document.getElementById("sitem");
    if (sel) sel.value = nome;
    atualizarSaldoItemSaida();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  window.aplicarFiltrosEstoque = function () { pag.entrada = 1; pag.saida = 1; pag.saldo = 1; renderModulo("estoque"); };
  window.limparFiltrosEstoque = function () {
    ["filtroEstoqueItem", "filtroEstoqueCategoria", "filtroEstoqueIni", "filtroEstoqueFim"]
      .forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ""; });
    pag.entrada = 1; pag.saida = 1; pag.saldo = 1;
    renderModulo("estoque");
  };

  /* ---- paginação no padrão dos outros módulos ---- */
  window.estoquePagina = function (tipo, p) {
    pag[tipo] = Math.max(1, Number(p) || 1);
    renderModulo("estoque");
  };
  window.estoqueMudarPagina = function (tipo, direcao) {
    window.estoquePagina(tipo, (pag[tipo] || 1) + Number(direcao));
  };

  function pager(tipo, total, containerId) {
    var el = document.getElementById(containerId);
    if (!el) return;
    var porPagina = itensPorPagina();
    var totalPag = Math.max(1, Math.ceil(total / porPagina));
    if (pag[tipo] > totalPag) pag[tipo] = totalPag;
    if (pag[tipo] < 1) pag[tipo] = 1;
    var atual = pag[tipo];
    var ini = "estoquePagina('" + tipo + "',";
    el.innerHTML =
      '<div class="paginacao-global">' +
        '<button ' + (atual === 1 ? "disabled" : "") + ' onclick="' + ini + '1)">&lt;&lt; Primeira</button>' +
        '<button ' + (atual === 1 ? "disabled" : "") + " onclick=\"estoqueMudarPagina('" + tipo + "',-1)\">&lt; Anterior</button>" +
        '<div class="pagina-info">Página ' + atual + " de " + totalPag + "</div>" +
        '<button ' + (atual === totalPag ? "disabled" : "") + " onclick=\"estoqueMudarPagina('" + tipo + "',1)\">Próxima &gt;</button>" +
        '<button ' + (atual === totalPag ? "disabled" : "") + ' onclick="' + ini + totalPag + ')">Última &gt;&gt;</button>' +
      "</div>";
  }

  /* ---- render ---- */
  function renderEstoquePro() {
    preencherItensSaida();
    preencherSelectVeiculos("splaca");

    var pos = posicaoEstoque();
    var lista = Object.keys(pos).map(function (k) { return pos[k]; })
      .sort(function (a, b) { return a.item.localeCompare(b.item, "pt-BR"); });

    var totEnt = 0, totSai = 0, valor = 0, zerados = 0;
    lista.forEach(function (it) {
      totEnt += it.entradas; totSai += it.saidas; valor += it.valorSaldo;
      if (it.saldo <= 0) zerados++;
    });
    var cards = {
      estoqueItens: lista.length,
      estoqueSaldo: nBR(totEnt - totSai),
      estoqueEntradas: nBR(totEnt),
      estoqueSaidas: nBR(totSai),
      estoqueValor: moeda(valor),
      estoqueZerados: zerados
    };
    Object.keys(cards).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.textContent = cards[id];
    });

    // tabela entradas
    var ent = filtrados("Entrada");
    pager("entrada", ent.length, "pagEstoqueEntradas");
    var iniE = (pag.entrada - 1) * itensPorPagina();
    var tbE = document.getElementById("listaEstoqueEntradas");
    if (tbE) {
      tbE.innerHTML = ent.length ? ent.slice(iniE, iniE + itensPorPagina()).map(function (x) {
        var m = x.mov;
        return '<tr><td><b>' + (m.eitem || "--") + "</b></td><td>" + (m.ecategoria || "--") + "</td><td>" + dataBRx(m.edata) +
          "</td><td>" + nBR(m.equantidade) + "</td><td>" + moeda(num(m.evalorunitario)) +
          "</td><td><b>" + moeda(qtd(m) * num(m.evalorunitario)) + "</b></td><td>" + (m.efornecedor || "--") +
          "</td><td>" + (m.elote || "--") + "</td><td>" + (m.eobservacoes || "--") +
          '</td><td><button class="btn-edit" onclick="editarEstoque(' + x.i + ')">✎</button>' +
          '<button class="btn-del" onclick="excluirEstoque(' + x.i + ')">✕</button></td></tr>';
      }).join("") : '<tr><td colspan="10" class="text-center text-muted">Nenhuma entrada registrada</td></tr>';
    }

    // tabela saídas
    var sai = filtrados("Saída");
    pager("saida", sai.length, "pagEstoqueSaidas");
    var iniS = (pag.saida - 1) * itensPorPagina();
    var tbS = document.getElementById("listaEstoqueSaidas");
    if (tbS) {
      tbS.innerHTML = sai.length ? sai.slice(iniS, iniS + itensPorPagina()).map(function (x) {
        var m = x.mov;
        return '<tr><td><b>' + (m.eitem || "--") + "</b></td><td>" + (m.ecategoria || "--") + "</td><td>" + dataBRx(m.edata) +
          "</td><td>" + nBR(m.equantidade) + "</td><td>" + moeda(num(m.evalorunitario)) +
          "</td><td><b>" + moeda(qtd(m) * num(m.evalorunitario)) + "</b></td><td>" + (m.eplaca || "--") +
          "</td><td>" + (m.eresponsavel || "--") + "</td><td>" + (m.elote || "--") + "</td><td>" + (m.eobservacoes || "--") +
          '</td><td><button class="btn-edit" onclick="editarEstoque(' + x.i + ')">✎</button>' +
          '<button class="btn-del" onclick="excluirEstoque(' + x.i + ')">✕</button></td></tr>';
      }).join("") : '<tr><td colspan="11" class="text-center text-muted">Nenhuma saída registrada</td></tr>';
    }

    // posição
    var f = filtro(), termo = f.item.trim().toLowerCase();
    var listaPos = lista.filter(function (it) {
      return (!termo || it.item.toLowerCase().indexOf(termo) >= 0) && (!f.cat || it.categoria === f.cat);
    });
    pager("saldo", listaPos.length, "pagEstoqueSaldo");
    var iniP = (pag.saldo - 1) * itensPorPagina();
    var tbP = document.getElementById("listaEstoqueSaldo");
    if (tbP) {
      tbP.innerHTML = listaPos.length ? listaPos.slice(iniP, iniP + itensPorPagina()).map(function (it) {
        var badge = it.saldo <= 0
          ? '<span class="badge bg-danger">Sem estoque</span>'
          : (it.minimo > 0 && it.saldo <= it.minimo
            ? '<span class="badge bg-warning text-dark">Estoque baixo</span>'
            : '<span class="badge bg-success">Disponível</span>');
        var nomeSeguro = it.item.replace(/'/g, "\\'");
        return "<tr><td><b>" + it.item + "</b></td><td>" + (it.categoria || "--") + "</td><td>" + nBR(it.entradas) +
          "</td><td>" + nBR(it.saidas) + "</td><td><b>" + nBR(it.saldo) + "</b></td><td>" + moeda(it.custoMedio) +
          "</td><td>" + moeda(it.valorSaldo) + "</td><td>" + badge +
          '</td><td><button class="btn btn-sm btn-outline-primary" ' + (it.saldo <= 0 ? "disabled" : "") +
          " onclick=\"novaSaidaDoItem('" + nomeSeguro + "')\">Dar saída</button></td></tr>";
      }).join("") : '<tr><td colspan="9" class="text-center text-muted">Nenhum item cadastrado</td></tr>';
    }

    var cont = document.getElementById("contFiltro_estoque");
    if (cont) {
      var filtrando = f.item || f.cat || f.ini || f.fim;
      cont.textContent = filtrando ? ent.length + " entrada(s) e " + sai.length + " saída(s) encontradas" : "";
    }
  }

  function instalar() {
    if (typeof window.renderModulo !== "function") return false;
    var anterior = window.renderModulo;
    window.renderModulo = function (modulo) {
      if (modulo === "estoque") {
        try { renderEstoquePro(); } catch (e) { console.error(e); }
        return;
      }
      return anterior.apply(this, arguments);
    };
    return true;
  }

  function iniciar() {
    instalar();
    try { renderEstoquePro(); } catch (e) { /* db pode não estar pronto */ }
  }

  if (document.readyState === "complete" || document.readyState === "interactive") setTimeout(iniciar, 0);
  else document.addEventListener("DOMContentLoaded", iniciar);
  window.addEventListener("load", function () {
    [300, 1500, 3000, 5000].forEach(function (t) {
      setTimeout(function () { try { renderEstoquePro(); } catch (e) {} }, t);
    });
  });
})();
