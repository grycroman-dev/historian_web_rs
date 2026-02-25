-- =================================================================================
-- Script pro optimalizaci výkonu (Historian Web Performance Pack)
-- Verze: 2.2.0
-- Popis: 
--  1. Vytvoření indexů pro bleskové filtrování nad velkými daty (24M+ záznamů)
--  2. Optimalizace vyhledávání podle zařízení, frekvence a vlastností
--  3. Aktualizace statistik pro správnou funkci SARGable dotazů (datumové filtry)
-- =================================================================================

USE [RohdeSchwarz]
GO

PRINT 'Zahajuji optimalizaci databáze...';

-- 1. Index pro vyhledávání podle frekvence (tabulka Device je malá, ale index pomůže JOINu)
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Device_Frequency' AND object_id = OBJECT_ID(N'[dbo].[Device]'))
BEGIN
    PRINT 'Vytvářím index IX_Device_Frequency...';
    CREATE NONCLUSTERED INDEX [IX_Device_Frequency] ON [dbo].[Device] ([Frequency]);
END
GO

-- 2. Složený index pro optimalizované datumové filtry (SARGable)
-- Tento index je klíčový pro dotazy typu "posledních 7 dní pro konkrétní zařízení"
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_DeviceData_ModifiedOn_DeviceId' AND object_id = OBJECT_ID(N'[dbo].[DeviceData]'))
BEGIN
    PRINT 'Vytvářím index IX_DeviceData_ModifiedOn_DeviceId...';
    CREATE NONCLUSTERED INDEX [IX_DeviceData_ModifiedOn_DeviceId] 
    ON [dbo].[DeviceData] ([ModifiedOn] DESC, [DeviceId])
    INCLUDE ([DevicePropertyId], [NewValueReal]);
END
GO

-- 3. Aktualizace pohledu DeviceDataView pro podporu ID filtrů
PRINT 'Aktualizuji pohled [dbo].[DeviceDataView]...';
GO
CREATE OR ALTER VIEW [dbo].[DeviceDataView]
AS
SELECT DD.[Id]
      ,DD.[ModifiedOn]
	  ,D.[Name]
	  ,DR.[Name] AS [DeviceRegion]
	  ,DL.[Name] As [DeviceLocality]
	  ,D.[Frequency]
	  ,DT.[Name] AS [DeviceType]
	  ,DP.[Name] AS [DeviceProperty]      
      ,DD.[OldValue]
      ,DD.[NewValue]
      ,DD.[OldValueReal]
      ,DD.[NewValueReal]
	  ,DD.[DeviceId]
      ,DD.[DevicePropertyId]
  FROM [dbo].[DeviceData] AS DD WITH (NOLOCK)
  LEFT OUTER JOIN [dbo].[Device] AS D WITH (NOLOCK) ON D.[Id] = DD.[DeviceId]
  LEFT OUTER JOIN [dbo].[DeviceProperty] AS DP WITH (NOLOCK) ON DP.[Id] = DD.[DevicePropertyId]
  LEFT OUTER JOIN [dbo].[DeviceLocality] AS DL WITH (NOLOCK) ON DL.[Id] = D.[DeviceLocalityId]
  LEFT OUTER JOIN [dbo].[DeviceRegion] AS DR WITH (NOLOCK) ON DR.[Id] = D.[DeviceRegionId]
  LEFT OUTER JOIN [dbo].[DeviceType] AS DT WITH (NOLOCK) ON DT.[Id] = D.[DeviceTypeId]
GO

-- 4. Složený index pro vyhledávání podle zařízení a času
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_DeviceData_DeviceId_ModifiedOn' AND object_id = OBJECT_ID(N'[dbo].[DeviceData]'))
BEGIN
    PRINT 'Vytvářím index IX_DeviceData_DeviceId_ModifiedOn...';
    CREATE NONCLUSTERED INDEX [IX_DeviceData_DeviceId_ModifiedOn] 
    ON [dbo].[DeviceData] ([DeviceId], [ModifiedOn] DESC);
END
GO

-- 5. Index pro filtrování podle vlastnosti (pokud nebyl vytvořen v minulé verzi)
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_DeviceData_Property' AND object_id = OBJECT_ID(N'[dbo].[DeviceData]'))
BEGIN
    PRINT 'Vytvářím index IX_DeviceData_Property...';
    CREATE NONCLUSTERED INDEX [IX_DeviceData_Property] ON [dbo].[DeviceData] ([DevicePropertyId]);
END
GO

-- 5. Aktualizace statistik (NAPROSTO KLÍČOVÉ pro správný Query Plan u velkých tabulek)
-- Po vytvoření indexů a naplnění dat musí SQL Server vědět o distribuci hodnot.
PRINT 'Aktualizuji statistiky tabulky DeviceData (FULLSCAN)...';
UPDATE STATISTICS [dbo].[DeviceData] WITH FULLSCAN;
GO

PRINT '=======================================================';
PRINT 'Optimalizace byla úspěšně dokončena!';
PRINT '=======================================================';
GO
