"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { AppHeader } from "@/components/app-header";
import { LoginScreen } from "@/components/login-screen";
import { SavedBadge } from "@/components/saved-badge";
import { mockDailyTaskLogs, mockDailyTaskTemplates, mockProfile } from "@/lib/mock-data";
import {
  archiveDailyTaskTemplateInDataStore,
  createDailyTaskTemplateInDataStore,
  loadDailiesData,
  upsertDailyTaskLogInDataStore,
  updateDailyTaskTemplateInDataStore,
} from "@/lib/task-data";
import {
  hasSupabaseEnv,
  sendPasswordResetEmail,
  signInWithEmailPassword,
  signOutFromSupabase,
} from "@/lib/supabase";
import { useSupabaseAuth } from "@/hooks/use-supabase-auth";
import type { DailyTaskLog, DailyTaskTemplate, Profile } from "@/lib/task-types";

function localDateFromTimeZone(timeZone: string, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function formatToday(dateLocal: string) {
  const [year, month, day] = dateLocal.split("-");
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(Number(year), Number(month) - 1, Number(day)));
}

function shiftDateLocal(dateLocal: string, offsetDays: number) {
  const [year, month, day] = dateLocal.split("-").map((value) => Number(value));
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + offsetDays);
  const nextYear = date.getFullYear();
  const nextMonth = `${date.getMonth() + 1}`.padStart(2, "0");
  const nextDay = `${date.getDate()}`.padStart(2, "0");
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

function dateOnlyFromIso(value: string | null) {
  return value ? value.slice(0, 10) : null;
}

export function DailiesApp() {
  const [profile, setProfile] = useState<Profile>(mockProfile);
  const [templates, setTemplates] = useState<DailyTaskTemplate[]>(mockDailyTaskTemplates);
  const [logs, setLogs] = useState<DailyTaskLog[]>(mockDailyTaskLogs);
  const [newTitle, setNewTitle] = useState("");
  const [historyWindowDays, setHistoryWindowDays] = useState<3 | 10>(3);
  const [selectedHistoryDate, setSelectedHistoryDate] = useState<string | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavedVisible, setIsSavedVisible] = useState(false);
  const savedBadgeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { authUser, authState } = useSupabaseAuth();

  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC", []);
  const todayLocal = useMemo(() => localDateFromTimeZone(timeZone), [timeZone]);
  const historyFromDate = useMemo(
    () => shiftDateLocal(todayLocal, -historyWindowDays),
    [historyWindowDays, todayLocal],
  );

  useEffect(() => {
    let isMounted = true;

    async function bootstrap() {
      if (hasSupabaseEnv() && !authUser) {
        setIsLoading(false);
        return;
      }

      try {
        const data = await loadDailiesData({
          user: authUser,
          dateLocal: todayLocal,
          fromDateLocal: historyFromDate,
          toDateLocal: todayLocal,
        });
        if (!isMounted) {
          return;
        }

        setProfile(data.profile);
        setTemplates(data.templates);
        setLogs(data.logs);
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
  }, [authState, authUser, historyFromDate, todayLocal]);

  useEffect(() => {
    return () => {
      if (savedBadgeTimeoutRef.current) {
        clearTimeout(savedBadgeTimeoutRef.current);
      }
    };
  }, []);

  const flashSavedBadge = () => {
    if (savedBadgeTimeoutRef.current) {
      clearTimeout(savedBadgeTimeoutRef.current);
    }

    setIsSavedVisible(true);
    savedBadgeTimeoutRef.current = setTimeout(() => {
      setIsSavedVisible(false);
    }, 1400);
  };

  const logsByTemplateId = useMemo(() => {
    const map = new Map<string, DailyTaskLog>();
    logs.forEach((log) => {
      if (log.dateLocal === todayLocal) {
        map.set(log.templateId, log);
      }
    });
    return map;
  }, [logs, todayLocal]);

  const isTemplateActiveOnDate = (template: DailyTaskTemplate, dateLocal: string) => {
    const createdDate = template.createdAt.slice(0, 10);
    const archivedDate = dateOnlyFromIso(template.archivedAt);
    return createdDate <= dateLocal && (archivedDate === null || archivedDate >= dateLocal);
  };

  const todayTemplates = useMemo(
    () => templates.filter((template) => isTemplateActiveOnDate(template, todayLocal) && template.isActive),
    [templates, todayLocal],
  );

  const orderedDailies = useMemo(() => {
    return [...todayTemplates]
      .map((template) => {
        const log = logsByTemplateId.get(template.id);
        return {
          template,
          completed: log?.completed ?? false,
        };
      })
      .sort((a, b) => {
        if (a.completed === b.completed) {
          return a.template.createdAt.localeCompare(b.template.createdAt);
        }
        return Number(a.completed) - Number(b.completed);
      });
  }, [logsByTemplateId, todayTemplates]);

  const pendingCount = orderedDailies.filter((item) => !item.completed).length;
  const completedCount = orderedDailies.length - pendingCount;

  const handleCreateDaily = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newTitle.trim()) {
      return;
    }

    const created = await createDailyTaskTemplateInDataStore({
      title: newTitle,
      createdById: profile.id,
    });

    setTemplates((current) => [...current, created.template]);
    setNewTitle("");
    flashSavedBadge();
  };

  const handleToggleDaily = async (template: DailyTaskTemplate, completed: boolean) => {
    const previousLog = logsByTemplateId.get(template.id) ?? null;
    const now = new Date().toISOString();
    const optimisticLog: DailyTaskLog = {
      id: previousLog?.id ?? `daily_log_${template.id}_${todayLocal}`.replace(/[^a-zA-Z0-9_-]/g, "_"),
      templateId: template.id,
      dateLocal: todayLocal,
      completed,
      completedAt: completed ? now : null,
      createdAt: previousLog?.createdAt ?? now,
      updatedAt: now,
    };

    setLogs((current) => {
      const withoutTodayLog = current.filter(
        (log) => !(log.templateId === template.id && log.dateLocal === todayLocal),
      );
      return [...withoutTodayLog, optimisticLog];
    });

    try {
      const result = await upsertDailyTaskLogInDataStore({
        templateId: template.id,
        dateLocal: todayLocal,
        completed,
      });

      setLogs((current) => {
        const withoutTodayLog = current.filter(
          (log) => !(log.templateId === template.id && log.dateLocal === todayLocal),
        );
        return [...withoutTodayLog, result.log];
      });
      flashSavedBadge();
    } catch {
      setLogs((current) => {
        const withoutTodayLog = current.filter(
          (log) => !(log.templateId === template.id && log.dateLocal === todayLocal),
        );
        return previousLog ? [...withoutTodayLog, previousLog] : withoutTodayLog;
      });
    }
  };

  const handleEditDaily = async (template: DailyTaskTemplate) => {
    const nextTitle = window.prompt("Edit daily", template.title);
    if (!nextTitle) {
      return;
    }

    const trimmedTitle = nextTitle.trim();
    if (!trimmedTitle || trimmedTitle === template.title) {
      return;
    }

    setTemplates((current) =>
      current.map((entry) =>
        entry.id === template.id ? { ...entry, title: trimmedTitle, updatedAt: new Date().toISOString() } : entry,
      ),
    );

    await updateDailyTaskTemplateInDataStore(template.id, { title: trimmedTitle });
    flashSavedBadge();
  };

  const handleArchiveDaily = async (template: DailyTaskTemplate) => {
    const shouldArchive = window.confirm("Remove this daily from active list?");
    if (!shouldArchive) {
      return;
    }

    const now = new Date().toISOString();
    setTemplates((current) =>
      current.map((entry) =>
        entry.id === template.id
          ? { ...entry, isActive: false, archivedAt: now, updatedAt: now }
          : entry,
      ),
    );
    await archiveDailyTaskTemplateInDataStore(template.id);
    flashSavedBadge();
  };

  const historyDays = useMemo(() => {
    return Array.from({ length: historyWindowDays }, (_, index) => {
      const dateLocal = shiftDateLocal(todayLocal, -(index + 1));
      const activeTemplates = templates.filter((template) => isTemplateActiveOnDate(template, dateLocal));
      const dayLogs = logs.filter((log) => log.dateLocal === dateLocal);
      const completed = activeTemplates.filter((template) =>
        dayLogs.some((log) => log.templateId === template.id && log.completed),
      ).length;
      return {
        dateLocal,
        activeTemplates,
        completed,
        total: activeTemplates.length,
      };
    });
  }, [historyWindowDays, logs, templates, todayLocal]);

  const selectedHistory = useMemo(() => {
    if (!selectedHistoryDate) {
      return null;
    }
    return historyDays.find((day) => day.dateLocal === selectedHistoryDate) ?? null;
  }, [historyDays, selectedHistoryDate]);

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
        <section className="mx-auto flex max-w-5xl flex-col gap-4 sm:gap-5">
          <AppHeader profile={profile} onProfileClick={() => setIsProfileOpen(true)} />

          <section className="rounded-lg border border-black/10 bg-white p-4 shadow-[0_18px_60px_rgba(0,0,0,0.08)] sm:p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-black/45">Daily Checklist</p>
                <p className="mt-1 text-sm text-black/60">
                  {formatToday(todayLocal)} · {timeZone}
                </p>
              </div>
              <p className="text-xs text-black/55">
                Pending: {pendingCount} · Done: {completedCount}
              </p>
            </div>

            <form className="mt-4 flex gap-2" onSubmit={(event) => void handleCreateDaily(event)}>
              <input
                className="h-10 flex-1 rounded-md border border-black/10 bg-white px-3 text-sm outline-none transition focus:border-black/35"
                placeholder="Add a new daily..."
                value={newTitle}
                onChange={(event) => setNewTitle(event.target.value)}
              />
              <button
                className="h-10 rounded-md border border-black bg-black px-3 text-xs font-medium text-white"
                type="submit"
              >
                Add
              </button>
            </form>
          </section>

          <section className="rounded-lg border border-black/10 bg-white p-3 shadow-[0_18px_60px_rgba(0,0,0,0.08)] sm:p-4">
            {orderedDailies.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-black/55">No dailies yet. Add your first one.</p>
            ) : (
              <div className="space-y-2">
                {orderedDailies.map(({ template, completed }) => (
                  <article
                    key={template.id}
                    className={`flex items-center gap-3 rounded-md border px-3 py-2 ${
                      completed ? "border-black/10 bg-[#f7f7f7] text-black/55" : "border-black/15 bg-white"
                    }`}
                  >
                    <label className="flex min-w-0 flex-1 items-center gap-3">
                      <input
                        type="checkbox"
                        checked={completed}
                        onChange={(event) => void handleToggleDaily(template, event.target.checked)}
                        className="h-4 w-4 cursor-pointer rounded border-black/25"
                      />
                      <span className={`truncate text-sm ${completed ? "line-through" : ""}`}>{template.title}</span>
                    </label>
                    <div className="flex items-center gap-1">
                      <button
                        className="rounded-md border border-black/10 px-2 py-1 text-xs text-black/65 transition hover:border-black/30"
                        type="button"
                        onClick={() => void handleEditDaily(template)}
                      >
                        Edit
                      </button>
                      <button
                        className="rounded-md border border-black/10 px-2 py-1 text-xs text-black/65 transition hover:border-black/30"
                        type="button"
                        onClick={() => void handleArchiveDaily(template)}
                      >
                        Remove
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-lg border border-black/10 bg-white p-3 shadow-[0_18px_60px_rgba(0,0,0,0.08)] sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs uppercase tracking-[0.18em] text-black/45">Recent History</p>
              <button
                className="rounded-md border border-black/10 px-2 py-1 text-xs text-black/70"
                type="button"
                onClick={() => setHistoryWindowDays((current) => (current === 3 ? 10 : 3))}
              >
                {historyWindowDays === 3 ? "View 10 days" : "View 3 days"}
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {historyDays.map((day) => {
                const allDone = day.total > 0 && day.completed === day.total;
                return (
                  <button
                    key={day.dateLocal}
                    className={`w-full rounded-md border px-3 py-2 text-left ${
                      selectedHistoryDate === day.dateLocal
                        ? "border-black/30 bg-[#f7f7f7]"
                        : "border-black/10 bg-white"
                    }`}
                    type="button"
                    onClick={() =>
                      setSelectedHistoryDate((current) => (current === day.dateLocal ? null : day.dateLocal))
                    }
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{formatToday(day.dateLocal)}</p>
                      <span
                        className={`rounded-md border px-2 py-1 text-[11px] ${
                          allDone
                            ? "border-[#7bb87e] bg-[#d9f0db] text-[#1f5e2a]"
                            : "border-[#de8d75] bg-[#ffd9cd] text-[#7f2f1d]"
                        }`}
                      >
                        {day.completed}/{day.total}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {selectedHistory ? (
              <div className="mt-3 rounded-md border border-black/10 bg-[#fafafa] p-3">
                <p className="text-xs uppercase tracking-[0.18em] text-black/45">
                  {formatToday(selectedHistory.dateLocal)} Details
                </p>
                <div className="mt-2 space-y-1">
                  {selectedHistory.activeTemplates.length === 0 ? (
                    <p className="text-sm text-black/55">No active dailies on this day.</p>
                  ) : (
                    selectedHistory.activeTemplates.map((template) => {
                      const done = logs.some(
                        (log) =>
                          log.dateLocal === selectedHistory.dateLocal &&
                          log.templateId === template.id &&
                          log.completed,
                      );
                      return (
                        <div
                          key={`${selectedHistory.dateLocal}_${template.id}`}
                          className={`flex items-center justify-between rounded-md border px-2 py-2 ${
                            done ? "border-black/10 bg-white text-black/55" : "border-black/15 bg-white"
                          }`}
                        >
                          <p className={`text-sm ${done ? "line-through" : ""}`}>{template.title}</p>
                          <span className="text-xs">{done ? "Done" : "Pending"}</span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ) : null}
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
