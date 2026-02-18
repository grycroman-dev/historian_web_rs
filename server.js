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
  if (!values) return;
  const vals = Array.isArray(values) ? values : [values];
  if (vals.length === 0) return;

  if (vals.length === 1) {
    requestParams.input(paramName, sql.NVarChar, vals[0]);
    whereConditions.push(`${dbColumn} = @${paramName}`);
  } else {
    // Multi-select: IN (@p_0, @p_1, ...)
    const paramNames = [];
    vals.forEach((val, index) => {
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

    res.json({
      regions: regions.recordset.map(r => r.Name),
      localities: localities.recordset.map(l => l.Name),
      types: types.recordset.map(t => t.Name),
      properties: properties.recordset.map(p => p.Name),
      frequencies: frequencies.recordset.map(f => f.Name)
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
        CAST(Id AS NVARCHAR) LIKE N'%${escapedSearch}%' OR
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
        if (colName === 'Id') whereConditions.push(`CAST(${colName} AS NVARCHAR) LIKE N'%${escapedVal}%'`);
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

    if (req.query.dateFrom) { requestParams.input('dateFrom', sql.Date, req.query.dateFrom); whereConditions.push('CAST(ModifiedOn AS DATE) >= @dateFrom'); }
    if (req.query.dateTo) { requestParams.input('dateTo', sql.Date, req.query.dateTo); whereConditions.push('CAST(ModifiedOn AS DATE) <= @dateTo'); }
    if (req.query.timeFrom) { requestParams.input('timeFrom', sql.VarChar(5), req.query.timeFrom); whereConditions.push("CONVERT(CHAR(5), ModifiedOn, 108) >= @timeFrom"); }
    if (req.query.timeTo) { requestParams.input('timeTo', sql.VarChar(5), req.query.timeTo); whereConditions.push("CONVERT(CHAR(5), ModifiedOn, 108) <= @timeTo"); }

    if (searchValue) {
      const escapedSearch = escapeSqlString(escapeLike(searchValue));
      whereConditions.push(`(
        CAST(Id AS NVARCHAR) LIKE N'%${escapedSearch}%' OR
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
        if (colName === 'Id') whereConditions.push(`CAST(${colName} AS NVARCHAR) LIKE N'%${escapedVal}%'`);
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
    const result = await requestParams.query(sqlText);
    const rows = result.recordset;

    let csv = 'Id;Datum;Zarizeni;Region;Lokalita;Frekvence;Typ;Vlastnost;StaraHodnota;NovaHodnota;StaraHodnotaReal;NovaHodnotaReal\n';
    rows.forEach(r => {
      const esc = s => `"${String(s || '').replace(/"/g, '""')}"`;
      csv += [
        r.Id,
        r.ModifiedOn ? r.ModifiedOn.toISOString() : '',
        esc(r.Name),
        esc(r.DeviceRegion),
        esc(r.DeviceLocality),
        esc(r.Frequency),
        esc(r.DeviceType),
        esc(r.DeviceProperty),
        esc(r.OldValue),
        esc(r.NewValue),
        r.OldValueReal != null ? r.OldValueReal : '',
        r.NewValueReal != null ? r.NewValueReal : ''
      ].join(';') + '\n';
    });

    res.header('Content-Type', 'text/csv');
    res.attachment('export.csv');
    res.send(csv);

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

    if (req.query.dateFrom) { requestParams.input('dateFrom', sql.Date, req.query.dateFrom); whereConditions.push('CAST(ModifiedOn AS DATE) >= @dateFrom'); }
    if (req.query.dateTo) { requestParams.input('dateTo', sql.Date, req.query.dateTo); whereConditions.push('CAST(ModifiedOn AS DATE) <= @dateTo'); }
    if (req.query.timeFrom) { requestParams.input('timeFrom', sql.VarChar(5), req.query.timeFrom); whereConditions.push("CONVERT(CHAR(5), ModifiedOn, 108) >= @timeFrom"); }
    if (req.query.timeTo) { requestParams.input('timeTo', sql.VarChar(5), req.query.timeTo); whereConditions.push("CONVERT(CHAR(5), ModifiedOn, 108) <= @timeTo"); }

    if (searchValue) {
      const escapedSearch = escapeSqlString(escapeLike(searchValue));
      whereConditions.push(`(
        CAST(Id AS NVARCHAR) LIKE N'%${escapedSearch}%' OR
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
        if (colName === 'Id') whereConditions.push(`CAST(${colName} AS NVARCHAR) LIKE N'%${escapedVal}%'`);
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
    const result = await requestParams.query(sqlText);
    const rows = result.recordset;

    // -- Generování Excelu --
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Device Data');

    worksheet.columns = [
      { header: 'Id', key: 'Id', width: 10 },
      { header: 'Datum', key: 'ModifiedOn', width: 20 },
      { header: 'Zařízení', key: 'Name', width: 25 },
      { header: 'Region', key: 'DeviceRegion', width: 15 },
      { header: 'Lokalita', key: 'DeviceLocality', width: 15 },
      { header: 'Frekvence', key: 'Frequency', width: 15 },
      { header: 'Typ', key: 'DeviceType', width: 15 },
      { header: 'Vlastnost', key: 'DeviceProperty', width: 20 },
      { header: 'Stará hodnota', key: 'OldValue', width: 20 },
      { header: 'Nová hodnota', key: 'NewValue', width: 20 },
      { header: 'Stará hod. (REAL)', key: 'OldValueReal', width: 18 },
      { header: 'Nová hod. (REAL)', key: 'NewValueReal', width: 18 }
    ];

    // Stylování hlavičky
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    // Přidání dat
    rows.forEach(r => {
      worksheet.addRow({
        Id: r.Id,
        ModifiedOn: r.ModifiedOn,
        Name: r.Name,
        DeviceRegion: r.DeviceRegion,
        DeviceLocality: r.DeviceLocality,
        Frequency: r.Frequency,
        DeviceType: r.DeviceType,
        DeviceProperty: r.DeviceProperty,
        OldValue: r.OldValue,
        NewValue: r.NewValue,
        OldValueReal: r.OldValueReal,
        NewValueReal: r.NewValueReal
      });
    });

    res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.header('Content-Disposition', 'attachment; filename="devicedata.xlsx"');

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
