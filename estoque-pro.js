/* =====================================================
   ESTOQUE PRO — Entrada / Saída sincronizadas
   ===================================================== */
(function () {
  "use strict";

  var ITENS_POR_PAGINA = 10;
  var pag = { entrada: 1, saida: 1 };
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
  function movimentos() { return (window.db && db.estoque) || []; }

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
    if (!sel || !window.db || !db.veiculos) return;
    var atual = sel.value;
    sel.innerHTML = '<option value="">Veículo...</option>' +
      db.veiculos.map(function (v) { return '<option value="' + v.vplaca + '">' + v.vplaca + " - " + (v.vmodelo || "") + "</option>"; }).join("");
    sel.value = atual;
  }

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
      db.estoque[Number(idx)] = obj;
    } else {
      db.estoque.push(obj);
    }
    if (typeof salvarNuvem === "function") salvarNuvem();
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
    if (idx !== "") db.estoque[Number(idx)] = obj;
    else db.estoque.push(obj);

    if (typeof salvarNuvem === "function") salvarNuvem();
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
    db.estoque.splice(i, 1);
    if (typeof salvarNuvem === "function") salvarNuvem();
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

  window.aplicarFiltrosEstoque = function () { pag.entrada = 1; pag.saida = 1; renderModulo("estoque"); };
  window.limparFiltrosEstoque = function () {
    ["filtroEstoqueItem", "filtroEstoqueCategoria", "filtroEstoqueIni", "filtroEstoqueFim"]
      .forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ""; });
    pag.entrada = 1; pag.saida = 1;
    renderModulo("estoque");
  };

  /* ---- paginação simples ---- */
  window.estoquePagina = function (tipo, p) { pag[tipo] = p; renderModulo("estoque"); };
  function pager(tipo, total, containerId) {
    var el = document.getElementById(containerId);
    if (!el) return;
    var totalPag = Math.max(1, Math.ceil(total / ITENS_POR_PAGINA));
    if (pag[tipo] > totalPag) pag[tipo] = totalPag;
    if (totalPag <= 1) { el.innerHTML = ""; return; }
    var html = "";
    for (var i = 1; i <= totalPag; i++) {
      html += '<button class="est-page' + (i === pag[tipo] ? " active" : "") + '" onclick="estoquePagina(\'' + tipo + "'," + i + ')">' + i + "</button>";
    }
    el.innerHTML = html + '<span class="est-page-info">' + total + " registro(s)</span>";
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
    var iniE = (pag.entrada - 1) * ITENS_POR_PAGINA;
    var tbE = document.getElementById("listaEstoqueEntradas");
    if (tbE) {
      tbE.innerHTML = ent.length ? ent.slice(iniE, iniE + ITENS_POR_PAGINA).map(function (x) {
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
    var iniS = (pag.saida - 1) * ITENS_POR_PAGINA;
    var tbS = document.getElementById("listaEstoqueSaidas");
    if (tbS) {
      tbS.innerHTML = sai.length ? sai.slice(iniS, iniS + ITENS_POR_PAGINA).map(function (x) {
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
    var tbP = document.getElementById("listaEstoqueSaldo");
    if (tbP) {
      tbP.innerHTML = listaPos.length ? listaPos.map(function (it) {
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
  window.addEventListener("load", function () { setTimeout(function () { try { renderEstoquePro(); } catch (e) {} }, 300); });
})();
