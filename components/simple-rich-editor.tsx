"use client";

import { useEffect, useRef, useState } from "react";

function toHtmlContent(value: string) {
  if (!value.trim()) {
    return "";
  }

  const hasHtmlTags = /<\/?[a-z][\s\S]*>/i.test(value);
  const hasHtmlEntities = /&(?:[a-z]+|#\d+|#x[a-f0-9]+);/i.test(value);

  if (hasHtmlTags || hasHtmlEntities) {
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
  const [toolbarPosition, setToolbarPosition] = useState<{ top: number; left: number } | null>(null);

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

  useEffect(() => {
    const updateToolbarFromSelection = () => {
      const editor = editorRef.current;
      const selection = window.getSelection();
      if (!editor || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
        setToolbarPosition(null);
        return;
      }

      const anchorNode = selection.anchorNode;
      const focusNode = selection.focusNode;
      if (!anchorNode || !focusNode) {
        setToolbarPosition(null);
        return;
      }

      if (!editor.contains(anchorNode) || !editor.contains(focusNode)) {
        setToolbarPosition(null);
        return;
      }

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (!rect.width && !rect.height) {
        setToolbarPosition(null);
        return;
      }

      setToolbarPosition({
        top: Math.max(rect.top - 44, 8),
        left: rect.left + rect.width / 2,
      });
    };

    document.addEventListener("selectionchange", updateToolbarFromSelection);
    window.addEventListener("scroll", updateToolbarFromSelection, true);
    window.addEventListener("resize", updateToolbarFromSelection);

    return () => {
      document.removeEventListener("selectionchange", updateToolbarFromSelection);
      window.removeEventListener("scroll", updateToolbarFromSelection, true);
      window.removeEventListener("resize", updateToolbarFromSelection);
    };
  }, []);

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

  const runFormatBlock = (tag: "p" | "h1" | "h2") => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    editor.focus();

    const variants = [`<${tag}>`, tag.toUpperCase(), tag];
    let applied = false;
    for (const value of variants) {
      if (document.execCommand("formatBlock", false, value)) {
        applied = true;
        break;
      }
    }

    if (!applied) {
      document.execCommand("heading", false, tag);
    }

    emitChange();
  };

  return (
    <div className="relative">
      {toolbarPosition ? (
        <div
          className="fixed z-20 flex -translate-x-1/2 items-center gap-1 rounded-md border border-black/10 bg-white p-1 shadow-[0_10px_30px_rgba(0,0,0,0.12)]"
          style={{ top: toolbarPosition.top, left: toolbarPosition.left }}
        >
          <button
            className="rounded px-2 py-1 text-xs text-black/75 hover:bg-black/5"
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => runFormatBlock("h2")}
          >
            T
          </button>
          <button
            className="rounded px-2 py-1 text-xs font-semibold text-black/75 hover:bg-black/5"
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => runCommand("bold")}
          >
            B
          </button>
          <button
            className="rounded px-2 py-1 text-xs text-black/75 hover:bg-black/5"
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => runCommand("insertUnorderedList")}
          >
            •
          </button>
        </div>
      ) : null}
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
