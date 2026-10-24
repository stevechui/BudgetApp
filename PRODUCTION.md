# Running locally in production mode

`npm run dev` is for development. To run the optimized build, compile it once with `npm run build` and serve it with `npm start`.

## First-time setup

Run these from the project folder:

```bash
npm install                  # also generates the Prisma client and copies the PDF/OCR assets into public/
npx prisma migrate deploy    # apply migrations (use "deploy", not "dev", for production)
npm run db:seed              # only for a new database; adds the default categories
npm run build
npm start                    # serves on http://localhost:3000
```

Don't skip `npm install`: its post-install step copies the PDF.js and Tesseract (OCR) files into `public/`, which the statement import needs to work offline.

## Which database it uses

`.env` points at `prisma/dev.db`, so production mode uses the same data as development. The path is relative to the project folder, so always start the app from there.

To keep production data separate, set `DATABASE_URL` for every command:

```bash
export DATABASE_URL="file:./prisma/prod.db"
npx prisma migrate deploy && npm run db:seed
npm run build
npm start
```

Use the environment variable rather than a `.env.production` file. Next.js reads `.env.production`, but the Prisma commands only read `.env`, so the two would end up using different databases.

## Day to day

- **After pulling or changing code:** stop the server, then run `npx prisma migrate deploy`, `npm run build` and `npm start` again. Production mode doesn't hot-reload, and rebuilding while the server runs replaces files it is using.
- **Different port:** `npm start -- -p 8080`.
- **Keep it running after closing the terminal:** use a process manager, for example `npx pm2 start npm --name budget -- start`. On macOS a launchd agent also works.
- **Backups:** each production server startup creates an online SQLite backup beside the database, named with the database's name and the startup date in `MMDDYYYY` format (for example, `prod-10242026.db`). A subsequent startup on the same day replaces that day's backup. You can also run `sqlite3 prisma/dev.db ".backup backup.db"` while the app is running.

## Access from other devices

`next start` listens on all network interfaces by default, so other devices on your network can reach the app at your machine's IP on port 3000. The app has no login, so anyone who can reach that port can see and change your data. To restrict it to your own machine:

```bash
npm start -- -H 127.0.0.1
```
