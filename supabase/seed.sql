-- Fictional demo data. Dates move with today so the attention lists always have something to say.
insert into accounts(id,name,kind,parent_id,country,owner) values
 ('a0000000-0000-0000-0000-000000000001','Northern Motor Trade Group','buying-group',null,'NZ','Aroha'),
 ('a0000000-0000-0000-0000-000000000002','Albany Auto Spares','trade','a0000000-0000-0000-0000-000000000001','NZ','Aroha'),
 ('a0000000-0000-0000-0000-000000000003','Hamilton Motor Parts','trade','a0000000-0000-0000-0000-000000000001','NZ','Aroha'),
 ('a0000000-0000-0000-0000-000000000004','Harbourside Fresh Markets','grocery-retailer',null,'AU','Ben'),
 ('a0000000-0000-0000-0000-000000000005','Southern Lubricant Distributors','distributor',null,'NZ','Ben'),
 ('a0000000-0000-0000-0000-000000000006','Coastal Fleet Services','trade',null,'NZ','Aroha')
 on conflict do nothing;
insert into products(id,code,name,category) values
 ('b0000000-0000-0000-0000-000000000001','EO-5L','Engine oil 5L','Lubricants'),
 ('b0000000-0000-0000-0000-000000000002','GR-450','Grease cartridge 450g','Lubricants'),
 ('b0000000-0000-0000-0000-000000000003','CL-5L','Coolant 5L','Coolants'),
 ('b0000000-0000-0000-0000-000000000004','DA-1L','Diesel additive 1L','Additives')
 on conflict do nothing;
insert into agreements(id,name,account_id,kind,rate_type,period,starts,ends,baseline,category,settle_within_days,settlement_method,signed_document,review_date,owner) values
 ('c0000000-0000-0000-0000-000000000001','Northern volume rebate','a0000000-0000-0000-0000-000000000001','tiered','percent','quarterly',
  (date_trunc('quarter',current_date)-interval '6 months')::date,(date_trunc('quarter',current_date)+interval '18 months')::date-1,null,null,30,'statement','demo://agreements/northern-volume.pdf',current_date+120,'Aroha'),
 ('c0000000-0000-0000-0000-000000000002','Harbourside range support','a0000000-0000-0000-0000-000000000004','tiered','percent','quarterly',
  (date_trunc('quarter',current_date)-interval '3 months')::date,(date_trunc('quarter',current_date)+interval '9 months')::date-1,null,null,30,'credit-note',null,current_date-5,'Ben'),
 ('c0000000-0000-0000-0000-000000000003','Southern lubricants per litre','a0000000-0000-0000-0000-000000000005','tiered','per_unit','monthly',
  (date_trunc('month',current_date)-interval '2 months')::date,current_date+20,null,'Lubricants',7,'credit-note','demo://agreements/southern-lubricants.pdf',null,'Ben'),
 ('c0000000-0000-0000-0000-000000000004','Coastal growth incentive','a0000000-0000-0000-0000-000000000006','growth','percent','term',
  current_date-300,current_date+65,40000,null,30,'payment','demo://agreements/coastal-growth.pdf',current_date-3,'Aroha')
 on conflict do nothing;
insert into rebate_tiers(id,agreement_id,threshold,rate) values
 ('d0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001',0,1),
 ('d0000000-0000-0000-0000-000000000002','c0000000-0000-0000-0000-000000000001',50000,2),
 ('d0000000-0000-0000-0000-000000000003','c0000000-0000-0000-0000-000000000001',90000,3),
 ('d0000000-0000-0000-0000-000000000004','c0000000-0000-0000-0000-000000000002',0,2),
 ('d0000000-0000-0000-0000-000000000005','c0000000-0000-0000-0000-000000000002',40000,3.5),
 ('d0000000-0000-0000-0000-000000000006','c0000000-0000-0000-0000-000000000003',0,0.40),
 ('d0000000-0000-0000-0000-000000000007','c0000000-0000-0000-0000-000000000003',160,0.65),
 ('d0000000-0000-0000-0000-000000000008','c0000000-0000-0000-0000-000000000004',0,5)
 on conflict do nothing;
-- Weekly invoices: two buying group members, a grocery chain, a distributor and a fleet customer.
insert into sales(account_id,product_id,invoice_no,invoice_date,units,net_value,source_id)
select x.account_id::uuid,x.product_id::uuid,'INV-'||x.tag||'-'||to_char(d,'YYYYMMDD'),d::date,x.units+(extract(doy from d)::int%3)*x.step,
 round((x.units+(extract(doy from d)::int%3)*x.step)*x.price,2),'demo:'||x.tag||':'||to_char(d,'YYYYMMDD')
from (values
 ('a0000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000001','ALB',60,10,38.50),
 ('a0000000-0000-0000-0000-000000000003','b0000000-0000-0000-0000-000000000003','HAM',45,5,29.00),
 ('a0000000-0000-0000-0000-000000000004','b0000000-0000-0000-0000-000000000003','HFM',80,10,48.00),
 ('a0000000-0000-0000-0000-000000000005','b0000000-0000-0000-0000-000000000001','SLD',30,5,37.00),
 ('a0000000-0000-0000-0000-000000000005','b0000000-0000-0000-0000-000000000004','SLA',20,0,18.00),
 ('a0000000-0000-0000-0000-000000000006','b0000000-0000-0000-0000-000000000002','CFS',25,5,14.50)
) as x(account_id,product_id,tag,units,step,price)
cross join generate_series((date_trunc('quarter',current_date)-interval '6 months')::date,current_date-1,interval '7 days') d
where not (x.tag='CFS' and d>current_date-interval '50 days')
on conflict do nothing;
-- Two quarters settled for Northern (one paid, one waiting on payment), one for Harbourside
-- paid with no adjustment note, one month paid for Southern; last month not yet calculated.
insert into settlements(agreement_id,period_start,period_end,measure,rate,calculated,state,calculated_by,approved_by,approved_at,paid_on,payment_ref,credit_note_ref)
select g.agreement_id::uuid,g.ps,g.pe,c.measure,c.rate,c.rebate,g.state,'Ben',g.approver,case when g.approver is null then null else now() end,
 g.paid_on,g.payment_ref,g.credit_note
from (values
 ('c0000000-0000-0000-0000-000000000001',(date_trunc('quarter',current_date)-interval '6 months')::date,(date_trunc('quarter',current_date)-interval '3 months')::date-1,'paid','Aroha',(date_trunc('quarter',current_date)-interval '2 months')::date,'NMTG-STMT-Q1','CN-1041'),
 ('c0000000-0000-0000-0000-000000000001',(date_trunc('quarter',current_date)-interval '3 months')::date,date_trunc('quarter',current_date)::date-1,'approved','Aroha',null::date,null,null),
 ('c0000000-0000-0000-0000-000000000002',(date_trunc('quarter',current_date)-interval '3 months')::date,date_trunc('quarter',current_date)::date-1,'paid','Aroha',current_date-40,'EFT-88213',null),
 ('c0000000-0000-0000-0000-000000000003',(date_trunc('month',current_date)-interval '2 months')::date,(date_trunc('month',current_date)-interval '1 month')::date-1,'paid','Aroha',(date_trunc('month',current_date)-interval '1 month')::date+6,'CN-1058','CN-1058')
) as g(agreement_id,ps,pe,state,approver,paid_on,payment_ref,credit_note)
cross join lateral rebate_calc(g.agreement_id::uuid,g.ps,g.pe) c
on conflict do nothing;
insert into claims(id,account_id,agreement_id,reference,claimed_on,period_start,amount,note) values
 ('e0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','NMTG-CLAIM-Q2',current_date-9,(date_trunc('quarter',current_date)-interval '3 months')::date,1,'Group statement claim; amount set below'),
 ('e0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000004',null,'HFM-DED-4471',current_date-21,null,2750,'Deducted from remittance as promotional support'),
 ('e0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000005','c0000000-0000-0000-0000-000000000003','SLD-CLM-0611',current_date-4,(date_trunc('month',current_date)-interval '1 month')::date,1450,'Distributor claim for last month')
 on conflict do nothing;
-- The group's claim equals what was settled, so it is ready to match.
update claims c set amount=s.total from settlements s
 where c.id='e0000000-0000-0000-0000-000000000001' and c.amount=1 and s.agreement_id=c.agreement_id and s.period_start=c.period_start;
insert into notes(id,account_id,actor,body) values
 ('f0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000004','Ben','Harbourside asked for a 3.5% flat rate at renewal. Not agreed.')
 on conflict do nothing;
