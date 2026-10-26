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

To run the optimized production build locally, see [PRODUCTION.md](PRODUCTION.md).

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
| `/import` | Import transactions from a bank statement PDF or CSV, review and edit them, then import |
| `/reports` | Weekly / monthly / quarterly charts, group breakdown, drill-down pie |
| `/categories` | CRUD for categories (name, type, group) |
| `/category-groups` | CRUD for category groups |

## Statement import

PDFs are parsed entirely in the browser: the text layer is read with PDF.js, and pages without text are run through Tesseract OCR. CSV bank exports are parsed in the browser from their header row. Both formats stay local until the reviewed transactions are imported. PDF.js and Tesseract run offline from assets that `npm install` copies into `public/` (see `scripts/copy-import-assets.mjs`).

- Rows get category suggestions from past transactions with similar descriptions, and rows that match an existing transaction are flagged and unchecked.
- If a CSV has a category column (a header containing "Category", or any column set to the Category role), a **Category mapping** panel lists each distinct value. Each one is pre-filled with the closest existing category: an exact name match, the last part of a path such as `Food > Groceries`, a common bank label such as "Food & Drink" for Dining Out, or a near spelling. Values with no match are left blank for you to pick. Mapped categories take priority over history suggestions, and the mappings are saved with the template (see `lib/import/category-match.ts`).
- If the statement shows opening/closing or running balances, the review screen checks that the rows add up.
- Fix misreads in the extraction settings (column roles, date format, debit/credit mode, skip patterns), then save them as a template. Templates are picked automatically for statements containing their identifying text.
- Each import is recorded as a batch and can be undone from the import history.

A category that still has transactions can only be deleted after choosing another category to move them to. A group can only be deleted once it has no categories.

## Tests

```bash
npm test             # unit + database tests (Vitest), about 2 seconds
npm run test:e2e     # browser tests (Playwright), about 1 minute
```

`npm test` runs two Vitest projects:

- **unit** (`lib/**/*.test.ts`): the reporting math in `lib/report-math.ts` and the statement parser in `lib/import/`.
- **db** (`tests/db/`): every Server Action and read query against a real SQLite database. Each test file gets its own freshly migrated database in the system temp folder, so `prisma/dev.db` is never touched.

`npm run test:e2e` builds the app, starts it on port 3200 against a separate `prisma/e2e.db` (recreated and seeded with the default categories on every run), and clicks through the create, edit and delete flows in Chromium. Install the browser once with `npx playwright install chromium`. Failure traces and screenshots go to `playwright-report/`.
