/* Frota Master — instalação como programa de computador.
   Registra o service worker e mostra o botão "Instalar aplicativo". */
(function () {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').catch(function () {});
    });
  }

  var prompt = null;

  function criarBotao() {
    if (document.getElementById('fmBtnInstalar')) return document.getElementById('fmBtnInstalar');
    var b = document.createElement('button');
    b.id = 'fmBtnInstalar';
    b.type = 'button';
    b.textContent = 'Instalar aplicativo';
    b.style.cssText =
      'position:fixed;right:18px;bottom:18px;z-index:99999;border:0;border-radius:999px;' +
      'padding:12px 18px;background:#0f172a;color:#fff;font:600 14px Inter,system-ui,sans-serif;' +
      'box-shadow:0 8px 24px rgba(15,23,42,.35);cursor:pointer;display:none';
    b.onclick = function () {
      if (!prompt) return;
      prompt.prompt();
      prompt.userChoice && prompt.userChoice.then(function () { b.style.display = 'none'; });
      prompt = null;
    };
    document.body.appendChild(b);
    return b;
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    prompt = e;
    var b = criarBotao();
    b.style.display = 'block';
  });

  window.addEventListener('appinstalled', function () {
    var b = document.getElementById('fmBtnInstalar');
    if (b) b.style.display = 'none';
  });
})();
