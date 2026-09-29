-- Fundamentals tab: the specialized research fields (production cost, 1P/2P-style
-- reserves, production mix %, BOE-price growth scenarios) were Oil & Gas-specific.
-- Sector now drives which labels the Fundamentals tab shows over the SAME columns
-- (e.g. OneP/TwoP read as "M&I Resources"/"P&P Reserves" for Metals & Mining) --
-- see SECTOR_TEMPLATES in frontend/src/FundamentalsTab.tsx. MineLifeYears is the
-- one genuinely new column Metals needed that Oil & Gas has no equivalent for.
ALTER TABLE CompanyResearch ADD COLUMN Sector TEXT DEFAULT 'OilGas';
ALTER TABLE CompanyResearch ADD COLUMN MineLifeYears REAL;
