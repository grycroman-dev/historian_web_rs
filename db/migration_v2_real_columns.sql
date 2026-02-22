-- =================================================================================
-- Migration Script: Add Real Columns and Update Logic (Production Ready)
-- Date: 2026-02-22
-- Version: 2.1.8
-- Description: 
--  1. Adds OldValueReal and NewValueReal to DeviceData (NULLable first)
--  2. Backfills data from string columns in safe batches (to avoid log overflow)
--  3. Sets columns to NOT NULL
--  4. Updates SaveData procedure and DeviceDataView
--  5. Creates performance indexes
--  6. Updates statistics
-- =================================================================================

USE [RohdeSchwarz]
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

PRINT 'Starting production migration...';

-- 1. Přidání sloupců do tabulky DeviceData (pokud neexistují)
-- Sloupce musí být nejdříve NULLable, abychom mohli data naplnit postupně.
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[DeviceData]') AND name = N'OldValueReal')
BEGIN
    PRINT 'Adding [OldValueReal] column...';
    ALTER TABLE [dbo].[DeviceData] ADD [OldValueReal] [real] NULL;
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[DeviceData]') AND name = N'NewValueReal')
BEGIN
    PRINT 'Adding [NewValueReal] column...';
    ALTER TABLE [dbo].[DeviceData] ADD [NewValueReal] [real] NULL;
END
GO

-- 2. Bezpečný dávkový update (nezahltí transakční log a neblokuje celou tabulku)
PRINT 'Backfilling data in batches (50 000 rows per batch)...';
DECLARE @RowsAffected INT = 1;
DECLARE @TotalRows INT = 0;

WHILE (@RowsAffected > 0)
BEGIN
    UPDATE TOP (50000) [dbo].[DeviceData]
    SET 
        [OldValueReal] = ISNULL(TRY_CAST(REPLACE([OldValue], ',', '.') AS REAL), 0),
        [NewValueReal] = ISNULL(TRY_CAST(REPLACE([NewValue], ',', '.') AS REAL), 0)
    WHERE [OldValueReal] IS NULL OR [NewValueReal] IS NULL;
    
    SET @RowsAffected = @@ROWCOUNT;
    SET @TotalRows = @TotalRows + @RowsAffected;
    IF @RowsAffected > 0 PRINT 'Processed ' + CAST(@TotalRows AS VARCHAR(20)) + ' rows...';
END
GO

-- 3. Změna sloupců na NOT NULL (předpokládáme, že všechna data jsou nyní naplněna)
PRINT 'Setting columns to NOT NULL...';
ALTER TABLE [dbo].[DeviceData] ALTER COLUMN [OldValueReal] [real] NOT NULL;
ALTER TABLE [dbo].[DeviceData] ALTER COLUMN [NewValueReal] [real] NOT NULL;
GO

-- 4. Aktualizace procedury SaveData
PRINT 'Updating [dbo].[SaveData] procedure...';
GO
CREATE OR ALTER PROCEDURE [dbo].[SaveData]
	@ModifiedOn datetime,
	@Name nvarchar(250),
	@Region nvarchar(250),
	@Locality nvarchar(250),
	@Frequency nvarchar(250),
	@Type nvarchar(250),
	@Property nvarchar(250),
	@PropertyType nvarchar(250),
	@OldValue nvarchar(250),
	@NewValue nvarchar(250)
AS
BEGIN
	SET NOCOUNT ON;
	
	IF @ModifiedOn IS NULL OR @Name IS NULL OR @Type IS NULL OR @Property IS NULL OR @OldValue IS NULL OR @NewValue IS NULL BEGIN
		RAISERROR('SaveData detect argument NULL exception. The value should not be null.', 15, 1)
		RETURN -1
	END		
	
	DECLARE @RegionId INT
	DECLARE @LocalityId INT
	DECLARE @TypeId INT
	DECLARE @DeviceId INT
	DECLARE @PropertyId INT
	DECLARE @CanInsert BIT
	SET @CanInsert = 1
		
	BEGIN TRANSACTION

	-- Zjistujeme Id zarizeni (pokud neexistuje, zalozime)
	SELECT @DeviceId = [Id] FROM [dbo].[Device] WITH (NOLOCK) WHERE [Name] = @Name
	IF (@DeviceId IS NULL) BEGIN
		IF (@Region IS NOT NULL) BEGIN
			SELECT @RegionId = [Id] FROM [dbo].[DeviceRegion] WITH (NOLOCK) WHERE [Name] = @Region
			IF (@RegionId IS NULL) BEGIN
				INSERT INTO [dbo].[DeviceRegion] ([Name]) VALUES (@Region)
				SELECT @RegionId = SCOPE_IDENTITY()
			END
		END

		IF (@Locality IS NOT NULL) BEGIN
			SELECT @LocalityId = [Id] FROM [dbo].[DeviceLocality] WITH (NOLOCK) WHERE [Name] = @Locality
			IF (@LocalityId IS NULL) BEGIN
				INSERT INTO [dbo].[DeviceLocality] ([Name]) VALUES (@Locality)
				SELECT @LocalityId = SCOPE_IDENTITY()
			END
		END

		SELECT @TypeId = [Id] FROM [dbo].[DeviceType] WITH (NOLOCK) WHERE [Name] = @Type
		IF (@TypeId IS NULL) BEGIN
			INSERT INTO [dbo].[DeviceType] ([Name]) VALUES (@Type)
			SELECT @TypeId = SCOPE_IDENTITY()
		END

		INSERT INTO [dbo].[Device] ([Name], [DeviceRegionId], [DeviceLocalityId], [Frequency], [DeviceTypeId] ) 
		VALUES (@Name, @RegionId, @LocalityId, @Frequency, @TypeId)
		SELECT @DeviceId = SCOPE_IDENTITY()
	END
	
	-- Zjistujeme Id vlastnosti (pokud neexistuje, zalozime)
	SELECT @PropertyId = [Id] FROM [dbo].[DeviceProperty] WITH (NOLOCK) WHERE [Name] = @Property
	IF (@PropertyId IS NULL) BEGIN
		INSERT INTO [dbo].[DeviceProperty] ([Name], [Type]) VALUES (@Property, @PropertyType)
		SELECT @PropertyId = SCOPE_IDENTITY()
	END

	-- Volitelna filtrace (napr. pro RSSI)
	IF (@Property = 'RX_RSSI')
		SET @CanInsert = [dbo].[fn_FilterSelectedValue] (@NewValue, @PropertyId, @DeviceId, 2)
	
	IF (@CanInsert = 1) BEGIN
	    DECLARE @OldValueReal REAL
	    DECLARE @NewValueReal REAL

	    -- Prevod na REAL pro efektivni vyhledavani a grafy
	    IF @PropertyType = 'STRING' BEGIN
		    SET @OldValueReal = 0
		    SET @NewValueReal = 0
	    END ELSE BEGIN
		    SET @OldValueReal = ISNULL(TRY_CAST(REPLACE(@OldValue, ',', '.') AS REAL), 0)
		    SET @NewValueReal = ISNULL(TRY_CAST(REPLACE(@NewValue, ',', '.') AS REAL), 0)
	    END

		INSERT INTO [dbo].[DeviceData]
			   ([ModifiedOn], [DeviceId], [DevicePropertyId], [OldValue], [NewValue], [OldValueReal], [NewValueReal])
		 VALUES
			   (@ModifiedOn, @DeviceId, @PropertyId, @OldValue, @NewValue, @OldValueReal, @NewValueReal)
    END
	
	COMMIT TRANSACTION

	SELECT SCOPE_IDENTITY() AS [DeviceDataId]
    RETURN SCOPE_IDENTITY()
END
GO

-- 5. Aktualizace pohledu DeviceDataView
PRINT 'Updating [dbo].[DeviceDataView] view...';
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
  FROM [dbo].[DeviceData] AS DD WITH (NOLOCK)
  LEFT OUTER JOIN [dbo].[Device] AS D WITH (NOLOCK) ON D.[Id] = DD.[DeviceId]
  LEFT OUTER JOIN [dbo].[DeviceProperty] AS DP WITH (NOLOCK) ON DP.[Id] = DD.[DevicePropertyId]
  LEFT OUTER JOIN [dbo].[DeviceLocality] AS DL WITH (NOLOCK) ON DL.[Id] = D.[DeviceLocalityId]
  LEFT OUTER JOIN [dbo].[DeviceRegion] AS DR WITH (NOLOCK) ON DR.[Id] = D.[DeviceRegionId]
  LEFT OUTER JOIN [dbo].[DeviceType] AS DT WITH (NOLOCK) ON DT.[Id] = D.[DeviceTypeId]
GO

-- 6. Vytvoření indexů pro bleskové vyhledávání a filtrování
PRINT 'Creating indexes for performance (this may take a while)...';

-- Pro rychlé řazení a časové filtry
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_DeviceData_ModifiedOn' AND object_id = OBJECT_ID(N'[dbo].[DeviceData]'))
BEGIN
    PRINT 'Creating index IX_DeviceData_ModifiedOn...';
    CREATE NONCLUSTERED INDEX [IX_DeviceData_ModifiedOn] ON [dbo].[DeviceData] ([ModifiedOn] DESC);
END

-- Pro optimalizované vyhledávání (Pre-fetch) a filtry zařízení/vlastnosti
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_DeviceData_Device_Property' AND object_id = OBJECT_ID(N'[dbo].[DeviceData]'))
BEGIN
    PRINT 'Creating index IX_DeviceData_Device_Property...';
    CREATE NONCLUSTERED INDEX [IX_DeviceData_Device_Property] ON [dbo].[DeviceData] ([DeviceId], [DevicePropertyId]);
END

-- Pro nové číselné (REAL) filtry
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_DeviceData_OldValueReal' AND object_id = OBJECT_ID(N'[dbo].[DeviceData]'))
BEGIN
    PRINT 'Creating index IX_DeviceData_OldValueReal...';
    CREATE NONCLUSTERED INDEX [IX_DeviceData_OldValueReal] ON [dbo].[DeviceData] ([OldValueReal]);
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_DeviceData_NewValueReal' AND object_id = OBJECT_ID(N'[dbo].[DeviceData]'))
BEGIN
    PRINT 'Creating index IX_DeviceData_NewValueReal...';
    CREATE NONCLUSTERED INDEX [IX_DeviceData_NewValueReal] ON [dbo].[DeviceData] ([NewValueReal]);
END
GO

-- 7. Aktualizace statistik pro okamžitý špičkový výkon
PRINT 'Updating statistics for all indexes...';
UPDATE STATISTICS [dbo].[DeviceData] WITH FULLSCAN;
GO

PRINT '=======================================================';
PRINT 'Migration completed successfully!';
PRINT '=======================================================';
GO
