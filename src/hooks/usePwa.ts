import { useEffect, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

export function usePwa() {
  const [online, setOnline] = useState(navigator.onLine)
  const [offlineReady, setOfflineReady] = useState(false)
  const [updateReady, setUpdateReady] = useState(false)
  const [registrationError, setRegistrationError] = useState('')

  useEffect(() => {
    const connected = () => setOnline(true)
    const disconnected = () => setOnline(false)
    window.addEventListener('online', connected)
    window.addEventListener('offline', disconnected)
    registerSW({
      onOfflineReady: () => setOfflineReady(true),
      onRegisteredSW: (_url, registration) => {
        if (registration?.active) setOfflineReady(true)
      },
      onNeedRefresh: () => setUpdateReady(true),
      onRegisterError: (cause: unknown) => setRegistrationError(
        `Offline setup failed: ${cause instanceof Error ? cause.message : String(cause)}. Keep the app open and retry on a secure connection.`,
      ),
    })
    return () => {
      window.removeEventListener('online', connected)
      window.removeEventListener('offline', disconnected)
    }
  }, [])
  return { online, offlineReady, updateReady, registrationError }
}
