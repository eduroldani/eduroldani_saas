import type { Note, Profile, Project, Tag, Task } from "@/lib/task-types";

export const mockProfile: Profile = {
  id: "usr_001",
  name: "Edu Roldani",
  email: "edu@internal.local",
  avatarLabel: "ER",
};

export const mockTags: Tag[] = [
  { id: "tag_ops", name: "Ops" },
  { id: "tag_sales", name: "Sales" },
  { id: "tag_admin", name: "Admin" },
  { id: "tag_content", name: "Content" },
  { id: "tag_follow_up", name: "Follow-up" },
  { id: "tag_product", name: "Product" },
];

export const mockTasks: Task[] = [
  {
    id: 1,
    title: "Review priorities",
    description: "Pick the top three tasks that matter today and remove the rest from focus.",
    status: "To do",
    priority: "High",
    dueDate: "2026-04-15",
    createdAt: "2026-04-13",
    createdById: "usr_001",
    tagIds: ["tag_ops", "tag_product"],
  },
  {
    id: 2,
    title: "Client follow-up",
    description: "Send the short update email and confirm the next deadline.",
    status: "In progress",
    priority: "Medium",
    dueDate: "2026-04-16",
    createdAt: "2026-04-12",
    createdById: "usr_001",
    tagIds: ["tag_sales", "tag_follow_up"],
  },
  {
    id: 3,
    title: "Prepare notes",
    description: "Write a simple outline for tomorrow so the meeting starts cleanly.",
    status: "Done",
    priority: "Low",
    dueDate: "2026-04-14",
    createdAt: "2026-04-11",
    createdById: "usr_001",
    tagIds: ["tag_admin"],
  },
];

export const mockNotes: Note[] = [
  {
    id: "note_1",
    title: "Ideas",
    content: "List quick thoughts here before turning them into tasks.",
    createdAt: "2026-04-14T09:00:00.000Z",
    updatedAt: "2026-04-14T09:00:00.000Z",
    createdById: "usr_001",
  },
];

export const mockProjects: Project[] = [
  {
    id: "project_1",
    name: "Internal Ops Setup",
    description: "Define the long-term structure and weekly process.",
    status: "Active",
    targetDate: "2026-06-01",
    createdAt: "2026-04-10T10:30:00.000Z",
    updatedAt: "2026-04-14T08:30:00.000Z",
    createdById: "usr_001",
  },
];
