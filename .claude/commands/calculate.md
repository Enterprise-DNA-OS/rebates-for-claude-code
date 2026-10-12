---
description: "Calculate an ended period's rebate from the sales"
---

Read CLAUDE.md. Run `npm run rebates -- calculate --json` with the flags the operator gave (--agreement=... --period-start=YYYY-MM-DD --actor=...).

Read the record first. If a name matches more than one record, show the list and ask which. Pass the operator's name as --actor. Report what changed from the result.

Run `to-calculate` first to get the right period start. Report the measure, the tier rate applied and the amount. The settlement then needs a second person to approve it.

Never send anything. Drafts go to drafts/ for a person to send. Never invent a rate, an amount or a claim.
