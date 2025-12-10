// Minimal vanilla JS game runner with CodeMirror and hints
const state = {
  levels: [],
  current: null,
  score: 0,
  startTime: null,
  badges: [],
  attempts: {},
  completed: [],
  editor: null
}

const $ = sel => document.querySelector(sel)

async function init(){
  try{
    const res = await fetch('levels.json')
    state.levels = await res.json()
  }catch(err){
    console.error('Failed to load levels.json', err)
    state.levels = [{ id: 0, title: 'Quick Test', description: 'Quick test mode — use console.log to see output', starterCode: '// type JS here and press Run', testCode: 'null', points: 0 }]
  }
  loadState()
  renderLevels()
  renderProgress()
  bindControls()
  initializeEditor()
}

document.addEventListener('click', (e)=>{
  if(e.target && e.target.id === 'celebration-close') hideCelebration()
})

function renderLevels(){
  const list = $('#levels-list')
  list.innerHTML = ''
  state.levels.forEach(l=>{
    const li = document.createElement('li')
    li.dataset.id = l.id
    const meta = document.createElement('div')
    meta.className = 'level-meta'
    const title = document.createElement('div')
    title.textContent = `${l.id}. ${l.title}`
    const check = document.createElement('div')
    check.className = 'check'
    check.textContent = state.completed.includes(l.id) ? '✓' : ''
    meta.appendChild(title)
    meta.appendChild(check)
    li.appendChild(meta)
    li.addEventListener('click', ()=>selectLevel(l.id))
    if(state.completed.includes(l.id)) li.classList.add('completed')
    list.appendChild(li)
  })
}

function selectLevel(id){
  const level = state.levels.find(l=>l.id==id)
  state.current = level
  $('#level-title').textContent = `${level.id}. ${level.title}`
  $('#level-desc').textContent = level.description
  const li = $('#level-instructions')
  const ex = $('#level-example')
  if(li) li.textContent = level.description
  if(ex) ex.textContent = level.starterCode || ''
  if(state.editor) state.editor.setValue(level.starterCode || '')
  else $('#code').value = level.starterCode || ''
  document.querySelectorAll('#levels-list li').forEach(li=>li.classList.toggle('active',li.dataset.id==id))
  $('#result').textContent = ''
  $('#level-badge').textContent = `Level: ${level.id}`
  updateAttemptsDisplay()
  $('#hint-area').textContent = ''
  $('#show-solution').style.display = 'none'
  const hintContainer = $('#hint-container')
  if(hintContainer) hintContainer.hidden = true
  startTimer()
}

function bindControls(){
  $('#run').addEventListener('click', runCode)
  $('#reset').addEventListener('click', ()=>{
    if(state.current){
      if(state.editor) state.editor.setValue(state.current.starterCode || '')
      else $('#code').value = state.current.starterCode || ''
    }
  })
  $('#show-solution').addEventListener('click', ()=>{
    if(state.current && state.current.solution){
      $('#hint-area').textContent = state.current.solution
    }
  })
  window.addEventListener('message', onMessageFromIframe)
}

function initializeEditor(){
  if(window.CodeMirror){
    state.editor = CodeMirror.fromTextArea($('#code'), {
      mode: 'javascript',
      lineNumbers: true,
      theme: 'material',
      indentUnit: 2,
      tabSize: 2,
      autofocus: true
    })
    state.editor.setSize('100%', '260px')
  }
}

function validateVanilla(code){
  const forbidden = ['import ', 'require(', 'document.write(', '<script', 'fetch(']
  for(const f of forbidden) if(code.includes(f)) return `Forbidden token: ${f}`
  return null
}

function runCode(){
  if(!state.current){ $('#message').textContent='Pick a level first'; return }
  $('#message').textContent=''
  const code = state.editor ? state.editor.getValue() : $('#code').value
  const bad = validateVanilla(code)
  if(bad){ $('#message').textContent = bad; return }
  $('#result').textContent = 'Running...'
  const harness = makeIframeSrcdoc(code, state.current.testCode)
  const iframe = $('#sandbox')
  if(iframe) iframe.srcdoc = harness
}

function makeIframeSrcdoc(userCode, testCode){
  const b64 = btoa(unescape(encodeURIComponent(userCode||'')))
  const testCodeStr = (testCode || 'null')
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:system-ui;color:#333;padding:12px;background:#fff}pre{background:#f5f5f5;padding:8px;border-radius:4px;overflow-x:auto}</style></head><body>
  <div id="output"></div>
  <script>
    (function(){
      const messages = [];
      const origLog = console.log;
      console.log = function(...args){
        messages.push(args.map(a=>String(a)).join(' '));
        origLog.apply(console, args);
      };
      window.__messages = messages;
    })();
  </script>
  <script>
    try{
      const code = decodeURIComponent(escape(atob('${b64}')));
      new Function(code)();
    }catch(err){
      console.log('ERROR: ' + err.message);
    }
  </script>
  <script>
    try{
      // Make consoleMessages available globally so test functions can access it
      window.consoleMessages = window.__messages || [];
      const testFn = ${testCodeStr};
      if(!testFn || typeof testFn !== 'function'){
        parent.postMessage({ type: 'result', ok: false, messages: (window.__messages || []).slice(0, 50), hasTest: false }, '*');
      }else{
        Promise.resolve(testFn()).then(result=>{
          parent.postMessage({ type: 'result', ok: !!result, messages: (window.__messages || []).slice(0, 50), hasTest: true }, '*');
        }).catch(err=>{
          console.log('Test error: ' + err.message);
          parent.postMessage({ type: 'result', ok: false, messages: (window.__messages || []).slice(0, 50), hasTest: true }, '*');
        });
      }
    }catch(err){
      console.log('Test setup error: ' + err.message);
      parent.postMessage({ type: 'result', ok: false, messages: (window.__messages || []).slice(0, 50), hasTest: false }, '*');
    }
  </script>
  <script>
    (function renderOutput(){
      const out = document.getElementById('output');
      if(out && window.__messages && window.__messages.length){
        const pre = document.createElement('pre');
        pre.textContent = window.__messages.join('\\n');
        out.appendChild(pre);
      }
    })();
  </script>
</body></html>`
}

function onMessageFromIframe(e){
  const data = e.data
  if(!data || data.type !== 'result') return
  
  const resultEl = $('#result')
  if(!resultEl) return
  
  // Show console messages in #result
  if(data.messages && data.messages.length){
    resultEl.textContent = ''
    const pre = document.createElement('pre')
    pre.textContent = data.messages.join('\n')
    pre.style.whiteSpace = 'pre-wrap'
    pre.style.maxHeight = '200px'
    pre.style.overflow = 'auto'
    resultEl.appendChild(pre)
  }else{
    resultEl.textContent = 'No output.'
  }
  
  if(data.ok){
    resultEl.textContent = '✅ Level solved!'
    awardPoints(state.current.points)
    unlockBadge(`Completed ${state.current.title}`)
    if(state.current && state.current.id) state.attempts[state.current.id] = 0
    if(state.current && state.current.id && !state.completed.includes(state.current.id)){
      state.completed.push(state.current.id)
      const li = document.querySelector(`#levels-list li[data-id='${state.current.id}']`)
      if(li){
        li.classList.add('completed')
        const check = li.querySelector('.check')
        if(check){
          check.classList.add('animate')
          setTimeout(()=>check.classList.remove('animate'), 900)
        }
      }
    }
    updateAttemptsDisplay()
    renderLevels()
    renderProgress()
    nextLevel()
  }else{
    if(!data.hasTest){
      // No test — just show console output already displayed above
    }else{
      // Test failed
      resultEl.textContent = '❌ Tests failed — try again.'
      if(data.messages && data.messages.length){
        const pre = document.createElement('pre')
        pre.textContent = data.messages.join('\n')
        pre.style.whiteSpace = 'pre-wrap'
        resultEl.appendChild(pre)
      }
      if(state.current && state.current.id){
        const id = state.current.id
        state.attempts[id] = (state.attempts[id]||0) + 1
        updateAttemptsDisplay()
        const attempts = state.attempts[id]
        if(attempts >= 2 && state.current.hint){
          $('#hint-area').textContent = state.current.hint
          const hc = $('#hint-container')
          if(hc) hc.hidden = false
        }
        if(attempts >= 3 && state.current.solution){
          $('#show-solution').style.display = 'inline-block'
        }
      }
    }
  }
  saveState()
}

function updateAttemptsDisplay(){
  const id = state.current && state.current.id
  const n = id ? (state.attempts[id]||0) : 0
  $('#attempts').textContent = `Attempts: ${n}`
}

function awardPoints(n){ state.score += n; $('#score-badge').textContent = `Score: ${state.score}` }

function nextLevel(){
  const curId = state.current.id
  const next = state.levels.find(l=>l.id>curId)
  if(next){
    setTimeout(()=>selectLevel(next.id),800)
  }else{
    $('#result').textContent += ' 🎉 You finished all levels!'
  }
}

function startTimer(){ state.startTime = Date.now(); updateTime() }

function updateTime(){
  if(!state.startTime) return
  const s = Math.floor((Date.now()-state.startTime)/1000)
  $('#time-badge').textContent = `Time: ${s}s`
  requestAnimationFrame(updateTime)
}

function unlockBadge(name){ if(!state.badges.includes(name)) state.badges.push(name); renderBadges() }

function renderBadges(){
  const list = $('#badges-list');
  list.innerHTML = '';
  const levelMap = {
    'Say Hello': { icon: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M20 2H4a2 2 0 00-2 2v14l4-2h14a2 2 0 002-2V4a2 2 0 00-2-2z" fill="#fff"/></svg>', theme: 'bronze' },
    'Your Name': { icon: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="8" r="3" fill="#fff"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6" fill="#fff"/></svg>', theme: 'bronze' },
    'Add Numbers': { icon: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M7 11h10v2H7zM12 6h2v4h-2zM4 6h2v2H4zM18 16h2v2h-2z" fill="#fff"/></svg>', theme: 'bronze' },
    'Full Name': { icon: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="4" width="18" height="16" rx="2" fill="#fff"/></svg>', theme: 'silver' },
    'Change a Variable': { icon: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2v6l4-2 4 2V2" fill="#fff"/><rect x="4" y="10" width="16" height="12" rx="2" fill="#fff"/></svg>', theme: 'silver' },
    'If Statement Basic': { icon: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M6 3a3 3 0 100 6 3 3 0 000-6zM18 3a3 3 0 100 6 3 3 0 000-6zM12 12v-3l-4 2v5" fill="#fff"/></svg>', theme: 'silver' },
    'Equality Check': { icon: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="11" width="16" height="9" rx="2" fill="#fff"/><path d="M8 11V8a4 4 0 018 0v3" fill="#fff"/></svg>', theme: 'gold' },
    'Logical Condition': { icon: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M9 12l2 2 4-4" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>', theme: 'gold' },
    'Sum with Loop': { icon: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M21 12a9 9 0 11-3-6.7L21 5v7z" fill="#fff"/></svg>', theme: 'gold' },
    'Loop over Array': { icon: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="6" width="6" height="12" rx="1" fill="#fff"/><rect x="9" y="6" width="6" height="12" rx="1" fill="#fff"/><rect x="15" y="6" width="6" height="12" rx="1" fill="#fff"/></svg>', theme: 'gold' }
  };

  state.badges.forEach(b=>{
    const d = document.createElement('div');
    d.className = 'badge';
    const iconWrap = document.createElement('span');
    iconWrap.className = 'b-icon';
    const label = document.createElement('div');
    label.textContent = b;

    let svg = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="#fff"/></svg>'
    let theme = ''
    const match = /^Completed\s+(.+)$/i.exec(b)
    if(match){
      const title = match[1].trim()
      const entry = levelMap[title]
      if(entry){ svg = entry.icon; theme = entry.theme }
    }

    d.classList.add(theme ? theme : '');
    iconWrap.innerHTML = svg;
    d.appendChild(iconWrap);
    d.appendChild(label);
    list.appendChild(d);
  })
}

function triggerCelebration(){
  if(state.allCompleteShown) return
  state.allCompleteShown = true
  saveState()
  const modal = document.getElementById('celebration')
  const canvas = document.getElementById('confetti-canvas')
  if(modal) modal.style.display = 'flex'
  if(canvas) canvas.style.display = 'block'
  startConfetti(canvas, 3000)
}

function hideCelebration(){
  const modal = document.getElementById('celebration')
  const canvas = document.getElementById('confetti-canvas')
  if(modal) modal.style.display = 'none'
  if(canvas) canvas.style.display = 'none'
}

function startConfetti(canvas, duration=3000){
  if(!canvas) return
  const ctx = canvas.getContext('2d')
  const DPR = window.devicePixelRatio || 1
  function resize(){ canvas.width = window.innerWidth * DPR; canvas.height = window.innerHeight * DPR; ctx.scale(DPR,DPR) }
  resize(); window.addEventListener('resize', resize)
  const pieces = []
  const colors = ['#ffcd4a','#ff6b6b','#6be8b3','#6bbcff','#d17bff']
  for(let i=0;i<120;i++){
    pieces.push({x:Math.random()*window.innerWidth, y:Math.random()*-window.innerHeight, vx:(Math.random()-0.5)*6, vy:Math.random()*6+2, size:Math.random()*8+6, color:colors[Math.floor(Math.random()*colors.length)], rot:Math.random()*360, vr:(Math.random()-0.5)*10})
  }
  let start = performance.now()
  function draw(t){
    const dt = t - start
    ctx.clearRect(0,0,canvas.width,canvas.height)
    for(const p of pieces){
      p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.rot += p.vr
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot * Math.PI / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size*0.6);
      ctx.restore();
    }
    if(t - start < duration) requestAnimationFrame(draw)
    else { ctx.clearRect(0,0,canvas.width,canvas.height); window.removeEventListener('resize', resize); if(canvas) canvas.style.display='none' }
  }
  requestAnimationFrame(draw)
}

function renderProgress(){
  const total = state.levels.length || 0;
  const done = state.completed.length || 0;
  const pct = total ? Math.round((done/total)*100) : 0;
  const fill = $('#progress-fill');
  const text = $('#progress-text');
  if(fill) fill.style.width = pct + '%';
  if(text) text.textContent = `${done} / ${total}`;
  if(total > 0 && done === total){
    triggerCelebration()
  }
}

function saveState(){ localStorage.setItem('codequest', JSON.stringify({score:state.score,badges:state.badges,attempts:state.attempts,completed:state.completed})) }

function loadState(){ const s = localStorage.getItem('codequest'); if(!s) return; try{ const obj=JSON.parse(s); state.score = obj.score||0; state.badges = obj.badges||[]; state.attempts = obj.attempts||{}; state.completed = obj.completed||[]; $('#score-badge').textContent=`Score: ${state.score}`; renderBadges() }catch(e){} }

if(typeof window !== 'undefined'){
  try{
    const raw = localStorage.getItem('codequest')
    if(raw){ const o = JSON.parse(raw); state.allCompleteShown = !!o.allCompleteShown }
  }catch(e){}
}

init().catch(err=>console.error(err))
