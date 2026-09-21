'use strict';
/* ===== Telegram init ===== */
const TG = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
// Real Telegram env? (the SDK also loads a stub in a plain browser)
const IN_TG = !!(TG && TG.platform && TG.platform !== 'unknown');
if (IN_TG) {
  try {
    TG.ready(); TG.expand();
    document.body.classList.add('tg');
    if (TG.setHeaderColor) { try { TG.setHeaderColor('secondary_bg_color'); } catch(e){} }
  } catch (e) {}
}
function haptic(type){ try{ if(TG&&TG.HapticFeedback){ if(type==='ok'||type==='bad') TG.HapticFeedback.notificationOccurred(type==='ok'?'success':'error'); else TG.HapticFeedback.impactOccurred('light'); } }catch(e){} }

/* ===== State ===== */
const LS_KEY = 'seti_progress_v1';
let QUESTIONS = [];
let stats = load();          // { [id]: {correct:int, wrong:int} }
let session = null;          // current quiz session

function load(){ try{ return JSON.parse(localStorage.getItem(LS_KEY)||'{}'); }catch(e){ return {}; } }
function save(){ try{ localStorage.setItem(LS_KEY, JSON.stringify(stats)); }catch(e){} }

/* ===== Helpers ===== */
const $ = s => document.querySelector(s);
const el = (tag, cls, txt) => { const e=document.createElement(tag); if(cls)e.className=cls; if(txt!=null)e.textContent=txt; return e; };
function shuffle(a){ a=a.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function eqSet(a,b){ if(a.length!==b.length) return false; const s=new Set(a); return b.every(x=>s.has(x)); }

/* ===== Load data ===== */
function hideLoader(){ const l=document.getElementById('loader'); if(!l) return; l.classList.add('hide'); setTimeout(()=>l.remove(), 500); }

fetch('questions.json').then(r=>r.json()).then(data=>{
  QUESTIONS = data;
  $('#qtotal').textContent = QUESTIONS.length;
  renderHome();
  hideLoader();
}).catch(err=>{
  $('#home').innerHTML = '<p style="padding:24px;text-align:center">Не удалось загрузить вопросы (questions.json). Проверьте, что файл рядом с index.html.</p>';
  hideLoader();
});

/* ===== Home ===== */
function sections(){
  const map = new Map();
  QUESTIONS.forEach(q=>{ if(!map.has(q.section)) map.set(q.section,{num:q.section,title:q.section_title,ids:[]}); map.get(q.section).ids.push(q.id); });
  return [...map.values()].sort((a,b)=>a.num-b.num);
}
function answeredCount(ids){ return ids.filter(id=>stats[id]&&(stats[id].correct||stats[id].wrong)).length; }
function masteredCount(ids){ return ids.filter(id=>stats[id]&&stats[id].correct>0).length; }

function renderHome(){
  // global stats
  const total = QUESTIONS.length;
  const seen = QUESTIONS.filter(q=>stats[q.id]&&(stats[q.id].correct||stats[q.id].wrong)).length;
  const mastered = QUESTIONS.filter(q=>stats[q.id]&&stats[q.id].correct>0).length;
  const gs = $('#globalStats'); gs.innerHTML='';
  [['📈','Пройдено',seen+'/'+total],['✅','Освоено',mastered],['🎯','Осталось',total-mastered]].forEach(([icon,l,v])=>{
    const s=el('div','stat'); s.appendChild(el('b',null,String(v))); s.appendChild(el('span',null,icon+' '+l)); gs.appendChild(s);
  });
  // sections
  const list = $('#sectionList'); list.innerHTML='';
  sections().forEach(sec=>{
    const b=el('button','sec-item'); b.type='button';
    b.appendChild(el('div','sec-num',String(sec.num)));
    const body=el('div','sec-body');
    body.appendChild(el('span','sec-name',sec.title));
    const m=masteredCount(sec.ids);
    body.appendChild(el('span','sec-meta',`${sec.ids.length} вопросов · освоено ${m}`));
    b.appendChild(body);
    const pct = sec.ids.length?Math.round(m/sec.ids.length*100):0;
    const ring=el('div','sec-ring'); ring.style.setProperty('--pct', pct); ring.appendChild(el('span',null,pct+'%')); b.appendChild(ring);
    b.onclick=()=>startQuiz(QUESTIONS.filter(q=>q.section===sec.num), 'Раздел '+sec.num);
    list.appendChild(b);
  });
  showScreen('home');
  if(TG&&TG.BackButton){ try{TG.BackButton.hide();}catch(e){} }
}

document.querySelectorAll('.mode-btn').forEach(btn=>{
  btn.onclick=()=>{
    const m=btn.dataset.mode;
    if(m==='all') startQuiz(QUESTIONS.slice(),'Весь тест');
    else if(m==='random') startQuiz(shuffle(QUESTIONS).slice(0,25),'Случайные 25');
    else if(m==='wrong'){
      const w=QUESTIONS.filter(q=>stats[q.id]&&stats[q.id].wrong>0);
      if(!w.length){ alertMsg('Пока нет вопросов с ошибками 👍'); return; }
      startQuiz(shuffle(w),'Работа над ошибками');
    } else if(m==='flagged'){
      const f=QUESTIONS.filter(q=>q.uncertain||q.no_mark);
      startQuiz(f,'Спорные вопросы');
    }
  };
});
$('#resetBtn').onclick=()=>{ if(confirm('Сбросить весь прогресс?')){ stats={}; save(); renderHome(); } };

function alertMsg(t){ if(TG&&TG.showAlert){ try{TG.showAlert(t); return;}catch(e){} } alert(t); }

/* ===== Quiz ===== */
function startQuiz(items, label){
  if(!items||!items.length){ alertMsg('Нет вопросов для этого режима.'); return; }
  // items are used in the order given by the caller — callers that want
  // randomized order (random mode, wrong-answers review) shuffle explicitly.
  session = { label, items: items.slice(), i:0, correct:0, wrong:[], answered:false, shuffleOpts:$('#shuffleOpts').checked };
  showScreen('quiz');
  if(IN_TG&&TG.BackButton){ try{ TG.BackButton.show(); TG.BackButton.onClick(exitQuiz);}catch(e){} }
  renderQuestion();
}
function exitQuiz(){ renderHome(); }
$('#backHome').onclick=exitQuiz;

function renderQuestion(){
  const s=session, q=s.items[s.i];
  s.answered=false; s.selected=[];
  $('#progressBar').style.width = ((s.i)/s.items.length*100)+'%';
  $('#counter').textContent=(s.i+1)+'/'+s.items.length;
  // meta chips
  const meta=$('#qmeta'); meta.innerHTML='';
  meta.appendChild(el('span','chip',`Раздел ${q.section} · №${q.n}`));
  const multi=q.correct.length>1;
  if(multi) meta.appendChild(el('span','chip multi','несколько ответов'));
  if(q.uncertain||q.no_mark) meta.appendChild(el('span','chip warn','⚠ проверить'));
  // figure
  const fig=$('#qfigure');
  if(q.figure){
    fig.className='qfigure'; fig.innerHTML='';
    const img=new Image();
    img.alt=q.figure;
    img.onerror=()=>{ fig.className='qfigure placeholder'; fig.innerHTML=''; fig.appendChild(el('div','figcap','📐 Смотрите рисунок «'+figLabel(q.figure)+'» в учебнике')); };
    img.src='images/'+q.figure+'.jpg';
    fig.appendChild(img);
    const cap=el('div','figcap',figLabel(q.figure)); fig.appendChild(cap);
    fig.classList.remove('hidden');
  } else { fig.classList.add('hidden'); }
  // text
  $('#qtext').textContent=q.text || q.q;
  // options
  const order = s.shuffleOpts ? shuffle(q.options.map((_,i)=>i)) : q.options.map((_,i)=>i);
  const optWrap=$('#options'); optWrap.innerHTML=''; s.order=order;
  order.forEach(origIdx=>{
    const o=el('div','opt'+(multi?' multi':'')); o.dataset.idx=origIdx;
    const mark=el('div','mark', multi?'✓':'●');
    o.appendChild(mark);
    o.appendChild(el('div','otext',q.options[origIdx]));
    o.onclick=()=>toggleOpt(o,origIdx,multi);
    optWrap.appendChild(o);
  });
  $('#explain').className='explain hidden'; $('#explain').innerHTML='';
  setAction('Проверить', false, false);
  $('.quiz-scroll').scrollTop=0;
}
function figLabel(f){
  const m=f.match(/^fig_(\d+)_(.+)$/);
  if(!m) return f;
  if(m[2].startsWith('q')) return 'рис. к вопросу '+m[2].slice(1);
  return 'рис. '+m[1]+'.'+m[2];
}
function toggleOpt(o,idx,multi){
  if(session.answered) return;
  if(multi){
    const p=session.selected.indexOf(idx);
    if(p>=0){ session.selected.splice(p,1); o.classList.remove('selected'); }
    else { session.selected.push(idx); o.classList.add('selected'); }
  } else {
    session.selected=[idx];
    document.querySelectorAll('.opt').forEach(x=>x.classList.remove('selected'));
    o.classList.add('selected');
  }
  haptic('light');
  setAction('Проверить', session.selected.length===0, false);
}

let actionMode='check';
function setAction(label,disabled,isNext){
  actionMode = isNext?'next':'check';
  const btn=$('#actionBtn');
  if(IN_TG&&TG.MainButton){
    try{
      TG.MainButton.setText(label.toUpperCase());
      TG.MainButton.offClick(onAction); TG.MainButton.onClick(onAction);
      if(disabled){ TG.MainButton.disable(); TG.MainButton.setParams&&TG.MainButton.setParams({color:'#9aa0a6'}); }
      else { TG.MainButton.enable(); TG.MainButton.setParams&&TG.MainButton.setParams({color: isNext ? '#2ea043' : (TG.themeParams&&TG.themeParams.button_color)||'#2f86eb'}); }
      TG.MainButton.show();
      btn.classList.add('hidden');
      return;
    }catch(e){}
  }
  btn.classList.remove('hidden');
  btn.textContent=label; btn.disabled=disabled;
  btn.className='action-btn'+(isNext?' next':'');
}
$('#actionBtn').onclick=onAction;
function onAction(){ if(actionMode==='check') checkAnswer(); else nextQuestion(); }

function checkAnswer(){
  const s=session, q=s.items[s.i];
  if(!s.selected.length) return;
  s.answered=true;
  const correct = eqSet(s.selected, q.correct);
  // lock & color
  document.querySelectorAll('.opt').forEach(o=>{
    o.classList.add('locked'); o.onclick=null;
    const idx=+o.dataset.idx;
    if(q.correct.includes(idx)) o.classList.add('correct');
    else if(s.selected.includes(idx)) o.classList.add('wrong');
    o.classList.remove('selected');
  });
  // stats
  if(!stats[q.id]) stats[q.id]={correct:0,wrong:0};
  if(correct){ stats[q.id].correct++; s.correct++; } else { stats[q.id].wrong++; s.wrong.push(q); }
  save();
  haptic(correct?'ok':'bad');
  // explain
  const ex=$('#explain'); ex.className='explain '+(correct?'ok':'bad');
  const correctText=q.correct.map(i=>q.options[i]).join('; ');
  ex.innerHTML = correct ? '✓ Верно!' : ('✗ Неверно. Правильный ответ: <b>'+escapeHtml(correctText)+'</b>');
  if(q.uncertain||q.no_mark){
    const note = q.no_mark
      ? 'В книге этот вопрос не отмечен — ответ выбран логически, перепроверьте по учебнику.'
      : 'Отметка в книге спорная — стоит перепроверить этот ответ.';
    const w=el('span','warnnote','⚠ '+note); ex.appendChild(w);
  }
  ex.classList.remove('hidden');
  const isLast = s.i>=s.items.length-1;
  setAction(isLast?'Завершить':'Далее', false, true);
  $('#progressBar').style.width=((s.i+1)/s.items.length*100)+'%';
}
function escapeHtml(t){ const d=document.createElement('div'); d.textContent=t; return d.innerHTML; }

function nextQuestion(){
  if(session.i>=session.items.length-1){ finish(); return; }
  session.i++; renderQuestion();
}

/* ===== Result ===== */
function finish(){
  const s=session; const total=s.items.length; const pct=Math.round(s.correct/total*100);
  showScreen('result');
  if(TG&&TG.MainButton){ try{TG.MainButton.hide();}catch(e){} }
  if(TG&&TG.BackButton){ try{TG.BackButton.hide();}catch(e){} }
  $('#resEmoji').textContent = pct>=90?'🏆':pct>=70?'🎉':pct>=50?'👍':'💪';
  $('#resScore').innerHTML = s.correct+' <span>/ '+total+'</span>';
  const tier = pct>=70?'good':pct>=50?'mid':'low';
  const ring=$('#scoreRing'); ring.style.setProperty('--pct',0); ring.className='score-ring '+tier;
  setTimeout(()=>ring.style.setProperty('--pct', pct), 80);
  $('#resPct').textContent = pct+'%';
  $('#resSub').textContent = pct+'% правильных'+(s.wrong.length?` · ошибок: ${s.wrong.length}`:' · без ошибок!');
  const rw=$('#reviewWrong');
  if(s.wrong.length){ rw.classList.remove('hidden'); rw.onclick=()=>startQuiz(s.wrong,'Разбор ошибок'); }
  else rw.classList.add('hidden');
}
$('#toHome').onclick=renderHome;

/* ===== screens ===== */
function showScreen(name){
  ['home','quiz','result'].forEach(n=>$('#'+n).classList.toggle('hidden', n!==name));
  if(name!=='quiz' && TG&&TG.MainButton){ try{TG.MainButton.hide();}catch(e){} }
  window.scrollTo(0,0);
}
