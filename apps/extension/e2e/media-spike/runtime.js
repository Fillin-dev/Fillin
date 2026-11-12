// Phase-2 experiment only. Copied into a temporary unpacked extension by the
// test fixture; never imported by production source or included in a release.
const DB = 'fillin-media-feasibility';
const LIMIT = 10 * 1024 * 1024;
const CHUNK = 256 * 1024;

async function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('assets');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function put(id, blob) {
  const db = await database();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction('assets', 'readwrite');
      tx.objectStore('assets').put(blob, id);
      tx.oncomplete = resolve;
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

async function get(id) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('assets');
      const request = tx.objectStore('assets').get(id);
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

async function hash(blob) {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}

function base64(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary);
}

async function original(format) {
  if (format === 'gif') {
    // Hand-authored, looping, two-frame GIF: red then blue, 100ms per frame.
    const hex = '47494638396101000100800000ff00000000ff21ff0b4e45545343415045322e30030100000021f904000a0000002c000000000100010000020244010021f904000a0000002c00000000010001000002024c01003b';
    return new Blob([Uint8Array.from(hex.match(/../g), value => parseInt(value, 16))], { type: 'image/gif' });
  }
  const png = await (await fetch(chrome.runtime.getURL('icon48.png'))).blob();
  if (format === 'png') return png;
  const bitmap = await createImageBitmap(png);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
}

globalThis.mediaSpike = { put, get, hash, original, base64 };

if (typeof document === 'undefined') {
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type !== 'MEDIA_SPIKE_CHUNK') return;
    // Test-only reader is deliberately restricted to the local fixture origin.
    if (sender.id !== chrome.runtime.id || !sender.tab ||
        !/^http:\/\/127\.0\.0\.1:\d+\//.test(sender.url || '') ||
        !Number.isSafeInteger(message.offset) || message.offset < 0 || message.offset > LIMIT) {
      respond({ error: 'Rejected spike request' }); return;
    }
    void (async () => {
      const blob = await get('selected');
      if (!(blob instanceof Blob) || blob.size > LIMIT || message.offset >= blob.size) throw new Error('Invalid asset');
      const bytes = new Uint8Array(await blob.slice(message.offset, message.offset + CHUNK).arrayBuffer());
      return { data: base64(bytes), size: blob.size, mime: blob.type, offset: message.offset };
    })().then(respond, error => respond({ error: error.message }));
    return true;
  });
} else {
  const download = document.createElement('button');
  download.textContent = 'Download original';
  download.onclick = async () => {
    const blob = await get('selected');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `spike-original.${blob.type.split('/')[1]}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const copy = document.createElement('button');
  copy.textContent = 'Copy PNG';
  copy.onclick = async () => {
    try {
      const blob = await get('selected');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      document.querySelector('output').textContent = 'copied';
    } catch (error) { document.querySelector('output').textContent = `failed: ${error.message}`; }
  };
  document.body.append(download, copy, document.createElement('output'));
}
