# S01 VAT on lines and documents

## Problem

Tax rates exist in billing settings and are used nowhere. An item, a bill line,
an invoice line and a receipt line all carry a bare amount, so no document this
till produces carries a VAT breakdown. A Czech venue that is a VAT payer cannot
hand any of them to a customer or to an accountant, and the ISDOC export states
`VATApplicable false` and a zero tax amount whatever the supplier is.

S01 blocks S02, S03 and S08: a shift close without tax totals is not a close, a
printed receipt repeats what the stored one says, and the sales reports are the
reason a venue buys a till.

## Scope

- A rate list a venue maintains, with an order and one default.
- An item carrying a rate.
- A bill line freezing the rate it was recorded with.
- A recap per rate on the bill, on the payment detail, on the receipt and on the
  invoice, with the ISDOC export carrying it.
- A venue that is not a VAT payer never seeing a picker or a recap.
- Prices stay tax inclusive, which is what every price in this app already is.

## Out of scope

- Reverse charge, OSS, margin schemes and any second tax besides VAT.
- Rates that change on a date. A new rate is a new row.
- Tax on tips, on rounding and on payment fees. They are S04 and S07 work.
- Editing the percentage of a rate that documents already reference.

## Data model

The schema moves to one folder per module, the shape payky arrived at. New
modules land there and `lib/evolu/index.ts` composes `AppSchema` from them, so
the split happens where work happens instead of as one 76 table rewrite.

```
lib/modules/tax-rate/tax-rate.ts        the table, imported by AppSchema
lib/modules/tax-rate/tax-rate-utils.ts  the split and the recap
```

A module sits under `lib/modules/` rather than under `lib/evolu/`, because it
carries the logic of the concept and not only its storage. The percentage keeps
the app's own `Percent`, so the module adds no second type for it.

`billingSettingsTaxRate` keeps its name and its rows and gains two nullable
columns, `sortOrder` and `isDefault`. Evolu carries `isDeleted` already, so a
retired rate is deleted rather than given a second archival flag, and a line
that referenced it keeps its id.

Every other change is one nullable column, which is the only migration Evolu
takes without rewriting history:

| Table | Column | Why |
|---|---|---|
| `item`, `catalogItem` | `taxRateId` | both spread `ItemSchema`, so one edit covers the catalog and the snapshot |
| `posBillItemLine` | `taxRateId` | frozen when the line is recorded |
| `paymentItemLine` | `taxRateId` | carried from the bill line the payment took |
| `invoiceItemLine` | `taxRateId` | the invoice is issued from live rows |
| `paymentReceiptItemLine` | `taxRateId`, `taxRateName`, `taxRatePercent` | a receipt is an issued document and must read the same after the rate is gone |

Live documents reference a rate by id, issued documents snapshot its name and
percentage. That is the one place this design departs from payky, which drops a
line whose rate has not synced yet rather than storing what it was.

## Flow

1. A venue keeps its rates in billing settings, ordered, one marked default.
2. A catalog item carries a rate, preselected to the default.
3. Putting an item on a bill copies `taxRateId` onto the bill line beside the
   price it already snapshots. A later rate change never reaches a closed bill.
4. A recap groups the lines of a document by `taxRateId` and splits each line's
   gross into base and tax, rounding per line and then summing. Never the other
   way round, because summing first and splitting once disagrees with the per
   line figures a Czech accountant reconciles against.
5. A payment carries the lines it was created from, so the recap on a payment is
   the same function over the same shape.
6. Issuing a receipt or an invoice copies the rate's name and percentage onto
   the line, and the ISDOC export writes a `TaxSubTotal` per rate.
7. A venue whose own contact is not a VAT payer sees no picker and no recap, and
   the export keeps saying `VATApplicable false`.

## Acceptance criteria

- An item carries a tax rate, chosen from the rates in billing settings.
- A bill line snapshots the rate at the moment the line is recorded, so a later
  rate change never rewrites a closed bill.
- A receipt shows, per rate, the base, the tax and the total.
- An invoice shows the same breakdown and the ISDOC export carries it.
- A venue that is not a VAT payer sees no breakdown and no rate picker.

Each is proved by a named test and each test is mutation checked.

| Criterion | Test |
|---|---|
| rate on an item | `catalog-item-form.test.tsx`, plus the catalog e2e spec |
| rate frozen on the line | `bill-line-tax.test.ts` and `pos-charge.spec.ts` |
| recap arithmetic | `tax-rate-utils.test.ts`, per line rounding and a mixed rate bill |
| receipt breakdown | `payment-receipt/service.test.ts` |
| invoice and ISDOC | `isdoc.test.ts` |
| no breakdown for a non payer | `tax-visibility.test.ts` and the settings e2e spec |

## Slices

Each slice ships on its own, green, with its tests mutation checked.

1. **Module layout and the arithmetic.** `lib/evolu/modules/tax-rate/`, the
   percentage type, `splitInclusiveAmount` and `calculateTaxRecap`, unit tested
   against per line rounding. No schema change, nothing wired.
2. **The rate list.** `sortOrder` and `isDefault` on the existing table, the
   settings form reordering and defaulting, the percentage of a referenced rate
   refused in place with a new rate offered instead.
3. **The line.** `taxRateId` on the item, the catalog form picker, the freeze on
   `posBillItemLine`, the recap on the bill and on the payment detail.
4. **The documents.** The receipt snapshot columns, the receipt recap, the
   invoice recap and the ISDOC `TaxSubTotal` per rate.
5. **The non payer and the e2e.** The visibility rule read from the own
   contact's Czech billing info, and specs in the hermetic suite that charge a
   two rate bill and read the recap back off the payment.

## Open questions

- Rounding of the split is half up on the minor unit. BTC lines round on the
  sat, which makes the tax on a small sat amount zero. Confirm that is what a
  venue selling in BTC expects before slice 3 closes.
- A bill line that was recorded before this milestone has no rate. It shows as
  an untaxed group rather than blocking the recap. Confirm before slice 4.
