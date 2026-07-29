/*
  Warnings:

  - You are about to drop the column `preferredEndMinute` on the `WaitlistEntry` table. All the data in the column will be lost.
  - You are about to drop the column `preferredStartMinute` on the `WaitlistEntry` table. All the data in the column will be lost.
  - You are about to drop the column `preferredWeekday` on the `WaitlistEntry` table. All the data in the column will be lost.
  - Added the required column `watchedAppointmentId` to the `WaitlistEntry` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "WaitlistEntry" DROP COLUMN "preferredEndMinute",
DROP COLUMN "preferredStartMinute",
DROP COLUMN "preferredWeekday",
ADD COLUMN     "watchedAppointmentId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "WaitlistEntry_watchedAppointmentId_status_idx" ON "WaitlistEntry"("watchedAppointmentId", "status");

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_watchedAppointmentId_fkey" FOREIGN KEY ("watchedAppointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
