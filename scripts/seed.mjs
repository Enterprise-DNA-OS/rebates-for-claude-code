import {readFileSync} from 'node:fs';
import path from 'node:path';
import {getDb,REPO_ROOT} from './lib/db.mjs';
const db=await getDb();
try{await db.exec('BEGIN');await db.exec(readFileSync(path.join(REPO_ROOT,'supabase/seed.sql'),'utf8'));await db.exec('COMMIT');console.log('Seeded fictional accounts, agreements, sales, settlements and claims.');}
catch(e){await db.exec('ROLLBACK');throw e;}finally{await db.close();}
