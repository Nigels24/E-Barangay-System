import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { isTauri } from '@tauri-apps/api/core'
import './index.css'
import App from './App.tsx'
import { getAppDb } from './db/bootstrap'

// Migrate, guard and seed the real database before any screen needs it
// (T-004). `isTauri()` keeps this from trying to `invoke` when the same
// frontend is opened in a plain browser (`npm run dev` without the Tauri
// shell) instead of the desktop window. No UI consumes the handle yet —
// that is the next task — so a failure here is logged, not surfaced. Wiring
// it to a visible message belongs with the screens that need the data.
if (isTauri()) {
  getAppDb().catch((error: unknown) => {
    console.error('[ebarangay] database bootstrap failed:', error)
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
