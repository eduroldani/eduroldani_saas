create table if not exists profiles (
  id text primary key,
  email text not null unique,
  name text not null,
  avatar_label text not null,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, avatar_label)
  values (
    new.id::text,
    coalesce(new.email, ''),
    coalesce(
      nullif(new.raw_user_meta_data->>'name', ''),
      nullif(new.raw_user_meta_data->>'full_name', ''),
      split_part(coalesce(new.email, 'user'), '@', 1)
    ),
    upper(left(coalesce(new.email, 'u'), 1))
  )
  on conflict (id) do update
  set
    email = excluded.email,
    name = excluded.name,
    avatar_label = excluded.avatar_label;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create table if not exists tags (
  id text primary key,
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists clients (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tasks (
  id bigint generated always as identity primary key,
  title text not null,
  description text,
  status text not null check (status in ('To do', 'In progress', 'Done')),
  priority text not null check (priority in ('Low', 'Medium', 'High')),
  due_date date not null,
  created_at timestamptz not null default now(),
  created_by_id text not null references profiles(id) on delete cascade,
  client_id text references clients(id) on delete set null,
  estimated_hours numeric(6,2),
  worked_hours numeric(6,2) not null default 0
);

create table if not exists task_tags (
  task_id bigint not null references tasks(id) on delete cascade,
  tag_id text not null references tags(id) on delete cascade,
  primary key (task_id, tag_id)
);

alter table tasks add column if not exists client_id text references clients(id) on delete set null;
alter table tasks add column if not exists estimated_hours numeric(6,2);
alter table tasks add column if not exists worked_hours numeric(6,2) not null default 0;

create table if not exists notes (
  id text primary key,
  title text not null,
  content text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_id text not null references profiles(id) on delete cascade
);

create table if not exists client_notes (
  client_id text not null references clients(id) on delete cascade,
  created_by_id text not null references profiles(id) on delete cascade,
  content text not null default '',
  updated_at timestamptz not null default now(),
  primary key (client_id, created_by_id)
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

create table if not exists daily_task_templates (
  id text primary key,
  title text not null,
  is_active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_id text not null references profiles(id) on delete cascade
);

create table if not exists daily_task_logs (
  id text primary key,
  template_id text not null references daily_task_templates(id) on delete cascade,
  date_local date not null,
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_id, date_local)
);

create table if not exists sports_items (
  id text primary key,
  name text not null,
  metric_type text not null check (metric_type in ('kg', 'km')),
  is_active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_id text not null references profiles(id) on delete cascade
);

create table if not exists sports_logs (
  id text primary key,
  item_id text not null references sports_items(id) on delete cascade,
  value_numeric numeric(10,2) not null check (value_numeric > 0),
  date_local date not null,
  created_at timestamptz not null default now(),
  created_by_id text not null references profiles(id) on delete cascade
);

create table if not exists sports_routines (
  id text primary key,
  name text not null,
  is_active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_id text not null references profiles(id) on delete cascade
);

create table if not exists sports_routine_steps (
  id text primary key,
  routine_id text not null references sports_routines(id) on delete cascade,
  name text not null,
  order_index integer not null check (order_index >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (routine_id, order_index)
);

create table if not exists sports_routine_completions (
  id text primary key,
  routine_id text not null references sports_routines(id) on delete cascade,
  date_local date not null,
  completed_at timestamptz not null default now(),
  created_by_id text not null references profiles(id) on delete cascade
);

create table if not exists sports_routine_step_checks (
  id text primary key,
  completion_id text not null references sports_routine_completions(id) on delete cascade,
  step_id text not null references sports_routine_steps(id) on delete cascade,
  done boolean not null default false,
  checked_at timestamptz,
  unique (completion_id, step_id)
);

alter table if exists sports_items
  add column if not exists sport text,
  add column if not exists metric_kind text check (metric_kind in ('count', 'distance_time', 'weight_reps', 'custom')),
  add column if not exists custom_unit text;

alter table if exists sports_logs
  add column if not exists distance_km numeric(10,2),
  add column if not exists duration_min numeric(10,2),
  add column if not exists weight_kg numeric(10,2),
  add column if not exists reps integer,
  add column if not exists sets integer;
