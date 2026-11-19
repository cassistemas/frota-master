/* Rolagem horizontal apenas das listagens de Terceiros, sem alterar registros. */
(function () {
    'use strict';
    var ativo = null;
    var quadro = 0;
    var anterior = 0;
    var mouseX = 0;
    var mouseY = 0;
    var seletor = '#terceiros .tabela-terceiros';

    function parar() {
        if (quadro) window.cancelAnimationFrame(quadro);
        quadro = 0;
        anterior = 0;
        ativo = null;
    }

    function velocidade() {
        if (!ativo || !ativo.isConnected || document.hidden || !ativo.getClientRects().length) return 0;
        if (ativo.scrollWidth <= ativo.clientWidth + 1) return 0;
        var rect = ativo.getBoundingClientRect();
        var esquerda = Math.max(rect.left, 0);
        var direita = Math.min(rect.right, window.innerWidth);
        if (mouseY < Math.max(rect.top, 0) || mouseY >= Math.min(rect.bottom, window.innerHeight)) return 0;
        if (mouseX < esquerda || mouseX > direita) return 0;
        var faixa = Math.min(56, (direita - esquerda) / 4);
        if (faixa <= 0) return 0;
        if (mouseX < esquerda + faixa && ativo.scrollLeft > 0) {
            return -600 * (1 - (mouseX - esquerda) / faixa);
        }
        if (mouseX > direita - faixa && ativo.scrollLeft < ativo.scrollWidth - ativo.clientWidth - 1) {
            return 600 * (1 - (direita - mouseX) / faixa);
        }
        return 0;
    }

    function mover(agora) {
        quadro = 0;
        var passo = velocidade();
        if (!passo) return parar();
        var intervalo = anterior ? Math.min(agora - anterior, 40) : 16;
        anterior = agora;
        ativo.scrollLeft += passo * intervalo / 1000;
        quadro = window.requestAnimationFrame(mover);
    }

    // Delegação também atende às sub-abas criadas após o carregamento da página.
    document.addEventListener('pointermove', function (evento) {
        if (evento.pointerType !== 'mouse' || evento.buttons || document.hidden) return parar();
        var alvo = evento.target;
        var lista = alvo && alvo.closest ? alvo.closest(seletor) : null;
        // Não movimenta a tabela enquanto o usuário aponta para ações ou campos.
        if (!lista || alvo.closest('button, a, input, select, textarea, [role="button"]')) return parar();
        if (lista !== ativo) parar();
        ativo = lista;
        mouseX = evento.clientX;
        mouseY = evento.clientY;
        if (!velocidade()) return parar();
        if (!quadro) quadro = window.requestAnimationFrame(mover);
    }, { passive: true });

    document.addEventListener('pointerdown', parar, { passive: true });
    document.addEventListener('pointerout', function (evento) {
        if (!evento.relatedTarget || (ativo && !ativo.contains(evento.relatedTarget))) parar();
    }, { passive: true });
    document.addEventListener('visibilitychange', parar);
    document.addEventListener('keydown', parar);
    document.addEventListener('wheel', parar, { passive: true });
    document.addEventListener('scroll', parar, { passive: true });
    window.addEventListener('blur', parar);
    window.addEventListener('resize', parar);
})();
