-- CoachHub match management
ALTER TABLE "Event" ADD COLUMN "matchFormation" TEXT;
ALTER TABLE "Event" ADD COLUMN "matchKit" TEXT;
ALTER TABLE "Event" ADD COLUMN "matchResult" TEXT;
ALTER TABLE "Event" ADD COLUMN "matchScoreFor" INTEGER;
ALTER TABLE "Event" ADD COLUMN "matchScoreAgainst" INTEGER;
ALTER TABLE "Event" ADD COLUMN "matchNotes" TEXT;

CREATE TABLE "MatchSelection" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "eventId" TEXT NOT NULL,
  "playerId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'NOT_SELECTED',
  "position" TEXT,
  "isCaptain" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MatchSelection_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MatchSelection_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MatchSelection_eventId_playerId_key" ON "MatchSelection"("eventId", "playerId");
CREATE INDEX "MatchSelection_eventId_role_idx" ON "MatchSelection"("eventId", "role");

CREATE TABLE "EventMessage" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "eventId" TEXT NOT NULL,
  "sender" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventMessage_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "EventMessage_eventId_createdAt_idx" ON "EventMessage"("eventId", "createdAt");
