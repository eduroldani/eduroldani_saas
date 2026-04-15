"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { AppHeader } from "@/components/app-header";
import { LoginScreen } from "@/components/login-screen";
import { SimpleRichEditor } from "@/components/simple-rich-editor";
import {
  createProjectInDataStore,
  deleteProjectInDataStore,
  loadProjectsData,
  updateProjectInDataStore,
} from "@/lib/task-data";
import { mockProfile, mockProjects } from "@/lib/mock-data";
import {
  hasSupabaseEnv,
  sendPasswordResetEmail,
  signInWithEmailPassword,
  signOutFromSupabase,
} from "@/lib/supabase";
import { useSupabaseAuth } from "@/hooks/use-supabase-auth";
import type { Profile, Project, ProjectStatus } from "@/lib/task-types";

const projectStatuses: ProjectStatus[] = ["Planned", "Active", "On hold", "Done"];
type SaveState = "idle" | "saving" | "saved" | "error";

function formatRelativeDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function ProjectsApp() {
  const [profile, setProfile] = useState<Profile>(mockProfile);
  const [projects, setProjects] = useState<Project[]>(mockProjects);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const { authUser, authState } = useSupabaseAuth();
  const pendingSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function bootstrap() {
      if (hasSupabaseEnv() && !authUser) {
        setIsLoading(false);
        return;
      }

      const data = await loadProjectsData(authUser);
      if (!isMounted) {
        return;
      }

      setProfile(data.profile);
      setProjects(data.projects);
      setSelectedProjectId(data.projects[0]?.id ?? null);
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
  }, [authState, authUser]);

  useEffect(() => {
    return () => {
      if (pendingSaveTimeout.current) {
        clearTimeout(pendingSaveTimeout.current);
      }
    };
  }, []);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  const saveProjectChanges = (
    projectId: string,
    updates: Partial<Pick<Project, "name" | "description" | "status" | "targetDate">>,
  ) => {
    if (pendingSaveTimeout.current) {
      clearTimeout(pendingSaveTimeout.current);
    }

    setSaveState("saving");
    pendingSaveTimeout.current = setTimeout(async () => {
      try {
        await updateProjectInDataStore(projectId, updates);
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 700);
  };

  const handleCreateProject = async () => {
    const created = await createProjectInDataStore({
      name: "Untitled project",
      description: "",
      status: "Planned",
      targetDate: null,
      createdById: profile.id,
    });

    setProjects((current) => [created.project, ...current]);
    setSelectedProjectId(created.project.id);
    setSaveState("idle");
  };

  const handleDeleteProject = async (projectId: string) => {
    const shouldDelete = window.confirm("Delete this project?");
    if (!shouldDelete) {
      return;
    }

    setProjects((current) => {
      const nextProjects = current.filter((project) => project.id !== projectId);
      if (selectedProjectId === projectId) {
        setSelectedProjectId(nextProjects[0]?.id ?? null);
      }
      return nextProjects;
    });

    await deleteProjectInDataStore(projectId);
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
    return (
      <LoginScreen onLogin={signInWithEmailPassword} onPasswordReset={sendPasswordResetEmail} />
    );
  }

  return (
    <>
      <main className="min-h-screen px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
        <section className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-5">
          <AppHeader profile={profile} onProfileClick={() => setIsProfileOpen(true)} />

          <section className="rounded-lg border border-black/10 bg-white p-4 shadow-[0_18px_60px_rgba(0,0,0,0.08)] sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-[0.18em] text-black/45">Projects</p>
              <button
                className="rounded-md border border-black bg-black px-3 py-2 text-xs text-white"
                type="button"
                onClick={() => void handleCreateProject()}
              >
                New project
              </button>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
            <div className="space-y-2 rounded-lg border border-black/10 bg-white p-3 shadow-[0_18px_60px_rgba(0,0,0,0.08)] sm:p-4">
              {projects.map((project) => (
                <button
                  key={project.id}
                  className={`w-full rounded-md border px-3 py-3 text-left transition ${
                    selectedProjectId === project.id
                      ? "border-black/30 bg-[#f7f7f7]"
                      : "border-black/10 bg-white hover:border-black/20"
                  }`}
                  type="button"
                  onClick={() => setSelectedProjectId(project.id)}
                >
                  <p className="truncate text-sm font-medium">{project.name || "Untitled project"}</p>
                  <p className="mt-1 text-xs text-black/45">{formatRelativeDate(project.updatedAt)}</p>
                </button>
              ))}
            </div>

            <div className="rounded-lg border border-black/10 bg-white p-4 shadow-[0_18px_60px_rgba(0,0,0,0.08)] sm:p-5">
              {selectedProject ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-black/50">
                      {saveState === "saving" ? "Saving..." : saveState === "saved" ? "Saved" : saveState === "error" ? "Error saving" : ""}
                    </p>
                    <button
                      className="rounded-md border border-black/10 px-3 py-2 text-xs text-black/70"
                      type="button"
                      onClick={() => void handleDeleteProject(selectedProject.id)}
                    >
                      Delete
                    </button>
                  </div>

                  <input
                    className="w-full rounded-md border border-black/10 bg-white px-4 py-3 text-sm font-medium text-black outline-none transition focus:border-black/40"
                    value={selectedProject.name}
                    onChange={(event) => {
                      const nextName = event.target.value;
                      setProjects((current) =>
                        current.map((project) =>
                          project.id === selectedProject.id
                            ? { ...project, name: nextName, updatedAt: new Date().toISOString() }
                            : project,
                        ),
                      );
                      saveProjectChanges(selectedProject.id, { name: nextName });
                    }}
                    placeholder="Project name"
                  />

                  <div className="grid gap-3 sm:grid-cols-2">
                    <select
                      className="rounded-md border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none transition focus:border-black/40"
                      value={selectedProject.status}
                      onChange={(event) => {
                        const nextStatus = event.target.value as ProjectStatus;
                        setProjects((current) =>
                          current.map((project) =>
                            project.id === selectedProject.id
                              ? { ...project, status: nextStatus, updatedAt: new Date().toISOString() }
                              : project,
                          ),
                        );
                        saveProjectChanges(selectedProject.id, { status: nextStatus });
                      }}
                    >
                      {projectStatuses.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>

                    <input
                      className="rounded-md border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none transition focus:border-black/40"
                      type="date"
                      value={selectedProject.targetDate ?? ""}
                      onChange={(event) => {
                        const nextTargetDate = event.target.value || null;
                        setProjects((current) =>
                          current.map((project) =>
                            project.id === selectedProject.id
                              ? { ...project, targetDate: nextTargetDate, updatedAt: new Date().toISOString() }
                              : project,
                          ),
                        );
                        saveProjectChanges(selectedProject.id, { targetDate: nextTargetDate });
                      }}
                    />
                  </div>

                  <SimpleRichEditor
                    value={selectedProject.description}
                    minHeightClass="min-h-[360px]"
                    placeholder="Describe the long-term objective..."
                    onChange={(nextDescription) => {
                      setProjects((current) =>
                        current.map((project) =>
                          project.id === selectedProject.id
                            ? { ...project, description: nextDescription, updatedAt: new Date().toISOString() }
                            : project,
                        ),
                      );
                      saveProjectChanges(selectedProject.id, { description: nextDescription });
                    }}
                  />
                </div>
              ) : (
                <p className="text-sm text-black/55">Create your first project.</p>
              )}
            </div>
          </section>
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
