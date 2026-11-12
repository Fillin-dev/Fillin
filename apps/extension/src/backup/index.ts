import { snippetRepository } from '../storage/repository';
import { mediaAssets, mediaSnippetService } from '../services/media';
import { BackupService } from './BackupService';
import { prepareBackup, writeBackup } from './workerClient';

export const backupService = new BackupService(snippetRepository, mediaAssets, mediaSnippetService);
export { prepareBackup };
export async function exportFullBackup(signal?: AbortSignal): Promise<void> {
  const blob = await backupService.snapshot((snippets, assets) =>
    writeBackup(snippets, [...assets.values()], signal)
  );
  if (signal?.aborted) throw new Error('Backup cancelled.');
  const url = URL.createObjectURL(blob),
    anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `fillin-backup-${new Date().toISOString().slice(0, 10)}.zip`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
