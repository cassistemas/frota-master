/* =====================================================
   PNEUS PRO — Sincronização com Estoque + Histórico
   -----------------------------------------------------
   . Status "Estoque"      -> gera ENTRADA automática no módulo Estoque
   . Vinculado a veículo   -> gera SAÍDA automática (baixa do estoque)
   . Recapado / Descartado -> gera SAÍDA (baixa definitiva)
   . Todo movimento fica registrado no histórico do pneu
   . Tabela com dados ocultos: só aparecem ao clicar no 👁
   ===================================================== */
(function () {
  "use strict";

  function base() {
    try { if (typeof db !== "undefined" && db) return db; } catch (e) {}
    if (!window.db) window.db = {};
    return window.db;
  }
  function movs() {
    return typeof window.listaEstoque === "function"
      ? window.listaEstoque()
      : (Array.isArray(base().estoque) ? base().estoque : (base().estoque = []));
  }
  function gravar() {
    if (window.fmPneusLoteAtivo) return; // o lote grava tudo de uma vez ao final
    if (typeof window.persistirEstoque === "function") window.persistirEstoque();
    if (typeof salvarNuvem === "function") return salvarNuvem(['pneus','eventosPneus']);
  }
  function n(v) {
    if (typeof v === "number") return v;
    var t = String(v || "").trim();
    if (!t) return 0;
    var x = t.indexOf(",") >= 0 ? t.replace("R$", "").replace(/\./g, "").replace(",", ".") : t.replace("R$", "");
    return parseFloat(x.replace(/[^\d.-]/g, "")) || 0;
  }
  function moeda(v) { return typeof floatParaMoeda === "function" ? floatParaMoeda(n(v)) : "R$ " + n(v).toFixed(2); }
  function dataBRx(v) { return typeof formatarDataBR === "function" ? formatarDataBR(v) : (v || "--"); }
  function hoje() { return new Date().toISOString().slice(0, 10); }
  function esc(v) { return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function vazio(v) { return (v === undefined || v === null || String(v).trim() === "") ? "--" : String(v); }

  /* Atualiza somente a leitura dos pneus em uso. Não passa pelo salvamento
     de cadastro: odômetro não é instalação, estoque nem custo mensal. */
  window.fmAtualizarKmPneusVeiculo = function (veiculo) {
    var b = base();
    if (!veiculo || !Array.isArray(b.pneus)) return 0;
    if (typeof window.fmModuloCarregado === 'function' &&
        (!window.fmModuloCarregado('veiculos') || !window.fmModuloCarregado('pneus'))) return 0;
    var normalizar = function (v) { return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); };
    var placa = normalizar(veiculo.vplaca);
    function kmNumero(v) {
      var s = String(v == null ? '' : v).trim();
      if (!s || !/^\d+(?:[.,]\d+)*$/.test(s)) return null;
      var valor = typeof window.fmKmNumero === 'function' ? window.fmKmNumero(s)
        : parseFloat(s.replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
      return Number.isFinite(valor) ? valor : null;
    }
    var km = kmNumero(veiculo.vkm), alterados = 0;
    if (!placa || km === null) return 0;
    if (!Number.isFinite(km) || km < 0) return 0;
    b.pneus.forEach(function (p) {
      if (!p || p.pstatus !== 'Em Uso' || normalizar(p.pveiculo) !== placa) return;
      var rodado = Math.max(0, km - (kmNumero(p.pkminstalacao) || 0));
      if (String(p.pkmatual) === String(km) && String(p.pkmrodado) === String(rodado)) return;
      var anterior = Object.assign({}, p);
      p.pkmatual = String(km);
      p.pkmrodado = String(rodado);
      if (typeof window.fmPrepararRegistro === 'function') window.fmPrepararRegistro('pneus', p, anterior);
      alterados++;
    });
    return alterados;
  };

  /* Consulta de tela: nunca prepara registros, salva ou cria movimentos. */
  function placaKm(v) { return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function numeroKm(v) {
    var s = String(v == null ? '' : v).trim();
    if (!/^\d+(?:[.,]\d+)*$/.test(s)) return null;
    var valor = typeof window.fmKmNumero === 'function' ? window.fmKmNumero(s)
      : Number(s.replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
    return Number.isFinite(valor) && valor >= 0 ? valor : null;
  }
  function leituraKm(p) {
    if (p.pstatus !== 'Em Uso') return { atual:p.pkmatual, rodado:p.pkmrodado, aviso:'' };
    function pendente(txt) { return { atual:'', rodado:'', aviso:txt }; }
    if (typeof window.fmModuloCarregado === 'function' &&
        (!window.fmModuloCarregado('veiculos') || !window.fmModuloCarregado('pneus'))) return pendente('Aguarde o carregamento de Veículos e Pneus.');
    var placa = placaKm(p.pveiculo);
    var encontrados = (base().veiculos || []).filter(function (v) { return placa && placaKm(v.vplaca) === placa; });
    if (encontrados.length !== 1) return pendente('Selecione um veículo com cadastro único para consultar o KM Atual.');
    var atual = numeroKm(encontrados[0].vkm), inicio = numeroKm(p.pkminstalacao);
    if (atual === null) return pendente('O veículo está sem KM Atual válido. Confira o módulo Veículos.');
    if (inicio === null) return { atual:String(atual), rodado:'', aviso:'Informe um KM de instalação válido para calcular o KM rodado.' };
    if (atual < inicio) return { atual:String(atual), rodado:'', aviso:'KM Atual menor que o KM de instalação. Confira as leituras; o KM rodado não foi calculado.' };
    return { atual:String(atual), rodado:String(atual - inicio), aviso:'' };
  }
  function campoKm(id) { return document.getElementById(id); }
  function valorKm(id) { return (campoKm(id) || {}).value || ''; }
  function avisoKm(texto) {
    var aviso = campoKm('pneuKmAviso');
    if (aviso) { aviso.textContent = texto; aviso.hidden = !texto; }
  }
  window.calcularKMPneu = function () {
    var atual = campoKm('pkmatual'), rodado = campoKm('pkmrodado');
    if (!atual || !rodado) return;
    var idx = valorKm('p_idx');
    var original = idx !== '' ? (base().pneus || [])[Number(idx)] : null;
    var status = valorKm('pstatus'), placa = valorKm('pveiculo');
    var transferencia = original && original.pstatus === 'Em Uso' && status === 'Em Uso' && placaKm(original.pveiculo) !== placaKm(placa);
    var retirada = original && original.pstatus === 'Em Uso' && status !== 'Em Uso';
    if (transferencia || retirada) {
      // KM Atual pertence à ORIGEM; nunca preenche com o odômetro do destino.
      if (atual.dataset.fmKmModo !== 'origem') {
        atual.value = leituraKm(original).atual || '';
      }
      atual.dataset.fmKmModo = 'origem';
      atual.readOnly = false;
      atual.title = 'Odômetro de saída do veículo de origem (editável para movimentações históricas)';
      var saidaOrigem = numeroKm(atual.value), inicioOrigem = numeroKm(original.pkminstalacao);
      rodado.value = !transferencia && saidaOrigem !== null && inicioOrigem !== null && saidaOrigem >= inicioOrigem ? String(saidaOrigem - inicioOrigem) : '';
      avisoKm(transferencia ? 'Transferência: KM Atual é a saída da origem ' + original.pveiculo + '. Informe o KM Instalação do destino; os odômetros não são subtraídos entre placas.' : 'Retirada: confira o KM de saída da origem ' + original.pveiculo + ' e a data da movimentação.');
      return;
    }
    atual.dataset.fmKmModo = status === 'Em Uso' ? 'automatico' : 'manual';
    atual.readOnly = status === 'Em Uso';
    atual.title = status === 'Em Uso' ? 'KM Atual consultado automaticamente no módulo Veículos' : 'Leitura da movimentação, sem atualização automática';
    if (status === 'Em Uso') {
      var leitura = leituraKm({ pstatus:status, pveiculo:placa, pkminstalacao:valorKm('pkminstalacao') });
      atual.value = leitura.atual;
      rodado.value = leitura.rodado;
      avisoKm(leitura.aviso);
    } else {
      avisoKm('');
    }
  };
  ['input','change'].forEach(function (tipo) {
    document.addEventListener(tipo, function (ev) {
      if (ev.target && ['pveiculo','pstatus','pkminstalacao','pkmatual'].indexOf(ev.target.id) >= 0) window.calcularKMPneu();
    });
  });
  // Limpezas feitas pelo formulário também encerram o modo de saída da origem.
  var limparKmAnterior = window.limparForm;
  if (typeof limparKmAnterior === 'function') {
    window.limparForm = function (mod) {
      var r = limparKmAnterior.apply(this, arguments);
      if (mod === 'pneus') {
        var atual = campoKm('pkmatual');
        if (atual) atual.dataset.fmKmModo = '';
        window.calcularKMPneu();
      }
      return r;
    };
  }
  window.addEventListener('frota:placa-alterada', function () {
    window.calcularKMPneu();
    var modulo = campoKm('pneus');
    if (modulo && !modulo.classList.contains('hidden')) renderTabela();
  });
  var editarKmAnterior = window.editar;
  window.editar = function (mod) {
    var r = typeof editarKmAnterior === 'function' ? editarKmAnterior.apply(this, arguments) : undefined;
    if (mod === 'pneus') {
      var atual = campoKm('pkmatual');
      if (atual) atual.dataset.fmKmModo = '';
      window.calcularKMPneu();
    }
    return r;
  };

  /* ---------- identidade e nome do item no estoque ---------- */
  function garantirId(p) {
    if (!p.pid) p.pid = "PNEU-" + Date.now() + "-" + Math.floor(Math.random() * 10000);
    return p.pid;
  }
  function nomeItem(p) {
    var partes = ["Pneu " + (p.pnumero || "S/N")];
    if (p.pmarca) partes.push(p.pmarca);
    if (p.pmedida) partes.push(p.pmedida);
    return partes.join(" ");
  }

  /* ---------- histórico ---------- */
  function historico(p) {
    if (!Array.isArray(p.phist)) p.phist = [];
    return p.phist;
  }
  function registrar(p, tipo, texto) {
    historico(p).push({ data: new Date().toISOString(), tipo: tipo, texto: texto });
  }
  window.historicoPneu = historico;

  /* ---------- movimentos do pneu ---------- */
  function movsPneu(p) {
    var id = p.pid;
    return movs().filter(function (m) { return m && m.epneuid && m.epneuid === id; });
  }
  function saldoPneu(p) {
    return movsPneu(p).reduce(function (a, m) {
      var q = parseFloat(m.equantidade) || 0;
      return m.etipo === "Saída" ? a - q : a + q;
    }, 0);
  }
  window.saldoEstoquePneu = saldoPneu;

  function entrada(p, obs) {
    var valor = n(p.pvalor);
    movs().push({
      eitem: nomeItem(p),
      ecategoria: "Pneus",
      etipo: "Entrada",
      equantidade: 1,
      evalorunitario: valor,
      edata: p.pdata || hoje(),
      ecompetencia: p.pcompetencia || "",
      efornecedor: p.pfornecedor || "",
      elote: p.pdot || "",
      eestoqueminimo: 0,
      eobservacoes: obs,
      eplaca: "",
      etotal: valor,
      epneuid: p.pid,
      eorigem: "pneus"
    });
    registrar(p, "Entrada no estoque", obs);
  }

  function saida(p, placa, obs) {
    var valor = n(p.pvalor);
    movs().push({
      eid: typeof window.estoqueNovoId === "function"
        ? window.estoqueNovoId()
        : "pneu_saida_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8),
      eitem: nomeItem(p),
      ecategoria: "Pneus",
      etipo: "Saída",
      equantidade: 1,
      evalorunitario: valor,
      edata: p.pdatainstalacao || hoje(),
      ecompetencia: p.pcompetencia || "",
      efornecedor: "",
      elote: p.pdot || "",
      eresponsavel: "",
      eobservacoes: obs,
      eplaca: placa || "",
      etotal: valor,
      epneuid: p.pid,
      eorigem: "pneus"
    });
    registrar(p, "Saída do estoque", obs);
  }

  /* ---------- sincronização (idempotente) ---------- */
  function sincronizar(p) {
    garantirId(p);
    var status = p.pstatus || "";
    var saldo = saldoPneu(p);

    if (status === "Estoque") {
      if (saldo <= 0) entrada(p, "Pneu " + (p.pnumero || "") + " disponível em estoque (módulo Pneus)");
      if (p.pveiculoanterior) p.pveiculoanterior = "";
      return;
    }

    if (status === "Em Uso") {
      if (!p.pveiculo) {
        registrar(p, "Aviso", "Status 'Em Uso' sem veículo vinculado — nenhuma baixa gerada.");
        return;
      }
      var movimentosAtuais = movsPneu(p);
      // Sem histórico, cria a entrada inicial antes da primeira instalação.
      // Com histórico e saldo zero, a baixa já foi registrada neste ciclo.
      if (!movimentosAtuais.length) {
        entrada(p, "Entrada automática para vínculo com o veículo " + p.pveiculo);
        saldo = 1;
      } else if (saldo <= 0) {
        return;
      }
      saida(p, p.pveiculo, "Instalado no veículo " + p.pveiculo + " • posição " + (p.pposicao || "--"));
      registrar(p, "Instalação", "Vinculado à placa " + p.pveiculo + " (posição " + (p.pposicao || "--") + ")");
      return;
    }

    if (status === "Recapado" || status === "Descartado" || status === "Veículo Vendido") {
      if (saldo > 0) saida(p, p.pveiculo || "", "Baixa por status: " + status);
      registrar(p, status, "Pneu marcado como " + status);
    }
  }
  window.sincronizarPneuEstoque = sincronizar;
  window.fmPneusGravarTudo = function () { window.fmPneusLoteAtivo = false; return gravar(); };

  /* Completa, uma vez por pneu, a saída do estoque e o evento de Pneus por KM
     que faltarem para pneus Em Uso já cadastrados. Não duplica o que existe. */
  async function completarFaltantes() {
    var b = base();
    if (!b || !Array.isArray(b.pneus)) return false;
    if (typeof window.fmModuloCarregado === "function" &&
        ["pneus","estoque","eventosPneus","manutencoes","veiculos"].some(function (m) { return !window.fmModuloCarregado(m); })) return null;
    if (!window.FMPneusFrota) return null;
    var resultado = await window.FMPneusFrota.sincronizarCadastros();
    if (resultado.aguardando) return null;
    window.FMPneusFrota.mostrarResultado(resultado);
    var mudou = false;
    b.pneus.forEach(function (p) {
      if (!p || p.pstatus !== "Em Uso" || !p.pveiculo) return;
      // Não inventa datas nem baixas para cadastros com instalação inválida.
      if (window.FMPneusFrota.diagnosticar(p).erro) return;
      garantirId(p);
      var temSaida = movsPneu(p).some(function (m) { return m.etipo === "Saída"; });
      if (!temSaida && !p.fmEstoqueExcluido) { window.fmPneusDataReparo = true; try { sincronizar(p); } finally { window.fmPneusDataReparo = false; } mudou = true; }
    });
    if (mudou) await gravar();
    if (typeof window.renderResultadoFrota === 'function') window.renderResultadoFrota();
    return mudou || resultado.integrados > 0;
  }
  window.fmPneusCompletarFaltantes = completarFaltantes;
  (async function aguardar(t) {
    var r = null;
    try { r = (window.auth && auth.currentUser) ? await completarFaltantes() : null; } catch (e) { console.error(e); }
    if (r === null && t < 120) setTimeout(function () { aguardar(t + 1); }, 2000);
  })(0);

  /* Duplicar apenas prepara um novo cadastro; nunca copia vínculos ou histórico. */
  window.duplicarPneu = function (i) {
    var p = (base().pneus || [])[Number(i)];
    if (!p) { alert('Pneu não encontrado.'); return; }
    if (!confirm('Preparar uma cópia do pneu ' + p.pnumero + '? O formulário atual será substituído, mas nada será salvo.')) return;
    var copiar = ['pmarca','pmodelo','pmedida','pdot','pvalor','pdata','pvida','psulco','pfornecedor','pobs'];
    ['pnumero','pmarca','pmodelo','pmedida','pdot','pvalor','pdata','pdatainstalacao','pvida','psulco','pveiculo','pfornecedor','pposicao','pkminstalacao','pkmatual','pkmrodado','pstatus','pobs','p_idx'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = copiar.indexOf(id) >= 0 ? (p[id] || '') : '';
    });
    document.getElementById('pstatus').value = 'Estoque';
    var painel = document.getElementById('plPainel');
    if (painel) painel.style.display = 'none';
    var linhas = document.getElementById('plLinhas');
    if (linhas) linhas.innerHTML = '';
    if (typeof window.fmSincronizarValoresBuscasCadastro === 'function') window.fmSincronizarValoresBuscasCadastro();
    document.getElementById('pstatus').dispatchEvent(new Event('change', {bubbles:true}));
    var numero = document.getElementById('pnumero');
    numero.placeholder = 'Informe um novo número e revise antes de salvar';
    numero.scrollIntoView({behavior:'smooth', block:'center'});
    numero.focus({preventScroll:true});
  };

  /* ---------- salvar pneu (substitui o original) ---------- */
  window.salvarPneu = function () {
    var campos = ["pnumero","pmarca","pmodelo","pmedida","pdot","pvalor","pdata","pcompetencia","pdatainstalacao","pvida","psulco",
      "pveiculo","pfornecedor","pposicao","pkminstalacao","pkmatual","pkmrodado","pstatus","pobs"];

    var b = base();
    if (typeof window.fmModuloCarregado === 'function' && ['pneus','eventosPneus','estoque','veiculos','manutencoes'].some(function (mod) { return !window.fmModuloCarregado(mod); })) {
      alert('Aguarde o carregamento de Pneus, Estoque, veículos e históricos antes de salvar.'); return;
    }
    if (!Array.isArray(b.pneus)) b.pneus = [];

    window.calcularKMPneu();
    var obj = {};
    campos.forEach(function (id) {
      var el = document.getElementById(id);
      obj[id] = el ? el.value : "";
    });

    obj.pnumero = String(obj.pnumero || '').trim();
    if (!obj.pnumero) { alert("Informe o número do pneu."); return; }
    if (obj.pstatus === 'Estoque') {
      obj.pveiculo = '';
      obj.pposicao = '';
      if (document.getElementById('p_idx').value === '') {
        obj.pkminstalacao = '';
        obj.pkmatual = '';
        obj.pkmrodado = '';
        obj.pdatainstalacao = '';
      }
    }

    var idx = document.getElementById("p_idx").value;
    var novo = idx === "";
    var anterior = novo ? null : Object.assign({}, b.pneus[Number(idx)]);
    if (!novo && !b.pneus[Number(idx)]) { alert('Pneu não encontrado.'); return; }
    obj.pid = anterior && anterior.pid;
    // Mantém a escolha de exclusão ao editar os dados do cadastro.
    if (anterior) {
      obj.fmEstoqueExcluido = !!anterior.fmEstoqueExcluido;
      obj.fmEventosPneusExcluidos = !!anterior.fmEventosPneusExcluidos;
    }
    garantirId(obj);
    if (b.pneus.some(function(p,i){return i!==Number(novo?-1:idx)&&String(p.pnumero||'').trim().toUpperCase()===String(obj.pnumero).trim().toUpperCase();})) {
      alert('Este número de pneu já está cadastrado. Edite o registro existente.'); return;
    }
    var plano = window.FMPneusFrota ? window.FMPneusFrota.preparar(obj, anterior) : {erro:'A integração de Pneus por KM não está disponível.'};
    if (plano.erro) { alert(plano.erro); return; }
    // O plano já capturou a saída da origem. O cadastro Em Uso guarda
    // somente a leitura do destino, sem misturar odômetros na transferência.
    if (obj.pstatus === 'Em Uso') {
      var leitura = leituraKm(obj);
      obj.pkmatual = leitura.atual;
      obj.pkmrodado = leitura.rodado;
    }
    if (novo && !window.fmPneusLoteAtivo && !confirm('Confirmar cadastro do pneu ' + obj.pnumero + '?\n\nMarca: ' + (obj.pmarca || '--') + '\nMedida: ' + (obj.pmedida || '--') + '\nValor: ' + moeda(obj.pvalor) + '\nStatus: ' + (obj.pstatus || '--') + '\nVeículo: ' + (obj.pveiculo || 'Sem veículo (estoque)') + '\n\nSomente ao confirmar o pneu e seus movimentos serão salvos.')) return false;
    if (typeof window.fmPrepararRegistro === "function") {
      window.fmPrepararRegistro("pneus", obj, anterior);
    }

    if (novo) {
      obj.pdatacadastro = new Date().toISOString();
      obj.phist = [];
      garantirId(obj);
      registrar(obj, "Cadastro", "Pneu cadastrado com status " + (obj.pstatus || "--"));
      b.pneus.push(obj);
      if (typeof irParaUltimaPagina === "function") irParaUltimaPagina("pneus");
    } else {
      obj.pdatacadastro = anterior.pdatacadastro || new Date().toISOString();
      obj.pid = anterior.pid || obj.pid;
      obj.phist = Array.isArray(anterior.phist) ? anterior.phist.slice() : [];
      garantirId(obj);
      registrar(obj, "Edição", "Dados do pneu atualizados");
      if (anterior.pstatus !== obj.pstatus) {
        registrar(obj, "Status", "De '" + (anterior.pstatus || "--") + "' para '" + (obj.pstatus || "--") + "'");
      }
      if (anterior.pveiculo !== obj.pveiculo) {
        registrar(obj, "Veículo", "De '" + (anterior.pveiculo || "sem veículo") + "' para '" + (obj.pveiculo || "sem veículo") + "'");
      }
      b.pneus[Number(idx)] = obj;
    }

    // Sincroniza com o estoque somente quando o estado relevante mudou
    var mudouEstado = novo ||
      anterior.pstatus !== obj.pstatus ||
      anterior.pveiculo !== obj.pveiculo;
    if (mudouEstado) sincronizar(obj);
    // Alterar o mês não cria outra movimentação nem reescreve ciclos anteriores.
    if (anterior && anterior.pcompetencia !== obj.pcompetencia) {
      movsPneu(obj).forEach(function (m) {
        if (m.eorigem !== 'pneus') return;
        var dataOrigem = m.etipo === 'Entrada' ? anterior.pdata : anterior.pdatainstalacao;
        if (m.edata === dataOrigem && (m.ecompetencia || '') === (anterior.pcompetencia || '')) {
          m.ecompetencia = obj.pcompetencia || '';
        }
      });
    }
    window.FMPneusFrota.aplicar(plano);

    gravar();

    if (typeof limparForm === "function") limparForm("pneus", campos, "p_idx");
    renderModulo("pneus");
    if (typeof renderDashboard === "function") renderDashboard();
    if (typeof window.renderResultadoFrota === 'function') window.renderResultadoFrota();
    if (typeof window.renderCustosFrota === 'function') window.renderCustosFrota();
  };

  // O diálogo central permite escolher quais vínculos do cadastro serão apagados.
  var excluirAnterior = window.deletar;
  window.deletar = function(mod, i) {
    if (mod === 'pneus' && typeof window.fmExcluirVinculado === 'function') return window.fmExcluirVinculado(mod, i);
    return typeof excluirAnterior === 'function' ? excluirAnterior.apply(this, arguments) : undefined;
  };

  /* ---------- linhas ocultas com 👁 ---------- */
  var abertos = {};
  window.togglePneuDetalhe = function (id) {
    abertos[id] = !abertos[id];
    renderTabela(); // consulta novamente o odômetro ao abrir os detalhes
    var linha = document.getElementById("pneuDet_" + id);
    var btn = document.getElementById("pneuOlho_" + id);
    if (linha) linha.classList.toggle("hidden", !abertos[id]);
    if (btn) {
      btn.classList.toggle("ativo", !!abertos[id]);
      btn.title = abertos[id] ? "Ocultar informações" : "Ver informações";
    }
  };

  function linhaDet(rotulo, valor) {
    return '<div class="pneu-info"><span>' + esc(rotulo) + "</span><b>" + esc(vazio(valor)) + "</b></div>";
  }

  function detalhes(p, realIndex) {
    var id = p.pid;
    var hist = historico(p).slice().reverse();
    var mv = movsPneu(p).slice().reverse();
    var saldo = saldoPneu(p);
    var km = leituraKm(p);

    var info =
      linhaDet("Número", p.pnumero) +
      linhaDet("Marca", p.pmarca) +
      linhaDet("Modelo", p.pmodelo) +
      linhaDet("Medida", p.pmedida) +
      linhaDet("DOT", p.pdot) +
      linhaDet("Valor de compra", p.pvalor ? moeda(p.pvalor) : "--") +
      linhaDet("Data de compra", p.pdata ? dataBRx(p.pdata) : "--") +
      linhaDet("Vida útil (KM)", p.pvida) +
      linhaDet("Sulco inicial", p.psulco) +
      linhaDet("Veículo / placa", p.pveiculo) +
      linhaDet("Fornecedor", p.pfornecedor) +
      linhaDet("Posição", p.pposicao) +
      linhaDet("KM instalação", p.pkminstalacao) +
      linhaDet("KM atual", km.atual) +
      linhaDet("KM rodado", km.rodado === '' || km.rodado == null ? '--' : km.rodado + " KM") +
      (km.aviso ? linhaDet("Aviso de quilometragem", km.aviso) : '') +
      linhaDet("Status", p.pstatus) +
      linhaDet("Em estoque", saldo > 0 ? "Sim (saldo " + saldo + ")" : "Não") +
      linhaDet("Cadastrado em", p.pdatacadastro ? dataBRx(String(p.pdatacadastro).slice(0, 10)) : "--") +
      linhaDet("Observações", p.pobs);

    var histHtml = hist.length
      ? hist.map(function (h) {
          return '<li><span class="pneu-hist-data">' + esc(dataBRx(String(h.data).slice(0, 10))) + "</span>" +
            '<span class="pneu-hist-tipo">' + esc(h.tipo) + "</span>" +
            '<span class="pneu-hist-txt">' + esc(h.texto || "") + "</span></li>";
        }).join("")
      : '<li class="text-muted">Nenhum histórico registrado.</li>';

    var movHtml = mv.length
      ? mv.map(function (m) {
          return '<li><span class="pneu-hist-data">' + esc(dataBRx(m.edata)) + "</span>" +
            '<span class="pneu-hist-tipo ' + (m.etipo === "Saída" ? "out" : "in") + '">' + esc(m.etipo) + "</span>" +
            '<span class="pneu-hist-txt">' + esc(m.eobservacoes || "") + (m.eplaca ? " • " + esc(m.eplaca) : "") + "</span></li>";
        }).join("")
      : '<li class="text-muted">Nenhuma movimentação de estoque.</li>';

    return '<tr id="pneuDet_' + esc(id) + '" class="pneu-detalhe hidden"><td colspan="5">' +
      '<div class="pneu-painel">' +
        '<div class="pneu-grid">' + info + "</div>" +
        '<div class="pneu-cols">' +
          '<div><h6>🕘 Histórico do pneu</h6><ul class="pneu-hist">' + histHtml + "</ul></div>" +
          '<div><h6>📦 Movimentações no estoque</h6><ul class="pneu-hist">' + movHtml + "</ul></div>" +
        "</div>" +
        '<div class="pneu-acoes">' +
          '<button class="btn btn-sm btn-dark" onclick="editar(\'pneus\',' + realIndex + ')">✎ Editar</button> ' +
          '<button type="button" class="btn btn-sm btn-outline-primary" onclick="duplicarPneu(' + realIndex + ')">⧉ Duplicar</button> ' +
          '<button class="btn btn-sm btn-outline-danger" onclick="deletar(\'pneus\',' + realIndex + ')">✕ Excluir</button>' +
        "</div>" +
      "</div></td></tr>";
  }

  function listaFiltrada() {
    var b = base();
    var lista = Array.isArray(b.pneus) ? b.pneus.slice() : [];
    var filtro = (document.getElementById("filtroPneu") || {}).value || "";
    filtro = filtro.toLowerCase();
    var veiculo = (document.getElementById("filtroPVeiculo") || {}).value || "";
    var status = (document.getElementById("filtroPStatus") || {}).value || "";
    return lista.filter(function (p) {
      var txt = (String(p.pnumero || "") + " " + String(p.pmarca || "") + " " + String(p.pmodelo || "") + " " + String(p.pmedida || "")).toLowerCase();
      return (!filtro || txt.indexOf(filtro) >= 0) &&
        (!veiculo || p.pveiculo === veiculo) &&
        (!status || p.pstatus === status);
    });
  }

  function renderTabela() {
    window.calcularKMPneu();
    var b = base();
    if (!Array.isArray(b.pneus)) b.pneus = [];
    b.pneus.forEach(garantirId);

    var tbody = document.getElementById("listaPneus");
    if (!tbody) return;

    var lista = listaFiltrada();
    var dados = typeof getDadosPaginadosCustom === "function" ? getDadosPaginadosCustom(lista, "pneus") : lista;

    tbody.innerHTML = dados.length ? dados.map(function (p) {
      var realIndex = b.pneus.indexOf(p);
      var id = p.pid;
      var badge = p.pstatus === "Estoque" ? "bg-success" : (p.pstatus === "Em Uso" ? "bg-primary" : (p.pstatus === "Veículo Vendido" ? "bg-warning text-dark" : "bg-secondary"));
      return '<tr class="pneu-linha">' +
        '<td style="white-space:nowrap">' +
          '<button type="button" id="pneuOlho_' + esc(id) + '" class="btn-olho me-2' + (abertos[id] ? " ativo" : "") + '" title="Ver informações" onclick="togglePneuDetalhe(\'' + esc(id) + '\')">' +
            '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12Z"/><circle cx="12" cy="12" r="3"/></svg>' +
          "</button>" +
        "<b>" + esc(vazio(p.pnumero)) + "</b></td>" +
        "<td>" + esc(vazio(p.pmarca)) + "</td>" +
        "<td>" + esc(p.pveiculo ? p.pveiculo : "Em estoque") + "</td>" +
        '<td><span class="badge ' + badge + '">' + esc(vazio(p.pstatus)) + "</span></td>" +
        '<td class="text-end"><div class="pneu-acoes-linha">' +
          '<button type="button" class="btn-edit" title="Editar" onclick="editar(\'pneus\',' + realIndex + ')">&#9998;</button>' +
          '<button type="button" class="btn btn-sm btn-outline-primary" title="Duplicar para revisar antes de salvar" onclick="duplicarPneu(' + realIndex + ')">⧉ Duplicar</button>' +
          '<button type="button" class="btn-del" title="Excluir" onclick="deletar(\'pneus\',' + realIndex + ')">&#10005;</button>' +
        "</div></td>" +
      "</tr>" + detalhes(p, realIndex);
    }).join("") : '<tr><td colspan="5" class="text-center text-muted">Nenhum pneu encontrado</td></tr>';

    // reaplica o estado aberto/fechado
    Object.keys(abertos).forEach(function (id) {
      if (!abertos[id]) return;
      var l = document.getElementById("pneuDet_" + id);
      if (l) l.classList.remove("hidden");
    });

    if (typeof renderPaginacaoCustom === "function") renderPaginacaoCustom(lista, "pneus", "paginacaoPneus");
  }
  window.renderTabelaPneus = renderTabela;

  /* cabeçalho reduzido (as informações ficam no 👁) */
  function ajustarCabecalho() {
    var tbody = document.getElementById("listaPneus");
    if (!tbody) return;
    var thead = tbody.parentElement && tbody.parentElement.querySelector("thead tr");
    if (thead && !thead.dataset.pneuAjustado) {
      thead.innerHTML = "<th>Número</th><th>Marca</th><th>Veículo</th><th>Status</th><th class='text-end'>Ações</th>";
      thead.dataset.pneuAjustado = "1";
    }
  }

  var anteriorRender = window.renderModulo;
  window.renderModulo = function (modulo) {
    if (typeof anteriorRender === "function") anteriorRender(modulo);
    if (modulo === "pneus") {
      ajustarCabecalho();
      renderTabela();
    }
  };

  setTimeout(function () {
    window.calcularKMPneu();
    var modulo = document.getElementById('pneus');
    if (modulo && !modulo.classList.contains('hidden')) renderModulo('pneus');
  }, 1200);
})();
