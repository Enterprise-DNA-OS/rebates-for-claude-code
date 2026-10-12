---
description: "Import accounts, products and sales from a Salesforce data export"
---

Read CLAUDE.md. Run `npm run rebates -- import salesforce --json` with the flags the operator gave (salesforce --object=accounts|products|transactions --file=export.csv --actor=... [--mapping=file.json] [--dry-run]).

Read the record first. If a name matches more than one record, show the list and ask which. Pass the operator's name as --actor. Report what changed from the result.

Read docs/replace-salesforce-rebate-management.md first. Always run with --dry-run, show the counts, and only then run it for real. Import accounts, then products, then transactions.

Never send anything. Drafts go to drafts/ for a person to send. Never invent a rate, an amount or a claim.
