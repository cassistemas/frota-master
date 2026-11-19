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

  function permiteNomeLivre(select) {
    return select.id === "mumotorista";
  }

  function opcoesValidas(select) {
    return Array.from(select.options || []).filter(function (option) {
      return option.value && !option.disabled && option.dataset.fmNomeLivre !== "1";
    });
  }

  // Opção temporária só no formulário da multa; não altera o cadastro de motoristas.
  function definirNomeLivre(select, nome) {
    var opcao = Array.from(select.options || []).find(function (item) {
      return item.dataset.fmNomeLivre === "1";
    });
    if (!opcao) {
      opcao = document.createElement("option");
      opcao.dataset.fmNomeLivre = "1";
      select.appendChild(opcao);
    }
    if (opcao.value !== nome) opcao.value = nome;
    if (opcao.textContent !== nome) opcao.textContent = nome;
    select.value = nome;
  }

  function atualizarSugestoes(select, input, lista) {
    var atual = input.value;
    // Recarregar os cadastros não pode apagar o nome livre já digitado.
    if (permiteNomeLivre(select) && atual && !select.value) {
      selecionarCorrespondencia(select, input, false);
    }
    if (select.value && !atual) {
      var escolhida = select.options[select.selectedIndex];
      input.value = escolhida ? escolhida.textContent.trim() : "";
    }
    if (document.activeElement === input && !lista.hidden) {
      filtrarSugestoes(select, input, lista);
    }
  }

  function fecharSugestoes(lista) {
    lista.innerHTML = "";
    lista.hidden = true;
  }

  function fecharOutrasSugestoes(listaAtual) {
    document.querySelectorAll(".fm-busca-lista").forEach(function (lista) {
      if (lista !== listaAtual) fecharSugestoes(lista);
    });
  }

  function escolherOpcao(select, input, lista, option) {
    select.value = option.value;
    input.value = option.textContent.trim();
    fecharSugestoes(lista);
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function filtrarSugestoes(select, input, lista, mostrarTodos) {
    fecharOutrasSugestoes(lista);
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
      vazio.textContent = permiteNomeLivre(select)
        ? "Digite o nome; ele será salvo apenas nesta multa."
        : "Nenhum cadastro encontrado";
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
      if (permiteNomeLivre(select)) {
        definirNomeLivre(select, input.value.trim());
        select.dispatchEvent(new Event("input", { bubbles: true }));
        select.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
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
    input.placeholder = permiteNomeLivre(select)
      ? "Busque ou digite o motorista"
      : "Digite para buscar " + tipo;
    input.setAttribute("aria-label", permiteNomeLivre(select)
      ? "Motorista: selecione um cadastrado ou digite um nome livre"
      : "Buscar " + tipo + " cadastrado");
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
      var digitado = input.value;
      selecionarCorrespondencia(select, input, false);
      // Não corta espaços entre palavras enquanto o usuário digita.
      if (permiteNomeLivre(select)) input.value = digitado;
      filtrarSugestoes(select, input, lista);
    });
    input.addEventListener("change", function () {
      if (!selecionarCorrespondencia(select, input, false)) {
        filtrarSugestoes(select, input, lista);
      }
    });
    input.addEventListener("keydown", function (event) {
      if (event.key === "Enter" && permiteNomeLivre(select)) {
        event.preventDefault();
        selecionarCorrespondencia(select, input, false);
        fecharSugestoes(lista);
        return;
      }
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
      var indice = document.getElementById(select.id === "cveiculo" ? "c_idx" : "le_idx");
      var editandoSemAbrir = (select.id === "leveiculo" || select.id === "cveiculo") &&
        indice && indice.value !== "";
      if (input.dataset.fmBuscaFocoSilencioso === "1" || editandoSemAbrir) {
        fecharSugestoes(lista);
        return;
      }
      filtrarSugestoes(select, input, lista, true);
    });
    input.addEventListener("click", function () {
      var indice = document.getElementById("le_idx");
      var editandoLicenca = select.id === "leveiculo" && indice && indice.value !== "";
      filtrarSugestoes(select, input, lista, !editandoLicenca);
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

  function sincronizarValores() {
    Object.keys(CAMPOS).forEach(function (id) {
      var select = document.getElementById(id);
      if (!select || select.dataset.fmBuscaCadastro !== "1") return;
      var input = document.getElementById(id + "-busca");
      var lista = document.getElementById("fm-lista-" + id);
      var option = select.selectedIndex >= 0 ? select.options[select.selectedIndex] : null;
      if (input) input.value = select.value && option ? option.textContent.trim() : "";
      if (lista) fecharSugestoes(lista);
    });
  }

  window.fmAtualizarBuscasCadastro = prepararTodos;
  window.fmSincronizarValoresBuscasCadastro = sincronizarValores;

  document.addEventListener("mousedown", function (event) {
    if (!event.target.closest(".fm-busca-container")) {
      fecharOutrasSugestoes(null);
    }
  });

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