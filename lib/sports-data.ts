import type { User } from "@supabase/supabase-js";

import { mockProfile } from "@/lib/mock-data";
import { getSupabaseBrowserClient, hasSupabaseEnv } from "@/lib/supabase";
import type { Profile } from "@/lib/task-types";

export type MetricKind = "count" | "distance_time" | "weight_reps" | "custom";

export type SportsItem = {
  id: string;
  sport: string;
  name: string;
  metricKind: MetricKind;
  customUnit: string | null;
  isActive: boolean;
  archivedAt: string | null;
};

export type SportsLog = {
  id: string;
  itemId: string;
  dateLocal: string;
  createdAt: string;
  numericValue: number | null;
  distanceKm: number | null;
  durationMin: number | null;
  weightKg: number | null;
  reps: number | null;
  sets: number | null;
};

export type SportsRoutine = {
  id: string;
  name: string;
  isActive: boolean;
  archivedAt: string | null;
  createdAt: string;
};

export type SportsRoutineStep = {
  id: string;
  routineId: string;
  name: string;
  orderIndex: number;
};

export type SportsRoutineCompletion = {
  id: string;
  routineId: string;
  dateLocal: string;
  completedAt: string;
};

type SportsItemRow = {
  id: string;
  sport: string | null;
  name: string;
  metric_type: string;
  metric_kind: string | null;
  custom_unit: string | null;
  is_active: boolean;
  archived_at: string | null;
  created_at: string;
};

type SportsLogRow = {
  id: string;
  item_id: string;
  value_numeric: number;
  date_local: string;
  created_at: string;
  distance_km: number | null;
  duration_min: number | null;
  weight_kg: number | null;
  reps: number | null;
  sets: number | null;
};

type LegacySportsItemRow = {
  id: string;
  name: string;
  metric_type: string;
  is_active: boolean;
  archived_at: string | null;
  created_at: string;
};

type LegacySportsLogRow = {
  id: string;
  item_id: string;
  value_numeric: number;
  date_local: string;
  created_at: string;
};

type SportsRoutineRow = {
  id: string;
  name: string;
  is_active: boolean;
  archived_at: string | null;
  created_at: string;
};

type SportsRoutineStepRow = {
  id: string;
  routine_id: string;
  name: string;
  order_index: number;
};

type SportsRoutineCompletionRow = {
  id: string;
  routine_id: string;
  date_local: string;
  completed_at: string;
};

type ProfileRow = {
  id: string;
  name: string;
  email: string;
  avatar_label: string;
};

export type SportsData = {
  profile: Profile;
  items: SportsItem[];
  logs: SportsLog[];
  routines: SportsRoutine[];
  steps: SportsRoutineStep[];
  completions: SportsRoutineCompletion[];
  source: "supabase" | "mock";
};

function buildAvatarLabel(name: string, email: string | null | undefined) {
  const source = name.trim() || email?.trim() || "User";
  const parts = source.split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "U";
}

function buildProfileName(user: User) {
  const metadataName =
    typeof user.user_metadata?.name === "string"
      ? user.user_metadata.name
      : typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name
        : null;

  if (metadataName?.trim()) {
    return metadataName.trim();
  }

  if (user.email) {
    return user.email.split("@")[0] ?? "User";
  }

  return "User";
}

function fallbackProfileFromUser(user: User): Profile {
  const name = buildProfileName(user);
  const email = user.email ?? "";
  return {
    id: user.id,
    name,
    email,
    avatarLabel: buildAvatarLabel(name, email),
  };
}

function mapProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatarLabel: row.avatar_label,
  };
}

async function ensureProfileForUser(user: User, supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>) {
  const fallbackProfile = fallbackProfileFromUser(user);

  const { data: existingProfile, error: existingProfileError } = await supabase
    .from("profiles")
    .select("id,name,email,avatar_label")
    .eq("id", user.id)
    .maybeSingle();

  if (existingProfileError?.code === "42501") {
    return fallbackProfile;
  }

  if (existingProfile) {
    return mapProfile(existingProfile as ProfileRow);
  }

  if (fallbackProfile.email) {
    const { data: existingProfileByEmail, error: existingByEmailError } = await supabase
      .from("profiles")
      .select("id,name,email,avatar_label")
      .eq("email", fallbackProfile.email)
      .maybeSingle();

    if (existingByEmailError?.code === "42501") {
      return fallbackProfile;
    }

    if (existingProfileByEmail) {
      return mapProfile(existingProfileByEmail as ProfileRow);
    }
  }

  const { data: createdProfile, error } = await supabase
    .from("profiles")
    .insert({
      id: user.id,
      name: fallbackProfile.name,
      email: fallbackProfile.email,
      avatar_label: fallbackProfile.avatarLabel,
    })
    .select("id,name,email,avatar_label")
    .single();

  if (error?.code === "42501") {
    return fallbackProfile;
  }

  if (error?.code === "23505" && fallbackProfile.email) {
    const { data: conflictProfile } = await supabase
      .from("profiles")
      .select("id,name,email,avatar_label")
      .eq("email", fallbackProfile.email)
      .maybeSingle();

    if (conflictProfile) {
      return mapProfile(conflictProfile as ProfileRow);
    }
  }

  if (error || !createdProfile) {
    return fallbackProfile;
  }

  return mapProfile(createdProfile as ProfileRow);
}

function createEntityId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function legacyMetricType(metricKind: MetricKind) {
  return metricKind === "distance_time" ? "km" : "kg";
}

function mapMetricKind(row: SportsItemRow): MetricKind {
  if (row.metric_kind === "count" || row.metric_kind === "distance_time" || row.metric_kind === "weight_reps" || row.metric_kind === "custom") {
    return row.metric_kind;
  }

  return row.metric_type === "km" ? "distance_time" : "weight_reps";
}

function toNumberOrNull(value: number | string | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapSportsItem(row: SportsItemRow): SportsItem {
  return {
    id: row.id,
    sport: row.sport ?? "General",
    name: row.name,
    metricKind: mapMetricKind(row),
    customUnit: row.custom_unit,
    isActive: row.is_active,
    archivedAt: row.archived_at,
  };
}

function mapLegacySportsItem(row: LegacySportsItemRow): SportsItem {
  return {
    id: row.id,
    sport: "General",
    name: row.name,
    metricKind: row.metric_type === "km" ? "distance_time" : "weight_reps",
    customUnit: null,
    isActive: row.is_active,
    archivedAt: row.archived_at,
  };
}

function mapSportsLog(row: SportsLogRow, itemById: Map<string, SportsItem>): SportsLog {
  const item = itemById.get(row.item_id);
  const metricKind = item?.metricKind ?? "count";
  const numericValue =
    metricKind === "count" || metricKind === "custom" ? toNumberOrNull(row.value_numeric) : null;

  return {
    id: row.id,
    itemId: row.item_id,
    dateLocal: row.date_local,
    createdAt: row.created_at,
    numericValue,
    distanceKm: toNumberOrNull(row.distance_km),
    durationMin: toNumberOrNull(row.duration_min),
    weightKg: toNumberOrNull(row.weight_kg),
    reps: toNumberOrNull(row.reps),
    sets: toNumberOrNull(row.sets),
  };
}

function mapLegacySportsLog(row: LegacySportsLogRow, itemById: Map<string, SportsItem>): SportsLog {
  const item = itemById.get(row.item_id);
  const metricKind = item?.metricKind ?? "weight_reps";

  return {
    id: row.id,
    itemId: row.item_id,
    dateLocal: row.date_local,
    createdAt: row.created_at,
    numericValue: metricKind === "count" || metricKind === "custom" ? toNumberOrNull(row.value_numeric) : null,
    distanceKm: metricKind === "distance_time" ? toNumberOrNull(row.value_numeric) : null,
    durationMin: null,
    weightKg: metricKind === "weight_reps" ? toNumberOrNull(row.value_numeric) : null,
    reps: null,
    sets: null,
  };
}

function isMissingColumnError(error: { code?: string; message?: string } | null) {
  return error?.code === "42703" || error?.message?.toLowerCase().includes("does not exist") === true;
}

function mapSportsRoutine(row: SportsRoutineRow): SportsRoutine {
  return {
    id: row.id,
    name: row.name,
    isActive: row.is_active,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
  };
}

function mapSportsRoutineStep(row: SportsRoutineStepRow): SportsRoutineStep {
  return {
    id: row.id,
    routineId: row.routine_id,
    name: row.name,
    orderIndex: row.order_index,
  };
}

function mapSportsRoutineCompletion(row: SportsRoutineCompletionRow): SportsRoutineCompletion {
  return {
    id: row.id,
    routineId: row.routine_id,
    dateLocal: row.date_local,
    completedAt: row.completed_at,
  };
}

function buildLogInsert(input: {
  itemId: string;
  dateLocal: string;
  metricKind: MetricKind;
  numericValue?: number | null;
  distanceKm?: number | null;
  durationMin?: number | null;
  weightKg?: number | null;
  reps?: number | null;
  sets?: number | null;
  createdById: string;
}) {
  const id = createEntityId("sports_log");
  const now = new Date().toISOString();

  let valueNumeric = 1;
  if (input.metricKind === "count" || input.metricKind === "custom") {
    valueNumeric = input.numericValue ?? 1;
  } else if (input.metricKind === "distance_time") {
    valueNumeric = input.distanceKm ?? 1;
  } else {
    valueNumeric = input.weightKg ?? 1;
  }

  return {
    id,
    item_id: input.itemId,
    value_numeric: valueNumeric,
    date_local: input.dateLocal,
    created_at: now,
    created_by_id: input.createdById,
    distance_km: input.distanceKm ?? null,
    duration_min: input.durationMin ?? null,
    weight_kg: input.weightKg ?? null,
    reps: input.reps ?? null,
    sets: input.sets ?? null,
  };
}

export async function loadSportsData(input: { user?: User | null }): Promise<SportsData> {
  if (!hasSupabaseEnv()) {
    return {
      profile: mockProfile,
      items: [],
      logs: [],
      routines: [],
      steps: [],
      completions: [],
      source: "mock",
    };
  }

  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return {
      profile: mockProfile,
      items: [],
      logs: [],
      routines: [],
      steps: [],
      completions: [],
      source: "mock",
    };
  }

  if (!input.user) {
    throw new Error("No authenticated user");
  }

  const profile = await ensureProfileForUser(input.user, supabase);

  const [itemsResult, routinesResult, completionsResult] = await Promise.all([
    supabase
      .from("sports_items")
      .select("id,sport,name,metric_type,metric_kind,custom_unit,is_active,archived_at,created_at")
      .eq("created_by_id", input.user.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("sports_routines")
      .select("id,name,is_active,archived_at,created_at")
      .eq("created_by_id", input.user.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("sports_routine_completions")
      .select("id,routine_id,date_local,completed_at")
      .eq("created_by_id", input.user.id)
      .order("completed_at", { ascending: false }),
  ]);

  let items: SportsItem[] = [];
  if (itemsResult.error) {
    if (!isMissingColumnError(itemsResult.error)) {
      throw itemsResult.error;
    }

    const legacyItemsResult = await supabase
      .from("sports_items")
      .select("id,name,metric_type,is_active,archived_at,created_at")
      .eq("created_by_id", input.user.id)
      .order("created_at", { ascending: true });

    if (legacyItemsResult.error) {
      throw legacyItemsResult.error;
    }

    items = (legacyItemsResult.data as LegacySportsItemRow[]).map(mapLegacySportsItem);
  } else {
    items = (itemsResult.data as SportsItemRow[]).map(mapSportsItem);
  }

  if (routinesResult.error || completionsResult.error) {
    throw routinesResult.error ?? completionsResult.error ?? new Error("Could not load sports data");
  }

  const itemIds = items.map((item) => item.id);
  const itemById = new Map(items.map((item) => [item.id, item]));
  const routines = (routinesResult.data as SportsRoutineRow[]).map(mapSportsRoutine);
  const routineIds = routines.map((routine) => routine.id);

  const [logsResult, stepsResult] = await Promise.all([
    itemIds.length > 0
      ? supabase
          .from("sports_logs")
          .select("id,item_id,value_numeric,date_local,created_at,distance_km,duration_min,weight_kg,reps,sets")
          .in("item_id", itemIds)
          .order("date_local", { ascending: false })
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    routineIds.length > 0
      ? supabase
          .from("sports_routine_steps")
          .select("id,routine_id,name,order_index")
          .in("routine_id", routineIds)
          .order("order_index", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);

  let logs: SportsLog[] = [];
  if (logsResult.error) {
    if (!isMissingColumnError(logsResult.error)) {
      throw logsResult.error;
    }

    const legacyLogsResult = itemIds.length
      ? await supabase
          .from("sports_logs")
          .select("id,item_id,value_numeric,date_local,created_at")
          .in("item_id", itemIds)
          .order("date_local", { ascending: false })
          .order("created_at", { ascending: false })
      : { data: [], error: null };

    if (legacyLogsResult.error) {
      throw legacyLogsResult.error;
    }

    logs = (legacyLogsResult.data as LegacySportsLogRow[]).map((row) => mapLegacySportsLog(row, itemById));
  } else {
    logs = (logsResult.data as SportsLogRow[]).map((row) => mapSportsLog(row, itemById));
  }

  if (stepsResult.error) {
    throw stepsResult.error;
  }

  return {
    profile,
    items,
    logs,
    routines,
    steps: (stepsResult.data as SportsRoutineStepRow[]).map(mapSportsRoutineStep),
    completions: (completionsResult.data as SportsRoutineCompletionRow[]).map(mapSportsRoutineCompletion),
    source: "supabase",
  };
}

export async function createSportsItemInDataStore(input: {
  sport: string;
  name: string;
  metricKind: MetricKind;
  customUnit: string | null;
  createdById: string;
}) {
  const itemId = createEntityId("sports_item");
  const supabase = getSupabaseBrowserClient();

  if (!supabase || !hasSupabaseEnv()) {
    return {
      item: {
        id: itemId,
        sport: input.sport,
        name: input.name,
        metricKind: input.metricKind,
        customUnit: input.customUnit,
        isActive: true,
        archivedAt: null,
      } satisfies SportsItem,
      source: "mock" as const,
    };
  }

  const { data, error } = await supabase
    .from("sports_items")
    .insert({
      id: itemId,
      sport: input.sport,
      name: input.name,
      metric_type: legacyMetricType(input.metricKind),
      metric_kind: input.metricKind,
      custom_unit: input.customUnit,
      is_active: true,
      created_by_id: input.createdById,
    })
    .select("id,sport,name,metric_type,metric_kind,custom_unit,is_active,archived_at,created_at")
    .single();

  if (error) {
    if (!isMissingColumnError(error)) {
      throw error;
    }

    const legacyInsert = await supabase
      .from("sports_items")
      .insert({
        id: itemId,
        name: input.name,
        metric_type: legacyMetricType(input.metricKind),
        is_active: true,
        created_by_id: input.createdById,
      })
      .select("id,name,metric_type,is_active,archived_at,created_at")
      .single();

    if (legacyInsert.error || !legacyInsert.data) {
      throw legacyInsert.error ?? new Error("Could not create sports item");
    }

    return {
      item: {
        ...mapLegacySportsItem(legacyInsert.data as LegacySportsItemRow),
        sport: input.sport,
        metricKind: input.metricKind,
        customUnit: input.customUnit,
      },
      source: "supabase" as const,
    };
  }

  if (!data) {
    throw new Error("Could not create sports item");
  }

  return {
    item: mapSportsItem(data as SportsItemRow),
    source: "supabase" as const,
  };
}

export async function updateSportsItemInDataStore(itemId: string, updates: { name: string }) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase || !hasSupabaseEnv()) {
    return { source: "mock" as const };
  }

  const { error } = await supabase
    .from("sports_items")
    .update({
      name: updates.name,
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId);

  if (error) {
    throw error;
  }

  return { source: "supabase" as const };
}

export async function archiveSportsItemInDataStore(itemId: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase || !hasSupabaseEnv()) {
    return { source: "mock" as const };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("sports_items")
    .update({
      is_active: false,
      archived_at: now,
      updated_at: now,
    })
    .eq("id", itemId);

  if (error) {
    throw error;
  }

  return { source: "supabase" as const };
}

export async function createSportsLogInDataStore(input: {
  itemId: string;
  dateLocal: string;
  metricKind: MetricKind;
  numericValue?: number | null;
  distanceKm?: number | null;
  durationMin?: number | null;
  weightKg?: number | null;
  reps?: number | null;
  sets?: number | null;
  createdById: string;
}) {
  const supabase = getSupabaseBrowserClient();
  const insertPayload = buildLogInsert(input);

  if (!supabase || !hasSupabaseEnv()) {
    return {
      log: {
        id: insertPayload.id,
        itemId: input.itemId,
        dateLocal: input.dateLocal,
        createdAt: insertPayload.created_at,
        numericValue: input.numericValue ?? null,
        distanceKm: input.distanceKm ?? null,
        durationMin: input.durationMin ?? null,
        weightKg: input.weightKg ?? null,
        reps: input.reps ?? null,
        sets: input.sets ?? null,
      } satisfies SportsLog,
      source: "mock" as const,
    };
  }

  const { data, error } = await supabase
    .from("sports_logs")
    .insert(insertPayload)
    .select("id,item_id,value_numeric,date_local,created_at,distance_km,duration_min,weight_kg,reps,sets")
    .single();

  if (error) {
    if (!isMissingColumnError(error)) {
      throw error;
    }

    const legacyPayload = {
      id: insertPayload.id,
      item_id: input.itemId,
      value_numeric: insertPayload.value_numeric,
      date_local: input.dateLocal,
      created_at: insertPayload.created_at,
      created_by_id: input.createdById,
    };

    const legacyInsert = await supabase
      .from("sports_logs")
      .insert(legacyPayload)
      .select("id,item_id,value_numeric,date_local,created_at")
      .single();

    if (legacyInsert.error || !legacyInsert.data) {
      throw legacyInsert.error ?? new Error("Could not create sports log");
    }

    const itemMap = new Map<string, SportsItem>([
      [
        input.itemId,
        {
          id: input.itemId,
          sport: "",
          name: "",
          metricKind: input.metricKind,
          customUnit: null,
          isActive: true,
          archivedAt: null,
        },
      ],
    ]);

    return {
      log: mapLegacySportsLog(legacyInsert.data as LegacySportsLogRow, itemMap),
      source: "supabase" as const,
    };
  }

  if (!data) {
    throw new Error("Could not create sports log");
  }

  const itemMap = new Map<string, SportsItem>([
    [
      input.itemId,
      {
        id: input.itemId,
        sport: "",
        name: "",
        metricKind: input.metricKind,
        customUnit: null,
        isActive: true,
        archivedAt: null,
      },
    ],
  ]);

  return {
    log: mapSportsLog(data as SportsLogRow, itemMap),
    source: "supabase" as const,
  };
}

export async function createSportsRoutineInDataStore(input: {
  name: string;
  stepNames: string[];
  createdById: string;
}) {
  const routineId = createEntityId("sports_routine");
  const now = new Date().toISOString();
  const supabase = getSupabaseBrowserClient();

  if (!supabase || !hasSupabaseEnv()) {
    return {
      routine: {
        id: routineId,
        name: input.name,
        isActive: true,
        archivedAt: null,
        createdAt: now,
      } satisfies SportsRoutine,
      steps: input.stepNames.map((stepName, index) => ({
        id: createEntityId("sports_step"),
        routineId,
        name: stepName,
        orderIndex: index,
      })) satisfies SportsRoutineStep[],
      source: "mock" as const,
    };
  }

  const { data: routineData, error: routineError } = await supabase
    .from("sports_routines")
    .insert({
      id: routineId,
      name: input.name,
      is_active: true,
      created_by_id: input.createdById,
    })
    .select("id,name,is_active,archived_at,created_at")
    .single();

  if (routineError || !routineData) {
    throw routineError ?? new Error("Could not create sports routine");
  }

  const stepRows = input.stepNames.map((stepName, index) => ({
    id: createEntityId("sports_step"),
    routine_id: routineId,
    name: stepName,
    order_index: index,
  }));

  const { data: stepsData, error: stepsError } = await supabase
    .from("sports_routine_steps")
    .insert(stepRows)
    .select("id,routine_id,name,order_index");

  if (stepsError) {
    throw stepsError;
  }

  return {
    routine: mapSportsRoutine(routineData as SportsRoutineRow),
    steps: ((stepsData ?? []) as SportsRoutineStepRow[]).map(mapSportsRoutineStep),
    source: "supabase" as const,
  };
}

export async function updateSportsRoutineInDataStore(routineId: string, updates: { name: string }) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase || !hasSupabaseEnv()) {
    return { source: "mock" as const };
  }

  const { error } = await supabase
    .from("sports_routines")
    .update({
      name: updates.name,
      updated_at: new Date().toISOString(),
    })
    .eq("id", routineId);

  if (error) {
    throw error;
  }

  return { source: "supabase" as const };
}

export async function archiveSportsRoutineInDataStore(routineId: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase || !hasSupabaseEnv()) {
    return { source: "mock" as const };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("sports_routines")
    .update({
      is_active: false,
      archived_at: now,
      updated_at: now,
    })
    .eq("id", routineId);

  if (error) {
    throw error;
  }

  return { source: "supabase" as const };
}

export async function addSportsRoutineStepInDataStore(input: {
  routineId: string;
  name: string;
  orderIndex: number;
}) {
  const supabase = getSupabaseBrowserClient();
  const stepId = createEntityId("sports_step");

  if (!supabase || !hasSupabaseEnv()) {
    return {
      step: {
        id: stepId,
        routineId: input.routineId,
        name: input.name,
        orderIndex: input.orderIndex,
      } satisfies SportsRoutineStep,
      source: "mock" as const,
    };
  }

  const { data, error } = await supabase
    .from("sports_routine_steps")
    .insert({
      id: stepId,
      routine_id: input.routineId,
      name: input.name,
      order_index: input.orderIndex,
    })
    .select("id,routine_id,name,order_index")
    .single();

  if (error || !data) {
    throw error ?? new Error("Could not add sports routine step");
  }

  return {
    step: mapSportsRoutineStep(data as SportsRoutineStepRow),
    source: "supabase" as const,
  };
}

export async function removeSportsRoutineStepInDataStore(input: {
  routineId: string;
  stepId: string;
  remainingSteps: SportsRoutineStep[];
}) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase || !hasSupabaseEnv()) {
    return { source: "mock" as const };
  }

  const { error: deleteError } = await supabase
    .from("sports_routine_steps")
    .delete()
    .eq("id", input.stepId);

  if (deleteError) {
    throw deleteError;
  }

  if (input.remainingSteps.length > 0) {
    const { error: reorderError } = await supabase
      .from("sports_routine_steps")
      .upsert(
        input.remainingSteps.map((step, index) => ({
          id: step.id,
          routine_id: input.routineId,
          name: step.name,
          order_index: index,
        })),
      );

    if (reorderError) {
      throw reorderError;
    }
  }

  return { source: "supabase" as const };
}

export async function reorderSportsRoutineStepsInDataStore(input: {
  routineId: string;
  steps: SportsRoutineStep[];
}) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase || !hasSupabaseEnv()) {
    return { source: "mock" as const };
  }

  const { error } = await supabase
    .from("sports_routine_steps")
    .upsert(
      input.steps.map((step, index) => ({
        id: step.id,
        routine_id: input.routineId,
        name: step.name,
        order_index: index,
      })),
    );

  if (error) {
    throw error;
  }

  return { source: "supabase" as const };
}

export async function createSportsRoutineCompletionInDataStore(input: {
  routineId: string;
  dateLocal: string;
  stepChecks: Record<string, boolean>;
  createdById: string;
}) {
  const supabase = getSupabaseBrowserClient();
  const completionId = createEntityId("sports_completion");
  const completedAt = new Date().toISOString();

  if (!supabase || !hasSupabaseEnv()) {
    return {
      completion: {
        id: completionId,
        routineId: input.routineId,
        dateLocal: input.dateLocal,
        completedAt,
      } satisfies SportsRoutineCompletion,
      source: "mock" as const,
    };
  }

  const { data, error } = await supabase
    .from("sports_routine_completions")
    .insert({
      id: completionId,
      routine_id: input.routineId,
      date_local: input.dateLocal,
      completed_at: completedAt,
      created_by_id: input.createdById,
    })
    .select("id,routine_id,date_local,completed_at")
    .single();

  if (error || !data) {
    throw error ?? new Error("Could not complete sports routine");
  }

  const checkedSteps = Object.entries(input.stepChecks).map(([stepId, done]) => ({
    id: createEntityId("sports_check"),
    completion_id: completionId,
    step_id: stepId,
    done,
    checked_at: done ? completedAt : null,
  }));

  if (checkedSteps.length > 0) {
    const { error: checksError } = await supabase
      .from("sports_routine_step_checks")
      .insert(checkedSteps);

    if (checksError) {
      throw checksError;
    }
  }

  return {
    completion: mapSportsRoutineCompletion(data as SportsRoutineCompletionRow),
    source: "supabase" as const,
  };
}
