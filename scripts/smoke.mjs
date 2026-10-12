// npm test: a temporary database, migrate twice, seed twice, then every command.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {getDb,REPO_ROOT} from './lib/db.mjs';
import {migrate} from './migrate.mjs';
import {run,commands,reads} from './rebates.mjs';
import {parseCsv} from './lib/csv.mjs';
import {page,table as htmlTable} from './lib/render.mjs';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rebates-test-'));
process.env.DATA_DIR=path.join(temp,'db');process.env.OUTPUT_DIR=temp;
// Ignore real credentials; PostgreSQL CI supplies a disposable database.
process.env.DATABASE_URL=process.env.TEST_DATABASE_URL||'';
const db=await getDb(),seen=new Set();let rejections=0;
const call=async(cmd,...flags)=>{seen.add(cmd);return run(db,[cmd,...flags]);};
const fails=async(cmd,flags,pattern)=>{seen.add(cmd);await assert.rejects(()=>run(db,[cmd,...flags]),pattern);rejections++;};
const ben='--actor=Ben',aroha='--actor=Aroha';
const today=new Date().toISOString().slice(0,10);
try{
 if(db.mode==='postgres'){const [r]=await db.query("select count(*)::int as n from information_schema.tables where table_schema='public' and table_type='BASE TABLE'");assert.equal(r.n,0,'TEST_DATABASE_URL must point at a fresh empty database');}
 await migrate(db);assert.equal((await migrate(db)).ran.length,0);
 const seed=fs.readFileSync(path.join(REPO_ROOT,'supabase/seed.sql'),'utf8');await db.exec(seed);await db.exec(seed);
 for(const cmd of Object.keys(reads))assert.ok(Array.isArray(await call(cmd)),cmd);
 assert.equal((await call('help')).length,commands.length);
 assert.equal((await call('accounts')).length,6);
 assert.equal((await call('progress')).length,4);
 assert.equal((await call('to-calculate')).length,1);
 assert.equal((await call('payout-queue')).length,1);
 assert.deepEqual((await call('compliance')).map(r=>r.rule).sort(),['AU-ADJUSTMENT-NOTE','GROCERY-WRITTEN']);
 assert.equal((await call('quiet-accounts'))[0].account,'Coastal Fleet Services');
 assert.equal((await call('member-share')).length,2);
 assert.ok((await call('attention')).length>=6);

 // The calculation: a retrospective tier and a per-unit rate, checked by hand.
 const [paid]=await db.query("select * from settlements where state='paid' and agreement_id='c0000000-0000-0000-0000-000000000001'");
 const [check]=await db.query("select sum(s.net_value) as v from sales s join accounts a on a.id=s.account_id where a.parent_id='a0000000-0000-0000-0000-000000000001' and s.invoice_date between $1 and $2",[paid.period_start,paid.period_end]);
 assert.equal(Number(paid.measure),Number(check.v));
 const rate=Number(check.v)>=90000?3:Number(check.v)>=50000?2:1;assert.equal(Number(paid.rate),rate);
 assert.equal(Number(paid.calculated),Math.round(Number(check.v)*rate)/100);

 // Lookups: case-insensitive names, partial ids, ambiguity lists the candidates.
 assert.equal((await call('account','--account=northern motor trade group')).members.length,2);
 assert.equal((await call('agreement','--agreement=c0000000-0000-0000-0000-000000000003')).tiers.length,2);
 await fails('agreement',['--agreement=c0000000'],/ambiguous[\s\S]*c0000000-0000-0000-0000-000000000001/);
 await fails('account',['--account=Nobody'],/not found/);
 assert.ok((await call('search','--text=lubricant')).length>=2);
 const w=await call('what-if','--agreement=Northern volume rebate','--extra=100000');
 assert.equal(w.rate_with_extra,3);assert.ok(w.extra_rebate>0);
 await fails('what-if',['--agreement=Northern volume rebate','--extra=-5'],/at least 0/);

 // Bad input is refused before anything is written.
 await fails('calculate',['--agreement=Southern lubricants per litre','--period-start=2026-02-30',ben],/real YYYY/);
 await fails('calculate',['--agreement=Southern lubricants per litre',ben,'--typo=1','--period-start=2026-01-01'],/Unknown --typo/);
 await fails('calculate',['--agreement=Southern lubricants per litre','--period-start=1999-01-01'],/Required --actor/);
 await fails('calculate',['--agreement=Southern lubricants per litre','--period-start=1999-01-01',ben],/not the start of a settlement period/);
 const [open]=await db.query("select period_start from agreement_periods where agreement_id='c0000000-0000-0000-0000-000000000003' and current_date between period_start and period_end");
 await fails('calculate',['--agreement=Southern lubricants per litre',`--period-start=${open.period_start}`,ben],/Calculate it once it has ended/);

 // Calculate, adjust, approve (by someone else), pay, then the credit note.
 const due=(await call('to-calculate'))[0];
 const s=await call('calculate','--agreement=Southern lubricants per litre',`--period-start=${due.period_start}`,ben);
 assert.equal(Number(s.calculated),Number(due.estimate));
 await fails('calculate',['--agreement=Southern lubricants per litre',`--period-start=${due.period_start}`,ben],/duplicate|unique/i);
 await fails('approve',[`--settlement=${s.id}`,ben],/different person/);
 await call('adjust',`--settlement=${s.id}`,'--amount=-10','--reason=Returned stock credited',ben);
 await fails('adjust',[`--settlement=${s.id}`,'--amount=5',ben],/Required --reason/);
 await fails('pay',[`--settlement=${s.id}`,`--paid-on=${today}`,'--payment-ref=CN-2001',aroha],/Approve the settlement/);
 const ap=await call('approve',`--settlement=${s.id}`,aroha);assert.equal(Number(ap.total),Number(due.estimate)-10);
 await fails('adjust',[`--settlement=${s.id}`,'--amount=5','--reason=late',ben],/not yet approved/);
 await fails('credit-note',[`--settlement=${s.id}`,'--credit-note=CN-2001',ben],/once the rebate is paid/);
 await call('pay',`--settlement=${s.id}`,`--paid-on=${today}`,'--payment-ref=CN-2001','--credit-note=CN-2001',ben);
 assert.equal((await call('to-calculate')).length,0);

 // Claims: match the one that agrees, dispute the one that does not, refuse to match the rest.
 await call('match','--claim=NMTG-CLAIM-Q2',ben);
 await fails('match',['--claim=NMTG-CLAIM-Q2',ben],/already matched/);
 await fails('match',['--claim=HFM-DED-4471',ben],/No agreement covers/);
 assert.equal((await call('unmatched-claims')).find(c=>c.reference==='SLD-CLM-0611').finding,'Claims more than the settlement');
 await call('dispute','--claim=SLD-CLM-0611','--reason=Claimed 1450, settlement shows less',ben);
 await call('write-off','--claim=HFM-DED-4471','--reason=Agreed as one-off promotional support',aroha);
 assert.equal((await call('unmatched-claims')).length,1);

 // Compliance: the credit note clears the AU rule; an unsigned NZ payment raises the NZ one.
 const hfm=(await call('settlements')).find(x=>x.account==='Harbourside Fresh Markets');
 await call('credit-note',`--settlement=${hfm.id}`,'--credit-note=AN-3301',ben);
 assert.deepEqual((await call('compliance')).map(r=>r.rule),['GROCERY-WRITTEN']);
 const acct=await call('add','--type=account','--name=Test Trade Account','--kind=trade','--country=NZ',ben);
 await call('add','--type=account','--name=Test Member Store','--parent=Test Trade Account',ben);
 await call('add','--type=product','--code=TP-1','--name=Test product','--category=Lubricants',ben);
 const start=new Date(Date.UTC(new Date().getUTCFullYear(),new Date().getUTCMonth()-1,1)).toISOString().slice(0,10);
 const g=await call('add','--type=agreement','--name=Test monthly rebate','--account=Test Trade Account','--period=monthly',`--starts=${start}`,'--ends=2099-12-31','--owner=Ben',ben);
 await fails('add',['--type=agreement','--name=Bad growth','--account=Test Trade Account','--kind=growth',`--starts=${start}`,'--ends=2099-12-31','--owner=Ben',ben],/needs --baseline/);
 await call('add','--type=tier','--agreement=Test monthly rebate','--threshold=0','--rate=1.5',ben);
 await fails('add',['--type=tier','--agreement=Test monthly rebate','--threshold=0','--rate=2',ben],/duplicate|unique/i);
 await call('add','--type=sale','--account=Test Member Store','--product=TP-1','--invoice=T-1',`--date=${start}`,'--units=10','--value=$1,000',ben);
 await call('add','--type=claim','--account=Test Trade Account','--reference=T-CLAIM','--claimed-on='+today,'--amount=15','--agreement=Test monthly rebate',`--period-start=${start}`,ben);
 const ts=await call('calculate','--agreement=Test monthly rebate',`--period-start=${start}`,ben);assert.equal(Number(ts.calculated),15);
 await call('approve',`--settlement=${ts.id}`,aroha);
 await call('pay',`--settlement=${ts.id}`,`--paid-on=${today}`,'--payment-ref=EFT-1',ben);
 assert.ok((await call('compliance')).some(r=>r.rule==='NZ-SUPPLY-CORRECTION'));
 await call('match','--claim=T-CLAIM',ben);
 await call('log','--account=Test Trade Account','--note=Agreed terms by phone; signed copy to follow',ben);
 assert.equal((await call('account',`--account=${acct.id}`)).notes.length,1);
 assert.equal((await call('end-agreement','--agreement=Southern lubricants per litre',ben)).state,'ended');
 await fails('end-agreement',['--agreement=Southern lubricants per litre',ben],/already ended/);

 // Import from a Salesforce data export: dry run writes nothing, repeats skip, changes are refused.
 const ex=f=>path.join(REPO_ROOT,'examples/salesforce',f);
 const before=(await call('accounts')).length,hist=(await call('history')).length;
 assert.equal((await call('import','salesforce','--object=accounts',`--file=${ex('Account.csv')}`,ben,'--dry-run')).inserted,3);
 assert.equal((await call('accounts')).length,before);assert.equal((await call('history')).length,hist);
 await fails('import',['salesforce','--object=transactions',`--file=${ex('TransactionJournal.csv')}`,ben],/Import accounts first/);
 assert.equal((await call('import','salesforce','--object=accounts',`--file=${ex('Account.csv')}`,ben)).inserted,3);
 assert.equal((await call('account','--account=Waikato Auto Buying Group')).members.length,2);
 assert.equal((await call('import','salesforce','--object=products',`--file=${ex('Product2.csv')}`,ben)).inserted,2);
 assert.equal((await call('import','salesforce','--object=transactions',`--file=${ex('TransactionJournal.csv')}`,ben)).inserted,3);
 assert.equal((await call('import','salesforce','--object=transactions',`--file=${ex('TransactionJournal.csv')}`,ben)).skipped,3);
 const bad=path.join(temp,'bad.csv');
 fs.writeFileSync(bad,fs.readFileSync(ex('TransactionJournal.csv'),'utf8').replace('2340.00','2399.00'));
 await fails('import',['salesforce','--object=transactions',`--file=${bad}`,ben],/changed since the last import/);
 fs.writeFileSync(bad,'Id,Name,AccountId,ProductId,ActivityDate,Quantity,TransactionAmount\nNEW1,TJ-1,001DEMO00000002,01tDEMO00000001,2026-07-20,1,10\nNEW2,TJ-2,001DEMO00000002,01tDEMO00000001,not-a-date,1,10\n');
 const salesBefore=(await db.query('select count(*)::int as n from sales'))[0].n;
 await fails('import',['salesforce','--object=transactions',`--file=${bad}`,ben],/real YYYY/);
 assert.equal((await db.query('select count(*)::int as n from sales'))[0].n,salesBefore);
 fs.writeFileSync(bad,'Id,Invoice Number,AccountId,ProductId,Invoice Date,Quantity,Net Amount\nMAP1,INV-77,001DEMO00000003,01tDEMO00000001,2026-08-21,2,390\n');
 assert.equal((await call('import','salesforce','--object=transactions',`--file=${bad}`,ben,`--mapping=${path.join(REPO_ROOT,'examples/column-mapping.json')}`)).inserted,1);
 fs.writeFileSync(bad,'{"bogus":"x"}');await fails('import',['salesforce','--object=products',`--file=${ex('Product2.csv')}`,ben,`--mapping=${bad}`],/not a field/);
 assert.throws(()=>parseCsv('A,A\n1,2'),/unique/);assert.throws(()=>parseCsv('A,B\n1'),/expected/);assert.throws(()=>parseCsv('A\n"oops'),/unclosed/);

 // Drafts, backups, escaped HTML.
 for(const [cmd,flags] of [['weekly-review',[]],['month-end',[]],['draft-statement',[`--settlement=${s.id}`]],['draft-claim-reply',['--claim=SLD-CLM-0611']]]){
  const d=await call(cmd,...flags);assert.match(fs.readFileSync(d.file,'utf8'),/Nothing has been sent/);
 }
 assert.match(fs.readFileSync((await call('month-end')).file,'utf8'),/NZD \d+\.\d\d/);
 const exp=await call('export','--out=exports/backup.json');const backup=JSON.parse(fs.readFileSync(exp.file,'utf8'));
 assert.equal(Object.keys(backup.records).length,9);assert.ok(backup.records.history.length>10);
 await fails('export',['--out=exports/backup.json'],/EEXIST/);
 const html=page({title:'<script>x</script>',sections:[{title:'Rows',html:htmlTable([{name:'<script>x</script>'}])}]});assert.ok(!html.includes('<script>x'));
 assert.deepEqual(commands.filter(c=>!seen.has(c)),[],'every command exercised');
 await db.close();

 for(const file of ['view.mjs','docs.mjs']){const c=spawnSync(process.execPath,[path.join(REPO_ROOT,'scripts',file)],{env:process.env,encoding:'utf8',cwd:REPO_ROOT});assert.equal(c.status,0,c.stderr);}
 assert.ok(fs.existsSync(path.join(temp,'views/week.html')));
 assert.ok(fs.readdirSync(path.join(temp,'docs-out/rebate-statement')).length>=4);
 const amb=spawnSync(process.execPath,[path.join(REPO_ROOT,'scripts/rebates.mjs'),'agreement','--agreement=c0000000'],{env:process.env,encoding:'utf8'});
 assert.equal(amb.status,1);assert.match(amb.stderr,/ambiguous/);
 const json=spawnSync(process.execPath,[path.join(REPO_ROOT,'scripts/rebates.mjs'),'accruals','--json'],{env:process.env,encoding:'utf8'});
 assert.equal(json.status,0,json.stderr);assert.ok(JSON.parse(json.stdout).length>=5);
 console.log(`PASS: all ${commands.length} commands, ${rejections} refused inputs, the tier calculation checked by hand, approval by a second person, claim matching, three cited rules, atomic Salesforce import with repeats and mapping, drafts, backups, views and documents (${db.mode}, ${process.platform}).`);
}finally{try{await db.close();}catch{}fs.rmSync(temp,{recursive:true,force:true});}
