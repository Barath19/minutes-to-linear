'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { NotionPage } from '@/lib/notion';

/** The Notion mark. */
function NotionMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952l1.448.327s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.681 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.448-1.632z" />
    </svg>
  );
}

export function NotionImport({
  disabled,
  onImport,
}: {
  disabled?: boolean;
  onImport: (text: string, title: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pages, setPages] = useState<NotionPage[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Click-away, so the panel behaves like a menu rather than a mode.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/notion');
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setPages(body.pages ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && pages === null) void load();
  };

  const pick = async (page: NotionPage) => {
    setImporting(page.id);
    setError(null);
    try {
      const res = await fetch('/api/notion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId: page.id }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      if (!body.text?.trim()) {
        throw new Error('That page has no readable text');
      }
      onImport(body.text, body.title ?? page.title);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(null);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={toggle}
        disabled={disabled}
        className="flex items-center gap-1.5 rounded-md border border-edge px-2 py-1 text-[11px] text-dim transition-colors hover:text-text disabled:opacity-40"
      >
        <NotionMark className="size-3.5" />
        Import from Notion
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="absolute top-full right-0 z-30 mt-1.5 w-80 overflow-hidden rounded-lg border border-edge bg-surface-2 shadow-xl"
          >
            <div className="flex items-center gap-2 border-b border-edge px-3 py-2">
              <span className="text-[11px] font-medium">Recent pages</span>
              <button
                onClick={load}
                className="ml-auto text-[11px] text-dim transition-colors hover:text-text"
              >
                refresh
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto">
              {loading && <p className="px-3 py-4 text-[12px] text-dim">Loading…</p>}

              {!loading && error && (
                <p className="px-3 py-3 text-[12px] leading-relaxed text-red-300">{error}</p>
              )}

              {!loading && !error && pages?.length === 0 && (
                <p className="px-3 py-3 text-[12px] leading-relaxed text-dim">
                  No pages shared with this integration yet. In Notion, open the page and use
                  <span className="text-text"> ⋯ → Connections → Add connection</span>.
                </p>
              )}

              {!loading &&
                pages?.map((page) => (
                  <button
                    key={page.id}
                    onClick={() => pick(page)}
                    disabled={importing !== null}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-white/5 disabled:opacity-50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px]">{page.title}</span>
                      {page.editedAt && (
                        <span className="block text-[10.5px] text-dim">
                          {new Date(page.editedAt).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </span>
                      )}
                    </span>
                    {importing === page.id && (
                      <span className="shrink-0 text-[10.5px] text-brand-soft">importing…</span>
                    )}
                  </button>
                ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
