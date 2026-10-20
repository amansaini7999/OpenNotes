import { createRoot } from 'react-dom/client'
import App from './App'
import RecoveryApp from './components/RecoveryApp'
import { PDF_SESSION_KEY } from './recovery'
import './styles.css'

let recovery = new URLSearchParams(location.search).get('recovery') === '1'
if (!recovery) {
  try { recovery = localStorage.getItem(PDF_SESSION_KEY) !== null }
  catch (cause: unknown) { console.error('OpenNotes could not read its interrupted-book marker; opening recovery.', cause); recovery = true }
}
createRoot(document.getElementById('root')!).render(recovery ? <RecoveryApp /> : <App />)
