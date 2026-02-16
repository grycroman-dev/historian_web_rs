USE [HISTORIAN];
GO

-- 1) Index pro rychlé filtrování a řazení podle data
--    INCLUDE přidává sloupce, které se často zobrazují → rychlejší "covering index"
CREATE NONCLUSTERED INDEX IX_AuditRecord_DateOcurred
ON dbo.AuditRecord (DateOcurred DESC)
INCLUDE ([User], Cluster, Equipment, Item, Message, AlarmState, AuditType);
GO

-- 2) Index pro rychlé JOIN na tabulku Hierarchy
CREATE NONCLUSTERED INDEX IX_AuditRecord_Hierarchy
ON dbo.AuditRecord (Cluster, Equipment, Item)
INCLUDE (DateOcurred, Id);
GO

-- 3) Index pro filtrování podle uživatele
CREATE NONCLUSTERED INDEX IX_AuditRecord_User
ON dbo.AuditRecord ([User]);
GO

-- 4) Index pro filtrování podle stavu alarmu
CREATE NONCLUSTERED INDEX IX_AuditRecord_AlarmState
ON dbo.AuditRecord (AlarmState);
GO

-- 5) Index pro filtrování podle typu auditu
CREATE NONCLUSTERED INDEX IX_AuditRecord_AuditType
ON dbo.AuditRecord (AuditType);
GO

-- 6) Kompozitní index pro časté dotazy s datem + uživatelem
CREATE NONCLUSTERED INDEX IX_AuditRecord_DateUser
ON dbo.AuditRecord (DateOcurred DESC, [User]);
GO

-- 7) Index pro sloupec Message (pro LIKE '%text%' bude stále pomalý, ale lepší než bez indexu)
--    Pozor: LIKE '%text%' nemůže použít index efektivně, ale LIKE 'text%' ano
CREATE NONCLUSTERED INDEX IX_AuditRecord_Message
ON dbo.AuditRecord (Message);
GO

-- 8) Aktualizovat statistiky pro lepší query plány
UPDATE STATISTICS dbo.AuditRecord WITH FULLSCAN;
GO

-- 9) Rebuild všech indexů pro optimální výkon
ALTER INDEX ALL ON dbo.AuditRecord REBUILD;
GO
