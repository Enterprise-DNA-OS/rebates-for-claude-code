<h1 align="center">Rebates for Claude Code</h1>

<p align="center">
  <strong>The open-source rebate system that is just a database and Claude Code.</strong>
</p>

<p align="center">
  Created by <a href="https://www.enterprisedna.co"><strong>Enterprise DNA</strong></a>. Free and open source. Works with Claude Code, Codex, OpenCode or Cursor.
</p>

<!-- three-doors -->
<table align="center">
  <tr>
    <td align="center"><strong>Do it yourself</strong><br/>Clone it, run it, own it. Free, MIT.<br/><a href="#quick-start">Quick start</a></td>
    <td align="center"><strong>We customise it</strong><br/>Your fields, your rules, your Salesforce Rebate Management data brought across.<br/><a href="https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=salesforce-rebate-management">Book a call</a></td>
    <td align="center"><strong>We run it for you</strong><br/>Installed, connected and operated inside Omni. Setup fee, then a retainer.<br/><a href="https://enterprisedna.co/omni/instead-of/salesforce-rebate-management?utm_source=github&utm_medium=readme&utm_campaign=salesforce-rebate-management">How it works</a></td>
  </tr>
</table>

<p align="center">
  <a href="#what-is-this">What is this</a> &bull;
  <a href="#why-no-front-end">Why no front end</a> &bull;
  <a href="#quick-start">Quick start</a> &bull;
  <a href="#the-commands">Commands</a> &bull;
  <a href="#instead-of-salesforce-rebate-management">Instead of Salesforce Rebate Management</a> &bull;
  <a href="#want-it-installed-and-run-for-you">Installed for you</a> &bull;
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node-20+-339933?style=flat-square" alt="Node 20+" />
  <img src="https://img.shields.io/badge/PostgreSQL-any-336791?style=flat-square" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/PGlite-embedded-3ecf8e?style=flat-square" alt="PGlite" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="MIT License" />
</p>

---

## What is this

Rebates for Claude Code does the job you pay Salesforce Rebate Management for, as a Postgres database and a set of agent commands. There is no web front end. You open the folder in [Claude Code](https://claude.com/claude-code) (or Codex, OpenCode, Cursor: see `AGENTS.md`) and ask for what you want in plain language. It runs the right query, and it can answer questions the Salesforce Rebate Management dashboard cannot.

Salesforce lists Rebate Management for Manufacturing Cloud at AU$14,000 per org per month, billed annually: AU$168,000 a year at list, and it requires 10 or more Manufacturing Cloud licences on top ([Salesforce AU pricing](https://www.salesforce.com/au/manufacturing/rebate-management-software/pricing/), checked 12 October 2026).

Want the same thing with a web front end, or built on a different stack? That is a customisation, and it is exactly what Enterprise DNA does: [book a call](https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=salesforce-rebate-management).

It is for suppliers in New Zealand and Australia who pay rebates to the people who buy from them: buying groups and their member stores, grocery chains, distributors and trade accounts. It holds the agreements and their tiers, calculates each period's rebate from your sales, keeps the month-end accrual, puts every settlement through a second person before it is paid, and checks customer claims and deductions against what was actually earned.

```
$ npm run rebates -- attention
  kind       account                          item                                  detail
  ---------  -------------------------------  ------------------------------------  ------------------------------------------------------------
  agreement  Harbourside Fresh Markets        Harbourside range support             Review due; No signed terms on file
  calculate  Southern Lubricant Distributors  Southern lubricants per litre         Settle by 2026-10-07
  claim      Harbourside Fresh Markets        HFM-DED-4471                          No agreement covers this claim
  rule       Harbourside Fresh Markets        Harbourside range support 2026-07-01  Rebate paid 40 days ago with no adjustment note recorded
```

(Fictional demo data. Trimmed.)

## Why no front end

- The front end was only ever there because the database was hard to talk to. That is no longer true.
- Your data sits in plain Postgres tables you own. Any tool can read them. No export, no lock-in.
- No seats, no tiers, no add-ons. Read [docs/why-no-front-end.md](docs/why-no-front-end.md) for the honest trade-offs too.

## Quick start

Sixty seconds, no database install (an embedded Postgres runs inside Node):

```bash
git clone https://github.com/Enterprise-DNA-OS/rebates-for-claude-code.git
cd rebates-for-claude-code
npm install
npm run demo
```

Then open the folder in Claude Code and type `/attention`, or ask "which customers are close to their next rebate tier?"

### Use it with your own Postgres or Supabase

Copy `.env.example` to `.env`, set `DATABASE_URL`, then `npm run migrate`. Same commands, shared data, no per-seat fee.

## The commands

| Command | What it does |
|---|---|
| `/attention` | Everything that needs doing: periods to calculate, settlements to pay, claims, agreements, rule checks |
| `/progress` | Where every agreement sits in its tiers this period, earned to date, gap to the next tier, projected total |
| `/near-tier` | Customers close to the next tier, or on pace for it: the list for the next sales call |
| `/what-if` | What extra sales would earn at the next tier |
| `/to-calculate` | Periods that have ended with no settlement, and how late they are |
| `/calculate` | Calculate an ended period from the sales |
| `/adjust` | Add a manual adjustment with a reason, before approval |
| `/approve` | Approve a settlement (a different person from whoever calculated it) |
| `/pay` | Record payment, with the payment and credit note references |
| `/payout-queue` | Settlements waiting on approval or payment |
| `/accruals` | The rebate liability to book at month end, by currency |
| `/month-end` | Draft the month-end accrual journal |
| `/claims` | Every customer claim and deduction |
| `/unmatched-claims` | Open claims checked against what was calculated |
| `/match`, `/dispute`, `/write-off` | Resolve a claim |
| `/agreement-watch` | Agreements ending, due for review, unsigned or without tiers |
| `/compliance` | Paid rebates and grocery agreements against the cited rules |
| `/rebate-cost` | Rebates paid as a share of each account's sales, last 12 months |
| `/member-share` | Which member stores drive a buying group's rebate |
| `/quiet-accounts` | Accounts on a live agreement with no sales in 30 days |
| `/weekly-review` | The Monday review, drafted from four commands |
| `/draft-statement` | A rebate statement for the customer, to drafts/ |
| `/draft-claim-reply` | A reply on a claim or deduction, to drafts/ |
| `/accounts`, `/account`, `/agreements`, `/agreement`, `/products`, `/settlements`, `/search`, `/history` | Read the records |
| `/add`, `/credit-note`, `/end-agreement`, `/log` | Add accounts, products, agreements, tiers, sales and claims; record notes |
| `/import` | Bring accounts, products and sales across from a Salesforce data export |
| `/export` | Back up every record to one JSON file |
| `/customise` | Change a field, a rule or a document in plain language |
| `/new-view` | Add a read-only HTML view |

Every command runs `npm run rebates -- <command>` underneath, with `--json` for machines. Names match without case; a partial id works; an ambiguous name lists the candidates and exits 1. Every write needs `--actor` (a name for the history, not a login). Nothing here sends anything.

## How a rebate is calculated

- **Qualifying sales** are the agreement account's own sales plus those of its member stores (a buying group), inside the period and the agreement's dates, limited to one product category if the agreement sets one. Amounts exclude GST.
- **Tiers are retrospective.** The highest tier reached sets the rate for every qualifying dollar (`percent`) or unit (`per_unit`).
- **Growth agreements** pay that rate only on the amount above the baseline.
- **Periods** are calendar months, calendar quarters, or the whole term.

Stepped tiers, caps, product exclusions and anything else your agreements say: ask for it with `/customise`.

## Ten questions your rebate records answer

Each one runs today on the demo data. Salesforce has its own reports; these are answered from records you own, in plain language, without building one.

1. Which customers are on pace to miss their next tier this quarter? `near-tier`
2. What would another $20,000 of sales earn this customer? `what-if`
3. What do we owe on rebates today, across every agreement, for the month-end journal? `accruals`
4. Which claims and deductions have no agreement behind them? `unmatched-claims`
5. Which customer claimed more than we calculated? `unmatched-claims`
6. Which member stores drive the buying group's rebate? `member-share`
7. Which accounts cost us the most in rebates for what they buy? `rebate-cost`
8. Which accounts on a live agreement have stopped buying? `quiet-accounts`
9. Which grocery agreements have no signed terms on file? `compliance`
10. Which Australian rebates were paid without an adjustment note? `compliance`

## Your first hour: ten things to ask for

1. Put our name and logo on the rebate statement (`brand.json`).
2. Import our accounts, products and last year's sales from the Salesforce export, as a test run first.
3. Add our three biggest rebate programs and their tiers.
4. Calculate last quarter for each and compare with what Salesforce paid.
5. Show which customers are close to their next tier.
6. Draft the month-end accrual.
7. Check every open claim against what we calculated.
8. Our quarters run July to June: change the periods.
9. Exclude freight lines from qualifying sales.
10. Draft the Monday rebate review.

## Instead of Salesforce Rebate Management

Export Account, Product2 and TransactionJournal from Salesforce Data Export, then:

```bash
npm run rebates -- import salesforce --object=accounts --file=export/Account.csv --actor="Your name" --dry-run
```

Dry-run first, then accounts, products and transactions for real. Programs and tiers are re-entered (most suppliers have a handful) and proved by calculating a period Salesforce already paid. The full guide, with what maps and what does not: [docs/replace-salesforce-rebate-management.md](docs/replace-salesforce-rebate-management.md).

## Documents, views and the rules

- `npm run docs` renders a rebate statement for every settlement and a schedule for every agreement into `docs-out/`, in your brand.
- `npm run view` renders the rebate week and the month-end accrual into `views/`.
- `/compliance` checks the Grocery Supply Code (NZ) and Food and Grocery Code (AU) written-agreement rules, ATO adjustment notes and IRD supply correction information. Sources and limits: [docs/compliance.md](docs/compliance.md). Not legal or tax advice.

## Validation

`npm test` builds a temporary database and runs every command: the tier calculation checked by hand, second-person approval, claim matching, the three rules, an atomic Salesforce import with repeats, changes and mapping, drafts, backups and escaped HTML. CI runs it on Linux and Windows, Node 20 and 22, and on PostgreSQL 17.

## Architecture

```
rebates-for-claude-code/
  CLAUDE.md                 how the operator wants this run (routing table + house rules)
  AGENTS.md                 the same, for Codex / OpenCode / Cursor / Gemini CLI
  .claude/commands/         the slash commands
  scripts/                  the CLI the commands drive
  scripts/lib/db.mjs        one adapter: DATABASE_URL (pg) or embedded PGlite
  supabase/migrations/      plain SQL schema
  supabase/seed.sql         demo data
  docs/                     the thesis and the migration guide
```

## Built for coding agents

The database, CLI and command recipes work with Claude Code, Codex, OpenCode or Cursor. Ask your coding agent for a new command and have it implement and test the change against the same records.

## Contributing

Issues and pull requests are welcome. Keep the shape: plain SQL, a small CLI, a slash command per recurring job, no front end.

## Want it installed and run for you?

Enterprise DNA installs Rebates for Claude Code for your business, migrates your Salesforce Rebate Management data, connects it to the rest of your tools, and runs it for you as part of **Omni**, our managed Command Center. One setup fee, then a monthly retainer.

- Book a call: [enterprisedna.co/omni/book](https://enterprisedna.co/omni/book/?offer=replace-software&utm_source=github&utm_medium=readme&utm_campaign=salesforce-rebate-management)
- Read more: [enterprisedna.co/omni/instead-of/salesforce-rebate-management](https://enterprisedna.co/omni/instead-of/salesforce-rebate-management?utm_source=github&utm_medium=readme&utm_campaign=salesforce-rebate-management)

## License

MIT. Copyright (c) 2026 Enterprise DNA.
