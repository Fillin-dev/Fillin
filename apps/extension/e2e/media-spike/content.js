// Test-only candidate insertion, not a shipped adapter or compatibility claim.
(() => {
  const preview = document.createElement('button');
  preview.id = 'spike-preview'; preview.textContent = 'Preview media';
  const confirm = document.createElement('button');
  confirm.id = 'spike-confirm'; confirm.textContent = 'Insert image and caption'; confirm.hidden = true;
  const status = document.createElement('output'); status.id = 'spike-status';
  const poster = document.createElement('img'); poster.id = 'spike-poster'; poster.hidden = true;
  poster.width = 48;
  let bookmark;
  let blob;
  let dataURL;
  preview.onmousedown = event => {
    event.preventDefault();
    const selection = getSelection();
    const node = selection?.anchorNode;
    const end = selection?.anchorOffset;
    const editor = node?.parentElement?.closest('[contenteditable=true]');
    status.dataset.selection = JSON.stringify({ text: node?.textContent, end, collapsed: selection?.isCollapsed, editor: !!editor, nodeType: node?.nodeType });
    bookmark = editor && selection.isCollapsed && node.nodeType === Node.TEXT_NODE &&
      node.textContent.slice(end - 6, end) === '/media'
      ? { editor, node, end, text: node.textContent } : null;
  };
  preview.onclick = async () => {
    const start = performance.now();
    try {
      const parts = []; let offset = 0; let size;
      let mime;
      do {
        const result = await chrome.runtime.sendMessage({ type: 'MEDIA_SPIKE_CHUNK', offset });
        if (result.error) throw new Error(result.error);
        if (result.offset !== offset || result.size > 10 * 1024 * 1024) throw new Error('Invalid transfer');
        const bytes = Uint8Array.from(atob(result.data), value => value.charCodeAt(0));
        if (!bytes.length || bytes.length > 256 * 1024) throw new Error('Invalid chunk');
        parts.push(bytes); offset += bytes.length; size = result.size; mime = result.mime;
      } while (offset < size);
      if (offset !== size) throw new Error('Wrong length');
      blob = new Blob(parts, { type: mime });
      const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
      status.dataset.hash = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
      status.dataset.bytes = String(size); status.dataset.ms = String(performance.now() - start);
      status.textContent = 'ready';
      // Only real image fixtures get decoded; large synthetic transport probes do not.
      if (mime.startsWith('image/')) {
        dataURL = await new Promise((resolve, reject) => {
          const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        poster.src = dataURL; poster.hidden = false;
        await poster.decode();
      }
      confirm.hidden = !bookmark || !mime.startsWith('image/');
    } catch (error) { status.textContent = `failed: ${error.message}`; }
  };
  confirm.onclick = () => {
    const target = bookmark;
    if (!target || !target.editor.isConnected || !target.node.isConnected || target.node.textContent !== target.text) {
      status.textContent = 'stale'; return;
    }
    target.editor.focus();
    const range = document.createRange();
    range.setStart(target.node, target.end - 6); range.setEnd(target.node, target.end);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    const wrapper = document.createElement('span');
    const image = document.createElement('img'); image.src = dataURL; image.alt = 'Example';
    wrapper.append(image, document.createElement('br'), document.createTextNode('A literal <caption>'));
    const accepted = document.execCommand('insertHTML', false, wrapper.innerHTML);
    status.textContent = accepted && target.editor.querySelector('img') ? 'inserted' : 'failed';
    confirm.hidden = true;
  };
  document.body.append(preview, confirm, poster, status);
})();
