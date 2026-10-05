/* Cópia dos dados no HD do computador (além da nuvem, que continua igual).
   O usuário escolhe a pasta uma única vez; o sistema grava "frota-master-dados.json"
   sempre que os dados mudam, e uma cópia por dia em "frota-master-AAAA-MM-DD.json".
   Usa a API de pastas do Chrome/Edge. Não altera a nuvem nem os dados. */
(function () {
  'use strict';
  if (!window.showDirectoryPicker || !window.indexedDB) return;
  var pasta = null, ultimo = '', gravando = false;

  function idb(modo, fn) {
    return new Promise(function (ok, erro) {
      var r = indexedDB.open('fm-pasta-hd', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('h'); };
      r.onerror = function () { erro(r.error); };
      r.onsuccess = function () {
        var tx = r.result.transaction('h', modo), st = tx.objectStore('h'), q = fn(st);
        tx.oncomplete = function () { ok(q && q.result); };
        tx.onerror = function () { erro(tx.error); };
      };
    });
  }
  function banco() { try { if (typeof db !== 'undefined' && db) return db; } catch (e) {} return null; }

  function botao(texto, titulo, cor) {
    var b = document.getElementById('fmPastaHd');
    if (!b) {
      b = document.createElement('button');
      b.id = 'fmPastaHd'; b.type = 'button';
      b.style.cssText = 'border:0;border-radius:8px;padding:6px 12px;font:600 12px system-ui,sans-serif;color:#fff;cursor:pointer';
      b.onclick = clicar;
      var ref = document.querySelector('.dashboard-date');
      if (ref && ref.parentNode) ref.parentNode.insertBefore(b, ref.nextSibling);
      else { b.style.cssText += ';position:fixed;right:14px;bottom:14px;z-index:9999'; document.body.appendChild(b); }
    }
    b.textContent = texto; b.title = titulo || ''; b.style.background = cor;
  }
  function estado() {
    if (!pasta) return botao('💾 Escolher pasta no HD', 'Escolha uma vez a pasta onde os dados serão salvos no computador', '#dc2626');
    pasta.queryPermission({ mode: 'readwrite' }).then(function (p) {
      if (p === 'granted') botao('💾 Salvo no HD: ' + pasta.name, 'Os dados também estão sendo salvos nesta pasta do computador. Clique para trocar a pasta.', '#16a34a');
      else botao('💾 Liberar pasta do HD', 'Clique para permitir que o sistema continue salvando em "' + pasta.name + '"', '#d97706');
    });
  }
  function clicar() {
    if (pasta) {
      pasta.queryPermission({ mode: 'readwrite' }).then(function (p) {
        if (p === 'granted') { if (confirm('Os dados já estão sendo salvos em "' + pasta.name + '". Deseja trocar a pasta?')) escolher(); }
        else pasta.requestPermission({ mode: 'readwrite' }).then(function () { estado(); ultimo = ''; gravar(); });
      });
    } else escolher();
  }
  function escolher() {
    window.showDirectoryPicker({ id: 'frota-master', mode: 'readwrite' }).then(function (h) {
      pasta = h;
      return idb('readwrite', function (st) { return st.put(h, 'pasta'); });
    }).then(function () { estado(); ultimo = ''; gravar(); alert('Pronto. Os dados do sistema também serão salvos nesta pasta do computador.'); })
      .catch(function () {});
  }
  function escrever(nome, texto) {
    return pasta.getFileHandle(nome, { create: true }).then(function (f) { return f.createWritable(); })
      .then(function (w) { return w.write(texto).then(function () { return w.close(); }); });
  }
  function gravar() {
    var d = banco(); if (!pasta || !d || gravando) return;
    var texto; try { texto = JSON.stringify(d); } catch (e) { return; }
    if (!texto || texto === '{}' || texto === ultimo) return;
    pasta.queryPermission({ mode: 'readwrite' }).then(function (p) {
      if (p !== 'granted') { estado(); return; }
      gravando = true;
      var hoje = new Date(), dia = hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0') + '-' + String(hoje.getDate()).padStart(2, '0');
      var conteudo = JSON.stringify({ sistema: 'Frota Master', salvoEm: hoje.toISOString(), dados: d }, null, 1);
      return escrever('frota-master-dados.json', conteudo).then(function () { return escrever('frota-master-' + dia + '.json', conteudo); })
        .then(function () { ultimo = texto; }).catch(function (e) { console.warn('Salvar no HD', e); estado(); })
        .then(function () { gravando = false; });
    });
  }

  function iniciar() {
    idb('readonly', function (st) { return st.get('pasta'); }).then(function (h) { pasta = h || null; estado(); }).catch(function () { estado(); });
    setInterval(gravar, 10000);
    window.addEventListener('beforeunload', gravar);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
