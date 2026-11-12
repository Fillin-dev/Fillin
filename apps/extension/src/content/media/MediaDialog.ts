import type { MediaSnippet } from '@fillin/shared';
import { bookmarkEditable, bookmarkField, fieldAllowed } from '../templates/bookmarks';
import { caretRect } from '../suggestions/caret';
import { GoogleDocsAdapter } from '../adapters/GoogleDocsAdapter';
import { insertPracticeMedia } from '../../media/PracticeInsertion';
import { transferSelectedMedia } from '../../media/transfer';
import type { TemplateBookmark, InsertionResult } from '../adapters/InputAdapter';

let current: (() => void) | null = null;
export const isMediaDialogOpen = () => current !== null;
export const cancelMediaDialog = () => current?.();

export function mediaTargetAllowed(target: Element | null): target is HTMLElement {
  if (
    !(target instanceof HTMLElement) ||
    !target.isConnected ||
    target.closest('[inert],fieldset:disabled,[aria-readonly="true"],[id^="fillin-"]')
  )
    return false;
  if (
    /password|one-time-code/i.test(
      target.closest('[autocomplete]')?.getAttribute('autocomplete') || ''
    )
  )
    return false;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)
    return fieldAllowed(target) && !target.matches(':disabled');
  if (
    GoogleDocsAdapter.isGoogleDocs() &&
    (target === document.body || GoogleDocsAdapter.isDocsCanvas(target))
  )
    return true;
  return target.isContentEditable && !target.closest('[contenteditable="false"]');
}
function nativeRichText(target: HTMLElement): boolean {
  const domains = [
    'google.com',
    'notion.so',
    'notion.site',
    'slack.com',
    'discord.com',
    'whatsapp.com',
    'office.com',
    'live.com',
    'microsoft.com',
  ];
  return (
    target.isContentEditable &&
    target.contentEditable !== 'plaintext-only' &&
    !domains.some(
      (domain) => location.hostname === domain || location.hostname.endsWith('.' + domain)
    ) &&
    !target.closest(
      '.ProseMirror,.ql-editor,.ck-editor,[data-lexical-editor],[data-slate-editor],[data-block-id]'
    )
  );
}

/** Shadow DOM provides style isolation, not secrecy from the host page. */
export function showMediaDialog(
  target: Element | null,
  snippet: MediaSnippet,
  start: number,
  end: number,
  eligible: () => boolean,
  fallbackOnly = false
): Promise<InsertionResult> {
  if (!mediaTargetAllowed(target) || !eligible()) return Promise.resolve('failed');
  cancelMediaDialog();
  const element = target,
    selection = getSelection(),
    node = selection?.anchorNode;
  const range = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
  const bookmark: TemplateBookmark | null =
    element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
      ? bookmarkField(element, start, end)
      : bookmarkEditable(element, start, end);
  const canInsert =
    !fallbackOnly && nativeRichText(element) && !!bookmark && node?.nodeType === Node.TEXT_NODE;
  const valid = () =>
    eligible() && mediaTargetAllowed(element) && (!bookmark || bookmark.isValid());
  return new Promise((resolve) => {
    const host = document.createElement('div');
    host.id = 'fillin-media-host';
    host.dataset.fillinUi = 'true';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `:host{all:initial;position:fixed;inset:0;z-index:2147483647;color-scheme:light}*{box-sizing:border-box}.backdrop{position:fixed;inset:0;background:#17203319}.panel{position:fixed;width:350px;max-width:calc(100vw - 24px);max-height:calc(100dvh - 24px);overflow:auto;background:#fff;color:#172033;border:1px solid #cbd6e8;border-radius:17px;box-shadow:0 16px 60px #18243c30;padding:18px;font:13px/1.5 system-ui}h2{font-size:19px;margin:0 0 6px;overflow-wrap:anywhere}p{font-size:12px;color:#526079;margin:8px 0;overflow-wrap:anywhere}.visual{background:#f1f4fa;border-radius:10px;min-height:90px;display:flex;align-items:center;justify-content:center;position:relative;margin:14px 0;overflow:hidden}.visual img{max-width:100%;max-height:180px;object-fit:contain}.caption{white-space:pre-wrap;padding:10px;background:#f6f8fc;border-radius:8px}button{font:600 12px/1.4 system-ui;color:#344054;background:white;border:1px solid #cbd6e8;border-radius:9px;padding:9px 11px;cursor:pointer;min-height:38px}button:disabled{opacity:.5;cursor:wait}button.primary{background:#2457f5;color:white;border-color:#2457f5}.actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:15px}.play{position:absolute;bottom:6px;right:6px;padding:5px 9px;min-height:30px;font-size:11px}label{display:flex;align-items:center;gap:8px;margin:10px 0;font-size:12px}input{accent-color:#2457f5}.error{color:#9b2c20}:focus-visible{outline:2px solid #2457f5;outline-offset:3px}`;
    const backdrop = document.createElement('div');
    backdrop.className = 'backdrop';
    const panel = document.createElement('section');
    panel.className = 'panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'media-title');
    const title = document.createElement('h2');
    title.id = 'media-title';
    title.textContent = `Preview ${snippet.trigger}`;
    const help = document.createElement('p');
    help.textContent = canInsert
      ? 'Insert into this rich-text field. Check your message before sending.'
      : 'This editor needs a manual paste or attachment. Your original text will stay unchanged.';
    const visual = document.createElement('div');
    visual.className = 'visual';
    const image = document.createElement('img');
    image.alt = snippet.alt;
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'play';
    play.textContent = 'Play GIF';
    play.hidden = true;
    visual.append(image, play);
    const check = (text: string, checked: boolean, hidden: boolean) => {
      const label = document.createElement('label'),
        input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = checked;
      label.hidden = hidden;
      label.append(input, document.createTextNode(text));
      panel.append(label);
      return input;
    };
    panel.append(title, help, visual);
    const include = check('Include caption', !!snippet.caption, !snippet.caption);
    const animate = check(
      'Keep animation when inserting',
      !matchMedia('(prefers-reduced-motion: reduce)').matches,
      snippet.mime !== 'image/gif' || !canInsert
    );
    const caption = document.createElement('p');
    caption.className = 'caption';
    caption.textContent = snippet.caption;
    caption.hidden = !snippet.caption;
    include.onchange = () => {
      caption.hidden = !include.checked || !snippet.caption;
    };
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    status.textContent = 'Loading your image…';
    const actions = document.createElement('div');
    actions.className = 'actions';
    const button = (text: string) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = text;
      actions.append(b);
      return b;
    };
    const cancel = button('Cancel'),
      insert = button('Insert image'),
      download = button('Download original'),
      copy = button(snippet.mime === 'image/gif' ? 'Copy still image' : 'Copy image'),
      copyCaption = snippet.caption ? button('Copy caption') : null;
    insert.className = 'primary';
    insert.hidden = !canInsert;
    panel.append(caption, status, actions);
    backdrop.append(panel);
    shadow.append(style, backdrop);
    let done = false,
      busy = false,
      copied = false,
      playing = false,
      previewBlocked = false;
    let transfer: Awaited<ReturnType<typeof transferSelectedMedia>> | undefined;
    let originalUrl = '',
      posterUrl = '';
    const abort = new AbortController();
    const position = () => {
      const rect = caretRect(element, range, shadow),
        bounds = panel.getBoundingClientRect();
      panel.style.left = `${Math.max(12, Math.min(rect?.left ?? (innerWidth - bounds.width) / 2, innerWidth - bounds.width - 12))}px`;
      const below = rect ? rect.bottom + 8 : (innerHeight - bounds.height) / 2;
      panel.style.top = `${Math.max(12, Math.min(rect && below + bounds.height > innerHeight - 12 ? rect.top - bounds.height - 8 : below, innerHeight - bounds.height - 12))}px`;
    };
    const finish = (result: InsertionResult, restore = true) => {
      if (done) return;
      done = true;
      abort.abort();
      transfer?.close();
      if (current === dismiss) current = null;
      document.removeEventListener('visibilitychange', visibility);
      document.removeEventListener('focusin', contain, true);
      window.removeEventListener('pagehide', dismiss);
      window.removeEventListener('blur', blur);
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
      observer.disconnect();
      host.remove();
      if (restore && valid()) {
        if (bookmark) bookmark.restore();
        else element.focus({ preventScroll: true });
      }
      bookmark?.dispose();
      if (originalUrl) URL.revokeObjectURL(originalUrl);
      if (posterUrl) URL.revokeObjectURL(posterUrl);
      resolve(result);
    };
    const dismiss = () => finish(copied ? 'copied' : 'failed');
    const visibility = () => {
      if (document.hidden) dismiss();
    };
    const blur = (event: Event) => {
      if (event.target === window && !busy) dismiss();
    };
    const contain = (event: FocusEvent) => {
      if (!busy && !event.composedPath().includes(host)) cancel.focus();
    };
    const observer = new MutationObserver(() => {
      if (!valid()) dismiss();
    });
    observer.observe(element, {
      attributes: true,
      attributeFilter: [
        'type',
        'readonly',
        'disabled',
        'autocomplete',
        'aria-readonly',
        'contenteditable',
      ],
    });
    const refresh = () => {
      for (const control of [insert, download, copy, copyCaption, include, animate])
        if (control) control.disabled = busy || !transfer;
      insert.disabled ||= previewBlocked;
      cancel.disabled = busy;
    };
    const act = async (action: 'insert' | 'download' | 'image' | 'caption') => {
      if (busy || done || !transfer) return;
      busy = true;
      refresh();
      status.textContent = '';
      status.className = '';
      status.setAttribute('role', 'alert');
      try {
        if (!valid())
          throw new Error(
            'The original field or shortcut changed. Close the preview and start again.'
          );
        await transfer.check();
        if (done || !valid())
          throw new Error('The original field or shortcut changed. Start again.');
        if (action === 'insert') {
          if (!canInsert || !bookmark || !node)
            throw new Error('Insertion is unavailable in this editor.');
          await insertPracticeMedia(
            { editor: element, bookmark, node, start, end },
            snippet,
            transfer.asset,
            { caption: include.checked, animate: animate.checked },
            'editor'
          );
          finish('inserted', false);
          return;
        }
        if (action === 'download') {
          const anchor = document.createElement('a');
          anchor.href = originalUrl;
          anchor.download = snippet.originalFilename;
          shadow.append(anchor);
          anchor.click();
          anchor.remove();
          status.textContent = 'Original file download requested. Attach it in your editor.';
        } else if (action === 'caption') {
          await navigator.clipboard.writeText(snippet.caption);
          copied = true;
          status.textContent = 'Caption copied. Paste it in your editor.';
        } else {
          let blob =
            snippet.mime === 'image/gif' ? transfer.asset.thumbnail : transfer.asset.original;
          if (snippet.mime === 'image/jpeg') {
            const bitmap = await createImageBitmap(blob);
            try {
              const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
              canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
              blob = await canvas.convertToBlob({ type: 'image/png' });
            } finally {
              bitmap.close();
            }
          }
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          copied = true;
          status.textContent =
            snippet.mime === 'image/gif'
              ? 'Still preview copied. Paste it in your editor. Download the original to keep animation.'
              : 'Image copied. Paste it in your editor.';
        }
        if (!done) {
          status.setAttribute('role', 'status');
          cancel.textContent = 'Done';
        }
      } catch (error) {
        if (!done) {
          status.textContent =
            error instanceof Error
              ? error.message
              : 'This action failed. Try downloading the original.';
          status.className = 'error';
        }
      } finally {
        busy = false;
        if (!done) {
          refresh();
          cancel.focus();
          position();
        }
      }
    };
    cancel.onclick = dismiss;
    insert.onclick = (event) => {
      if (event.isTrusted) void act('insert');
    };
    download.onclick = (event) => {
      if (event.isTrusted) void act('download');
    };
    copy.onclick = (event) => {
      if (event.isTrusted) void act('image');
    };
    if (copyCaption)
      copyCaption.onclick = (event) => {
        if (event.isTrusted) void act('caption');
      };
    play.onclick = (event) => {
      if (!event.isTrusted) return;
      playing = !playing;
      image.src = playing ? originalUrl : posterUrl;
      play.textContent = playing ? 'Pause GIF' : 'Play GIF';
      play.setAttribute('aria-pressed', String(playing));
    };
    image.onerror = () => {
      previewBlocked = true;
      status.textContent = 'This page blocked the image preview. Download the original instead.';
      status.className = 'error';
      insert.disabled = true;
    };
    image.onload = position;
    backdrop.onclick = (event) => {
      if (event.target === backdrop && !busy) dismiss();
    };
    shadow.addEventListener('keydown', (event) => {
      const key = event as KeyboardEvent;
      key.stopPropagation();
      if (key.isComposing) return;
      if (key.key === 'Escape') {
        key.preventDefault();
        if (!busy) dismiss();
      }
      if (key.key === 'Tab') {
        const items = Array.from(panel.querySelectorAll<HTMLElement>('button,input')).filter(
          (item) => !item.hasAttribute('disabled') && !item.hidden && !item.parentElement?.hidden
        );
        if (items.length) {
          key.preventDefault();
          const index = items.indexOf(shadow.activeElement as HTMLElement);
          items[(index + (key.shiftKey ? -1 : 1) + items.length) % items.length].focus();
        }
      }
    });
    current = dismiss;
    document.dispatchEvent(new Event('fillin-media-open'));
    document.documentElement.append(host);
    document.addEventListener('focusin', contain, true);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', dismiss);
    window.addEventListener('blur', blur);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    refresh();
    position();
    cancel.focus();
    void transferSelectedMedia(snippet, abort.signal, valid)
      .then((value) => {
        if (done || !valid()) {
          value.close();
          if (!done) dismiss();
          return;
        }
        transfer = value;
        originalUrl = URL.createObjectURL(value.asset.original);
        posterUrl = URL.createObjectURL(value.asset.thumbnail);
        image.src = posterUrl;
        play.hidden = snippet.mime !== 'image/gif';
        status.textContent = '';
        refresh();
        position();
      })
      .catch((error) => {
        if (!done) {
          status.textContent =
            error instanceof Error ? error.message : 'Could not load this image.';
          status.className = 'error';
          status.setAttribute('role', 'alert');
        }
      });
  });
}
