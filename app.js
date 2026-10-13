'use strict';
/* ===== Telegram init ===== */
const TG = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
// Real Telegram env? (the SDK also loads a stub in a plain browser)
const IN_TG = !!(TG && TG.platform && TG.platform !== 'unknown');
if (IN_TG) {
  try {
    TG.ready(); TG.expand();
    document.body.classList.add('tg');
  } catch (e) {}
}

/* ===== Тема: светлая по умолчанию, тёмная — по переключателю ===== */
const THEME_STORE = 'seti_theme';
const THEME_BG = { light: '#f2f3fb', dark: '#0a0d16' };
function applyTheme(theme){
  document.documentElement.dataset.theme = theme;
  const bg = THEME_BG[theme];
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = bg;
  if (IN_TG) {
    try { TG.setHeaderColor && TG.setHeaderColor(bg); } catch(e){}
    try { TG.setBackgroundColor && TG.setBackgroundColor(bg); } catch(e){}
    try { TG.setBottomBarColor && TG.setBottomBarColor(bg); } catch(e){}
  }
}
applyTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
{
  const t = document.getElementById('darkTheme');
  if (t) {
    t.checked = document.documentElement.dataset.theme === 'dark';
    t.onchange = () => {
      const theme = t.checked ? 'dark' : 'light';
      try { localStorage.setItem(THEME_STORE, theme); } catch(e){}
      applyTheme(theme); haptic();
    };
  }
}
function haptic(type){ try{ if(TG&&TG.HapticFeedback){ if(type==='ok'||type==='bad') TG.HapticFeedback.notificationOccurred(type==='ok'?'success':'error'); else TG.HapticFeedback.impactOccurred('light'); } }catch(e){} }

/* ===== State ===== */
// Наборы вопросов. У каждого свой файл и своё хранилище прогресса.
const DATASETS = {
  km1: { title: 'Тест 1', file: 'questions.json', ls: 'seti_progress_v1' },
  km2: { title: 'Тест 2', file: 'questions_km2.json', ls: 'seti_progress_km2_v1' },
};
const DS_STORE = 'seti_dataset';
let DS_KEY = (()=>{ try{ const k=localStorage.getItem(DS_STORE); return DATASETS[k]?k:'km1'; }catch(e){ return 'km1'; } })();
let LS_KEY = DATASETS[DS_KEY].ls;
let QUESTIONS = [];
let stats = load();          // { [id]: {correct:int, wrong:int} } — для текущего набора
let session = null;          // current quiz session
const DATA_CACHE = {};

function load(){ try{ return JSON.parse(localStorage.getItem(LS_KEY)||'{}'); }catch(e){ return {}; } }
function save(){ try{ localStorage.setItem(LS_KEY, JSON.stringify(stats)); }catch(e){} }

/* ===== Helpers ===== */
const $ = s => document.querySelector(s);
const el = (tag, cls, txt) => { const e=document.createElement(tag); if(cls)e.className=cls; if(txt!=null)e.textContent=txt; return e; };
function shuffle(a){ a=a.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
/** Текст с индексами: _{нб} → нижний, ^{3} → верхний. Без innerHTML. */
function richInto(node, str){
  node.textContent='';
  const re=/([_^])\{([^}]*)\}/g; let last=0, m;
  while((m=re.exec(str))){
    if(m.index>last) node.append(str.slice(last,m.index));
    const t=document.createElement(m[1]==='_'?'sub':'sup'); t.textContent=m[2]; node.append(t);
    last=re.lastIndex;
  }
  if(last<str.length) node.append(str.slice(last));
  return node;
}
function plural(n, forms){ const a=Math.abs(n)%100, b=a%10; return forms[(a>10&&a<20)?2:(b>1&&b<5)?1:(b===1?0:2)]; }
function eqSet(a,b){ if(a.length!==b.length) return false; const s=new Set(a); return b.every(x=>s.has(x)); }

/* ===== Load data ===== */
function hideLoader(){ const l=document.getElementById('loader'); if(!l) return; l.classList.add('hide'); setTimeout(()=>l.remove(), 500); }

async function loadDataset(key){
  if(!DATA_CACHE[key]){
    const r = await fetch(DATASETS[key].file);
    if(!r.ok) throw new Error('HTTP '+r.status);
    DATA_CACHE[key] = await r.json();
  }
  return DATA_CACHE[key];
}
async function useDataset(key){
  const data = await loadDataset(key);      // сначала грузим — при ошибке остаёмся на прежнем наборе
  DS_KEY = key; LS_KEY = DATASETS[key].ls;
  try{ localStorage.setItem(DS_STORE, key); }catch(e){}
  stats = load();
  QUESTIONS = data;
  renderHome();
}
useDataset(DS_KEY).then(hideLoader).catch(err=>{
  if(DS_KEY!=='km1'){ DS_KEY='km1'; LS_KEY=DATASETS.km1.ls; stats=load(); useDataset('km1').then(hideLoader).catch(()=>{ failLoad(); }); return; }
  failLoad();
});
function failLoad(){
  $('#home').textContent='';
  const p=el('p',null,'Не удалось загрузить вопросы. Проверьте, что файлы questions*.json лежат рядом с index.html.');
  p.style.cssText='padding:24px;text-align:center'; $('#home').append(p);
  hideLoader();
}

/* ===== Home ===== */
function sections(){
  const map = new Map();
  QUESTIONS.forEach(q=>{ if(!map.has(q.section)) map.set(q.section,{num:q.section,title:q.section_title,ids:[]}); map.get(q.section).ids.push(q.id); });
  return [...map.values()].sort((a,b)=>a.num-b.num);
}
function answeredCount(ids){ return ids.filter(id=>stats[id]&&(stats[id].correct||stats[id].wrong)).length; }
function masteredCount(ids){ return ids.filter(id=>stats[id]&&stats[id].correct>0).length; }

function renderHome(){
  // шапка и переключатель наборов
  const secs = sections();
  $('#qtotal').textContent = QUESTIONS.length;
  $('#secTotal').textContent = secs.length+' '+plural(secs.length,['раздел','раздела','разделов']);
  $('#dsName').textContent = DATASETS[DS_KEY].title;
  const sw=$('#dsSwitch'); sw.textContent='';
  Object.entries(DATASETS).forEach(([k,d])=>{
    const b=el('button','ds-btn'+(k===DS_KEY?' on':''),d.title); b.type='button';
    b.onclick=()=>{ if(k===DS_KEY) return; useDataset(k).catch(()=>alertMsg('Не удалось загрузить набор «'+d.title+'».')); };
    sw.append(b);
  });
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
$('#resetBtn').onclick=()=>{ if(confirm('Сбросить прогресс набора «'+DATASETS[DS_KEY].title+'»?')){ stats={}; save(); renderHome(); } };

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
  const meta=$('#qmeta'); meta.textContent='';
  meta.appendChild(el('span','chip', DS_KEY==='km1' ? `Раздел ${q.section} · №${q.n}` : `${DATASETS[DS_KEY].title} · №${q.n}`));
  const multi=q.correct.length>1;
  if(multi) meta.appendChild(el('span','chip multi','несколько ответов'));
  if(q.uncertain||q.no_mark) meta.appendChild(el('span','chip warn','⚠ проверить'));
  // figure(s): old format — q.figure (имя в images/), new — q.figures (пути)
  const fig=$('#qfigure');
  const figs = q.figures ? q.figures : (q.figure ? ['images/'+q.figure+'.jpg?v=2'] : []);
  if(figs.length){
    fig.className='qfigure'; fig.textContent='';
    const label = q.figure ? figLabel(q.figure) : 'рисунок к вопросу';
    const fail = ()=>{ fig.className='qfigure placeholder'; fig.textContent=''; fig.appendChild(el('div','figcap','📐 Рисунок «'+label+'» не загрузился')); };
    figs.forEach(src=>{ const img=new Image(); img.alt=label; img.onerror=fail; img.src=src; fig.appendChild(img); });
    fig.appendChild(el('div','figcap',label));
  } else { fig.className='qfigure hidden'; fig.textContent=''; }
  // text
  richInto($('#qtext'), q.text || q.q);
  // options (строка или {img})
  const order = s.shuffleOpts ? shuffle(q.options.map((_,i)=>i)) : q.options.map((_,i)=>i);
  const optWrap=$('#options'); optWrap.textContent=''; s.order=order;
  order.forEach(origIdx=>{
    const o=el('div','opt'+(multi?' multi':'')); o.dataset.idx=origIdx;
    o.appendChild(el('div','mark', multi?'✓':'●'));
    o.appendChild(optionNode(q.options[origIdx]));
    o.onclick=()=>toggleOpt(o,origIdx,multi);
    optWrap.appendChild(o);
  });
  $('#explain').className='explain hidden'; $('#explain').textContent='';
  setAction('Проверить', false, false);
  $('.quiz-scroll').scrollTop=0;
}
function figLabel(f){
  const m=f.match(/^fig_(\d+)_(.+)$/);
  if(!m) return f;
  if(m[2].startsWith('q')) return 'рис. к вопросу '+m[2].slice(1);
  return 'рис. '+m[1]+'.'+m[2];
}
function optionNode(opt){
  const d=el('div','otext');
  if(typeof opt==='string') return richInto(d,opt);
  const img=new Image(); img.className='opt-img'; img.alt='вариант ответа (рисунок)'; img.src=opt.img; d.appendChild(img);
  return d;
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
  const ex=$('#explain'); ex.className='explain '+(correct?'ok':'bad'); ex.textContent='';
  if(correct) ex.append('✓ Верно!');
  else {
    ex.append('✗ Неверно. Правильный ответ: ');
    const b=el('b'); ex.append(b);
    q.correct.forEach((i,k)=>{
      if(k) b.append('; ');
      const opt=q.options[i];
      if(typeof opt==='string') b.append(richInto(el('span'),opt));
      else { const im=new Image(); im.className='opt-img'; im.alt='верный вариант'; im.src=opt.img; b.append(im); }
    });
  }
  if(q.uncertain||q.no_mark){
    const note = q.note ? q.note : (q.no_mark
      ? 'В книге этот вопрос не отмечен — ответ выбран логически, перепроверьте по учебнику.'
      : 'Отметка в книге спорная — стоит перепроверить этот ответ.');
    ex.appendChild(el('span','warnnote','⚠ '+note));
  }
  ex.classList.remove('hidden');
  const isLast = s.i>=s.items.length-1;
  setAction(isLast?'Завершить':'Далее', false, true);
  $('#progressBar').style.width=((s.i+1)/s.items.length*100)+'%';
}

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
  document.querySelectorAll('.screen').forEach(sc=>sc.classList.toggle('hidden', sc.id!==name));
  if(name!=='quiz' && TG&&TG.MainButton){ try{TG.MainButton.hide();}catch(e){} }
  window.scrollTo(0,0);
}

/* Мост для модуля «Расчёт режима» (formula-quiz.js, ES-модуль) */
window.SetiApp = { showScreen, renderHome, haptic, alertMsg, get IN_TG(){ return IN_TG; }, TG };
