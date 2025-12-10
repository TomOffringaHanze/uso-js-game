// Reset/clear game helper — apart bestand om te voorkomen dat we de hoofdapp logic aanraken
function clearGame(){
  if(!confirm('Alle voortgang wissen? Hiermee worden score, badges en voltooide niveaus opnieuw ingesteld.')) return
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
    alert('Voortgang gewist.')
  }catch(e){
    console.error('clearGame error', e)
    alert('Fout bij het wissen van voortgang. Controleer console.')
  }
}

document.addEventListener('click', (e)=>{
  if(e.target && e.target.id === 'reset-game') clearGame()
})

// expose for console
window.clearGame = clearGame
