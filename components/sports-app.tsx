"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { AppHeader } from "@/components/app-header";
import { LoginScreen } from "@/components/login-screen";
import { SavedBadge } from "@/components/saved-badge";
import { mockProfile } from "@/lib/mock-data";
import {
  addSportsRoutineStepInDataStore,
  archiveSportsItemInDataStore,
  archiveSportsRoutineInDataStore,
  createSportsItemInDataStore,
  createSportsLogInDataStore,
  createSportsRoutineCompletionInDataStore,
  createSportsRoutineInDataStore,
  loadSportsData,
  removeSportsRoutineStepInDataStore,
  reorderSportsRoutineStepsInDataStore,
  updateSportsItemInDataStore,
  updateSportsRoutineInDataStore,
  type MetricKind,
  type SportsItem,
  type SportsLog,
  type SportsRoutine,
  type SportsRoutineCompletion,
  type SportsRoutineStep,
} from "@/lib/sports-data";
import {
  hasSupabaseEnv,
  sendPasswordResetEmail,
  signInWithEmailPassword,
  signOutFromSupabase,
} from "@/lib/supabase";
import { useSupabaseAuth } from "@/hooks/use-supabase-auth";
import type { Profile } from "@/lib/task-types";

type SportsTab = "tracking" | "routines" | "history";

type RoutineDraft = {
  id: string;
  name: string;
  stepChecks: Record<string, boolean>;
};

function createEntityId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function todayLocal() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function formatDate(dateLocal: string) {
  const [year, month, day] = dateLocal.split("-");
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(Number(year), Number(month) - 1, Number(day)));
}

function formatPace(distanceKm: number, durationMin: number) {
  if (distanceKm <= 0 || durationMin <= 0) {
    return "-";
  }
  const paceMin = durationMin / distanceKm;
  const minutes = Math.floor(paceMin);
  const seconds = Math.round((paceMin - minutes) * 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}/km`;
}

function metricLabel(metricKind: MetricKind, customUnit: string | null) {
  if (metricKind === "count") {
    return "Count";
  }
  if (metricKind === "distance_time") {
    return "Distance + Time";
  }
  if (metricKind === "weight_reps") {
    return "Weight + Reps";
  }
  return `Custom${customUnit ? ` (${customUnit})` : ""}`;
}

function describeLog(item: SportsItem, log: SportsLog) {
  if (item.metricKind === "count") {
    return `${log.numericValue ?? 0} reps`;
  }
  if (item.metricKind === "custom") {
    const unit = item.customUnit ?? "units";
    return `${log.numericValue ?? 0} ${unit}`;
  }
  if (item.metricKind === "distance_time") {
    const distance = log.distanceKm ?? 0;
    const duration = log.durationMin ?? 0;
    return `${distance} km in ${duration} min (${formatPace(distance, duration)})`;
  }
  const sets = log.sets ?? 1;
  return `${log.weightKg ?? 0} kg x ${log.reps ?? 0} reps x ${sets} sets`;
}

export function SportsApp() {
  const { authState, authUser } = useSupabaseAuth();
  const [profile, setProfile] = useState<Profile>(mockProfile);
  const [activeTab, setActiveTab] = useState<SportsTab>("tracking");
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSavedVisible, setIsSavedVisible] = useState(false);
  const [storageSource, setStorageSource] = useState<"mock" | "supabase">("mock");
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [todayDate, setTodayDate] = useState("");
  const [items, setItems] = useState<SportsItem[]>([]);
  const [logs, setLogs] = useState<SportsLog[]>([]);
  const [routines, setRoutines] = useState<SportsRoutine[]>([]);
  const [steps, setSteps] = useState<SportsRoutineStep[]>([]);
  const [completions, setCompletions] = useState<SportsRoutineCompletion[]>([]);

  const [newItemSport, setNewItemSport] = useState("");
  const [newItemName, setNewItemName] = useState("");
  const [newItemMetricKind, setNewItemMetricKind] = useState<MetricKind>("count");
  const [newItemCustomUnit, setNewItemCustomUnit] = useState("");
  const [logDraftItemId, setLogDraftItemId] = useState<string | null>(null);
  const [logDraftDate, setLogDraftDate] = useState("");
  const [logDraftNumericValue, setLogDraftNumericValue] = useState("");
  const [logDraftDistanceKm, setLogDraftDistanceKm] = useState("");
  const [logDraftDurationMin, setLogDraftDurationMin] = useState("");
  const [logDraftWeightKg, setLogDraftWeightKg] = useState("");
  const [logDraftReps, setLogDraftReps] = useState("");
  const [logDraftSets, setLogDraftSets] = useState("");

  const [newRoutineName, setNewRoutineName] = useState("");
  const [newRoutineStepInput, setNewRoutineStepInput] = useState("");
  const [newRoutineSteps, setNewRoutineSteps] = useState<string[]>([]);
  const [selectedRoutineId, setSelectedRoutineId] = useState<string | null>(null);
  const [selectedRoutineStepInput, setSelectedRoutineStepInput] = useState("");
  const [isRoutineEditMode, setIsRoutineEditMode] = useState(false);
  const [activeRoutineDraft, setActiveRoutineDraft] = useState<RoutineDraft | null>(null);
  const savedBadgeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const today = todayLocal();
    setTodayDate(today);
    setLogDraftDate(today);
  }, []);

  useEffect(() => {
    if (authState === "loading") {
      return;
    }

    if (hasSupabaseEnv() && authState === "unauthenticated") {
      setIsDataLoading(false);
      return;
    }

    let isMounted = true;

    const load = async () => {
      setIsDataLoading(true);
      try {
        const data = await loadSportsData({ user: authUser });
        if (!isMounted) {
          return;
        }
        setProfile(data.profile);
        setItems(data.items);
        setLogs(data.logs);
        setRoutines(data.routines);
        setSteps(data.steps);
        setCompletions(data.completions);
        setStorageSource(data.source);
      } catch (error) {
        if (!isMounted) {
          return;
        }
        console.error(error);
        alert(error instanceof Error ? error.message : "Could not load sports data.");
      } finally {
        if (isMounted) {
          setIsDataLoading(false);
        }
      }
    };

    void load();

    return () => {
      isMounted = false;
    };
  }, [authState, authUser]);

  const flashSaved = () => {
    if (savedBadgeTimeoutRef.current) {
      clearTimeout(savedBadgeTimeoutRef.current);
    }
    setIsSavedVisible(true);
    savedBadgeTimeoutRef.current = setTimeout(() => setIsSavedVisible(false), 1400);
  };

  const showStorageError = (error: unknown) => {
    console.error(error);
    if (error instanceof Error && error.message) {
      alert(error.message);
      return;
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      typeof (error as { message?: unknown }).message === "string"
    ) {
      alert((error as { message: string }).message);
      return;
    }

    alert("Could not save sports data.");
  };

  const refreshSportsState = async () => {
    if (storageSource !== "supabase") {
      return;
    }

    const data = await loadSportsData({ user: authUser });
    setProfile(data.profile);
    setItems(data.items);
    setLogs(data.logs);
    setRoutines(data.routines);
    setSteps(data.steps);
    setCompletions(data.completions);
  };

  const activeItems = useMemo(() => items.filter((item) => item.isActive), [items]);
  const activeRoutines = useMemo(
    () =>
      routines
        .filter((routine) => routine.isActive)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [routines],
  );
  const selectedRoutine = useMemo(
    () => activeRoutines.find((routine) => routine.id === selectedRoutineId) ?? activeRoutines[0] ?? null,
    [activeRoutines, selectedRoutineId],
  );
  const selectedLogItem = useMemo(
    () => activeItems.find((item) => item.id === logDraftItemId) ?? null,
    [activeItems, logDraftItemId],
  );

  const logsByItem = useMemo(() => {
    const grouped = new Map<string, SportsLog[]>();
    for (const log of logs) {
      const current = grouped.get(log.itemId) ?? [];
      current.push(log);
      grouped.set(log.itemId, current);
    }
    return grouped;
  }, [logs]);

  const trackingRows = useMemo(() => {
    return activeItems
      .map((item) => {
        const itemLogs = [...(logsByItem.get(item.id) ?? [])].sort((a, b) =>
          a.dateLocal === b.dateLocal
            ? new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            : b.dateLocal.localeCompare(a.dateLocal),
        );
        const lastLog = itemLogs[0] ?? null;
        let best = "-";

        if (item.metricKind === "count" || item.metricKind === "custom") {
          const maxValue = Math.max(...itemLogs.map((entry) => entry.numericValue ?? 0), 0);
          best = maxValue > 0 ? `${maxValue} ${item.metricKind === "custom" ? item.customUnit ?? "units" : "reps"}` : "-";
        } else if (item.metricKind === "distance_time") {
          const paces = itemLogs
            .filter((entry) => (entry.distanceKm ?? 0) > 0 && (entry.durationMin ?? 0) > 0)
            .map((entry) => ({
              pace: (entry.durationMin ?? 0) / (entry.distanceKm ?? 1),
              distance: entry.distanceKm ?? 0,
            }));
          if (paces.length > 0) {
            const bestPace = paces.sort((left, right) => left.pace - right.pace)[0];
            best = `${formatPace(bestPace.distance, bestPace.pace * bestPace.distance)} best pace`;
          }
        } else {
          const maxWeight = Math.max(...itemLogs.map((entry) => entry.weightKg ?? 0), 0);
          const maxVolume = Math.max(
            ...itemLogs.map((entry) => (entry.weightKg ?? 0) * (entry.reps ?? 0) * (entry.sets ?? 1)),
            0,
          );
          best =
            maxWeight > 0
              ? `${maxWeight} kg top set · ${maxVolume.toFixed(0)} volume`
              : "-";
        }

        return { item, itemLogs, lastLog, best };
      })
      .sort((a, b) => a.item.sport.localeCompare(b.item.sport) || a.item.name.localeCompare(b.item.name));
  }, [activeItems, logsByItem]);

  const stepsByRoutine = useMemo(() => {
    const grouped = new Map<string, SportsRoutineStep[]>();
    for (const step of steps) {
      const current = grouped.get(step.routineId) ?? [];
      current.push(step);
      grouped.set(step.routineId, current);
    }
    for (const [routineId, routineSteps] of grouped) {
      grouped.set(routineId, [...routineSteps].sort((a, b) => a.orderIndex - b.orderIndex));
    }
    return grouped;
  }, [steps]);

  const selectedRoutineSteps = useMemo(
    () => (selectedRoutine ? stepsByRoutine.get(selectedRoutine.id) ?? [] : []),
    [selectedRoutine, stepsByRoutine],
  );

  const orderedDraftSteps = useMemo(() => {
    if (!activeRoutineDraft) {
      return [];
    }
    const routineSteps = stepsByRoutine.get(activeRoutineDraft.id) ?? [];
    return [...routineSteps].sort((left, right) => {
      const leftDone = activeRoutineDraft.stepChecks[left.id] ?? false;
      const rightDone = activeRoutineDraft.stepChecks[right.id] ?? false;
      if (leftDone !== rightDone) {
        return Number(leftDone) - Number(rightDone);
      }
      return left.orderIndex - right.orderIndex;
    });
  }, [activeRoutineDraft, stepsByRoutine]);

  const historyRows = useMemo(() => {
    const logRows = logs.map((log) => {
      const item = items.find((entry) => entry.id === log.itemId);
      return {
        id: log.id,
        kind: "tracking" as const,
        title: item ? `${item.sport} · ${item.name}` : "Tracking",
        description: item ? describeLog(item, log) : "Entry",
        timestamp: `${log.dateLocal}T00:00:00.000Z`,
        dateLabel: log.dateLocal,
      };
    });

    const completionRows = completions.map((completion) => {
      const routine = routines.find((entry) => entry.id === completion.routineId);
      return {
        id: completion.id,
        kind: "routine" as const,
        title: routine?.name ?? "Routine",
        description: "Routine completed",
        timestamp: completion.completedAt,
        dateLabel: completion.dateLocal,
      };
    });

    return [...logRows, ...completionRows].sort(
      (left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime(),
    );
  }, [completions, items, logs, routines]);

  const resetLogDraftFields = () => {
    setLogDraftNumericValue("");
    setLogDraftDistanceKm("");
    setLogDraftDurationMin("");
    setLogDraftWeightKg("");
    setLogDraftReps("");
    setLogDraftSets("");
  };

  const handleCreateItem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const sport = newItemSport.trim();
    const name = newItemName.trim();
    if (!sport || !name) {
      return;
    }
    if (newItemMetricKind === "custom" && !newItemCustomUnit.trim()) {
      return;
    }

    if (storageSource === "supabase" && authUser) {
      try {
        await createSportsItemInDataStore({
          sport,
          name,
          metricKind: newItemMetricKind,
          customUnit: newItemMetricKind === "custom" ? newItemCustomUnit.trim() : null,
          createdById: authUser.id,
        });
        await refreshSportsState();
      } catch (error) {
        showStorageError(error);
        return;
      }
    } else {
      setItems((current) => [
        ...current,
        {
          id: createEntityId("sports_item"),
          sport,
          name,
          metricKind: newItemMetricKind,
          customUnit: newItemMetricKind === "custom" ? newItemCustomUnit.trim() : null,
          isActive: true,
          archivedAt: null,
        },
      ]);
    }
    setNewItemSport("");
    setNewItemName("");
    setNewItemMetricKind("count");
    setNewItemCustomUnit("");
    flashSaved();
  };

  const handleEditItem = async (item: SportsItem) => {
    const nextName = window.prompt("Edit tracker name", item.name);
    if (!nextName) {
      return;
    }
    const cleaned = nextName.trim();
    if (!cleaned) {
      return;
    }
    if (storageSource === "supabase") {
      try {
        await updateSportsItemInDataStore(item.id, { name: cleaned });
        await refreshSportsState();
      } catch (error) {
        showStorageError(error);
        return;
      }
    } else {
      setItems((current) =>
        current.map((entry) => (entry.id === item.id ? { ...entry, name: cleaned } : entry)),
      );
    }
    flashSaved();
  };

  const handleArchiveItem = async (itemId: string) => {
    const shouldArchive = window.confirm("Archive this tracker?");
    if (!shouldArchive) {
      return;
    }
    if (storageSource === "supabase") {
      try {
        await archiveSportsItemInDataStore(itemId);
        await refreshSportsState();
      } catch (error) {
        showStorageError(error);
        return;
      }
    } else {
      setItems((current) =>
        current.map((item) =>
          item.id === itemId
            ? { ...item, isActive: false, archivedAt: new Date().toISOString() }
            : item,
        ),
      );
    }
    flashSaved();
  };

  const openLogDraft = (itemId: string) => {
    setLogDraftItemId(itemId);
    setLogDraftDate(todayDate || todayLocal());
    resetLogDraftFields();
  };

  const handleLogValue = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedLogItem || !logDraftDate) {
      return;
    }

    let nextLog: SportsLog | null = null;
    if (selectedLogItem.metricKind === "count" || selectedLogItem.metricKind === "custom") {
      const value = Number(logDraftNumericValue);
      if (!Number.isFinite(value) || value <= 0) {
        return;
      }
      nextLog = {
        id: createEntityId("sports_log"),
        itemId: selectedLogItem.id,
        dateLocal: logDraftDate,
        createdAt: new Date().toISOString(),
        numericValue: value,
        distanceKm: null,
        durationMin: null,
        weightKg: null,
        reps: null,
        sets: null,
      };
    } else if (selectedLogItem.metricKind === "distance_time") {
      const distanceKm = Number(logDraftDistanceKm);
      const durationMin = Number(logDraftDurationMin);
      if (!Number.isFinite(distanceKm) || distanceKm <= 0 || !Number.isFinite(durationMin) || durationMin <= 0) {
        return;
      }
      nextLog = {
        id: createEntityId("sports_log"),
        itemId: selectedLogItem.id,
        dateLocal: logDraftDate,
        createdAt: new Date().toISOString(),
        numericValue: null,
        distanceKm,
        durationMin,
        weightKg: null,
        reps: null,
        sets: null,
      };
    } else {
      const weightKg = Number(logDraftWeightKg);
      const reps = Number(logDraftReps);
      const sets = logDraftSets ? Number(logDraftSets) : 1;
      if (
        !Number.isFinite(weightKg) ||
        weightKg <= 0 ||
        !Number.isFinite(reps) ||
        reps <= 0 ||
        !Number.isFinite(sets) ||
        sets <= 0
      ) {
        return;
      }
      nextLog = {
        id: createEntityId("sports_log"),
        itemId: selectedLogItem.id,
        dateLocal: logDraftDate,
        createdAt: new Date().toISOString(),
        numericValue: null,
        distanceKm: null,
        durationMin: null,
        weightKg,
        reps,
        sets,
      };
    }

    if (storageSource === "supabase" && authUser) {
      try {
        await createSportsLogInDataStore({
          itemId: selectedLogItem.id,
          dateLocal: logDraftDate,
          metricKind: selectedLogItem.metricKind,
          numericValue: nextLog.numericValue,
          distanceKm: nextLog.distanceKm,
          durationMin: nextLog.durationMin,
          weightKg: nextLog.weightKg,
          reps: nextLog.reps,
          sets: nextLog.sets,
          createdById: authUser.id,
        });
        await refreshSportsState();
      } catch (error) {
        showStorageError(error);
        return;
      }
    } else {
      setLogs((current) => [...current, nextLog]);
    }
    setLogDraftItemId(null);
    resetLogDraftFields();
    flashSaved();
  };

  const addStepToDraft = () => {
    const cleaned = newRoutineStepInput.trim();
    if (!cleaned) {
      return;
    }
    setNewRoutineSteps((current) => [...current, cleaned]);
    setNewRoutineStepInput("");
  };

  const removeDraftStep = (index: number) => {
    setNewRoutineSteps((current) => current.filter((_, stepIndex) => stepIndex !== index));
  };

  const handleCreateRoutine = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newRoutineName.trim();
    const draftStep = newRoutineStepInput.trim();
    const stepNames = draftStep ? [...newRoutineSteps, draftStep] : newRoutineSteps;
    if (!name || stepNames.length === 0) {
      return;
    }

    let routineId: string;
    if (storageSource === "supabase" && authUser) {
      try {
        const result = await createSportsRoutineInDataStore({
          name,
          stepNames,
          createdById: authUser.id,
        });
        routineId = result.routine.id;
        await refreshSportsState();
      } catch (error) {
        showStorageError(error);
        return;
      }
    } else {
      routineId = createEntityId("sports_routine");
      setRoutines((current) => [
        ...current,
        {
          id: routineId,
          name,
          isActive: true,
          archivedAt: null,
          createdAt: new Date().toISOString(),
        },
      ]);
      setSteps((current) => [
        ...current,
        ...stepNames.map((stepName, index) => ({
          id: createEntityId("sports_step"),
          routineId,
          name: stepName,
          orderIndex: index,
        })),
      ]);
    }
    setSelectedRoutineId(routineId);
    setNewRoutineName("");
    setNewRoutineSteps([]);
    setNewRoutineStepInput("");
    flashSaved();
  };

  const handleEditRoutine = async (routine: SportsRoutine) => {
    const nextName = window.prompt("Edit routine name", routine.name);
    if (!nextName) {
      return;
    }
    const cleaned = nextName.trim();
    if (!cleaned) {
      return;
    }
    if (storageSource === "supabase") {
      try {
        await updateSportsRoutineInDataStore(routine.id, { name: cleaned });
        await refreshSportsState();
      } catch (error) {
        showStorageError(error);
        return;
      }
    } else {
      setRoutines((current) =>
        current.map((entry) => (entry.id === routine.id ? { ...entry, name: cleaned } : entry)),
      );
    }
    flashSaved();
  };

  const handleArchiveRoutine = async (routineId: string) => {
    const shouldArchive = window.confirm("Archive this routine?");
    if (!shouldArchive) {
      return;
    }
    if (storageSource === "supabase") {
      try {
        await archiveSportsRoutineInDataStore(routineId);
        await refreshSportsState();
      } catch (error) {
        showStorageError(error);
        return;
      }
    } else {
      setRoutines((current) =>
        current.map((routine) =>
          routine.id === routineId
            ? { ...routine, isActive: false, archivedAt: new Date().toISOString() }
            : routine,
        ),
      );
    }
    if (activeRoutineDraft?.id === routineId) {
      setActiveRoutineDraft(null);
    }
    if (selectedRoutineId === routineId) {
      setSelectedRoutineId(activeRoutines.find((routine) => routine.id !== routineId)?.id ?? null);
    }
    setIsRoutineEditMode(false);
    flashSaved();
  };

  const startRoutineDraft = (routine: SportsRoutine) => {
    const routineSteps = stepsByRoutine.get(routine.id) ?? [];
    if (routineSteps.length === 0) {
      alert("Add at least one step before starting this routine.");
      return;
    }
    const checks: Record<string, boolean> = {};
    routineSteps.forEach((step) => {
      checks[step.id] = false;
    });
    setSelectedRoutineId(routine.id);
    setActiveRoutineDraft({
      id: routine.id,
      name: routine.name,
      stepChecks: checks,
    });
  };

  const toggleDraftStep = (stepId: string, checked: boolean) => {
    setActiveRoutineDraft((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        stepChecks: {
          ...current.stepChecks,
          [stepId]: checked,
        },
      };
    });
  };

  const completeDraftRoutine = async () => {
    if (!activeRoutineDraft) {
      return;
    }
    const routineSteps = stepsByRoutine.get(activeRoutineDraft.id) ?? [];
    const allDone = routineSteps.length > 0 && routineSteps.every((step) => activeRoutineDraft.stepChecks[step.id]);
    if (!allDone) {
      alert("Mark all routine steps before completing.");
      return;
    }

    if (storageSource === "supabase" && authUser) {
      try {
        await createSportsRoutineCompletionInDataStore({
          routineId: activeRoutineDraft.id,
          dateLocal: todayDate || todayLocal(),
          stepChecks: activeRoutineDraft.stepChecks,
          createdById: authUser.id,
        });
        await refreshSportsState();
      } catch (error) {
        showStorageError(error);
        return;
      }
    } else {
      setCompletions((current) => [
        ...current,
        {
          id: createEntityId("sports_completion"),
          routineId: activeRoutineDraft.id,
          dateLocal: todayDate || todayLocal(),
          completedAt: new Date().toISOString(),
        },
      ]);
    }
    setActiveRoutineDraft(null);
    flashSaved();
  };

  const handleAddStepToSelectedRoutine = async () => {
    if (!selectedRoutine) {
      return;
    }
    const name = selectedRoutineStepInput.trim();
    if (!name) {
      return;
    }
    const nextOrderIndex =
      selectedRoutineSteps.length === 0
        ? 0
        : Math.max(...selectedRoutineSteps.map((step) => step.orderIndex)) + 1;
    const newStep: SportsRoutineStep = {
      id: createEntityId("sports_step"),
      routineId: selectedRoutine.id,
      name,
      orderIndex: nextOrderIndex,
    };
    let addedStepId = newStep.id;
    if (storageSource === "supabase") {
      try {
        const result = await addSportsRoutineStepInDataStore({
          routineId: selectedRoutine.id,
          name,
          orderIndex: nextOrderIndex,
        });
        addedStepId = result.step.id;
        await refreshSportsState();
      } catch (error) {
        showStorageError(error);
        return;
      }
    } else {
      setSteps((current) => [...current, newStep]);
    }
    setSelectedRoutineStepInput("");
    setActiveRoutineDraft((current) => {
      if (!current || current.id !== selectedRoutine.id) {
        return current;
      }
      return {
        ...current,
        stepChecks: { ...current.stepChecks, [addedStepId]: false },
      };
    });
    flashSaved();
  };

  const handleRemoveStepFromSelectedRoutine = async (stepId: string) => {
    if (!selectedRoutine) {
      return;
    }

    if (storageSource === "supabase") {
      try {
        const remainingSteps = selectedRoutineSteps.filter((step) => step.id !== stepId);
        await removeSportsRoutineStepInDataStore({
          routineId: selectedRoutine.id,
          stepId,
          remainingSteps,
        });
        await refreshSportsState();
      } catch (error) {
        showStorageError(error);
        return;
      }
    } else {
      setSteps((current) => {
        const remaining = current.filter((step) => step.id !== stepId);
        const routineSteps = remaining
          .filter((step) => step.routineId === selectedRoutine.id)
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map((step, index) => ({ ...step, orderIndex: index }));
        const byId = new Map(routineSteps.map((step) => [step.id, step]));
        return remaining.map((step) => byId.get(step.id) ?? step);
      });
    }
    setActiveRoutineDraft((current) => {
      if (!current || current.id !== selectedRoutine.id) {
        return current;
      }
      const nextChecks = { ...current.stepChecks };
      delete nextChecks[stepId];
      return {
        ...current,
        stepChecks: nextChecks,
      };
    });
    flashSaved();
  };

  const handleMoveStepInSelectedRoutine = async (stepId: string, direction: "up" | "down") => {
    if (!selectedRoutine) {
      return;
    }

    const routineSteps = selectedRoutineSteps;
    const index = routineSteps.findIndex((step) => step.id === stepId);
    if (index < 0) {
      return;
    }
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= routineSteps.length) {
      return;
    }

    const reordered = [...routineSteps];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);
    const normalized = reordered.map((step, nextIndex) => ({ ...step, orderIndex: nextIndex }));

    if (storageSource === "supabase") {
      try {
        await reorderSportsRoutineStepsInDataStore({
          routineId: selectedRoutine.id,
          steps: normalized,
        });
        await refreshSportsState();
      } catch (error) {
        showStorageError(error);
        return;
      }
    } else {
      const byId = new Map(normalized.map((step) => [step.id, step]));
      setSteps((current) => current.map((step) => byId.get(step.id) ?? step));
    }
    flashSaved();
  };

  const handleLogout = async () => {
    await signOutFromSupabase();
    setIsProfileOpen(false);
  };

  if (authState === "loading" || isDataLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-8 sm:px-6">
        <section className="w-full max-w-sm rounded-lg border border-black/10 bg-white p-6 shadow-[0_18px_60px_rgba(0,0,0,0.08)]">
          <h1 className="text-2xl font-semibold">Loading</h1>
        </section>
      </main>
    );
  }

  if (hasSupabaseEnv() && authState === "unauthenticated") {
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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-[0.18em] text-black/45">Sports</p>
              <nav className="flex items-center rounded-md border border-black/10 bg-[#fafafa] p-1">
                {[
                  { id: "tracking" as const, label: "Tracking" },
                  { id: "routines" as const, label: "Routines" },
                  { id: "history" as const, label: "History" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`rounded-md px-3 py-2 text-xs font-medium transition ${
                      activeTab === tab.id ? "bg-black text-white" : "text-black/60"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
            </div>
          </section>

          {activeTab === "tracking" ? (
            <section className="space-y-4">
              <section className="rounded-lg border border-black/10 bg-white p-4 shadow-[0_18px_60px_rgba(0,0,0,0.08)] sm:p-5">
                <p className="text-xs uppercase tracking-[0.18em] text-black/45">New Tracker</p>
                <form className="mt-3 grid gap-2 sm:grid-cols-2" onSubmit={handleCreateItem}>
                  <input
                    className="h-10 rounded-md border border-black/10 bg-white px-3 text-sm outline-none transition focus:border-black/35"
                    placeholder="Sport (e.g. Climbing)"
                    value={newItemSport}
                    onChange={(event) => setNewItemSport(event.target.value)}
                  />
                  <input
                    className="h-10 rounded-md border border-black/10 bg-white px-3 text-sm outline-none transition focus:border-black/35"
                    placeholder="Tracker name (e.g. V6 routes)"
                    value={newItemName}
                    onChange={(event) => setNewItemName(event.target.value)}
                  />
                  <select
                    className="h-10 rounded-md border border-black/10 bg-white px-3 text-sm outline-none transition focus:border-black/35"
                    value={newItemMetricKind}
                    onChange={(event) => setNewItemMetricKind(event.target.value as MetricKind)}
                  >
                    <option value="count">Count</option>
                    <option value="distance_time">Distance + Time</option>
                    <option value="weight_reps">Weight + Reps</option>
                    <option value="custom">Custom numeric</option>
                  </select>
                  {newItemMetricKind === "custom" ? (
                    <input
                      className="h-10 rounded-md border border-black/10 bg-white px-3 text-sm outline-none transition focus:border-black/35"
                      placeholder="Custom unit (e.g. routes)"
                      value={newItemCustomUnit}
                      onChange={(event) => setNewItemCustomUnit(event.target.value)}
                    />
                  ) : (
                    <div />
                  )}
                  <button
                    className="h-10 rounded-md border border-black bg-black px-4 text-xs font-medium text-white sm:col-span-2"
                    type="submit"
                  >
                    Create tracker
                  </button>
                </form>
              </section>

              <section className="rounded-lg border border-black/10 bg-white p-3 shadow-[0_18px_60px_rgba(0,0,0,0.08)] sm:p-4">
                {trackingRows.length === 0 ? (
                  <p className="py-4 text-sm text-black/55">No trackers yet.</p>
                ) : (
                  <div className="space-y-2">
                    {trackingRows.map(({ item, lastLog, best }) => (
                      <article key={item.id} className="rounded-md border border-black/10 bg-white p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium">
                              {item.sport} · {item.name}
                            </p>
                            <p className="text-xs text-black/50">{metricLabel(item.metricKind, item.customUnit)}</p>
                            <p className="mt-1 text-xs text-black/55">
                              Last: {lastLog ? `${describeLog(item, lastLog)} (${formatDate(lastLog.dateLocal)})` : "No logs"}
                            </p>
                            <p className="text-xs text-black/55">Best: {best}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              className="rounded-md border border-black/10 px-2 py-1 text-xs text-black/70"
                              type="button"
                              onClick={() => openLogDraft(item.id)}
                            >
                              Log
                            </button>
                            <button
                              className="rounded-md border border-black/10 px-2 py-1 text-xs text-black/70"
                              type="button"
                              onClick={() => handleEditItem(item)}
                            >
                              Edit
                            </button>
                            <button
                              className="rounded-md border border-black/10 px-2 py-1 text-xs text-black/70"
                              type="button"
                              onClick={() => handleArchiveItem(item.id)}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              {selectedLogItem ? (
                <section className="rounded-lg border border-black/10 bg-white p-4 shadow-[0_18px_60px_rgba(0,0,0,0.08)] sm:p-5">
                  <p className="text-xs uppercase tracking-[0.18em] text-black/45">
                    Log · {selectedLogItem.sport} / {selectedLogItem.name}
                  </p>
                  <form className="mt-3 grid gap-2 sm:grid-cols-2" onSubmit={handleLogValue}>
                    <input
                      type="date"
                      className="h-10 rounded-md border border-black/10 bg-white px-3 text-sm outline-none transition focus:border-black/35 sm:col-span-2"
                      value={logDraftDate}
                      onChange={(event) => setLogDraftDate(event.target.value)}
                    />

                    {selectedLogItem.metricKind === "count" || selectedLogItem.metricKind === "custom" ? (
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className="h-10 rounded-md border border-black/10 bg-white px-3 text-sm outline-none transition focus:border-black/35 sm:col-span-2"
                        placeholder={
                          selectedLogItem.metricKind === "custom"
                            ? `Value (${selectedLogItem.customUnit ?? "units"})`
                            : "Count"
                        }
                        value={logDraftNumericValue}
                        onChange={(event) => setLogDraftNumericValue(event.target.value)}
                      />
                    ) : null}

                    {selectedLogItem.metricKind === "distance_time" ? (
                      <>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="h-10 rounded-md border border-black/10 bg-white px-3 text-sm outline-none transition focus:border-black/35"
                          placeholder="Distance (km)"
                          value={logDraftDistanceKm}
                          onChange={(event) => setLogDraftDistanceKm(event.target.value)}
                        />
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="h-10 rounded-md border border-black/10 bg-white px-3 text-sm outline-none transition focus:border-black/35"
                          placeholder="Duration (min)"
                          value={logDraftDurationMin}
                          onChange={(event) => setLogDraftDurationMin(event.target.value)}
                        />
                      </>
                    ) : null}

                    {selectedLogItem.metricKind === "weight_reps" ? (
                      <>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="h-10 rounded-md border border-black/10 bg-white px-3 text-sm outline-none transition focus:border-black/35"
                          placeholder="Weight (kg)"
                          value={logDraftWeightKg}
                          onChange={(event) => setLogDraftWeightKg(event.target.value)}
                        />
                        <input
                          type="number"
                          step="1"
                          min="1"
                          className="h-10 rounded-md border border-black/10 bg-white px-3 text-sm outline-none transition focus:border-black/35"
                          placeholder="Reps"
                          value={logDraftReps}
                          onChange={(event) => setLogDraftReps(event.target.value)}
                        />
                        <input
                          type="number"
                          step="1"
                          min="1"
                          className="h-10 rounded-md border border-black/10 bg-white px-3 text-sm outline-none transition focus:border-black/35 sm:col-span-2"
                          placeholder="Sets (optional, default 1)"
                          value={logDraftSets}
                          onChange={(event) => setLogDraftSets(event.target.value)}
                        />
                      </>
                    ) : null}

                    <button className="h-10 rounded-md border border-black bg-black px-4 text-xs font-medium text-white" type="submit">
                      Save log
                    </button>
                    <button
                      className="h-10 rounded-md border border-black/10 px-4 text-xs font-medium text-black/70"
                      type="button"
                      onClick={() => setLogDraftItemId(null)}
                    >
                      Cancel
                    </button>
                  </form>
                </section>
              ) : null}
            </section>
          ) : null}

          {activeTab === "routines" ? (
            <section className="space-y-4">
              <section className="rounded-lg border border-black/10 bg-white p-4 shadow-[0_18px_60px_rgba(0,0,0,0.08)] sm:p-5">
                <p className="text-xs uppercase tracking-[0.18em] text-black/45">New Routine</p>
                <form className="mt-3 space-y-2" onSubmit={handleCreateRoutine}>
                  <input
                    className="h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm outline-none transition focus:border-black/35"
                    placeholder="Routine name"
                    value={newRoutineName}
                    onChange={(event) => setNewRoutineName(event.target.value)}
                  />
                  <div className="flex gap-2">
                    <input
                      className="h-10 flex-1 rounded-md border border-black/10 bg-white px-3 text-sm outline-none transition focus:border-black/35"
                      placeholder="Add routine step"
                      value={newRoutineStepInput}
                      onChange={(event) => setNewRoutineStepInput(event.target.value)}
                    />
                    <button
                      className="h-10 rounded-md border border-black/10 px-3 text-xs font-medium text-black/70"
                      type="button"
                      onClick={addStepToDraft}
                    >
                      Add step
                    </button>
                  </div>
                  {newRoutineSteps.length > 0 ? (
                    <div className="space-y-1 rounded-md border border-black/10 bg-[#fafafa] p-2">
                      {newRoutineSteps.map((step, index) => (
                        <div key={`${step}-${index}`} className="flex items-center justify-between gap-2">
                          <p className="text-xs text-black/75">{step}</p>
                          <button
                            className="rounded-md border border-black/10 px-2 py-1 text-[11px] text-black/65"
                            type="button"
                            onClick={() => removeDraftStep(index)}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <button className="h-10 rounded-md border border-black bg-black px-4 text-xs font-medium text-white" type="submit">
                    Create routine
                  </button>
                </form>
              </section>

              <section className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
                <div className="space-y-2 rounded-lg border border-black/10 bg-white p-3 shadow-[0_18px_60px_rgba(0,0,0,0.08)] sm:p-4">
                  {activeRoutines.length === 0 ? (
                    <p className="py-4 text-sm text-black/55">No routines yet.</p>
                  ) : (
                    activeRoutines.map((routine) => {
                      const isSelected = selectedRoutine?.id === routine.id;
                      return (
                        <article
                          key={routine.id}
                          className={`rounded-md border p-3 ${
                            isSelected ? "border-black/30 bg-[#f7f7f7]" : "border-black/10 bg-white"
                          }`}
                        >
                          <button className="w-full text-left" type="button" onClick={() => setSelectedRoutineId(routine.id)}>
                            <p className="text-sm font-medium">{routine.name}</p>
                            <p className="mt-1 text-xs text-black/50">
                              {(stepsByRoutine.get(routine.id) ?? []).length} steps
                            </p>
                          </button>
                          <div className="mt-2 flex items-center gap-1">
                            <button
                              className="rounded-md border border-black/10 px-2 py-1 text-xs text-black/70"
                              type="button"
                              onClick={() => startRoutineDraft(routine)}
                            >
                              Start
                            </button>
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>

                <div className="rounded-lg border border-black/10 bg-white p-4 shadow-[0_18px_60px_rgba(0,0,0,0.08)] sm:p-5">
                  {selectedRoutine ? (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-black/45">Routine</p>
                          <h3 className="mt-1 text-lg font-medium">{selectedRoutine.name}</h3>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            className={`h-9 rounded-md border px-3 text-xs font-medium ${
                              isRoutineEditMode ? "border-black bg-black text-white" : "border-black/10 text-black/70"
                            }`}
                            type="button"
                            onClick={() => setIsRoutineEditMode((current) => !current)}
                          >
                            {isRoutineEditMode ? "Done editing" : "Edit routine"}
                          </button>
                          <button
                            className="h-9 rounded-md border border-black bg-black px-3 text-xs font-medium text-white"
                            type="button"
                            onClick={() => startRoutineDraft(selectedRoutine)}
                          >
                            Start routine
                          </button>
                        </div>
                      </div>

                      {isRoutineEditMode ? (
                        <div className="rounded-md border border-black/10 bg-[#fafafa] p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs uppercase tracking-[0.16em] text-black/45">Manage Steps</p>
                            <div className="flex items-center gap-1">
                              <button
                                className="rounded-md border border-black/10 px-2 py-1 text-xs text-black/70"
                                type="button"
                                onClick={() => handleEditRoutine(selectedRoutine)}
                              >
                                Rename
                              </button>
                              <button
                                className="rounded-md border border-black/10 px-2 py-1 text-xs text-black/70"
                                type="button"
                                onClick={() => handleArchiveRoutine(selectedRoutine.id)}
                              >
                                Remove routine
                              </button>
                            </div>
                          </div>
                          <div className="mt-2 flex gap-2">
                            <input
                              className="h-10 flex-1 rounded-md border border-black/10 bg-white px-3 text-sm outline-none transition focus:border-black/35"
                              placeholder="Add step to this routine"
                              value={selectedRoutineStepInput}
                              onChange={(event) => setSelectedRoutineStepInput(event.target.value)}
                            />
                            <button
                              className="h-10 rounded-md border border-black/10 px-3 text-xs font-medium text-black/70"
                              type="button"
                              onClick={handleAddStepToSelectedRoutine}
                            >
                              Add step
                            </button>
                          </div>
                          <div className="mt-2 space-y-1">
                            {selectedRoutineSteps.length === 0 ? (
                              <p className="text-xs text-black/50">No steps yet.</p>
                            ) : (
                              selectedRoutineSteps.map((step, index) => (
                                <div
                                  key={step.id}
                                  className="flex items-center justify-between gap-2 rounded-md border border-black/10 bg-white px-2 py-2"
                                >
                                  <p className="text-sm text-black/75">{step.name}</p>
                                  <div className="flex items-center gap-1">
                                    <button
                                      className="rounded-md border border-black/10 px-2 py-1 text-[11px] text-black/65 disabled:opacity-35"
                                      type="button"
                                      onClick={() => handleMoveStepInSelectedRoutine(step.id, "up")}
                                      disabled={index === 0}
                                    >
                                      Up
                                    </button>
                                    <button
                                      className="rounded-md border border-black/10 px-2 py-1 text-[11px] text-black/65 disabled:opacity-35"
                                      type="button"
                                      onClick={() => handleMoveStepInSelectedRoutine(step.id, "down")}
                                      disabled={index === selectedRoutineSteps.length - 1}
                                    >
                                      Down
                                    </button>
                                    <button
                                      className="rounded-md border border-black/10 px-2 py-1 text-[11px] text-black/65"
                                      type="button"
                                      onClick={() => handleRemoveStepFromSelectedRoutine(step.id)}
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      ) : null}

                      {activeRoutineDraft && activeRoutineDraft.id === selectedRoutine.id ? (
                        <div className="space-y-3">
                          <p className="text-xs uppercase tracking-[0.18em] text-black/45">Routine in Progress</p>
                          {orderedDraftSteps.map((step) => {
                            const done = activeRoutineDraft.stepChecks[step.id] ?? false;
                            return (
                              <label
                                key={step.id}
                                className={`flex items-center gap-3 rounded-md border px-3 py-2 ${
                                  done ? "border-black/10 bg-[#f7f7f7] text-black/55" : "border-black/15 bg-white"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={done}
                                  onChange={(event) => toggleDraftStep(step.id, event.target.checked)}
                                  className="h-4 w-4 rounded border-black/20"
                                />
                                <span className={`text-sm ${done ? "line-through" : ""}`}>{step.name}</span>
                              </label>
                            );
                          })}
                          <div className="flex gap-2">
                            <button
                              className="h-10 rounded-md border border-black bg-black px-4 text-xs font-medium text-white"
                              type="button"
                              onClick={completeDraftRoutine}
                            >
                              Complete routine
                            </button>
                            <button
                              className="h-10 rounded-md border border-black/10 px-4 text-xs font-medium text-black/70"
                              type="button"
                              onClick={() => setActiveRoutineDraft(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-black/55">Press Start routine to reset all checks and begin.</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-black/55">Create a routine to begin.</p>
                  )}
                </div>
              </section>
            </section>
          ) : null}

          {activeTab === "history" ? (
            <section className="rounded-lg border border-black/10 bg-white p-3 shadow-[0_18px_60px_rgba(0,0,0,0.08)] sm:p-4">
              {historyRows.length === 0 ? (
                <p className="py-4 text-sm text-black/55">No history yet.</p>
              ) : (
                <div className="space-y-2">
                  {historyRows.map((entry) => (
                    <article key={entry.id} className="rounded-md border border-black/10 bg-white p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">{entry.title}</p>
                        <span className="rounded-md border border-black/10 px-2 py-1 text-[11px] text-black/60">
                          {entry.kind === "tracking" ? "Tracking" : "Routine"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-black/60">{entry.description}</p>
                      <p className="mt-1 text-xs text-black/45">{formatDate(entry.dateLabel)}</p>
                    </article>
                  ))}
                </div>
              )}
            </section>
          ) : null}
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
