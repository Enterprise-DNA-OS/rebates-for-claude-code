-- Rebates for Claude Code: accounts, products, rebate agreements and their tiers,
-- the sales they are calculated from, settlements, and the claims customers make.
-- Amounts are excluding GST, in the account's currency (NZD for NZ, AUD for AU).
create function touch_updated() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;

create table accounts (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name))>0),
 kind text not null default 'trade' check(kind in ('grocery-retailer','retailer','buying-group','distributor','trade')),
 parent_id uuid references accounts(id), country text not null default 'NZ' check(country in ('NZ','AU')),
 owner text not null default '', source_id text unique, source_snapshot jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(parent_id is null or parent_id<>id)
);
create table products (
 id uuid primary key default gen_random_uuid(), code text not null unique, name text not null, category text not null default '',
 source_id text unique, source_snapshot jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table agreements (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name))>0),
 account_id uuid not null references accounts(id),
 kind text not null default 'tiered' check(kind in ('tiered','growth')),
 rate_type text not null default 'percent' check(rate_type in ('percent','per_unit')),
 period text not null default 'quarterly' check(period in ('monthly','quarterly','term')),
 starts date not null, ends date not null, baseline numeric(14,2), category text,
 settle_within_days int not null default 30 check(settle_within_days between 0 and 365),
 settlement_method text not null default 'credit-note' check(settlement_method in ('credit-note','payment','statement')),
 signed_document text, review_date date, owner text not null,
 state text not null default 'active' check(state in ('draft','active','ended')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(ends>=starts), check(kind<>'growth' or baseline is not null)
);
create table rebate_tiers (
 id uuid primary key default gen_random_uuid(), agreement_id uuid not null references agreements(id),
 threshold numeric(14,2) not null check(threshold>=0), rate numeric(10,4) not null check(rate>0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(agreement_id,threshold)
);
create table sales (
 id uuid primary key default gen_random_uuid(), account_id uuid not null references accounts(id), product_id uuid not null references products(id),
 invoice_no text not null, invoice_date date not null, units numeric(14,2) not null default 0, net_value numeric(14,2) not null,
 source_id text unique, source_snapshot jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table settlements (
 id uuid primary key default gen_random_uuid(), agreement_id uuid not null references agreements(id),
 period_start date not null, period_end date not null, measure numeric(14,2) not null, rate numeric(10,4) not null,
 calculated numeric(14,2) not null, adjustment numeric(14,2) not null default 0, adjustment_reason text,
 total numeric(14,2) generated always as (calculated+adjustment) stored,
 state text not null default 'calculated' check(state in ('calculated','approved','paid')),
 calculated_by text not null, approved_by text, approved_at timestamptz, paid_on date, payment_ref text, credit_note_ref text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(agreement_id,period_start), check(period_end>=period_start),
 check(adjustment=0 or length(trim(adjustment_reason))>0),
 check(state='calculated' or (approved_by is not null and lower(approved_by)<>lower(calculated_by))),
 check(state<>'paid' or (paid_on is not null and length(trim(payment_ref))>0))
);
create table claims (
 id uuid primary key default gen_random_uuid(), account_id uuid not null references accounts(id), agreement_id uuid references agreements(id),
 reference text not null, claimed_on date not null, period_start date, amount numeric(14,2) not null check(amount>0),
 state text not null default 'open' check(state in ('open','matched','disputed','written-off')),
 settlement_id uuid references settlements(id), note text not null default '', resolved_by text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(account_id,reference), check(state<>'matched' or settlement_id is not null)
);
create table notes (
 id uuid primary key default gen_random_uuid(), account_id uuid not null references accounts(id), actor text not null, body text not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table history (
 id uuid primary key default gen_random_uuid(), actor text not null, operation text not null, record_id uuid, detail jsonb not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
do $$ declare t text; begin foreach t in array array['accounts','products','agreements','rebate_tiers','sales','settlements','claims','notes','history'] loop
 execute format('create trigger touch before update on %I for each row execute function touch_updated()',t);
 execute format('alter table %I enable row level security',t);
 execute format('revoke all on %I from public',t);
 end loop; end $$;
create index on accounts(parent_id);
create index on sales(account_id,invoice_date);
create index on sales(product_id);
create index on settlements(agreement_id,state);
create index on claims(state);

-- The calculation. Qualifying sales are the agreement account's own sales plus its member
-- stores' (a buying group), inside the window and the agreement's dates, limited to its
-- product category when one is set. Tiers are retrospective: the highest tier reached sets
-- the rate for every qualifying dollar (percent) or unit (per_unit). A growth agreement
-- pays that rate only on the amount above its baseline for the period.
create function rebate_calc(p_agreement uuid,p_from date,p_to date)
returns table(qualifying_value numeric,qualifying_units numeric,measure numeric,rate numeric,next_threshold numeric,next_rate numeric,rebate numeric)
language sql stable as $$
 with g as (select * from agreements where id=p_agreement),
 q as (select coalesce(sum(s.net_value),0)::numeric as v,coalesce(sum(s.units),0)::numeric as u
  from sales s join accounts a on a.id=s.account_id join products p on p.id=s.product_id cross join g
  where (s.account_id=g.account_id or a.parent_id=g.account_id)
  and s.invoice_date between greatest(p_from,g.starts) and least(p_to,g.ends)
  and (g.category is null or lower(p.category)=lower(g.category))),
 m as (select q.v,q.u,case when g.rate_type='per_unit' then q.u else q.v end as measure,g.kind,g.baseline,g.rate_type from q cross join g),
 cur as (select t.rate from rebate_tiers t cross join m where t.agreement_id=p_agreement and t.threshold<=m.measure order by t.threshold desc limit 1),
 nxt as (select t.threshold,t.rate from rebate_tiers t cross join m where t.agreement_id=p_agreement and t.threshold>m.measure order by t.threshold limit 1)
 select m.v,m.u,m.measure,coalesce((select rate from cur),0),(select threshold from nxt),(select rate from nxt),
  round(case when m.kind='growth' then greatest(m.measure-coalesce(m.baseline,0),0) else m.measure end
   *coalesce((select rate from cur),0)/case when m.rate_type='percent' then 100 else 1 end,2)
 from m
$$;

-- Every settlement period of every live agreement: calendar months, calendar quarters, or the whole term.
create view agreement_periods as
 select g.id as agreement_id,greatest(ps::date,g.starts) as period_start,
  case when g.period='term' then g.ends else least((ps+case g.period when 'monthly' then interval '1 month' else interval '3 months' end)::date-1,g.ends) end as period_end
 from agreements g cross join lateral generate_series(
  case when g.period='term' then g.starts::timestamp else date_trunc(case g.period when 'monthly' then 'month' else 'quarter' end,g.starts::timestamp) end,
  g.ends::timestamp,
  case g.period when 'monthly' then interval '1 month' when 'quarterly' then interval '3 months' else interval '1000 years' end) ps
 where g.state<>'draft';

create view tier_progress as
 select g.id,a.name as account,g.name as agreement,case a.country when 'AU' then 'AUD' else 'NZD' end as currency,g.rate_type,
  p.period_start,p.period_end,p.period_end-current_date as days_left,c.measure,c.rate,c.rebate as earned_to_date,
  c.next_threshold,c.next_rate,c.next_threshold-c.measure as gap_to_next,
  round(c.measure*(p.period_end-p.period_start+1)/greatest(current_date-p.period_start,1),2) as projected
 from agreements g join accounts a on a.id=g.account_id
 join agreement_periods p on p.agreement_id=g.id and current_date between p.period_start and p.period_end
 cross join lateral rebate_calc(g.id,p.period_start,p.period_end) c where g.state='active';

create view to_calculate as
 select g.id as agreement_id,a.name as account,g.name as agreement,p.period_start,p.period_end,
  p.period_end+g.settle_within_days as settle_by,greatest(current_date-(p.period_end+g.settle_within_days),0) as days_late,c.rebate as estimate
 from agreement_periods p join agreements g on g.id=p.agreement_id join accounts a on a.id=g.account_id
 cross join lateral rebate_calc(g.id,p.period_start,p.period_end) c
 where p.period_end<current_date and not exists(select 1 from settlements s where s.agreement_id=g.id and s.period_start=p.period_start);

create view payout_queue as
 select s.id,a.name as account,g.name as agreement,s.period_start,s.period_end,s.total,s.state,s.calculated_by,s.approved_by,
  s.period_end+g.settle_within_days as settle_by,g.settlement_method
 from settlements s join agreements g on g.id=s.agreement_id join accounts a on a.id=g.account_id where s.state<>'paid';

-- What the business owes on rebates right now: settled but unpaid, ended but not yet
-- calculated, and earned so far in the open period. The month-end accrual.
create view accruals as
 select a.name as account,g.name as agreement,case a.country when 'AU' then 'AUD' else 'NZD' end as currency,
  coalesce((select sum(total) from settlements s where s.agreement_id=g.id and s.state<>'paid'),0) as settled_unpaid,
  coalesce((select sum(estimate) from to_calculate t where t.agreement_id=g.id),0) as not_yet_calculated,
  coalesce((select earned_to_date from tier_progress t where t.id=g.id),0) as open_period_to_date,
  coalesce((select sum(total) from settlements s where s.agreement_id=g.id and s.state<>'paid'),0)
  +coalesce((select sum(estimate) from to_calculate t where t.agreement_id=g.id),0)
  +coalesce((select earned_to_date from tier_progress t where t.id=g.id),0) as liability
 from agreements g join accounts a on a.id=g.account_id where g.state<>'draft';

create view unmatched_claims as
 select c.id,a.name as account,c.reference,c.claimed_on,c.amount,g.name as agreement,c.period_start,s.total as settled,
  case when c.agreement_id is null then 'No agreement covers this claim'
   when s.id is null then 'No settlement calculated for that period'
   when c.amount>s.total+1 then 'Claims more than the settlement'
   else 'Ready to match' end as finding,
  current_date-c.claimed_on as days_open
 from claims c join accounts a on a.id=c.account_id left join agreements g on g.id=c.agreement_id
 left join settlements s on s.agreement_id=c.agreement_id and s.period_start=c.period_start
 where c.state in ('open','disputed');

create view agreement_watch as
 select g.id,a.name as account,g.name as agreement,g.ends,g.review_date,
  concat_ws('; ',
   case when g.state='active' and g.ends<current_date then 'Ended but still marked active' end,
   case when g.state='active' and g.ends between current_date and current_date+60 then 'Ends within 60 days' end,
   case when g.review_date<=current_date+30 then 'Review due' end,
   case when g.signed_document is null and g.state<>'draft' then 'No signed terms on file' end,
   case when not exists(select 1 from rebate_tiers t where t.agreement_id=g.id) and g.state<>'draft' then 'No tiers set' end) as issue
 from agreements g join accounts a on a.id=g.account_id
 where g.state<>'ended' and ((g.state='active' and g.ends<=current_date+60) or g.review_date<=current_date+30 or (g.signed_document is null and g.state<>'draft')
  or (not exists(select 1 from rebate_tiers t where t.agreement_id=g.id) and g.state<>'draft'));

-- Rules with sources in docs/compliance.md. Prompts for a person to check, not legal advice.
create view compliance_gaps as
 select 'GROCERY-WRITTEN' as rule,a.name as account,g.name as record,'Grocery supply agreement has no signed written terms on file' as issue,
  case a.country when 'AU' then 'https://www.legislation.gov.au/F2024L01651/latest/text' else 'https://www.comcom.govt.nz/regulated-industries/grocery/grocery-supply-code/' end as source
 from agreements g join accounts a on a.id=g.account_id left join accounts p on p.id=a.parent_id
 where g.state<>'draft' and g.signed_document is null and (a.kind='grocery-retailer' or p.kind='grocery-retailer')
 union all
 select 'AU-ADJUSTMENT-NOTE',a.name,g.name||' '||s.period_start,
  case when s.paid_on+28<current_date then 'Rebate paid '||(current_date-s.paid_on)||' days ago with no adjustment note recorded' else 'Adjustment note due by '||(s.paid_on+28) end,
  'https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/in-detail/rules-for-specific-transactions/gst-and-rebates/making-an-adjustment-because-of-a-rebate'
 from settlements s join agreements g on g.id=s.agreement_id join accounts a on a.id=g.account_id
 where a.country='AU' and s.state='paid' and s.credit_note_ref is null and s.total*0.10>75
 union all
 select 'NZ-SUPPLY-CORRECTION',a.name,g.name||' '||s.period_start,'Rebate paid on terms not on file in writing and no supply correction information recorded',
  'https://www.ird.govt.nz/gst/tax-invoices-for-gst/credit-and-debit-notes'
 from settlements s join agreements g on g.id=s.agreement_id join accounts a on a.id=g.account_id
 where a.country='NZ' and s.state='paid' and s.credit_note_ref is null and g.signed_document is null;

revoke all on agreement_periods,tier_progress,to_calculate,payout_queue,accruals,unmatched_claims,agreement_watch,compliance_gaps from public;
