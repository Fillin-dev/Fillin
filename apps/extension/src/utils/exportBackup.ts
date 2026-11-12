import { Snippet } from '@fillin/shared';

export function exportBackup(snippets: Snippet[]): void {
  if (snippets.some(snippet => snippet.kind === 'media')) throw new Error('This library includes media. A full backup with original files is required; JSON export has not started.');
  if (!snippets.length) throw new Error('No snippets to export.');
  const anchor = document.createElement('a');
  anchor.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(snippets, null, 2));
  anchor.download = `fillin-snippets-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
  }
}
