"use client";

import { FormEvent, useEffect, useState } from "react";

import { AppHeader } from "@/components/app-header";
import { LoginScreen } from "@/components/login-screen";
import {
  createTagInDataStore,
  deleteTagInDataStore,
  loadAppData,
  updateTagInDataStore,
} from "@/lib/task-data";
import { mockProfile, mockTags } from "@/lib/mock-data";
import {
  hasSupabaseEnv,
  sendPasswordResetEmail,
  signInWithEmailPassword,
  signOutFromSupabase,
} from "@/lib/supabase";
import { useSupabaseAuth } from "@/hooks/use-supabase-auth";
import type { Profile, Tag } from "@/lib/task-types";

export function TagManager() {
  const [profile, setProfile] = useState<Profile>(mockProfile);
  const [tags, setTags] = useState<Tag[]>(mockTags);
  const [newTagName, setNewTagName] = useState("");
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { authUser, authState } = useSupabaseAuth();

  useEffect(() => {
    let isMounted = true;

    async function bootstrap() {
      if (hasSupabaseEnv() && !authUser) {
        setIsLoading(false);
        return;
      }

      try {
        const appData = await loadAppData(authUser);
        if (!isMounted) {
          return;
        }

        setProfile(appData.profile);
        setTags(appData.tags);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
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

  if (authState === "loading" || isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-8 sm:px-6">
        <section className="w-full max-w-sm rounded-lg border border-black/10 bg-white p-6 shadow-[0_18px_60px_rgba(0,0,0,0.08)]">
          <p className="text-xs uppercase tracking-[0.24em] text-black/45">Eduroldan</p>
          <h1 className="mt-3 text-2xl font-semibold">Loading</h1>
        </section>
      </main>
    );
  }

  if (authState === "unauthenticated") {
    return (
      <LoginScreen
        onLogin={signInWithEmailPassword}
        onPasswordReset={sendPasswordResetEmail}
      />
    );
  }

  const handleLogout = async () => {
    await signOutFromSupabase();
    setIsProfileOpen(false);
  };

  const handleCreateTag = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newTagName.trim()) {
      return;
    }

    const created = await createTagInDataStore(newTagName.trim());
    setTags((currentTags) => [...currentTags, created]);
    setNewTagName("");
  };

  const handleUpdateTag = async (tagId: string) => {
    if (!editingName.trim()) {
      return;
    }

    const updated = await updateTagInDataStore(tagId, editingName.trim());
    setTags((currentTags) =>
      currentTags.map((tag) => (tag.id === tagId ? updated : tag)),
    );
    setEditingTagId(null);
    setEditingName("");
  };

  const handleDeleteTag = async (tagId: string) => {
    const shouldDelete = window.confirm("Are you sure you want to delete this tag?");
    if (!shouldDelete) {
      return;
    }

    setTags((currentTags) => currentTags.filter((tag) => tag.id !== tagId));
    await deleteTagInDataStore(tagId);
  };

  return (
    <>
      <main className="min-h-screen px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
        <section className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-5">
          <AppHeader profile={profile} onProfileClick={() => setIsProfileOpen(true)} />

          <section className="rounded-lg border border-black/10 bg-white p-4 shadow-[0_18px_60px_rgba(0,0,0,0.08)] sm:p-5">
            <form className="flex flex-col gap-3 sm:flex-row" onSubmit={handleCreateTag}>
              <input
                className="w-full rounded-md border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none transition focus:border-black/40"
                type="text"
                value={newTagName}
                onChange={(event) => setNewTagName(event.target.value)}
                placeholder="New tag"
              />
              <button
                className="rounded-md border border-black bg-black px-4 py-3 text-sm font-medium text-white transition hover:bg-black/90"
                type="submit"
              >
                Add
              </button>
            </form>
          </section>

          <section className="rounded-lg border border-black/10 bg-white shadow-[0_18px_60px_rgba(0,0,0,0.08)]">
            <div className="divide-y divide-black/10">
              {tags.map((tag) => (
                <div
                  key={tag.id}
                  className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  {editingTagId === tag.id ? (
                    <input
                      className="w-full rounded-md border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none transition focus:border-black/40 sm:max-w-sm"
                      type="text"
                      value={editingName}
                      onChange={(event) => setEditingName(event.target.value)}
                    />
                  ) : (
                    <p className="text-sm font-medium">{tag.name}</p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {editingTagId === tag.id ? (
                      <>
                        <button
                          className="rounded-md border border-black bg-black px-3 py-2 text-xs text-white"
                          type="button"
                          onClick={() => void handleUpdateTag(tag.id)}
                        >
                          Save
                        </button>
                        <button
                          className="rounded-md border border-black/10 px-3 py-2 text-xs text-black/65"
                          type="button"
                          onClick={() => {
                            setEditingTagId(null);
                            setEditingName("");
                          }}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="rounded-md border border-black/10 px-3 py-2 text-xs text-black/65"
                          type="button"
                          onClick={() => {
                            setEditingTagId(tag.id);
                            setEditingName(tag.name);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          className="rounded-md border border-black/10 px-3 py-2 text-xs text-black/65"
                          type="button"
                          onClick={() => void handleDeleteTag(tag.id)}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </section>
      </main>

      {isProfileOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/25 p-3 sm:items-center sm:p-6">
          <button
            aria-label="Close profile"
            className="absolute inset-0"
            type="button"
            onClick={() => setIsProfileOpen(false)}
          />
          <section className="relative z-10 w-full max-w-md rounded-lg border border-black/10 bg-white p-5 shadow-[0_24px_80px_rgba(0,0,0,0.18)] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.24em] text-black/45">Profile</p>
                <h2 className="text-2xl font-semibold">{profile.name}</h2>
              </div>
              <button
                className="rounded-md border border-black/10 px-3 py-2 text-xs text-black/65 transition hover:border-black/30"
                type="button"
                onClick={() => setIsProfileOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="mt-6 rounded-md border border-black/10 bg-[#fafafa] p-4">
              <p className="font-medium">{profile.name}</p>
              <p className="mt-1 text-sm text-black/55">{profile.email}</p>
            </div>

            <button
              className="mt-4 w-full rounded-md border border-black bg-black px-4 py-3 text-sm font-medium text-white transition hover:bg-black/90"
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
