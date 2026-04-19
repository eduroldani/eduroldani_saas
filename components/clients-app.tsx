"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { AppHeader } from "@/components/app-header";
import { LoginScreen } from "@/components/login-screen";
import { SavedBadge } from "@/components/saved-badge";
import {
  createClientInDataStore,
  deleteClientInDataStore,
  loadAppData,
  loadClientsData,
  updateClientInDataStore,
  updateTaskInDataStore,
} from "@/lib/task-data";
import { mockProfile } from "@/lib/mock-data";
import {
  hasSupabaseEnv,
  sendPasswordResetEmail,
  signInWithEmailPassword,
  signOutFromSupabase,
} from "@/lib/supabase";
import { useSupabaseAuth } from "@/hooks/use-supabase-auth";
import type { Client, Profile, Task, TaskStatus } from "@/lib/task-types";

const statuses: TaskStatus[] = ["To do", "In progress", "Done"];
const statusSections: TaskStatus[] = ["In progress", "To do", "Done"];

function statusContainerTone(status: TaskStatus) {
  if (status === "Done") {
    return "border-[#a5d6a8] bg-[#eff9ef]";
  }

  if (status === "In progress") {
    return "border-[#ebd28d] bg-[#fff8e2]";
  }

  return "border-[#e9b8a8] bg-[#fff0eb]";
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

type ClientsView = "clients" | "allClientTasks";

export function ClientsApp() {
  const [profile, setProfile] = useState<Profile>(mockProfile);
  const [clients, setClients] = useState<Client[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newClientName, setNewClientName] = useState("");
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [activeView, setActiveView] = useState<ClientsView>("allClientTasks");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSavedVisible, setIsSavedVisible] = useState(false);
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
        const [clientsData, appData] = await Promise.all([
          loadClientsData(authUser),
          loadAppData(authUser),
        ]);
        if (!isMounted) {
          return;
        }

        setProfile(clientsData.profile);
        setClients(clientsData.clients);
        setTasks(appData.tasks.filter((task) => Boolean(task.clientId)));
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

  const flashSaved = () => {
    setIsSavedVisible(true);
    window.setTimeout(() => setIsSavedVisible(false), 1400);
  };

  const handleCreateClient = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newClientName.trim()) {
      return;
    }

    const created = await createClientInDataStore({ name: newClientName });
    setClients((currentClients) => [created, ...currentClients]);
    setNewClientName("");
    flashSaved();
  };

  const handleUpdateClient = async (clientId: string) => {
    if (!editingName.trim()) {
      return;
    }
    const updated = await updateClientInDataStore({ clientId, name: editingName });
    setClients((currentClients) =>
      currentClients.map((client) => (client.id === clientId ? updated : client)),
    );
    setEditingClientId(null);
    setEditingName("");
    flashSaved();
  };

  const handleDeleteClient = async (clientId: string) => {
    const shouldDelete = window.confirm("Delete this client and all its tasks?");
    if (!shouldDelete) {
      return;
    }
    await deleteClientInDataStore(clientId);
    setClients((currentClients) =>
      currentClients.filter((client) => client.id !== clientId),
    );
    setTasks((currentTasks) =>
      currentTasks.filter((task) => task.clientId !== clientId),
    );
    flashSaved();
  };

  const clientNameById = useMemo(() => {
    return new Map(clients.map((client) => [client.id, client.name]));
  }, [clients]);
  const taskCountByClient = useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of tasks) {
      if (!task.clientId) {
        continue;
      }
      counts.set(task.clientId, (counts.get(task.clientId) ?? 0) + 1);
    }
    return counts;
  }, [tasks]);

  const sortedClientTasks = useMemo(() => {
    const priorityOrder = new Map(
      ["High", "Medium", "Low"].map((value, index) => [value, index]),
    );

    return [...tasks].sort((left, right) => {
      const leftCompleted = left.status === "Done";
      const rightCompleted = right.status === "Done";
      if (leftCompleted !== rightCompleted) {
        return Number(leftCompleted) - Number(rightCompleted);
      }

      const leftPriority = priorityOrder.get(left.priority) ?? 99;
      const rightPriority = priorityOrder.get(right.priority) ?? 99;
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }

      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    });
  }, [tasks]);

  const groupedClientTasks = useMemo(
    () =>
      statusSections
        .map((statusLabel) => ({
          status: statusLabel,
          items: sortedClientTasks.filter((task) => task.status === statusLabel),
        }))
        .filter((group) => group.items.length > 0),
    [sortedClientTasks],
  );

  const updateTask = async (
    taskId: number,
    updates: Partial<Pick<Task, "status">>,
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
            <form className="flex flex-col gap-3 sm:flex-row" onSubmit={handleCreateClient}>
              <input
                className="w-full rounded-md border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none transition focus:border-black/40"
                placeholder="Client name"
                value={newClientName}
                onChange={(event) => setNewClientName(event.target.value)}
              />
              <button
                className="rounded-md border border-black bg-black px-4 py-3 text-sm font-medium text-white transition hover:bg-black/90"
                type="submit"
              >
                Add client
              </button>
            </form>
          </section>

          <section className="rounded-lg border border-black/10 bg-white p-2 shadow-[0_18px_60px_rgba(0,0,0,0.08)]">
            <div className="grid grid-cols-2 gap-2">
              <button
                className={`rounded-md border px-3 py-2 text-xs transition ${
                  activeView === "clients"
                    ? "border-black bg-black text-white"
                    : "border-black/10 text-black/65"
                }`}
                type="button"
                onClick={() => setActiveView("clients")}
              >
                Clients
              </button>
              <button
                className={`rounded-md border px-3 py-2 text-xs transition ${
                  activeView === "allClientTasks"
                    ? "border-black bg-black text-white"
                    : "border-black/10 text-black/65"
                }`}
                type="button"
                onClick={() => setActiveView("allClientTasks")}
              >
                All Client Tasks
              </button>
            </div>
          </section>

          {activeView === "clients" ? (
          <section className="rounded-lg border border-black/10 bg-white shadow-[0_18px_60px_rgba(0,0,0,0.08)]">
            {clients.length === 0 ? (
              <p className="px-4 py-4 text-sm text-black/55">Create your first client.</p>
            ) : (
              <div className="divide-y divide-black/10">
                {clients.map((client) => (
                  <div
                    key={client.id}
                    className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      {editingClientId === client.id ? (
                        <input
                          className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black outline-none transition focus:border-black/40 sm:max-w-sm"
                          value={editingName}
                          onChange={(event) => setEditingName(event.target.value)}
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                          <Link className="text-sm font-medium underline-offset-4 hover:underline" href={`/clients/${client.id}`}>
                            {client.name}
                          </Link>
                          <span className="rounded-md border border-black/10 bg-white px-2 py-1 text-[11px] text-black/60">
                            {taskCountByClient.get(client.id) ?? 0}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {editingClientId === client.id ? (
                        <>
                          <button
                            className="rounded-md border border-black bg-black px-3 py-2 text-xs text-white"
                            type="button"
                            onClick={() => handleUpdateClient(client.id)}
                          >
                            Save
                          </button>
                          <button
                            className="rounded-md border border-black/10 px-3 py-2 text-xs text-black/65"
                            type="button"
                            onClick={() => {
                              setEditingClientId(null);
                              setEditingName("");
                            }}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <Link className="rounded-md border border-black/10 px-3 py-2 text-xs text-black/65" href={`/clients/${client.id}`}>
                            Open
                          </Link>
                          <button
                            className="rounded-md border border-black/10 px-3 py-2 text-xs text-black/65"
                            type="button"
                            onClick={() => {
                              setEditingClientId(client.id);
                              setEditingName(client.name);
                            }}
                          >
                            Edit
                          </button>
                          <button
                            className="rounded-md border border-black/10 px-3 py-2 text-xs text-black/65"
                            type="button"
                            onClick={() => handleDeleteClient(client.id)}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
          ) : (
            <section className="space-y-3">
              {groupedClientTasks.length === 0 ? (
                <section className="rounded-lg border border-black/10 bg-white p-4 shadow-[0_18px_60px_rgba(0,0,0,0.08)]">
                  <p className="text-sm text-black/55">No tasks assigned to clients yet.</p>
                </section>
              ) : (
                groupedClientTasks.map((group) => (
                  <section
                    key={group.status}
                    className="rounded-lg border border-black/10 bg-white p-4 shadow-[0_18px_60px_rgba(0,0,0,0.08)] sm:p-5"
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-black/45">{group.status}</p>
                      <span className="text-xs text-black/45">{group.items.length}</span>
                    </div>

                    <div className="space-y-3">
                      {group.items.map((task) => (
                        <button
                          key={task.id}
                          className={`w-full rounded-md border px-3 py-2 text-left transition hover:border-black/30 ${statusContainerTone(task.status)}`}
                          type="button"
                          onClick={() => setSelectedTask(task)}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-medium">{task.title}</p>
                            <span className="rounded-md border border-black/10 bg-white px-2 py-1 text-[11px] text-black/65">
                              {task.clientId ? (clientNameById.get(task.clientId) ?? "Client") : "Client"}
                            </span>
                          </div>
                        </button>
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
            onClick={() => setSelectedTask(null)}
          />
          <section className="relative z-10 w-full max-w-xl rounded-lg border border-black/10 bg-white p-5 shadow-[0_24px_80px_rgba(0,0,0,0.18)] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-black/45">Task</p>
                <h2 className="mt-2 text-xl font-semibold">{selectedTask.title}</h2>
              </div>
              <button
                className="rounded-md border border-black/10 px-3 py-2 text-xs text-black/65 transition hover:border-black/30"
                type="button"
                onClick={() => setSelectedTask(null)}
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-2 text-sm text-black/60">
              <p>{selectedTask.description || "No description"}</p>
              <p>
                Client: {selectedTask.clientId ? (clientNameById.get(selectedTask.clientId) ?? "Client") : "Client"}
              </p>
            </div>

            <div className="mt-4">
              <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-black/45">Status</p>
              <select
                className={`w-full rounded-md border px-4 py-3 text-sm outline-none transition focus:border-black/35 ${statusTone(selectedTask.status)}`}
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
