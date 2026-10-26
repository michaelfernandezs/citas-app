ALTER TABLE "User" ADD COLUMN "resetTokenHash" TEXT, ADD COLUMN "resetTokenExpiresAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "User_resetTokenHash_key" ON "User"("resetTokenHash");
