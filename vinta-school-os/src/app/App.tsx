/**
 * Vinta School OS — Root App Component
 * Composes Providers and Router into the top-level application.
 */

import { Providers } from './providers'
import { AppRouter } from './router'

export function App() {
  return (
    <Providers>
      <AppRouter />
    </Providers>
  )
}

export default App
