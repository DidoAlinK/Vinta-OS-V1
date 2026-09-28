/**
 * Vinta School OS — Entry Point
 * Mounts the root App component into the DOM.
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Imported before the app so i18next is initialised and `<html lang/dir>` is
// already set when the first render happens. It used to arrive only
// transitively, via themeStore, which left the ordering to import luck.
import './i18n'
import { App } from './app/App'
import './styles/globals.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
