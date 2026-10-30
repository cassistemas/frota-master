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
  function ids(x) { return ['id','_id','_rid','_fid','uid','_origemUid','eid','pid'].map(function (k) { return x[k]; }).filter(function (v) { return v !== undefined && v !== null && v !== ''; }).map(String); }
  function mesmoId(a, b) { return a !== undefined && a !== null && a !== '' && b !== undefined && b !== null && b !== '' && String(a) === String(b); }
  function origemEstoque(x, eid) {
    if (!eid) return false;
    var digital = String(x.digitalOrigem || ''), sufixo = '|est:' + String(eid);
    return x.origemModulo === 'manutencoes' && digital.slice(-sufixo.length) === sufixo;
  }
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
    if (mod === 'estoque' && (destino === 'preLancamentos' || destino === 'custos') && origemEstoque(y, x.eid)) return true;
    if (mod === 'manutencoes' && x.morigem === 'estoque' && (destino === 'preLancamentos' || destino === 'custos') && origemEstoque(y, x.mestoqueid)) return true;
    if (mod === 'preLancamentos' && destino === 'custos') return (!!x.origemChave && x.origemChave === y.origemChave) ||
      (!!x.origemModulo && x.origemModulo === y.origemModulo && mesmoId(x.origemRegistroId, y.origemRegistroId)) ||
      (String(x.digitalOrigem || '').indexOf('|est:') >= 0 && x.digitalOrigem === y.digitalOrigem);
    if (mod === 'estoque' && destino === 'manutencoes') return y.morigem === 'estoque' && mesmoId(x.eid, y.mestoqueid);
    if (mod === 'pneus' && destino === 'estoque') return mesmoId(x.pid, y.epneuid);
    if (mod === 'pneus' && destino === 'manutencoes') return y.morigem === 'estoque' && mesmoId(x.pid, y.mpneuid);
    if (mod === 'pneus' && destino === 'eventosPneus') return y.origem === 'cadastro_pneus' && mesmoId(x.pid, y.cadastroPneuId);
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
      var titulo = document.createElement('h4'); titulo.id = 'fmExcluirTitulo'; titulo.textContent = 'Excluir origem e todos os vínculos'; dialog.appendChild(titulo);
      var aviso = document.createElement('p'); aviso.textContent = 'Ao excluir a origem em ' + nome(p.nos[0].mod) + ', todos os registros vinculados abaixo também serão excluídos, incluindo pré-lançamentos e lançamentos financeiros confirmados. Não é necessário selecionar módulos.'; dialog.appendChild(aviso);
      var detalhe = document.createElement('p'); detalhe.className = 'small text-muted'; detalhe.textContent = resumo(p.nos[0].registro); dialog.appendChild(detalhe);
      var grupos = {};
      p.nos.forEach(function (n) { (grupos[n.mod] || (grupos[n.mod] = [])).push(n); });
      Object.keys(grupos).forEach(function (mod) {
        var bloco = document.createElement('div'); bloco.style.cssText = 'padding:10px;border:1px solid #cbd5e1;border-radius:8px;margin:8px 0';
        var rotulo = document.createElement('strong'); rotulo.textContent = nome(mod) + ' — ' + grupos[mod].length + ' registro(s)'; bloco.appendChild(rotulo);
        var ul = document.createElement('ul'); ul.className = 'small mb-0 mt-2';
        grupos[mod].forEach(function (n) { var li = document.createElement('li'); li.textContent = resumo(n.registro) || 'Registro vinculado'; ul.appendChild(li); });
        bloco.appendChild(ul); dialog.appendChild(bloco);
      });
      var nota = document.createElement('p'); nota.className = 'small'; nota.textContent = 'Relatórios e totais serão recalculados com os dados restantes. Somente vínculos identificados pela origem serão excluídos; registros antigos sem vínculo comprovado não serão apagados por coincidência de placa, data ou valor.'; dialog.appendChild(nota);
      var acoes = document.createElement('div'); acoes.className = 'd-flex flex-wrap gap-2 mt-3';
      function fechar(valor) { dialog.close(); dialog.remove(); if (anterior && anterior.isConnected) anterior.focus(); resolve(valor); }
      acoes.appendChild(botao('Cancelar','btn-secondary',function () { fechar(null); }));
      acoes.appendChild(botao('Excluir origem e todos os vínculos','btn-danger',function () {
        var contagem = {}; p.nos.forEach(function (n) { contagem[n.mod] = (contagem[n.mod] || 0) + 1; });
        var mensagem = Object.keys(contagem).map(function (m) { return nome(m) + ': ' + contagem[m]; }).join('\n');
        if (window.confirm('Confirmar exclusão definitiva da origem e de todos os vínculos?\n\n' + mensagem + '\n\nEsta ação não pode ser desfeita.')) fechar(p.nos);
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
      // Todos os descendentes são obrigatórios; nunca mantém um custo da origem apagada.
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
        if (typeof statusNuvem === 'function') statusNuvem('Exclusão da origem e de todos os vínculos confirmada no banco','#198754');
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
