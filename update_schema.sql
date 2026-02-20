USE [RohdeSchwarz];
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[DeviceData]') AND name = 'OldValueReal')
BEGIN
    ALTER TABLE [dbo].[DeviceData] ADD [OldValueReal] REAL NULL;
    ALTER TABLE [dbo].[DeviceData] ADD [NewValueReal] REAL NULL;
END
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

	SELECT @DeviceId = [Id] FROM [dbo].[Device] WITH (NOLOCK) WHERE [Name] = @Name
	IF (@DeviceId IS NULL) BEGIN
		IF (@Region IS NOT NULL) BEGIN
			SELECT @RegionId = [Id] FROM [dbo].[DeviceRegion] WITH (NOLOCK) WHERE [Name] = @Region
			if (@RegionId IS NULL) BEGIN
				INSERT INTO [dbo].[DeviceRegion] ([Name]) VALUES (@Region)
				SELECT @RegionId = IDENT_CURRENT('DeviceRegion')
			END
		END

		IF (@Locality IS NOT NULL) BEGIN
			SELECT @LocalityId = [Id] FROM [dbo].[DeviceLocality] WITH (NOLOCK) WHERE [Name] = @Locality
			if (@LocalityId IS NULL) BEGIN
				INSERT INTO [dbo].[DeviceLocality] ([Name]) VALUES (@Locality)
				SELECT @LocalityId = IDENT_CURRENT('DeviceLocality')
			END
		END

		SELECT @TypeId = [Id] FROM [dbo].[DeviceType] WITH (NOLOCK) WHERE [Name] = @Type
		IF (@TypeId IS NULL) BEGIN
			INSERT INTO [dbo].[DeviceType] ([Name]) VALUES (@Type)
			SELECT @TypeId = IDENT_CURRENT('DeviceType')
		END

		INSERT INTO [dbo].[Device] ([Name], [DeviceRegionId], [DeviceLocalityId], [Frequency], [DeviceTypeId] ) VALUES (@Name, @RegionId, @LocalityId, @Frequency, @TypeId)
		SELECT @DeviceId = IDENT_CURRENT('Device')
	END
	
	SELECT @PropertyId = [Id] FROM [dbo].[DeviceProperty] WITH (NOLOCK) WHERE [Name] = @Property
	if (@PropertyId IS NULL) BEGIN
		INSERT INTO [dbo].[DeviceProperty] ([Name], [Type]) VALUES (@Property, @PropertyType)
		SELECT @PropertyId = IDENT_CURRENT('DeviceProperty')
	END

	--IF (@Property = 'RX_RSSI')
	--	SET @CanInsert = [dbo].[fn_FilterSelectedValue] (@NewValue, @PropertyId, @DeviceId, 2)
	
	IF (@CanInsert = 1) BEGIN
	    DECLARE @OldValueReal REAL
	    DECLARE @NewValueReal REAL

	    IF @PropertyType = 'STRING' BEGIN
		    SET @OldValueReal = 0
		    SET @NewValueReal = 0
	    END ELSE BEGIN
		    SET @OldValueReal = TRY_CAST(REPLACE(@OldValue, ',', '.') AS REAL)
		    SET @NewValueReal = TRY_CAST(REPLACE(@NewValue, ',', '.') AS REAL)
	    END

		INSERT INTO [dbo].[DeviceData]
			   ([ModifiedOn]
			   ,[DeviceId]
			   ,[DevicePropertyId]
			   ,[OldValue]
			   ,[NewValue]
               ,[OldValueReal]
               ,[NewValueReal])
		 VALUES
			   (@ModifiedOn, @DeviceId, @PropertyId, @OldValue, @NewValue, @OldValueReal, @NewValueReal)
    END
	
	COMMIT TRANSACTION

	SELECT IDENT_CURRENT('DeviceData') AS [DeviceDataId]
    RETURN IDENT_CURRENT('DeviceData')
END
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
      ,ISNULL(DD.[OldValueReal], CASE WHEN DP.[Type] = 'STRING' THEN CAST(0 AS REAL) ELSE TRY_CAST(REPLACE(DD.[OldValue], ',', '.') AS REAL) END) AS [OldValueReal]
      ,ISNULL(DD.[NewValueReal], CASE WHEN DP.[Type] = 'STRING' THEN CAST(0 AS REAL) ELSE TRY_CAST(REPLACE(DD.[NewValue], ',', '.') AS REAL) END) AS [NewValueReal]
	  ,DD.[DeviceId]
  FROM [dbo].[DeviceData] AS DD WITH (NOLOCK)
  LEFT OUTER JOIN [dbo].[Device] AS D WITH (NOLOCK) ON D.[Id] = DD.[DeviceId]
  LEFT OUTER JOIN [dbo].[DeviceProperty] AS DP WITH (NOLOCK) ON DP.[Id] = DD.[DevicePropertyId]
  LEFT OUTER JOIN [dbo].[DeviceLocality] AS DL WITH (NOLOCK) ON DL.[Id] = D.[DeviceLocalityId]
  LEFT OUTER JOIN [dbo].[DeviceRegion] AS DR WITH (NOLOCK) ON DR.[Id] = D.[DeviceRegionId]
  LEFT OUTER JOIN [dbo].[DeviceType] AS DT WITH (NOLOCK) ON DT.[Id] = D.[DeviceTypeId]
GO

DECLARE @rows INT = 1;
WHILE @rows > 0
BEGIN
    UPDATE TOP (10000) DD
    SET DD.OldValueReal = CASE WHEN DP.[Type] = 'STRING' THEN CAST(0 AS REAL) ELSE TRY_CAST(REPLACE(DD.[OldValue], ',', '.') AS REAL) END,
        DD.NewValueReal = CASE WHEN DP.[Type] = 'STRING' THEN CAST(0 AS REAL) ELSE TRY_CAST(REPLACE(DD.[NewValue], ',', '.') AS REAL) END
    FROM [dbo].[DeviceData] DD
    JOIN [dbo].[DeviceProperty] DP ON DP.Id = DD.DevicePropertyId
    WHERE DD.OldValueReal IS NULL;
    
    SET @rows = @@ROWCOUNT;
END
GO
