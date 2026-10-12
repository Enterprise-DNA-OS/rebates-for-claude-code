# Rules the compliance command checks

`npm run rebates -- compliance` runs the `compliance_gaps` view. Each rule below says where it comes from, what a gap looks like in the records, and what a person does about it. These are prompts for someone to check, not legal or tax advice. When a rule changes, update this file and the view together, through `/customise`.

Sources checked 12 October 2026.

## GROCERY-WRITTEN: grocery supply agreements in writing

- **New Zealand.** The Grocery Supply Code (Commerce Commission) requires a grocery supply agreement between a regulated grocery retailer and a supplier to be in writing and retained (clause 7). https://www.comcom.govt.nz/regulated-industries/grocery/grocery-supply-code/
- **Australia.** The Competition and Consumer (Industry Codes, Food and Grocery) Regulations 2024 (F2024L01651), section 18: grocery supply agreements must be in writing. The ACCC's guidance treats promotion agreements as part of the grocery supply agreement. https://www.legislation.gov.au/F2024L01651/latest/text and https://www.accc.gov.au/business/industry-codes/food-and-grocery-code-of-conduct/grocery-supply-agreements-under-the-code
- **The duty sits with the retailer**, but a supplier paying rebates on terms nobody can produce is exposed in a dispute. **In the data:** an agreement (not a draft) with an account of kind `grocery-retailer`, or a member of one, and no `signed_document`.
- **Fix:** get the signed terms, then `add` them through `/customise` or record the file location on the agreement.

## AU-ADJUSTMENT-NOTE: adjustment notes for rebates paid in Australia

- **Source.** ATO, Making an adjustment because of a rebate: a supplier gives the customer an adjustment note within 28 days of the customer asking for one or the supplier becoming aware of the adjustment, whichever is earlier. No note is needed when the GST adjustment is $75 or less, though it is still reported. https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/in-detail/rules-for-specific-transactions/gst-and-rebates/making-an-adjustment-because-of-a-rebate
- **In the data:** a paid settlement to an AU account, with GST on the rebate (10% of the amount, which is stored excluding GST) above $75, and no `credit_note_ref`. Within 28 days of payment it shows as due; after that, as late.
- **Assumption to check:** the check counts 28 days from the payment date, as the date the supplier knew of the adjustment. If you know earlier (the date you calculate it), change the rule.
- **Fix:** issue the adjustment note in your accounting system, then `credit-note --settlement=... --credit-note=<number>`.

## NZ-SUPPLY-CORRECTION: supply correction information in New Zealand

- **Source.** Inland Revenue, Credit and debit notes: from 1 April 2023, supply correction information replaces credit notes. It is not required when the correction comes from a discount or rebate whose terms were agreed in writing or set out in the taxable supply information. https://www.ird.govt.nz/gst/tax-invoices-for-gst/credit-and-debit-notes
- **In the data:** a paid settlement to an NZ account where the agreement has no `signed_document` and no `credit_note_ref` is recorded.
- **Fix:** either put the written terms on file (which also clears GROCERY-WRITTEN where it applies) or issue supply correction information and record its number with `credit-note`.

## Controls the database enforces itself

These are not law. They are the controls rebate audits ask about, built into the schema so they cannot be skipped:

- A settlement is approved by a different person from whoever calculated it.
- A settlement cannot be paid before it is approved, and a payment needs a date and a reference.
- An adjustment needs a reason, and only before approval.
- A period cannot be calculated before it ends, or twice.
- A claim is matched only when its amount agrees with the settlement for that agreement and period.
- Every change is written to `history` with the person who made it.

## Accounting

Rebates a business expects to pay reduce revenue when the sale is made, not when the rebate is paid (NZ IFRS 15 and AASB 15, variable consideration). The `accruals` view and `month-end` draft give the figure for that journal. Your accountant decides the treatment.
