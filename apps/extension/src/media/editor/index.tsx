import React from 'react';
import { createRoot } from 'react-dom/client';
import { MediaEditor } from './MediaEditor';
import '../../styles/global.css';
import './media.css';

const root = document.getElementById('root');
if (root) createRoot(root).render(<MediaEditor />);
