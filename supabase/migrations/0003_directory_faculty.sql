-- Faculty from the official directory have no initials yet; they are keyed by their profile slug, e.g. '@HOSNEY.JAHAN'.
alter table public.faculty drop constraint if exists faculty_init_check;
alter table public.faculty add constraint faculty_init_check check (init ~ '^[A-Z]{2,8}$' or init ~ '^@[A-Z0-9._-]{2,60}$');
