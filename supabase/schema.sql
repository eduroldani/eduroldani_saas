create table if not exists profiles (
  id text primary key,
  email text not null unique,
  name text not null,
  avatar_label text not null,
  created_at timestamptz not null default now()
);

create table if not exists tags (
  id text primary key,
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists tasks (
  id bigint generated always as identity primary key,
  title text not null,
  description text,
  status text not null check (status in ('To do', 'In progress', 'Done')),
  priority text not null check (priority in ('Low', 'Medium', 'High')),
  due_date date not null,
  created_at timestamptz not null default now(),
  created_by_id text not null references profiles(id) on delete cascade
);

create table if not exists task_tags (
  task_id bigint not null references tasks(id) on delete cascade,
  tag_id text not null references tags(id) on delete cascade,
  primary key (task_id, tag_id)
);

create table if not exists notes (
  id text primary key,
  title text not null,
  content text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_id text not null references profiles(id) on delete cascade
);

create table if not exists projects (
  id text primary key,
  name text not null,
  description text,
  status text not null check (status in ('Planned', 'Active', 'On hold', 'Done')),
  target_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_id text not null references profiles(id) on delete cascade
);
