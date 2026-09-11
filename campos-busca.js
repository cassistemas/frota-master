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

  function atualizarSugestoes(select, input, lista) {
    var atual = input.value;
    if (select.value && !atual) {
      var escolhida = select.options[select.selectedIndex];
      input.value = escolhida ? escolhida.textContent.trim() : "";
    }
    filtrarSugestoes(select, input, lista);
  }

  function fecharSugestoes(lista) {
    lista.innerHTML = "";
    lista.hidden = true;
  }

  function escolherOpcao(select, input, lista, option) {
    select.value = option.value;
    input.value = option.textContent.trim();
    fecharSugestoes(lista);
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function filtrarSugestoes(select, input, lista, mostrarTodos) {
    var termo = mostrarTodos ? "" : normalizar(input.value);
    lista.innerHTML = "";

    var correspondencias = opcoesValidas(select).filter(function (option) {
      return !termo || normalizar(option.textContent).indexOf(termo) >= 0 ||
        normalizar(option.value).indexOf(termo) >= 0;
    });

    correspondencias.slice(0, 50).forEach(function (option) {
      var item = document.createElement("button");
      item.type = "button";
      item.className = "fm-busca-opcao";
      item.textContent = option.textContent.trim();
      item.addEventListener("mousedown", function (event) {
        event.preventDefault();
        escolherOpcao(select, input, lista, option);
      });
      lista.appendChild(item);
    });

    if (!correspondencias.length) {
      var vazio = document.createElement("div");
      vazio.className = "fm-busca-vazia";
      vazio.textContent = "Nenhum cadastro encontrado";
      lista.appendChild(vazio);
    }

    lista.hidden = false;
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

    var input = document.createElement("input");
    var lista = document.createElement("div");

    input.type = "search";
    input.id = select.id + "-busca";
    input.className = "form-control fm-busca-cadastro";
    input.placeholder = "Digite para buscar " + tipo;
    input.setAttribute("aria-label", "Buscar " + tipo + " cadastrado");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-controls", "fm-lista-" + select.id);
    input.autocomplete = "off";
    lista.id = "fm-lista-" + select.id;
    lista.className = "fm-busca-lista";
    lista.hidden = true;

    select.parentNode.insertBefore(input, select);
    select.parentNode.insertBefore(lista, select);
    select.parentNode.classList.add("fm-busca-container");
    select.classList.add("fm-select-cadastro-original");
    select.setAttribute("aria-hidden", "true");
    select.tabIndex = -1;
    select.dataset.fmBuscaCadastro = "1";

    var rotulo = document.querySelector('label[for="' + select.id + '"]');
    if (rotulo) rotulo.setAttribute("for", input.id);

    input.addEventListener("input", function () {
      selecionarCorrespondencia(select, input, false);
      filtrarSugestoes(select, input, lista);
    });
    input.addEventListener("change", function () {
      if (!selecionarCorrespondencia(select, input, false)) {
        filtrarSugestoes(select, input, lista);
      }
    });
    input.addEventListener("keydown", function (event) {
      var primeira = lista.querySelector(".fm-busca-opcao");
      if (event.key === "Enter" && primeira) {
        event.preventDefault();
        primeira.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      }
      if (event.key === "Escape") {
        fecharSugestoes(lista);
      }
    });
    input.addEventListener("focus", function () {
      filtrarSugestoes(select, input, lista, true);
    });
    input.addEventListener("click", function () {
      filtrarSugestoes(select, input, lista, true);
    });
    input.addEventListener("blur", function () {
      window.setTimeout(function () { fecharSugestoes(lista); }, 120);
    });
    select.addEventListener("change", function () {
      var option = select.options[select.selectedIndex];
      input.value = select.value && option ? option.textContent.trim() : "";
    });

    new MutationObserver(function () {
      atualizarSugestoes(select, input, lista);
    }).observe(select, { childList: true, subtree: true });

    atualizarSugestoes(select, input, lista);
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