"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { AppHeader } from "@/components/app-header";
import { LoginScreen } from "@/components/login-screen";
import { SavedBadge } from "@/components/saved-badge";
import { SimpleRichEditor } from "@/components/simple-rich-editor";
import {
  createNoteInDataStore,
  deleteNoteInDataStore,
  loadNotesData,
  updateNoteInDataStore,
} from "@/lib/task-data";
import { mockNotes, mockProfile } from "@/lib/mock-data";
import {
  hasSupabaseEnv,
  sendPasswordResetEmail,
  signInWithEmailPassword,
  signOutFromSupabase,
} from "@/lib/supabase";
import { useSupabaseAuth } from "@/hooks/use-supabase-auth";
import type { Note, Profile } from "@/lib/task-types";

type SaveState = "idle" | "saving" | "saved" | "error";

function formatRelativeDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function NotesApp() {
  const [profile, setProfile] = useState<Profile>(mockProfile);
  const [notes, setNotes] = useState<Note[]>(mockNotes);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [isSavedVisible, setIsSavedVisible] = useState(false);
  const { authUser, authState } = useSupabaseAuth();
  const pendingSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedBadgeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function bootstrap() {
      if (hasSupabaseEnv() && !authUser) {
        setIsLoading(false);
        return;
      }

      const data = await loadNotesData(authUser);
      if (!isMounted) {
        return;
      }

      setProfile(data.profile);
      setNotes(data.notes);
      setSelectedNoteId(data.notes[0]?.id ?? null);
      setIsLoading(false);
    }

    if (authState === "authenticated" || authState === "mock") {
      void bootstrap();
    } else if (authState === "unauthenticated") {
      setIsLoading(false);
    }

    return () => {
      isMounted = false;
    };
  }, [authState, authUser]);

  useEffect(() => {
    return () => {
      if (pendingSaveTimeout.current) {
        clearTimeout(pendingSaveTimeout.current);
      }
      if (savedBadgeTimeoutRef.current) {
        clearTimeout(savedBadgeTimeoutRef.current);
      }
    };
  }, []);

  const selectedNote = useMemo(
    () => notes.find((note) => note.id === selectedNoteId) ?? null,
    [notes, selectedNoteId],
  );

  const flashSavedBadge = () => {
    if (savedBadgeTimeoutRef.current) {
      clearTimeout(savedBadgeTimeoutRef.current);
    }

    setIsSavedVisible(true);
    savedBadgeTimeoutRef.current = setTimeout(() => {
      setIsSavedVisible(false);
    }, 1600);
  };

  const saveNoteChanges = (noteId: string, updates: { title?: string; content?: string }) => {
    if (pendingSaveTimeout.current) {
      clearTimeout(pendingSaveTimeout.current);
    }

    setSaveState("saving");
    pendingSaveTimeout.current = setTimeout(async () => {
      try {
        await updateNoteInDataStore(noteId, updates);
        setSaveState("saved");
        flashSavedBadge();
      } catch {
        setSaveState("error");
      }
    }, 700);
  };

  const handleCreateNote = async () => {
    const created = await createNoteInDataStore({
      title: "Untitled note",
      content: "",
      createdById: profile.id,
    });

    setNotes((current) => [created.note, ...current]);
    setSelectedNoteId(created.note.id);
    setSaveState("idle");
    flashSavedBadge();
  };

  const handleDeleteNote = async (noteId: string) => {
    const shouldDelete = window.confirm("Delete this note?");
    if (!shouldDelete) {
      return;
    }

    setNotes((current) => {
      const nextNotes = current.filter((note) => note.id !== noteId);
      if (selectedNoteId === noteId) {
        setSelectedNoteId(nextNotes[0]?.id ?? null);
      }
      return nextNotes;
    });

    await deleteNoteInDataStore(noteId);
    flashSavedBadge();
  };

  const handleLogout = async () => {
    await signOutFromSupabase();
    setIsProfileOpen(false);
  };

  if (authState === "loading" || isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-8 sm:px-6">
        <section className="w-full max-w-sm rounded-lg border border-black/10 bg-white p-6 shadow-[0_18px_60px_rgba(0,0,0,0.08)]">
          <h1 className="text-2xl font-semibold">Loading</h1>
        </section>
      </main>
    );
  }

  if (authState === "unauthenticated") {
    return (
      <LoginScreen onLogin={signInWithEmailPassword} onPasswordReset={sendPasswordResetEmail} />
    );
  }

  return (
    <>
      <SavedBadge visible={isSavedVisible} />
      <main className="min-h-screen px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
        <section className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-5">
          <AppHeader profile={profile} onProfileClick={() => setIsProfileOpen(true)} />

          <section className="rounded-lg border border-black/10 bg-white p-4 shadow-[0_18px_60px_rgba(0,0,0,0.08)] sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-[0.18em] text-black/45">Notes</p>
              <button
                className="rounded-md border border-black bg-black px-3 py-2 text-xs text-white"
                type="button"
                onClick={() => void handleCreateNote()}
              >
                New note
              </button>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
            <div className="space-y-2 rounded-lg border border-black/10 bg-white p-3 shadow-[0_18px_60px_rgba(0,0,0,0.08)] sm:p-4">
              {notes.map((note) => (
                <button
                  key={note.id}
                  className={`w-full rounded-md border px-3 py-3 text-left transition ${
                    selectedNoteId === note.id
                      ? "border-black/30 bg-[#f7f7f7]"
                      : "border-black/10 bg-white hover:border-black/20"
                  }`}
                  type="button"
                  onClick={() => setSelectedNoteId(note.id)}
                >
                  <p className="truncate text-sm font-medium">{note.title || "Untitled note"}</p>
                  <p className="mt-1 text-xs text-black/45">{formatRelativeDate(note.updatedAt)}</p>
                </button>
              ))}
            </div>

            <div className="rounded-lg border border-black/10 bg-white p-4 shadow-[0_18px_60px_rgba(0,0,0,0.08)] sm:p-5">
              {selectedNote ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-black/50">
                      {saveState === "saving" ? "Saving..." : saveState === "saved" ? "Saved" : saveState === "error" ? "Error saving" : ""}
                    </p>
                    <button
                      className="rounded-md border border-black/10 px-3 py-2 text-xs text-black/70"
                      type="button"
                      onClick={() => void handleDeleteNote(selectedNote.id)}
                    >
                      Delete
                    </button>
                  </div>

                  <input
                    className="w-full rounded-md border border-black/10 bg-white px-4 py-3 text-sm font-medium text-black outline-none transition focus:border-black/40"
                    value={selectedNote.title}
                    onChange={(event) => {
                      const nextTitle = event.target.value;
                      setNotes((current) =>
                        current.map((note) =>
                          note.id === selectedNote.id
                            ? { ...note, title: nextTitle, updatedAt: new Date().toISOString() }
                            : note,
                        ),
                      );
                      saveNoteChanges(selectedNote.id, { title: nextTitle });
                    }}
                    placeholder="Title"
                  />

                  <SimpleRichEditor
                    value={selectedNote.content}
                    minHeightClass="min-h-[420px]"
                    placeholder="Write anything..."
                    onChange={(nextContent) => {
                      setNotes((current) =>
                        current.map((note) =>
                          note.id === selectedNote.id
                            ? { ...note, content: nextContent, updatedAt: new Date().toISOString() }
                            : note,
                        ),
                      );
                      saveNoteChanges(selectedNote.id, { content: nextContent });
                    }}
                  />
                </div>
              ) : (
                <p className="text-sm text-black/55">Create your first note.</p>
              )}
            </div>
          </section>
        </section>
      </main>

      {isProfileOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/25 p-3 sm:items-center sm:p-6">
          <button aria-label="Close profile" className="absolute inset-0" type="button" onClick={() => setIsProfileOpen(false)} />
          <section className="relative z-10 w-full max-w-md rounded-lg border border-black/10 bg-white p-5 shadow-[0_24px_80px_rgba(0,0,0,0.18)] sm:p-6">
            <p className="font-medium">{profile.name}</p>
            <p className="mt-1 text-sm text-black/55">{profile.email}</p>
            <button
              className="mt-4 w-full rounded-md border border-black bg-black px-4 py-3 text-sm font-medium text-white"
              type="button"
              onClick={() => void handleLogout()}
            >
              Log out
            </button>
          </section>
        </div>
      ) : null}
    </>
  );
}
