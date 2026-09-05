-- ===========================================================================
-- 0003b — Check constraints (run AFTER 0003a)
-- ===========================================================================

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'spots_color_hex_chk'
  ) then
    alter table public.spots
      add constraint spots_color_hex_chk
      check (color is null or color ~ '^#[0-9a-fA-F]{6}$');
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'spots_war_cry_len_chk'
  ) then
    alter table public.spots
      add constraint spots_war_cry_len_chk
      check (war_cry is null or char_length(war_cry) <= 80);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'ledger_color_hex_chk'
  ) then
    alter table public.ledger
      add constraint ledger_color_hex_chk
      check (color is null or color ~ '^#[0-9a-fA-F]{6}$');
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'ledger_war_cry_len_chk'
  ) then
    alter table public.ledger
      add constraint ledger_war_cry_len_chk
      check (war_cry is null or char_length(war_cry) <= 80);
  end if;
end $$;
