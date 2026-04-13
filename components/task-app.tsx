"use client";

import { FormEvent, useMemo, useState } from "react";

type TaskStatus = "To do" | "In progress" | "Done";
type ViewMode = "Board" | "List";

type Task = {
  id: number;
  title: string;
  detail: string;
  status: TaskStatus;
};

const initialTasks: Task[] = [
  { id: 1, title: "Review priorities", detail: "Pick the top three for today", status: "To do" },
  { id: 2, title: "Client follow-up", detail: "Send the short update email", status: "In progress" },
  { id: 3, title: "Prepare notes", detail: "Keep tomorrow simple", status: "Done" },
];

const statuses: TaskStatus[] = ["To do", "In progress", "Done"];
const viewModes: ViewMode[] = ["Board", "List"];

export function TaskApp() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("Board");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [status, setStatus] = useState<TaskStatus>("To do");
  const [tasks, setTasks] = useState(initialTasks);

  const groupedTasks = useMemo(
    () =>
      statuses.map((currentStatus) => ({
        status: currentStatus,
        items: tasks.filter((task) => task.status === currentStatus),
      })),
    [tasks],
  );

  const handleLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email || !password) {
      return;
    }

    setIsLoggedIn(true);
  };

  const handleCreateTask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) {
      return;
    }

    setTasks((currentTasks) => [
      {
        id: Date.now(),
        title: title.trim(),
        detail: detail.trim(),
        status,
      },
      ...currentTasks,
    ]);
    setTitle("");
    setDetail("");
    setStatus("To do");
  };

  const moveTask = (taskId: number, nextStatus: TaskStatus) => {
    setTasks((currentTasks) =>
      currentTasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              status: nextStatus,
            }
          : task,
      ),
    );
  };

  if (!isLoggedIn) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6 py-10">
        <section className="w-full max-w-sm rounded-lg border border-black/10 bg-white p-6 shadow-[0_18px_60px_rgba(0,0,0,0.08)]">
          <div className="mb-8 space-y-2">
            <p className="text-xs uppercase tracking-[0.24em] text-black/45">Task space</p>
            <h1 className="text-3xl font-semibold">Log in</h1>
          </div>

          <form className="space-y-4" onSubmit={handleLogin}>
            <label className="block space-y-2">
              <span className="text-sm text-black/65">Email</span>
              <input
                className="w-full rounded-md border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none transition focus:border-black/40"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm text-black/65">Password</span>
              <input
                className="w-full rounded-md border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none transition focus:border-black/40"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
              />
            </label>

            <button
              className="w-full rounded-md border border-black bg-black px-4 py-3 text-sm font-medium text-white transition hover:bg-black/90"
              type="submit"
            >
              Continue
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-5 py-5 sm:px-8 sm:py-8">
      <section className="mx-auto flex max-w-6xl flex-col gap-5">
        <header className="flex flex-col gap-4 rounded-lg border border-black/10 bg-white p-5 shadow-[0_18px_60px_rgba(0,0,0,0.08)] sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.24em] text-black/45">Overview</p>
            <h1 className="text-3xl font-semibold">Tasks</h1>
          </div>
          <div className="flex flex-col gap-3 sm:items-end">
            <div className="flex rounded-md border border-black/10 bg-[#fafafa] p-1">
              {viewModes.map((mode) => (
                <button
                  key={mode}
                  className={`rounded-md px-3 py-2 text-xs font-medium transition ${
                    viewMode === mode ? "bg-black text-white" : "text-black/55"
                  }`}
                  type="button"
                  onClick={() => setViewMode(mode)}
                >
                  {mode}
                </button>
              ))}
            </div>
            <p className="text-sm text-black/50">{email}</p>
          </div>
        </header>

        <section className="rounded-lg border border-black/10 bg-white p-5 shadow-[0_18px_60px_rgba(0,0,0,0.08)]">
          <form className="grid gap-3 md:grid-cols-[1.3fr_1fr_0.75fr_auto]" onSubmit={handleCreateTask}>
            <input
              className="min-w-0 rounded-md border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none transition focus:border-black/40"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="New task"
            />
            <input
              className="min-w-0 rounded-md border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none transition focus:border-black/40"
              type="text"
              value={detail}
              onChange={(event) => setDetail(event.target.value)}
              placeholder="Note"
            />
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
            <button
              className="rounded-md border border-black bg-black px-4 py-3 text-sm font-medium text-white transition hover:bg-black/90"
              type="submit"
            >
              Add
            </button>
          </form>
        </section>

        {viewMode === "Board" ? (
          <section className="grid gap-4 lg:grid-cols-3">
            {groupedTasks.map((group) => (
              <div
                key={group.status}
                className="rounded-lg border border-black/10 bg-white p-4 shadow-[0_18px_60px_rgba(0,0,0,0.08)]"
              >
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-black/75">
                    {group.status}
                  </h2>
                  <span className="rounded-md border border-black/10 px-2 py-1 text-xs text-black/45">
                    {group.items.length}
                  </span>
                </div>

                <div className="space-y-3">
                  {group.items.map((task) => (
                    <article
                      key={task.id}
                      className="space-y-4 rounded-md border border-black/10 bg-[#fafafa] p-4 shadow-[0_12px_36px_rgba(0,0,0,0.06)]"
                    >
                      <div className="space-y-1">
                        <h3 className="text-base font-medium">{task.title}</h3>
                        {task.detail ? <p className="text-sm text-black/55">{task.detail}</p> : null}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {statuses.map((option) => (
                          <button
                            key={option}
                            className={`rounded-md border px-3 py-2 text-xs transition ${
                              task.status === option
                                ? "border-black bg-black text-white"
                                : "border-black/10 text-black/60 hover:border-black/35"
                            }`}
                            type="button"
                            onClick={() => moveTask(task.id, option)}
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </section>
        ) : (
          <section className="rounded-lg border border-black/10 bg-white shadow-[0_18px_60px_rgba(0,0,0,0.08)]">
            <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] gap-3 border-b border-black/10 px-4 py-3 text-xs uppercase tracking-[0.18em] text-black/45">
              <span>Task</span>
              <span>Status</span>
              <span>Move</span>
            </div>

            <div className="divide-y divide-black/10">
              {tasks.map((task) => (
                <article
                  key={task.id}
                  className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] md:items-center"
                >
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium">{task.title}</h3>
                    {task.detail ? <p className="mt-1 text-sm text-black/55">{task.detail}</p> : null}
                  </div>

                  <div>
                    <span className="inline-flex rounded-md border border-black/10 bg-[#fafafa] px-3 py-2 text-xs text-black/65">
                      {task.status}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {statuses.map((option) => (
                      <button
                        key={option}
                        className={`rounded-md border px-3 py-2 text-xs transition ${
                          task.status === option
                            ? "border-black bg-black text-white"
                            : "border-black/10 text-black/60 hover:border-black/35"
                        }`}
                        type="button"
                        onClick={() => moveTask(task.id, option)}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </section>
    </main>
  );
}
