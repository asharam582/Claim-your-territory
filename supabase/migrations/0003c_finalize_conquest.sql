-- ===========================================================================
-- 0003c — Replace finalize_conquest (run AFTER 0003a)
--
-- Race guard is byte-for-byte unchanged from 0001_init.sql. Only the
-- winning branch's SET list and one additive INSERT are new.
-- ===========================================================================

create or replace function public.finalize_conquest(p_ledger_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  led   public.ledger%rowtype;
  sp    public.spots%rowtype;
  ev    text;
  prev  text;
begin
  select * into led from public.ledger where id = p_ledger_id for update;
  if not found then
    return 'lost';
  end if;
  if led.status <> 'pending' then
    return led.status;
  end if;

  select * into sp from public.spots where id = led.spot_id for update;

  if sp.version = led.expected_version and sp.current_price = led.expected_price then
    prev := sp.owner_display;
    ev := case when prev is null then 'claim' else 'conquer' end;

    update public.spots
       set owner_display = led.owner_display,
           logo_url      = led.logo_url,
           link_url      = led.link_url,
           color         = coalesce(led.color, sp.color),
           war_cry       = led.war_cry,
           current_price = led.amount,
           version       = version + 1,
           times_taken   = times_taken + 1,
           conquered_at  = now()
     where id = sp.id;

    update public.ledger
       set status = 'won', resolved_at = now()
     where id = led.id;

    insert into public.activity_feed
      (board_id, spot_id, type, actor, from_owner, label, amount, session_id)
    values
      (led.board_id, led.spot_id, ev, led.owner_display, prev, sp.label, led.amount, led.session_id);

    insert into public.owner_totals (board_id, owner_display, lifetime_plunder)
    values (led.board_id, led.owner_display, led.amount)
    on conflict (board_id, owner_display)
    do update set lifetime_plunder = public.owner_totals.lifetime_plunder + excluded.lifetime_plunder;

    return 'won';
  else
    update public.ledger
       set status = 'lost', resolved_at = now()
     where id = led.id;
    return 'lost';
  end if;
end;
$$;
