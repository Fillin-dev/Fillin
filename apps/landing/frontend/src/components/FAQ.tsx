import React from 'react';
import { Plus } from 'lucide-react';

const questions = [
  {
    question: 'Where does Fillin work?',
    answer:
      'Use Fillin in website text fields and rich-text editors. Browser address bars, settings pages, and password fields are excluded.',
  },
  {
    question: 'Is my data secure?',
    answer:
      'Snippets stay in your browser. Export a JSON backup before removing the extension or switching browsers.',
  },
  {
    question: 'What if I forget my snippet trigger?',
    answer:
      'Press ⌘ + Shift + K on Mac, or Ctrl + Shift + K on Windows. Search your library and press Enter to insert a snippet.',
  },
  {
    question: 'Is Fillin free?',
    answer: 'Yes. Fillin is free and open-source, with no account required.',
  },
];

export const FAQ = () => (
  <section id="faq" className="section-shell section-space faq-layout">
    <div>
      <p className="section-kicker">A few good questions</p>
      <h2 className="section-title">
        Good questions.
        <br />
        <span className="serif-muted">Simple answers.</span>
      </h2>
    </div>
    <div className="faq-list">
      {questions.map(({ question, answer }) => (
        <details key={question} className="faq-item">
          <summary>
            <span>{question}</span>
            <Plus size={18} strokeWidth={1.5} aria-hidden="true" />
          </summary>
          <div className="faq-answer">
            <p>{answer}</p>
          </div>
        </details>
      ))}
    </div>
  </section>
);
