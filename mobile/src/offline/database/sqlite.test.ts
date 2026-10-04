import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import { SCHEMA_SQL } from "@/offline/database/schema";

describe("local database", () => {
  it("stores one outbox row per operation and keeps the clinical payload", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(SCHEMA_SQL);
    const insert = db.prepare(`
      INSERT INTO outbox (
        operation_id, fingerprint, device_id, user_id, name, entity_type, entity_id,
        operation_type, method, path, body, created_at, status, retry_count, next_attempt_at,
        server_entity_id, error
      ) VALUES (
        'op-1', 'finger', 'device-1', 'user-1', 'vitals.record', 'encounters.VitalSign', NULL,
        'create', 'POST', '/sync/push/', '{"temperature":"37.2"}', '2026-10-01T00:00:00Z',
        'pending', 0, NULL, NULL, NULL
      )
    `);
    insert.run();
    expect(() => insert.run()).toThrow();
    db.prepare(`
      INSERT INTO local_records (
        local_id, user_id, branch_id, kind, parent_id, server_id, payload, server_payload,
        operation_id, sync_status, error, updated_at
      ) VALUES (
        'local-1', 'user-1', 'branch-1', 'vital', 'encounter-1', NULL, '{"temperature":"37.2"}',
        NULL, 'op-1', 'pending', NULL, '2026-10-01T00:00:00Z'
      )
    `).run();
    const row = db.prepare("SELECT payload, sync_status FROM local_records WHERE operation_id = ?").get("op-1") as {
      payload: string;
      sync_status: string;
    };
    expect(row.sync_status).toBe("pending");
    expect(row.payload).toContain("37.2");
    db.close();
  });
});
