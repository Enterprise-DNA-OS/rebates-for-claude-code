---
description: "Match a claim to the settlement it agrees with"
---

Read CLAUDE.md. Run `npm run rebates -- match --json` with the flags the operator gave (--claim=... --actor=...).

Read the record first. If a name matches more than one record, show the list and ask which. Pass the operator's name as --actor. Report what changed from the result.

Only a claim whose amount agrees with the settlement for that agreement and period can be matched. Anything else: run `unmatched-claims` and explain why.

Never send anything. Drafts go to drafts/ for a person to send. Never invent a rate, an amount or a claim.
