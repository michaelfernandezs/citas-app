-- AlterTable
ALTER TABLE "WaitlistEntry" ADD COLUMN     "preferredEndMinute" INTEGER,
ADD COLUMN     "preferredStartMinute" INTEGER,
ADD COLUMN     "preferredWeekday" INTEGER;
