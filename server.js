const express = require('express');
const path = require('path');
const https = require('https');
const http = require('http');
const fs = require('fs');
const ExcelJS = require('exceljs'); // Added based on package.json
const { sql, getPool } = require('./config/db');

const app = express();
const HTTP_PORT = 3001;
const HTTPS_PORT = 3443;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Funkce pro escapování SQL hodnot (proti SQL injection)
function escapeSqlString(str) {
  return str.replace(/'/g, "''");
}

// Funkce pro escapování SQL LIKE speciálních znaků
function escapeLike(str) {
  return str
    .replace(/\\/g, '[\\]')
    .replace(/%/g, '[%]')
    .replace(/_/g, '[_]')
    .replace(/\[/g, '[[]')
    .replace(/\]/g, '[]]');
}

// Funkce pro přidání filtru (single nebo multi)
function addFilter(requestParams, whereConditions, paramName, dbColumn, values) {
  if (!values || values === 'false' || values === 'undefined') return;
  const vals = Array.isArray(values) ? values : [values];
  const cleanedVals = vals.filter(v => v !== null && v !== undefined && v !== '' && v !== 'false' && v !== 'undefined');
  if (cleanedVals.length === 0) return;

  if (cleanedVals.length === 1) {
    requestParams.input(paramName, sql.NVarChar, cleanedVals[0]);
    whereConditions.push(`${dbColumn} = @${paramName}`);
  } else {
    // Multi-select: IN (@p_0, @p_1, ...)
    const paramNames = [];
    cleanedVals.forEach((val, index) => {
      const pName = `${paramName}_${index}`;
      requestParams.input(pName, sql.NVarChar, val);
      paramNames.push(`@${pName}`);
    });
    whereConditions.push(`${dbColumn} IN (${paramNames.join(', ')})`);
  }
}

// Načtení filtrů (Region, Locality, Type, Property)
app.get('/api/filters', async (req, res) => {
  try {
    const dataSource = req.query.dataSource || 'main';
    const pool = await getPool(dataSource);

    // Načteme unikátní hodnoty pro filtry
    const regions = await pool.request().query('SELECT Name FROM dbo.DeviceRegion ORDER BY Name');
    const localities = await pool.request().query('SELECT Name FROM dbo.DeviceLocality ORDER BY Name');
    const types = await pool.request().query('SELECT Name FROM dbo.DeviceType ORDER BY Name');
    const properties = await pool.request().query('SELECT Name FROM dbo.DeviceProperty ORDER BY Name');
    // Frequency – stored directly in dbo.Device, no dedicated dimension table
    const frequencies = await pool.request().query("SELECT DISTINCT Frequency AS Name FROM dbo.Device WHERE Frequency IS NOT NULL AND Frequency != '' ORDER BY Frequency");
    // Devices
    const devices = await pool.request().query('SELECT Name FROM dbo.Device ORDER BY Name');

    res.json({
      regions: regions.recordset.map(r => r.Name),
      localities: localities.recordset.map(l => l.Name),
      types: types.recordset.map(t => t.Name),
      properties: properties.recordset.map(p => p.Name),
      frequencies: frequencies.recordset.map(f => f.Name),
      devices: devices.recordset.map(d => d.Name)
    });
  } catch (err) {
    console.error('Chyba při načítání filtrů:', err);
    res.status(500).json({ error: 'Chyba při načítání filtrů' });
  }
});

// Získání verze aplikace
app.get('/api/version', (req, res) => {
  try {
    const packageJson = require('./package.json');
    res.json({ version: packageJson.version });
  } catch (err) {
    console.error('Chyba při načítání verze:', err);
    res.status(500).json({ error: 'Chyba při načítání verze' });
  }
});

// Získání changelogu
app.get('/api/changelog', (req, res) => {
  try {
    const changelogPath = path.join(__dirname, 'CHANGELOG.md');
    if (fs.existsSync(changelogPath)) {
      const content = fs.readFileSync(changelogPath, 'utf8');
      res.json({ content });
    } else {
      res.json({ content: 'Changelog nebyl nalezen.' });
    }
  } catch (err) {
    console.error('Chyba při načítání changelogu:', err);
    res.status(500).json({ error: 'Chyba při načítání changelogu' });
  }
});

// Stažení changelogu
app.get('/api/changelog/download', (req, res) => {
  const changelogPath = path.join(__dirname, 'CHANGELOG.md');
  console.log('Download request for:', changelogPath);
  console.log('File exists:', fs.existsSync(changelogPath));

  fs.readFile(changelogPath, (err, data) => {
    if (err) {
      const errorMsg = `Read Error: ${err.message} Path: ${changelogPath}`;
      console.error(errorMsg);
      fs.writeFileSync(path.join(__dirname, 'server_error.txt'), errorMsg);
      res.status(500).send('Serverside error reading file.');
    } else {
      res.setHeader('Content-Type', 'text/markdown');
      res.setHeader('Content-Disposition', 'attachment; filename="CHANGELOG.md"');
      res.send(data);
    }
  });

});

// --- Graf dat: časová řada NewValueReal pro 1 zařízení + 1 vlastnost ---
app.get('/api/chart-data', async (req, res) => {
  try {
    const dataSource = req.query.dataSource || 'main';
    const pool = await getPool(dataSource);

    const device = req.query.device;
    const property = req.query.property;

    if (!device || !property) {
      return res.status(400).json({ error: 'Parametry device a property jsou povinné.' });
    }

    const request = pool.request();
    request.input('device', sql.NVarChar, device);
    request.input('property', sql.NVarChar, property);

    let whereClauses = [
      'Name = @device',
      'DeviceProperty = @property',
      'NewValueReal IS NOT NULL'
    ];

    if (req.query.dateFrom) {
      request.input('dateFrom', sql.Date, req.query.dateFrom);
      whereClauses.push('CAST(ModifiedOn AS DATE) >= @dateFrom');
    }
    if (req.query.dateTo) {
      request.input('dateTo', sql.Date, req.query.dateTo);
      whereClauses.push('CAST(ModifiedOn AS DATE) <= @dateTo');
    }
    if (req.query.timeFrom && req.query.timeFrom.trim() !== '') {
      request.input('timeFrom', sql.VarChar(5), req.query.timeFrom);
      whereClauses.push("CONVERT(CHAR(5), ModifiedOn, 108) >= @timeFrom");
    }
    if (req.query.timeTo && req.query.timeTo.trim() !== '') {
      request.input('timeTo', sql.VarChar(5), req.query.timeTo);
      whereClauses.push("CONVERT(CHAR(5), ModifiedOn, 108) <= @timeTo");
    }
    // Column text search na ModifiedOn (např. "09:4" z column filtru)
    if (req.query.colTimeSearch && req.query.colTimeSearch.trim() !== '') {
      const escaped = req.query.colTimeSearch.replace(/'/g, "''").replace(/%/g, '[%]').replace(/_/g, '[_]');
      whereClauses.push(`CONVERT(VARCHAR(23), ModifiedOn, 121) LIKE N'%${escaped}%'`);
    }

    const whereSQL = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';
    const query = `
      SELECT TOP 5000 ModifiedOn, NewValueReal
      FROM dbo.DeviceDataView
      ${whereSQL}
      ORDER BY ModifiedOn ASC
    `;

    const result = await request.query(query);
    const points = result.recordset.map(row => ({
      x: row.ModifiedOn,
      y: parseFloat(row.NewValueReal)
    }));

    res.json({ device, property, points, count: points.length });
  } catch (err) {
    console.error('Chyba /api/chart-data:', err);
    res.status(500).json({ error: 'Chyba při načítání dat pro graf.' });
  }
});

// --- Graf: Export do Excelu ---
app.get('/api/chart-data/excel', async (req, res) => {
  try {
    const dataSource = req.query.dataSource || 'main';
    const pool = await getPool(dataSource);

    const device = req.query.device;
    const property = req.query.property;

    if (!device || !property) {
      return res.status(400).json({ error: 'Parametry device a property jsou povinné.' });
    }

    const request = pool.request();
    request.input('device', sql.NVarChar, device);
    request.input('property', sql.NVarChar, property);

    let whereClauses = ['Name = @device', 'DeviceProperty = @property', 'NewValueReal IS NOT NULL'];

    if (req.query.dateFrom) { request.input('dateFrom', sql.Date, req.query.dateFrom); whereClauses.push('CAST(ModifiedOn AS DATE) >= @dateFrom'); }
    if (req.query.dateTo) { request.input('dateTo', sql.Date, req.query.dateTo); whereClauses.push('CAST(ModifiedOn AS DATE) <= @dateTo'); }
    if (req.query.timeFrom && req.query.timeFrom.trim()) { request.input('timeFrom', sql.VarChar(5), req.query.timeFrom); whereClauses.push("CONVERT(CHAR(5), ModifiedOn, 108) >= @timeFrom"); }
    if (req.query.timeTo && req.query.timeTo.trim()) { request.input('timeTo', sql.VarChar(5), req.query.timeTo); whereClauses.push("CONVERT(CHAR(5), ModifiedOn, 108) <= @timeTo"); }
    if (req.query.colTimeSearch && req.query.colTimeSearch.trim()) {
      const escaped = req.query.colTimeSearch.replace(/'/g, "''").replace(/%/g, '[%]').replace(/_/g, '[_]');
      whereClauses.push(`CONVERT(VARCHAR(23), ModifiedOn, 121) LIKE N'%${escaped}%'`);
    }

    const whereSQL = 'WHERE ' + whereClauses.join(' AND ');
    const result = await request.query(`SELECT TOP 5000 ModifiedOn, NewValueReal FROM dbo.DeviceDataView ${whereSQL} ORDER BY ModifiedOn ASC`);

    // Sestavení xlsx pomocí ExcelJS
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Historian Web';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Data grafu');

    // Záhlaví
    sheet.columns = [
      { header: 'Zařízení', key: 'device', width: 35 },
      { header: 'Vlastnost', key: 'property', width: 20 },
      { header: 'Čas (UTC)', key: 'time', width: 22 },
      { header: 'Nová hodnota', key: 'value', width: 16 },
    ];

    // Styl záhlaví
    sheet.getRow(1).eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    // Data
    result.recordset.forEach(row => {
      const dt = new Date(row.ModifiedOn);
      sheet.addRow({
        device,
        property,
        time: dt.toISOString().replace('T', ' ').substring(0, 19) + ' UTC',
        value: parseFloat(row.NewValueReal)
      });
    });

    // Zamrazení záhlaví a filtr
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = { from: 'A1', to: 'D1' };

    // Poznámka: ExcelJS nepodporuje přímé vytváření grafů při zápisu nového souboru.
    // Uživatel si může graf snadno vytvořit v Excelu z exportovaných dat (Vložit -> Graf).

    // Odešli soubor
    const safeDevice = device.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 30);
    const safeProperty = property.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 20);
    const dateStr = new Date().toISOString().substring(0, 10);
    const filename = `graf_${safeDevice}_${safeProperty}_${dateStr}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error('Chyba /api/chart-data/excel:', err.message, err.stack);
    res.status(500).json({ error: 'Chyba při generování Excel souboru: ' + err.message });
  }
});

// Načtení dat (DeviceDataView)
app.get('/api/devicedata', async (req, res) => {
  try {
    const dataSource = req.query.dataSource || 'main'; // 'main' or 'backup'
    const pool = await getPool(dataSource);

    console.log('DATA REQUEST Query:', req.query, 'Source:', dataSource);

    const draw = parseInt(req.query.draw) || 1;
    const start = parseInt(req.query.start) || 0;
    const length = parseInt(req.query.length) || 10;
    const searchValue = req.query['search[value]'] || '';
    const orderColIdx = parseInt(req.query['order[0][column]']) || 0;
    const orderDir = req.query['order[0][dir]'] === 'asc' ? 'ASC' : 'DESC';

    const columns = [
      'Id', 'ModifiedOn', 'Name', 'DeviceRegion', 'DeviceLocality',
      'Frequency', 'DeviceType', 'DeviceProperty', 'OldValue', 'NewValue',
      'OldValueReal', 'NewValueReal'
    ];

    const orderColumn = columns[orderColIdx] || 'Id';

    let whereConditions = [];
    const requestParams = pool.request();

    // Filtry dropdownů (Multi-select)
    addFilter(requestParams, whereConditions, 'region', 'DeviceRegion', req.query.region || req.query['region[]']);
    addFilter(requestParams, whereConditions, 'locality', 'DeviceLocality', req.query.locality || req.query['locality[]']);
    addFilter(requestParams, whereConditions, 'type', 'DeviceType', req.query.type || req.query['type[]']);
    addFilter(requestParams, whereConditions, 'property', 'DeviceProperty', req.query.property || req.query['property[]']);
    // Added Frequency filter
    addFilter(requestParams, whereConditions, 'frequency', 'Frequency', req.query.frequency || req.query['frequency[]']);
    // Added Device filter
    addFilter(requestParams, whereConditions, 'device', 'Name', req.query.device || req.query['device[]']);

    // Filtry data a času
    if (req.query.dateFrom) {
      requestParams.input('dateFrom', sql.Date, req.query.dateFrom);
      whereConditions.push('CAST(ModifiedOn AS DATE) >= @dateFrom');
    }
    if (req.query.dateTo) {
      requestParams.input('dateTo', sql.Date, req.query.dateTo);
      whereConditions.push('CAST(ModifiedOn AS DATE) <= @dateTo');
    }
    if (req.query.timeFrom && req.query.timeFrom.trim() !== '') {
      requestParams.input('timeFrom', sql.VarChar(5), req.query.timeFrom);
      whereConditions.push("CONVERT(CHAR(5), ModifiedOn, 108) >= @timeFrom");
    }
    if (req.query.timeTo && req.query.timeTo.trim() !== '') {
      requestParams.input('timeTo', sql.VarChar(5), req.query.timeTo);
      whereConditions.push("CONVERT(CHAR(5), ModifiedOn, 108) <= @timeTo");
    }

    if (searchValue) {
      const escapedSearch = escapeSqlString(escapeLike(searchValue));
      whereConditions.push(`(
        CAST(Id AS NVARCHAR(MAX)) LIKE N'%${escapedSearch}%' OR
        CONVERT(VARCHAR(23), ModifiedOn, 121) LIKE N'%${escapedSearch}%' OR
        Name LIKE N'%${escapedSearch}%' COLLATE Latin1_General_CI_AI OR
        DeviceRegion LIKE N'%${escapedSearch}%' COLLATE Latin1_General_CI_AI OR
        DeviceLocality LIKE N'%${escapedSearch}%' COLLATE Latin1_General_CI_AI OR
        Frequency LIKE N'%${escapedSearch}%' COLLATE Latin1_General_CI_AI OR
        DeviceType LIKE N'%${escapedSearch}%' COLLATE Latin1_General_CI_AI OR
        DeviceProperty LIKE N'%${escapedSearch}%' COLLATE Latin1_General_CI_AI OR
        OldValue LIKE N'%${escapedSearch}%' COLLATE Latin1_General_CI_AI OR
        NewValue LIKE N'%${escapedSearch}%' COLLATE Latin1_General_CI_AI
      )`);
    }

    for (let i = 0; i < columns.length; i++) {
      const val = req.query['col' + i];
      if (val && val.trim() !== '') {
        const colName = columns[i];
        const escapedVal = escapeSqlString(escapeLike(val));
        if (colName === 'Id' || colName === 'Frequency' || colName === 'OldValueReal' || colName === 'NewValueReal') whereConditions.push(`CAST(${colName} AS NVARCHAR(MAX)) LIKE N'%${escapedVal}%' COLLATE Latin1_General_CI_AI`);
        else if (colName === 'ModifiedOn') whereConditions.push(`CONVERT(VARCHAR(23), ${colName}, 121) LIKE N'%${escapedVal}%'`);
        else whereConditions.push(`${colName} LIKE N'%${escapedVal}%' COLLATE Latin1_General_CI_AI`);
      }
    }

    const whereClause = whereConditions.length ? 'WHERE ' + whereConditions.join(' AND ') : '';

    const totalRes = await pool.request().query('SELECT COUNT(*) AS cnt FROM dbo.DeviceDataView');
    const recordsTotal = totalRes.recordset[0].cnt;

    const countQuery = `SELECT COUNT(*) AS cnt FROM dbo.DeviceDataView ${whereClause}`;
    const filtRes = await requestParams.query(countQuery);
    const recordsFiltered = filtRes.recordset[0].cnt;

    const dataQuery = `
      SELECT *
      FROM dbo.DeviceDataView
      ${whereClause}
      ORDER BY ${orderColumn} ${orderDir}
      OFFSET ${start} ROWS 
      FETCH NEXT ${length} ROWS ONLY
    `;

    const dataRes = await requestParams.query(dataQuery);

    res.json({
      draw,
      recordsTotal,
      recordsFiltered,
      data: dataRes.recordset
    });

  } catch (err) {
    console.error('Chyba při načítání dat:', err);
    res.json({
      draw: parseInt(req.query.draw) || 1,
      recordsTotal: 0,
      recordsFiltered: 0,
      data: [],
      error: 'Chyba při načítání dat: ' + err.message
    });
  }
});

// --- Získání statistik (asynchronně vůči tabulce) ---
app.get('/api/stats', async (req, res) => {
  try {
    const dataSource = req.query.dataSource || 'main';
    const pool = await getPool(dataSource);

    const searchValue = req.query['search[value]'] || '';
    const columns = [
      'Id', 'ModifiedOn', 'Name', 'DeviceRegion', 'DeviceLocality',
      'Frequency', 'DeviceType', 'DeviceProperty', 'OldValue', 'NewValue',
      'OldValueReal', 'NewValueReal'
    ];

    let whereConditions = [];
    const requestParams = pool.request();

    addFilter(requestParams, whereConditions, 'region', 'DeviceRegion', req.query.region || req.query['region[]']);
    addFilter(requestParams, whereConditions, 'locality', 'DeviceLocality', req.query.locality || req.query['locality[]']);
    addFilter(requestParams, whereConditions, 'type', 'DeviceType', req.query.type || req.query['type[]']);
    addFilter(requestParams, whereConditions, 'property', 'DeviceProperty', req.query.property || req.query['property[]']);
    addFilter(requestParams, whereConditions, 'frequency', 'Frequency', req.query.frequency || req.query['frequency[]']);
    addFilter(requestParams, whereConditions, 'device', 'Name', req.query.device || req.query['device[]']);

    if (req.query.dateFrom) { requestParams.input('dateFrom', sql.Date, req.query.dateFrom); whereConditions.push('CAST(ModifiedOn AS DATE) >= @dateFrom'); }
    if (req.query.dateTo) { requestParams.input('dateTo', sql.Date, req.query.dateTo); whereConditions.push('CAST(ModifiedOn AS DATE) <= @dateTo'); }
    if (req.query.timeFrom && req.query.timeFrom.trim() !== '') { requestParams.input('timeFrom', sql.VarChar(5), req.query.timeFrom); whereConditions.push("CONVERT(CHAR(5), ModifiedOn, 108) >= @timeFrom"); }
    if (req.query.timeTo && req.query.timeTo.trim() !== '') { requestParams.input('timeTo', sql.VarChar(5), req.query.timeTo); whereConditions.push("CONVERT(CHAR(5), ModifiedOn, 108) <= @timeTo"); }

    if (searchValue) {
      const escapedSearch = escapeSqlString(escapeLike(searchValue));
      whereConditions.push(`(
        CAST(Id AS NVARCHAR(MAX)) LIKE N'%${escapedSearch}%' OR
        CONVERT(VARCHAR(23), ModifiedOn, 121) LIKE N'%${escapedSearch}%' OR
        Name LIKE N'%${escapedSearch}%' COLLATE Latin1_General_CI_AI OR
        DeviceRegion LIKE N'%${escapedSearch}%' COLLATE Latin1_General_CI_AI OR
        DeviceLocality LIKE N'%${escapedSearch}%' COLLATE Latin1_General_CI_AI OR
        Frequency LIKE N'%${escapedSearch}%' COLLATE Latin1_General_CI_AI OR
        DeviceType LIKE N'%${escapedSearch}%' COLLATE Latin1_General_CI_AI OR
        DeviceProperty LIKE N'%${escapedSearch}%' COLLATE Latin1_General_CI_AI OR
        OldValue LIKE N'%${escapedSearch}%' COLLATE Latin1_General_CI_AI OR
        NewValue LIKE N'%${escapedSearch}%' COLLATE Latin1_General_CI_AI
      )`);
    }

    for (let i = 0; i < columns.length; i++) {
      const val = req.query['col' + i];
      if (val && val.trim() !== '') {
        const colName = columns[i];
        const escapedVal = escapeSqlString(escapeLike(val));
        if (colName === 'Id' || colName === 'Frequency' || colName === 'OldValueReal' || colName === 'NewValueReal') whereConditions.push(`CAST(${colName} AS NVARCHAR(MAX)) LIKE N'%${escapedVal}%' COLLATE Latin1_General_CI_AI`);
        else if (colName === 'ModifiedOn') whereConditions.push(`CONVERT(VARCHAR(23), ${colName}, 121) LIKE N'%${escapedVal}%'`);
        else whereConditions.push(`${colName} LIKE N'%${escapedVal}%' COLLATE Latin1_General_CI_AI`);
      }
    }

    const whereClause = whereConditions.length ? 'WHERE ' + whereConditions.join(' AND ') : '';

    let stats = { count1h: 0, count24h: 0, topDevice: '-', topProperty: '-', topFrequency: '-' };
    const statsQuery = `
      SELECT 
        COUNT(CASE WHEN ModifiedOn >= DATEADD(hour, -1, GETUTCDATE()) THEN 1 END) as count1h,
        COUNT(CASE WHEN ModifiedOn >= DATEADD(day, -1, GETUTCDATE()) THEN 1 END) as count24h
      FROM dbo.DeviceDataView ${whereClause};

      SELECT TOP 1 Name as val FROM dbo.DeviceDataView ${whereClause} GROUP BY Name ORDER BY COUNT(*) DESC;
      SELECT TOP 1 DeviceProperty as val FROM dbo.DeviceDataView ${whereClause} GROUP BY DeviceProperty ORDER BY COUNT(*) DESC;
      SELECT TOP 1 Frequency as val FROM dbo.DeviceDataView ${whereClause} GROUP BY Frequency ORDER BY COUNT(*) DESC;
    `;
    const statsRes = await requestParams.query(statsQuery);

    if (statsRes.recordsets && statsRes.recordsets.length >= 4) {
      const counts = statsRes.recordsets[0][0];
      stats.count1h = counts.count1h;
      stats.count24h = counts.count24h;
      stats.topDevice = statsRes.recordsets[1][0]?.val || '-';
      stats.topProperty = statsRes.recordsets[2][0]?.val || '-';
      stats.topFrequency = statsRes.recordsets[3][0]?.val || '-';
    }

    res.json(stats);
  } catch (err) {
    console.error('Chyba při výpočtu statistik:', err);
    res.status(500).json({ error: 'Chyba při výpočtu statistik' });
  }
});

// CSV export
app.get('/api/devicedata/csv', async (req, res) => {
  try {
    const dataSource = req.query.dataSource || 'main'; // 'main' or 'backup'
    const pool = await getPool(dataSource);
    const requestParams = pool.request();

    const searchValue = req.query.search || '';
    const orderColIdx = parseInt(req.query.orderCol) || 0;
    const orderDir = req.query.orderDir === 'asc' ? 'ASC' : 'DESC';

    const columns = [
      'Id', 'ModifiedOn', 'Name', 'DeviceRegion', 'DeviceLocality',
      'Frequency', 'DeviceType', 'DeviceProperty', 'OldValue', 'NewValue',
      'OldValueReal', 'NewValueReal'
    ];
    const orderColumn = columns[orderColIdx] || 'Id';

    let whereConditions = [];

    addFilter(requestParams, whereConditions, 'region', 'DeviceRegion', req.query.region || req.query['region[]']);
    addFilter(requestParams, whereConditions, 'locality', 'DeviceLocality', req.query.locality || req.query['locality[]']);
    addFilter(requestParams, whereConditions, 'type', 'DeviceType', req.query.type || req.query['type[]']);
    addFilter(requestParams, whereConditions, 'property', 'DeviceProperty', req.query.property || req.query['property[]']);
    // Added Frequency filter
    addFilter(requestParams, whereConditions, 'frequency', 'Frequency', req.query.frequency || req.query['frequency[]']);
    // Added Device filter
    addFilter(requestParams, whereConditions, 'device', 'Name', req.query.device || req.query['device[]']);

    if (req.query.dateFrom) { requestParams.input('dateFrom', sql.Date, req.query.dateFrom); whereConditions.push('CAST(ModifiedOn AS DATE) >= @dateFrom'); }
    if (req.query.dateTo) { requestParams.input('dateTo', sql.Date, req.query.dateTo); whereConditions.push('CAST(ModifiedOn AS DATE) <= @dateTo'); }
    if (req.query.timeFrom) { requestParams.input('timeFrom', sql.VarChar(5), req.query.timeFrom); whereConditions.push("CONVERT(CHAR(5), ModifiedOn, 108) >= @timeFrom"); }
    if (req.query.timeTo) { requestParams.input('timeTo', sql.VarChar(5), req.query.timeTo); whereConditions.push("CONVERT(CHAR(5), ModifiedOn, 108) <= @timeTo"); }

    if (searchValue) {
      const escapedSearch = escapeSqlString(escapeLike(searchValue));
      whereConditions.push(`(
        CAST(Id AS NVARCHAR(MAX)) LIKE N'%${escapedSearch}%' OR
        CONVERT(VARCHAR(23), ModifiedOn, 121) LIKE N'%${escapedSearch}%' OR
        Name LIKE N'%${escapedSearch}%' COLLATE Latin1_General_CI_AI OR
        DeviceRegion LIKE N'%${escapedSearch}%' COLLATE Latin1_General_CI_AI OR
        DeviceLocality LIKE N'%${escapedSearch}%' COLLATE Latin1_General_CI_AI OR
        Frequency LIKE N'%${escapedSearch}%' COLLATE Latin1_General_CI_AI OR
        DeviceType LIKE N'%${escapedSearch}%' COLLATE Latin1_General_CI_AI OR
        DeviceProperty LIKE N'%${escapedSearch}%' COLLATE Latin1_General_CI_AI OR
        OldValue LIKE N'%${escapedSearch}%' COLLATE Latin1_General_CI_AI OR
        NewValue LIKE N'%${escapedSearch}%' COLLATE Latin1_General_CI_AI
      )`);
    }

    for (let i = 0; i < columns.length; i++) {
      const val = req.query['col' + i];
      if (val && val.trim() !== '') {
        const colName = columns[i];
        const escapedVal = escapeSqlString(escapeLike(val));
        if (colName === 'Id' || colName === 'Frequency' || colName === 'OldValueReal' || colName === 'NewValueReal') whereConditions.push(`CAST(${colName} AS NVARCHAR(MAX)) LIKE N'%${escapedVal}%' COLLATE Latin1_General_CI_AI`);
        else if (colName === 'ModifiedOn') whereConditions.push(`CONVERT(VARCHAR(23), ${colName}, 121) LIKE N'%${escapedVal}%'`);
        else whereConditions.push(`${colName} LIKE N'%${escapedVal}%' COLLATE Latin1_General_CI_AI`);
      }
    }

    const whereClause = whereConditions.length ? 'WHERE ' + whereConditions.join(' AND ') : '';

    const sqlText = `
      SELECT *
      FROM dbo.DeviceDataView
      ${whereClause}
      ORDER BY ${orderColumn} ${orderDir}
    `;
    const visibleCols = req.query.visibleCols ? req.query.visibleCols.split(',').map(Number) : null;
    const allColsDef = [
      { key: 'Id', label: 'Id' },
      { key: 'ModifiedOn', label: 'Datum' },
      { key: 'Name', label: 'Zařízení' },
      { key: 'DeviceRegion', label: 'Region' },
      { key: 'DeviceLocality', label: 'Lokalita' },
      { key: 'Frequency', label: 'Frekvence' },
      { key: 'DeviceType', label: 'Typ' },
      { key: 'DeviceProperty', label: 'Vlastnost' },
      { key: 'OldValue', label: 'Stará hodnota' },
      { key: 'NewValue', label: 'Nová hodnota' },
      { key: 'OldValueReal', label: 'Stará hod. (REAL)' },
      { key: 'NewValueReal', label: 'Nová hod. (REAL)' }
    ];

    const exportCols = visibleCols ? allColsDef.filter((_, idx) => visibleCols.includes(idx)) : allColsDef;

    const result = await requestParams.query(sqlText);
    const rows = result.recordset;

    // Header
    let csv = exportCols.map(c => c.label).join(';') + '\n';

    // Rows
    rows.forEach(r => {
      const esc = s => `"${String(s || '').replace(/"/g, '""')}"`;
      csv += exportCols.map(c => {
        const val = r[c.key];
        if (c.key === 'ModifiedOn') return val ? val.toISOString().replace('T', ' ').substring(0, 19) : '';
        if (c.key.endsWith('Real')) return val != null ? val : '';
        return esc(val);
      }).join(';') + '\n';
    });

    const timestamp = new Date().toISOString().replace(/T/, '_').replace(/:/g, '-').split('.')[0];
    const filename = `historian_export_${timestamp}.csv`;

    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.attachment(filename);
    // Add UTF-8 BOM for Excel compatibility
    res.send('\uFEFF' + csv);

  } catch (err) {
    console.error('Chyba při exportu CSV:', err);
    res.status(500).send('Chyba při exportu CSV');
  }
});



// XLSX export
app.get('/api/devicedata/xlsx', async (req, res) => {
  try {
    const dataSource = req.query.dataSource || 'main'; // 'main' or 'backup'
    const pool = await getPool(dataSource);
    const requestParams = pool.request();

    const searchValue = req.query.search || '';
    const orderColIdx = parseInt(req.query.orderCol) || 0;
    const orderDir = req.query.orderDir === 'asc' ? 'ASC' : 'DESC';

    const columns = [
      'Id', 'ModifiedOn', 'Name', 'DeviceRegion', 'DeviceLocality',
      'Frequency', 'DeviceType', 'DeviceProperty', 'OldValue', 'NewValue',
      'OldValueReal', 'NewValueReal'
    ];
    const orderColumn = columns[orderColIdx] || 'Id';

    let whereConditions = [];

    addFilter(requestParams, whereConditions, 'region', 'DeviceRegion', req.query.region || req.query['region[]']);
    addFilter(requestParams, whereConditions, 'locality', 'DeviceLocality', req.query.locality || req.query['locality[]']);
    addFilter(requestParams, whereConditions, 'type', 'DeviceType', req.query.type || req.query['type[]']);
    addFilter(requestParams, whereConditions, 'property', 'DeviceProperty', req.query.property || req.query['property[]']);
    // Added Frequency filter
    addFilter(requestParams, whereConditions, 'frequency', 'Frequency', req.query.frequency || req.query['frequency[]']);
    // Added Device filter
    addFilter(requestParams, whereConditions, 'device', 'Name', req.query.device || req.query['device[]']);

    if (req.query.dateFrom) { requestParams.input('dateFrom', sql.Date, req.query.dateFrom); whereConditions.push('CAST(ModifiedOn AS DATE) >= @dateFrom'); }
    if (req.query.dateTo) { requestParams.input('dateTo', sql.Date, req.query.dateTo); whereConditions.push('CAST(ModifiedOn AS DATE) <= @dateTo'); }
    if (req.query.timeFrom) { requestParams.input('timeFrom', sql.VarChar(5), req.query.timeFrom); whereConditions.push("CONVERT(CHAR(5), ModifiedOn, 108) >= @timeFrom"); }
    if (req.query.timeTo) { requestParams.input('timeTo', sql.VarChar(5), req.query.timeTo); whereConditions.push("CONVERT(CHAR(5), ModifiedOn, 108) <= @timeTo"); }

    if (searchValue) {
      const escapedSearch = escapeSqlString(escapeLike(searchValue));
      whereConditions.push(`(
        CAST(Id AS NVARCHAR(MAX)) LIKE N'%${escapedSearch}%' OR
        CONVERT(VARCHAR(23), ModifiedOn, 121) LIKE N'%${escapedSearch}%' OR
        Name LIKE N'%${escapedSearch}%' COLLATE Latin1_General_CI_AI OR
        DeviceRegion LIKE N'%${escapedSearch}%' COLLATE Latin1_General_CI_AI OR
        DeviceLocality LIKE N'%${escapedSearch}%' COLLATE Latin1_General_CI_AI OR
        Frequency LIKE N'%${escapedSearch}%' COLLATE Latin1_General_CI_AI OR
        DeviceType LIKE N'%${escapedSearch}%' COLLATE Latin1_General_CI_AI OR
        DeviceProperty LIKE N'%${escapedSearch}%' COLLATE Latin1_General_CI_AI OR
        OldValue LIKE N'%${escapedSearch}%' COLLATE Latin1_General_CI_AI OR
        NewValue LIKE N'%${escapedSearch}%' COLLATE Latin1_General_CI_AI
      )`);
    }

    for (let i = 0; i < columns.length; i++) {
      const val = req.query['col' + i];
      if (val && val.trim() !== '') {
        const colName = columns[i];
        const escapedVal = escapeSqlString(escapeLike(val));
        if (colName === 'Id' || colName === 'Frequency' || colName === 'OldValueReal' || colName === 'NewValueReal') whereConditions.push(`CAST(${colName} AS NVARCHAR(MAX)) LIKE N'%${escapedVal}%' COLLATE Latin1_General_CI_AI`);
        else if (colName === 'ModifiedOn') whereConditions.push(`CONVERT(VARCHAR(23), ${colName}, 121) LIKE N'%${escapedVal}%'`);
        else whereConditions.push(`${colName} LIKE N'%${escapedVal}%' COLLATE Latin1_General_CI_AI`);
      }
    }

    const whereClause = whereConditions.length ? 'WHERE ' + whereConditions.join(' AND ') : '';

    const sqlText = `
      SELECT *
      FROM dbo.DeviceDataView
      ${whereClause}
      ORDER BY ${orderColumn} ${orderDir}
    `;
    const visibleCols = req.query.visibleCols ? req.query.visibleCols.split(',').map(Number) : null;
    const allColsDef = [
      { key: 'Id', label: 'Id' },
      { key: 'ModifiedOn', label: 'Datum' },
      { key: 'Name', label: 'Zařízení' },
      { key: 'DeviceRegion', label: 'Region' },
      { key: 'DeviceLocality', label: 'Lokalita' },
      { key: 'Frequency', label: 'Frekvence' },
      { key: 'DeviceType', label: 'Typ' },
      { key: 'DeviceProperty', label: 'Vlastnost' },
      { key: 'OldValue', label: 'Stará hodnota' },
      { key: 'NewValue', label: 'Nová hodnota' },
      { key: 'OldValueReal', label: 'Stará hod. (REAL)' },
      { key: 'NewValueReal', label: 'Nová hod. (REAL)' }
    ];

    const exportCols = visibleCols ? allColsDef.filter((_, idx) => visibleCols.includes(idx)) : allColsDef;

    const result = await requestParams.query(sqlText);
    const rows = result.recordset;

    // -- Generování Excelu --
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Device Data');

    worksheet.columns = exportCols.map(c => ({
      header: c.label,
      key: c.key,
      width: (c.key === 'ModifiedOn' || c.key === 'Name') ? 25 : 15
    }));

    // Stylování hlavičky
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    // Přidání dat
    rows.forEach(r => {
      const rowData = {};
      exportCols.forEach(c => {
        rowData[c.key] = r[c.key];
      });
      worksheet.addRow(rowData);
    });

    const timestamp = new Date().toISOString().replace(/T/, '_').replace(/:/g, '-').split('.')[0];
    const filename = `historian_export_${timestamp}.xlsx`;

    res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.header('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error('Chyba při exportu XLSX:', err);
    res.status(500).send('Chyba při exportu XLSX');
  }
});

// Start HTTP server (redirects to HTTPS)
http.createServer((req, res) => {
  const host = req.headers.host.split(':')[0]; // Remove port if present
  res.writeHead(301, { "Location": `https://${host}:${HTTPS_PORT}${req.url}` });
  res.end();
}).listen(HTTP_PORT, () => {
  console.log(`HTTP Server running on port ${HTTP_PORT} (Redirects to HTTPS)`);
});

// Start HTTPS server
const options = {
  pfx: fs.readFileSync('./config/server.pfx'),
  passphrase: 'historian'
};

https.createServer(options, app).listen(HTTPS_PORT, () => {
  console.log(`HTTPS Server running on port ${HTTPS_PORT}`);
});
