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
    console.error('Failed to load levels.json (file:// will fail). Running in Quick Test mode.', err)
    // Fallback: create a quick test level so users can run code without levels.json
    state.levels = [{ id: 0, title: 'Quick Test', description: 'Quick test mode — use console.log to see output', starterCode: '// type JS here and press Run', testCode: 'null', points: 0 }]
    // show a visible UI hint
    const msgEl = document.getElementById('message')
    if(msgEl) msgEl.textContent = 'Warning: could not load levels.json. Running in Quick Test mode. Use a local server for full functionality.'
  }
  loadState()
  renderLevels()
  renderProgress()
  bindControls()
  initializeEditor()
}

// hook up celebration close button
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
  // populate level-specific instructions / example
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
  // hide hint container unless a hint is provided
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
  // Attempt to use CodeMirror if loaded
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
  const harness = makeIframeSrcdoc(code, state.current.testCode)
  const iframe = $('#sandbox')
  // Show immediate feedback while iframe runs
  const resEl = $('#result')
  if(resEl) resEl.textContent = 'Running...'
  if(iframe){
    // make iframe visible and noticeable
    iframe.style.minHeight = '160px'
    iframe.style.width = '100%'
    iframe.style.border = iframe.style.border || '1px solid rgba(0,0,0,0.08)'
    // attach a load listener for diagnostics
    iframe.addEventListener('load', function onLoad(){
      try{ console.debug('iframe loaded (diagnostic)') }catch(e){}
      iframe.removeEventListener('load', onLoad)
    })
    iframe.srcdoc = harness
    // send a ping after a short delay to check message channel
    setTimeout(()=>{
      try{
        if(iframe.contentWindow) iframe.contentWindow.postMessage({type:'ping-from-parent'}, '*')
      }catch(e){ console.debug('ping failed', e) }
    }, 150)
  }
}

function makeIframeSrcdoc(userCode, testCode){
  // Prepare a sandboxed HTML that captures console messages and posts a result.
  // To avoid breaking template literals or backticks in user code we base64-encode
  // the code here and decode/run it inside the iframe using new Function().
  const b64 = (()=>{
    try{ return btoa(unescape(encodeURIComponent(userCode||''))) }catch(e){ return btoa((userCode||'')+"") }
  })();
  const testB64 = (()=>{
    try{ return btoa(unescape(encodeURIComponent(testCode||''))) }catch(e){ return btoa((testCode||'')+"") }
  })();

  return `<!doctype html><html><head><meta charset="utf-8"></head><body>
  <div id="app"></div>
  <script>
    (function(){
      const consoleMessages = [];
      const origLog = console.log;
      function appendConsoleLine(line){
        try{ consoleMessages.push(line); }catch(e){}
        try{
          const app = document.getElementById('app');
          if(!app) return;
          let pre = app.querySelector('pre.console-output');
          if(!pre){ pre = document.createElement('pre'); pre.className = 'console-output'; pre.style.whiteSpace='pre-wrap'; pre.style.marginTop='8px'; app.appendChild(pre); }
          pre.textContent = consoleMessages.join('\n');
        }catch(e){}
      }
      console.log = function(...args){
        const line = args.map(a=>String(a)).join(' ');
        appendConsoleLine(line);
        try{ origLog.apply(console,args); }catch(e){}
      };
      window.consoleMessages = consoleMessages;
      window.appendConsoleLine = appendConsoleLine;
    })();
  </script>
  <style>body{font-family:system-ui,Arial,Helvetica,sans-serif;background:transparent;color:#082026;padding:12px}#app{padding:8px;border:1px dashed rgba(0,0,0,0.08);border-radius:6px;background:rgba(255,255,255,0.02)}</style>
  <script>
    try{
      // decode and execute user code safely via Function constructor
      const userCodeB64 = '${b64}';
      let userCode = '';
      try{
        userCode = decodeURIComponent(escape(atob(userCodeB64)));
      }catch(e){
        try{ userCode = atob(userCodeB64) }catch(e2){ userCode = '' }
      }
      try{
        new Function(userCode)();
      }catch(err){ console.log('ERROR:'+ (err && err.message ? err.message : err)) }
    }catch(e){ console.log('ERROR:'+e && e.message ? e.message : e) }
  </script>
  <script>
    // ensure the app container exists and has a header
    (function ensureApp(){
      try{
        const app = document.getElementById('app');
        if(!app) return;
        // keep a small header then leave console output area for appendConsoleLine
        app.innerHTML = '<strong>Sandbox loaded — console output:</strong>';
        const placeholder = document.createElement('div'); placeholder.textContent = '';
        placeholder.style.marginTop = '6px'; app.appendChild(placeholder);
        // if any console messages already exist, show them
        if(window.consoleMessages && window.consoleMessages.length){
          window.appendConsoleLine(window.consoleMessages.join('\n'));
        }
      }catch(e){}
    })();
  </script>
  <script>
    try{
      // decode test function safely from base64 to avoid injecting raw code into the srcdoc
      const testCodeB64 = '${testB64}';
      let testFn = null;
      try{
        let testStr = '';
        try{ testStr = decodeURIComponent(escape(atob(testCodeB64))); }catch(e){ testStr = atob(testCodeB64) }
        if(testStr && testStr.trim().length){
          try{ testFn = eval('(' + testStr + ')'); }catch(e){ testFn = null }
        }
      }catch(e){ testFn = null }

      // If no test function (null/undefined/false), send console output back as debug/no-test
      if(!testFn){
        parent.postMessage({ debug: true, hasTest: false, consoleMessages: (window.consoleMessages||[]).slice(0,50) }, '*');
      }else{
        Promise.resolve(testFn()).then(result=>{
          parent.postMessage({ ok: !!result, resultValue: result, consoleMessages: (window.consoleMessages||[]).slice(0,50) }, '*');
        }).catch(err=>{
          parent.postMessage({ ok:false, error: String(err), stack: err && err.stack, consoleMessages: (window.consoleMessages||[]).slice(0,50) }, '*');
        })
      }
    }catch(err){
      parent.postMessage({ ok:false, error:String(err), stack: err && err.stack, consoleMessages: (window.consoleMessages||[]).slice(0,50) }, '*')
    }
  </script>
</body></html>`
}

// escapeForTemplate is no longer used because we encode user code safely.

function onMessageFromIframe(e){
  const data = e.data
  if(!data) return
  // Debug: log full payload from iframe for easier troubleshooting
  try{ console.debug('iframe -> parent payload:', data) }catch(e){}

  // If iframe indicates there is no test, display console output instead of treating as a failure
  if(data.debug && data.hasTest === false){
    const msgEl = $('#result')
    if(msgEl) msgEl.textContent = ''
    if(data.consoleMessages && data.consoleMessages.length){
      const m = document.createElement('pre'); m.textContent = data.consoleMessages.join('\n');
      if(msgEl) msgEl.appendChild(m)
    } else {
      if(msgEl) msgEl.textContent = 'No output.'
    }
    return
  }
  if(data.ok){
    $('#result').textContent = '✅ Level solved!'
    awardPoints(state.current.points)
    unlockBadge(`Completed ${state.current.title}`)
    // reset attempts for this level
    if(state.current && state.current.id) state.attempts[state.current.id] = 0
    // mark completed
    if(state.current && state.current.id && !state.completed.includes(state.current.id)){
      state.completed.push(state.current.id)
      // animate the checkmark for the completed level
      const li = document.querySelector(`#levels-list li[data-id='${state.current.id}']`)
      if(li){
        li.classList.add('completed')
        // trigger animation by toggling a class on the child check element
        const check = li.querySelector('.check')
        if(check){
          check.classList.add('animate')
          // remove and re-add to allow replay if needed
          setTimeout(()=>check.classList.remove('animate'), 900)
        }
      }
    }
    updateAttemptsDisplay()
    renderLevels()
    renderProgress()
    nextLevel()
  }else{
    const msg = data.error ? `❌ Error: ${data.error}` : '❌ Tests failed — try again.'
    $('#result').textContent = msg
    if(data.consoleMessages && data.consoleMessages.length) {
      const m = document.createElement('pre'); m.textContent = data.consoleMessages.join('\n');
      $('#result').appendChild(m)
    }
    // increment attempts
    if(state.current && state.current.id){
      const id = state.current.id
      state.attempts[id] = (state.attempts[id]||0) + 1
      updateAttemptsDisplay()
      const attempts = state.attempts[id]
      // show hint after 2 attempts
      if(attempts >= 2 && state.current.hint){
        $('#hint-area').textContent = state.current.hint
        const hc = $('#hint-container')
        if(hc) hc.hidden = false
      }
      // after 3 attempts, allow solution
      if(attempts >= 3 && state.current.solution){
        $('#show-solution').style.display = 'inline-block'
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
  // explicit mapping from level titles to icon + theme
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

    // If badge is in the form 'Completed <Level Title>' map by title
    let svg = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="#fff"/></svg>'
    let theme = ''
    const match = /^Completed\s+(.+)$/i.exec(b)
    if(match){
      const title = match[1].trim()
      const entry = levelMap[title]
      if(entry){ svg = entry.icon; theme = entry.theme }
    }
    // fallback heuristics (keep default svg if nothing matched)
    if(!svg || svg.length < 10){ svg = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="#fff"/></svg>' }

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
  // trigger celebration when all complete
  if(total > 0 && done === total){
    triggerCelebration()
  }
}

function saveState(){ localStorage.setItem('codequest', JSON.stringify({score:state.score,badges:state.badges,attempts:state.attempts,completed:state.completed})) }

function loadState(){ const s = localStorage.getItem('codequest'); if(!s) return; try{ const obj=JSON.parse(s); state.score = obj.score||0; state.badges = obj.badges||[]; state.attempts = obj.attempts||{}; state.completed = obj.completed||[]; $('#score-badge').textContent=`Score: ${state.score}`; renderBadges() }catch(e){}
}

// load celebration flag
if(typeof window !== 'undefined'){
  try{
    const raw = localStorage.getItem('codequest')
    if(raw){ const o = JSON.parse(raw); state.allCompleteShown = !!o.allCompleteShown }
  }catch(e){}
}

init().catch(err=>console.error(err))
