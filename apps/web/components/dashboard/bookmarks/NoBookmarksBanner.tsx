"use client";

export default function NoBookmarksBanner({
  variant = "first-time",
}: {
  variant?: "first-time" | "smart-space" | "search";
}) {
  if (variant !== "first-time") {
    const copy = {
      "smart-space": "nothing here yet. it'll fill in as you save.",
      search: "nothing to show.",
    } as const;
    return (
      <div className="flex min-h-[28vh] items-center justify-center px-8 py-14 text-center">
        <p className="font-display text-[18px] italic text-[var(--fg-muted)]">
          {copy[variant]}
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-8 py-24 text-center">
      <h2 className="font-display text-[32px] italic leading-[1.1] text-[var(--fg-primary)]">
        this is yours.
      </h2>
      <p className="font-display text-[18px] italic text-[var(--fg-muted)]">
        start collecting.
      </p>
      <p className="mt-12 text-[13px] text-[var(--fg-muted)]">
        press <kbd className="font-mono">/</kbd> to focus the search bar, or{" "}
        <kbd className="font-mono">+</kbd> to add anything
      </p>
    </div>
  );
}
