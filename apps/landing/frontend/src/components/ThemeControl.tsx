import React, {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';

type Preference = 'system' | 'light' | 'dark';
const STORAGE_KEY = 'fillin-theme';
const ThemeContext = createContext<{
  preference: Preference;
  change: (value: Preference) => void;
} | null>(null);

function readPreference(): Preference {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* The theme switch still works without persistent storage. */
  }
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
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* Apply for this visit. */
    }
  };

  return <ThemeContext.Provider value={{ preference, change }}>{children}</ThemeContext.Provider>;
}

export function ThemeControl({ compact = false }: { compact?: boolean }) {
  const theme = useContext(ThemeContext);
  const id = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    wrapperRef.current?.querySelector<HTMLInputElement>('input:checked')?.focus();
    const outside = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  if (!theme) throw new Error('ThemeControl requires ThemeProvider');
  const options = [
    { value: 'light', label: 'Light', Icon: Sun },
    { value: 'dark', label: 'Dark', Icon: Moon },
    { value: 'system', label: 'System', Icon: Monitor },
  ] as const;
  const CurrentIcon = options.find((option) => option.value === theme.preference)!.Icon;
  return (
    <div
      ref={wrapperRef}
      onBlur={(event) => {
        // Clicking a label can briefly blur to the document before its radio is focused.
        if (
          open &&
          event.relatedTarget &&
          !event.currentTarget.contains(event.relatedTarget as Node)
        )
          setOpen(false);
      }}
      className={compact ? 'theme-control theme-control-compact' : 'theme-control'}
    >
      {compact && (
        <button
          ref={triggerRef}
          type="button"
          className="theme-menu-trigger liquid-glass"
          aria-label="Choose color theme"
          aria-expanded={open}
          aria-controls={`${id}-choices`}
          onClick={() => setOpen((value) => !value)}
        >
          <CurrentIcon size={17} aria-hidden="true" />
        </button>
      )}
      <div
        id={`${id}-choices`}
        role="radiogroup"
        aria-label="Color theme"
        className="theme-switch"
        data-open={open}
        style={
          {
            '--theme-index': options.findIndex((option) => option.value === theme.preference),
          } as React.CSSProperties
        }
      >
        <span className="theme-switch-thumb" aria-hidden="true" />
        {options.map(({ value, label, Icon }) => (
          <label key={value} className={`theme-option theme-option-${value}`}>
            <input
              type="radio"
              className="sr-only"
              name={`theme-${id}`}
              value={value}
              checked={theme.preference === value}
              onChange={() => {
                theme.change(value);
                if (open) {
                  setOpen(false);
                  triggerRef.current?.focus();
                }
              }}
              aria-label={label}
            />
            <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
            <span className="theme-tooltip" aria-hidden="true">
              {value === 'system' ? 'Use system theme' : `${label} mode`}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
