-- FOCUS//MODE study rooms: minimal privacy-conscious schema
-- Run in Supabase Dashboard > SQL Editor > New query.
create table if not exists public.study_rooms (
 id uuid primary key default gen_random_uuid(),
 name text not null check (char_length(name) between 2 and 50),
 subject text not null default 'General',
 is_public boolean not null default true,
 created_by uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
create table if not exists public.room_members (
 room_id uuid not null references public.study_rooms(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 joined_at timestamptz not null default now(),
 primary key(room_id,user_id)
);
alter table public.study_rooms enable row level security;
alter table public.room_members enable row level security;
drop policy if exists "Authenticated users can view public rooms" on public.study_rooms;
create policy "Authenticated users can view public rooms" on public.study_rooms for select to authenticated using(is_public or created_by=auth.uid());
drop policy if exists "Users create rooms as themselves" on public.study_rooms;
create policy "Users create rooms as themselves" on public.study_rooms for insert to authenticated with check(created_by=auth.uid());
drop policy if exists "Room owners can update their rooms" on public.study_rooms;
create policy "Room owners can update their rooms" on public.study_rooms for update to authenticated using(created_by=auth.uid()) with check(created_by=auth.uid());
drop policy if exists "Members can view room membership" on public.room_members;
create policy "Members can view room membership" on public.room_members for select to authenticated using(user_id=auth.uid() or exists(select 1 from public.study_rooms r where r.id=room_id and r.created_by=auth.uid()));
drop policy if exists "Users join public rooms as themselves" on public.room_members;
create policy "Users join public rooms as themselves" on public.room_members for insert to authenticated with check(user_id=auth.uid() and exists(select 1 from public.study_rooms r where r.id=room_id and r.is_public=true));
drop policy if exists "Users leave their rooms" on public.room_members;
create policy "Users leave their rooms" on public.room_members for delete to authenticated using(user_id=auth.uid());
grant select,insert,update on public.study_rooms to authenticated;
grant select,insert,delete on public.room_members to authenticated;
