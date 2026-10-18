import { useEffect, useState } from 'react'
import { Download, Share, PlusSquare } from 'lucide-react'
import { Dialog } from './Dialog'

export function InstallApp({ offlineReady }: { offlineReady: boolean }) {
  const [open, setOpen] = useState(false)
  const [installed, setInstalled] = useState(() =>
    matchMedia('(display-mode: standalone)').matches || ('standalone' in navigator && navigator.standalone === true),
  )
  useEffect(() => {
    const mode = matchMedia('(display-mode: standalone)')
    const changed = () => setInstalled(mode.matches || ('standalone' in navigator && navigator.standalone === true))
    const installed = () => setInstalled(true)
    mode.addEventListener('change', changed)
    window.addEventListener('appinstalled', installed)
    return () => {
      mode.removeEventListener('change', changed)
      window.removeEventListener('appinstalled', installed)
    }
  }, [])
  if (installed) return null
  return <>
    <button className="install-button" onClick={() => setOpen(true)}><Download size={15} /> Install app</button>
    {open && <Dialog title="Install OpenNotes" onClose={() => setOpen(false)}>
      <div className="help-content">
        <p>Keep OpenNotes on your Home Screen and use it offline. On iPad, installation is done through the browser, not a downloaded file.</p>
        <h3>On iPad or iPhone</h3>
        <ol className="install-steps">
          <li>Open this address in <strong>Safari</strong>.</li>
          <li>Tap <Share size={16} aria-hidden="true" /> <strong>Share</strong> in Safari's toolbar or menu.</li>
          <li>Scroll through the actions and select <PlusSquare size={16} aria-hidden="true" /> <strong>Add to Home Screen</strong>. Enable <strong>Open as Web App</strong> if shown, then tap <strong>Add</strong>.</li>
          <li>Launch OpenNotes using its new Home Screen icon.</li>
        </ol>
        <h3>On desktop Chrome</h3>
        <p>Use the install icon in the address bar, or Chrome's menu → Cast, save, and share → Install page as app. Menu wording can vary by version.</p>
        <p role="status" className="install-readiness">{offlineReady ? 'Ready for offline use on this browser.' : 'Keep this page open while offline resources are prepared. Check Help & install for readiness before disconnecting.'}</p>
        <p>After installing, open the app online once and confirm offline readiness there too. Export backups regularly; browser and installed-app storage can differ.</p>
      </div>
    </Dialog>}
  </>
}
