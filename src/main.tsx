import { Buffer } from 'buffer';
window.Buffer = Buffer;
(window as any).global = window;
(window as any).process = { env: {} };

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
