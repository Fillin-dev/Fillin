import { InsertionResult } from '../adapters/InputAdapter';

let cancelCurrent: (() => void) | null = null;
export const isTemplateDialogOpen = () => cancelCurrent !== null;
export const cancelTemplateDialog = () => cancelCurrent?.();

export function showTemplateDialog(options: {
  fields: string[];
  render: (values: Record<string, string>, preview: boolean) => string;
  valid: () => boolean;
  canInsert: boolean;
  copyReason?: string;
  notice?: string;
  insert: (content: string) => Promise<InsertionResult>;
  restore: () => void;
}): Promise<InsertionResult> {
  cancelTemplateDialog();
  return new Promise((resolve) => {
    const host = document.createElement('div');
    host.id = 'fillin-template-host';
    host.dataset.fillinUi = 'true';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; position: fixed; inset: 0; z-index: 2147483647; color-scheme: light; }
      * { box-sizing: border-box; }
      .backdrop { position: fixed; inset: 0; background: #0c142a99; display: flex; align-items: center; justify-content: center; padding: 16px; }
      form { margin: 0; width: 460px; max-width: 100%; max-height: calc(100dvh - 32px); display: flex; flex-direction: column; background: #f7f9fd; color: #172033; border: 1px solid #dce3ef; border-radius: 20px; box-shadow: 0 24px 80px #0004; font: 14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; }
      header { padding: 20px 22px 16px; background: white; border-radius: 20px 20px 0 0; border-bottom: 1px solid #e1e6ef; }
      h2 { font-size: 20px; margin: 0 0 4px; letter-spacing: -.5px; }
      p { margin: 0; color: #526077; font-size: 12px; }
      .body { padding: 18px 22px; overflow-y: auto; min-height: 0; overscroll-behavior: contain; }
      label { display: block; font-weight: 600; font-size: 12px; margin: 0 0 6px; }
      input { display: block; width: 100%; font: inherit; background: white; color: #172033; border: 1px solid #ccd5e4; border-radius: 10px; padding: 10px 12px; margin-bottom: 16px; }
      input[aria-invalid=true] { border-color: #bd3026; }
      h3 { font-size: 11px; color: #526077; letter-spacing: .04em; margin: 6px 0 8px; }
      pre { white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; max-height: 150px; overflow: auto; margin: 0; padding: 14px; background: white; border: 1px solid #e1e6ef; border-radius: 12px; font: inherit; font-size: 13px; }
      .error { color: #9b211a; margin-top: 12px; font-size: 12px; }
      .error[data-success=true] { color: #137052; }
      footer { padding: 14px 22px; display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; border-top: 1px solid #e1e6ef; }
      button { font: inherit; font-size: 12px; font-weight: 600; border: 1px solid #ccd5e4; background: white; color: #344054; padding: 10px 12px; border-radius: 10px; cursor: pointer; }
      button.primary { color: white; border-color: #2457f5; background: #2457f5; }
      button:disabled { opacity: .55; cursor: wait; }
      :focus-visible { outline: 2px solid #2457f5; outline-offset: 3px; }
      @media (prefers-reduced-motion: no-preference) { form { animation: enter .16s ease-out; } @keyframes enter { from { opacity: 0; transform: translateY(8px); } } }
    `;
    shadow.append(style);
    const backdrop = document.createElement('div'); backdrop.className = 'backdrop';
    const form = document.createElement('form'); form.noValidate = true;
    form.setAttribute('role', 'dialog'); form.setAttribute('aria-modal', 'true'); form.setAttribute('aria-labelledby', 'template-title');
    form.setAttribute('aria-describedby', 'template-help');
    const header = document.createElement('header');
    const title = document.createElement('h2'); title.id = 'template-title'; title.textContent = options.fields.length ? 'Fill in snippet' : 'Copy snippet';
    const help = document.createElement('p'); help.id = 'template-help';
    help.textContent = options.canInsert ? 'Answer once. Repeated fields update together. Values are not saved.' :
      options.copyReason || 'This editor needs a manual paste. Complete the fields, then copy your message. Values are not saved.';
    header.append(title, help);
    if (options.notice) {
      const notice = document.createElement('p'); notice.textContent = options.notice;
      notice.setAttribute('role', 'status'); notice.style.cssText = 'color:#2457f5;margin-top:8px'; header.append(notice);
    }
    const body = document.createElement('div'); body.className = 'body';
    const inputs = new Map<string, HTMLInputElement>();
    for (const [index, name] of options.fields.entries()) {
      const label = document.createElement('label'); label.htmlFor = `template-field-${index}`;
      label.textContent = name.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
      const input = document.createElement('input'); input.id = label.htmlFor; input.type = 'text';
      input.required = true; input.maxLength = 2000; input.autocomplete = 'off'; input.spellcheck = false;
      inputs.set(name, input); body.append(label, input);
    }
    const previewLabel = document.createElement('h3'); previewLabel.textContent = 'Preview';
    const preview = document.createElement('pre'); preview.setAttribute('aria-label', 'Completed message preview');
    const error = document.createElement('p'); error.className = 'error'; error.setAttribute('role', 'alert');
    body.append(previewLabel, preview, error);
    const footer = document.createElement('footer');
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel';
    const copy = document.createElement('button'); copy.type = 'button'; copy.textContent = 'Copy completed message';
    const insert = document.createElement('button'); insert.type = 'submit'; insert.className = 'primary'; insert.textContent = 'Insert';
    footer.append(cancel, copy); if (options.canInsert) footer.append(insert); else copy.className = 'primary';
    form.append(header, body, footer); backdrop.append(form); shadow.append(backdrop);
    let done = false;
    let busy = false;
    let copied = false;
    let composing = false;
    const focusFirst = () => (inputs.values().next().value || copy).focus();
    const finish = (result: InsertionResult, restore = true) => {
      if (done) return;
      done = true;
      if (cancelCurrent === dismiss) cancelCurrent = null;
      document.removeEventListener('focusin', containFocus, true);
      window.removeEventListener('pagehide', dismiss);
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', visibility);
      host.remove();
      inputs.forEach((input) => { input.value = ''; }); preview.textContent = '';
      if (restore) options.restore();
      resolve(result);
    };
    const dismiss = () => finish(copied ? 'copied' : 'failed');
    const blur = (event: Event) => { if (event.target === window && !busy) dismiss(); };
    const visibility = () => { if (document.hidden) dismiss(); };
    const containFocus = (event: FocusEvent) => {
      if (!busy && !event.composedPath().includes(host)) focusFirst();
    };
    const values = (previewMode: boolean) => {
      const result: Record<string, string> = Object.create(null);
      inputs.forEach((input, name) => { if (!previewMode || input.value.trim()) result[name] = input.value; });
      return result;
    };
    const updatePreview = () => {
      try { preview.textContent = options.render(values(true), true).slice(0, 100_000); }
      catch { preview.textContent = 'Complete the fields to preview your message.'; }
    };
    inputs.forEach((input) => input.addEventListener('input', () => {
      input.removeAttribute('aria-invalid'); error.textContent = ''; updatePreview();
    }));
    const submit = async (action: 'insert' | 'copy') => {
      if (busy || done || composing) return;
      error.setAttribute('role', 'alert'); delete error.dataset.success;
      const missing = [...inputs.values()].find((input) => !input.value.trim());
      if (missing) { missing.setAttribute('aria-invalid', 'true'); error.textContent = 'Complete each field before continuing.'; missing.focus(); return; }
      busy = true; error.textContent = '';
      [copy, insert, cancel].forEach((button) => { button.disabled = true; });
      inputs.forEach((input) => { input.readOnly = true; });
      try {
        const content = options.render(values(false), false);
        if (content.length > 100_000) throw new Error('The completed message is too long. Shorten the field values.');
        if (!options.valid()) throw new Error('The original field or snippet changed. Cancel and start the shortcut again.');
        if (action === 'copy') {
          if (!navigator.clipboard?.writeText) throw new Error('Copy is unavailable. Your message has not been inserted.');
          await navigator.clipboard.writeText(content);
          // Keep the dialog open for accurate confirmation; no insertion is claimed.
          if (!done) { copied = true; error.textContent = 'Message copied. Paste it in your editor.'; error.setAttribute('role', 'status'); error.dataset.success = 'true'; copy.textContent = 'Copy again'; cancel.textContent = 'Done'; }
        } else {
          const result = await options.insert(content);
          if (result !== 'inserted') throw new Error('Could not insert the message. Nothing was confirmed as inserted.');
          finish('inserted', false);
        }
      } catch (e) {
        if (!done) { error.setAttribute('role', 'alert'); error.textContent = e instanceof Error ? e.message : 'Could not complete this message. Please retry.'; focusFirst(); }
      } finally {
        busy = false;
        [copy, insert, cancel].forEach((button) => { button.disabled = false; });
        inputs.forEach((input) => { input.readOnly = false; });
      }
    };
    cancel.addEventListener('click', dismiss);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop && !busy) dismiss(); });
    form.addEventListener('submit', (e) => { e.preventDefault(); void submit(options.canInsert ? 'insert' : 'copy'); });
    copy.addEventListener('click', () => { void submit('copy'); });
    form.addEventListener('compositionstart', () => { composing = true; });
    form.addEventListener('compositionend', () => { composing = false; });
    shadow.addEventListener('keydown', (event) => {
      const e = event as KeyboardEvent;
      if (e.key === 'Enter' && (e.isComposing || composing)) e.preventDefault();
      if (e.key === 'Escape' && !e.isComposing) { e.preventDefault(); e.stopPropagation(); if (!busy) dismiss(); }
      if (e.key === 'Tab') {
        const nodes = [...inputs.values(), ...Array.from(footer.querySelectorAll('button'))].filter((node) => !node.disabled);
        const current = nodes.indexOf(shadow.activeElement as HTMLInputElement);
        if (nodes.length) { e.preventDefault(); nodes[(current + (e.shiftKey ? -1 : 1) + nodes.length) % nodes.length].focus(); }
      }
      // Keep expansion hotkeys and host form handlers out of template fields.
      e.stopPropagation();
    });
    cancelCurrent = dismiss;
    document.dispatchEvent(new Event('fillin-template-open'));
    document.documentElement.append(host);
    document.addEventListener('focusin', containFocus, true);
    window.addEventListener('pagehide', dismiss);
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', visibility);
    updatePreview(); focusFirst();
  });
}
