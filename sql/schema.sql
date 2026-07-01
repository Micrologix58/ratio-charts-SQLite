-- SQLite schema for CommoditiesStockAnalysis, converted from the MSSQL
-- export at C:\projects\ratio-charts\sql\scripts.sql (exported 2026-07-01).
--
-- Type mapping used throughout:
--   nvarchar(n) / nvarchar(max)     -> TEXT   (SQLite does not enforce length)
--   decimal(p,s)                    -> REAL   (no fixed-point decimal type in SQLite)
--   bit                              -> INTEGER (0/1)
--   int / bigint                     -> INTEGER
--   date                             -> TEXT   ('YYYY-MM-DD')
--   datetime / datetime2             -> TEXT   ('YYYY-MM-DD HH:MM:SS')
--   IDENTITY(1,1) PRIMARY KEY        -> INTEGER PRIMARY KEY (SQLite rowid alias, autoincrements)
--   getdate()                        -> CURRENT_TIMESTAMP (note: UTC, not local server time like GETDATE())
--
-- Not ported: [dbo].[sp_ExportAnalysisForIngest] (stored procedure). SQLite has no
-- stored procedures; reimplement as an app-layer function running the same four
-- queries. Note the original proc references DurrettAnalysisHistory columns
-- (Factor_01_Liquidity, Factor_06_ProductionGrowth, etc.) that don't match that
-- table's actual columns (Factor_01_PropertiesOwnership, Factor_06_GoodBuzzChart,
-- etc.) -- looks stale from an earlier schema revision, reconcile when porting.
--
-- Enable foreign key enforcement per-connection (SQLite has it off by default):
--   better-sqlite3: db.pragma('foreign_keys = ON');
PRAGMA foreign_keys = ON;

-- ============================================================================
-- Companies (root table; everything else FKs to TickerSymbol)
-- ============================================================================
CREATE TABLE Companies (
    TickerSymbol            TEXT NOT NULL PRIMARY KEY,
    CompanyName             TEXT NOT NULL,
    PrimaryMetal            TEXT,
    SecondaryMetals         TEXT,
    CountryOfOperations     TEXT,
    ExchangeListed          TEXT,
    WebsiteURL              TEXT,
    CreatedAt               TEXT DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt               TEXT DEFAULT CURRENT_TIMESTAMP,
    PrimaryCommodityType    TEXT DEFAULT 'Unknown',
    IndustryClassification  TEXT,
    DatabaseCategory        TEXT DEFAULT 'Mining',
    PrimaryCommodity        TEXT,
    SecondaryCommodity      TEXT,
    ProductionMix_Oil       REAL,
    ProductionMix_Gas       REAL,
    ProductionMix_NGLs      REAL,
    ProvedReserves_MMBoe    REAL,
    ReserveLife_Years       REAL,
    FactorMethodologyVersion TEXT,
    CompanyType             TEXT DEFAULT 'Upstream',
    IsMLP                   TEXT DEFAULT 'N',
    ExecutiveSummary        TEXT,
    InvestmentThesis        TEXT,
    Market                  TEXT,
    AssetType               TEXT,
    Locale                  TEXT,
    Active                  INTEGER,
    SourceFeed              TEXT,
    Provider                TEXT
);

CREATE INDEX idx_Companies_PrimaryMetal ON Companies (PrimaryMetal);
CREATE INDEX IX_Companies_DatabaseCategory ON Companies (DatabaseCategory);
CREATE INDEX IX_Companies_PrimaryCommodityType ON Companies (PrimaryCommodityType);
CREATE INDEX IX_Companies_Type ON Companies (CompanyType);

-- ============================================================================
-- CompanyCommodities
-- ============================================================================
CREATE TABLE CompanyCommodities (
    CompanyCommodityID     INTEGER PRIMARY KEY,
    TickerSymbol            TEXT NOT NULL REFERENCES Companies(TickerSymbol),
    CommodityType           TEXT NOT NULL,
    CommodityName           TEXT NOT NULL,
    "Rank"                  INTEGER NOT NULL,
    EstimatedProductionMix  REAL,
    CreatedAt               TEXT DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt               TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (TickerSymbol, CommodityType, "Rank"),
    CHECK (EstimatedProductionMix >= 0 AND EstimatedProductionMix <= 100),
    CHECK ("Rank" >= 1 AND "Rank" <= 10)
);

CREATE INDEX IX_CompanyCommodities_CommodityType ON CompanyCommodities (CommodityType);
CREATE INDEX IX_CompanyCommodities_TickerSymbol ON CompanyCommodities (TickerSymbol);

-- ============================================================================
-- OilGasMetrics
-- ============================================================================
CREATE TABLE OilGasMetrics (
    MetricID                            INTEGER PRIMARY KEY,
    TickerSymbol                        TEXT NOT NULL REFERENCES Companies(TickerSymbol),
    AnalysisDate                        TEXT NOT NULL,
    ProvedReserves_Total_MMBoe          REAL,
    ProvedReserves_PDP_MMBoe            REAL,
    ProvedReserves_PDNP_MMBoe           REAL,
    ProvedReserves_PUD_MMBoe            REAL,
    ReserveLife_Years                   REAL,
    ReserveReplacementRatio_Percent     REAL,
    Production_Current_BOEd             REAL,
    Production_Oil_Bpd                  REAL,
    Production_Gas_Mcfd                 REAL,
    Production_NGLs_Bpd                 REAL,
    Oil_Weighting_Percent               REAL,
    Gas_Weighting_Percent               REAL,
    NGLs_Weighting_Percent              REAL,
    OperatingCost_Per_BOE               REAL,
    OperatingNetback_Per_BOE            REAL,
    RealizedPrice_Per_BOE               REAL,
    Drilling_Inventory_Years            REAL,
    Annual_Capex_Millions               REAL,
    Basin_Allocation_JSON               TEXT,
    CreatedDate                         TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (TickerSymbol, AnalysisDate)
);

CREATE INDEX IX_OilGasMetrics_TickerDate ON OilGasMetrics (TickerSymbol, AnalysisDate DESC);

-- ============================================================================
-- PriceHistory
-- ============================================================================
CREATE TABLE PriceHistory (
    PriceHistoryID  INTEGER PRIMARY KEY,
    TickerSymbol    TEXT NOT NULL REFERENCES Companies(TickerSymbol),
    PriceDate       TEXT NOT NULL,
    OpenPrice       REAL,
    HighPrice       REAL,
    LowPrice        REAL,
    ClosePrice      REAL NOT NULL,
    Volume          INTEGER,
    VWAP            REAL,
    LastUpdated     TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (TickerSymbol, PriceDate)
);

CREATE INDEX idx_PriceHistory_Ticker_Date ON PriceHistory (TickerSymbol, PriceDate DESC);

-- ============================================================================
-- FinancialMetrics_OilGas
-- ============================================================================
CREATE TABLE FinancialMetrics_OilGas (
    FinMetricID                    INTEGER PRIMARY KEY,
    TickerSymbol                   TEXT NOT NULL REFERENCES Companies(TickerSymbol),
    AnalysisDate                   TEXT NOT NULL,
    TotalDebt_Billions             REAL,
    Cash_Billions                  REAL,
    NetDebt_Billions               REAL,
    TotalLiquidity_Billions        REAL,
    NetDebt_to_EBITDA              REAL,
    Future1                        REAL,
    PDP_Coverage_Ratio             REAL,
    OperatingCashFlow_Millions     REAL,
    CapitalExpenditure_Millions    REAL,
    FreeCashFlow_Millions          REAL,
    FCF_Yield_Percent              REAL,
    StockPrice                     REAL,
    MarketCap_Billions             REAL,
    EnterpriseValue_Billions       REAL,
    EV_Per_BOE                     REAL,
    Price_to_NAV                   REAL,
    PE_Ratio                       REAL,
    EV_to_EBITDA                   REAL,
    ROE_Percent                    REAL,
    ROA_Percent                    REAL,
    ROIC_Percent                   REAL,
    CreatedDate                    TEXT DEFAULT CURRENT_TIMESTAMP,
    FiftyTwoWeekLow                REAL,
    FiftyTwoWeekHigh               REAL,
    UNIQUE (TickerSymbol, AnalysisDate)
);

CREATE INDEX IX_FinMetrics_OilGas_TickerDate ON FinancialMetrics_OilGas (TickerSymbol, AnalysisDate DESC);

-- ============================================================================
-- DurrettFactors_OilGas
-- ============================================================================
CREATE TABLE DurrettFactors_OilGas (
    DurrettFactorID             INTEGER PRIMARY KEY,
    TickerSymbol                TEXT NOT NULL REFERENCES Companies(TickerSymbol),
    AnalysisDate                TEXT NOT NULL,
    Factor_01_Properties        REAL,
    Factor_01_Rationale         TEXT,
    Factor_01_KeyMetrics        TEXT,
    Factor_02_Management        REAL,
    Factor_02_Rationale         TEXT,
    Factor_02_KeyMetrics        TEXT,
    Factor_03_ShareStructure    REAL,
    Factor_03_Rationale         TEXT,
    Factor_03_KeyMetrics        TEXT,
    Factor_04_Location          REAL,
    Factor_04_Rationale         TEXT,
    Factor_04_KeyMetrics        TEXT,
    Factor_05_Growth            REAL,
    Factor_05_Rationale         TEXT,
    Factor_05_KeyMetrics        TEXT,
    Factor_06_MarketBuzz        REAL,
    Factor_06_Rationale         TEXT,
    Factor_06_KeyMetrics        TEXT,
    Factor_07_CostStructure     REAL,
    Factor_07_Rationale         TEXT,
    Factor_07_KeyMetrics        TEXT,
    Factor_08_CashDebt          REAL,
    Factor_08_Rationale         TEXT,
    Factor_08_KeyMetrics        TEXT,
    Factor_09_Valuation         REAL,
    Factor_09_Rationale         TEXT,
    Factor_09_KeyMetrics        TEXT,
    Factor_10_UpsidePotential   REAL,
    Factor_10_Rationale         TEXT,
    Factor_10_KeyMetrics        TEXT,
    CompositeScore              REAL,
    FactorMethodologyVersion    TEXT DEFAULT '1.1_OilGas',
    DataQualityScore            REAL,
    AnalystNotes                TEXT,
    Recommendation              TEXT,
    CreatedDate                 TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (TickerSymbol, AnalysisDate),
    CHECK (
        (Factor_01_Properties      BETWEEN 0 AND 10 OR Factor_01_Properties      IS NULL) AND
        (Factor_02_Management      BETWEEN 0 AND 10 OR Factor_02_Management      IS NULL) AND
        (Factor_03_ShareStructure  BETWEEN 0 AND 10 OR Factor_03_ShareStructure  IS NULL) AND
        (Factor_04_Location        BETWEEN 0 AND 10 OR Factor_04_Location        IS NULL) AND
        (Factor_05_Growth          BETWEEN 0 AND 10 OR Factor_05_Growth          IS NULL) AND
        (Factor_06_MarketBuzz      BETWEEN 0 AND 10 OR Factor_06_MarketBuzz      IS NULL) AND
        (Factor_07_CostStructure   BETWEEN 0 AND 10 OR Factor_07_CostStructure   IS NULL) AND
        (Factor_08_CashDebt        BETWEEN 0 AND 10 OR Factor_08_CashDebt        IS NULL) AND
        (Factor_09_Valuation       BETWEEN 0 AND 10 OR Factor_09_Valuation       IS NULL) AND
        (Factor_10_UpsidePotential BETWEEN 0 AND 10 OR Factor_10_UpsidePotential IS NULL)
    )
);

CREATE INDEX IX_DurrettFactors_TickerDate ON DurrettFactors_OilGas (TickerSymbol, AnalysisDate DESC);

-- ============================================================================
-- CommodityPriceHistory (no FK to Companies -- benchmark/spot prices)
-- ============================================================================
CREATE TABLE CommodityPriceHistory (
    PriceHistoryID  INTEGER PRIMARY KEY,
    PriceDate       TEXT NOT NULL,
    CommodityType   TEXT NOT NULL,
    BenchmarkName   TEXT NOT NULL,
    ClosePrice      REAL,
    HighPrice       REAL,
    LowPrice        REAL,
    AvgPrice        REAL,
    Unit            TEXT,
    Source          TEXT,
    UNIQUE (PriceDate, CommodityType, BenchmarkName)
);

CREATE INDEX IX_CommodityPriceHistory_Commodity ON CommodityPriceHistory (CommodityType, PriceDate);
CREATE INDEX IX_CommodityPriceHistory_Date ON CommodityPriceHistory (PriceDate);

-- ============================================================================
-- CompanyMetadata
-- ============================================================================
CREATE TABLE CompanyMetadata (
    MetadataID                     INTEGER PRIMARY KEY,
    TickerSymbol                   TEXT NOT NULL REFERENCES Companies(TickerSymbol),
    AsOfDate                       TEXT NOT NULL,
    AnnualSilverProductionOz       INTEGER,
    AnnualGoldProductionOz         INTEGER,
    AnnualCopperProductionOz       INTEGER,
    AnnualZincProductionOz         INTEGER,
    MineCount                      INTEGER,
    PrimaryMineNames               TEXT,
    SharesOutstandingMillions      REAL,
    DilutionOverhangPercent        REAL,
    InsiderOwnershipPercent        REAL,
    OptionWarrantSharesMillions    REAL,
    MarketCapUSD                   REAL,
    DebtUSD                        REAL,
    CashUSD                        REAL,
    AnnualRevenueUSD               REAL,
    DataSource                     TEXT,
    CreatedAt                      TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (TickerSymbol, AsOfDate)
);

CREATE INDEX idx_CompanyMetadata_Ticker_Date ON CompanyMetadata (TickerSymbol, AsOfDate DESC);

-- ============================================================================
-- DurrettAnalysisHistory
-- ============================================================================
CREATE TABLE DurrettAnalysisHistory (
    AnalysisID                             INTEGER PRIMARY KEY,
    TickerSymbol                           TEXT NOT NULL REFERENCES Companies(TickerSymbol),
    AnalysisDate                           TEXT NOT NULL,
    SourceFormat                           TEXT,
    SourceFilename                         TEXT,
    Factor_01_PropertiesOwnership          REAL,
    Factor_02_PeopleManagement             REAL,
    Factor_03_ShareStructure               REAL,
    Factor_04_LocationJurisdiction         REAL,
    Factor_05_ProjectedGrowth              REAL,
    Factor_06_GoodBuzzChart                REAL,
    Factor_07_CostStructureFinancing       REAL,
    Factor_08_CashDebtPosition             REAL,
    Factor_09_LowValuationEstimate         REAL,
    Factor_10_UpsidePotential              REAL,
    CompositeScore                         REAL,
    StockPriceAtAnalysis                   REAL,
    DataQualityScore                       REAL,
    AnalystNotes                           TEXT,
    RecommendationLevel                    TEXT,
    CreatedAt                              TEXT DEFAULT CURRENT_TIMESTAMP,
    AnalysisCreator                        TEXT,
    AssetClass                             TEXT DEFAULT 'Unknown',
    FactorMethodologyVersion               TEXT DEFAULT '1.0',
    CommodityPricingContext                TEXT,
    UNIQUE (TickerSymbol, AnalysisDate)
);

CREATE INDEX idx_DurrettAnalysis_CompositeScore ON DurrettAnalysisHistory (TickerSymbol, CompositeScore DESC);
CREATE INDEX idx_DurrettAnalysis_Ticker_Date ON DurrettAnalysisHistory (TickerSymbol, AnalysisDate DESC);
CREATE INDEX IX_DurrettAnalysisHistory_AssetClass ON DurrettAnalysisHistory (AssetClass);

-- ============================================================================
-- FundamentalMetrics
-- ============================================================================
CREATE TABLE FundamentalMetrics (
    MetricID        INTEGER PRIMARY KEY,
    TickerSymbol    TEXT NOT NULL REFERENCES Companies(TickerSymbol),
    MetricDate      TEXT NOT NULL,
    MetricName      TEXT,
    MetricValue     REAL,
    DataSource      TEXT,
    LastUpdated     TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (TickerSymbol, MetricDate, MetricName)
);

CREATE INDEX idx_FundamentalMetrics_MetricName ON FundamentalMetrics (MetricName);
CREATE INDEX idx_FundamentalMetrics_Ticker_Date ON FundamentalMetrics (TickerSymbol, MetricDate DESC);

-- ============================================================================
-- IngestionLog (no FK)
-- ============================================================================
CREATE TABLE IngestionLog (
    LogID               INTEGER PRIMARY KEY,
    SourceFilename      TEXT,
    SourceFormat        TEXT,
    TickerSymbol        TEXT,
    AnalysisDate        TEXT,
    RecordsInserted     INTEGER,
    Status              TEXT,
    ErrorMessage        TEXT,
    IngestionTime       TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_IngestionLog_IngestionTime ON IngestionLog (IngestionTime DESC);
CREATE INDEX idx_IngestionLog_Status ON IngestionLog (Status);

-- ============================================================================
-- MidstreamMetrics
-- ============================================================================
CREATE TABLE MidstreamMetrics (
    MidstreamMetricsID                     INTEGER PRIMARY KEY,
    TickerSymbol                           TEXT NOT NULL REFERENCES Companies(TickerSymbol),
    AnalysisDate                           TEXT NOT NULL,
    CompanyName                            TEXT,
    MLPType                                TEXT,
    UnitsOutstanding_Diluted_Millions      REAL,
    GeneralPartner_Ownership_Pct           REAL,
    LimitedPartner_Ownership_Pct           REAL,
    SubordinatedUnits_Outstanding          REAL,
    IDR_Tier1_ThresholdPerQuarter          REAL,
    IDR_Tier1_LP_Share_Pct                 REAL,
    IDR_Tier2_LowThreshold                 REAL,
    IDR_Tier2_HighThreshold                REAL,
    IDR_Tier2_LP_Share_Pct                 REAL,
    IDR_Tier3_Threshold                    REAL,
    IDR_Tier3_LP_Share_Pct                 REAL,
    GP_CurrentShare_Pct                    REAL,
    IDR_Waived                             TEXT,
    IDR_Dilution_History_JSON              TEXT,
    DCF_TTM_Millions                       REAL,
    DCF_Per_Unit                           REAL,
    AnnualDistribution_Per_Unit            REAL,
    TotalAnnualDistributions_Millions      REAL,
    DCF_Payout_Ratio_Pct                   REAL,
    DCF_Coverage_Ratio                     REAL,
    DistributionGrowth_3Yr_CAGR_Pct        REAL,
    DistributionCut_Risk                   TEXT,
    PipelineMiles_Total                    INTEGER,
    PipelineThroughput_BPDAY               INTEGER,
    GasThroughput_MMCFDay                  REAL,
    TerminalCapacity_MMBarrels             REAL,
    TerminalThroughput_BPDAY               INTEGER,
    StorageCapacity_BCF                    REAL,
    AssetUtilization_Pct                   REAL,
    ContractCoverage_Pct                   REAL,
    RegulatorySetting                      TEXT,
    TotalDebt_Millions                     REAL,
    Cash_Millions                          REAL,
    NetDebt_Millions                       REAL,
    NetDebt_to_EBITDA_Ratio                REAL,
    Interest_Coverage_Ratio                REAL,
    DebtService_Coverage_Ratio             REAL,
    Debt_Maturity_Avg_Years                REAL,
    CreditRating                           TEXT,
    EBITDA_Millions                        REAL,
    Revenue_Millions                       REAL,
    EBITDA_Margin_Pct                      REAL,
    OperatingExpense_Pct                   REAL,
    MaintenanceCapex_Pct                   REAL,
    Capex_Maintenance_Millions             REAL,
    Capex_Growth_Millions                  REAL,
    K1_Complexity_Level                    TEXT,
    Qualified_Dividend_Treatment_Pct       REAL,
    Ordinary_Income_Pct                    REAL,
    ReturnOfCapital_Pct                    REAL,
    UBTI_Pct                               REAL,
    StockPrice                             REAL,
    MarketCap_Billions                     REAL,
    EnterpriseValue_Billions               REAL,
    Price_to_DCF_Multiple                  REAL,
    EV_to_EBITDA_Multiple                  REAL,
    DistributionYield_Pct                  REAL,
    YieldSpread_to_10Y_Treasury_bps        INTEGER,
    AcquisitionPipeline_Millions           REAL,
    OrganicCapex_Growth_Pct                REAL,
    SynergyRealization_Status              TEXT,
    DistributionGrowth_Guidance_Pct        REAL,
    AnalystCoverage_Count                  INTEGER,
    AnalystBuy_Pct                         REAL,
    AnalystHold_Pct                        REAL,
    AnalystSell_Pct                        REAL,
    PriceTarget_Consensus                  REAL,
    Upside_to_Target_Pct                   REAL,
    InstitutionalOwnership_Pct             REAL,
    Factor_1_Asset_Quality_Score           REAL,
    Factor_2_Management_Score              REAL,
    Factor_3_Distribution_Score            REAL,
    Factor_4_Leverage_Score                REAL,
    Factor_5_TaxEfficiency_Score           REAL,
    Factor_6_Sentiment_Score               REAL,
    Factor_7_Operating_Score               REAL,
    Factor_8_Dilution_Score                REAL,
    Factor_9_Valuation_Score               REAL,
    Factor_10_Growth_Score                 REAL,
    CompositeScore                         REAL,
    InvestmentRating                       TEXT,
    DataQualityScore                       REAL,
    AnalystNotes                           TEXT,
    Recommendation                         TEXT,
    CreatedDate                            TEXT DEFAULT CURRENT_TIMESTAMP,
    LastModified                           TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (TickerSymbol, AnalysisDate),
    CHECK (DCF_Payout_Ratio_Pct >= 0 AND DCF_Payout_Ratio_Pct <= 200),
    CHECK (DistributionCut_Risk IN ('High', 'Medium', 'Low')),
    CHECK (InvestmentRating IN ('STRONG_SELL', 'SELL', 'HOLD', 'BUY', 'STRONG_BUY'))
);

CREATE INDEX IX_Midstream_AnalysisDate ON MidstreamMetrics (TickerSymbol, AnalysisDate DESC);
CREATE INDEX IX_Midstream_CompositeScore ON MidstreamMetrics (CompositeScore DESC);
CREATE INDEX IX_Midstream_DCFRisk ON MidstreamMetrics (DistributionCut_Risk);
CREATE INDEX IX_Midstream_Rating ON MidstreamMetrics (InvestmentRating);

-- ============================================================================
-- MLP_AssetInventory
-- ============================================================================
CREATE TABLE MLP_AssetInventory (
    AssetInventoryID        INTEGER PRIMARY KEY,
    TickerSymbol             TEXT NOT NULL REFERENCES Companies(TickerSymbol),
    ReportingDate            TEXT NOT NULL,
    AssetType                TEXT,
    AssetName                TEXT,
    Geography                TEXT,
    CapacityMetric_Unit      TEXT,
    CapacityMetric_Value     REAL,
    Throughput_Unit          TEXT,
    Throughput_Value         REAL,
    UtilizationRate_Pct      REAL,
    ContractBackingPct       REAL,
    Regulated                TEXT
);

CREATE INDEX IX_AssetInv_TickerType ON MLP_AssetInventory (TickerSymbol, AssetType);

-- ============================================================================
-- MLP_DistributionHistory
-- ============================================================================
CREATE TABLE MLP_DistributionHistory (
    DistributionHistoryID          INTEGER PRIMARY KEY,
    TickerSymbol                   TEXT NOT NULL REFERENCES Companies(TickerSymbol),
    QuarterEndDate                 TEXT NOT NULL,
    DistributionPerUnit            REAL,
    DistributionTotal_Millions     REAL,
    Frequency                      TEXT,
    CumulativeAnnual               REAL,
    DistributionGrowth_YoY_Pct     REAL,
    UNIQUE (TickerSymbol, QuarterEndDate)
);

CREATE INDEX IX_DistHist_TickerDate ON MLP_DistributionHistory (TickerSymbol, QuarterEndDate DESC);

-- ============================================================================
-- MLP_ManagementStructure (effectively 1:1 with Companies)
-- ============================================================================
CREATE TABLE MLP_ManagementStructure (
    ManagementID                            INTEGER PRIMARY KEY,
    TickerSymbol                            TEXT NOT NULL UNIQUE REFERENCES Companies(TickerSymbol),
    GeneralPartner_Entity                   TEXT,
    ParentCompany                           TEXT,
    GP_Track_Record_YearsInRole             INTEGER,
    GP_PriorM_A_Deals                       INTEGER,
    UnitPrice_CAGR_3Yr_Pct                  REAL,
    IDRWaiverStatus                         TEXT,
    CapitalAllocation_Discipline            TEXT,
    UnitBuybackActivity_3Yr_Millions        REAL,
    ConflictOfInterest_Description          TEXT,
    AnalystSentiment_Management             TEXT
);

CREATE INDEX IX_Mgmt_Ticker ON MLP_ManagementStructure (TickerSymbol);

-- ============================================================================
-- MLP_TaxComposition
-- ============================================================================
CREATE TABLE MLP_TaxComposition (
    TaxCompID                          INTEGER PRIMARY KEY,
    TickerSymbol                       TEXT NOT NULL REFERENCES Companies(TickerSymbol),
    TaxYear                            INTEGER,
    K1_QualifiedDividendPercentage     REAL,
    K1_OrdinaryIncomePercentage        REAL,
    K1_ReturnOfCapitalPercentage       REAL,
    K1_UBIPercentage                   REAL,
    AverageK1_Complexity_Score         INTEGER,
    Notes                              TEXT,
    UNIQUE (TickerSymbol, TaxYear)
);

CREATE INDEX IX_TaxComp_TickerYear ON MLP_TaxComposition (TickerSymbol, TaxYear DESC);

-- ============================================================================
-- MLP_UnitDilution
-- ============================================================================
CREATE TABLE MLP_UnitDilution (
    UnitDilutionID                      INTEGER PRIMARY KEY,
    TickerSymbol                        TEXT NOT NULL REFERENCES Companies(TickerSymbol),
    PeriodEndDate                       TEXT NOT NULL,
    TotalUnits_Diluted_Millions         REAL,
    LPUnits_Millions                    REAL,
    GPUnits_Millions                    REAL,
    OptionPool_Millions                 REAL,
    SubordinatedUnits_Millions          REAL,
    AnnualDilution_Pct                  REAL,
    EquityRaisesCount                   INTEGER,
    EquityRaiseProceedsTotal_Millions   REAL,
    UNIQUE (TickerSymbol, PeriodEndDate)
);

CREATE INDEX IX_UnitDil_TickerDate ON MLP_UnitDilution (TickerSymbol, PeriodEndDate DESC);

-- ============================================================================
-- MLPAnalysisResults (no FK / lowercase columns in original -- preserved as-is)
-- ============================================================================
CREATE TABLE MLPAnalysisResults (
    id              INTEGER PRIMARY KEY,
    ticker          TEXT NOT NULL,
    companyname     TEXT,
    analysisdate    TEXT,
    jsonpayload     TEXT,
    createddate     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- ValuationScenarios
-- ============================================================================
CREATE TABLE ValuationScenarios (
    ScenarioID              INTEGER PRIMARY KEY,
    TickerSymbol            TEXT NOT NULL REFERENCES Companies(TickerSymbol),
    AnalysisDate            TEXT NOT NULL,
    MetalType                TEXT NOT NULL,
    SpotPricePerOz           REAL NOT NULL,
    EstimatedStockPrice      REAL NOT NULL,
    ConfidenceLevel          TEXT,
    Notes                    TEXT,
    CreatedAt                TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ValuationScenarios_Ticker_Date ON ValuationScenarios (TickerSymbol, AnalysisDate DESC);

-- ============================================================================
-- Views
-- ============================================================================

-- All commodity stocks (mining + O&G)
CREATE VIEW vw_AllCommodityStocks AS
SELECT
    c.TickerSymbol,
    c.CompanyName,
    c.PrimaryCommodityType,
    c.IndustryClassification,
    c.DatabaseCategory,
    c.CreatedAt,
    c.UpdatedAt
FROM Companies c
WHERE c.DatabaseCategory IN ('Mining', 'OilGas', 'Uranium', 'Energy');

-- Oil & Gas companies only, latest analysis per ticker
CREATE VIEW vw_OilGasCompanies AS
SELECT
    c.TickerSymbol,
    c.CompanyName,
    c.IndustryClassification,
    og.DailyProduction_KBOED,
    og.OilProdPercent,
    og.ReserveLife_Years,
    og.BreakEven_WTI,
    og.BreakEven_HenryHub,
    og.ProductionCostPerBOE,
    og.AnalysisDate
FROM Companies c
LEFT JOIN OilGasMetrics og ON c.TickerSymbol = og.TickerSymbol
WHERE c.DatabaseCategory = 'OilGas'
  AND og.AnalysisDate = (
      SELECT MAX(AnalysisDate)
      FROM OilGasMetrics
      WHERE TickerSymbol = c.TickerSymbol
  );
-- NOTE: this view references og.DailyProduction_KBOED, og.OilProdPercent,
-- og.BreakEven_WTI, og.BreakEven_HenryHub, og.ProductionCostPerBOE, which do
-- not exist as columns on OilGasMetrics in this schema export (same
-- stale-reference issue as sp_ExportAnalysisForIngest) -- will need columns
-- reconciled or added before this view can run.

-- Multi-commodity companies
CREATE VIEW vw_MultiCommodityCompanies AS
SELECT
    c.TickerSymbol,
    c.CompanyName,
    c.DatabaseCategory,
    COUNT(DISTINCT cc.CommodityType) AS CommodityCount,
    GROUP_CONCAT(cc.CommodityName || ' (' || cc.EstimatedProductionMix || '%)', ', ') AS CommodityMix
FROM Companies c
LEFT JOIN CompanyCommodities cc ON c.TickerSymbol = cc.TickerSymbol
GROUP BY c.TickerSymbol, c.CompanyName, c.DatabaseCategory
HAVING COUNT(DISTINCT cc.CommodityType) > 1;

-- Weekly OHLC rollup of PriceHistory.
-- NOTE: SQL Server's DATEPART(week, ...) used US week numbering (server
-- DATEFIRST-dependent). SQLite has no equivalent, so this uses strftime('%W')
-- (Monday-based ISO-style week, 00-53). Week boundaries near year-end may
-- land a few days differently than the original MSSQL view -- verify against
-- known data before relying on this for anything precise.
CREATE VIEW WeeklyPriceHistory AS
WITH DailyWithWeek AS (
    SELECT
        TickerSymbol,
        PriceDate,
        strftime('%Y', PriceDate) AS WeekYear,
        strftime('%W', PriceDate) AS WeekNum,
        OpenPrice,
        HighPrice,
        LowPrice,
        ClosePrice
    FROM PriceHistory
),
WeekAgg AS (
    SELECT
        TickerSymbol,
        WeekYear,
        WeekNum,
        MIN(PriceDate) AS WeekStartDate,
        MAX(PriceDate) AS WeekEndDate
    FROM DailyWithWeek
    GROUP BY TickerSymbol, WeekYear, WeekNum
)
SELECT
    w.TickerSymbol,
    w.WeekEndDate AS t,
    (SELECT d.OpenPrice FROM DailyWithWeek d
     WHERE d.TickerSymbol = w.TickerSymbol AND d.WeekYear = w.WeekYear
       AND d.WeekNum = w.WeekNum AND d.PriceDate = w.WeekStartDate) AS "Open",
    (SELECT MAX(d.HighPrice) FROM DailyWithWeek d
     WHERE d.TickerSymbol = w.TickerSymbol AND d.WeekYear = w.WeekYear
       AND d.WeekNum = w.WeekNum) AS "High",
    (SELECT MIN(d.LowPrice) FROM DailyWithWeek d
     WHERE d.TickerSymbol = w.TickerSymbol AND d.WeekYear = w.WeekYear
       AND d.WeekNum = w.WeekNum) AS "Low",
    (SELECT d.ClosePrice FROM DailyWithWeek d
     WHERE d.TickerSymbol = w.TickerSymbol AND d.WeekYear = w.WeekYear
       AND d.WeekNum = w.WeekNum AND d.PriceDate = w.WeekEndDate) AS "Close"
FROM WeekAgg w;

-- Monthly OHLC rollup of PriceHistory
CREATE VIEW MonthlyPriceHistory AS
WITH DailyWithMonth AS (
    SELECT
        TickerSymbol,
        PriceDate,
        strftime('%Y', PriceDate) AS YearNum,
        strftime('%m', PriceDate) AS MonthNum,
        OpenPrice,
        HighPrice,
        LowPrice,
        ClosePrice
    FROM PriceHistory
),
MonthAgg AS (
    SELECT
        TickerSymbol,
        YearNum,
        MonthNum,
        MIN(PriceDate) AS MonthStartDate,
        MAX(PriceDate) AS MonthEndDate
    FROM DailyWithMonth
    GROUP BY TickerSymbol, YearNum, MonthNum
)
SELECT
    m.TickerSymbol,
    m.MonthEndDate AS t,
    (SELECT d.OpenPrice FROM DailyWithMonth d
     WHERE d.TickerSymbol = m.TickerSymbol AND d.YearNum = m.YearNum
       AND d.MonthNum = m.MonthNum AND d.PriceDate = m.MonthStartDate) AS "Open",
    (SELECT MAX(d.HighPrice) FROM DailyWithMonth d
     WHERE d.TickerSymbol = m.TickerSymbol AND d.YearNum = m.YearNum
       AND d.MonthNum = m.MonthNum) AS "High",
    (SELECT MIN(d.LowPrice) FROM DailyWithMonth d
     WHERE d.TickerSymbol = m.TickerSymbol AND d.YearNum = m.YearNum
       AND d.MonthNum = m.MonthNum) AS "Low",
    (SELECT d.ClosePrice FROM DailyWithMonth d
     WHERE d.TickerSymbol = m.TickerSymbol AND d.YearNum = m.YearNum
       AND d.MonthNum = m.MonthNum AND d.PriceDate = m.MonthEndDate) AS "Close"
FROM MonthAgg m;

-- Last price date + row count per ticker
CREATE VIEW PriceHistory_LastDatePerTicker AS
SELECT
    TickerSymbol,
    MAX(PriceDate) AS LastPriceDate,
    COUNT(*) AS NumRows
FROM PriceHistory
GROUP BY TickerSymbol;

-- Oil & gas commodity analysis combining company, Durrett factors, and financials
CREATE VIEW vw_CommodityAnalysis_OilGas AS
SELECT
    c.TickerSymbol,
    c.CompanyName,
    c.PrimaryCommodity,
    c.SecondaryCommodity,
    c.IndustryClassification,
    df.AnalysisDate,
    df.CompositeScore,
    df.Recommendation,
    df.DataQualityScore,
    fm.StockPrice,
    fm.MarketCap_Billions,
    df.Factor_01_Properties,
    df.Factor_02_Management,
    df.Factor_03_ShareStructure,
    df.Factor_04_Location,
    df.Factor_05_Growth,
    df.Factor_06_MarketBuzz,
    df.Factor_07_CostStructure,
    df.Factor_08_CashDebt,
    df.Factor_09_Valuation,
    df.Factor_10_UpsidePotential
FROM Companies c
LEFT JOIN DurrettFactors_OilGas df ON c.TickerSymbol = df.TickerSymbol
LEFT JOIN FinancialMetrics_OilGas fm
    ON c.TickerSymbol = fm.TickerSymbol
   AND fm.AnalysisDate = df.AnalysisDate
WHERE c.DatabaseCategory = 'OilGas' OR c.PrimaryCommodity IN ('WTI Crude Oil', 'Natural Gas', 'Oil');
