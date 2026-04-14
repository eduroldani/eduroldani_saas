import type { User } from "@supabase/supabase-js";
import { mockProfile, mockTags, mockTasks } from "@/lib/mock-data";
import { getSupabaseBrowserClient, hasSupabaseEnv } from "@/lib/supabase";
import type { Profile, Tag, Task, TaskPriority, TaskStatus } from "@/lib/task-types";

type TaskRow = {
  id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string;
  created_at: string;
  created_by_id: string;
  task_tags?: Array<{ tag_id: string }>;
};

type ProfileRow = {
  id: string;
  name: string;
  email: string;
  avatar_label: string;
};

type TagRow = {
  id: string;
  name: string;
};

export type AppData = {
  profile: Profile;
  tags: Tag[];
  tasks: Task[];
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

function mapProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatarLabel: row.avatar_label,
  };
}

function mapTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    status: row.status,
    priority: row.priority,
    dueDate: row.due_date,
    createdAt: row.created_at,
    createdById: row.created_by_id,
    tagIds: row.task_tags?.map((entry) => entry.tag_id) ?? [],
  };
}

async function ensureProfileForUser(user: User, supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>) {
  const fallbackName = buildProfileName(user);
  const fallbackEmail = user.email ?? "";
  const fallbackAvatarLabel = buildAvatarLabel(fallbackName, user.email);

  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id,name,email,avatar_label")
    .eq("id", user.id)
    .maybeSingle();

  if (existingProfile) {
    return mapProfile(existingProfile as ProfileRow);
  }

  if (fallbackEmail) {
    const { data: existingProfileByEmail } = await supabase
      .from("profiles")
      .select("id,name,email,avatar_label")
      .eq("email", fallbackEmail)
      .maybeSingle();

    if (existingProfileByEmail) {
      return mapProfile(existingProfileByEmail as ProfileRow);
    }
  }

  const { data: createdProfile, error } = await supabase
    .from("profiles")
    .insert({
      id: user.id,
      name: fallbackName,
      email: fallbackEmail,
      avatar_label: fallbackAvatarLabel,
    })
    .select("id,name,email,avatar_label")
    .single();

  if (error?.code === "23505" && fallbackEmail) {
    const { data: conflictProfile } = await supabase
      .from("profiles")
      .select("id,name,email,avatar_label")
      .eq("email", fallbackEmail)
      .maybeSingle();

    if (conflictProfile) {
      return mapProfile(conflictProfile as ProfileRow);
    }
  }

  if (error || !createdProfile) {
    throw error ?? new Error("Could not create profile");
  }

  return mapProfile(createdProfile as ProfileRow);
}

export async function loadAppData(user?: User | null): Promise<AppData> {
  if (!hasSupabaseEnv()) {
    return {
      profile: mockProfile,
      tags: mockTags,
      tasks: mockTasks,
      source: "mock",
    };
  }

  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return {
      profile: mockProfile,
      tags: mockTags,
      tasks: mockTasks,
      source: "mock",
    };
  }

  if (!user) {
    throw new Error("No authenticated user");
  }

  const ensuredProfile = await ensureProfileForUser(user, supabase);

  const [tagsResult, tasksResult] = await Promise.all([
    supabase.from("tags").select("id,name").order("name", { ascending: true }),
    supabase
      .from("tasks")
      .select("id,title,description,status,priority,due_date,created_at,created_by_id,task_tags(tag_id)")
      .order("created_at", { ascending: false }),
  ]);

  if (tagsResult.error || tasksResult.error) {
    return {
      profile: ensuredProfile,
      tags: mockTags,
      tasks: mockTasks,
      source: "mock",
    };
  }

  return {
    profile: ensuredProfile,
    tags: (tagsResult.data as TagRow[]).map((tag) => ({ id: tag.id, name: tag.name })),
    tasks: (tasksResult.data as TaskRow[]).map(mapTask),
    source: "supabase",
  };
}

export async function createTaskInDataStore(input: {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string;
  createdById: string;
  tagIds: string[];
}) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase || !hasSupabaseEnv()) {
    return {
      task: {
        id: Date.now(),
        title: input.title,
        description: input.description,
        status: input.status,
        priority: input.priority,
        dueDate: input.dueDate,
        createdAt: new Date().toISOString(),
        createdById: input.createdById,
        tagIds: input.tagIds,
      } satisfies Task,
      source: "mock" as const,
    };
  }

  const { data: insertedTask, error: taskError } = await supabase
    .from("tasks")
    .insert({
      title: input.title,
      description: input.description,
      status: input.status,
      priority: input.priority,
      due_date: input.dueDate,
      created_by_id: input.createdById,
    })
    .select("id,title,description,status,priority,due_date,created_at,created_by_id")
    .single();

  if (taskError || !insertedTask) {
    throw taskError ?? new Error("Could not create task");
  }

  if (input.tagIds.length > 0) {
    const { error: tagsError } = await supabase.from("task_tags").insert(
      input.tagIds.map((tagId) => ({
        task_id: insertedTask.id,
        tag_id: tagId,
      })),
    );

    if (tagsError) {
      throw tagsError;
    }
  }

  return {
    task: mapTask({
      ...(insertedTask as TaskRow),
      task_tags: input.tagIds.map((tagId) => ({ tag_id: tagId })),
    }),
    source: "supabase" as const,
  };
}

export async function updateTaskInDataStore(
  taskId: number,
  updates: Partial<Pick<Task, "title" | "description" | "status" | "priority" | "dueDate" | "tagIds">>,
) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase || !hasSupabaseEnv()) {
    return { source: "mock" as const };
  }

  const payload: Record<string, string> = {};

  if (updates.title !== undefined) {
    payload.title = updates.title;
  }
  if (updates.description !== undefined) {
    payload.description = updates.description;
  }
  if (updates.status) {
    payload.status = updates.status;
  }
  if (updates.priority) {
    payload.priority = updates.priority;
  }
  if (updates.dueDate) {
    payload.due_date = updates.dueDate;
  }

  if (Object.keys(payload).length > 0) {
    const { error } = await supabase.from("tasks").update(payload).eq("id", taskId);

    if (error) {
      throw error;
    }
  }

  if (updates.tagIds) {
    const { error: deleteTagsError } = await supabase.from("task_tags").delete().eq("task_id", taskId);

    if (deleteTagsError) {
      throw deleteTagsError;
    }

    if (updates.tagIds.length > 0) {
      const { error: insertTagsError } = await supabase.from("task_tags").insert(
        updates.tagIds.map((tagId) => ({
          task_id: taskId,
          tag_id: tagId,
        })),
      );

      if (insertTagsError) {
        throw insertTagsError;
      }
    }
  }

  return { source: "supabase" as const };
}

export async function deleteTaskInDataStore(taskId: number) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase || !hasSupabaseEnv()) {
    return { source: "mock" as const };
  }

  const { error } = await supabase.from("tasks").delete().eq("id", taskId);

  if (error) {
    throw error;
  }

  return { source: "supabase" as const };
}

function createTagId(name: string) {
  return `tag_${name.toLowerCase().trim().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")}`;
}

export async function createTagInDataStore(name: string) {
  const trimmed = name.trim();
  const nextTag = {
    id: createTagId(trimmed),
    name: trimmed,
  };

  const supabase = getSupabaseBrowserClient();
  if (!supabase || !hasSupabaseEnv()) {
    return nextTag;
  }

  const { data, error } = await supabase
    .from("tags")
    .insert(nextTag)
    .select("id,name")
    .single();

  if (error || !data) {
    throw error ?? new Error("Could not create tag");
  }

  return data as Tag;
}

export async function updateTagInDataStore(tagId: string, name: string) {
  const supabase = getSupabaseBrowserClient();
  const trimmed = name.trim();

  if (!supabase || !hasSupabaseEnv()) {
    return { id: tagId, name: trimmed };
  }

  const { data, error } = await supabase
    .from("tags")
    .update({ name: trimmed })
    .eq("id", tagId)
    .select("id,name")
    .single();

  if (error || !data) {
    throw error ?? new Error("Could not update tag");
  }

  return data as Tag;
}

export async function deleteTagInDataStore(tagId: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase || !hasSupabaseEnv()) {
    return;
  }

  const { error } = await supabase.from("tags").delete().eq("id", tagId);

  if (error) {
    throw error;
  }
}

export async function updateProfileInDataStore(input: { profileId: string; name: string; email: string }) {
  const trimmedName = input.name.trim();
  const nextAvatarLabel = buildAvatarLabel(trimmedName, input.email);

  const supabase = getSupabaseBrowserClient();
  if (!supabase || !hasSupabaseEnv()) {
    return {
      id: input.profileId,
      name: trimmedName,
      email: input.email,
      avatarLabel: nextAvatarLabel,
    } satisfies Profile;
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({
      name: trimmedName,
      avatar_label: nextAvatarLabel,
    })
    .eq("id", input.profileId)
    .select("id,name,email,avatar_label")
    .single();

  if (error || !data) {
    throw error ?? new Error("Could not update profile");
  }

  return mapProfile(data as ProfileRow);
}
