import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { API_LIMITS, type Item, type Note, type Settings } from '../lib/types';
import Sidebar from './components/Sidebar';
import Editor from './components/Editor';
import Ledger from './components/Ledger';
import SettingsDialog from './components/SettingsDialog';
import Toast, { type ToastMsg } from './components/Toast';
import { AiRequestError, breakdownTask, checkHealth, estimateLines, type AiStatus, type Credentials } from './lib/ai';
import { heuristicEstimate } from './lib/heuristic';
import { newItem, newNote } from './lib/notes';
import { applyTheme, loadNotes, loadSettings, saveNotes, saveSettings } from './lib/storage';
import { extractInlineDuration } from './lib/time';

export type SortMode = 'original' | 'longest' | 'shortest';

/** Lines per estimate request; kept under the API's per-request cap. */
const ESTIMATE_BATCH = 40;
export type MobileView = 'list' | 'editor' | 'ledger';

export default function App() {
  const [notes, setNotes] = useState<Note[]>(() => loadNotes());
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const first = loadNotes()[0];
    return first && window.innerWidth >= 768 ? first.id : null;
  });
  const [aiStatus, setAiStatus] = useState<AiStatus>({ mode: 'checking' });
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [sortMode, setSortMode] = useState<SortMode>('original');
  const [hideDone, setHideDone] = useState(false);
  const [mobileView, setMobileView] = useState<MobileView>('list');
  const [ledgerOpen, setLedgerOpen] = useState(() => window.innerWidth >= 1280);
  const [showSettings, setShowSettings] = useState(false);
  const [toast, setToast] = useState<ToastMsg | null>(null);

  // Latest-state refs so async estimate callbacks never read stale closures.
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const aiRef = useRef(aiStatus);
  aiRef.current = aiStatus;

  // ---- persistence & theme ----
  useEffect(() => { saveNotes(notes); }, [notes]);
  useEffect(() => { saveSettings(settings); applyTheme(settings.theme); }, [settings]);
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme(settingsRef.current.theme);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  useEffect(() => {
    let cancelled = false;
    setAiStatus({ mode: 'checking' });
    checkHealth(creds(settings)).then((s) => { if (!cancelled) setAiStatus(s); });
    return () => { cancelled = true; };
  }, [settings.apiKey, settings.accessCode]);

  // ---- note CRUD ----
  const updateNote = useCallback((id: string, fn: (n: Note) => Note) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...fn(n), updatedAt: Date.now() } : n)));
  }, []);

  const updateItem = useCallback((noteId: string, itemId: string, fn: (i: Item) => Item) => {
    updateNote(noteId, (n) => ({ ...n, items: n.items.map((i) => (i.id === itemId ? fn(i) : i)) }));
  }, [updateNote]);

  const createNote = useCallback(() => {
    const n = newNote();
    setNotes((prev) => [n, ...prev]);
    setSelectedId(n.id);
    setSortMode('original');
    setMobileView('editor');
  }, []);

  const deleteNote = useCallback((id: string) => {
    setNotes((prev) => {
      const next = prev.filter((n) => n.id !== id);
      if (selectedId === id) {
        setSelectedId(window.innerWidth >= 768 && next[0] ? next[0].id : null);
        setMobileView('list');
      }
      return next;
    });
  }, [selectedId]);

  const selectNote = useCallback((id: string) => {
    setSelectedId(id);
    setSortMode('original');
    setMobileView('editor');
  }, []);

  // ---- estimation ----
  const markPending = (ids: string[], on: boolean) =>
    setPending((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });

  const applyHeuristics = useCallback((noteId: string, items: Item[]) => {
    for (const it of items) {
      const h = heuristicEstimate(it.id, it.text);
      updateItem(noteId, it.id, (cur) =>
        cur.text === it.text && cur.source !== 'manual'
          ? { ...cur, minutes: h.minutes, low: h.low, high: h.high, category: h.category, confidence: h.confidence, rationale: h.rationale, source: 'heuristic' }
          : cur,
      );
    }
  }, [updateItem]);

  /**
   * Estimate the given items (or all unestimated ones). Inline durations like
   * "(2h)" are parsed locally; `manual` estimates are only replaced with force.
   */
  const requestEstimate = useCallback(async (noteId: string, itemIds?: string[], opts: { force?: boolean } = {}) => {
    const note = notesRef.current.find((n) => n.id === noteId);
    if (!note) return;
    const wanted = new Set(itemIds ?? note.items.filter((i) => i.minutes == null).map((i) => i.id));
    const targets: Item[] = [];
    for (const it of note.items) {
      if (!wanted.has(it.id)) continue;
      if (it.text.trim().length < 3) continue;
      if (it.source === 'manual' && !opts.force) continue;
      const inline = extractInlineDuration(it.text);
      if (inline != null) {
        updateItem(noteId, it.id, (cur) => ({ ...cur, minutes: inline, low: inline, high: inline, confidence: 'high', rationale: 'Duration written in the line', source: 'parsed' }));
        continue;
      }
      targets.push(it);
    }
    if (targets.length === 0) return;

    const ids = targets.map((t) => t.id);
    markPending(ids, true);
    try {
      if (aiRef.current.mode === 'offline') {
        applyHeuristics(noteId, targets);
        return;
      }
      const lines = note.items
        .slice(0, API_LIMITS.lines)
        .map((i) => ({ id: i.id, text: i.text.slice(0, API_LIMITS.lineChars), indent: i.indent }));
      // Batch so "Re-estimate everything" on a long note stays under the per-request cap.
      for (let start = 0; start < targets.length; start += ESTIMATE_BATCH) {
        const batch = targets.slice(start, start + ESTIMATE_BATCH);
        try {
          const res = await estimateLines(
            { title: note.title, lines, targetIds: batch.map((t) => t.id) },
            creds(settingsRef.current),
          );
          const byId = new Map(res.estimates.map((e) => [e.id, e]));
          for (const t of batch) {
            const e = byId.get(t.id);
            if (!e) { applyHeuristics(noteId, [t]); continue; }
            updateItem(noteId, t.id, (cur) =>
              cur.text === t.text && (cur.source !== 'manual' || opts.force)
                ? { ...cur, minutes: e.minutes, low: e.low, high: e.high, category: e.category, confidence: e.confidence, rationale: e.rationale, source: 'ai' }
                : cur,
            );
          }
        } catch (err) {
          const e = err as AiRequestError;
          if (e.code === 'no_key' || e.code === 'bad_key') {
            setAiStatus({ mode: 'offline', reason: e.code === 'bad_key' ? 'API key rejected' : 'No usable API key' });
          } else {
            setToast({ kind: 'warn', text: e.message || 'Estimate failed — used offline fallback.' });
          }
          applyHeuristics(noteId, targets.slice(start));
          return;
        }
      }
    } finally {
      markPending(ids, false);
    }
  }, [applyHeuristics, updateItem]);

  // Debounced auto-estimate while typing.
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const scheduleEstimate = useCallback((noteId: string, itemId: string) => {
    const t = timers.current.get(itemId);
    if (t) clearTimeout(t);
    if (!settingsRef.current.autoEstimate) return;
    timers.current.set(itemId, setTimeout(() => {
      timers.current.delete(itemId);
      void requestEstimate(noteId, [itemId]);
    }, 1400));
  }, [requestEstimate]);

  const breakdown = useCallback(async (noteId: string, itemId: string) => {
    const note = notesRef.current.find((n) => n.id === noteId);
    const item = note?.items.find((i) => i.id === itemId);
    if (!note || !item || !item.text.trim()) return;
    if (aiRef.current.mode === 'offline') {
      setToast({ kind: 'warn', text: 'Break down needs your API key or the access code. Add one in Settings.' });
      return;
    }
    markPending([itemId], true);
    try {
      const res = await breakdownTask(
        { title: note.title, text: item.text, siblings: note.items.filter((i) => i.id !== itemId).map((i) => i.text) },
        creds(settingsRef.current),
      );
      const subs = res.steps.map((s) =>
        newItem({ text: s.text, minutes: s.minutes, low: s.minutes, high: s.minutes, category: s.category, confidence: 'medium', rationale: 'From break down', source: 'ai', indent: 1 }),
      );
      const sum = subs.reduce((a, s) => a + (s.minutes ?? 0), 0);
      updateNote(noteId, (n) => {
        const idx = n.items.findIndex((i) => i.id === itemId);
        if (idx === -1) return n;
        // Replace any existing sub-tasks directly under this item.
        let end = idx + 1;
        while (end < n.items.length && n.items[end].indent === 1) end++;
        const items = [...n.items.slice(0, idx), { ...n.items[idx], minutes: 0, low: 0, high: 0, rationale: `Sum of ${subs.length} sub-tasks: ${sum}m`, source: 'ai' as const }, ...subs, ...n.items.slice(end)];
        return { ...n, items };
      });
    } catch (err) {
      setToast({ kind: 'warn', text: (err as Error).message || 'Break down failed.' });
    } finally {
      markPending([itemId], false);
    }
  }, [updateNote]);

  // ---- keyboard shortcuts ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'n') { e.preventDefault(); createNote(); }
      if (mod && e.key === ',') { e.preventDefault(); setShowSettings(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [createNote]);

  const selected = useMemo(() => notes.find((n) => n.id === selectedId) ?? null, [notes, selectedId]);

  return (
    <div className="h-full w-full flex bg-canvas text-ink overflow-hidden">
      {/* Notes list */}
      <aside className={`${mobileView === 'list' ? 'flex' : 'hidden'} md:flex w-full md:w-[272px] shrink-0 flex-col border-r border-line bg-canvas`}>
        <Sidebar
          notes={notes}
          selectedId={selectedId}
          aiStatus={aiStatus}
          onSelect={selectNote}
          onCreate={createNote}
          onOpenSettings={() => setShowSettings(true)}
        />
      </aside>

      {/* Editor */}
      <main className={`${mobileView === 'editor' ? 'flex' : 'hidden'} md:flex flex-1 min-w-0 flex-col bg-surface`}>
        {selected ? (
          <Editor
            key={selected.id}
            note={selected}
            pending={pending}
            sortMode={sortMode}
            hideDone={hideDone}
            aiStatus={aiStatus}
            onSort={setSortMode}
            onHideDone={setHideDone}
            onUpdate={(fn) => updateNote(selected.id, fn)}
            onUpdateItem={(id, fn) => updateItem(selected.id, id, fn)}
            onTyped={(id) => scheduleEstimate(selected.id, id)}
            onEstimate={(ids, force) => void requestEstimate(selected.id, ids, { force })}
            onBreakdown={(id) => void breakdown(selected.id, id)}
            onDelete={() => deleteNote(selected.id)}
            onBack={() => setMobileView('list')}
            ledgerOpen={ledgerOpen}
            onToggleLedger={() => (window.innerWidth < 768 ? setMobileView('ledger') : setLedgerOpen((o) => !o))}
          />
        ) : (
          <EmptyState onCreate={createNote} />
        )}
      </main>

      {/* Ledger */}
      <aside className={`${mobileView === 'ledger' ? 'flex' : 'hidden'} ${ledgerOpen ? 'md:flex' : 'md:hidden'} w-full md:w-[300px] shrink-0 flex-col border-l border-line bg-canvas`}>
        <Ledger
          note={selected}
          settings={settings}
          aiStatus={aiStatus}
          pendingCount={pending.size}
          onEstimateAll={() => selected && void requestEstimate(selected.id, undefined)}
          onReestimateAll={() => selected && void requestEstimate(selected.id, selected.items.map((i) => i.id), { force: true })}
          onBack={() => setMobileView('editor')}
          onOpenSettings={() => setShowSettings(true)}
        />
      </aside>

      {showSettings && (
        <SettingsDialog
          settings={settings}
          notes={notes}
          aiStatus={aiStatus}
          onChange={setSettings}
          onImport={(imported) => { setNotes(imported); setSelectedId(imported[0]?.id ?? null); }}
          onClose={() => setShowSettings(false)}
        />
      )}
      <Toast msg={toast} onDone={() => setToast(null)} />
    </div>
  );
}

function creds(s: Settings): Credentials {
  return { apiKey: s.apiKey || undefined, accessCode: s.accessCode || undefined };
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
      <div className="w-12 h-12 rounded-2xl bg-surface-2 flex items-center justify-center mb-4">
        <span className="font-mono text-accent font-semibold">Σ</span>
      </div>
      <h2 className="font-semibold text-lg">Notes that add up</h2>
      <p className="text-sm text-muted mt-1 max-w-xs">
        Write a list. Every line gets a time estimate in the ledger on the right.
      </p>
      <button
        onClick={onCreate}
        className="mt-5 px-4 py-2 rounded-xl bg-ink text-canvas text-sm font-medium hover:opacity-90 active:scale-[0.98] transition"
      >
        New note <span className="ml-2 font-mono text-xs opacity-60">⌘N</span>
      </button>
    </div>
  );
}
