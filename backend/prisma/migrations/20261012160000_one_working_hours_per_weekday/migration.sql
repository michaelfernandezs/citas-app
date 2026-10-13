-- Conserva un horario por día antes de aplicar la restricción única.
DELETE FROM "WorkingHours" a
USING "WorkingHours" b
WHERE a."weekday" = b."weekday"
  AND a."id" > b."id";

CREATE UNIQUE INDEX "WorkingHours_weekday_key" ON "WorkingHours"("weekday");
