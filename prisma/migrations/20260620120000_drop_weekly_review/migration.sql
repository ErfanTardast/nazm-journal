-- DropTable: WeeklyReview was defined in schema but never written to by the app.
-- The AI weeklyReview() method reads trade metrics directly, not this table.
-- The general Review model (daily/weekly/mistake/risk/strategy) supersedes it.
DROP TABLE IF EXISTS "WeeklyReview";
