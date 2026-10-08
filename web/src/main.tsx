import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { MINIAPP } from './env.ts';
import { initMiniapp } from './miniapp.ts';
import './styles.css';
import './mobile.css';

if (MINIAPP) initMiniapp();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
