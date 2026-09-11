-- Adds EPS to the Fundamentals tab's 5-year history entry/chart (see 006_company_research.sql).
ALTER TABLE CompanyHistoricalFinancials ADD COLUMN EPS REAL;
