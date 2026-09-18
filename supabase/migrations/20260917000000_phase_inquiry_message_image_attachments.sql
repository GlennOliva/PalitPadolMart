-- ============================================================================
-- INQUIRY IMAGE / PHOTO ATTACHMENTS
-- ============================================================================
-- Adds photo attachments to inquiry chat messages for Buyer and Seller
-- participants. Images are PRIVATE:
--
--   * a dedicated non-public storage bucket (`inquiry-attachments`) guarded by
--     participant-only Storage RLS policies;
--   * a normalized `inquiry_message_attachments` table that stores only
--     trusted metadata (storage_path, mime_type, file_size, file_name) — never
--     signed or permanent public URLs;
--   * the trusted `send_inquiry_reply` RPC is extended (defaulted third
--     parameter) so the DB derives sender identity from auth.uid(), keeps
--     existing participation/closed-state authorization, and validates every
--     attachment path against this inquiry + this uploader.
--
-- Signed URLs are generated on demand (short-lived) only through Storage RLS,
-- which limits reads to inquiry participants and admins.
--
-- Existing behavior is preserved: text-only replies still work, closed
-- inquiries still cannot receive messages (text or image), and a message must
-- contain text AND/OR at least one image attachment (enforced by a DEFERRED
-- constraint trigger so image-only messages with an empty body are legal).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Allow thread messages with an empty body (image-only messages). Text-only
--    messages keep the 1..2000 character bound; the empty body is permitted
--    only when an attachment row exists — enforced below by the DEFERRED
--    `inquiry_messages_required_content` constraint trigger so the two-table
--    invariant is checked at COMMIT time (message row is inserted before its
--    attachments in the same transaction).
-- ----------------------------------------------------------------------------
alter table public.inquiry_messages
  drop constraint inquiry_messages_message_length;

alter table public.inquiry_messages
  add constraint inquiry_messages_message_length
  check (length(trim(message)) between 1 and 2000 or length(trim(message)) = 0);

-- ----------------------------------------------------------------------------
-- 2. Normalized attachment metadata table
-- ----------------------------------------------------------------------------
create table public.inquiry_message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.inquiry_messages(id) on delete cascade,
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  file_name text,
  mime_type text not null,
  file_size bigint not null,
  created_at timestamptz not null default now(),
  constraint inquiry_message_attachments_storage_path_key unique (storage_path),
  constraint inquiry_message_attachments_mime_type_check
    check (mime_type in ('image/jpeg', 'image/jpg', 'image/png', 'image/webp')),
  constraint inquiry_message_attachments_file_size_check
    check (file_size between 1 and 5242880),
  constraint inquiry_message_attachments_storage_path_length_check
    check (length(storage_path) between 1 and 500),
  constraint inquiry_message_attachments_file_name_length_check
    check (file_name is null or length(file_name) between 1 and 255)
);

create index idx_inquiry_message_attachments_message
  on public.inquiry_message_attachments (message_id);
create index idx_inquiry_message_attachments_inquiry
  on public.inquiry_message_attachments (inquiry_id, created_at);
create index idx_inquiry_message_attachments_uploaded_by
  on public.inquiry_message_attachments (uploaded_by);

-- ----------------------------------------------------------------------------
-- 3. RLS on the attachment table: participants (and admins) read, admins
--    delete, nothing else. Insert/update/delete are REVOKED below so every
--    attachment row can only be created by the trusted security-definer RPC.
-- ----------------------------------------------------------------------------
alter table public.inquiry_message_attachments enable row level security;

create policy "inquiry_message_attachments_select_participant_or_admin"
  on public.inquiry_message_attachments
  for select using (
    exists (
      select 1 from public.inquiries i
      where i.id = inquiry_message_attachments.inquiry_id
        and (
          i.buyer_id = auth.uid()
          or exists (
            select 1
            from public.seller_profiles sp
            join public.listings l on l.seller_id = sp.id
            where l.id = i.listing_id
              and sp.user_id = auth.uid()
          )
          or public.is_admin()
        )
    )
  );

create policy "inquiry_message_attachments_delete_admin"
  on public.inquiry_message_attachments
  for delete using (public.is_admin());

-- Attribution is immutable once attached: no insert/update grants, and delete
-- is admin-only (mirrors inquiry_messages historical-conversation semantics).
revoke all on table public.inquiry_message_attachments from public, anon, authenticated;
grant select on table public.inquiry_message_attachments to authenticated;

-- ----------------------------------------------------------------------------
-- 4. DEFERRED content invariant: every thread message must carry text and/or
--    at least one attachment. Messages are inserted before their attachments
--    within the same transaction, so the check runs at COMMIT time.
-- ----------------------------------------------------------------------------
create or replace function public.inquiry_message_require_content()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if length(trim(new.message)) = 0
     and not exists (
       select 1
       from public.inquiry_message_attachments a
       where a.message_id = new.id
     ) then
    raise exception 'message must include text or at least one attachment';
  end if;
  return new;
end;
$$;

drop trigger if exists inquiry_message_require_content on public.inquiry_messages;
create constraint trigger inquiry_message_require_content
  after insert on public.inquiry_messages
  deferrable initially deferred
  for each row execute function public.inquiry_message_require_content();

-- ----------------------------------------------------------------------------
-- 5. Private storage bucket + participant-only Storage RLS
-- ----------------------------------------------------------------------------
-- Path convention: <inquiry_id>/<uploader_user_id>/<uuid>.<ext>. The first
-- segment is the conversation id (used for participant checks), the second is
-- the authenticated uploader (always auth.uid(), never browser-supplied).
-- [IMAGE-ONLY NOTE] Bucket stays public = FALSE; no permanent public URL is
-- ever generated.

insert into storage.buckets (id, name, public)
values ('inquiry-attachments', 'inquiry-attachments', false)
on conflict (id) do nothing;

-- Cross-table checks inside Storage policies run under the caller's RLS, so
-- they must use SECURITY DEFINER helpers (the RLS on referenced tables would
-- otherwise block even the legitimate participant).
create or replace function public.user_is_inquiry_participant(p_inquiry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.inquiries i
    where i.id = p_inquiry_id
      and (
        i.buyer_id = auth.uid()
        or exists (
          select 1
          from public.seller_profiles sp
          join public.listings l on l.seller_id = sp.id
          where l.id = i.listing_id
            and sp.user_id = auth.uid()
        )
      )
  );
$$;

-- True when a storage object is already the immutable record of a sent
-- message attachment. Used to forbid uploaders from deleting an attachment
-- object once it has been attached to the conversation.
create or replace function public.inquiry_attachment_object_attached(p_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.inquiry_message_attachments a
    where a.storage_path = p_path
  );
$$;

grant execute on function public.user_is_inquiry_participant(uuid) to authenticated;
grant execute on function public.inquiry_attachment_object_attached(text) to authenticated;

drop policy if exists "inquiry_attachments_insert_participant" on storage.objects;
create policy "inquiry_attachments_insert_participant" on storage.objects
  for insert with check (
    bucket_id = 'inquiry-attachments'
    and (storage.foldername(name))[2] = auth.uid()::text
    and public.user_is_inquiry_participant((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "inquiry_attachments_select_participant" on storage.objects;
create policy "inquiry_attachments_select_participant" on storage.objects
  for select using (
    bucket_id = 'inquiry-attachments'
    and (
      public.user_is_inquiry_participant((storage.foldername(name))[1]::uuid)
      or public.is_admin()
    )
  );

drop policy if exists "inquiry_attachments_update_uploader" on storage.objects;
create policy "inquiry_attachments_update_uploader" on storage.objects
  for update using (
    bucket_id = 'inquiry-attachments'
    and (storage.foldername(name))[2] = auth.uid()::text
  ) with check (
    bucket_id = 'inquiry-attachments'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- The uploader may remove an object ONLY while it is still pending (no
-- attachment row references it yet). Once a message is sent the object is part
-- of the immutable conversation and cannot be deleted by participants.
drop policy if exists "inquiry_attachments_delete_uploader_unattached" on storage.objects;
create policy "inquiry_attachments_delete_uploader_unattached" on storage.objects
  for delete using (
    bucket_id = 'inquiry-attachments'
    and (
      public.is_admin()
      or (
        (storage.foldername(name))[2] = auth.uid()::text
        and not public.inquiry_attachment_object_attached(name)
      )
    )
  );

-- ----------------------------------------------------------------------------
-- 6. Extended trusted reply RPC
-- ----------------------------------------------------------------------------
-- Replaces send_inquiry_reply(uuid, text) with an overload carrying a defaulted
-- jsonb attachments argument. Existing text-only callers keep working; the new
-- attachments path preserves every existing authorization rule:
--   * auth.uid() is always the sender; a browser-supplied sender is ignored
--   * participant check (buyer, or owner of the seller profile of the listing)
--   * closed inquiries reject text and image messages alike
--   * each storage_path must belong to THIS inquiry and THIS uploader
--   * MIME in {image/jpeg, image/jpg, image/png, image/webp}, size 1..5MB,
--     at most 4 attachments, text and/or attachments required
-- The insert of message + attachment rows is one atomic transaction.
drop function if exists public.send_inquiry_reply(uuid, text);

create or replace function public.send_inquiry_reply(
  p_inquiry_id uuid,
  p_message text,
  p_attachments jsonb default '[]'::jsonb
)
returns public.inquiry_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inquiry public.inquiries%rowtype;
  v_trimmed text := trim(p_message);
  v_sender uuid := auth.uid();
  v_message public.inquiry_messages;
  v_attachments jsonb := coalesce(p_attachments, '[]'::jsonb);
  v_att jsonb;
  v_att_path text;
  v_att_filepart text;
  v_att_mime text;
  v_att_size bigint;
  v_att_name text;
  v_prefix text;
begin
  if v_sender is null then
    raise exception 'not authenticated';
  end if;

  -- Content: text and/or attachments; images are optional, text is optional
  -- when at least one image is attached.
  if v_trimmed = '' and jsonb_array_length(v_attachments) = 0 then
    raise exception 'message must include text or at least one attachment';
  end if;
  if length(v_trimmed) > 2000 then
    raise exception 'message must be 2000 characters or fewer';
  end if;
  if jsonb_array_length(v_attachments) > 4 then
    raise exception 'a message may include up to 4 image attachments';
  end if;

  select * into v_inquiry
  from public.inquiries
  where id = p_inquiry_id
  for update;

  if not found then
    raise exception 'inquiry not found';
  end if;

  -- NULL-safe participant check (EXISTS never returns NULL): inquiry buyer, or
  -- the authenticated user who owns the seller profile of the inquiry listing.
  if not (
    v_inquiry.buyer_id = v_sender
    or exists (
      select 1
      from public.seller_profiles sp
      join public.listings l on l.seller_id = sp.id
      where l.id = v_inquiry.listing_id
        and sp.user_id = v_sender
    )
  ) then
    raise exception 'not a participant of this inquiry';
  end if;

  if v_inquiry.status = 'closed' then
    raise exception 'inquiry is closed';
  end if;

  -- Every attachment path must belong to this inquiry AND this uploader, and
  -- must be a real object in the private bucket. v_prefix is derived from
  -- auth.uid() (never client input), so a participant in inquiry A cannot
  -- attach an object from inquiry B and Seller A cannot attach Seller B's file.
  v_prefix := p_inquiry_id::text || '/' || v_sender::text || '/';

  for v_att in
    select value from jsonb_array_elements(v_attachments) as value
  loop
    v_att_path := v_att ->> 'storage_path';
    v_att_mime := v_att ->> 'mime_type';
    v_att_size := (v_att ->> 'file_size')::bigint;
    v_att_name := v_att ->> 'file_name';

    if v_att_path is null or v_att_path = '' or v_att_mime is null or v_att_size is null then
      raise exception 'invalid attachment metadata';
    end if;

    if left(v_att_path, length(v_prefix)) <> v_prefix then
      raise exception 'attachment does not belong to this inquiry';
    end if;

    v_att_filepart := substring(v_att_path from length(v_prefix) + 1);
    if v_att_filepart = ''
       or position('/' in v_att_filepart) <> 0
       or v_att_filepart ~ '[^A-Za-z0-9._-]' then
      raise exception 'invalid attachment file path';
    end if;

    if v_att_mime not in ('image/jpeg', 'image/jpg', 'image/png', 'image/webp') then
      raise exception 'unsupported image type';
    end if;

    if v_att_size <= 0 or v_att_size > 5242880 then
      raise exception 'image must be between 1 byte and 5 MB';
    end if;

    if not exists (
      select 1
      from storage.objects o
      where o.bucket_id = 'inquiry-attachments'
        and o.name = v_att_path
    ) then
      raise exception 'attached file not found in storage';
    end if;
  end loop;

  insert into public.inquiry_messages (inquiry_id, sender_id, message)
  values (p_inquiry_id, v_sender, v_trimmed)
  returning * into v_message;

  for v_att in
    select value from jsonb_array_elements(v_attachments) as value
  loop
    insert into public.inquiry_message_attachments (
      message_id,
      inquiry_id,
      uploaded_by,
      storage_path,
      file_name,
      mime_type,
      file_size
    )
    values (
      v_message.id,
      p_inquiry_id,
      v_sender,
      v_att ->> 'storage_path',
      nullif(v_att ->> 'file_name', ''),
      v_att ->> 'mime_type',
      (v_att ->> 'file_size')::bigint
    );
  end loop;

  if v_inquiry.buyer_id = v_sender then
    update public.inquiries set status = 'open' where id = p_inquiry_id;
  else
    update public.inquiries set status = 'answered' where id = p_inquiry_id;
  end if;

  return v_message;
end;
$$;

grant execute on function public.send_inquiry_reply(uuid, text, jsonb) to authenticated;