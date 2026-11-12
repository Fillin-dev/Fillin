export async function openMediaEditor(id?: string): Promise<void> {
  const path = 'src/media/editor/index.html';
  const url = new URL(
    typeof chrome !== 'undefined' && chrome.runtime?.getURL
      ? chrome.runtime.getURL(path)
      : '/' + path,
    location.href
  );
  if (id) url.searchParams.set('id', id);
  if (typeof chrome !== 'undefined' && chrome.tabs?.create)
    await chrome.tabs.create({ url: url.href });
  else {
    const tab = window.open(url.href, '_blank');
    if (!tab) throw new Error('Allow Fillin to open the image editor in a new tab.');
    tab.opener = null;
  }
}
