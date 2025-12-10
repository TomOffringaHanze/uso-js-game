// Reset/clear game helper — separate file to avoid touching main app logic
function clearGame(){
  if(!confirm('Clear all progress? This will reset score, badges and completed levels.')) return
  try{ localStorage.removeItem('codequest') }catch(e){}
  // reset in-memory state if available
  try{
    if(window.state){
      state.score = 0
      state.badges = []
      state.attempts = {}
      state.completed = []
      state.allCompleteShown = false
    }
    // UI updates (best-effort)
    const s = document.getElementById('score-badge'); if(s) s.textContent = 'Score: 0'
    const res = document.getElementById('result'); if(res) res.textContent = ''
    const hc = document.getElementById('hint-container'); if(hc) hc.hidden = true
    if(window.renderBadges) renderBadges()
    if(window.renderLevels) renderLevels()
    if(window.renderProgress) renderProgress()
    if(window.updateAttemptsDisplay) updateAttemptsDisplay()
    if(window.state && window.state.editor){
      state.editor.setValue(state.current ? (state.current.starterCode||'') : '')
    }else if(window.state && state.current){
      const ta = document.getElementById('code'); if(ta) ta.value = state.current.starterCode || ''
    }
    alert('Progress cleared.')
  }catch(e){
    console.error('clearGame error', e)
    alert('Error while clearing progress. Check console.')
  }
}

document.addEventListener('click', (e)=>{
  if(e.target && e.target.id === 'reset-game') clearGame()
})

// expose for console
window.clearGame = clearGame
