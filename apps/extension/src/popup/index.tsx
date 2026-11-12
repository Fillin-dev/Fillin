import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { CaptureEditor } from '../capture/CaptureEditor';
import '../styles/global.css';

const container = document.getElementById('root');
const capture = new URLSearchParams(location.search).has('capture') || new URLSearchParams(location.search).has('captureError');
if (capture) document.documentElement.classList.add('capture-page');
if (container) {
  const root = createRoot(container);
  root.render(capture ? <CaptureEditor /> : <App />);
}
