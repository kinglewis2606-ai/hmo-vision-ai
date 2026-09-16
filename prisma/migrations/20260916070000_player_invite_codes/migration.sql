ALTER TABLE "Player" ADD COLUMN "inviteCode" TEXT;

CREATE UNIQUE INDEX "Player_inviteCode_key" ON "Player"("inviteCode");
