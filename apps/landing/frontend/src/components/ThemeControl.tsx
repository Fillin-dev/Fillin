import React, { createContext, useContext, useEffect, useId, useLayoutEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';

type Preference = 'system' | 'light' | 'dark';
const STORAGE_KEY = 'fillin-theme';
const ThemeContext = createContext<{ preference: Preference; change: (value: Preference) => void } | null>(null);

function readPreference(): Preference {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* The theme switch still works without persistent storage. */ }
  return 'system';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreference] = useState<Preference>(readPreference);

  useLayoutEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = preference === 'dark' || (preference === 'system' && media.matches);
      document.documentElement.classList.toggle('dark', dark);
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [preference]);

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) {
        setPreference(readPreference());
      }
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  const change = (value: Preference) => {
    setPreference(value);
    try { localStorage.setItem(STORAGE_KEY, value); } catch { /* Apply for this visit. */ }
  };

  return <ThemeContext.Provider value={{ preference, change }}>{children}</ThemeContext.Provider>;
}

export function ThemeControl() {
  const theme = useContext(ThemeContext);
  const id = useId();
  if (!theme) throw new Error('ThemeControl requires ThemeProvider');
  const options = [
    { value: 'light', label: 'Light', Icon: Sun },
    { value: 'dark', label: 'Dark', Icon: Moon },
    { value: 'system', label: 'System', Icon: Monitor },
  ] as const;
  return (
    <div role="radiogroup" aria-label="Color theme" className="theme-switch" style={{ '--theme-index': options.findIndex(option => option.value === theme.preference) } as React.CSSProperties}>
      <span className="theme-switch-thumb" aria-hidden="true" />
      {options.map(({ value, label, Icon }) => (
        <label key={value} className={`theme-option theme-option-${value}`}>
          <input type="radio" className="sr-only" name={`theme-${id}`} value={value} checked={theme.preference === value} onChange={() => theme.change(value)} aria-label={label} />
          <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
          <span className="theme-tooltip" aria-hidden="true">{value === 'system' ? 'Use system theme' : `${label} mode`}</span>
        </label>
      ))}
    </div>
  );
}
