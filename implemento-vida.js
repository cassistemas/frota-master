(function(){'use strict';
function hoje(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function el(i){return document.getElementById(i)}
function garantirHoje(){var a=el('cusImpDataAtual');if(a&&!a.value)a.value=hoje()}
function calcular(){var c=el('cusImpData'),a=el('cusImpDataAtual'),m=el('cusImpMeses');if(!c||!a||!m)return;garantirHoje();if(!c.value||!a.value)return;var x=c.value.split('-').map(Number),y=a.value.split('-').map(Number);var meses=(y[0]-x[0])*12+(y[1]-x[1]);if(y[2]<x[2])meses--;if(meses<1)meses=1;if(meses>600)meses=600;m.value=meses;if(typeof calcularDepreciacaoImplemento==='function')calcularDepreciacaoImplemento()}
document.addEventListener('change',function(e){var t=e.target;if(t&&(t.id==='cusImpData'||t.id==='cusImpDataAtual'))calcular()},true);
setInterval(garantirHoje,1000);
})();
