/* Reordenar módulos (vertical) e abas (horizontal) arrastando com o mouse. Ordem salva no navegador. */
(function () {
  var CONT = [
    { sel: '.sb-nav', item: 'a[data-module]', eixo: 'y', chave: 'ordem_modulos' },
    { sel: '.fm-subabas', item: 'button', eixo: 'x', chave: 'ordem_abas_fm' },
    { sel: '.est-tabs', item: 'button,a', eixo: 'x', chave: 'ordem_abas_est' },
    { sel: '.cus-tabs', item: 'button,a', eixo: 'x', chave: 'ordem_abas_cus' }
  ];
  var st = document.createElement('style');
  st.textContent = '.oa-drag{opacity:.4}.oa-alvo-y{box-shadow:inset 0 3px 0 #0d6efd}.oa-alvo-x{box-shadow:inset 3px 0 0 #0d6efd}.oa-item{cursor:grab;-webkit-user-drag:none}.oa-item *{-webkit-user-drag:none}.oa-drag{outline:2px dashed #0d6efd}';
  document.head.appendChild(st);

  function key(el) {
    if (el.matches('.sb-label')) return 'L:' + el.textContent.trim();
    return el.getAttribute('data-module') || el.getAttribute('data-aba') || el.getAttribute('data-tab') || el.id || ('T:' + el.textContent.trim());
  }
  function filhosChave(c, cfg) {
    return Array.prototype.filter.call(c.children, function (el) {
      return el.matches(cfg.item) || (cfg.eixo === 'y' && el.matches('.sb-label'));
    });
  }
  function salvar(c, cfg) {
    try { localStorage.setItem(cfg.chave, JSON.stringify(filhosChave(c, cfg).map(key))); } catch (e) {}
  }
  function aplicar(c, cfg) {
    var ordem; try { ordem = JSON.parse(localStorage.getItem(cfg.chave) || 'null'); } catch (e) {}
    if (!ordem || !ordem.length) return;
    var itens = filhosChave(c, cfg), mapa = {};
    itens.forEach(function (el) { mapa[key(el)] = el; });
    var atual = itens.map(key).join('|'), alvo = ordem.filter(function (k) { return mapa[k]; });
    itens.forEach(function (el) { if (alvo.indexOf(key(el)) === -1) alvo.push(key(el)); });
    if (alvo.join('|') === atual) return;
    var ancora = itens[itens.length - 1].nextSibling;
    alvo.forEach(function (k) { c.insertBefore(mapa[k], ancora); });
  }
  var drag = null, bloqueiaClique = false;
  function preparar(c, cfg) {
    if (!c.__oa) { c.__oa = 1; aplicar(c, cfg); }
    filhosChave(c, cfg).forEach(function (el) {
      if (el.__oa || el.matches('.sb-label')) return; el.__oa = 1;
      el.classList.add('oa-item'); el.setAttribute('draggable', 'false');
      el.title = el.title || 'Clique, segure e arraste para reordenar';
      el.addEventListener('dragstart', function (e) { e.preventDefault(); });
      el.addEventListener('mousedown', function (e) {
        if (e.button !== 0) return;
        drag = { el: el, c: c, cfg: cfg, x: e.clientX, y: e.clientY, ativo: false };
      });
    });
  }
  document.addEventListener('mousemove', function (e) {
    if (!drag) return;
    if (!drag.ativo) {
      if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) < 6) return;
      drag.ativo = true; drag.el.classList.add('oa-drag');
      document.body.style.userSelect = 'none'; document.body.style.cursor = 'grabbing';
    }
    e.preventDefault();
    var c = drag.c, cfg = drag.cfg, el = drag.el;
    var irmaos = filhosChave(c, cfg).filter(function (x) { return x !== el; });
    for (var i = 0; i < irmaos.length; i++) {
      var r = irmaos[i].getBoundingClientRect();
      var dentro = cfg.eixo === 'y' ? (e.clientY >= r.top && e.clientY <= r.bottom) : (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top - 20 && e.clientY <= r.bottom + 20);
      if (!dentro) continue;
      var depois = cfg.eixo === 'y' ? e.clientY > r.top + r.height / 2 : e.clientX > r.left + r.width / 2;
      var ref = depois ? irmaos[i].nextSibling : irmaos[i];
      if (ref !== el && el.nextSibling !== ref) c.insertBefore(el, ref);
      break;
    }
  }, true);
  document.addEventListener('mouseup', function () {
    if (!drag) return;
    if (drag.ativo) {
      drag.el.classList.remove('oa-drag'); salvar(drag.c, drag.cfg);
      document.body.style.userSelect = ''; document.body.style.cursor = '';
      bloqueiaClique = true; setTimeout(function () { bloqueiaClique = false; }, 50);
    }
    drag = null;
  }, true);
  document.addEventListener('click', function (e) {
    if (bloqueiaClique) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); bloqueiaClique = false; }
  }, true);
  function limpar(c) { Array.prototype.forEach.call(c.querySelectorAll('.oa-alvo-x,.oa-alvo-y'), function (x) { x.classList.remove('oa-alvo-x', 'oa-alvo-y'); }); }
  function varrer() {
    CONT.forEach(function (cfg) {
      document.querySelectorAll(cfg.sel).forEach(function (c) { preparar(c, cfg); });
    });
  }
  var t = null;
  new MutationObserver(function () { clearTimeout(t); t = setTimeout(varrer, 120); }).observe(document.documentElement, { childList: true, subtree: true });
  window.restaurarOrdemPadrao = function () { CONT.forEach(function (c) { localStorage.removeItem(c.chave); }); location.reload(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', varrer); else varrer();
})();
