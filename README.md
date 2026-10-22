# Budget Tracker

A single-user web app for tracking income and expenses, built with Next.js (App Router, Cache Components), Prisma + SQLite, shadcn/ui and Recharts.

## Getting started

```bash
npm install          # also generates the Prisma client
npm run db:migrate   # creates prisma/dev.db and applies migrations
npm run db:seed      # adds the default category groups and categories
npm run seed:demo    # optional: ~6 months of sample transactions
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

`npm run db:reset` drops the database, re-applies migrations and re-runs the default seed.

The project `.npmrc` points npm at the public registry.

## How totals are calculated

Each category has a type, and each transaction has a direction (credit or debit).

- **Income** = credits minus debits in `CREDIT` categories.
- **Expense** = debits minus credits in `DEBIT` categories, so a refund reduces spending.
- **Transfer** categories (credit card payments, moving money between accounts) are excluded from all totals.
- **Net** = income minus expense.

## Pages

| Route | Purpose |
| --- | --- |
| `/` | This month's totals, 6-month trend, recent transactions |
| `/transactions` | Filterable list; add, edit, delete; change category inline |
| `/import` | Extract transactions from a bank statement PDF, review and edit them, then import |
| `/reports` | Weekly / monthly / quarterly charts, group breakdown, drill-down pie |
| `/categories` | CRUD for categories (name, type, group) |
| `/category-groups` | CRUD for category groups |

## Statement import

PDFs are parsed entirely in the browser: the text layer is read with PDF.js, and pages without text are run through Tesseract OCR. Both run offline from assets that `npm install` copies into `public/` (see `scripts/copy-import-assets.mjs`).

- Rows get category suggestions from past transactions with similar descriptions, and rows that match an existing transaction are flagged and unchecked.
- If the statement shows opening/closing or running balances, the review screen checks that the rows add up.
- Fix misreads in the extraction settings (column roles, date format, debit/credit mode, skip patterns), then save them as a template. Templates are picked automatically for statements containing their identifying text.
- Each import is recorded as a batch and can be undone from the import history.

A category that still has transactions can only be deleted after choosing another category to move them to. A group can only be deleted once it has no categories.

## Tests

```bash
npm test
```

Unit tests cover the reporting math in `lib/report-math.ts` and the statement parser in `lib/import/`.
