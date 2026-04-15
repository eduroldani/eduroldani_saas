"use client";

import { useEffect, useRef } from "react";

function toHtmlContent(value: string) {
  if (!value.trim()) {
    return "";
  }

  if (/<\/?[a-z][\s\S]*>/i.test(value)) {
    return value;
  }

  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}

export function SimpleRichEditor({
  value,
  onChange,
  minHeightClass = "min-h-[360px]",
  placeholder = "Write...",
}: {
  value: string;
  onChange: (nextValue: string) => void;
  minHeightClass?: string;
  placeholder?: string;
}) {
  const editorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const nextHtml = toHtmlContent(value);
    if (editor.innerHTML !== nextHtml) {
      editor.innerHTML = nextHtml;
    }
  }, [value]);

  const emitChange = () => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    onChange(editor.innerHTML);
  };

  const runCommand = (command: string, commandValue?: string) => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    editor.focus();
    document.execCommand(command, false, commandValue);
    emitChange();
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          className="rounded-md border border-black/10 px-2 py-1 text-xs text-black/70"
          type="button"
          onClick={() => runCommand("formatBlock", "P")}
        >
          P
        </button>
        <button
          className="rounded-md border border-black/10 px-2 py-1 text-xs text-black/70"
          type="button"
          onClick={() => runCommand("formatBlock", "H2")}
        >
          H2
        </button>
        <button
          className="rounded-md border border-black/10 px-2 py-1 text-xs text-black/70"
          type="button"
          onClick={() => runCommand("formatBlock", "H1")}
        >
          H1
        </button>
        <button
          className="rounded-md border border-black/10 px-2 py-1 text-xs font-semibold text-black/70"
          type="button"
          onClick={() => runCommand("bold")}
        >
          B
        </button>
      </div>

      <div className="relative">
        {toHtmlContent(value).trim() ? null : (
          <p className="pointer-events-none absolute left-4 top-3 text-sm text-black/35">{placeholder}</p>
        )}
        <div
          ref={editorRef}
          className={`${minHeightClass} w-full rounded-md border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none transition focus:border-black/40`}
          contentEditable
          suppressContentEditableWarning
          onInput={emitChange}
        />
      </div>
    </div>
  );
}
