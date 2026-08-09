/* ============================================================
   FROTA MASTER - RELATORIOS UNIVERSAIS
   - Adiciona em TODOS os modulos com tabela os botoes:
     Excel, PDF, Imprimir e "Baixar tudo"
   - Exporta SEMPRE o que esta na tela (se houver filtro
     aplicado, exporta apenas os registros filtrados) e ignora
     a paginacao (todas as paginas do resultado filtrado).
   Carregue por ultimo, antes de </body>.
============================================================ */
(function () {
  "use strict";

  var IGNORAR_COLUNAS = ["acoes", "acao", "opcoes", "editar", "excluir", ""];

  function txt(el) {
    return String(el.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function slug(s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function hoje() {
    var d = new Date();
    return (
      String(d.getDate()).padStart(2, "0") +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      d.getFullYear()
    );
  }

  /* ---------- descobre modulos e rotulos ---------- */
  function rotulos() {
    var map = {};
    document.querySelectorAll(".sidebar a[data-module]").forEach(function (a) {
      var span = a.querySelector("span:not(.ic)");
      map[a.getAttribute("data-module")] = span ? txt(span) : a.getAttribute("data-module");
    });
    return map;
  }

  function moduloDe(tabela) {
    var mapa = rotulos();
    var el = tabela.parentElement;
    while (el && el !== document.body) {
      if (el.id && Object.prototype.hasOwnProperty.call(mapa, el.id)) {
        return { id: el.id, nome: mapa[el.id] };
      }
      el = el.parentElement;
    }
    var tb = tabela.querySelector("tbody");
    var id = (tb && tb.id) || tabela.id || "relatorio";
    return { id: id, nome: id.replace(/^lista/, "") };
  }

  /* ---------- extrai dados da tabela (respeita filtros) ---------- */
  function extrair(tabela) {
    var thead = tabela.querySelector("thead");
    var tbody = tabela.querySelector("tbody");
    if (!tbody) return null;

    var ths = thead ? Array.prototype.slice.call(thead.querySelectorAll("tr:last-child th")) : [];
    var manter = [];
    var head = [];
    ths.forEach(function (th, i) {
      var nome = txt(th);
      if (IGNORAR_COLUNAS.indexOf(slug(nome)) === -1) {
        manter.push(i);
        head.push(nome);
      }
    });

    var linhas = [];
    Array.prototype.slice.call(tbody.rows).forEach(function (tr) {
      if (tr.getAttribute("data-pro-vazio") === "1") return;
      var cels = Array.prototype.slice.call(tr.cells);
      if (!cels.length) return;
      // linha de "nenhum registro"
      if (cels.length === 1 && ths.length > 1) return;
      var linha;
      if (head.length && ths.length === cels.length) {
        linha = manter.map(function (i) {
          return txt(cels[i]);
        });
      } else {
        linha = cels.map(txt);
      }
      if (
        linha.join("").length &&
        !/^nenhum|^sem registro/i.test(linha.join(" ").trim())
      ) {
        linhas.push(linha);
      }
    });

    if (!head.length && linhas.length) {
      head = linhas[0].map(function (_, i) {
        return "Coluna " + (i + 1);
      });
    }

    return { head: head, linhas: linhas };
  }

  /* Renderiza temporariamente todas as paginas do modulo para que o
     relatorio nunca fique limitado aos registros da pagina atual. */
  function extrairCompleto(tabela) {
    var info = moduloDe(tabela);
    var tamanhoAnterior = null;
    var paginaAnterior = null;
    var podeRenderizar =
      typeof PAGINACAO !== "undefined" &&
      PAGINACAO &&
      typeof PAGINACAO.itensPorPagina === "number" &&
      typeof renderModulo === "function" &&
      info.id &&
      typeof db !== "undefined" &&
      db &&
      Array.isArray(db[info.id]);

    if (podeRenderizar) {
      tamanhoAnterior = PAGINACAO.itensPorPagina;
      paginaAnterior = PAGINACAO.paginas && PAGINACAO.paginas[info.id];
      PAGINACAO.itensPorPagina = Math.max(db[info.id].length, 1);
      if (PAGINACAO.paginas) PAGINACAO.paginas[info.id] = 1;
      try {
        renderModulo(info.id);
      } catch (e) {
        void e;
      }
    }

    var dados = extrair(tabela);

    if (podeRenderizar) {
      PAGINACAO.itensPorPagina = tamanhoAnterior;
      if (PAGINACAO.paginas) PAGINACAO.paginas[info.id] = paginaAnterior || 1;
      try {
        renderModulo(info.id);
      } catch (e) {
        void e;
      }
    }
    return dados;
  }

  function vazio(dados) {
    if (!dados || !dados.linhas.length) {
      alert("Nao ha registros para gerar o relatorio.");
      return true;
    }
    return false;
  }

  /* ---------- Excel ---------- */
  function excel(tabela, nome) {
    if (typeof XLSX === "undefined") {
      alert("Biblioteca de Excel nao carregada.");
      return;
    }
    var dados = extrairCompleto(tabela);
    if (vazio(dados)) return;
    var ws = XLSX.utils.aoa_to_sheet([dados.head].concat(dados.linhas));
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, nome.substring(0, 28) || "Dados");
    XLSX.writeFile(wb, "FrotaMaster_" + slug(nome).replace(/\s+/g, "_") + "_" + hoje() + ".xlsx");
  }

  /* ---------- PDF ---------- */
  function pdf(tabela, nome) {
    var Ctor = window.jspdf && window.jspdf.jsPDF;
    if (!Ctor) {
      alert("Biblioteca de PDF nao carregada.");
      return;
    }
    var dados = extrairCompleto(tabela);
    if (vazio(dados)) return;
    var doc = new Ctor({ orientation: "landscape", unit: "pt", format: "a4" });
    doc.setFontSize(14);
    doc.text("Frota Master - " + nome, 40, 36);
    doc.setFontSize(9);
    doc.text("Emitido em " + new Date().toLocaleString("pt-BR"), 40, 52);
    doc.autoTable({
      head: [dados.head],
      body: dados.linhas,
      startY: 66,
      styles: { fontSize: 7.5, cellPadding: 4, lineWidth: 0.5, lineColor: [148, 163, 184] },
      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [241, 245, 249] },
      theme: "grid"
    });
    doc.save("FrotaMaster_" + slug(nome).replace(/\s+/g, "_") + "_" + hoje() + ".pdf");
  }

  /* ---------- Imprimir ---------- */
  function imprimir(tabela, nome) {
    var dados = extrairCompleto(tabela);
    if (vazio(dados)) return;
    var html =
      "<html><head><meta charset='utf-8'><title>" +
      nome +
      "</title><style>" +
      "body{font-family:Inter,Arial,sans-serif;padding:18px;color:#0f172a}" +
      "h1{font-size:16px;margin:0 0 4px}small{color:#64748b}" +
      "table{border-collapse:collapse;width:100%;margin-top:12px;font-size:11px}" +
      "th,td{border:1px solid #94a3b8;padding:5px 7px;text-align:left}" +
      "thead th{background:#0f172a;color:#fff}tbody tr:nth-child(even){background:#f1f5f9}" +
      "</style></head><body><h1>Frota Master - " +
      nome +
      "</h1><small>Emitido em " +
      new Date().toLocaleString("pt-BR") +
      " &middot; " +
      dados.linhas.length +
      " registro(s)</small><table><thead><tr>" +
      dados.head
        .map(function (h) {
          return "<th>" + h + "</th>";
        })
        .join("") +
      "</tr></thead><tbody>" +
      dados.linhas
        .map(function (l) {
          return (
            "<tr>" +
            l
              .map(function (c) {
                return "<td>" + c + "</td>";
              })
              .join("") +
            "</tr>"
          );
        })
        .join("") +
      "</tbody></table></body></html>";
    var w = window.open("", "_blank");
    if (!w) {
      alert("Permita janelas pop-up para imprimir.");
      return;
    }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(function () {
      w.print();
    }, 350);
  }

  /* ---------- Baixar tudo ---------- */
  function nomeAba(usados, base) {
    var nome = String(base || "Dados").replace(/[\\\/\?\*\[\]:]/g, " ").trim();
    nome = (nome || "Dados").substring(0, 28);
    usados[nome] = (usados[nome] || 0) + 1;
    if (usados[nome] > 1) nome = nome.substring(0, 24) + "_" + usados[nome];
    return nome;
  }

  function dadosDoBanco(chave) {
    if (typeof db === "undefined" || !db) return null;
    var lista = db[chave];
    if (!Array.isArray(lista) || !lista.length) return null;
    var colunas = [];
    lista.forEach(function (item) {
      if (item && typeof item === "object") {
        Object.keys(item).forEach(function (k) {
          if (colunas.indexOf(k) === -1) colunas.push(k);
        });
      }
    });
    if (!colunas.length) return null;
    return {
      head: colunas,
      linhas: lista.map(function (item) {
        return colunas.map(function (k) {
          var v = item ? item[k] : "";
          if (v === null || v === undefined) return "";
          return typeof v === "object" ? JSON.stringify(v) : String(v);
        });
      })
    };
  }

  function baixarTudo() {
    if (typeof XLSX === "undefined") {
      alert("Biblioteca de Excel nao carregada.");
      return;
    }

    /* garante que todas as tabelas estejam renderizadas, inclusive
       modulos que ainda nao foram abertos nesta sessao */
    try {
      if (typeof renderTudo === "function") renderTudo();
    } catch (e) {
      void e;
    }

    var wb = XLSX.utils.book_new();
    var usados = {};
    var feitos = {};
    var n = 0;

    tabelas().forEach(function (t) {
      var info = moduloDe(t);
      var dados = extrairCompleto(t);
      if (!dados || !dados.linhas.length) return;
      if (info.id) feitos[info.id] = true;
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([dados.head].concat(dados.linhas)),
        nomeAba(usados, info.nome)
      );
      n++;
    });

    /* fallback: qualquer modulo com dados no banco que nao tenha
       gerado linhas na tela entra direto pelos dados brutos */
    if (typeof db !== "undefined" && db) {
      Object.keys(db).forEach(function (chave) {
        if (feitos[chave]) return;
        var dados = dadosDoBanco(chave);
        if (!dados) return;
        XLSX.utils.book_append_sheet(
          wb,
          XLSX.utils.aoa_to_sheet([dados.head].concat(dados.linhas)),
          nomeAba(usados, chave)
        );
        n++;
      });
    }

    if (!n) {
      alert("Nao ha dados para baixar.");
      return;
    }
    XLSX.writeFile(wb, "FrotaMaster_COMPLETO_" + hoje() + ".xlsx");
  }


  function tabelas() {
    return Array.prototype.slice.call(document.querySelectorAll("table")).filter(function (t) {
      var tb = t.querySelector("tbody");
      return tb && !t.hasAttribute("data-sem-relatorio");
    });
  }

  function removerExportacoesDuplicadas() {
    var antigos = document.querySelectorAll(
      '.btn-excel, button[onclick*="exportarExcel("], input[onclick*="exportarExcel("]'
    );
    Array.prototype.forEach.call(antigos, function (el) {
      if (el.closest(".rel-bar")) return;
      var bloco = el.parentElement;
      el.remove();
      if (bloco && !bloco.children.length && !txt(bloco)) bloco.remove();
    });
  }

  /* ---------- barra de botoes ---------- */
  function botao(rotulo, classe, fn) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "rel-btn " + classe;
    b.textContent = rotulo;
    b.addEventListener("click", fn);
    return b;
  }

  function montarBarra(tabela) {
    if (tabela.getAttribute("data-rel") === "1") return;
    tabela.setAttribute("data-rel", "1");

    var info = moduloDe(tabela);
    var wrap = tabela.closest(".table-responsive");
    if (!wrap && tabela.parentNode) {
      wrap = document.createElement("div");
      wrap.className = "table-responsive";
      tabela.parentNode.insertBefore(wrap, tabela);
      wrap.appendChild(tabela);
    }
    wrap = wrap || tabela;
    var barra = document.createElement("div");
    barra.className = "rel-bar";
    barra.innerHTML = '<span class="rel-tt">Relatórios</span>';
    barra.appendChild(
      botao("📊 Excel", "rel-excel", function () {
        excel(tabela, info.nome);
      })
    );
    barra.appendChild(
      botao("📄 PDF", "rel-pdf", function () {
        pdf(tabela, info.nome);
      })
    );
    barra.appendChild(
      botao("🖨️ Imprimir", "rel-print", function () {
        imprimir(tabela, info.nome);
      })
    );
    barra.appendChild(botao("⬇️ Baixar tudo", "rel-all", baixarTudo));
    if (wrap.parentNode) wrap.parentNode.insertBefore(barra, wrap);
  }

  function aplicar() {
    removerExportacoesDuplicadas();
    tabelas().forEach(montarBarra);
  }

  function iniciar() {
    aplicar();
    var obs = new MutationObserver(function () {
      aplicar();
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar);
  } else {
    iniciar();
  }

  window.relatorioExcel = function (id) {
    var t = document.getElementById(id);
    if (t) excel(t.closest("table") || t, moduloDe(t.closest("table") || t).nome);
  };
  window.baixarTudoFrota = baixarTudo;
})();
