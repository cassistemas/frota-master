/* Reserva: olho para ver a senha + "Esqueci a senha" (link de redefinicao por e-mail) */
(function () {
  "use strict";
  function svg(a){return a?'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>':'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M3 3l18 18"/></svg>';}
  function boot(){
    var p=document.getElementById("lSenha"); if(!p||document.getElementById("rsOlho"))return;
    var w=document.createElement("div"); w.style.cssText="position:relative";
    p.parentNode.insertBefore(w,p); w.appendChild(p); p.style.paddingRight="44px"; p.style.boxSizing="border-box";
    var b=document.createElement("button"); b.type="button"; b.id="rsOlho"; b.setAttribute("aria-label","Mostrar senha"); b.title="Mostrar senha";
    b.style.cssText="position:absolute;top:50%;right:6px;transform:translateY(-50%);border:0;background:transparent;cursor:pointer;padding:6px;line-height:0;color:#6c757d;width:auto;margin:0";
    b.innerHTML=svg(false);
    b.onclick=function(){var v=p.type==="password";p.type=v?"text":"password";b.innerHTML=svg(v);b.title=v?"Ocultar senha":"Mostrar senha";b.setAttribute("aria-label",b.title);p.focus();};
    w.appendChild(b);
    var msg=document.getElementById("msgLogin");
    var l=document.createElement("a"); l.href="#"; l.id="rsEsqueci"; l.textContent="Esqueci a senha";
    l.style.cssText="display:block;text-align:center;margin-top:12px;font-size:14px;color:#0d6efd;text-decoration:underline";
    msg.parentNode.insertBefore(l,msg.nextSibling);
    l.onclick=function(ev){
      ev.preventDefault();
      var e=(document.getElementById("lEmail").value||"").trim().toLowerCase();
      function m(t,c,ok){msg.className="msg "+(ok?"ok":"err");msg.style.display="block";msg.style.color=c;msg.innerHTML=t;}
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)){m("Digite seu e-mail no campo acima e toque em <b>Esqueci a senha</b>.","#dc3545");return;}
      try{
        firebase.auth().sendPasswordResetEmail(e).then(function(){
          m("Se <b>"+e.replace(/[<>&]/g,"")+"</b> estiver cadastrado, enviamos um link para criar nova senha. Veja também o spam.","#198754");
        }).catch(function(x){
          var c=(x&&x.code)||"";
          m(c==="auth/too-many-requests"?"Muitas tentativas. Aguarde alguns minutos.":c==="auth/network-request-failed"?"Sem internet. Conecte-se e tente de novo.":"Não foi possível enviar o link. Fale com o administrador.","#dc3545");
        });
      }catch(x){m("Sem conexão com o servidor. Tente novamente.","#dc3545");}
    };
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
})();
