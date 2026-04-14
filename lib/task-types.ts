export type TaskStatus = "To do" | "In progress" | "Done";
export type TaskPriority = "Low" | "Medium" | "High";
export type ViewMode = "Board" | "List";

export type Profile = {
  id: string;
  name: string;
  email: string;
  avatarLabel: string;
};

export type Tag = {
  id: string;
  name: string;
};

export type Task = {
  id: number;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string;
  createdAt: string;
  createdById: string;
  tagIds: string[];
};
