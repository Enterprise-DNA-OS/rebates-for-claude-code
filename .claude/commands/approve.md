---
description: "Approve a calculated settlement"
---

Read CLAUDE.md. Run `npm run rebates -- approve --json` with the flags the operator gave (--settlement=... --actor=... (must differ from who calculated it)).

Read the record first. If a name matches more than one record, show the list and ask which. Pass the operator's name as --actor. Report what changed from the result.

The approver must be a different person from whoever calculated it. Read the settlement and its statement before approving.

Never send anything. Drafts go to drafts/ for a person to send. Never invent a rate, an amount or a claim.
