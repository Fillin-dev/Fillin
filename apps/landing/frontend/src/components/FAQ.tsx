import React from 'react';

export const FAQ = () => {
  const faqs = [
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

  return (
    <section id="faq" className="section-shell section-space">
      <div className="mb-8">
        <p className="eyebrow mb-3">A few good questions</p>
        <h2 className="section-title">Before you get started.</h2>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {faqs.map((faq, index) => (
          <div key={index} className="surface-card p-6">
            <h3 className="feature-title">{faq.question}</h3>
            <p className="muted-text text-sm">{faq.answer}</p>
          </div>
        ))}
      </div>
    </section>
  );
};
