"use client";

export function SavedBadge({ visible }: { visible: boolean }) {
  return (
    <div
      className={`pointer-events-none fixed right-3 top-3 z-[80] transition-all duration-200 sm:right-6 sm:top-6 ${
        visible ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0"
      }`}
      aria-live="polite"
      aria-label={visible ? "Saved" : undefined}
    >
      <span className="inline-flex items-center rounded-md border border-[#4ea562] bg-[#dff5e4] px-3 py-1.5 text-xs font-medium text-[#1f6d35] shadow-[0_8px_24px_rgba(0,0,0,0.10)]">
        Saved
      </span>
    </div>
  );
}
