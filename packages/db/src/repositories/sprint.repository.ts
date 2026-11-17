import { and, eq, isNull } from "drizzle-orm";

import type { AppDatabase } from "../client";
import { sprints, type NewSprintRow, type SprintRow } from "../schema/sprints";

export const sprintRepository = {
  insert: async (db: AppDatabase, row: NewSprintRow): Promise<SprintRow> => {
    const inserted = await db.insert(sprints).values(row).returning();
    if (!inserted[0]) {
      throw new Error("Failed to insert sprint");
    }
    return inserted[0];
  },

  findById: async (db: AppDatabase, id: string): Promise<SprintRow | undefined> => {
    return db.query.sprints.findFirst({
      where: and(eq(sprints.id, id), isNull(sprints.deletedAt)),
    });
  },

  findByIdIncludingArchived: async (db: AppDatabase, id: string): Promise<SprintRow | undefined> => {
    return db.query.sprints.findFirst({
      where: eq(sprints.id, id),
    });
  },
};
