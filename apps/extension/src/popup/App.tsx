import React, { useState } from 'react';
import { Snippet } from '@fillin/shared';
import { useSnippets } from '../hooks/useSnippets';
import { useStats } from '../hooks/useStats';
import { useBlacklist } from '../hooks/useBlacklist';
import { snippetService } from '../services';
import { SnippetList } from '../components/SnippetList';
import { SnippetForm } from '../components/SnippetForm';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { BlacklistModal } from '../components/BlacklistModal';
import { FirstUseGuide } from '../components/FirstUseGuide';
import { Plus, Zap } from 'lucide-react';

export function App() {
  const {
    snippets,
    loading,
    error,
    loadError,
    reload,
    createSnippet,
    updateSnippet,
    deleteSnippet,
    loadStarterPack,
    importSnippets,
  } = useSnippets(snippetService);

  const { stats, formattedTimeSaved } = useStats();
  const {
    blacklistedDomains,
    currentDomain,
    isCurrentDomainBlacklisted,
    toggleCurrentDomain,
    addDomain,
    removeDomain,
    error: blacklistError,
  } = useBlacklist();

  const [view, setView] = useState<'list' | 'form'>('list');
  const [editingSnippet, setEditingSnippet] = useState<Snippet | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isBlacklistModalOpen, setIsBlacklistModalOpen] = useState(false);

  const pendingDeleteSnippet = snippets.find((s) => s.id === pendingDeleteId);

  const handleNew = () => {
    setEditingSnippet(undefined);
    setView('form');
  };

  const handleEdit = (snippet: Snippet) => {
    setEditingSnippet(snippet);
    setView('form');
  };

  const handleDelete = (id: string) => setPendingDeleteId(id);

  const handleSave = async (
    trigger: string,
    content: string,
    isHtml: boolean,
    tags?: string[]
  ) => {
    if (editingSnippet) {
      await updateSnippet(editingSnippet.id, trigger, content, isHtml, tags);
    } else {
      await createSnippet(trigger, content, isHtml, tags);
    }
  };

  const handleConfirmDelete = async () => {
    if (pendingDeleteId) {
      await deleteSnippet(pendingDeleteId);
      setPendingDeleteId(null);
    }
  };

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-white">
        <div className="flex flex-col items-center space-y-4 animate-fade-in">
          <img
            src="/icon128.png"
            alt="Fillin Logo"
            className="w-10 h-10 rounded-2xl shadow-[0_4px_16px_-4px_rgba(0,0,0,0.3)]"
          />
          <div className="flex space-x-1.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-gray-300 dot-pulse"
                style={{ animationDelay: `${i * 0.18}s` }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 p-6 bg-white text-center">
        <div role="alert" className="space-y-2">
          <h1 className="font-semibold text-gray-900">Unable to load snippets</h1>
          <p className="text-sm text-gray-600">{loadError}</p>
        </div>
        <button onClick={() => void reload()} className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-gray-200">
          Try again
        </button>
      </div>
    );
  }

  /* ── Main ── */
  return (
    <FirstUseGuide snippets={snippets} onClose={reload}>
    <div className="h-full relative flex flex-col overflow-hidden bg-white">
      {view === 'list' ? (
        <>
          <div className="flex-1 overflow-hidden">
            <SnippetList
              snippets={snippets}
              onEdit={handleEdit}
              onDelete={handleDelete}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              onLoadStarterPack={loadStarterPack}
              onImport={importSnippets}
              onOpenBlacklistModal={() => setIsBlacklistModalOpen(true)}
              currentDomain={currentDomain}
              isCurrentDomainBlacklisted={isCurrentDomainBlacklisted}
              onToggleCurrentDomain={toggleCurrentDomain}
            />
          </div>

          {/* Footer Area: Stats + CTA */}
          <div className="px-4 py-2.5 border-t border-gray-100 bg-white space-y-2">
            {/* Gamification metric */}
            <div className="flex items-center justify-center space-x-1.5 text-xs text-gray-500 select-none">
              <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
              <span>
                <strong>{stats.keystrokesSaved.toLocaleString()}</strong> keystrokes saved
                <span className="text-gray-300 mx-1.5">·</span>
                ~{formattedTimeSaved}
              </span>
            </div>

            <button
              onClick={handleNew}
              className="w-full flex items-center justify-center space-x-2 py-2 rounded-xl font-semibold text-sm text-white bg-gray-900
                         hover:bg-black transition-all shadow-sm focus:outline-none focus:ring-4 focus:ring-gray-200"
            >
              <Plus className="w-4 h-4" />
              <span>Create Snippet</span>
            </button>
          </div>

          {/* Error toast */}
          {(error || blacklistError) && (
            <div className="absolute top-3 left-3 right-3 px-3 py-2 rounded-xl text-xs font-medium text-center animate-fade-in bg-red-50 border border-red-200 text-red-600">
              {error || blacklistError}
            </div>
          )}

          {/* Confirm delete dialog */}
          {pendingDeleteId && pendingDeleteSnippet && (
            <ConfirmDialog
              trigger={pendingDeleteSnippet.trigger}
              onConfirm={handleConfirmDelete}
              onCancel={() => setPendingDeleteId(null)}
            />
          )}

          {/* Blacklist / Site pause management modal */}
          {isBlacklistModalOpen && (
            <BlacklistModal
              error={blacklistError}
              currentDomain={currentDomain}
              isCurrentDomainBlacklisted={isCurrentDomainBlacklisted}
              blacklistedDomains={blacklistedDomains}
              onToggleCurrentDomain={toggleCurrentDomain}
              onAddDomain={addDomain}
              onRemoveDomain={removeDomain}
              onClose={() => setIsBlacklistModalOpen(false)}
            />
          )}
        </>
      ) : (
        <SnippetForm
          snippet={editingSnippet}
          existingSnippets={snippets}
          onSave={handleSave}
          onCancel={() => setView('list')}
          error={error}
        />
      )}
    </div>
    </FirstUseGuide>
  );
}
