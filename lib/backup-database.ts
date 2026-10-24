import Database from "better-sqlite3";
import { basename, dirname, extname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function resolveDatabasePath(databaseUrl: string) {
  let url: URL;
  try {
    url = new URL(databaseUrl, pathToFileURL(`${process.cwd()}/`));
  } catch (error) {
    throw new Error("DATABASE_URL must be a valid SQLite file URL", { cause: error });
  }
  if (url.protocol !== "file:") {
    throw new Error("DATABASE_URL must use the file: protocol to back up SQLite");
  }
  return fileURLToPath(url);
}

function datedBackupPath(databasePath: string, date: Date) {
  const fileName = basename(databasePath);
  const extension = extname(fileName);
  const name = fileName.slice(0, fileName.length - extension.length);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const year = String(date.getFullYear());
  return join(dirname(databasePath), `${name}-${month}${day}${year}${extension}`);
}

export async function backupDatabase(databaseUrl: string, date = new Date()) {
  const databasePath = resolveDatabasePath(databaseUrl);
  const backupPath = datedBackupPath(databasePath, date);
  const database = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    await database.backup(backupPath);
  } catch (error) {
    throw new Error(`Failed to back up SQLite database to ${backupPath}`, { cause: error });
  } finally {
    database.close();
  }
  console.info(`SQLite database backed up to ${backupPath}`);
  return backupPath;
}
