USE [RohdeSchwarz]
GO
/****** Object:  User [rcomuser]    Script Date: 16.02.2026 9:23:51 ******/
CREATE USER [rcomuser] WITHOUT LOGIN WITH DEFAULT_SCHEMA=[dbo]
GO
ALTER ROLE [db_owner] ADD MEMBER [rcomuser]
GO
ALTER ROLE [db_accessadmin] ADD MEMBER [rcomuser]
GO
ALTER ROLE [db_datareader] ADD MEMBER [rcomuser]
GO
ALTER ROLE [db_datawriter] ADD MEMBER [rcomuser]
GO
/****** Object:  UserDefinedFunction [dbo].[fn_FilterSelectedValue]    Script Date: 16.02.2026 9:23:51 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO


-- =============================================
-- Author:		Michal Hase
-- Create date: 12.02.2026
-- Description:	Diferenční filtr pro hodnotu RSSI
-- =============================================
CREATE FUNCTION [dbo].[fn_FilterSelectedValue] 
(
	-- Add the parameters for the function here
	@IncommingValue NVARCHAR(250),
	@DevicePropertyId INT,
	@DeviceId INT,
	@OrderStep INT
)
RETURNS BIT
AS
BEGIN
	-- Declare the return variable here
	DECLARE @CanSave BIT
	DECLARE @SavedValue NVARCHAR(250)

	DECLARE @oldValInt INT
	DECLARE @newValInt INT

	SET @SavedValue = NULL
	SET @CanSave = 0

	-- Add the T-SQL statements to compute the return value here
	;WITH LastIds AS (
    SELECT TOP (1) Id
    FROM dbo.DeviceData
	WHERE DevicePropertyId = @DevicePropertyId
	AND DeviceId = @DeviceId
    ORDER BY ModifiedOn DESC
	)
	SELECT @SavedValue = d.NewValue
	FROM dbo.DeviceData d
	JOIN LastIds l ON d.Id = l.Id
	ORDER BY d.ModifiedOn DESC;

	IF (@IncommingValue IS NOT NULL) 
		SET @oldValInt = CONVERT (int, @IncommingValue);

	IF (@SavedValue IS NOT NULL) 
		SET @newValInt = CONVERT (int, @SavedValue);
	ELSE
		SET @newValInt = -500

	IF (ABS(@oldValInt - @newValInt) >= @OrderStep)
		SET @CanSave = 1

	-- Return the result of the function
	RETURN @CanSave
	
END
GO
/****** Object:  Table [dbo].[DeviceData]    Script Date: 16.02.2026 9:23:51 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[DeviceData](
	[Id] [int] IDENTITY(1,1) NOT NULL,
	[ModifiedOn] [datetime] NOT NULL,
	[DeviceId] [int] NOT NULL,
	[DevicePropertyId] [int] NOT NULL,
	[OldValue] [nvarchar](250) NOT NULL,
	[NewValue] [nvarchar](250) NOT NULL,
 CONSTRAINT [PK_DeviceData] PRIMARY KEY CLUSTERED 
(
	[Id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[DeviceLocality]    Script Date: 16.02.2026 9:23:51 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[DeviceLocality](
	[Id] [int] IDENTITY(1,1) NOT NULL,
	[Name] [nvarchar](250) NOT NULL,
 CONSTRAINT [PK_DeviceLocality] PRIMARY KEY CLUSTERED 
(
	[Id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[DeviceProperty]    Script Date: 16.02.2026 9:23:51 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[DeviceProperty](
	[Id] [int] IDENTITY(1,1) NOT NULL,
	[Name] [nvarchar](250) NOT NULL,
	[Type] [nvarchar](50) NOT NULL,
 CONSTRAINT [PK_DeviceProperty] PRIMARY KEY CLUSTERED 
(
	[Id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[DeviceType]    Script Date: 16.02.2026 9:23:51 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[DeviceType](
	[Id] [int] IDENTITY(1,1) NOT NULL,
	[Name] [nvarchar](250) NOT NULL,
 CONSTRAINT [PK_DeviceType] PRIMARY KEY CLUSTERED 
(
	[Id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[DeviceRegion]    Script Date: 16.02.2026 9:23:51 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[DeviceRegion](
	[Id] [int] IDENTITY(1,1) NOT NULL,
	[Name] [nvarchar](250) NOT NULL,
 CONSTRAINT [PK_DeviceRegion] PRIMARY KEY CLUSTERED 
(
	[Id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  Table [dbo].[Device]    Script Date: 16.02.2026 9:23:51 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[Device](
	[Id] [int] IDENTITY(1,1) NOT NULL,
	[Name] [nvarchar](250) NOT NULL,
	[Frequency] [nvarchar](250) NULL,
	[DeviceLocalityId] [int] NULL,
	[DeviceRegionId] [int] NULL,
	[DeviceTypeId] [int] NOT NULL,
 CONSTRAINT [PK_Device] PRIMARY KEY CLUSTERED 
(
	[Id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO
/****** Object:  View [dbo].[DeviceDataView]    Script Date: 16.02.2026 9:23:51 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO




CREATE VIEW [dbo].[DeviceDataView]
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
      ,CASE 
          WHEN DP.[Type] = 'STRING' THEN CAST(0 AS REAL)
          ELSE TRY_CAST(REPLACE(DD.[OldValue], ',', '.') AS REAL)
       END AS [OldValueReal]
      ,CASE 
          WHEN DP.[Type] = 'STRING' THEN CAST(0 AS REAL)
          ELSE TRY_CAST(REPLACE(DD.[NewValue], ',', '.') AS REAL)
       END AS [NewValueReal]
	  ,DD.[DeviceId]
  FROM [dbo].[DeviceData] AS DD WITH (NOLOCK)
  LEFT OUTER JOIN [dbo].[Device] AS D WITH (NOLOCK) ON D.[Id] = DD.[DeviceId]
  LEFT OUTER JOIN [dbo].[DeviceProperty] AS DP WITH (NOLOCK) ON DP.[Id] = DD.[DevicePropertyId]
  LEFT OUTER JOIN [dbo].[DeviceLocality] AS DL WITH (NOLOCK) ON DL.[Id] = D.[DeviceLocalityId]
  LEFT OUTER JOIN [dbo].[DeviceRegion] AS DR WITH (NOLOCK) ON DR.[Id] = D.[DeviceRegionId]
  LEFT OUTER JOIN [dbo].[DeviceType] AS DT WITH (NOLOCK) ON DT.[Id] = D.[DeviceTypeId]



GO
ALTER TABLE [dbo].[Device] ADD  CONSTRAINT [DF_Device_DeviceLocalityId]  DEFAULT ((1)) FOR [DeviceLocalityId]
GO
ALTER TABLE [dbo].[Device]  WITH CHECK ADD  CONSTRAINT [FK_Device_Device] FOREIGN KEY([Id])
REFERENCES [dbo].[Device] ([Id])
GO
ALTER TABLE [dbo].[Device] CHECK CONSTRAINT [FK_Device_Device]
GO
ALTER TABLE [dbo].[Device]  WITH CHECK ADD  CONSTRAINT [FK_Device_DeviceLocality] FOREIGN KEY([DeviceLocalityId])
REFERENCES [dbo].[DeviceLocality] ([Id])
GO
ALTER TABLE [dbo].[Device] CHECK CONSTRAINT [FK_Device_DeviceLocality]
GO
ALTER TABLE [dbo].[Device]  WITH CHECK ADD  CONSTRAINT [FK_Device_DeviceRegion] FOREIGN KEY([DeviceRegionId])
REFERENCES [dbo].[DeviceRegion] ([Id])
GO
ALTER TABLE [dbo].[Device] CHECK CONSTRAINT [FK_Device_DeviceRegion]
GO
ALTER TABLE [dbo].[Device]  WITH CHECK ADD  CONSTRAINT [FK_Device_DeviceType] FOREIGN KEY([DeviceTypeId])
REFERENCES [dbo].[DeviceType] ([Id])
GO
ALTER TABLE [dbo].[Device] CHECK CONSTRAINT [FK_Device_DeviceType]
GO
ALTER TABLE [dbo].[DeviceData]  WITH CHECK ADD  CONSTRAINT [FK_DeviceData_Device] FOREIGN KEY([DeviceId])
REFERENCES [dbo].[Device] ([Id])
GO
ALTER TABLE [dbo].[DeviceData] CHECK CONSTRAINT [FK_DeviceData_Device]
GO
ALTER TABLE [dbo].[DeviceData]  WITH CHECK ADD  CONSTRAINT [FK_DeviceData_DeviceProperty] FOREIGN KEY([DevicePropertyId])
REFERENCES [dbo].[DeviceProperty] ([Id])
GO
ALTER TABLE [dbo].[DeviceData] CHECK CONSTRAINT [FK_DeviceData_DeviceProperty]
GO
/****** Object:  StoredProcedure [dbo].[SaveData]    Script Date: 16.02.2026 9:23:51 ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- =============================================
-- Author:		RG
-- Create date: 2015-08-18
-- Modify date: 2026-02-05 by MH
-- Description:	Ulozi data do prislusnych tabulek
--				Pokud nejsou ciselniky, vytvori je
-- =============================================
CREATE PROCEDURE [dbo].[SaveData]
	-- Add the parameters for the stored procedure here
	@ModifiedOn datetime,
	@Name nvarchar(250),
	@Region nvarchar(250),
	@Locality nvarchar(250),
	@Frequency nvarchar(250),
	@Type nvarchar(250),
	@Property nvarchar(250),
	@OldValue nvarchar(250),
	@NewValue nvarchar(250)
AS
BEGIN
	-- SET NOCOUNT ON added to prevent extra result sets from
	-- interfering with SELECT statements.
	SET NOCOUNT ON;
	
	IF @ModifiedOn IS NULL OR @Name IS NULL OR @Type IS NULL  OR @Property IS NULL OR @OldValue IS NULL OR @NewValue IS NULL BEGIN
		RAISERROR('SaveData detect argument NULL exception. The value should not be null.', 15, 1) -- with log 
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

	-- Zjistuji, jestli existuje zaznam pro Source
	SELECT @DeviceId = [Id] FROM [dbo].[Device] WITH (NOLOCK) WHERE [Name] = @Name
	IF (@DeviceId IS NULL) BEGIN
		--Print N'Device is null'
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
	
	-- Zjistuji, jestli existuje zaznam pro Property
	SELECT @PropertyId = [Id] FROM [dbo].[DeviceProperty] WITH (NOLOCK) WHERE [Name] = @Property
	if (@PropertyId IS NULL) BEGIN
		INSERT INTO [dbo].[DeviceProperty] ([Name], [Type]) VALUES (@Property, @PropertyType)
		SELECT @PropertyId = IDENT_CURRENT('DeviceProperty')
	END

	IF (@Property = 'RX_RSSI')
		SET @CanInsert = [dbo].[fn_FilterSelectedValue] (@NewValue, @PropertyId, @DeviceId, 2)
	
	IF (@CanInsert = 1)
		INSERT INTO [dbo].[DeviceData]
			   ([ModifiedOn]
			   ,[DeviceId]
			   ,[DevicePropertyId]
			   ,[OldValue]
			   ,[NewValue])
		 VALUES
			   (@ModifiedOn, @DeviceId, @PropertyId, @OldValue, @NewValue)
	
	COMMIT TRANSACTION

	SELECT IDENT_CURRENT('DeviceData') AS [DeviceDataId]

    RETURN IDENT_CURRENT('DeviceData')
END


GO
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Sledovaná promìnná zaøízení typu rádio R&S.' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'DeviceProperty'
GO
EXEC sys.sp_addextendedproperty @name=N'MS_DiagramPane1', @value=N'[0E232FF0-B466-11cf-A24F-00AA00A3EFFF, 1.00]
Begin DesignProperties = 
   Begin PaneConfigurations = 
      Begin PaneConfiguration = 0
         NumPanes = 4
         Configuration = "(H (1[40] 4[20] 2[20] 3) )"
      End
      Begin PaneConfiguration = 1
         NumPanes = 3
         Configuration = "(H (1 [50] 4 [25] 3))"
      End
      Begin PaneConfiguration = 2
         NumPanes = 3
         Configuration = "(H (1 [50] 2 [25] 3))"
      End
      Begin PaneConfiguration = 3
         NumPanes = 3
         Configuration = "(H (4 [30] 2 [40] 3))"
      End
      Begin PaneConfiguration = 4
         NumPanes = 2
         Configuration = "(H (1 [56] 3))"
      End
      Begin PaneConfiguration = 5
         NumPanes = 2
         Configuration = "(H (2 [66] 3))"
      End
      Begin PaneConfiguration = 6
         NumPanes = 2
         Configuration = "(H (4 [50] 3))"
      End
      Begin PaneConfiguration = 7
         NumPanes = 1
         Configuration = "(V (3))"
      End
      Begin PaneConfiguration = 8
         NumPanes = 3
         Configuration = "(H (1[56] 4[18] 2) )"
      End
      Begin PaneConfiguration = 9
         NumPanes = 2
         Configuration = "(H (1 [75] 4))"
      End
      Begin PaneConfiguration = 10
         NumPanes = 2
         Configuration = "(H (1[66] 2) )"
      End
      Begin PaneConfiguration = 11
         NumPanes = 2
         Configuration = "(H (4 [60] 2))"
      End
      Begin PaneConfiguration = 12
         NumPanes = 1
         Configuration = "(H (1) )"
      End
      Begin PaneConfiguration = 13
         NumPanes = 1
         Configuration = "(V (4))"
      End
      Begin PaneConfiguration = 14
         NumPanes = 1
         Configuration = "(V (2))"
      End
      ActivePaneConfig = 0
   End
   Begin DiagramPane = 
      Begin Origin = 
         Top = 0
         Left = 0
      End
      Begin Tables = 
         Begin Table = "Device"
            Begin Extent = 
               Top = 9
               Left = 36
               Bottom = 129
               Right = 203
            End
            DisplayFlags = 280
            TopColumn = 0
         End
         Begin Table = "DeviceData"
            Begin Extent = 
               Top = 160
               Left = 21
               Bottom = 280
               Right = 194
            End
            DisplayFlags = 280
            TopColumn = 2
         End
         Begin Table = "DeviceLocality"
            Begin Extent = 
               Top = 8
               Left = 510
               Bottom = 98
               Right = 670
            End
            DisplayFlags = 280
            TopColumn = 0
         End
         Begin Table = "DeviceProperty"
            Begin Extent = 
               Top = 117
               Left = 505
               Bottom = 207
               Right = 665
            End
            DisplayFlags = 280
            TopColumn = 0
         End
         Begin Table = "DeviceType"
            Begin Extent = 
               Top = 239
               Left = 360
               Bottom = 329
               Right = 520
            End
            DisplayFlags = 280
            TopColumn = 0
         End
      End
   End
   Begin SQLPane = 
   End
   Begin DataPane = 
      Begin ParameterDefaults = ""
      End
   End
   Begin CriteriaPane = 
      Begin ColumnWidths = 11
         Column = 1440
         Alias = 2085
         Table = 1335
         Output = 720
         Append = 1400
         NewValue = 1170
         SortType = 1350
         SortOrder = 1410
         GroupBy = 1350
         Filter = 1350
         Or = 1350
         Or = 1350' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'VIEW',@level1name=N'DeviceDataView'
GO
EXEC sys.sp_addextendedproperty @name=N'MS_DiagramPane2', @value=N'
         Or = 1350
      End
   End
End
' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'VIEW',@level1name=N'DeviceDataView'
GO
EXEC sys.sp_addextendedproperty @name=N'MS_DiagramPaneCount', @value=2 , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'VIEW',@level1name=N'DeviceDataView'
GO
