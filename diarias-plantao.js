/* Plantões isolados das diárias de viagem e dos cálculos financeiros. */
(function (root) {
  'use strict';
  var tipos = ['Plantão trabalhado', 'Sobreaviso'];
  var situacoes = ['Pendente', 'Enviadas RH', 'Pago'];
  var campos = ['motorista', 'data', 'tipo', 'ocasiao', 'inicio', 'fim', 'veiculo', 'valor', 'status', 'obs'];
  var pagina = 1, edicao = null, ocupado = false;
  function el(id) { return document.getElementById(id); }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function centavos(v) {
    var texto = String(v == null ? '' : v).trim().replace(/^R\$\s*/, '');
    if (texto.indexOf(',') >= 0) {
      if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,2}$/.test(texto)) return NaN;
      texto = texto.replace(/\./g, '').replace(',', '.');
    } else if (!/^\d+(?:\.\d{1,2})?$/.test(texto)) return NaN;
    var partes = texto.split('.');
    var valor = Number(partes[0]) * 100 + Number(((partes[1] || '') + '00').slice(0, 2));
    return Number.isSafeInteger(valor) ? valor : NaN;
  }
  function dia(data) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data || '')) return -1;
    var d = new Date(data + 'T12:00:00Z');
    return !isNaN(d) && d.toISOString().slice(0, 10) === data ? d.getUTCDay() : -1;
  }
  function erro(r, lista, id) {
    var d = dia(r.data);
    if (!r.motorista) return 'Selecione um motorista cadastrado.';
    if (d < 0) return 'Informe uma data válida.';
    if (tipos.indexOf(r.tipo) < 0) return 'Selecione o tipo de lançamento.';
    if (['Sábado', 'Domingo', 'Feriado'].indexOf(r.ocasiao) < 0) return 'Selecione a ocasião.';
    if ((r.ocasiao === 'Sábado' && d !== 6) || (r.ocasiao === 'Domingo' && d !== 0)) return 'A ocasião não corresponde ao dia da semana. Para feriados, selecione Feriado.';
    if (r.ocasiao === 'Feriado' && !String(r.obs || '').trim()) return 'Informe o nome do feriado nas observações.';
    if (!!r.inicio !== !!r.fim) return 'Preencha os dois horários ou deixe ambos em branco.';
    if (r.inicio && (!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.inicio) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(r.fim) || r.inicio === r.fim)) return 'Informe horários válidos e diferentes.';
    if (!Number.isSafeInteger(r.valorCentavos) || r.valorCentavos < 0) return 'Informe um valor válido, igual ou maior que zero.';
    if (situacoes.indexOf(r.status) < 0) return 'Selecione a situação.';
    if ((lista || []).some(function (x) { return x._rid !== id && nomeCadastro(x.motorista) === nomeCadastro(r.motorista) && x.data === r.data && x.tipo === r.tipo && (x.inicio || '') === r.inicio && (x.fim || '') === r.fim; })) return 'Já existe um lançamento deste motorista, tipo, data e horário.';
    return '';
  }
  function filtrar(lista, f) {
    return lista.filter(function (r) { return (!f.motorista || r.motorista === f.motorista) && (!f.tipo || r.tipo === f.tipo) && (!f.status || r.status === f.status) && (!f.ini || r.data >= f.ini) && (!f.fim || r.data <= f.fim); });
  }
  function total(lista) { return lista.reduce(function (s, r) { return s + (Number(r.valorCentavos) || 0); }, 0); }
  var api = {centavos:centavos, dia:dia, erro:erro, filtrar:filtrar, total:total};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;
  root.FMPlantao = api;
  function lista() { return typeof db !== 'undefined' && Array.isArray(db.plantoes) ? db.plantoes : []; }
  function permitido() { return typeof usuarioLogado !== 'undefined' && usuarioLogado && (usuarioLogado.tipo === 'admin' || (usuarioLogado.permissoes || {}).diarias === true); }
  function pronto() { return typeof root.fmModuloCarregado === 'function' && ['plantoes', 'motoristas', 'veiculos'].every(root.fmModuloCarregado); }
  function moeda(c) { return (c / 100).toLocaleString('pt-BR', {style:'currency', currency:'BRL'}); }
  function nomeCadastro(v) { return String(v == null ? '' : v).trim().replace(/\s+/g, ' ').toLocaleUpperCase('pt-BR'); }
  function opcoes(valores, vazio) { return '<option value="">' + esc(vazio) + '</option>' + valores.map(function (v) { return '<option value="' + esc(v) + '">' + esc(v) + '</option>'; }).join(''); }
  function campo(id, nome, controle, largura) { return '<div class="col-12 col-md-' + (largura || 3) + '"><label class="form-label" for="pa_' + id + '">' + nome + '</label>' + controle + '</div>'; }
  function input(id, tipo, extra) { return '<input id="pa_' + id + '" type="' + tipo + '" class="form-control" ' + (extra || '') + '>'; }
  function select(id, valores, vazio) { return '<select id="pa_' + id + '" class="form-select">' + opcoes(valores, vazio) + '</select>'; }
  function corStatus(status) { return status === 'Pendente' ? 'critico' : status === 'Enviadas RH' ? 'info' : status === 'Pago' ? 'ok' : 'neutro'; }
  function pintarStatus(s) {
    if (!s) return;
    s.className = 'form-select fm-status-rapido fm-status-plantao fm-status-cor-' + corStatus(s.value) + (s.id === 'pa_status' || s.id === 'pa_fStatus' ? ' fm-status-formulario' : ' form-select-sm');
  }
  function statusLista(r) {
    return '<select class="form-select form-select-sm fm-status-rapido fm-status-plantao fm-status-cor-' + corStatus(r.status) + '" data-pa-status="' + esc(r._rid) + '" aria-label="Situação de ' + esc(r.motorista) + ' em ' + esc(dataBR(r.data)) + '"' + (ocupado || !pronto() || !permitido() ? ' disabled' : '') + '>' + situacoes.map(function (s) { return '<option value="' + esc(s) + '"' + (s === r.status ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select>';
  }
  function formatarValor() {
    var s = el('pa_valor'), texto = s.value.trim(), c = centavos(texto);
    if (texto && !isNaN(c)) s.value = moeda(c);
  }
  function montar() {
    var box = el('diPlantaoConteudo');
    if (!box || el('pa_form')) return;
    box.innerHTML = '<p class="text-muted">Registre finais de semana e feriados separadamente das diárias de viagem. Plantão é trabalho realizado; sobreaviso é disponibilidade para acionamento. Estes registros não geram custos financeiros automaticamente.</p>' +
      '<div id="pa_aviso" role="status" class="small mb-3"></div><form id="pa_form" class="glass-container"><h4 id="pa_titulo">Novo Plantão / Sobreaviso</h4><div class="row g-3">' +
      campo('motorista', 'Motorista *', select('motorista', [], 'Selecione o motorista')) +
      campo('data', 'Data *', input('data', 'date')) +
      campo('tipo', 'Tipo *', select('tipo', tipos, 'Selecione o tipo')) +
      campo('ocasiao', 'Ocasião *', select('ocasiao', ['Sábado','Domingo','Feriado'], 'Selecione a ocasião')) +
      campo('inicio', 'Horário inicial (opcional)', input('inicio', 'time')) +
      campo('fim', 'Horário final (opcional)', input('fim', 'time')) +
      campo('veiculo', 'Veículo (opcional)', select('veiculo', [], 'Sem veículo')) +
      campo('valor', 'Valor a pagar (R$) (opcional)', input('valor', 'text', 'inputmode="decimal" placeholder="R$ 0,00"')) +
      campo('status', 'Situação *', select('status', situacoes, 'Selecione a situação')) +
      campo('obs', 'Observações / nome do feriado', '<textarea id="pa_obs" class="form-control" rows="2" maxlength="2000"></textarea>', 9) +
      '<p class="small text-muted mb-0">* Obrigatório. Se o horário final for anterior ao inicial, o término será considerado no dia seguinte. O valor é opcional: em branco, será registrado como R$ 0,00 e poderá ser editado depois. Não há cálculo automático de horas.</p><div class="col-12 d-flex justify-content-end gap-2"><button type="button" class="btn btn-outline-secondary" data-pa="cancelar">Cancelar</button><button id="pa_salvar" class="btn btn-success" type="submit">Salvar lançamento</button></div></div></form>' +
      '<div class="glass-container"><div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3"><h4 class="mb-0">Consultar lançamentos</h4></div><div class="row g-3">' +
      campo('fMotorista', 'Motorista', select('fMotorista', [], 'Todos os motoristas')) +
      campo('fTipo', 'Tipo', select('fTipo', tipos, 'Todos os tipos')) +
      campo('fStatus', 'Situação', select('fStatus', situacoes, 'Todas as situações')) +
      campo('fIni', 'Data inicial', input('fIni', 'date')) + campo('fFim', 'Data final', input('fFim', 'date')) +
      '<div class="col-12 d-flex flex-wrap gap-2"><button type="button" class="btn btn-primary" data-pa="filtrar">Filtrar</button><button type="button" class="btn btn-secondary" data-pa="limpar">Limpar filtros</button><button type="button" class="btn btn-outline-success" data-pa="exportar">📥 Exportar Excel filtrado</button></div></div></div>' +
      '<div id="pa_totais" class="row g-3 mb-3" aria-live="polite"></div><div class="glass-container"><div class="table-responsive"><table class="table align-middle" data-sem-relatorio><thead><tr><th>Motorista</th><th>Data</th><th>Tipo / Ocasião</th><th>Horário</th><th>Veículo</th><th>Valor</th><th>Situação</th><th>Observações</th><th>Ações</th></tr></thead><tbody id="pa_lista"></tbody></table></div><div id="pa_paginas" class="d-flex gap-2 flex-wrap align-items-center"></div></div>';
    el('pa_status').value = 'Pendente';
    el('pa_form').addEventListener('submit', salvar);
    el('pa_valor').addEventListener('blur', formatarValor);
    box.addEventListener('click', acao);
    box.addEventListener('change', function (e) {
      if (e.target.dataset && e.target.dataset.paStatus !== undefined) return alterarStatus(e.target);
      if (e.target.id === 'pa_status' || e.target.id === 'pa_fStatus') pintarStatus(e.target);
      if (/^pa_f[A-Z]/.test(e.target.id)) { pagina = 1; render(); }
      if (e.target.id === 'pa_data' && dia(e.target.value) >= 0) el('pa_ocasiao').value = dia(e.target.value) === 6 ? 'Sábado' : dia(e.target.value) === 0 ? 'Domingo' : 'Feriado';
    });
  }
  function aviso(texto) { if (el('pa_aviso')) el('pa_aviso').textContent = texto; }
  function preencherSelect(id, valores, vazio) {
    var s = el(id), atual = s.value;
    valores = Array.from(new Set(valores.filter(Boolean))).sort(function (a,b) { return a.localeCompare(b, 'pt-BR'); });
    if (atual && valores.indexOf(atual) < 0) valores.push(atual);
    s.innerHTML = opcoes(valores, vazio); s.value = atual;
  }
  function filtros() {
    return {motorista:el('pa_fMotorista').value, tipo:el('pa_fTipo').value, status:el('pa_fStatus').value, ini:el('pa_fIni').value, fim:el('pa_fFim').value};
  }
  function dados() {
    return filtrar(lista(), filtros()).slice().sort(function (a,b) { return String(b.data).localeCompare(String(a.data)) || String(a.motorista).localeCompare(String(b.motorista), 'pt-BR'); });
  }
  function dataBR(v) { return String(v || '').split('-').reverse().join('/'); }
  function render() {
    if (!el('pa_form') || typeof db === 'undefined') return;
    var motoristas = (db.motoristas || []).map(function (r) { return r.motNome; });
    preencherSelect('pa_motorista', motoristas, 'Selecione o motorista');
    preencherSelect('pa_veiculo', (db.veiculos || []).filter(function (r) { return String(r.vstatus || '').toUpperCase() !== 'VENDIDO'; }).map(function (r) { return r.vplaca; }), 'Sem veículo');
    preencherSelect('pa_fMotorista', motoristas.concat(lista().map(function (r) { return r.motorista; })), 'Todos os motoristas');
    var registros = dados(), paginas = Math.max(1, Math.ceil(registros.length / 15));
    pagina = Math.min(Math.max(1, pagina), paginas);
    el('pa_totais').innerHTML = [['Lançamentos',registros.length], ['Pendente',moeda(total(registros.filter(function (r) { return r.status === 'Pendente'; })))], ['Enviadas RH',moeda(total(registros.filter(function (r) { return r.status === 'Enviadas RH'; })))], ['Pago',moeda(total(registros.filter(function (r) { return r.status === 'Pago'; })))], ['Total filtrado',moeda(total(registros))]].map(function (x) { return '<div class="col-12 col-sm-6 col-xl"><div class="stat-card"><h6>' + x[0] + '</h6><h4>' + esc(x[1]) + '</h4></div></div>'; }).join('');
    el('pa_lista').innerHTML = registros.slice((pagina-1)*15, pagina*15).map(function (r) {
      var i = lista().indexOf(r), horario = r.inicio ? r.inicio + ' – ' + r.fim + (r.fim < r.inicio ? ' (+1 dia)' : '') : 'Não informado';
      return '<tr data-modulo="plantoes" data-index="' + i + '">' + [r.motorista,dataBR(r.data),r.tipo + ' / ' + r.ocasiao,horario,r.veiculo || 'Sem veículo',moeda(r.valorCentavos)].map(function (v) { return '<td>' + esc(v) + '</td>'; }).join('') + '<td>' + statusLista(r) + '</td><td>' + esc(r.obs || '—') + '</td><td><div class="d-flex gap-2"><button type="button" class="btn btn-sm btn-outline-primary" data-pa="editar" data-id="' + esc(r._rid) + '" data-i="' + i + '">Editar</button><button type="button" class="btn btn-sm btn-outline-danger" data-pa="excluir" data-id="' + esc(r._rid) + '" data-i="' + i + '">Excluir</button></div></td></tr>';
    }).join('') || '<tr><td colspan="9">' + (pronto() ? 'Nenhum lançamento nos filtros selecionados.' : 'Aguardando carregamento dos dados…') + '</td></tr>';
    el('pa_paginas').innerHTML = '<button type="button" class="btn btn-sm btn-outline-secondary" data-pa="anterior" ' + (pagina === 1 ? 'disabled' : '') + '>Anterior</button><span>Página ' + pagina + ' de ' + paginas + ' · ' + registros.length + ' registro(s)</span><button type="button" class="btn btn-sm btn-outline-secondary" data-pa="proxima" ' + (pagina === paginas ? 'disabled' : '') + '>Próxima</button>';
    el('pa_salvar').disabled = ocupado || !pronto();
    pintarStatus(el('pa_status')); pintarStatus(el('pa_fStatus'));
    el('pa_status').disabled = ocupado;
  }
  async function alterarStatus(s) {
    if (ocupado) { render(); return; }
    if (!permitido()) { render(); aviso('Sua sessão não tem permissão para alterar a situação em Diárias.'); return; }
    if (!pronto()) { render(); aviso('Aguarde o carregamento do banco antes de alterar a situação.'); return; }
    var status = s.value, indice = lista().findIndex(function (r) { return r._rid === s.dataset.paStatus; });
    if (indice < 0) { render(); aviso('O registro mudou. Confira a lista novamente.'); return; }
    if (situacoes.indexOf(status) < 0) { render(); aviso('Selecione uma situação válida.'); return; }
    var anterior = lista()[indice];
    if (anterior.status === status) { render(); return; }
    var atualizado;
    try { atualizado = root.fmPrepararRegistro('plantoes', Object.assign({}, anterior, {status:status}), anterior); }
    catch (err) { console.error('Plantões:', err); render(); aviso('Não foi possível preparar a alteração. Tente novamente.'); return; }
    db.plantoes[indice] = atualizado;
    if (edicao === anterior._rid) el('pa_status').value = status;
    ocupado = true; render(); aviso('Salvando situação no banco…');
    var ok = false;
    try { ok = await salvarNuvem(['plantoes']); }
    catch (err) { console.error('Plantões:', err); }
    finally { ocupado = false; render(); }
    aviso(ok ? 'Situação atualizada e confirmada no banco.' : 'Situação mantida na fila de sincronização. Confira o aviso do banco antes de fechar; não repita a alteração.');
  }
  function cancelar() {
    if (ocupado) return;
    edicao = null; el('pa_form').reset(); el('pa_status').value = 'Pendente'; el('pa_titulo').textContent = 'Novo Plantão / Sobreaviso'; aviso(''); render();
  }
  async function salvar(e) {
    e.preventDefault();
    if (ocupado) return;
    if (!permitido()) { aviso('Sua sessão não tem permissão para salvar em Diárias. Entre novamente ou confira o acesso com o administrador.'); return; }
    if (!pronto()) { aviso('Aguarde o carregamento do banco e dos cadastros antes de salvar.'); return; }
    var r = {};
    campos.forEach(function (k) { r[k] = el('pa_' + k).value.trim(); });
    r.valorCentavos = r.valor === '' ? 0 : centavos(r.valor); delete r.valor;
    var motorista = (db.motoristas || []).find(function (m) { return r.motorista && nomeCadastro(m.motNome) === nomeCadastro(r.motorista); });
    if (motorista) r.motorista = String(motorista.motNome);
    var mensagem = erro(r, lista(), edicao);
    if (!mensagem && !motorista) mensagem = 'Selecione um motorista cadastrado na lista.';
    if (!mensagem && r.veiculo && !(db.veiculos || []).some(function (v) { return v.vplaca === r.veiculo; })) mensagem = 'Selecione um veículo cadastrado ou deixe sem veículo.';
    var indice = edicao ? lista().findIndex(function (x) { return x._rid === edicao; }) : -1;
    if (!mensagem && edicao && indice < 0) mensagem = 'Este registro foi removido. Cancele a edição e confira a lista.';
    if (mensagem) { aviso(mensagem); return; }
    var anterior = indice >= 0 ? lista()[indice] : null;
    r = root.fmPrepararRegistro('plantoes', Object.assign({}, anterior || {}, r), anterior);
    if (indice < 0) db.plantoes.push(r); else db.plantoes[indice] = r;
    ocupado = true; render(); aviso('Salvando no banco…');
    var ok = false;
    try { ok = await salvarNuvem(['plantoes']); }
    catch (err) { console.error('Plantões:', err); }
    ocupado = false; cancelar();
    aviso(ok ? 'Lançamento salvo e confirmado no banco.' : 'Lançamento mantido na fila de sincronização. Confira o aviso do banco antes de fechar; não repita o lançamento.');
  }
  async function acao(e) {
    var b = e.target.closest('[data-pa]');
    if (!b || ocupado || !permitido()) return;
    var a = b.dataset.pa;
    if (a === 'cancelar') return cancelar();
    if (a === 'filtrar') { pagina = 1; render(); return; }
    if (a === 'anterior' || a === 'proxima') { pagina += a === 'anterior' ? -1 : 1; render(); return; }
    if (a === 'limpar') { ['fMotorista','fTipo','fStatus','fIni','fFim'].forEach(function (k) { el('pa_' + k).value = ''; }); pagina = 1; render(); return; }
    if (a === 'exportar') {
      var registros = dados();
      if (!registros.length) { aviso('Nenhum lançamento para exportar com estes filtros.'); return; }
      if (!root.XLSX) { aviso('Exportação indisponível: aguarde o carregamento do Excel.'); return; }
      var linhas = registros.map(function (r) { return {'Motorista':r.motorista,'Data':dataBR(r.data),'Tipo':r.tipo,'Ocasião':r.ocasiao,'Horário inicial':r.inicio,'Horário final':r.fim,'Término no dia seguinte':r.inicio && r.fim < r.inicio ? 'Sim' : 'Não','Veículo':r.veiculo,'Valor (R$)':r.valorCentavos / 100,'Situação':r.status,'Observações':r.obs}; });
      var wb = root.XLSX.utils.book_new(); root.XLSX.utils.book_append_sheet(wb, root.XLSX.utils.json_to_sheet(linhas), 'Plantões e sobreaviso'); root.XLSX.writeFile(wb, 'FrotaMaster_Plantoes.xlsx'); return;
    }
    var r = lista().find(function (x) { return x._rid === b.dataset.id; });
    if (!r) { render(); aviso('O registro mudou. Confira a lista novamente.'); return; }
    if (a === 'editar') {
      edicao = r._rid;
      campos.forEach(function (k) { var s = el('pa_' + k), v = k === 'valor' ? moeda(r.valorCentavos) : r[k] || ''; if (s.tagName === 'SELECT' && v && !Array.from(s.options).some(function (o) { return o.value === v; })) { var opt = document.createElement('option'); opt.value = v; opt.textContent = v; s.appendChild(opt); } s.value = v; });
      pintarStatus(el('pa_status'));
      el('pa_titulo').textContent = 'Editar Plantão / Sobreaviso'; aviso(''); el('pa_form').scrollIntoView({behavior:'smooth', block:'start'});
    }
    if (a === 'excluir' && typeof root.fmExcluirVinculado === 'function') {
      ocupado = true;
      try { await root.fmExcluirVinculado('plantoes', lista().indexOf(r)); }
      finally { ocupado = false; if (edicao === r._rid && lista().indexOf(r) < 0) cancelar(); render(); }
    }
  }
  api.render = render;
  api.aba = function (nome) {
    if (!permitido()) return;
    montar();
    var plantao = nome === 'plantao';
    el('diPlantaoConteudo').hidden = !plantao; el('diViagemConteudo').hidden = plantao;
    [['diAbaViagem',!plantao],['diAbaPlantao',plantao]].forEach(function (x) { el(x[0]).className = 'btn ' + (x[1] ? 'btn-primary' : 'btn-outline-primary'); el(x[0]).setAttribute('aria-pressed', String(x[1])); });
    if (plantao) render();
  };
  root.addEventListener('fm:registros-excluidos', render);
})(typeof window !== 'undefined' ? window : globalThis);
