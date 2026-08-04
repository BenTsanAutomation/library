"use client";

import { useState } from "react";
import { useLibraryUIStore } from "@/lib/store/useLibraryUIStore";

export default function ColorSearchButton() {
  const [open, setOpen] = useState(false);
  const colorSearchHex = useLibraryUIStore((state) => state.colorSearchHex);
  const setColorSearchHex = useLibraryUIStore((state) => state.setColorSearchHex);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-border/70 bg-[var(--bg-surface)] shadow-[0_12px_30px_rgba(70,58,42,0.16)]"
        aria-label="Open color search"
      >
        <span
          className="h-5 w-5 rounded-full border border-border/40"
          style={{ background: colorSearchHex ?? "linear-gradient(135deg,#c8693a,#2b5f4a)" }}
        />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 backdrop-blur-sm">
          <div className="w-[320px] rounded-[1.5rem] bg-[var(--bg-surface)] p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-2xl italic">color search</h3>
              <button type="button" onClick={() => setOpen(false)}>
                ×
              </button>
            </div>
            <input
              type="color"
              value={colorSearchHex ?? "#c8693a"}
              onChange={(event) => setColorSearchHex(event.target.value)}
              className="mt-4 h-14 w-full rounded-xl border border-border/50 bg-transparent"
            />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-4 w-full rounded-full bg-[var(--fg-primary)] px-4 py-2 text-[var(--bg-surface)]"
            >
              apply
            </button>
          </div>
        </div>
      )}
    </>
  );
}
