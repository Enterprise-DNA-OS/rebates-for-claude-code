# Rebates for Claude Code: operating instructions

This file is the brain. Claude Code reads it at the start of every session. It says who this is for, how work gets done, and the one right way to do each recurring job.

## Who this is for

- **Business:** [YOUR BUSINESS]
- **Operator:** [YOUR NAME], [your role]
- **What matters most:** [the one or two outcomes you care about]

Fill this in once. A worker with context knows. A worker without it guesses.

## How to work

1. **Take a brief, not a script.** The operator describes the outcome. You run the right command and present the answer.
2. **Read before you write.** Before drafting anything about a record, read its full history first.
3. **Plain language.** Short sentences. No filler. Numbers in tables.
4. **Silent success, loud problems.** No play-by-play. Say what broke and what you did about it.
5. **Stop at the line.** Anything that sends, deletes, or faces a customer waits for a yes in this session.

## Routing table: one right way for each recurring job

| When the operator asks for... | Use this |
|---|---|
| What needs doing | `/attention` |
| Tier progress this period | `/progress` |
| Who is close to the next tier | `/near-tier` |
| What more sales would earn | `/what-if` |
| Periods to calculate | `/to-calculate then /calculate` |
| Approve or pay a rebate | `/approve, /pay, /credit-note` |
| What we owe on rebates, month end | `/accruals, /month-end` |
| Claims and deductions | `/unmatched-claims, then /match, /dispute or /write-off` |
| Agreements ending or unsigned | `/agreement-watch` |
| Rule checks | `/compliance` |
| Rebate cost by account | `/rebate-cost` |
| Buying group members | `/member-share` |
| Accounts gone quiet | `/quiet-accounts` |
| The Monday review | `/weekly-review` |
| A statement for a customer | `/draft-statement` |
| Reply to a claim | `/draft-claim-reply` |
| Add a record | `/add` |
| Bring Salesforce data across | `/import` |
| Back up | `/export` |
| Change how it works | `/customise` |
| A new report | `/new-view` |

If an ask fits nothing here, run the CLI directly (`npm run <cli> -- --help`) and then propose a new command for it.

## Hard rules

- Never send email or messages from here. Draft to `drafts/`, a person sends.
- Never delete records without an explicit yes in this session. Prefer marking closed or archived.
- Never invent a record. If a name is ambiguous, list the candidates and ask.
- The database is the source of truth. If the answer is not in it, say so.

## Rebate rules

- Amounts exclude GST and are in the account's currency (NZD for NZ, AUD for AU). Never add NZD to AUD.
- A settlement is approved by a different person from whoever calculated it. Never approve on the operator's behalf with someone else's name.
- Never calculate a period that has not ended. Never change a rate or tier without the signed terms or the operator's say-so.
- A claim is matched only when it agrees with the settlement. A deduction with no agreement behind it is raised with the customer, not written off quietly.
- Read docs/compliance.md before reporting rule checks. They are prompts, not legal or tax advice.
- The demo data is fictional. Never present it as real.

## Where things live

- `scripts/` the CLI. `scripts/lib/db.mjs` picks `DATABASE_URL` (Postgres, Supabase) or the embedded database in `.data/`.
- `supabase/migrations/` the schema, plain SQL. `npm run migrate` applies it.
- `.claude/commands/` the slash commands. Add one every time the same ask comes twice.
- `docs/` the thesis and the guide for moving off Salesforce Rebate Management.

Built by Enterprise DNA. Installed and run for you as part of Omni: https://enterprisedna.co/omni/instead-of/salesforce-rebate-management
