# Moving off Salesforce Rebate Management

Most suppliers have a handful of rebate programs and a large pile of transactions. The programs are re-entered and checked; the transactions, accounts and products come across from a Salesforce data export.

## 1. Export from Salesforce

In Salesforce Setup, open **Data Export**, choose the objects below and export. Salesforce emails a zip of CSV files, one per object. Save it promptly: Salesforce removes the files 48 hours after the email.

| Salesforce file | What it holds | Import as |
|---|---|---|
| `Account.csv` | Customers, buying groups (via `ParentId`) and country | `--object=accounts` |
| `Product2.csv` | Products, codes and product family | `--object=products` |
| `TransactionJournal.csv` | The sales lines rebates are calculated from | `--object=transactions` |
| `RebateProgram.csv`, `ProgramRebateType.csv`, `ProgramRebateTypeBenefit.csv`, `RebateProgramMember.csv` | Program terms, tiers and members | Read them; enter each program with `add` |
| `RebateProgramMemberPayout.csv`, `RebatePayoutAdjustment.csv` | Past payouts | Keep as your record; enter the open ones as settlements to reconcile |

## 2. Test the import, then run it

Use an empty database. Always dry-run first: nothing is saved, and you see the counts.

```bash
npm run migrate
npm run rebates -- import salesforce --object=accounts --file=export/Account.csv --actor="Your name" --dry-run
npm run rebates -- import salesforce --object=accounts --file=export/Account.csv --actor="Your name"
npm run rebates -- import salesforce --object=products --file=export/Product2.csv --actor="Your name"
npm run rebates -- import salesforce --object=transactions --file=export/TransactionJournal.csv --actor="Your name"
```

Accounts first, then products, then transactions: a transaction whose account or product has not been imported stops the whole file and nothing is saved.

## What maps

| Here | Salesforce heading (default) |
|---|---|
| account name, parent, country, kind | `Name`, `ParentId`, `BillingCountry`, `Type` |
| product code, name, category | `ProductCode`, `Name`, `Family` |
| sale account, product, date, units, value | `AccountId`, `ProductId`, `ActivityDate` (or `JournalDate`), `Quantity`, `TransactionAmount` |

If your org stores amounts or dates in custom fields, map them with a JSON file: `--mapping=examples/column-mapping.json` shows the shape (`{"date": "Invoice Date", "value": "Net Amount"}`). Values must exclude GST.

Every imported row keeps its Salesforce `Id` (as `salesforce:<Id>`) and the full source row. Importing the same file again skips rows already here. A row that has changed since the last import stops the file: decide which is right, then fix it by hand. Nothing is overwritten.

## Re-enter the programs

For each rebate program: one agreement, then its tiers.

```bash
npm run rebates -- add --type=agreement --name="Northern volume rebate" --account="Northern Motor Trade Group" --period=quarterly --starts=2026-01-01 --ends=2026-12-31 --owner=Aroha --signed-document="sharepoint://agreements/northern.pdf" --actor=Aroha
npm run rebates -- add --type=tier --agreement="Northern volume rebate" --threshold=0 --rate=1 --actor=Aroha
npm run rebates -- add --type=tier --agreement="Northern volume rebate" --threshold=50000 --rate=2 --actor=Aroha
```

Then prove it: `calculate` a period Salesforce already paid and compare the amount with `RebateProgramMemberPayout.csv`. If they differ, the program terms are wrong, or Salesforce applied a filter or adjustment you have not carried across.

## What does not carry over

- Data Processing Engine definitions and eligibility filters beyond account, buying group membership and product category. Anything more specific is a `/customise` change.
- Benefit tables that use custom aggregate fields. This version tiers on net sales value or units.
- Approval processes, Flow automations and page layouts.
- Files attached to programs. Store them where you keep contracts and record the location on the agreement.

## Run both, then switch

Calculate one or two periods here alongside Salesforce. When the amounts agree, stop calculating in Salesforce and let the subscription lapse at renewal.
