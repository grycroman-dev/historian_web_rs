USE [HISTORIAN];
GO

-- Aktualizovat statistiky pro lepší query plány
UPDATE STATISTICS dbo.AuditRecord WITH FULLSCAN;
GO

-- Rebuild všech indexù pro optimální výkon a odstranìní fragmentace
ALTER INDEX ALL ON dbo.AuditRecord REBUILD;
GO

-- Zobrazit seznam všech indexù na tabulce AuditRecord
SELECT 
    i.name AS IndexName,
    i.type_desc AS IndexType,
    STUFF((
        SELECT ', ' + COL_NAME(ic.object_id, ic.column_id) + 
               CASE WHEN ic.is_included_column = 1 THEN ' (INCLUDE)' ELSE '' END
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id
        ORDER BY ic.key_ordinal, ic.is_included_column
        FOR XML PATH('')
    ), 1, 2, '') AS Columns
FROM sys.indexes i
WHERE i.object_id = OBJECT_ID('dbo.AuditRecord')
  AND i.name IS NOT NULL
ORDER BY i.name;
GO

-- Zobrazit statistiky použití indexù (pokud už nìjaké dotazy bìžely)
SELECT 
    i.name AS IndexName,
    s.user_seeks AS Seeks,
    s.user_scans AS Scans,
    s.user_lookups AS Lookups,
    s.user_updates AS Updates,
    s.last_user_seek AS LastSeek
FROM sys.dm_db_index_usage_stats s
INNER JOIN sys.indexes i ON s.object_id = i.object_id AND s.index_id = i.index_id
WHERE s.database_id = DB_ID('HISTORIAN')
  AND OBJECT_NAME(s.object_id) = 'AuditRecord'
  AND i.name IS NOT NULL
ORDER BY s.user_seeks + s.user_scans + s.user_lookups DESC;
GO

PRINT 'Indexy úspìšnì zrebuilovány a statistiky aktualizovány!';
GO
