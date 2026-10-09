(function (root) {
  'use strict';
  var bases = ['Manutenção preventiva', 'Manutenção corretiva', 'Plano de Manutenção', 'Peças', 'Lubrificantes / Filtros', 'Pneus / Recapagem', 'Lavagem', 'Estacionamento'];
  var modulo = 'tiposManutencao';
  var ocupado = false;
  function banco() { return typeof db !== 'undefined' ? db : root.db; }
  function registros() { var b = banco(); return b && Array.isArray(b[modulo]) ? b[modulo] : []; }
  function chave(v) { return String(v || '').trim().toLocaleLowerCase('pt-BR'); }
  function categoriaBase(nome) { return nome === 'Estacionamento' ? 'Estacionamento em viagem' : bases.indexOf(nome) >= 0 ? nome : 'Manutenção corretiva'; }
  function lista() {
    var itens = registros();
    var nomes = bases.filter(function (nome) { return !itens.some(function (x) { return x.original === nome; }); });
    itens.forEach(function (x) { if (!x.excluido && x.nome && !nomes.some(function (n) { return chave(n) === chave(x.nome); })) nomes.push(x.nome); });
    return nomes;
  }
  function tipo(registro) {
    var x = registro || {};
    if (x.morigem === 'estoque' && x.mpneuid) return 'Pneus / Recapagem';
    if (String(x.mtipo || '').trim()) return x.mtipo;
    var s = String(x.mservico || '').toLowerCase();
    if (/plano de manuten[cç][aã]o/.test(s)) return 'Plano de Manutenção';
    if (/prevent|revis/.test(s)) return 'Manutenção preventiva';
    if (/óleo|oleo|lubr|filtro/.test(s)) return 'Lubrificantes / Filtros';
    if (/peça|peca/.test(s)) return 'Peças';
    return 'Manutenção corretiva';
  }
  function categoria(registro) {
    var t = tipo(registro);
    if (registro && registro.morigem === 'estoque' && registro.mpneuid) return 'Pneus / Recapagem';
    var config = registros().find(function (x) { return x.nome === t || x.original === t || (x.anteriores || []).indexOf(t) >= 0; });
    return config && config.categoria ? config.categoria : categoriaBase(t);
  }
  function localizar(nome) { return registros().find(function (x) { return !x.excluido && x.nome === nome; }); }
  async function alterar(acao, atual, nome) {
    var b = banco();
    if (ocupado) throw new Error('Aguarde o salvamento do tipo.');
    if (!b || typeof root.salvarNuvem !== 'function' || (typeof root.fmModuloCarregado === 'function' && !root.fmModuloCarregado(modulo))) throw new Error('Aguarde o carregamento dos tipos de manutenção e tente novamente.');
    var nomes = lista();
    if (acao !== 'criar' && nomes.indexOf(atual) < 0) throw new Error('Selecione o tipo de manutenção que deseja alterar.');
    nome = String(nome || '').trim();
    if (acao !== 'excluir' && !nome) throw new Error('Informe o nome do tipo de manutenção.');
    if (acao !== 'excluir' && (nomes.some(function (n) { return n !== atual && chave(n) === chave(nome); }) || registros().some(function (x) { return x.nome !== atual && [x.nome, x.original].concat(x.anteriores || []).some(function (n) { return chave(n) === chave(nome); }); }))) throw new Error('Já existe um tipo com esse nome ou no histórico.');
    var anterior = acao === 'criar' ? null : localizar(atual);
    var obj = Object.assign({}, anterior || {}, {
      id: anterior ? anterior.id : acao === 'criar' ? 'tipo-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9) : 'tipo-base-' + bases.indexOf(atual),
      original: anterior ? anterior.original : acao === 'criar' ? '' : atual,
      nome: acao === 'excluir' ? atual : nome,
      categoria: anterior ? anterior.categoria : categoriaBase(atual),
      anteriores: anterior && anterior.anteriores ? anterior.anteriores.slice() : [],
      excluido: acao === 'excluir', atualizadoEm: new Date().toISOString()
    });
    if (acao === 'editar' && obj.anteriores.indexOf(atual) < 0) obj.anteriores.push(atual);
    var itens = registros().slice(), i = itens.findIndex(function (x) { return x.id === obj.id; });
    if (typeof root.fmPrepararRegistro === 'function') obj = root.fmPrepararRegistro(modulo, obj, anterior);
    if (i < 0) itens.push(obj); else itens[i] = obj;
    b[modulo] = itens;
    ocupado = true;
    try { var ok = await root.salvarNuvem([modulo]); preencher(); if (ok === false) throw new Error('A alteração ficou pendente de sincronização. Confira a conexão antes de continuar.'); return ok; }
    finally { ocupado = false; }
  }
  function preencher() {
    if (!root.document) return;
    var b = banco(), ativos = lista();
    ['mtipo', 'filtroManTipo'].forEach(function (id) {
      var el = root.document.getElementById(id);
      if (!el) return;
      var valor = el.value.indexOf('__fm_') === 0 ? el.dataset.tipoAnterior || '' : el.value;
      el.replaceChildren();
      function opcao(nome, value) { var o = root.document.createElement('option'); o.value = value === undefined ? nome : value; o.textContent = nome; el.appendChild(o); }
      opcao(id === 'mtipo' ? 'Tipo de manutenção' : 'Todos os tipos', '');
      var nomes = ativos.slice();
      if (id === 'filtroManTipo' && b && Array.isArray(b.manutencoes)) b.manutencoes.forEach(function (x) { var n = tipo(x); if (nomes.indexOf(n) < 0) nomes.push(n); });
      if (valor && nomes.indexOf(valor) < 0) nomes.push(valor);
      nomes.forEach(function (n) { opcao(n); });
      if (id === 'mtipo') {
        opcao('＋ Criar tipo…', '__fm_criar');
        opcao('✎ Editar tipo selecionado…', '__fm_editar');
        opcao('− Excluir tipo selecionado…', '__fm_excluir');
        if (!el.dataset.tipoGerenciavel) {
          el.dataset.tipoGerenciavel = '1';
          el.addEventListener('focus', function () { el.dataset.tipoAnterior = el.value; });
          el.addEventListener('change', function () {
            if (el.value.indexOf('__fm_') !== 0) { el.dataset.tipoAnterior = el.value; return; }
            var acao = el.value.slice(5), atual = el.dataset.tipoAnterior || '';
            el.value = atual;
            if (acao !== 'criar' && lista().indexOf(atual) < 0) { root.alert('Selecione primeiro o tipo que deseja editar ou excluir.'); return; }
            var nome = '';
            if (acao === 'excluir') { if (!root.confirm('Excluir o tipo “' + atual + '” das opções para novos lançamentos? Os lançamentos e custos existentes serão preservados.')) return; }
            else { nome = root.prompt(acao === 'criar' ? 'Nome do novo tipo de manutenção:' : 'Novo nome do tipo de manutenção:', acao === 'criar' ? '' : atual); if (nome === null) return; }
            alterar(acao, atual, nome).then(function () { el.value = acao === 'excluir' ? '' : String(nome).trim(); el.dataset.tipoAnterior = el.value; preencher(); }).catch(function (e) { root.alert(e.message); preencher(); });
          });
        }
      }
      el.value = valor;
      el.dataset.tipoAnterior = valor;
    });
  }
  root.FMManutencaoTipos = { get opcoes() { return lista(); }, tipo: tipo, categoria: categoria, preencher: preencher, criar: function (n) { return alterar('criar', '', n); }, editar: function (a, n) { return alterar('editar', a, n); }, excluir: function (n) { return alterar('excluir', n, ''); } };
  if (root.document) preencher();
})(typeof window === 'undefined' ? globalThis : window);
