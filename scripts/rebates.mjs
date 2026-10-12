#!/usr/bin/env node
// The one CLI. Every slash command in .claude/commands runs one of these.
//   npm run rebates -- <command> [--field=value ...] [--json]
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {getDb,REPO_ROOT} from './lib/db.mjs';
import {parseCsv,pick} from './lib/csv.mjs';
import {table} from './lib/format.mjs';

export const reads={
 'accounts':['List accounts and their buying groups','select a.id,a.name,a.kind,a.country,p.name as member_of,a.owner from accounts a left join accounts p on p.id=a.parent_id order by coalesce(p.name,a.name),a.parent_id nulls first,a.name'],
 'products':['List products and categories','select id,code,name,category from products order by category,code'],
 'agreements':['List rebate agreements and their terms',"select g.id,a.name as account,g.name,g.kind,g.rate_type,g.period,g.starts,g.ends,g.category,g.state,(select string_agg(t.threshold||' -> '||t.rate||case g.rate_type when 'percent' then '%' else '/unit' end,', ' order by t.threshold) from rebate_tiers t where t.agreement_id=g.id) as tiers from agreements g join accounts a on a.id=g.account_id order by g.state,a.name"],
 'progress':['Show where every live agreement sits in its tiers this period','select account,agreement,currency,period_end,days_left,measure,rate,earned_to_date,next_threshold,gap_to_next,projected from tier_progress order by account'],
 'near-tier':['Find customers close to the next tier, or on pace to reach it',"select account,agreement,days_left,measure,next_threshold,gap_to_next,projected,case when projected>=next_threshold then 'On pace' else 'Short at current pace' end as outlook from tier_progress where next_threshold is not null and (gap_to_next<=next_threshold*0.15 or projected>=next_threshold*0.85) order by gap_to_next/next_threshold"],
 'to-calculate':['List ended periods with no settlement yet','select * from to_calculate order by days_late desc,period_end'],
 'payout-queue':['List settlements waiting on approval or payment','select * from payout_queue order by settle_by'],
 'accruals':['Show the rebate liability to book at month end','select * from accruals order by liability desc'],
 'claims':['List every customer claim and deduction','select c.id,a.name as account,c.reference,c.claimed_on,c.amount,c.state,g.name as agreement,c.period_start,c.note from claims c join accounts a on a.id=c.account_id left join agreements g on g.id=c.agreement_id order by c.claimed_on desc'],
 'unmatched-claims':['Check open claims against what was calculated','select * from unmatched_claims order by days_open desc'],
 'settlements':['List settlements with who calculated, approved and paid them','select s.id,a.name as account,g.name as agreement,s.period_start,s.period_end,s.measure,s.rate,s.total,s.state,s.calculated_by,s.approved_by,s.paid_on,s.payment_ref,s.credit_note_ref from settlements s join agreements g on g.id=s.agreement_id join accounts a on a.id=g.account_id order by s.period_start desc,a.name'],
 'agreement-watch':['Agreements ending, due for review, unsigned or without tiers','select * from agreement_watch order by ends'],
 'compliance':['Check paid rebates and grocery agreements against the cited rules','select * from compliance_gaps order by rule,account'],
 'rebate-cost':['Rebates paid as a share of sales, last 12 months, by account',"select a.name as account,case a.country when 'AU' then 'AUD' else 'NZD' end as currency,coalesce(sum(s.total),0) as rebates_paid,(select coalesce(sum(x.net_value),0) from sales x join accounts y on y.id=x.account_id where (y.id=a.id or y.parent_id=a.id) and x.invoice_date>current_date-365) as sales,round(100*coalesce(sum(s.total),0)/nullif((select sum(x.net_value) from sales x join accounts y on y.id=x.account_id where (y.id=a.id or y.parent_id=a.id) and x.invoice_date>current_date-365),0),2) as pct_of_sales from accounts a join agreements g on g.account_id=a.id left join settlements s on s.agreement_id=g.id and s.state='paid' and s.paid_on>current_date-365 group by a.id,a.name,a.country order by pct_of_sales desc nulls last"],
 'member-share':['Show which member stores drive a buying group rebate this quarter',"select p.name as buying_group,a.name as member,sum(s.net_value) as sales_this_quarter,round(100*sum(s.net_value)/sum(sum(s.net_value)) over (partition by p.id),1) as pct_of_group from sales s join accounts a on a.id=s.account_id join accounts p on p.id=a.parent_id where s.invoice_date>=date_trunc('quarter',current_date) group by p.id,p.name,a.name order by p.name,sales_this_quarter desc"],
 'quiet-accounts':['Accounts on a live agreement with no sales in 30 days',"select a.name as account,g.name as agreement,(select max(s.invoice_date) from sales s join accounts y on y.id=s.account_id where y.id=a.id or y.parent_id=a.id) as last_sale from agreements g join accounts a on a.id=g.account_id where g.state='active' and coalesce((select max(s.invoice_date) from sales s join accounts y on y.id=s.account_id where y.id=a.id or y.parent_id=a.id),'1900-01-01')<current_date-30 order by last_sale nulls first"],
 'attention':['What needs doing: late calculations, unpaid settlements, claims, agreements and rule checks',"select 'calculate' as kind,account,agreement as item,'Settle by '||settle_by as detail from to_calculate union all select 'pay',account,agreement||' '||period_start,state||', settle by '||settle_by from payout_queue where settle_by<=current_date+7 union all select 'claim',account,reference,finding from unmatched_claims where finding<>'Ready to match' union all select 'agreement',account,agreement,issue from agreement_watch union all select 'rule',account,record,issue from compliance_gaps order by kind,account"],
 'history':['Read the last 100 changes and who made them','select * from history order by created_at desc,id limit 100']
};
export const usage={
 account:'--account=...',agreement:'--agreement=...',search:'--text=...',
 'what-if':'--agreement=... --extra=amount (extra sales value, or units for a per-unit agreement, this period)',
 add:'--type=account|product|agreement|tier|sale|claim --actor=... (fields: see README)',
 calculate:'--agreement=... --period-start=YYYY-MM-DD --actor=...',
 adjust:'--settlement=... --amount=... --reason=... --actor=...',
 approve:'--settlement=... --actor=... (must differ from who calculated it)',
 pay:'--settlement=... --paid-on=YYYY-MM-DD --payment-ref=... [--credit-note=...] --actor=...',
 'credit-note':'--settlement=... --credit-note=... --actor=...',
 match:'--claim=... --actor=...',
 dispute:'--claim=... --reason=... --actor=...',
 'write-off':'--claim=... --reason=... --actor=...',
 'end-agreement':'--agreement=... --actor=...',
 log:'--account=... --note=... --actor=...',
 import:'salesforce --object=accounts|products|transactions --file=export.csv --actor=... [--mapping=file.json] [--dry-run]',
 export:'--out=exports/backup.json',
 'weekly-review':'Write the Monday rebate review to drafts/',
 'month-end':'Write the month-end accrual journal draft to drafts/',
 'draft-statement':'--settlement=... (a rebate statement for the customer, to drafts/)',
 'draft-claim-reply':'--claim=... (a reply on a claim or deduction, to drafts/)',
 help:'Show commands'
};
export const commands=[...Object.keys(reads),...Object.keys(usage)];
const allowed={account:['account'],agreement:['agreement'],search:['text'],'what-if':['agreement','extra'],
 add:['type','name','kind','parent','country','owner','code','category','account','rate-type','period','starts','ends','baseline','settle-within-days','settlement-method','signed-document','review-date','agreement','threshold','rate','product','invoice','date','units','value','reference','claimed-on','period-start','amount','note','actor'],
 calculate:['agreement','period-start','actor'],adjust:['settlement','amount','reason','actor'],approve:['settlement','actor'],
 pay:['settlement','paid-on','payment-ref','credit-note','actor'],'credit-note':['settlement','credit-note','actor'],
 match:['claim','actor'],dispute:['claim','reason','actor'],'write-off':['claim','reason','actor'],'end-agreement':['agreement','actor'],
 log:['account','note','actor'],import:['object','file','actor','mapping','dry-run'],export:['out'],
 'draft-statement':['settlement'],'draft-claim-reply':['claim']};
const lookups={
 account:['accounts','name'],product:['products',"code||' '||name"],agreement:['agreements','name'],
 claim:['claims','reference'],settlement:['settlements',"(select name from agreements g where g.id=agreement_id)||' '||period_start"]
};
const allTables=['accounts','products','agreements','rebate_tiers','sales','settlements','claims','notes','history'];

function req(o,k){if(typeof o[k]!=='string'||!o[k].trim())throw Error(`Required --${k}`);return o[k].trim();}
function date(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)throw Error(`Expected a real YYYY-MM-DD date, got ${s}`);return s;}
function num(s,k,{min=-Infinity}={}){const n=Number(String(s).replace(/[$,\s]/g,''));if(String(s).trim()===''||!Number.isFinite(n)||n<min)throw Error(`--${k} must be a number${min>-Infinity?` of at least ${min}`:''}`);return n;}
function choice(s,a,k){if(!a.includes(s))throw Error(`--${k} must be one of: ${a.join(', ')}`);return s;}
function parse(args){const o={};for(const arg of args.filter(x=>x.startsWith('--'))){const i=arg.indexOf('='),k=arg.slice(2,i<0?undefined:i);if(k in o)throw Error(`Duplicate --${k}`);o[k]=i<0?true:arg.slice(i+1);}return o;}

// Exact name or id first, then a prefix. More than one match lists them and fails.
export async function resolve(db,type,value,lock=false){
 const [tableName,label]=lookups[type];
 let rows=await db.query(`select *,${label} as label from ${tableName} where lower(${label})=lower($1) or id::text=$1${type==='product'?' or lower(code)=lower($1)':''} order by 1${lock?' for update':''}`,[value]);
 if(!rows.length)rows=await db.query(`select *,${label} as label from ${tableName} where strpos(lower(${label}),lower($1))>0 or starts_with(id::text,lower($1)) order by 1${lock?' for update':''}`,[value]);
 if(rows.length!==1)throw Error(`${type} ${rows.length?'is ambiguous':'not found'}: ${value}\n${rows.map(r=>`  ${r.id}  ${r.label}`).join('\n')||`  Run the ${type==='settlement'?'settlements':type+'s'} command to see the list.`}`);
 return rows[0];
}
function render(rows){
 if(!Array.isArray(rows))return JSON.stringify(rows,null,2);
 if(!rows.length)return '  (none)';
 return table(rows,Object.keys(rows[0]).map(key=>({key,label:key,align:/^-?\d+(\.\d+)?$/.test(String(rows[0][key]??''))?'right':'left',format:v=>v&&typeof v==='object'?JSON.stringify(v):v})));
}
function draft(name,body){const dir=path.resolve(process.env.OUTPUT_DIR||REPO_ROOT,'drafts');fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,`${name}-${new Date().toISOString().slice(0,10)}-${randomUUID().slice(0,8)}.md`);fs.writeFileSync(file,body,{flag:'wx'});return {file};}
async function calc(db,agreementId,from,to){const [c]=await db.query('select * from rebate_calc($1,$2,$3)',[agreementId,from,to]);return c;}

const importers={
 accounts:{table:'accounts',fields:{source_id:['Id'],name:['Name'],parent:['ParentId'],country:['BillingCountry','Country'],kind:['Type']},required:['source_id','name']},
 products:{table:'products',fields:{source_id:['Id'],name:['Name'],code:['ProductCode','Code'],category:['Family','Category']},required:['source_id','name','code']},
 transactions:{table:'sales',fields:{source_id:['Id'],account:['AccountId'],product:['ProductId'],invoice:['Name','InvoiceNumber','OrderId'],date:['ActivityDate','JournalDate','TransactionDate'],units:['Quantity'],value:['TransactionAmount','Amount']},required:['source_id','account','product','date','value']}
};
const countryOf=v=>{const s=String(v||'').trim().toLowerCase();if(['au','aus','australia'].includes(s))return 'AU';if(['nz','nzl','new zealand'].includes(s)||!s)return 'NZ';throw Error(`Unknown country ${v}; this version handles NZ and AU`);};
const kindOf=v=>{const s=String(v||'').trim().toLowerCase().replace(/\s+/g,'-');return ['grocery-retailer','retailer','buying-group','distributor','trade'].includes(s)?s:'trade';};

async function importSalesforce(db,o){
 const spec=importers[choice(req(o,'object'),Object.keys(importers),'object')];
 const rows=parseCsv(fs.readFileSync(path.resolve(req(o,'file')),'utf8'));if(!rows.length)throw Error('No rows in that file');
 const mapping=o.mapping?JSON.parse(fs.readFileSync(path.resolve(o.mapping),'utf8')):{};
 for(const [k,v] of Object.entries(mapping))if(!(k in spec.fields)||typeof v!=='string'||!v.trim())throw Error(`Mapping key ${k} is not a field of ${o.object}: ${Object.keys(spec.fields).join(', ')}`);
 const seen=new Set();let inserted=0,skipped=0;const parents=[];
 for(const [i,src] of rows.entries()){
  const v=Object.fromEntries(Object.keys(spec.fields).map(k=>[k,pick(src,...(mapping[k]?[mapping[k]]:spec.fields[k])).trim()]));
  for(const k of spec.required)if(!v[k])throw Error(`Row ${i+2}: no ${k}. Map the heading with --mapping`);
  const sourceId=`salesforce:${v.source_id}`;if(seen.has(sourceId))throw Error(`Row ${i+2}: Id ${v.source_id} appears twice`);seen.add(sourceId);
  const [old]=await db.query(`select source_snapshot from ${spec.table} where source_id=$1`,[sourceId]);
  if(old){const snap=old.source_snapshot||{};if(Object.keys(snap).length!==Object.keys(src).length||Object.keys(src).some(k=>snap[k]!==src[k]))throw Error(`Row ${i+2}: ${v.source_id} changed since the last import. Reconcile it by hand; nothing was overwritten`);skipped++;continue;}
  if(o.object==='accounts'){
   await db.query('insert into accounts(name,kind,country,source_id,source_snapshot) values($1,$2,$3,$4,$5::jsonb)',[v.name,kindOf(v.kind),countryOf(v.country),sourceId,JSON.stringify(src)]);
   if(v.parent)parents.push([sourceId,`salesforce:${v.parent}`]);
  }else if(o.object==='products'){
   await db.query('insert into products(code,name,category,source_id,source_snapshot) values($1,$2,$3,$4,$5::jsonb)',[v.code,v.name,v.category,sourceId,JSON.stringify(src)]);
  }else{
   const [a]=await db.query('select id from accounts where source_id=$1',[`salesforce:${v.account}`]);if(!a)throw Error(`Row ${i+2}: account ${v.account} not imported yet. Import accounts first`);
   const [p]=await db.query('select id from products where source_id=$1',[`salesforce:${v.product}`]);if(!p)throw Error(`Row ${i+2}: product ${v.product} not imported yet. Import products first`);
   await db.query('insert into sales(account_id,product_id,invoice_no,invoice_date,units,net_value,source_id,source_snapshot) values($1,$2,$3,$4,$5,$6,$7,$8::jsonb)',[a.id,p.id,v.invoice||v.source_id,date(v.date.slice(0,10)),v.units?num(v.units,'units'):0,num(v.value,'value'),sourceId,JSON.stringify(src)]);
  }
  inserted++;
 }
 for(const [child,parent] of parents){const r=await db.query('update accounts c set parent_id=p.id from accounts p where c.source_id=$1 and p.source_id=$2 returning c.id',[child,parent]);if(!r.length)throw Error(`Parent account ${parent.slice(11)} is not in the import`);}
 return {object:o.object,inserted,skipped,dry_run:!!o['dry-run'],note:'Ids are kept as salesforce:<Id> so a repeat import skips what is already here. Rebate programs and benefit tiers are entered with add --type=agreement and add --type=tier, then checked with calculate on a past period.'};
}

export async function run(db,args){
 const cmd=args[0]||'help',o=parse(args.slice(1)),pos=args.slice(1).filter(x=>!x.startsWith('--'));
 if(!commands.includes(cmd))throw Error(`Unknown command: ${cmd}. Run help for the list`);
 for(const k of Object.keys(o))if(!['json',...(allowed[cmd]||[])].includes(k))throw Error(`Unknown --${k} for ${cmd}`);
 for(const k of ['json','dry-run'])if(k in o&&o[k]!==true)throw Error(`Use --${k} without a value`);
 if(pos.length&&!(cmd==='import'&&pos.length===1&&pos[0]==='salesforce'))throw Error('Unexpected argument. Use --field=value');
 if(reads[cmd])return db.query(reads[cmd][1]);
 if(cmd==='help')return commands.map(command=>({command,usage:reads[command]?.[0]||usage[command]}));
 if(cmd==='search')return db.query("select 'account' as kind,id,name from accounts where strpos(lower(name),lower($1))>0 union all select 'agreement',id,name from agreements where strpos(lower(name),lower($1))>0 union all select 'product',id,code||' '||name from products where strpos(lower(code||' '||name||' '||category),lower($1))>0 union all select 'claim',id,reference from claims where strpos(lower(reference||' '||note),lower($1))>0 order by kind,name",[req(o,'text')]);
 if(cmd==='account'){
  const a=await resolve(db,'account',req(o,'account'));delete a.label;
  return {account:a,members:await db.query('select id,name from accounts where parent_id=$1 order by name',[a.id]),
   agreements:await db.query('select id,name,state,starts,ends from agreements where account_id=$1 order by starts',[a.id]),
   claims:await db.query('select reference,claimed_on,amount,state from claims where account_id=$1 order by claimed_on desc',[a.id]),
   notes:await db.query('select actor,body,created_at from notes where account_id=$1 order by created_at desc',[a.id])};
 }
 if(cmd==='agreement'){
  const g=await resolve(db,'agreement',req(o,'agreement'));delete g.label;
  return {agreement:g,tiers:await db.query('select threshold,rate from rebate_tiers where agreement_id=$1 order by threshold',[g.id]),
   this_period:(await db.query('select period_start,period_end,measure,rate,earned_to_date,next_threshold,gap_to_next,projected from tier_progress where id=$1',[g.id]))[0]||null,
   settlements:await db.query('select id,period_start,period_end,total,state,paid_on from settlements where agreement_id=$1 order by period_start',[g.id])};
 }
 if(cmd==='what-if'){
  const g=await resolve(db,'agreement',req(o,'agreement'));const extra=num(req(o,'extra'),'extra',{min:0});
  const [p]=await db.query('select * from tier_progress where id=$1',[g.id]);if(!p)throw Error('That agreement has no open period today');
  const measure=Number(p.measure)+extra;const [t]=await db.query('select rate from rebate_tiers where agreement_id=$1 and threshold<=$2 order by threshold desc limit 1',[g.id,measure]);
  const rate=Number(t?.rate||0),base=g.kind==='growth'?Math.max(measure-Number(g.baseline),0):measure;
  const rebate=Math.round(base*rate/(g.rate_type==='percent'?100:1)*100)/100;
  return {agreement:g.name,measure_now:Number(p.measure),earned_now:Number(p.earned_to_date),measure_with_extra:measure,rate_with_extra:rate,rebate_with_extra:rebate,extra_rebate:Math.round((rebate-Number(p.earned_to_date))*100)/100};
 }
 if(cmd==='export'){
  const backup={format:'rebates-backup-v1',exported_at:new Date().toISOString(),records:{}};
  await db.exec('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');try{for(const t of allTables)backup.records[t]=await db.query(`select * from ${t} order by id`);await db.exec('COMMIT');}catch(e){await db.exec('ROLLBACK');throw e;}
  const file=path.resolve(process.env.OUTPUT_DIR||REPO_ROOT,req(o,'out'));fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(backup,null,2)+'\n',{flag:'wx'});
  return {file,counts:Object.fromEntries(Object.entries(backup.records).map(([k,v])=>[k,v.length]))};
 }
 if(cmd==='weekly-review'||cmd==='month-end'||cmd.startsWith('draft-')){
  let body=`# ${cmd}\n\nDRAFT. Check the figures before anyone sees this. Nothing has been sent.\n\n`;
  if(cmd==='weekly-review')for(const c of ['attention','near-tier','payout-queue','unmatched-claims'])body+=`## ${c}\n\n${render(await run(db,[c]))}\n\n`;
  else if(cmd==='month-end'){
   const rows=await run(db,['accruals']);const totals={};for(const r of rows)totals[r.currency]=(totals[r.currency]||0)+Number(r.liability);
   body+=`Rebate accrual at ${new Date().toISOString().slice(0,10)}. Book the movement against last month's balance in your accounts.\n\n${render(rows)}\n\n## Totals\n\n${Object.entries(totals).map(([c,v])=>`- ${c} ${v.toFixed(2)}`).join('\n')}\n\nSuggested journal: debit rebates (contra revenue), credit rebate accrual, for the movement in each currency.\n`;
  }else if(cmd==='draft-statement'){
   const s=await resolve(db,'settlement',req(o,'settlement'));const [d]=await db.query('select g.name as agreement,g.rate_type,a.name as account,a.country from agreements g join accounts a on a.id=g.account_id where g.id=$1',[s.agreement_id]);
   const cur=d.country==='AU'?'AUD':'NZD';
   body+=`To: ${d.account}\nSubject: Rebate statement, ${d.agreement}, ${s.period_start} to ${s.period_end}\n\nQualifying ${d.rate_type==='percent'?'sales':'units'}: ${s.measure}\nRate applied: ${s.rate}${d.rate_type==='percent'?'%':' per unit'}\nCalculated rebate: ${cur} ${s.calculated}\n${Number(s.adjustment)?`Adjustment: ${cur} ${s.adjustment} (${s.adjustment_reason})\n`:''}Rebate due: ${cur} ${s.total} excluding GST\nStatus: ${s.state}${s.payment_ref?`, reference ${s.payment_ref}`:''}\n`;
  }else{
   const c=await resolve(db,'claim',req(o,'claim'));const [u]=await db.query('select * from unmatched_claims where id=$1',[c.id]);const [a]=await db.query('select name from accounts where id=$1',[c.account_id]);
   body+=`To: ${a.name}\nSubject: Your claim ${c.reference}\n\nWe have your claim ${c.reference} for ${c.amount}, dated ${c.claimed_on}.\n\n${u?`What our records show: ${u.finding}.${u.settled?` Our settlement for that period is ${u.settled}.`:''}`:`This claim is ${c.state}.`}\n\nPlease send the agreement or promotion reference this claim relates to, so we can match it.\n`;
  }
  return draft(cmd,body);
 }

 const actor=req(o,'actor');await db.exec('BEGIN');
 try{
  let row,result;
  if(cmd==='add'){
   const type=choice(req(o,'type'),['account','product','agreement','tier','sale','claim'],'type');let t,f;
   if(type==='account'){t='accounts';f={name:req(o,'name'),kind:choice(o.kind||'trade',['grocery-retailer','retailer','buying-group','distributor','trade'],'kind'),country:choice(o.country||'NZ',['NZ','AU'],'country'),owner:o.owner||''};if(o.parent)f.parent_id=(await resolve(db,'account',o.parent)).id;}
   else if(type==='product'){t='products';f={code:req(o,'code'),name:req(o,'name'),category:o.category||''};}
   else if(type==='agreement'){t='agreements';f={name:req(o,'name'),account_id:(await resolve(db,'account',req(o,'account'))).id,kind:choice(o.kind||'tiered',['tiered','growth'],'kind'),rate_type:choice(o['rate-type']||'percent',['percent','per_unit'],'rate-type'),period:choice(o.period||'quarterly',['monthly','quarterly','term'],'period'),starts:date(req(o,'starts')),ends:date(req(o,'ends')),owner:req(o,'owner'),settlement_method:choice(o['settlement-method']||'credit-note',['credit-note','payment','statement'],'settlement-method'),state:'active'};
    if(o.baseline)f.baseline=num(o.baseline,'baseline',{min:0});if(f.kind==='growth'&&f.baseline===undefined)throw Error('A growth agreement needs --baseline');
    if(o.category)f.category=o.category;if(o['settle-within-days'])f.settle_within_days=num(o['settle-within-days'],'settle-within-days',{min:0});if(o['signed-document'])f.signed_document=o['signed-document'];if(o['review-date'])f.review_date=date(o['review-date']);}
   else if(type==='tier'){t='rebate_tiers';f={agreement_id:(await resolve(db,'agreement',req(o,'agreement'))).id,threshold:num(req(o,'threshold'),'threshold',{min:0}),rate:num(req(o,'rate'),'rate',{min:0.0001})};}
   else if(type==='sale'){t='sales';f={account_id:(await resolve(db,'account',req(o,'account'))).id,product_id:(await resolve(db,'product',req(o,'product'))).id,invoice_no:req(o,'invoice'),invoice_date:date(req(o,'date')),units:o.units?num(o.units,'units'):0,net_value:num(req(o,'value'),'value')};}
   else{t='claims';f={account_id:(await resolve(db,'account',req(o,'account'))).id,reference:req(o,'reference'),claimed_on:date(req(o,'claimed-on')),amount:num(req(o,'amount'),'amount',{min:0.01}),note:o.note||''};
    if(o.agreement){f.agreement_id=(await resolve(db,'agreement',o.agreement)).id;f.period_start=date(req(o,'period-start'));}}
   const k=Object.keys(f);[row]=await db.query(`insert into ${t}(${k.join(',')}) values(${k.map((_,i)=>'$'+(i+1)).join(',')}) returning *`,Object.values(f));
  }else if(cmd==='calculate'){
   const g=await resolve(db,'agreement',req(o,'agreement'),true);const start=date(req(o,'period-start'));
   const [p]=await db.query('select * from agreement_periods where agreement_id=$1 and period_start=$2',[g.id,start]);
   if(!p)throw Error(`${start} is not the start of a settlement period for ${g.name}. Periods: ${(await db.query('select period_start from agreement_periods where agreement_id=$1 order by 1',[g.id])).map(r=>r.period_start).join(', ')}`);
   if(p.period_end>=new Date().toISOString().slice(0,10))throw Error(`That period runs to ${p.period_end}. Calculate it once it has ended`);
   const c=await calc(db,g.id,p.period_start,p.period_end);
   [row]=await db.query('insert into settlements(agreement_id,period_start,period_end,measure,rate,calculated,calculated_by) values($1,$2,$3,$4,$5,$6,$7) returning *',[g.id,p.period_start,p.period_end,c.measure,c.rate,c.rebate,actor]);
  }else if(['adjust','approve','pay','credit-note'].includes(cmd)){
   const s=await resolve(db,'settlement',req(o,'settlement'),true);
   if(cmd==='adjust'){if(s.state!=='calculated')throw Error('Only a settlement not yet approved can be adjusted');[row]=await db.query('update settlements set adjustment=adjustment+$2::numeric,adjustment_reason=concat_ws($4::text,adjustment_reason,$3::text) where id=$1 returning *',[s.id,num(req(o,'amount'),'amount'),req(o,'reason'),'; ']);}
   else if(cmd==='approve'){if(s.state!=='calculated')throw Error(`Settlement is already ${s.state}`);if(s.calculated_by.toLowerCase()===actor.toLowerCase())throw Error('The approver must be a different person from whoever calculated it');[row]=await db.query("update settlements set state='approved',approved_by=$2,approved_at=now() where id=$1 returning *",[s.id,actor]);}
   else if(cmd==='pay'){if(s.state!=='approved')throw Error('Approve the settlement before recording payment');[row]=await db.query("update settlements set state='paid',paid_on=$2,payment_ref=$3,credit_note_ref=$4 where id=$1 returning *",[s.id,date(req(o,'paid-on')),req(o,'payment-ref'),o['credit-note']||null]);}
   else{if(s.state!=='paid')throw Error('Record the credit or adjustment note once the rebate is paid');[row]=await db.query('update settlements set credit_note_ref=$2 where id=$1 returning *',[s.id,req(o,'credit-note')]);}
  }else if(['match','dispute','write-off'].includes(cmd)){
   const c=await resolve(db,'claim',req(o,'claim'),true);if(!['open','disputed'].includes(c.state))throw Error(`Claim is already ${c.state}`);
   if(cmd==='match'){const [u]=await db.query('select * from unmatched_claims where id=$1',[c.id]);if(u.finding!=='Ready to match')throw Error(`Cannot match: ${u.finding}`);const [s]=await db.query('select id from settlements where agreement_id=$1 and period_start=$2',[c.agreement_id,c.period_start]);[row]=await db.query("update claims set state='matched',settlement_id=$2,resolved_by=$3 where id=$1 returning *",[c.id,s.id,actor]);}
   else [row]=await db.query('update claims set state=$2,note=concat_ws($4::text,nullif(note,\'\'),$3::text),resolved_by=$5 where id=$1 returning *',[c.id,cmd==='dispute'?'disputed':'written-off',req(o,'reason'),' | ',actor]);
  }else if(cmd==='end-agreement'){
   const g=await resolve(db,'agreement',req(o,'agreement'),true);if(g.state==='ended')throw Error('Agreement already ended');
   const [open]=await db.query("select count(*)::int as n from to_calculate where agreement_id=$1",[g.id]);if(open.n)throw Error(`Calculate the ${open.n} ended period(s) first`);
   [row]=await db.query("update agreements set state='ended' where id=$1 returning *",[g.id]);
  }else if(cmd==='log'){
   const a=await resolve(db,'account',req(o,'account'));[row]=await db.query('insert into notes(account_id,actor,body) values($1,$2,$3) returning *',[a.id,actor,req(o,'note')]);
  }else if(cmd==='import'){
   if(pos[0]!=='salesforce')throw Error('Use: import salesforce --object=accounts|products|transactions --file=...');result=await importSalesforce(db,o);
  }
  if(row)delete row.label;
  await db.query('insert into history(actor,operation,record_id,detail) values($1,$2,$3,$4::jsonb)',[actor,cmd,row?.id||null,JSON.stringify(result||row)]);
  await db.exec(o['dry-run']?'ROLLBACK':'COMMIT');return result||row;
 }catch(e){await db.exec('ROLLBACK');throw e;}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 let db;try{db=await getDb();const data=await run(db,process.argv.slice(2));console.log(process.argv.includes('--json')?JSON.stringify(data,null,2):render(data));}
 catch(e){console.error(e.message);process.exitCode=1;}finally{if(db)await db.close();}
}
