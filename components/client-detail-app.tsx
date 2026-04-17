"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { AppHeader } from "@/components/app-header";
import { LoginScreen } from "@/components/login-screen";
import { SavedBadge } from "@/components/saved-badge";
import { SimpleRichEditor } from "@/components/simple-rich-editor";
import {
  createTaskInDataStore,
  deleteTaskInDataStore,
  loadAppData,
  loadClientNoteInDataStore,
  loadClientsData,
  upsertClientNoteInDataStore,
  updateTaskInDataStore,
} from "@/lib/task-data";
import { mockProfile, mockTags } from "@/lib/mock-data";
import {
  hasSupabaseEnv,
  sendPasswordResetEmail,
  signInWithEmailPassword,
  signOutFromSupabase,
} from "@/lib/supabase";
import { useSupabaseAuth } from "@/hooks/use-supabase-auth";
import type { Profile, Tag, Task, TaskPriority, TaskStatus } from "@/lib/task-types";

const statuses: TaskStatus[] = ["To do", "In progress", "Done"];
const priorities: TaskPriority[] = ["Low", "Medium", "High"];
const statusSections: TaskStatus[] = ["In progress", "To do", "Done"];
const workedHourOptions = [0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8];
type SaveState = "idle" | "saving" | "saved" | "error";

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

function statusTone(status: TaskStatus) {
  if (status === "Done") {
    return "border-[#7bb87e] bg-[#d9f0db] text-[#1f5e2a]";
  }

  if (status === "In progress") {
    return "border-[#e0bf61] bg-[#fff0c7] text-[#755600]";
  }

  return "border-[#de8d75] bg-[#ffd9cd] text-[#7f2f1d]";
}

function statusContainerTone(status: TaskStatus) {
  if (status === "Done") {
    return "border-[#a5d6a8] bg-[#eff9ef]";
  }

  if (status === "In progress") {
    return "border-[#ebd28d] bg-[#fff8e2]";
  }

  return "border-[#e9b8a8] bg-[#fff0eb]";
}

export function ClientDetailApp({ clientId }: { clientId: string }) {
  const [profile, setProfile] = useState<Profile>(mockProfile);
  const [tags, setTags] = useState<Tag[]>(mockTags);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>("To do");
  const [priority, setPriority] = useState<TaskPriority>("Medium");
  const [dueDate, setDueDate] = useState(todayDate());
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [estimatedHours, setEstimatedHours] = useState<string>("");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isTaskTagPickerOpen, setIsTaskTagPickerOpen] = useState(false);
  const [clientNoteContent, setClientNoteContent] = useState("");
  const [clientNoteSaveState, setClientNoteSaveState] = useState<SaveState>("idle");
  const [isClientNoteOpen, setIsClientNoteOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSavedVisible, setIsSavedVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [clientName, setClientName] = useState<string>("");
  const { authUser, authState } = useSupabaseAuth();
  const pendingClientNoteSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function bootstrap() {
      if (hasSupabaseEnv() && !authUser) {
        setIsLoading(false);
        return;
      }

      const [appData, clientsData] = await Promise.all([
        loadAppData(authUser),
        loadClientsData(authUser),
      ]);
      if (!isMounted) {
        return;
      }

      const clientNoteData = await loadClientNoteInDataStore({
        clientId,
        profileId: appData.profile.id,
      });
      if (!isMounted) {
        return;
      }

      setProfile(appData.profile);
      setTags(appData.tags);
      setTasks(appData.tasks.filter((task) => task.clientId === clientId));
      setClientName(clientsData.clients.find((entry) => entry.id === clientId)?.name ?? "Client not found");
      setClientNoteContent(clientNoteData.note.content);
      setClientNoteSaveState("idle");
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
  }, [authState, authUser, clientId]);

  useEffect(() => {
    return () => {
      if (pendingClientNoteSaveTimeout.current) {
        clearTimeout(pendingClientNoteSaveTimeout.current);
      }
    };
  }, []);

  const sortedTasks = useMemo(() => {
    const priorityOrder = new Map(["High", "Medium", "Low"].map((value, index) => [value, index]));
    return [...tasks].sort((left, right) => {
      const leftPriority = priorityOrder.get(left.priority) ?? 99;
      const rightPriority = priorityOrder.get(right.priority) ?? 99;
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }
      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    });
  }, [tasks]);

  const groupedTasks = useMemo(
    () =>
      statusSections
        .map((statusLabel) => ({
          status: statusLabel,
          items: sortedTasks.filter((task) => task.status === statusLabel),
        }))
        .filter((group) => group.items.length > 0),
    [sortedTasks],
  );
  const clientNotePreview = useMemo(() => {
    const plain = clientNoteContent
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
    return plain.slice(0, 90);
  }, [clientNoteContent]);

  const flashSaved = () => {
    setIsSavedVisible(true);
    window.setTimeout(() => setIsSavedVisible(false), 1400);
  };

  const saveClientNote = (nextContent: string) => {
    if (!profile.id) {
      return;
    }

    if (pendingClientNoteSaveTimeout.current) {
      clearTimeout(pendingClientNoteSaveTimeout.current);
    }

    setClientNoteSaveState("saving");
    pendingClientNoteSaveTimeout.current = setTimeout(async () => {
      try {
        await upsertClientNoteInDataStore({
          clientId,
          profileId: profile.id,
          content: nextContent,
        });
        setClientNoteSaveState("saved");
        flashSaved();
      } catch {
        setClientNoteSaveState("error");
      }
    }, 700);
  };

  const handleCreateTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) {
      return;
    }

    const createdTask = await createTaskInDataStore({
      title: title.trim(),
      description: description.trim(),
      status,
      priority,
      dueDate,
      createdById: profile.id,
      tagIds: selectedTagIds,
      estimatedHours: estimatedHours ? Number(estimatedHours) : null,
      workedHours: 0,
      clientId,
    });
    setTasks((currentTasks) => [createdTask.task, ...currentTasks]);
    setTitle("");
    setDescription("");
    setStatus("To do");
    setPriority("Medium");
    setDueDate(todayDate());
    setSelectedTagIds([]);
    setEstimatedHours("");
    flashSaved();
  };

  const updateTask = async (
    taskId: number,
    updates: Partial<
      Pick<
        Task,
        | "title"
        | "description"
        | "status"
        | "priority"
        | "dueDate"
        | "tagIds"
        | "estimatedHours"
        | "workedHours"
      >
    >,
  ) => {
    setTasks((currentTasks) =>
      currentTasks.map((task) => {
        if (task.id !== taskId) {
          return task;
        }

        const nextTask = { ...task, ...updates };
        if (selectedTask?.id === taskId) {
          setSelectedTask(nextTask);
        }
        return nextTask;
      }),
    );
    await updateTaskInDataStore(taskId, updates);
    flashSaved();
  };

  const handleDeleteTask = async (taskId: number) => {
    const shouldDelete = window.confirm("Delete this task?");
    if (!shouldDelete) {
      return;
    }
    setTasks((currentTasks) => currentTasks.filter((task) => task.id !== taskId));
    setSelectedTask((currentTask) => (currentTask?.id === taskId ? null : currentTask));
    await deleteTaskInDataStore(taskId);
    flashSaved();
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
    return <LoginScreen onLogin={signInWithEmailPassword} onPasswordReset={sendPasswordResetEmail} />;
  }

  return (
    <>
      <SavedBadge visible={isSavedVisible} />
      <main className="min-h-screen px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
        <section className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-5">
          <AppHeader profile={profile} onProfileClick={() => setIsProfileOpen(true)} />

          <section className="rounded-lg border border-black/10 bg-white p-4 shadow-[0_18px_60px_rgba(0,0,0,0.08)] sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-black/45">Client</p>
                <h2 className="mt-2 text-lg font-semibold">{clientName}</h2>
              </div>
              <Link className="rounded-md border border-black/10 px-3 py-2 text-xs text-black/70" href="/clients">
                Back
              </Link>
            </div>
          </section>

          <section className="rounded-lg border border-black/10 bg-white p-4 shadow-[0_18px_60px_rgba(0,0,0,0.08)] sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.18em] text-black/45">Client Note</p>
                {isClientNoteOpen ? null : (
                  <p className="mt-1 truncate text-xs text-black/45">
                    {clientNotePreview || "No notes yet"}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <p className="text-xs text-black/50">
                  {clientNoteSaveState === "saving"
                    ? "Saving..."
                    : clientNoteSaveState === "saved"
                      ? "Saved"
                      : clientNoteSaveState === "error"
                        ? "Error saving"
                        : "Auto-save on"}
                </p>
                <button
                  className="rounded-md border border-black/10 px-3 py-2 text-xs text-black/70"
                  type="button"
                  onClick={() => setIsClientNoteOpen((current) => !current)}
                >
                  {isClientNoteOpen ? "Close" : "Open"}
                </button>
              </div>
            </div>
            {isClientNoteOpen ? (
              <div className="mt-3">
                <SimpleRichEditor
                  value={clientNoteContent}
                  minHeightClass="min-h-[180px]"
                  placeholder="Write client notes..."
                  onChange={(nextContent) => {
                    setClientNoteContent(nextContent);
                    saveClientNote(nextContent);
                  }}
                />
              </div>
            ) : null}
          </section>

          <section className="rounded-lg border border-black/10 bg-white p-4 shadow-[0_18px_60px_rgba(0,0,0,0.08)] sm:p-5">
            <form className="space-y-4" onSubmit={handleCreateTask}>
              <input
                className="w-full rounded-md border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none transition focus:border-black/40"
                placeholder="Task title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
              <textarea
                className="min-h-[72px] w-full resize-none rounded-md border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none transition focus:border-black/40"
                placeholder="Description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <select
                  className="rounded-md border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none transition focus:border-black/40"
                  value={status}
                  onChange={(event) => setStatus(event.target.value as TaskStatus)}
                >
                  {statuses.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <select
                  className="rounded-md border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none transition focus:border-black/40"
                  value={priority}
                  onChange={(event) => setPriority(event.target.value as TaskPriority)}
                >
                  {priorities.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <input
                  className="rounded-md border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none transition focus:border-black/40"
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
                <input
                  className="rounded-md border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none transition focus:border-black/40"
                  type="number"
                  min={0}
                  step={0.5}
                  placeholder="Estimated hours"
                  value={estimatedHours}
                  onChange={(event) => setEstimatedHours(event.target.value)}
                />
                <select
                  className="rounded-md border border-black/10 bg-white px-3 py-3 text-xs text-black outline-none transition focus:border-black/40"
                  value=""
                  onChange={(event) =>
                    setSelectedTagIds((currentTagIds) =>
                      currentTagIds.includes(event.target.value)
                        ? currentTagIds
                        : [...currentTagIds, event.target.value],
                    )
                  }
                >
                  <option value="">Add tag</option>
                  {tags
                    .filter((tag) => !selectedTagIds.includes(tag.id))
                    .map((tag) => (
                      <option key={tag.id} value={tag.id}>
                        {tag.name}
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex flex-wrap gap-2">
                {selectedTagIds.map((tagId) => (
                  <button
                    key={tagId}
                    className="rounded-md border border-black/10 bg-white px-2 py-1 text-[11px] text-black/60"
                    type="button"
                    onClick={() =>
                      setSelectedTagIds((currentTagIds) =>
                        currentTagIds.filter((currentTagId) => currentTagId !== tagId),
                      )
                    }
                  >
                    {tags.find((tag) => tag.id === tagId)?.name ?? tagId}
                  </button>
                ))}
              </div>

              <button
                className="rounded-md border border-black bg-black px-4 py-3 text-sm font-medium text-white transition hover:bg-black/90"
                type="submit"
              >
                Add
              </button>
            </form>
          </section>

          <section className="space-y-3">
            {groupedTasks.length === 0 ? (
              <section className="rounded-lg border border-black/10 bg-white p-4 shadow-[0_18px_60px_rgba(0,0,0,0.08)]">
              <p className="text-sm text-black/55">No tasks yet for this client.</p>
              </section>
            ) : (
              groupedTasks.map((group) => (
                <section
                  key={group.status}
                  className="rounded-lg border border-black/10 bg-white p-4 shadow-[0_18px_60px_rgba(0,0,0,0.08)] sm:p-5"
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-black/45">{group.status}</p>
                    <span className="text-xs text-black/45">{group.items.length}</span>
                  </div>

                  <div className="space-y-2">
                    {group.items.map((task) => (
                      <button
                        key={task.id}
                        className={`w-full rounded-md border p-3 text-left transition hover:border-black/30 ${statusContainerTone(task.status)}`}
                        type="button"
                        onClick={() => {
                          setSelectedTask(task);
                          setIsTaskTagPickerOpen(false);
                        }}
                      >
                        <p className="truncate text-sm font-medium">{task.title}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-black/55">
                          <span className={`rounded-md border px-2 py-1 ${statusTone(task.status)}`}>
                            {task.status}
                          </span>
                          <span className="rounded-md border border-black/10 bg-white px-2 py-1">
                            {task.priority}
                          </span>
                          <span className="rounded-md border border-black/10 bg-white px-2 py-1">
                            Due {formatDate(task.dueDate)}
                          </span>
                          <span className="rounded-md border border-black/10 bg-white px-2 py-1">
                            {task.workedHours ?? 0}h
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              ))
            )}
          </section>
        </section>
      </main>

      {selectedTask ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/25 p-3 sm:items-center sm:p-6">
          <button
            aria-label="Close task details"
            className="absolute inset-0"
            type="button"
            onClick={() => {
              setSelectedTask(null);
              setIsTaskTagPickerOpen(false);
            }}
          />
          <section className="relative z-10 w-full max-w-2xl rounded-lg border border-black/10 bg-white p-5 shadow-[0_24px_80px_rgba(0,0,0,0.18)] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="w-full space-y-3">
                <input
                  className="w-full rounded-md border border-black/10 bg-white px-4 py-3 text-xl font-semibold text-black outline-none transition focus:border-black/40"
                  value={selectedTask.title}
                  onChange={(event) =>
                    void updateTask(selectedTask.id, { title: event.target.value })
                  }
                />
                <textarea
                  className="min-h-[120px] w-full resize-none rounded-md border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none transition focus:border-black/40"
                  value={selectedTask.description}
                  onChange={(event) =>
                    void updateTask(selectedTask.id, { description: event.target.value })
                  }
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="flex h-9 w-9 items-center justify-center rounded-md border border-black/10 text-sm text-black/65 transition hover:border-black/30"
                  type="button"
                  onClick={() => void handleDeleteTask(selectedTask.id)}
                  aria-label="Delete task"
                  title="Delete task"
                >
                  <svg
                    aria-hidden="true"
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4 7h16" />
                    <path d="M10 11v6" />
                    <path d="M14 11v6" />
                    <path d="M6 7l1 12h10l1-12" />
                    <path d="M9 7V4h6v3" />
                  </svg>
                </button>
                <button
                  className="rounded-md border border-black/10 px-3 py-2 text-xs text-black/65 transition hover:border-black/30"
                  type="button"
                  onClick={() => {
                    setSelectedTask(null);
                    setIsTaskTagPickerOpen(false);
                  }}
                >
                  Close
                </button>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <select
                className="w-full rounded-md border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none transition focus:border-black/40"
                value={selectedTask.status}
                onChange={(event) =>
                  void updateTask(selectedTask.id, { status: event.target.value as TaskStatus })
                }
              >
                {statuses.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <select
                className="w-full rounded-md border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none transition focus:border-black/40"
                value={selectedTask.priority}
                onChange={(event) =>
                  void updateTask(selectedTask.id, { priority: event.target.value as TaskPriority })
                }
              >
                {priorities.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <input
                className="w-full rounded-md border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none transition focus:border-black/40"
                type="date"
                value={selectedTask.dueDate}
                onChange={(event) => void updateTask(selectedTask.id, { dueDate: event.target.value })}
              />
              <input
                className="w-full rounded-md border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none transition focus:border-black/40"
                type="number"
                min={0}
                step={0.5}
                value={selectedTask.estimatedHours ?? ""}
                placeholder="Estimated hours"
                onChange={(event) =>
                  void updateTask(selectedTask.id, {
                    estimatedHours: event.target.value ? Number(event.target.value) : null,
                  })
                }
              />
              <select
                className="w-full rounded-md border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none transition focus:border-black/40"
                value={String(selectedTask.workedHours ?? 0)}
                onChange={(event) =>
                  void updateTask(selectedTask.id, { workedHours: Number(event.target.value) })
                }
              >
                {workedHourOptions.map((value) => (
                  <option key={value} value={value}>
                    {value}h worked
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-3 flex gap-2">
              <button
                className="rounded-md border border-black/10 bg-white px-2 py-1 text-[11px] text-black/65"
                type="button"
                onClick={() =>
                  void updateTask(selectedTask.id, { workedHours: (selectedTask.workedHours ?? 0) + 0.5 })
                }
              >
                +0.5h
              </button>
              <button
                className="rounded-md border border-black/10 bg-white px-2 py-1 text-[11px] text-black/65"
                type="button"
                onClick={() =>
                  void updateTask(selectedTask.id, { workedHours: (selectedTask.workedHours ?? 0) + 1 })
                }
              >
                +1h
              </button>
            </div>

            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] uppercase tracking-[0.18em] text-black/45">Tags</p>
                <button
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-black/10 text-sm text-black/65 transition hover:border-black/30"
                  type="button"
                  onClick={() => setIsTaskTagPickerOpen((current) => !current)}
                  aria-label="Add tag"
                >
                  +
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {selectedTask.tagIds.map((tagId) => (
                  <button
                    key={tagId}
                    className="group inline-flex items-center gap-2 rounded-md border border-black/10 bg-white px-2 py-1 text-[11px] text-black/60"
                    type="button"
                    onClick={() =>
                      void updateTask(selectedTask.id, {
                        tagIds: selectedTask.tagIds.filter((currentTagId) => currentTagId !== tagId),
                      })
                    }
                  >
                    <span>{tags.find((tag) => tag.id === tagId)?.name ?? tagId}</span>
                    <span className="opacity-0 transition group-hover:opacity-100">x</span>
                  </button>
                ))}
              </div>

              {isTaskTagPickerOpen ? (
                <div className="flex flex-wrap gap-2">
                  {tags
                    .filter((tag) => !selectedTask.tagIds.includes(tag.id))
                    .map((tag) => (
                      <button
                        key={tag.id}
                        className="rounded-md border border-black/10 bg-white px-3 py-2 text-xs text-black/65 transition hover:border-black/30"
                        type="button"
                        onClick={() =>
                          void updateTask(selectedTask.id, { tagIds: [...selectedTask.tagIds, tag.id] })
                        }
                      >
                        {tag.name}
                      </button>
                    ))}
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

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
