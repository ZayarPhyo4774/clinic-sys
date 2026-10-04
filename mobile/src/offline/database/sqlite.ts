import * as SQLite from "expo-sqlite";

import { CACHE_SQL, DEVICE_SQL, LOCAL_RECORDS_SQL, OUTBOX_SQL } from "@/offline/database/schema";

let database: SQLite.SQLiteDatabase | null = null;

function createOutbox(db: SQLite.SQLiteDatabase) {
  db.execSync(OUTBOX_SQL);
}

function migrate(db: SQLite.SQLiteDatabase) {
  db.execSync(`${DEVICE_SQL}
${CACHE_SQL}
${LOCAL_RECORDS_SQL}`);
  const columns = db.getAllSync<{ name: string }>("PRAGMA table_info(outbox)");
  const names = columns.map((column) => column.name);
  if (names.length === 0) {
    createOutbox(db);
    return;
  }
  if (!names.includes("fingerprint") || !names.includes("server_entity_id")) {
    db.execSync("DROP TABLE outbox");
    createOutbox(db);
  }
}

export function openDatabase() {
  if (!database) {
    database = SQLite.openDatabaseSync("clinicsys.db");
    migrate(database);
  }
  return database;
}

export function createLocalId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16);
    const digit = char === "x" ? value : (value & 0x3) | 0x8;
    return digit.toString(16);
  });
}
