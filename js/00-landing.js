// Accueil Task’in : scène animée, connexion (doLogin) et présentation enchaînée.
(()=>{
  const $=id=>document.getElementById(id);
  const scene=$('lp-scene'), toast=$('lp-toast'), hint=$('lp-hint');
  const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp=(v,a,b)=>v<a?a:v>b?b:v;
  const rnd=(a,b)=>a+Math.random()*(b-a);
  // lissage indépendant de la fréquence d'affichage (60 / 120 / 144 Hz)
  const ease=(rate,dt)=>1-Math.exp(-rate*dt);

  const showToast=msg=>{toast.textContent=msg;toast.classList.add('lp-show');clearTimeout(showToast.t);showToast.t=setTimeout(()=>toast.classList.remove('lp-show'),2400)};

  /* ======================= Moteur 3D des icônes ======================= */
  const Z_MIN=-420, Z_MAX=300, TILT_MAX=65;
  let mode='move';                 // mode choisi dans la barre 3D
  let W=scene.clientWidth, H=scene.clientHeight;
  addEventListener('resize',()=>{W=scene.clientWidth;H=scene.clientHeight;syncDock()},{passive:true});

  const driftBase=reduceMotion?0:Math.min(W,H);
  const cards=[...document.querySelectorAll('.lp-card')].map(el=>{
    const cs=el.style, d=Number(el.dataset.depth||1);
    const amp=driftBase*rnd(.07,.12)*Math.min(d,1.2);
    return {
      el,d,
      left:parseFloat(cs.getPropertyValue('--left'))/100,
      top:parseFloat(cs.getPropertyValue('--top'))/100,
      z0:parseFloat(cs.getPropertyValue('--z'))||0,
      rot:parseFloat(cs.getPropertyValue('--rot'))||0,
      // position/rotation cibles (t*) et rendues
      x:0,y:0,z:0,tx:0,ty:0,tz:0,vx:0,vy:0,
      rx:0,ry:0,trx:0,try_:0,vrx:0,vry:0,
      tiltX:0,tiltY:0,lift:0,s:1,ts:1,hover:false,grab:null,
      clock:rnd(0,60),drift:1,
      dr:{ax1:amp*rnd(.6,1),Tx1:rnd(42,68),px1:rnd(0,6.28),ax2:amp*rnd(.2,.4),Tx2:rnd(20,32),px2:rnd(0,6.28),
          ay1:amp*rnd(.5,.85),Ty1:rnd(38,60),py1:rnd(0,6.28),ay2:amp*rnd(.15,.3),Ty2:rnd(17,28),py2:rnd(0,6.28)}
    };
  });

  /* parallaxe souris */
  let px=0,py=0,cx=0,cy=0;
  scene.addEventListener('pointermove',e=>{
    if(e.pointerType!=='mouse')return;
    px=(e.clientX/W-.5)*2; py=(e.clientY/H-.5)*2;
  },{passive:true});
  scene.addEventListener('pointerleave',()=>{px=0;py=0});

  /* ------------------------ Interactions ------------------------ */
  const modeFor=(e)=>{
    if(e.shiftKey||e.button===2)return 'rotate';
    if(e.altKey||e.ctrlKey||e.metaKey)return 'depth';
    return mode;
  };
  let hintShown=false;
  const showHint=()=>{if(hintShown||reduceMotion)return;hintShown=true;hint.classList.add('lp-show');setTimeout(()=>hint.classList.remove('lp-show'),5200)};

  cards.forEach(c=>{
    const el=c.el;
    el.addEventListener('pointerenter',()=>{c.hover=true;showHint()});
    el.addEventListener('pointerleave',()=>{c.hover=false});
    el.addEventListener('contextmenu',e=>e.preventDefault());
    el.addEventListener('dragstart',e=>e.preventDefault());

    el.addEventListener('pointerdown',e=>{
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      const m=modeFor(e);
      c.grab={id:e.pointerId,m,sx:e.clientX,sy:e.clientY,tx:c.tx,ty:c.ty,tz:c.tz,trx:c.trx,try_:c.try_,samples:[{x:e.clientX,y:e.clientY,t:performance.now()}]};
      c.vx=c.vy=c.vrx=c.vry=0;
      el.classList.add('lp-grabbed','lp-selected'); el.dataset.mode=m;
    });
    el.addEventListener('pointermove',e=>{
      const g=c.grab; if(!g||g.id!==e.pointerId)return;
      const dx=e.clientX-g.sx, dy=e.clientY-g.sy;
      if(g.m==='move'){c.tx=g.tx+dx;c.ty=g.ty+dy}
      else if(g.m==='rotate'){c.try_=clamp(g.try_+dx*.45,-TILT_MAX,TILT_MAX);c.trx=clamp(g.trx-dy*.45,-TILT_MAX,TILT_MAX)}
      else {c.tz=clamp(g.tz-dy*1.6,Z_MIN,Z_MAX)}
      const now=performance.now();
      g.samples.push({x:e.clientX,y:e.clientY,t:now});
      while(g.samples.length>2&&now-g.samples[0].t>90)g.samples.shift();
    });
    const release=e=>{
      const g=c.grab; if(!g||g.id!==e.pointerId)return;
      const s=g.samples, a=s[0], b=s[s.length-1], dt=Math.max((b.t-a.t)/1000,.016);
      const vx=(b.x-a.x)/dt, vy=(b.y-a.y)/dt;
      if(performance.now()-b.t<60&&!reduceMotion){          // lancer avec inertie
        if(g.m==='move'){c.vx=clamp(vx,-2600,2600);c.vy=clamp(vy,-2600,2600)}
        else if(g.m==='rotate'){c.vry=clamp(vx*.45,-900,900);c.vrx=clamp(-vy*.45,-900,900)}
      }
      c.grab=null; el.classList.remove('lp-grabbed'); delete el.dataset.mode;
      setTimeout(()=>el.classList.remove('lp-selected'),600);
    };
    el.addEventListener('pointerup',release);
    el.addEventListener('pointercancel',release);
    el.addEventListener('lostpointercapture',release);

    el.addEventListener('wheel',e=>{
      e.preventDefault();
      c.tz=clamp(c.tz-e.deltaY*.8,Z_MIN,Z_MAX);
    },{passive:false});

    el.addEventListener('dblclick',()=>resetCard(c));

    el.addEventListener('keydown',e=>{
      const step=e.altKey?10:24, k=e.key;
      const rot=e.shiftKey||mode==='rotate', depth=mode==='depth';
      if(k==='0'||k==='Home'){resetCard(c)}
      else if(k==='+'||k==='='||k==='PageUp'){c.tz=clamp(c.tz+60,Z_MIN,Z_MAX)}
      else if(k==='-'||k==='PageDown'){c.tz=clamp(c.tz-60,Z_MIN,Z_MAX)}
      else if(k.startsWith('Arrow')){
        const h=k==='ArrowLeft'?-1:k==='ArrowRight'?1:0, v=k==='ArrowUp'?-1:k==='ArrowDown'?1:0;
        if(rot){c.try_=clamp(c.try_+h*10,-TILT_MAX,TILT_MAX);c.trx=clamp(c.trx-v*10,-TILT_MAX,TILT_MAX)}
        else if(depth){c.tz=clamp(c.tz-v*60,Z_MIN,Z_MAX)}
        else{c.tx+=h*step;c.ty+=v*step}
      }
      else if(k==='Enter'||k===' '){showToast(c.el.getAttribute('aria-label')+(c.el.classList.contains('lp-loaded')?' — prêt':''))}
      else return;
      e.preventDefault();
    });
  });

  function resetCard(c){c.tx=c.ty=c.tz=0;c.trx=c.try_=0;c.vx=c.vy=c.vrx=c.vry=0}
  $('lp-resetAll').addEventListener('click',()=>{cards.forEach((c,i)=>setTimeout(()=>resetCard(c),i*45));showToast('Icônes remises en place')});

  const dockBtns=[...document.querySelectorAll('.lp-dock [data-mode]')];
  dockBtns.forEach(b=>b.addEventListener('click',()=>{
    mode=b.dataset.mode;
    dockBtns.forEach(o=>o.setAttribute('aria-pressed',String(o===b)));
    showToast({move:'Mode déplacer : glissez une icône',rotate:'Mode pivoter : glissez pour tourner en 3D',depth:'Mode profondeur : glissez vers le haut pour rapprocher'}[mode]);
  }));
  function syncDock(){const d=document.querySelector('.lp-dock');if(d)scene.style.setProperty('--dockw',(d.offsetWidth+10)+'px')}
  syncDock();

  /* ------------------------ Boucle d'animation ------------------------ */
  let obstacle=null;
  const measure=()=>{const p=document.querySelector('.lp-stage>.lp-panel:not(.lp-hide)'),s=scene.getBoundingClientRect();
    if(!p||W<700){obstacle=null;return}const r=p.getBoundingClientRect();obstacle={l:r.left-s.left,r:r.right-s.left,t:r.top-s.top,b:r.bottom-s.top}};
  setInterval(measure,300); measure();
  let last=performance.now(), running=true, sceneVisible=true;
  const P=2*Math.PI;
  function frame(now){
    if(!running)return;
    const dt=Math.min((now-last)/1000,.05); last=now;
    const kPar=ease(5,dt), kPos=ease(18,dt), kSoft=ease(9,dt);
    cx+=(px-cx)*kPar; cy+=(py-cy)*kPar;

    for(const c of cards){
      const grabbed=!!c.grab;
      // la dérive se fige sous le doigt puis repart en douceur
      c.drift+=((grabbed?0:1)-c.drift)*ease(4,dt);
      c.clock+=dt*c.drift;

      if(!grabbed){
        // inertie de déplacement + rebond sur les bords de l'écran
        if(c.vx||c.vy){
          c.tx+=c.vx*dt; c.ty+=c.vy*dt;
          const f=Math.exp(-3.2*dt); c.vx*=f; c.vy*=f;
          const bx=c.left*W, by=c.top*H, m=40;
          if(bx+c.tx<m){c.tx=m-bx;c.vx=Math.abs(c.vx)*.55}
          if(bx+c.tx>W-m){c.tx=W-m-bx;c.vx=-Math.abs(c.vx)*.55}
          if(by+c.ty<m){c.ty=m-by;c.vy=Math.abs(c.vy)*.55}
          if(by+c.ty>H-m){c.ty=H-m-by;c.vy=-Math.abs(c.vy)*.55}
          if(Math.hypot(c.vx,c.vy)<4){c.vx=c.vy=0}
        }
        // les icônes ne se glissent pas sous le panneau central
        if(obstacle){
          const o=obstacle, pad=c.el.offsetWidth*.35;
          const ax=c.left*W+c.x, ay=c.top*H+c.y;
          if(ax>o.l-pad&&ax<o.r+pad&&ay>o.t-pad&&ay<o.b+pad){
            const dl=ax-(o.l-pad), dr=(o.r+pad)-ax, du=ay-(o.t-pad), dd=(o.b+pad)-ay, mn=Math.min(dl,dr,du,dd);
            if(mn===dl){c.tx-=dl;c.vx=-Math.abs(c.vx)*.5}
            else if(mn===dr){c.tx+=dr;c.vx=Math.abs(c.vx)*.5}
            else if(mn===du){c.ty-=du;c.vy=-Math.abs(c.vy)*.5}
            else {c.ty+=dd;c.vy=Math.abs(c.vy)*.5}
          }
        }
        // inertie de rotation
        if(c.vrx||c.vry){
          c.trx+=c.vrx*dt; c.try_+=c.vry*dt;
          const f=Math.exp(-3.6*dt); c.vrx*=f; c.vry*=f;
          if(Math.abs(c.trx)>TILT_MAX){c.trx=Math.sign(c.trx)*TILT_MAX;c.vrx*=-.4}
          if(Math.abs(c.try_)>TILT_MAX){c.try_=Math.sign(c.try_)*TILT_MAX;c.vry*=-.4}
          if(Math.abs(c.vrx)+Math.abs(c.vry)<2){c.vrx=c.vry=0}
        }
      }

      const prevX=c.x, prevY=c.y;
      c.x+=(c.tx-c.x)*kPos; c.y+=(c.ty-c.y)*kPos; c.z+=(c.tz-c.z)*kSoft;
      c.rx+=(c.trx-c.rx)*kSoft; c.ry+=(c.try_-c.ry)*kSoft;

      // inclinaison « physique » selon la vitesse réelle
      const vX=(c.x-prevX)/Math.max(dt,.001), vY=(c.y-prevY)/Math.max(dt,.001);
      c.tiltY+=(clamp(vX*.018,-22,22)-c.tiltY)*kSoft;
      c.tiltX+=(clamp(-vY*.018,-22,22)-c.tiltX)*kSoft;

      c.ts=grabbed?1.12:c.hover?1.07:1;
      c.s+=(c.ts-c.s)*ease(12,dt);

      const r=c.dr, t=c.clock;
      const dX=r.ax1*Math.sin(t*P/r.Tx1+r.px1)+r.ax2*Math.sin(t*P/r.Tx2+r.px2);
      const dY=r.ay1*Math.cos(t*P/r.Ty1+r.py1)+r.ay2*Math.cos(t*P/r.Ty2+r.py2);
      const X=c.x+dX+cx*c.d*20, Y=c.y+dY+cy*c.d*13;
      c.lift+=((grabbed?70:c.hover?20:0)-c.lift)*ease(10,dt);   // la carte « se soulève » quand on la prend
      const Z=c.z0+c.z+c.lift;
      const RX=c.rx+c.tiltX+cy*c.d*-4.4, RY=c.ry+c.tiltY+cx*c.d*5.2;

      c.el.style.transform=
        `translate3d(calc(-50% + ${X.toFixed(2)}px),calc(-50% + ${Y.toFixed(2)}px),${Z.toFixed(1)}px) `+
        `rotateZ(${c.rot}deg) rotateX(${RX.toFixed(2)}deg) rotateY(${RY.toFixed(2)}deg) scale(${c.s.toFixed(4)})`;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  // économise la batterie quand l'onglet est caché
  const setRunning=()=>{const next=!document.hidden&&sceneVisible;if(next&&!running){running=true;last=performance.now();requestAnimationFrame(frame)}else running=next};
  document.addEventListener('visibilitychange',setRunning);
  new IntersectionObserver(([e])=>{sceneVisible=e.isIntersecting;setRunning()}).observe(scene);

  /* ======================= Séquence de démarrage ======================= */
  const boot=$('lp-boot'), welcome=$('lp-welcome'), login=$('lp-login'), bar=$('lp-bar'), pct=$('lp-pct'), stepTxt=$('lp-stepTxt');
  const items=[...$('lp-steps').children];
  const labels=['Connexion sécurisée','Chargement des dossiers','Synchronisation de l\'équipe','Préparation du tableau de bord'];
  const moduleCards=['vols','hotels','ferries','coaching'].map(m=>document.querySelector(`[data-module="${m}"]`));
  let finished=false, timers=[], shown=0, target=0;
  const BOOT_SEEN='taskin_landing_boot_seen';
  const bootSeen=(()=>{try{return sessionStorage.getItem(BOOT_SEEN)==='1'}catch(_){return false}})();

  const setProgress=v=>{target=v;bar.style.transform=`scaleX(${v/100})`};
  (function count(){shown+=(target-shown)*.12;if(Math.abs(target-shown)<.3)shown=target;pct.textContent=Math.round(shown)+'%';if(!finished||shown<100)requestAnimationFrame(count)})();

  const flash=c=>{c.classList.add('lp-loaded','lp-flash');setTimeout(()=>c.classList.remove('lp-flash'),900)};

  const panels=[boot,welcome,login];
  function showPanel(p){
    panels.forEach(x=>{const on=x===p;x.classList.toggle('lp-hide',!on);x.setAttribute('aria-hidden',String(!on));x.inert=!on});
  }

  function runStep(i){
    if(finished)return;
    if(i>=items.length)return finish();
    items.forEach((li,k)=>li.classList.toggle('lp-active',k===i));
    stepTxt.textContent=labels[i]+'…';
    setProgress(8+i*23);
    timers.push(setTimeout(()=>{
      items[i].classList.remove('lp-active');items[i].classList.add('lp-done');
      if(i===1)moduleCards.slice(0,3).forEach((c,k)=>setTimeout(()=>flash(c),k*160));
      if(i===2)flash(moduleCards[3]);
      setProgress(8+(i+1)*23);
      runStep(i+1);
    },i===1?900:620));
  }
  let afterBoot=null;
  function finish(){
    if(finished)return; finished=true; timers.forEach(clearTimeout);
    try{sessionStorage.setItem(BOOT_SEEN,'1')}catch(_){}
    items.forEach(li=>{li.classList.remove('lp-active');li.classList.add('lp-done')});
    moduleCards.forEach(c=>c.classList.add('lp-loaded'));
    setProgress(100); stepTxt.textContent='Prêt';
    $('lp-status').classList.add('lp-ok'); $('lp-statusTxt').textContent='Système opérationnel';
    setTimeout(()=>{ if(afterBoot){const f=afterBoot;afterBoot=null;f()} else showPanel(welcome); },reduceMotion?0:450);
  }
  $('lp-skip').addEventListener('click',finish);
  addEventListener('keydown',e=>{if(e.key==='Escape'&&!finished)finish()});
  showPanel(boot);
  if(reduceMotion||bootSeen)finish(); else setTimeout(()=>runStep(0),600);

  /* ======================= Accueil, connexion et présentation ======================= */
  const screen=document.getElementById('login-screen'), header=$('lp-header'), presFrame=$('portal-site-frame');
  const email=$('login-email'), pwd=$('login-password');

  function openLogin(){
    screen.scrollTo({top:0,behavior:reduceMotion?'auto':'smooth'});
    const go=()=>{showPanel(login);setTimeout(()=>email.focus({preventScroll:true}),reduceMotion?0:380)};
    if(!finished){afterBoot=go;finish()} else go();
  }
  function backToWelcome(){ showPanel(welcome); }
  document.querySelectorAll('[data-lp-open-login]').forEach(b=>b.addEventListener('click',openLogin));
  document.querySelector('[data-lp-back]').addEventListener('click',backToWelcome);
  document.querySelector('[data-lp-top]').addEventListener('click',e=>{e.preventDefault();screen.scrollTo({top:0,behavior:reduceMotion?'auto':'smooth'})});

  $('lp-eye').addEventListener('click',()=>{
    const show=pwd.type==='password';
    pwd.type=show?'text':'password'; $('lp-eye').textContent=show?'Masquer':'Afficher';
    $('lp-eye').setAttribute('aria-label',show?'Masquer le mot de passe':'Afficher le mot de passe');
  });
  login.addEventListener('submit',async e=>{
    e.preventDefault();
    const err=$('login-error'), btn=$('lp-submit');
    err.textContent='';
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())){err.textContent='Adresse e-mail invalide.';email.focus();return}
    if(!pwd.value){err.textContent='Veuillez saisir votre mot de passe.';pwd.focus();return}
    btn.disabled=true; btn.textContent='Connexion…';
    try{ if(typeof doLogin==='function') await doLogin(); }
    finally{ btn.disabled=false; btn.innerHTML='Se connecter &nbsp;→'; }
  });

  // La présentation s'enchaîne sous la scène : iframe à hauteur automatique.
  const PRES_URL=(window.TASKIN_PRESENTATION_URL||'presentation.html')+((window.TASKIN_PRESENTATION_URL||'').includes('?')?'&':'?')+'embed=1';
  const loadPresentation=()=>{ if(!presFrame.getAttribute('src')) presFrame.src=PRES_URL; };
  addEventListener('message',e=>{
    if(e.origin!==location.origin||e.source!==presFrame.contentWindow)return;
    const d=e.data||{};
    if(d.type==='taskin-presentation-height'&&Number(d.height)>0) presFrame.style.height=Math.ceil(d.height)+'px';
    if(d.type==='taskin-presentation-login') openLogin();
  });
  const presentationTarget=id=>{try{return presFrame.contentDocument?.getElementById(id)||null}catch(_){return null}};
  function discover(id){
    loadPresentation();
    const go=()=>{const t=id&&presentationTarget(id);(t||presFrame).scrollIntoView({behavior:reduceMotion?'auto':'smooth',block:'start'})};
    if(presFrame.contentDocument?.readyState==='complete'&&presFrame.contentDocument.body?.childElementCount) go(); else presFrame.addEventListener('load',()=>setTimeout(go,60),{once:true});
  }
  document.querySelectorAll('[data-lp-discover]').forEach(b=>b.addEventListener('click',()=>discover(null)));
  document.querySelectorAll('[data-lp-goto]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();discover(a.dataset.lpGoto)}));
  // charge la présentation dès que l'accueil est prêt, sans ralentir l'animation d'entrée
  if('requestIdleCallback' in window) requestIdleCallback(loadPresentation,{timeout:2500}); else setTimeout(loadPresentation,1200);

  // barre haute : fond givré dès qu'on quitte le haut de la scène
  screen.addEventListener('scroll',()=>header.classList.toggle('lp-scrolled',screen.scrollTop>24),{passive:true});

  // API utilisée par l'app (déconnexion) et par la présentation
  window.taskinLanding={ openLogin, showWelcome(){ screen.scrollTop=0; if(finished) showPanel(welcome); email.value=''; pwd.value=''; $('login-error').textContent=''; }, discover };
})();
