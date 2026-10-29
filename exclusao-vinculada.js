/* Exclusão explícita por IDs de origem; nunca por placa, data ou valor. */
(function () {
  'use strict';
  var nomes = {combustivel:'Combustível', manutencoes:'Manutenções', multas:'Multas', licenciamento:'Licenciamento', tacografo:'Tacógrafo', licencas:'CIV / CIPP', diarias:'Diárias', revisoes:'Revisões KM', estoque:'Estoque', pneus:'Pneus', eventosPneus:'Pneus por KM', preLancamentos:'Pré-lançamentos', custos:'Gestão da Frota — Lançamentos', custosRecorrentes:'Fixos e pessoal'};
  var integrados = ['combustivel','manutencoes','multas','licenciamento','tacografo','licencas','diarias','revisoes'];
  var ocupado = false;
  var exclusoes = {};
  try { exclusoes = JSON.parse(localStorage.getItem('FM_EXCLUSOES_VINCULADAS') || '{}') || {}; } catch (e) {}
  function identidade(r) {
    var campos = ['_rid','id','_id','_fid','uid','_origemUid','eid','pid'];
    for (var i = 0; i < campos.length; i++) if (r[campos[i]] !== undefined && r[campos[i]] !== null && r[campos[i]] !== '') return campos[i] + ':' + String(r[campos[i]]);
    return null;
  }
  window.fmFiltrarRegistrosExcluidos = function (mod, registros) {
    var removidos = exclusoes[mod] || [];
    return registros.filter(function (r) { var chave = identidade(r); return !chave || removidos.indexOf(chave) < 0; });
  };
  function registrarExclusoes(nos) {
    var proximo = JSON.parse(JSON.stringify(exclusoes));
    nos.forEach(function (n) {
      var chave = identidade(n.registro), removidos = proximo[n.mod] || (proximo[n.mod] = []);
      if (chave && removidos.indexOf(chave) < 0) removidos.push(chave);
    });
    // Se o dispositivo não puder guardar a proteção, nenhuma exclusão começa.
    localStorage.setItem('FM_EXCLUSOES_VINCULADAS', JSON.stringify(proximo));
    exclusoes = proximo;
  }
  function lista(mod) { return typeof db !== 'undefined' && Array.isArray(db[mod]) ? db[mod] : []; }
  function ids(x) { return ['id','_id','_rid','_fid','uid','_origemUid'].map(function (k) { return x[k]; }).filter(function (v) { return v !== undefined && v !== null && v !== ''; }).map(String); }
  function nome(mod) { return nomes[mod] || mod; }
  function destinos(mod) {
    var r = integrados.indexOf(mod) >= 0 ? ['preLancamentos','custos'] : [];
    if (mod === 'estoque') r = r.concat(['manutencoes','preLancamentos','custos']);
    if (mod === 'pneus') r = r.concat(['estoque','eventosPneus','manutencoes','preLancamentos','custos']);
    if (mod === 'preLancamentos') r.push('custos');
    return r;
  }
  function ligado(mod, x, destino, y) {
    var chaves = ids(x).map(function (id) { return mod + ':' + id; });
    if ((destino === 'preLancamentos' || destino === 'custos') &&
        (chaves.indexOf(y.origemChave) >= 0 || (y.origemModulo === mod && ids(x).indexOf(String(y.origemRegistroId)) >= 0))) return true;
    if (mod === 'preLancamentos' && destino === 'custos') return !!x.origemChave && x.origemChave === y.origemChave;
    if (mod === 'estoque' && destino === 'manutencoes') return !!x.eid && y.morigem === 'estoque' && y.mestoqueid === x.eid;
    if (mod === 'pneus' && destino === 'estoque') return !!x.pid && y.epneuid === x.pid;
    if (mod === 'pneus' && destino === 'eventosPneus') return !!x.pid && y.origem === 'cadastro_pneus' && y.cadastroPneuId === x.pid;
    return false;
  }
  function plano(mod, registro) {
    var nos = [{mod:mod, registro:registro}], arestas = [];
    for (var n = 0; n < nos.length; n++) {
      var pai = nos[n];
      destinos(pai.mod).forEach(function (destino) {
        lista(destino).forEach(function (r) {
          if (!ligado(pai.mod, pai.registro, destino, r)) return;
          var filho = nos.find(function (v) { return v.mod === destino && v.registro === r; });
          if (!filho) { filho = {mod:destino, registro:r}; nos.push(filho); }
          arestas.push({pai:pai, filho:filho});
        });
      });
    }
    return {nos:nos, arestas:arestas};
  }
  function resumo(x) {
    return [x.descricao || x.mservico || x.eitem || x.pnumero || x.ctipo || '', x.data || x.mdata || x.edata || x.cdata || '', ids(x)[0] || x.eid || x.pid || ''].filter(Boolean).join(' • ');
  }
  function botao(texto, classe, acao) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'btn ' + classe; b.textContent = texto; b.addEventListener('click', acao); return b;
  }
  function escolher(p) {
    return new Promise(function (resolve) {
      var anterior = document.activeElement, dialog = document.createElement('dialog');
      dialog.setAttribute('aria-labelledby','fmExcluirTitulo');
      dialog.style.cssText = 'width:min(640px,94vw);max-height:90vh;overflow:auto;border:1px solid #cbd5e1;border-radius:14px;padding:24px;background:#fff;color:#0f172a;box-shadow:0 24px 80px #0006';
      var titulo = document.createElement('h4'); titulo.id = 'fmExcluirTitulo'; titulo.textContent = 'Excluir registro e vínculos'; dialog.appendChild(titulo);
      var aviso = document.createElement('p'); aviso.textContent = 'A origem será excluída: ' + nome(p.nos[0].mod) + '. Marque os outros módulos que também deseja excluir. Somente vínculos identificados serão atingidos.'; dialog.appendChild(aviso);
      var detalhe = document.createElement('p'); detalhe.className = 'small text-muted'; detalhe.textContent = resumo(p.nos[0].registro); dialog.appendChild(detalhe);
      var grupos = {}, checks = [];
      p.nos.slice(1).forEach(function (n) { (grupos[n.mod] || (grupos[n.mod] = [])).push(n); });
      Object.keys(grupos).forEach(function (mod) {
        var label = document.createElement('label'); label.style.cssText = 'display:block;padding:10px;border:1px solid #cbd5e1;border-radius:8px;margin:8px 0';
        var c = document.createElement('input'); c.type = 'checkbox'; c.dataset.mod = mod; c.className = 'form-check-input me-2'; checks.push(c); label.appendChild(c);
        label.appendChild(document.createTextNode(nome(mod) + ' — ' + grupos[mod].length + ' registro(s)'));
        var ul = document.createElement('ul'); ul.className = 'small mb-0 mt-2';
        grupos[mod].forEach(function (n) { var li = document.createElement('li'); li.textContent = resumo(n.registro) || 'Registro vinculado'; ul.appendChild(li); });
        label.appendChild(ul); dialog.appendChild(label);
      });
      var nota = document.createElement('p'); nota.className = 'small'; nota.textContent = 'Módulos desmarcados mantêm seus registros salvos. Relatórios e cálculos sem registro próprio refletem os dados restantes e não podem ser preservados separadamente. Dados antigos sem ID de vínculo não serão apagados em cascata.'; dialog.appendChild(nota);
      var acoes = document.createElement('div'); acoes.className = 'd-flex flex-wrap gap-2 mt-3';
      function fechar(valor) { dialog.close(); dialog.remove(); if (anterior && anterior.isConnected) anterior.focus(); resolve(valor); }
      acoes.appendChild(botao('Somente origem','btn-outline-secondary',function () { checks.forEach(function (c) { c.checked = false; }); }));
      if (checks.length) acoes.appendChild(botao('Todos os vinculados','btn-outline-primary',function () { checks.forEach(function (c) { c.checked = true; }); }));
      acoes.appendChild(botao('Cancelar','btn-secondary',function () { fechar(null); }));
      acoes.appendChild(botao('Revisar e excluir','btn-danger',function () {
        var mods = checks.filter(function (c) { return c.checked; }).map(function (c) { return c.dataset.mod; });
        var selecionados = p.nos.filter(function (n, i) { return i === 0 || mods.indexOf(n.mod) >= 0; });
        var contagem = {}; selecionados.forEach(function (n) { contagem[n.mod] = (contagem[n.mod] || 0) + 1; });
        var mensagem = Object.keys(contagem).map(function (m) { return nome(m) + ': ' + contagem[m]; }).join('\n');
        if (window.confirm('Confirmar exclusão definitiva?\n\n' + mensagem + '\n\nEsta ação não pode ser desfeita.')) fechar(selecionados);
      }));
      dialog.appendChild(acoes); dialog.addEventListener('cancel',function (e) { e.preventDefault(); fechar(null); }); document.body.appendChild(dialog); dialog.showModal();
    });
  }
  function prontos(mods) {
    return typeof window.fmModuloCarregado !== 'function' || mods.every(function (m) { return window.fmModuloCarregado(m); });
  }
  function alcance(mod) {
    var mods = [mod];
    for (var i = 0; i < mods.length; i++) destinos(mods[i]).forEach(function (m) { if (mods.indexOf(m) < 0) mods.push(m); });
    return mods;
  }
  function assinatura(p) { return JSON.stringify(p.nos.map(function (n) { return [n.mod,n.registro]; })); }
  function atualizar(mods) {
    mods.forEach(function (m) {
      if (typeof PAGINACAO !== 'undefined' && PAGINACAO.paginas) {
        var paginas = Math.max(1,Math.ceil(lista(m).length / (PAGINACAO.itensPorPagina || 15)));
        PAGINACAO.paginas[m] = Math.min(PAGINACAO.paginas[m] || 1,paginas);
        try { localStorage.setItem('pagina_' + m,PAGINACAO.paginas[m]); } catch (e) {}
      }
      try { if (typeof renderModulo === 'function' && m !== 'preLancamentos' && m !== 'custos') renderModulo(m); } catch (e) { console.error(e); }
    });
    ['renderDashboard','atualizarDashboardMotoristas','renderCustosFrota','renderResultadoFrota'].forEach(function (f) {
      try { if (typeof window[f] === 'function') window[f](); } catch (e) { console.error(e); }
    });
    window.dispatchEvent(new CustomEvent('fm:registros-excluidos',{detail:{modulos:mods}}));
  }
  window.fmExcluirVinculado = async function (mod, indice) {
    if (ocupado) return false;
    if (window.fmConfirmacaoPreEmAndamento) { alert('Aguarde a confirmação dos pré-lançamentos antes de excluir.'); return false; }
    var registro = lista(mod)[Number(indice)];
    if (!registro) return false;
    var mods = alcance(mod);
    if (mod === 'manutencoes' && registro.morigem === 'estoque' && mods.indexOf('estoque') < 0) mods.push('estoque');
    if (((mod === 'estoque' && registro.epneuid) || (mod === 'eventosPneus' && registro.origem === 'cadastro_pneus' && registro.cadastroPneuId)) && mods.indexOf('pneus') < 0) mods.push('pneus');
    if (!prontos(mods)) { alert('Aguarde o carregamento dos módulos vinculados antes de excluir: ' + mods.map(nome).join(', ') + '.'); return false; }
    ocupado = true;
    try {
      var p = plano(mod,registro), antes = assinatura(p), selecionados = await escolher(p);
      if (!selecionados) return false;
      if (window.fmConfirmacaoPreEmAndamento || !prontos(mods) || p.nos.some(function (n) { return lista(n.mod).indexOf(n.registro) < 0; }) || assinatura(plano(mod,registro)) !== antes) {
        alert('Os dados mudaram durante a conferência. Nada foi excluído. Abra a exclusão novamente.'); return false;
      }
      registrarExclusoes(selecionados);
      var alterados = [];
      function marcar(m) { if (alterados.indexOf(m) < 0) alterados.push(m); }
      p.arestas.forEach(function (a) {
        if (selecionados.indexOf(a.pai) >= 0 && selecionados.indexOf(a.filho) < 0 &&
            (a.filho.mod === 'manutencoes' || a.filho.mod === 'preLancamentos')) {
          a.filho.registro.fmOrigemExcluida = true;
          marcar(a.filho.mod);
        }
      });
      // Impede que uma prévia excluída reapareça a partir de uma origem mantida.
      selecionados.forEach(function (n) {
        if (n.mod !== 'preLancamentos') return;
        var origem = n.registro.origemModulo;
        if (integrados.indexOf(origem) < 0) return;
        lista(origem).forEach(function (r) {
          if (ligado(origem,r,'preLancamentos',n.registro) && !selecionados.some(function (v) { return v.mod === origem && v.registro === r; })) {
            r.fmPreLancamentoExcluido = true; marcar(origem);
          }
        });
      });
      // Uma manutenção apagada não pode ser recriada pela saída mantida.
      selecionados.forEach(function (n) {
        if (n.mod !== 'manutencoes' || n.registro.morigem !== 'estoque' || !n.registro.mestoqueid) return;
        lista('estoque').forEach(function (m) {
          if (m.eid === n.registro.mestoqueid && !selecionados.some(function (v) { return v.mod === 'estoque' && v.registro === m; })) {
            m.fmManutencaoExcluida = true; marcar('estoque');
          }
        });
      });
      selecionados.forEach(function (n) {
        var l = lista(n.mod), i = l.indexOf(n.registro);
        if (i >= 0) { l.splice(i,1); marcar(n.mod); }
      });
      // Excluir um vínculo não autoriza os reparos automáticos a recriá-lo.
      selecionados.forEach(function (n) {
        var pid = n.mod === 'estoque' ? n.registro.epneuid : n.mod === 'eventosPneus' && n.registro.origem === 'cadastro_pneus' ? n.registro.cadastroPneuId : null;
        if (!pid) return;
        lista('pneus').forEach(function (pneu) {
          if (pneu.pid !== pid || selecionados.some(function (v) { return v.mod === 'pneus' && v.registro === pneu; })) return;
          pneu[n.mod === 'estoque' ? 'fmEstoqueExcluido' : 'fmEventosPneusExcluidos'] = true;
          marcar('pneus');
        });
      });
      window.fmPularSincronizacaoPreUmaVez = true;
      var ok = await salvarNuvem(alterados);
      atualizar(alterados);
      if (ok === true) {
        if (typeof statusNuvem === 'function') statusNuvem('Exclusão confirmada no banco nos módulos escolhidos','#198754');
      } else {
        alert('A exclusão foi aplicada neste dispositivo, mas a gravação de todos os módulos ainda não foi confirmada. Confira o aviso de sincronização antes de fechar o sistema.');
      }
      return ok === true;
    } catch (e) {
      console.error('Exclusão vinculada:',e);
      alert('Não foi possível concluir a exclusão. Confira os dados e o status de sincronização antes de tentar novamente.'); return false;
    } finally { ocupado = false; }
  };
})();
