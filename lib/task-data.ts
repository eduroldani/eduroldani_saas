import type { User } from "@supabase/supabase-js";
import { mockClients, mockNotes, mockProfile, mockProjects, mockTags, mockTasks } from "@/lib/mock-data";
import { getSupabaseBrowserClient, hasSupabaseEnv } from "@/lib/supabase";
import type { Client, ClientNote, Note, Profile, Project, ProjectStatus, Tag, Task, TaskPriority, TaskStatus } from "@/lib/task-types";

type TaskRow = {
  id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string;
  created_at: string;
  created_by_id: string;
  client_id: string | null;
  estimated_hours: number | null;
  worked_hours: number | null;
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

type ClientRow = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

type NoteRow = {
  id: string;
  title: string;
  content: string | null;
  created_at: string;
  updated_at: string;
  created_by_id: string;
};

type ClientNoteRow = {
  client_id: string;
  content: string | null;
  updated_at: string;
  created_by_id: string;
};

type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  target_date: string | null;
  created_at: string;
  updated_at: string;
  created_by_id: string;
};

export type AppData = {
  profile: Profile;
  tags: Tag[];
  tasks: Task[];
  source: "supabase" | "mock";
};

export type NotesData = {
  profile: Profile;
  notes: Note[];
  source: "supabase" | "mock";
};

export type ProjectsData = {
  profile: Profile;
  projects: Project[];
  source: "supabase" | "mock";
};

export type ClientsData = {
  profile: Profile;
  clients: Client[];
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
    clientId: row.client_id,
    estimatedHours: row.estimated_hours,
    workedHours: row.worked_hours ?? 0,
    tagIds: row.task_tags?.map((entry) => entry.tag_id) ?? [],
  };
}

function mapClient(row: ClientRow): Client {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapNote(row: NoteRow): Note {
  return {
    id: row.id,
    title: row.title,
    content: row.content ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdById: row.created_by_id,
  };
}

function mapClientNote(row: ClientNoteRow): ClientNote {
  return {
    clientId: row.client_id,
    content: row.content ?? "",
    updatedAt: row.updated_at,
    createdById: row.created_by_id,
  };
}

function mapProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    status: row.status,
    targetDate: row.target_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdById: row.created_by_id,
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
      .select("id,title,description,status,priority,due_date,created_at,created_by_id,client_id,estimated_hours,worked_hours,task_tags(tag_id)")
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
  clientId?: string | null;
  estimatedHours?: number | null;
  workedHours?: number;
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
        clientId: input.clientId ?? null,
        estimatedHours: input.estimatedHours ?? null,
        workedHours: input.workedHours ?? 0,
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
      client_id: input.clientId ?? null,
      estimated_hours: input.estimatedHours ?? null,
      worked_hours: input.workedHours ?? 0,
    })
    .select("id,title,description,status,priority,due_date,created_at,created_by_id,client_id,estimated_hours,worked_hours")
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
  updates: Partial<
    Pick<
      Task,
      "title" | "description" | "status" | "priority" | "dueDate" | "tagIds" | "clientId" | "estimatedHours" | "workedHours"
    >
  >,
) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase || !hasSupabaseEnv()) {
    return { source: "mock" as const };
  }

  const payload: Record<string, string | number | null> = {};

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
  if (updates.clientId !== undefined) {
    payload.client_id = updates.clientId;
  }
  if (updates.estimatedHours !== undefined) {
    payload.estimated_hours = updates.estimatedHours;
  }
  if (updates.workedHours !== undefined) {
    payload.worked_hours = updates.workedHours;
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

function createEntityId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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

export async function loadNotesData(user?: User | null): Promise<NotesData> {
  if (!hasSupabaseEnv()) {
    return {
      profile: mockProfile,
      notes: mockNotes,
      source: "mock",
    };
  }

  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return {
      profile: mockProfile,
      notes: mockNotes,
      source: "mock",
    };
  }

  if (!user) {
    throw new Error("No authenticated user");
  }

  const ensuredProfile = await ensureProfileForUser(user, supabase);
  const { data, error } = await supabase
    .from("notes")
    .select("id,title,content,created_at,updated_at,created_by_id")
    .order("updated_at", { ascending: false });

  if (error || !data) {
    return {
      profile: ensuredProfile,
      notes: mockNotes,
      source: "mock",
    };
  }

  return {
    profile: ensuredProfile,
    notes: (data as NoteRow[]).map(mapNote),
    source: "supabase",
  };
}

export async function loadClientNoteInDataStore(input: { clientId: string; profileId: string }) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase || !hasSupabaseEnv()) {
    return {
      note: {
        clientId: input.clientId,
        content: "",
        updatedAt: new Date().toISOString(),
        createdById: input.profileId,
      } satisfies ClientNote,
      source: "mock" as const,
    };
  }

  const { data, error } = await supabase
    .from("client_notes")
    .select("client_id,content,updated_at,created_by_id")
    .eq("client_id", input.clientId)
    .eq("created_by_id", input.profileId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return {
      note: {
        clientId: input.clientId,
        content: "",
        updatedAt: new Date().toISOString(),
        createdById: input.profileId,
      } satisfies ClientNote,
      source: "supabase" as const,
    };
  }

  return {
    note: mapClientNote(data as ClientNoteRow),
    source: "supabase" as const,
  };
}

export async function upsertClientNoteInDataStore(input: {
  clientId: string;
  profileId: string;
  content: string;
}) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase || !hasSupabaseEnv()) {
    return { source: "mock" as const };
  }

  const { error } = await supabase
    .from("client_notes")
    .upsert(
      {
        client_id: input.clientId,
        created_by_id: input.profileId,
        content: input.content,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "client_id,created_by_id" },
    );

  if (error) {
    throw error;
  }

  return { source: "supabase" as const };
}

export async function createNoteInDataStore(input: {
  title: string;
  content: string;
  createdById: string;
}) {
  const noteId = createEntityId("note");
  const supabase = getSupabaseBrowserClient();
  if (!supabase || !hasSupabaseEnv()) {
    return {
      note: {
        id: noteId,
        title: input.title,
        content: input.content,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdById: input.createdById,
      } satisfies Note,
      source: "mock" as const,
    };
  }

  const { data, error } = await supabase
    .from("notes")
    .insert({
      id: noteId,
      title: input.title,
      content: input.content,
      created_by_id: input.createdById,
    })
    .select("id,title,content,created_at,updated_at,created_by_id")
    .single();

  if (error || !data) {
    throw error ?? new Error("Could not create note");
  }

  return {
    note: mapNote(data as NoteRow),
    source: "supabase" as const,
  };
}

export async function updateNoteInDataStore(
  noteId: string,
  updates: Partial<Pick<Note, "title" | "content">>,
) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase || !hasSupabaseEnv()) {
    return { source: "mock" as const };
  }

  const payload: Record<string, string> = {};
  if (updates.title !== undefined) {
    payload.title = updates.title;
  }
  if (updates.content !== undefined) {
    payload.content = updates.content;
  }
  payload.updated_at = new Date().toISOString();

  if (Object.keys(payload).length === 0) {
    return { source: "supabase" as const };
  }

  const { error } = await supabase.from("notes").update(payload).eq("id", noteId);
  if (error) {
    throw error;
  }

  return { source: "supabase" as const };
}

export async function deleteNoteInDataStore(noteId: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase || !hasSupabaseEnv()) {
    return { source: "mock" as const };
  }

  const { error } = await supabase.from("notes").delete().eq("id", noteId);
  if (error) {
    throw error;
  }

  return { source: "supabase" as const };
}

export async function loadProjectsData(user?: User | null): Promise<ProjectsData> {
  if (!hasSupabaseEnv()) {
    return {
      profile: mockProfile,
      projects: mockProjects,
      source: "mock",
    };
  }

  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return {
      profile: mockProfile,
      projects: mockProjects,
      source: "mock",
    };
  }

  if (!user) {
    throw new Error("No authenticated user");
  }

  const ensuredProfile = await ensureProfileForUser(user, supabase);
  const { data, error } = await supabase
    .from("projects")
    .select("id,name,description,status,target_date,created_at,updated_at,created_by_id")
    .order("updated_at", { ascending: false });

  if (error || !data) {
    return {
      profile: ensuredProfile,
      projects: mockProjects,
      source: "mock",
    };
  }

  return {
    profile: ensuredProfile,
    projects: (data as ProjectRow[]).map(mapProject),
    source: "supabase",
  };
}

export async function createProjectInDataStore(input: {
  name: string;
  description: string;
  status: ProjectStatus;
  targetDate: string | null;
  createdById: string;
}) {
  const projectId = createEntityId("project");
  const supabase = getSupabaseBrowserClient();
  if (!supabase || !hasSupabaseEnv()) {
    return {
      project: {
        id: projectId,
        name: input.name,
        description: input.description,
        status: input.status,
        targetDate: input.targetDate,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdById: input.createdById,
      } satisfies Project,
      source: "mock" as const,
    };
  }

  const { data, error } = await supabase
    .from("projects")
    .insert({
      id: projectId,
      name: input.name,
      description: input.description,
      status: input.status,
      target_date: input.targetDate,
      created_by_id: input.createdById,
    })
    .select("id,name,description,status,target_date,created_at,updated_at,created_by_id")
    .single();

  if (error || !data) {
    throw error ?? new Error("Could not create project");
  }

  return {
    project: mapProject(data as ProjectRow),
    source: "supabase" as const,
  };
}

export async function updateProjectInDataStore(
  projectId: string,
  updates: Partial<Pick<Project, "name" | "description" | "status" | "targetDate">>,
) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase || !hasSupabaseEnv()) {
    return { source: "mock" as const };
  }

  const payload: Record<string, string | null> = {};
  if (updates.name !== undefined) {
    payload.name = updates.name;
  }
  if (updates.description !== undefined) {
    payload.description = updates.description;
  }
  if (updates.status !== undefined) {
    payload.status = updates.status;
  }
  if (updates.targetDate !== undefined) {
    payload.target_date = updates.targetDate;
  }
  payload.updated_at = new Date().toISOString();

  if (Object.keys(payload).length === 0) {
    return { source: "supabase" as const };
  }

  const { error } = await supabase.from("projects").update(payload).eq("id", projectId);
  if (error) {
    throw error;
  }

  return { source: "supabase" as const };
}

export async function deleteProjectInDataStore(projectId: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase || !hasSupabaseEnv()) {
    return { source: "mock" as const };
  }

  const { error } = await supabase.from("projects").delete().eq("id", projectId);
  if (error) {
    throw error;
  }

  return { source: "supabase" as const };
}

export async function loadClientsData(user?: User | null): Promise<ClientsData> {
  if (!hasSupabaseEnv()) {
    return {
      profile: mockProfile,
      clients: mockClients,
      source: "mock",
    };
  }

  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return {
      profile: mockProfile,
      clients: mockClients,
      source: "mock",
    };
  }

  if (!user) {
    throw new Error("No authenticated user");
  }

  const ensuredProfile = await ensureProfileForUser(user, supabase);
  const { data, error } = await supabase
    .from("clients")
    .select("id,name,created_at,updated_at")
    .order("created_at", { ascending: false });

  if (error || !data) {
    return {
      profile: ensuredProfile,
      clients: mockClients,
      source: "mock",
    };
  }

  return {
    profile: ensuredProfile,
    clients: (data as ClientRow[]).map(mapClient),
    source: "supabase",
  };
}

export async function createClientInDataStore(input: { name: string }) {
  const clientId = createEntityId("client");
  const trimmedName = input.name.trim();
  const supabase = getSupabaseBrowserClient();
  if (!supabase || !hasSupabaseEnv()) {
    return {
      id: clientId,
      name: trimmedName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } satisfies Client;
  }

  const { data, error } = await supabase
    .from("clients")
    .insert({ id: clientId, name: trimmedName })
    .select("id,name,created_at,updated_at")
    .single();

  if (error || !data) {
    throw error ?? new Error("Could not create client");
  }

  return mapClient(data as ClientRow);
}

export async function updateClientInDataStore(input: { clientId: string; name: string }) {
  const supabase = getSupabaseBrowserClient();
  const trimmedName = input.name.trim();
  if (!supabase || !hasSupabaseEnv()) {
    return {
      id: input.clientId,
      name: trimmedName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } satisfies Client;
  }

  const { data, error } = await supabase
    .from("clients")
    .update({
      name: trimmedName,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.clientId)
    .select("id,name,created_at,updated_at")
    .single();

  if (error || !data) {
    throw error ?? new Error("Could not update client");
  }

  return mapClient(data as ClientRow);
}

export async function deleteClientInDataStore(clientId: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase || !hasSupabaseEnv()) {
    return { source: "mock" as const };
  }

  const { error: clearTasksError } = await supabase
    .from("tasks")
    .update({ client_id: null })
    .eq("client_id", clientId);

  if (clearTasksError) {
    throw clearTasksError;
  }

  const { error } = await supabase.from("clients").delete().eq("id", clientId);
  if (error) {
    throw error;
  }

  return { source: "supabase" as const };
}
