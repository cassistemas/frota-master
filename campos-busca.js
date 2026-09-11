/* ============================================================
   CAMPO ÚNICO DE BUSCA NOS CADASTROS
   O select original continua cuidando do valor salvo, mas fica invisível.
   ============================================================ */
(function () {
  "use strict";

  var CAMPOS = {
    dimotorista: "motorista", filtroDiMotorista: "motorista",
    agveiculo: "veículo", agmotorista: "motorista",
    muveiculo: "veículo", mumotorista: "motorista",
    filtroMuVeiculo: "veículo", filtroMuMotorista: "motorista",
    vmotorista: "motorista", fvMotorista: "motorista",
    femotorista: "motorista",
    mveiculo: "veículo", mfornecedor: "fornecedor",
    filtroManVeiculo: "veículo", filtroManFornecedor: "fornecedor",
    cveiculo: "veículo", fcVeiculo: "veículo",
    lveiculo: "veículo", tveiculo: "veículo", sveiculo: "veículo",
    leveiculo: "veículo", svveiculo: "veículo", filtroSVVeiculo: "veículo",
    pveiculo: "veículo", filtroPVeiculo: "veículo", pfornecedor: "fornecedor",
    efornecedor: "fornecedor", eplaca: "veículo", splaca: "veículo",
    sitem: "produto", rveiculo: "veículo"
  };

  function normalizar(valor) {
    return String(valor || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
  }

  function opcoesValidas(select) {
    return Array.from(select.options || []).filter(function (option) {
      return option.value && !option.disabled;
    });
  }

  function atualizarSugestoes(select, input, datalist) {
    var atual = input.value;
    datalist.innerHTML = "";
    opcoesValidas(select).forEach(function (option) {
      var sugestao = document.createElement("option");
      sugestao.value = option.textContent.trim();
      datalist.appendChild(sugestao);
    });

    if (select.value && !atual) {
      var escolhida = select.options[select.selectedIndex];
      input.value = escolhida ? escolhida.textContent.trim() : "";
    }
  }

  function selecionarCorrespondencia(select, input, aceitarParcial) {
    var termo = normalizar(input.value);
    if (!termo) {
      select.value = "";
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
      return false;
    }

    var opcoes = opcoesValidas(select);
    var encontrada = opcoes.find(function (option) {
      return normalizar(option.textContent) === termo || normalizar(option.value) === termo;
    });

    if (!encontrada && aceitarParcial) {
      encontrada = opcoes.find(function (option) {
        return normalizar(option.textContent).indexOf(termo) >= 0 ||
          normalizar(option.value).indexOf(termo) >= 0;
      });
    }

    if (!encontrada) {
      select.value = "";
      return false;
    }
    select.value = encontrada.value;
    input.value = encontrada.textContent.trim();
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function prepararCampo(select, tipo) {
    if (!select || select.dataset.fmBuscaCadastro === "1") return;

    var listaId = "fm-lista-" + select.id;
    var input = document.createElement("input");
    var datalist = document.createElement("datalist");

    input.type = "search";
    input.id = select.id + "-busca";
    input.className = "form-control fm-busca-cadastro";
    input.placeholder = "Digite para buscar " + tipo;
    input.setAttribute("aria-label", "Buscar " + tipo + " cadastrado");
    input.setAttribute("list", listaId);
    input.autocomplete = "off";
    datalist.id = listaId;

    select.parentNode.insertBefore(input, select);
    select.parentNode.insertBefore(datalist, select);
    select.classList.add("fm-select-cadastro-original");
    select.setAttribute("aria-hidden", "true");
    select.tabIndex = -1;
    select.dataset.fmBuscaCadastro = "1";

    var rotulo = document.querySelector('label[for="' + select.id + '"]');
    if (rotulo) rotulo.setAttribute("for", input.id);

    input.addEventListener("input", function () {
      selecionarCorrespondencia(select, input, false);
    });
    input.addEventListener("change", function () {
      selecionarCorrespondencia(select, input, true);
    });
    input.addEventListener("keydown", function (event) {
      if (event.key === "Enter" && selecionarCorrespondencia(select, input, true)) {
        event.preventDefault();
      }
    });
    select.addEventListener("change", function () {
      var option = select.options[select.selectedIndex];
      input.value = select.value && option ? option.textContent.trim() : "";
    });

    new MutationObserver(function () {
      atualizarSugestoes(select, input, datalist);
    }).observe(select, { childList: true, subtree: true });

    atualizarSugestoes(select, input, datalist);
  }

  function prepararTodos() {
    Object.keys(CAMPOS).forEach(function (id) {
      prepararCampo(document.getElementById(id), CAMPOS[id]);
    });
  }

  window.fmAtualizarBuscasCadastro = prepararTodos;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", prepararTodos);
  } else {
    prepararTodos();
  }

  new MutationObserver(prepararTodos).observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();