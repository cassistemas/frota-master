/* Frota Master — service worker
   Objetivo: permitir instalar e abrir o sistema como programa.
   Regra de ouro: NADA de dados é armazenado aqui. Tudo que é banco
   (Firebase/Firestore/Google) passa direto pela rede, para o programa
   instalado e o site usarem sempre os mesmos dados sincronizados. */

const CACHE = 'frota-master-v2';

// Somente os arquivos do próprio sistema (telas e códigos), nunca dados.
const ARQUIVOS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './pro-ui.css',
  './estoque-pro.css',
  './relatorios-ui.css',
  './fretes-terceiros.css',
  './custos-frota.css',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => Promise.allSettled(ARQUIVOS.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function ehDados(url) {
  return /firebase|firestore|googleapis|gstatic|google\.com|identitytoolkit|securetoken/i.test(url.href);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Banco, login e APIs: sempre rede, sem cache algum.
  if (ehDados(url)) return;

  // Mesmo domínio: rede primeiro (versão sempre atualizada),
  // cache apenas como reserva quando a internet cai.
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copia = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copia)).catch(() => {});
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then((hit) => hit || caches.match('./index.html'))
        )
    );
  }
});
