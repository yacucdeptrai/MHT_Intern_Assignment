-- Always-empty helper table for the optimistic-concurrency guard (docs/04-data-access-and-atomicity.md §3.1).
-- conflictGuardStmt() only ever tries to insert 0, so any insert violates `version_conflict`
-- and rolls back the whole D1 batch.
CREATE TABLE `batch_guard` (
  `ok` integer NOT NULL CONSTRAINT `version_conflict` CHECK (`ok` = 1)
);
