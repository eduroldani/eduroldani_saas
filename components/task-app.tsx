"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { AppHeader } from "@/components/app-header";
import { LoginScreen } from "@/components/login-screen";
import { SavedBadge } from "@/components/saved-badge";
import {
  createTagInDataStore,
  createTaskInDataStore,
  deleteTaskInDataStore,
  loadAppData,
  loadClientsData,
  updateProfileInDataStore,
  updateTaskInDataStore,
} from "@/lib/task-data";
import { mockProfile, mockTags, mockTasks } from "@/lib/mock-data";
import {
  hasSupabaseEnv,
  sendPasswordResetEmail,
  signInWithEmailPassword,
  signOutFromSupabase,
} from "@/lib/supabase";
import { useSupabaseAuth } from "@/hooks/use-supabase-auth";
import type { Client, Profile, Tag, Task, TaskPriority, TaskStatus, ViewMode } from "@/lib/task-types";

const statuses: TaskStatus[] = ["To do", "In progress", "Done"];
const priorities: TaskPriority[] = ["Low", "Medium", "High"];
const viewModes: ViewMode[] = ["Board", "List"];
const buyTagNames = new Set(["buy", "compra"]);
const statusSections: TaskStatus[] = ["In progress", "To do", "Done"];

type GroupMode = "none" | "tag";
type DashboardSection = "tasks" | "buy";

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

function priorityTone(priority: TaskPriority) {
  if (priority === "High") {
    return "border-black bg-black text-white";
  }

  if (priority === "Medium") {
    return "border-black/15 bg-[#efefef] text-black";
  }

  return "border-black/10 bg-white text-black/65";
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

function Avatar({ profile, small = false }: { profile: Profile; small?: boolean }) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full border border-black/10 bg-[#f1f1f1] font-medium text-black ${
        small ? "h-8 w-8 text-[11px]" : "h-12 w-12 text-sm"
      }`}
      aria-label={profile.name}
      title={profile.name}
    >
      {profile.avatarLabel}
    </div>
  );
}

export function TaskApp({ section = "tasks" }: { section?: DashboardSection }) {
  const [viewMode, setViewMode] = useState<ViewMode>("List");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>("To do");
  const [priority, setPriority] = useState<TaskPriority>("Medium");
  const [dueDate, setDueDate] = useState(todayDate());
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [newTaskTagPickerValue, setNewTaskTagPickerValue] = useState("");
  const [isCreateTagPickerOpen, setIsCreateTagPickerOpen] = useState(false);
  const [profile, setProfile] = useState<Profile>(mockProfile);
  const [clients, setClients] = useState<Client[]>([]);
  const [tags, setTags] = useState<Tag[]>(mockTags);
  const [tasks, setTasks] = useState<Task[]>(mockTasks);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [groupMode, setGroupMode] = useState<GroupMode>("none");
  const [showDone, setShowDone] = useState(false);
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [activeTaskTagPickerId, setActiveTaskTagPickerId] = useState<number | null>(null);
  const [isTagPickerOpen, setIsTagPickerOpen] = useState(false);
  const [profileNameDraft, setProfileNameDraft] = useState("");
  const [isSavingProfileName, setIsSavingProfileName] = useState(false);
  const [isSavedVisible, setIsSavedVisible] = useState(false);
  const savedBadgeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { authUser, authState } = useSupabaseAuth();

  const buyTagIds = useMemo(
    () =>
      new Set(
        tags
          .filter((tag) => buyTagNames.has(tag.name.trim().toLowerCase()))
          .map((tag) => tag.id),
      ),
    [tags],
  );
  const primaryBuyTagId = useMemo(
    () => tags.find((tag) => buyTagNames.has(tag.name.trim().toLowerCase()))?.id ?? null,
    [tags],
  );

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

      setProfile(appData.profile);
      setProfileNameDraft(appData.profile.name);
      setClients(clientsData.clients);
      setTags(appData.tags);
      setTasks(appData.tasks);
      if (section === "buy" && primaryBuyTagId) {
        setSelectedTagIds([primaryBuyTagId]);
      } else {
        setSelectedTagIds([]);
      }
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
  }, [authState, authUser, primaryBuyTagId, section]);

  useEffect(() => {
    if (section !== "buy") {
      return;
    }

    if (primaryBuyTagId) {
      setSelectedTagIds((currentTagIds) =>
        currentTagIds.includes(primaryBuyTagId) ? currentTagIds : [primaryBuyTagId],
      );
    }
  }, [primaryBuyTagId, section]);

  const getTagName = (tagId: string) => tags.find((tag) => tag.id === tagId)?.name ?? tagId;

  const flashSavedBadge = () => {
    if (savedBadgeTimeoutRef.current) {
      clearTimeout(savedBadgeTimeoutRef.current);
    }

    setIsSavedVisible(true);
    savedBadgeTimeoutRef.current = setTimeout(() => {
      setIsSavedVisible(false);
    }, 1600);
  };

  const handleTagSelectionForNewTask = async (value: string) => {
    if (!value) {
      setNewTaskTagPickerValue("");
      return;
    }

    if (value === "__create_new_tag__") {
      const rawName = window.prompt("New tag name");
      if (!rawName) {
        setNewTaskTagPickerValue("");
        return;
      }

      const cleanedName = rawName.trim();
      if (!cleanedName) {
        setNewTaskTagPickerValue("");
        return;
      }

      const existingTag = tags.find(
        (tag) => tag.name.trim().toLowerCase() === cleanedName.toLowerCase(),
      );

      if (existingTag) {
        setSelectedTagIds((currentTagIds) =>
          currentTagIds.includes(existingTag.id) ? currentTagIds : [...currentTagIds, existingTag.id],
        );
        setIsCreateTagPickerOpen(false);
        setNewTaskTagPickerValue("");
        return;
      }

      const createdTag = await createTagInDataStore(cleanedName);
      setTags((currentTags) => [...currentTags, createdTag]);
      setSelectedTagIds((currentTagIds) =>
        currentTagIds.includes(createdTag.id) ? currentTagIds : [...currentTagIds, createdTag.id],
      );
      setIsCreateTagPickerOpen(false);
      setNewTaskTagPickerValue("");
      return;
    }

    setSelectedTagIds((currentTagIds) =>
      currentTagIds.includes(value) ? currentTagIds : [...currentTagIds, value],
    );
    setIsCreateTagPickerOpen(false);
    setNewTaskTagPickerValue("");
  };

  const handleCreateTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) {
      return;
    }

    const created = await createTaskInDataStore({
      title: title.trim(),
      description: description.trim(),
      status,
      priority,
      dueDate,
      createdById: profile.id,
      tagIds: selectedTagIds,
    });

    setTasks((currentTasks) => [created.task, ...currentTasks]);
    flashSavedBadge();
    setTitle("");
    setDescription("");
    setStatus("To do");
    setPriority("Medium");
    setDueDate(todayDate());
    setNewTaskTagPickerValue("");
    setIsCreateTagPickerOpen(false);
    if (section === "buy" && primaryBuyTagId) {
      setSelectedTagIds([primaryBuyTagId]);
      return;
    }

    setSelectedTagIds([]);
  };

  const updateTask = async (
    taskId: number,
    updates: Partial<Pick<Task, "title" | "description" | "status" | "priority" | "dueDate" | "tagIds" | "clientId">>,
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

    if (updates.clientId && selectedTask?.id === taskId) {
      setSelectedTask(null);
      setIsTagPickerOpen(false);
    }

    await updateTaskInDataStore(taskId, updates);
    flashSavedBadge();
  };

  const handleDeleteTask = async (taskId: number) => {
    const shouldDelete = window.confirm("Are you sure you want to delete this task?");
    if (!shouldDelete) {
      return;
    }

    setTasks((currentTasks) => currentTasks.filter((task) => task.id !== taskId));
    setSelectedTask((currentTask) => (currentTask?.id === taskId ? null : currentTask));
    await deleteTaskInDataStore(taskId);
    flashSavedBadge();
  };

  const handleLogout = async () => {
    await signOutFromSupabase();
    setIsProfileOpen(false);
    setSelectedTask(null);
  };

  const handleProfileSave = async () => {
    const nextName = profileNameDraft.trim();
    if (!nextName || nextName === profile.name) {
      return;
    }

    setIsSavingProfileName(true);
    try {
      const updatedProfile = await updateProfileInDataStore({
        profileId: profile.id,
        name: nextName,
        email: profile.email,
      });
      setProfile(updatedProfile);
      setProfileNameDraft(updatedProfile.name);
      flashSavedBadge();
    } finally {
      setIsSavingProfileName(false);
    }
  };

  useEffect(() => {
    return () => {
      if (savedBadgeTimeoutRef.current) {
        clearTimeout(savedBadgeTimeoutRef.current);
      }
    };
  }, []);

  const scopedTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (task.clientId) {
        return false;
      }

      const isBuyTask = task.tagIds.some((tagId) => buyTagIds.has(tagId));
      return section === "buy" ? isBuyTask : !isBuyTask;
    });
  }, [buyTagIds, section, tasks]);

  const filteredTasks = useMemo(() => {
    if (section === "buy") {
      return scopedTasks;
    }

    if (tagFilter === "all") {
      return scopedTasks;
    }

    return scopedTasks.filter((task) => task.tagIds.includes(tagFilter));
  }, [scopedTasks, section, tagFilter]);

  const sortedTasks = useMemo(() => {
    const priorityOrder = new Map(
      ["High", "Medium", "Low"].map((value, index) => [value, index]),
    );

    return [...filteredTasks].sort((left, right) => {
      const leftPriority = priorityOrder.get(left.priority) ?? 99;
      const rightPriority = priorityOrder.get(right.priority) ?? 99;
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }

      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    });
  }, [filteredTasks]);

  const groupedTasksByTag = useMemo(() => {
    return tags
      .map((tag) => ({
        tag,
        items: sortedTasks.filter((task) => task.tagIds.includes(tag.id)),
      }))
      .filter((group) => group.items.length > 0);
  }, [sortedTasks, tags]);

  const tasksByStatus = useMemo(
    () =>
      statusSections
        .map((statusLabel) => ({
          status: statusLabel,
          items: sortedTasks.filter((task) => task.status === statusLabel),
        }))
        .filter((group) => (showDone ? true : group.status !== "Done"))
        .filter((group) => group.items.length > 0),
    [showDone, sortedTasks],
  );

  const TaskTags = ({
    tagIds,
    removable = false,
    onRemove,
  }: {
    tagIds: string[];
    removable?: boolean;
    onRemove?: (tagId: string) => void;
  }) => (
    <div className="flex flex-wrap gap-2">
      {tagIds.map((tagId) => (
        <button
          key={tagId}
          className="group inline-flex items-center gap-2 rounded-md border border-black/10 bg-white px-2 py-1 text-[11px] text-black/60"
          type="button"
          onClick={removable && onRemove ? () => onRemove(tagId) : undefined}
        >
          <span>{getTagName(tagId)}</span>
          {removable ? <span className="opacity-0 transition group-hover:opacity-100">x</span> : null}
        </button>
      ))}
    </div>
  );

  const TaskMeta = ({ task }: { task: Task }) => (
    <div className="flex flex-wrap items-center gap-2 text-xs text-black/50">
      <span className={`rounded-md border px-2 py-1 ${priorityTone(task.priority)}`}>{task.priority}</span>
      <span className={`rounded-md border px-2 py-1 ${statusTone(task.status)}`}>{task.status}</span>
      <span className="rounded-md border border-black/10 px-2 py-1">Due {formatDate(task.dueDate)}</span>
      <span className="rounded-md border border-black/10 px-2 py-1">Created {formatDate(task.createdAt)}</span>
    </div>
  );

  const TaskCard = ({ task, compact = false }: { task: Task; compact?: boolean }) => (
    <article
      className={`rounded-md border shadow-[0_12px_36px_rgba(0,0,0,0.06)] ${statusContainerTone(task.status)} ${
        compact ? "p-3 sm:p-4" : "p-4"
      }`}
    >
      <button
        className="w-full space-y-3 text-left"
        type="button"
        onClick={() => setSelectedTask(task)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h3 className="break-words text-sm font-medium sm:text-base">{task.title}</h3>
            <p className="text-sm text-black/55">{task.description || "No description"}</p>
          </div>
          <Avatar profile={profile} small />
        </div>

        <TaskMeta task={task} />
        <TaskTags tagIds={task.tagIds} />
      </button>

      <div className={`mt-3 grid gap-2 ${compact ? "grid-cols-1" : "sm:grid-cols-3"}`}>
        <input
          className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-xs text-black/70 outline-none transition focus:border-black/35"
          type="date"
          value={task.dueDate}
          onChange={(event) => void updateTask(task.id, { dueDate: event.target.value })}
          aria-label="Task due date"
        />
        <select
          className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-xs text-black/75 outline-none transition focus:border-black/35"
          value={task.priority}
          onChange={(event) => void updateTask(task.id, { priority: event.target.value as TaskPriority })}
          aria-label="Task priority"
        >
          {priorities.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <select
          className={`w-full rounded-md border px-3 py-2 text-xs outline-none transition focus:border-black/35 ${statusTone(task.status)}`}
          value={task.status}
          onChange={(event) => void updateTask(task.id, { status: event.target.value as TaskStatus })}
          aria-label="Task status"
        >
          {statuses.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
    </article>
  );

  const MobileListRow = ({ task }: { task: Task }) => (
    <div className={`flex items-center gap-3 rounded-md border px-3 py-3 ${statusContainerTone(task.status)}`}>
      <button className="min-w-0 flex-1 text-left" type="button" onClick={() => setSelectedTask(task)}>
        <p className="truncate text-sm font-medium">{task.title}</p>
        <p className="mt-1 text-xs text-black/50">{task.status}</p>
      </button>

      <button
        className={`rounded-md border px-3 py-2 text-xs font-medium transition ${
          task.status === "Done"
            ? "border-[#cfe5cf] bg-[#eef8ee] text-[#2f5b38]"
            : "border-black/15 bg-white text-black/70 hover:border-black/30"
        }`}
        type="button"
        onClick={() => void updateTask(task.id, { status: "Done" })}
        disabled={task.status === "Done"}
      >
        {task.status === "Done" ? "Done" : "Mark done"}
      </button>
    </div>
  );

  const BuyListRow = ({ task }: { task: Task }) => (
    <label
      className={`flex items-center gap-3 rounded-md border px-3 py-3 ${statusContainerTone(task.status)}`}
    >
      <input
        className="h-4 w-4 rounded border-black/20 accent-black"
        type="checkbox"
        checked={task.status === "Done"}
        onChange={(event) =>
          void updateTask(task.id, { status: event.target.checked ? "Done" : "To do" })
        }
        aria-label={`Mark ${task.title} as done`}
      />
      <button
        className="min-w-0 flex-1 text-left"
        type="button"
        onClick={() => setSelectedTask(task)}
      >
        <p className={`truncate text-sm ${task.status === "Done" ? "text-black/45 line-through" : "text-black"}`}>
          {task.title}
        </p>
      </button>
      <span className={`rounded-md border px-2 py-1 text-[11px] ${statusTone(task.status)}`}>
        {task.status === "Done" ? "Done" : "Pending"}
      </span>
    </label>
  );

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

  return (
    <>
      <SavedBadge visible={isSavedVisible} />
      <main className="min-h-screen px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
        <section className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-5">
          <AppHeader
            profile={profile}
            onProfileClick={() => {
              setProfileNameDraft(profile.name);
              setIsProfileOpen(true);
            }}
          />

          <section className="rounded-lg border border-black/10 bg-white p-4 shadow-[0_18px_60px_rgba(0,0,0,0.08)] sm:p-5">
            <form className="space-y-4" onSubmit={handleCreateTask}>
              <input
                className="w-full rounded-md border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none transition focus:border-black/40"
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Title"
              />
              <textarea
                className={`min-h-[84px] w-full resize-none rounded-md border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none transition focus:border-black/40 ${
                  section === "buy" ? "hidden sm:block" : "block"
                }`}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Description"
              />

              <div
                className={`grid gap-3 sm:grid-cols-2 xl:grid-cols-3 ${
                  section === "buy" ? "hidden sm:grid" : ""
                }`}
              >
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
              </div>

              {section === "tasks" ? (
                <>
                  <div className="hidden items-center gap-2 sm:flex">
                    <button
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-black/10 text-xs text-black/65 transition hover:border-black/30"
                      type="button"
                      onClick={() => setIsCreateTagPickerOpen((current) => !current)}
                      aria-label="Add tag"
                    >
                      +
                    </button>

                    <div className="flex flex-wrap gap-2">
                      {selectedTagIds.map((tagId) => (
                        <button
                          key={tagId}
                          className="group inline-flex items-center gap-2 rounded-md border border-black/10 bg-white px-2 py-1 text-[11px] text-black/60"
                          type="button"
                          onClick={() =>
                            setSelectedTagIds((currentTagIds) =>
                              currentTagIds.filter((currentTagId) => currentTagId !== tagId),
                            )
                          }
                        >
                          <span>{getTagName(tagId)}</span>
                          <span className="opacity-0 transition group-hover:opacity-100">x</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {isCreateTagPickerOpen ? (
                    <div className="hidden flex-wrap gap-2 sm:flex">
                      {tags
                        .filter((tag) => !selectedTagIds.includes(tag.id))
                        .map((tag) => (
                          <button
                            key={tag.id}
                            className="rounded-md border border-black/10 bg-white px-3 py-2 text-xs text-black/65 transition hover:border-black/30"
                            type="button"
                            onClick={() => void handleTagSelectionForNewTask(tag.id)}
                          >
                            {tag.name}
                          </button>
                        ))}
                      <button
                        className="rounded-md border border-black/10 bg-white px-3 py-2 text-xs text-black/65 transition hover:border-black/30"
                        type="button"
                        onClick={() => void handleTagSelectionForNewTask("__create_new_tag__")}
                      >
                        + New tag
                      </button>
                    </div>
                  ) : null}

                  <div className="sm:hidden">
                    <select
                      className="w-full rounded-md border border-black/10 bg-white px-3 py-3 text-xs text-black outline-none transition focus:border-black/40"
                      value={newTaskTagPickerValue}
                      onChange={(event) => void handleTagSelectionForNewTask(event.target.value)}
                    >
                      <option value="">Add tag</option>
                      {tags
                        .filter((tag) => !selectedTagIds.includes(tag.id))
                        .map((tag) => (
                          <option key={tag.id} value={tag.id}>
                            {tag.name}
                          </option>
                        ))}
                      <option value="__create_new_tag__">+ Create new tag</option>
                    </select>
                  </div>
                </>
              ) : null}

              <div className="flex justify-start">
                <button
                  className="rounded-md border border-black bg-black px-4 py-3 text-sm font-medium text-white transition hover:bg-black/90"
                  type="submit"
                >
                  Add
                </button>
              </div>
            </form>
          </section>

          {section === "tasks" ? (
            <section className="rounded-lg border border-black/10 bg-white p-3 shadow-[0_18px_60px_rgba(0,0,0,0.08)] sm:p-4">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  className={`rounded-md border px-3 py-2 text-xs transition ${
                    tagFilter === "all" ? "border-black bg-black text-white" : "border-black/10 text-black/65"
                  }`}
                  type="button"
                  onClick={() => setTagFilter("all")}
                >
                  All
                </button>
                {tags
                  .filter((tag) => !buyTagIds.has(tag.id))
                  .map((tag) => (
                    <button
                      key={tag.id}
                      className={`rounded-md border px-3 py-2 text-xs transition ${
                        tagFilter === tag.id ? "border-black bg-black text-white" : "border-black/10 text-black/65"
                      }`}
                      type="button"
                      onClick={() => setTagFilter(tag.id)}
                    >
                      {tag.name}
                    </button>
                  ))}
              </div>
            </section>
          ) : null}

          {section === "tasks" ? (
            <section className="rounded-lg border border-black/10 bg-white p-4 shadow-[0_18px_60px_rgba(0,0,0,0.08)] sm:p-5">
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-md border border-black/10 bg-[#fafafa] px-4 py-3 text-xs text-black/55">
                  Priority: High to Low · Newest first
                </div>
                <select
                  className="rounded-md border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none transition focus:border-black/40"
                  value={tagFilter}
                  onChange={(event) => setTagFilter(event.target.value)}
                >
                  <option value="all">All tags</option>
                  {tags
                    .filter((tag) => !buyTagIds.has(tag.id))
                    .map((tag) => (
                      <option key={tag.id} value={tag.id}>
                        {tag.name}
                      </option>
                    ))}
                </select>
                <select
                  className="rounded-md border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none transition focus:border-black/40"
                  value={groupMode}
                  onChange={(event) => setGroupMode(event.target.value as GroupMode)}
                >
                  <option value="none">No grouping</option>
                  <option value="tag">Group by tag</option>
                </select>
                <button
                  className="rounded-md border border-black/10 bg-white px-4 py-3 text-sm text-black/70 transition hover:border-black/30"
                  type="button"
                  onClick={() => setShowDone((current) => !current)}
                >
                  {showDone ? "Hide done" : "Show done"}
                </button>
              </div>
            </section>
          ) : (
            <section className="rounded-lg border border-black/10 bg-white p-4 shadow-[0_18px_60px_rgba(0,0,0,0.08)] sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs uppercase tracking-[0.18em] text-black/50">Buy List</p>
                <p className="text-xs text-black/50">{sortedTasks.length} items</p>
              </div>
            </section>
          )}

          {section === "buy" ? (
            <section className="space-y-3 rounded-lg border border-black/10 bg-white p-4 shadow-[0_18px_60px_rgba(0,0,0,0.08)]">
              {sortedTasks.length === 0 ? (
                <p className="text-sm text-black/55">No items in buy list yet.</p>
              ) : (
                sortedTasks.map((task) => <BuyListRow key={task.id} task={task} />)
              )}
            </section>
          ) : groupMode === "tag" ? (
            <section className="space-y-4">
              {groupedTasksByTag.map((group) => (
                <section
                  key={group.tag.id}
                  className="rounded-lg border border-black/10 bg-white p-4 shadow-[0_18px_60px_rgba(0,0,0,0.08)]"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-black/75">
                      {group.tag.name}
                    </h2>
                    <span className="rounded-md border border-black/10 px-2 py-1 text-xs text-black/45">
                      {group.items.length}
                    </span>
                  </div>

                  <div className={viewMode === "Board" ? "grid gap-4 lg:grid-cols-3" : "space-y-3"}>
                    {group.items.map((task) => (
                      <TaskCard key={task.id} task={task} compact={viewMode === "List"} />
                    ))}
                  </div>
                </section>
              ))}
            </section>
          ) : viewMode === "Board" ? (
            <section className="grid gap-4 lg:grid-cols-3">
              {statuses.map((currentStatus) => {
                const items = sortedTasks.filter((task) => task.status === currentStatus);

                return (
                  <div
                    key={currentStatus}
                    className="rounded-lg border border-black/10 bg-white p-4 shadow-[0_18px_60px_rgba(0,0,0,0.08)]"
                  >
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-black/75">
                        {currentStatus}
                      </h2>
                      <span className="rounded-md border border-black/10 px-2 py-1 text-xs text-black/45">
                        {items.length}
                      </span>
                    </div>

                    <div className="space-y-3">
                      {items.map((task) => (
                        <TaskCard key={task.id} task={task} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </section>
          ) : (
            <section className="space-y-4">
              {tasksByStatus.length === 0 ? (
                <section className="rounded-lg border border-black/10 bg-white p-4 text-sm text-black/55 shadow-[0_18px_60px_rgba(0,0,0,0.08)]">
                  No tasks for this filter.
                </section>
              ) : (
                tasksByStatus.map((group) => (
                  <section
                    key={group.status}
                    className={`overflow-hidden rounded-lg border shadow-[0_18px_60px_rgba(0,0,0,0.08)] ${statusContainerTone(group.status)}`}
                  >
                    <div className="flex items-center justify-between border-b border-black/10 px-4 py-3">
                      <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-black/70">
                        {group.status}
                      </h2>
                      <span className={`rounded-md border px-2 py-1 text-[11px] ${statusTone(group.status)}`}>
                        {group.items.length}
                      </span>
                    </div>

                    <div className="divide-y divide-black/10">
                      {group.items.map((task) => (
                        <div key={task.id} className="px-4 py-4">
                          <div className="hidden gap-3 lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.9fr)_120px_120px_120px_180px] lg:items-start">
                            <div className="min-w-0 space-y-2">
                              <button className="w-full min-w-0 text-left" type="button" onClick={() => setSelectedTask(task)}>
                                <p className="truncate text-sm font-medium">{task.title}</p>
                              </button>

                              <div className="flex flex-wrap items-center gap-2">
                                <TaskTags
                                  tagIds={task.tagIds}
                                  removable
                                  onRemove={(tagId) =>
                                    void updateTask(task.id, {
                                      tagIds: task.tagIds.filter((currentTagId) => currentTagId !== tagId),
                                    })
                                  }
                                />

                                <button
                                  className="flex h-7 w-7 items-center justify-center rounded-md border border-black/10 bg-white text-xs text-black/65 transition hover:border-black/30"
                                  type="button"
                                  onClick={() =>
                                    setActiveTaskTagPickerId((current) =>
                                      current === task.id ? null : task.id,
                                    )
                                  }
                                  aria-label={`Add tag to ${task.title}`}
                                >
                                  +
                                </button>
                              </div>

                              {activeTaskTagPickerId === task.id ? (
                                <div className="flex flex-wrap gap-2">
                                  {tags
                                    .filter((tag) => !task.tagIds.includes(tag.id))
                                    .map((tag) => (
                                      <button
                                        key={tag.id}
                                        className="rounded-md border border-black/10 bg-white px-3 py-2 text-xs text-black/65 transition hover:border-black/30"
                                        type="button"
                                        onClick={() => {
                                          void updateTask(task.id, {
                                            tagIds: [...task.tagIds, tag.id],
                                          });
                                          setActiveTaskTagPickerId(null);
                                        }}
                                      >
                                        {tag.name}
                                      </button>
                                    ))}
                                </div>
                              ) : null}
                            </div>

                            <button className="min-w-0 text-left" type="button" onClick={() => setSelectedTask(task)}>
                              <p className="line-clamp-3 break-words text-sm text-black/55">{task.description}</p>
                            </button>

                            <input
                              className="rounded-md border border-black/10 bg-white px-3 py-2 text-xs text-black/70 outline-none transition focus:border-black/35"
                              type="date"
                              value={task.dueDate}
                              onChange={(event) => void updateTask(task.id, { dueDate: event.target.value })}
                              aria-label={`Due date for ${task.title}`}
                            />
                            <select
                              className={`rounded-md border px-3 py-2 text-xs outline-none transition focus:border-black/35 ${priorityTone(task.priority)}`}
                              value={task.priority}
                              onChange={(event) =>
                                void updateTask(task.id, { priority: event.target.value as TaskPriority })
                              }
                              aria-label={`Priority for ${task.title}`}
                            >
                              {priorities.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                            <select
                              className={`rounded-md border px-3 py-2 text-xs outline-none transition focus:border-black/35 ${statusTone(task.status)}`}
                              value={task.status}
                              onChange={(event) =>
                                void updateTask(task.id, { status: event.target.value as TaskStatus })
                              }
                              aria-label={`Status for ${task.title}`}
                            >
                              {statuses.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                                ))}
                            </select>
                            <select
                              className="rounded-md border border-black/10 bg-white px-3 py-2 text-xs text-black/75 outline-none transition focus:border-black/35"
                              value={task.clientId ?? ""}
                              onChange={(event) =>
                                void updateTask(task.id, {
                                  clientId: event.target.value || null,
                                })
                              }
                              aria-label={`Client for ${task.title}`}
                            >
                              <option value="">No client</option>
                              {clients.map((client) => (
                                <option key={client.id} value={client.id}>
                                  {client.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="lg:hidden">
                            <MobileListRow task={task} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ))
              )}
            </section>
          )}
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
              setIsTagPickerOpen(false);
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
                    setIsTagPickerOpen(false);
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

            {section === "tasks" ? (
              <div className="mt-3">
                <select
                  className="w-full rounded-md border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none transition focus:border-black/40"
                  value={selectedTask.clientId ?? ""}
                  onChange={(event) =>
                    void updateTask(selectedTask.id, { clientId: event.target.value || null })
                  }
                >
                  <option value="">No client</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="mt-3">
              <input
                className="w-full rounded-md border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none transition focus:border-black/40"
                type="date"
                value={selectedTask.dueDate}
                onChange={(event) => void updateTask(selectedTask.id, { dueDate: event.target.value })}
              />
            </div>

            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] uppercase tracking-[0.18em] text-black/45">Tags</p>
                <button
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-black/10 text-sm text-black/65 transition hover:border-black/30"
                  type="button"
                  onClick={() => setIsTagPickerOpen((current) => !current)}
                  aria-label="Add tag"
                >
                  +
                </button>
              </div>

              <TaskTags
                tagIds={selectedTask.tagIds}
                removable
                onRemove={(tagId) =>
                  void updateTask(selectedTask.id, {
                    tagIds: selectedTask.tagIds.filter((currentTagId) => currentTagId !== tagId),
                  })
                }
              />

              {isTagPickerOpen ? (
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
                <h2 className="text-2xl font-semibold">Account</h2>
              </div>
              <button
                className="rounded-md border border-black/10 px-3 py-2 text-xs text-black/65 transition hover:border-black/30"
                type="button"
                onClick={() => setIsProfileOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="mt-6 space-y-4 rounded-md border border-black/10 bg-[#fafafa] p-4">
              <div className="flex items-center gap-4">
                <Avatar profile={profile} />
                <div className="min-w-0">
                  <p className="truncate text-sm text-black/55">{profile.email}</p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[11px] uppercase tracking-[0.18em] text-black/45">Name</p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    className="w-full rounded-md border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none transition focus:border-black/40"
                    value={profileNameDraft}
                    onChange={(event) => setProfileNameDraft(event.target.value)}
                    placeholder="Your name"
                  />
                  <button
                    className="rounded-md border border-black bg-black px-4 py-3 text-sm font-medium text-white transition hover:bg-black/90 disabled:opacity-60"
                    type="button"
                    onClick={() => void handleProfileSave()}
                    disabled={isSavingProfileName || !profileNameDraft.trim() || profileNameDraft.trim() === profile.name}
                  >
                    {isSavingProfileName ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-start">
              <button
                className="rounded-md border border-black/10 px-4 py-3 text-sm text-black/70 transition hover:border-black/30"
                type="button"
                onClick={() => void handleLogout()}
              >
                Log out
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
