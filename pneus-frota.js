/* Ponte de cadastro -> eventos existentes; não cria lançamentos financeiros. */
(function () {
  'use strict';
  function numero(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    var s = String(v == null ? '' : v).replace(/R\$\s*/g, '').trim();
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    return Number(s) || 0;
  }
  function placa(v) { return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function chave(v) { return String(v || '').trim().toUpperCase(); }
  function banco() { return typeof db !== 'undefined' ? db : window.db; }
  function preparar(p, anterior) {
    var b = banco(), uso = p.pstatus === 'Em Uso';
    if (!b) return {erro:'Os cadastros ainda não estão disponíveis.'};
    if (typeof window.fmModuloCarregado === 'function' &&
        (!window.fmModuloCarregado('pneus') || !window.fmModuloCarregado('eventosPneus'))) {
      return {erro:'Aguarde o carregamento de Pneus e Pneus por KM antes de salvar.'};
    }
    var lista = Array.isArray(b.eventosPneus) ? b.eventosPneus : [];
    var eventos = lista.filter(function (e) {
      return e && ((anterior && anterior.pid && e.cadastroPneuId === anterior.pid) || chave(e.pneuId) === chave(anterior ? anterior.pnumero : p.pnumero));
    }).sort(function (a, c) { return String(a.data).localeCompare(String(c.data)) || numero(a.odometro)-numero(c.odometro); });
    var ultimo = eventos[eventos.length-1];
    var ativo = ultimo && ultimo.tipo !== 'Retirada' && ultimo.tipo !== 'Descarte';
    if (anterior && chave(anterior.pnumero) !== chave(p.pnumero) && eventos.length) {
      return {erro:'Este pneu já tem histórico em Pneus por KM. Mantenha seu número para preservar os vínculos.'};
    }
    var mudou = anterior && (anterior.pstatus !== p.pstatus || placa(anterior.pveiculo) !== placa(p.pveiculo) || anterior.pposicao !== p.pposicao);
    if (!uso && !ativo) return {eventos:[]};
    var dt = p.pdatainstalacao, odo = numero(uso ? p.pkminstalacao : p.pkmatual);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dt || '') || !Number.isFinite(Date.parse(dt+'T12:00:00'))) {
      return {erro:'Informe a data da instalação ou movimentação do pneu.'};
    }
    if (uso) {
      var v = (b.veiculos || []).find(function (x) { return placa(x.vplaca) === placa(p.pveiculo); });
      if (!v || String(v.vstatus || '').toUpperCase() === 'VENDIDO') return {erro:'Selecione um veículo ativo cadastrado para o pneu Em Uso.'};
      p.pveiculo = v.vplaca;
      var faltam = [];
      if (numero(p.pvalor) <= 0) faltam.push('Valor Compra');
      if (numero(p.pvida) <= 0) faltam.push('Vida Útil KM');
      if (odo <= 0) faltam.push('KM Instalação');
      if (faltam.length) return {erro:'Para o pneu Em Uso, preencha com valor maior que zero: ' + faltam.join(', ') + '.'};
    } else if (odo <= 0) return {erro:'Informe o KM Atual para registrar a retirada do pneu.'};
    var instalacao = eventos.slice().reverse().find(function (e) { return e.tipo === 'Instalação' || e.tipo === 'Recapagem'; });
    var mesma = ativo && uso && !mudou && placa(ultimo.veiculo) === placa(p.pveiculo);
    if (mesma && instalacao && instalacao.origem !== 'cadastro_pneus') {
      if (numero(instalacao.valor) !== numero(p.pvalor) || numero(instalacao.vidaUtilKm) !== numero(p.pvida) || numero(instalacao.odometro) !== odo || instalacao.data !== dt) {
        return {erro:'Este pneu já possui uma instalação manual. Confira os dados em Pneus por KM antes de alterar seu ciclo.'};
      }
      return {eventos:[]};
    }
    if (ultimo && !mesma && dt < ultimo.data) return {erro:'A data da movimentação não pode ser anterior ao último evento em Pneus por KM.'};
    if (ultimo && !mesma && dt === ultimo.data) return {erro:'Informe uma data posterior ao último evento para preservar a ordem das movimentações.'};
    if (ativo && uso && (!anterior || anterior.pstatus !== 'Em Uso') && !mesma) return {erro:'Este pneu já possui um ciclo ativo em Pneus por KM. Registre a retirada antes de reinstalar.'};
    var tipo = uso ? (ativo && mudou ? 'Rodízio' : 'Instalação') : (p.pstatus === 'Descartado' ? 'Descarte' : 'Retirada');
    var anteriorEvento = mesma ? (ultimo.tipo === 'Rodízio' ? ultimo : instalacao) : null;
    if (anteriorEvento && anteriorEvento.origem !== 'cadastro_pneus') return {erro:'Altere esta movimentação manual na aba Pneus por KM para preservar seu histórico.'};
    var e = Object.assign({}, anteriorEvento || {}, {
      id:anteriorEvento ? anteriorEvento.id : 'pneu-auto-'+p.pid+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7),
      pneuId:chave(p.pnumero), cadastroPneuId:p.pid, origem:'cadastro_pneus', tipo:anteriorEvento ? anteriorEvento.tipo : tipo,
      data:dt, veiculo:uso ? p.pveiculo : ultimo.veiculo, posicao:p.pposicao || '', odometro:odo,
      valor:tipo === 'Instalação' ? Math.round(numero(p.pvalor)*100)/100 : 0,
      vidaUtilKm:numero(p.pvida), kmRodado:0, observacao:p.pobs || '', atualizadoEm:new Date().toISOString()
    });
    if (e.tipo === 'Rodízio') {
      // O odômetro de origem e o de destino são independentes numa transferência.
      e.odometroOrigem = mesma ? numero(anteriorEvento.odometroOrigem) : numero(p.pkmatual);
      if (placa(ultimo.veiculo) !== placa(p.pveiculo) && e.odometroOrigem <= 0) return {erro:'Informe o KM Atual do veículo de origem e o KM Instalação do destino antes de transferir o pneu.'};
      e.valor = 0;
    }
    if (mesma && instalacao && instalacao.id !== e.id && (numero(instalacao.valor) !== numero(p.pvalor) || numero(instalacao.vidaUtilKm) !== numero(p.pvida))) {
      return {erro:'Após um rodízio, altere valor e vida útil no evento original de Pneus por KM.'};
    }
    if (mesma && eventos.some(function (x) { return x.id !== e.id && ((x.data > anteriorEvento.data && x.data <= dt) || (x.data < anteriorEvento.data && x.data >= dt)); })) return {erro:'A data da instalação deve preservar a ordem dos eventos do pneu.'};
    if (!mesma && placa(e.veiculo) === placa(ultimo && ultimo.veiculo) && ultimo && odo < numero(ultimo.odometro)) return {erro:'O odômetro da movimentação não pode ser menor que o último odômetro registrado.'};
    return {eventos:[e]};
  }
  function aplicar(plano) {
    var b = banco();
    if (!b || !plano || plano.erro || !plano.eventos.length) return false;
    if (!Array.isArray(b.eventosPneus)) b.eventosPneus = [];
    plano.eventos.forEach(function (e) {
      var i = b.eventosPneus.findIndex(function (x) { return x.id === e.id; });
      if (typeof window.fmPrepararRegistro === 'function') window.fmPrepararRegistro('eventosPneus', e, i >= 0 ? b.eventosPneus[i] : null);
      if (i < 0) b.eventosPneus.push(e); else b.eventosPneus[i] = e;
    });
    return true;
  }
  // Saída de pneu individualizado: vínculo exclusivamente pela entrada epneuid.
  function resolverItemEstoque(item) {
    var b = banco(), ids = [];
    ((b && b.estoque) || []).forEach(function (m) {
      if (m && m.etipo === 'Entrada' && m.epneuid && chave(m.eitem) === chave(item) && ids.indexOf(m.epneuid) < 0) ids.push(m.epneuid);
    });
    if (!ids.length) return {};
    if (ids.length !== 1) return {erro:'Este item tem mais de um pneu vinculado. Faça a instalação pelo cadastro de Pneus para identificar o pneu correto.'};
    var p = (b.pneus || []).find(function (x) { return x.pid === ids[0]; });
    return p ? {pneu:p} : {erro:'O cadastro vinculado a esta entrada não foi encontrado. Confira o módulo Pneus antes de dar saída.'};
  }
  function atualizarSaidaForm() {
    var item = document.getElementById('sitem');
    if (!item) return;
    var box = document.getElementById('estoquePneuInstalacao');
    if (!box) {
      box = document.createElement('div');
      box.id = 'estoquePneuInstalacao'; box.className = 'col-12';
      box.innerHTML = '<div class="border rounded p-3 my-2"><b>Instalação do pneu no veículo</b><p class="small text-muted mb-2" id="estoquePneuAviso"></p><div class="row g-2">' +
        '<div class="col-md-3"><label for="spneuPosicao">Posição</label><select id="spneuPosicao" class="form-select"></select></div>' +
        '<div class="col-md-3"><label for="spneuKm">KM instalação</label><input id="spneuKm" class="form-control" inputmode="decimal"></div>' +
        '<div class="col-md-3"><label for="spneuVida">Vida útil (KM)</label><input id="spneuVida" class="form-control" inputmode="decimal"></div>' +
        '<div class="col-md-3"><label for="spneuValor">Valor de compra (R$)</label><input id="spneuValor" class="form-control" inputmode="decimal"></div></div></div>';
      (item.closest('.row') || item.parentElement).appendChild(box);
      var pos = document.getElementById('pposicao');
      var sel = document.getElementById('spneuPosicao');
      sel.add(new Option('Selecione...', ''));
      if (pos) Array.prototype.forEach.call(pos.options, function (o) { if (o.value) sel.add(new Option(o.text, o.value)); });
    }
    var r = resolverItemEstoque(item.value), p = r.pneu;
    box.hidden = !p && !r.erro;
    document.getElementById('estoquePneuAviso').textContent = r.erro || (p ? 'Pneu ' + p.pnumero + ': uma unidade. Informe data da saída, placa e dados da instalação. O cadastro, os históricos e Pneus por KM serão atualizados após confirmação.' : '');
    if (box.dataset.item !== item.value) {
      box.dataset.item = item.value;
      document.getElementById('spneuPosicao').value = '';
      document.getElementById('spneuKm').value = '';
      document.getElementById('spneuVida').value = p ? p.pvida || '' : '';
      document.getElementById('spneuValor').value = p ? p.pvalor || '' : '';
    }
  }
  function prepararSaidaEstoque(m, anterior) {
    if (typeof window.fmModuloCarregado === 'function' && ['estoque','pneus'].some(function (mod) { return !window.fmModuloCarregado(mod); })) return {erro:'Aguarde o carregamento de Estoque e Pneus antes de registrar a saída.'};
    var b = banco(), r = resolverItemEstoque(m.eitem);
    if (r.erro) return r;
    if (anterior && anterior.epneuid) return {erro:'Esta saída está vinculada ao histórico de um pneu. Registre novas movimentações pelo módulo Pneus; não altere a saída já integrada.'};
    if (!r.pneu) return {};
    if (anterior) return {erro:'Para instalar um pneu individualizado, registre uma nova saída. Não converta uma saída antiga.'};
    if (typeof window.fmModuloCarregado === 'function' && ['pneus','eventosPneus','estoque','veiculos','manutencoes'].some(function (mod) { return !window.fmModuloCarregado(mod); })) return {erro:'Aguarde o carregamento de Pneus, Estoque, veículos e históricos.'};
    var p = r.pneu;
    var dataInformada = (document.getElementById('sdata') || {}).value || '';
    var dataTeste = new Date(dataInformada + 'T12:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataInformada) || !Number.isFinite(dataTeste.getTime()) || dataTeste.toISOString().slice(0, 10) !== dataInformada) return {erro:'Informe uma data válida para a saída e instalação do pneu.'};
    m.edata = dataInformada;
    if (numero(m.equantidade) !== 1) return {erro:'Pneu individualizado permite saída de exatamente uma unidade.'};
    if (p.pstatus !== 'Estoque') return {erro:'Este pneu não está com status Estoque. Confira o cadastro antes de instalar.'};
    var saldo = (b.estoque || []).reduce(function (s, x) { return x.epneuid === p.pid ? s + (x.etipo === 'Saída' ? -1 : 1) * numero(x.equantidade) : s; }, 0);
    if (saldo !== 1) return {erro:'O saldo vinculado deste pneu deve ser uma unidade. Confira as movimentações no módulo Pneus.'};
    function valor(id) { return (document.getElementById(id) || {}).value || ''; }
    var novo = Object.assign({}, p, {pstatus:'Em Uso', pveiculo:m.eplaca, pdatainstalacao:m.edata,
      pposicao:valor('spneuPosicao'), pkminstalacao:valor('spneuKm'), pkmatual:valor('spneuKm'),
      pkmrodado:0, pvida:valor('spneuVida'), pvalor:valor('spneuValor')});
    if (!novo.pposicao) return {erro:'Informe a posição de instalação do pneu.'};
    if (p.pdata && m.edata < p.pdata) return {erro:'A data da instalação não pode ser anterior à compra do pneu.'};
    var plano = preparar(novo, p);
    if (plano.erro) return plano;
    m.epneuid = p.pid;
    m.epneukm = numero(novo.pkminstalacao);
    m.eplaca = novo.pveiculo;
    m.evalorunitario = Math.round(numero(novo.pvalor) * 100) / 100;
    m.etotal = m.evalorunitario;
    return {pneu:novo, anterior:p, eventos:plano.eventos};
  }
  function aplicarSaidaEstoque(plano, mov) {
    if (!plano || !plano.pneu || plano.erro) return false;
    var b = banco(), p = plano.pneu, i = b.pneus.indexOf(plano.anterior);
    if (i < 0) return false;
    p.phist = (plano.anterior.phist || []).slice();
    var texto = 'Saída pelo Estoque para ' + p.pveiculo + ', posição ' + p.pposicao + ', KM ' + p.pkminstalacao;
    ['Saída do estoque','Status','Veículo','Instalação'].forEach(function (tipo) {
      p.phist.push({data:mov.edata + 'T12:00:00', tipo:tipo, texto:tipo === 'Status' ? 'De Estoque para Em Uso' : texto, estoqueId:mov.eid});
    });
    if (typeof window.fmPrepararRegistro === 'function') window.fmPrepararRegistro('pneus', p, plano.anterior);
    b.pneus[i] = p;
    aplicar(plano);
    return true;
  }
  window.FMPneusFrota = {preparar:preparar, aplicar:aplicar, resolverItemEstoque:resolverItemEstoque,
    atualizarSaidaForm:atualizarSaidaForm, prepararSaidaEstoque:prepararSaidaEstoque, aplicarSaidaEstoque:aplicarSaidaEstoque};
})();