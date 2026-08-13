import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { isTauri } from '@tauri-apps/api/core'
import './index.css'
import App from './App.tsx'
import { getAppDb } from './db/bootstrap'

// Migrate, guard and seed the real database (T-004), then hand the promise to
// <App>, which renders its loading / ready / failed states (T-005). Starting it
// here rather than inside a component means the work begins while React is
// still mounting, and the promise identity stays stable across re-renders.
//
// Outside the Tauri window there is no database to open at all: `invoke` does
// not exist in a plain browser, so `npm run dev` on its own would fail deep
// inside the bridge with something unreadable. Rejecting up front says the
// useful thing instead, through the same failure screen a real fault uses.
const database = isTauri()
  ? getAppDb()
  : Promise.reject(
      new Error(
        'This app reaches its database through the desktop shell, which is not running. ' +
          'Start it with `npm run tauri dev` rather than `npm run dev`.',
      ),
    )

// <App> renders this rejection; this only marks it handled, so the browser does
// not report an unhandled rejection in the moment before React mounts.
database.catch(() => {})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App db={database} />
  </StrictMode>,
)
