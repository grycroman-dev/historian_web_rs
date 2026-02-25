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

// Pomocná funkce pro parsování číselných filtrů (podporuje >, <, >=, <=, =, 10..20)
function parseNumericFilter(colName, val) {
  if (!val) return null;
  // Očištění vstupu (odstranění uvozovek, mezer, převod čárky na tečku)
  val = val.trim().replace(/["']/g, '').replace(',', '.').replace(/\s+/g, '');

  // Rozsah: 10..20 nebo -116..-121
  if (val.includes('..')) {
    const parts = val.split('..');
    const v1 = parseFloat(parts[0]);
    const v2 = parseFloat(parts[1]);
    if (!isNaN(v1) && !isNaN(v2)) {
      const min = Math.min(v1, v2);
      const max = Math.max(v1, v2);
      return `(${colName} BETWEEN ${min} AND ${max})`;
    }
  }

  // Rozsah s pomlčkou: 10-20 (podporuje i záporná čísla jako -10--5)
  const dashMatch = val.match(/^([+-]?\d+(?:\.\d+)?)-([+-]?\d+(?:\.\d+)?)$/);
  if (dashMatch) {
    const v1 = parseFloat(dashMatch[1]);
    const v2 = parseFloat(dashMatch[2]);
    if (!isNaN(v1) && !isNaN(v2)) {
      const min = Math.min(v1, v2);
      const max = Math.max(v1, v2);
      return `(${colName} BETWEEN ${min} AND ${max})`;
    }
  }

  // Operátory: >=10, <5 atd.
  // Regex: operátor následovaný číslem (volitelně s desetinnou tečkou a znaménkem)
  const opMatch = val.match(/^(>=|<=|>|<|=)([+-]?\d*(\.\d+)?)$/);
  if (opMatch) {
    const op = opMatch[1];
    const num = parseFloat(opMatch[2]);
    if (!isNaN(num)) {
      return `(${colName} ${op} ${num})`;
    }
  }

  // Přesné číslo
  if (/^[+-]?\d*(\.\d+)?$/.test(val)) {
    const num = parseFloat(val);
    if (!isNaN(num)) {
      return `(${colName} = ${num})`;
    }
  }

  // Fallback na LIKE (pro částečné vyhledávání jako v textu) - bezpečné escapování
  const escapedVal = val.replace(/'/g, "''").replace(/%/g, '[%]').replace(/_/g, '[_]');
  return `CAST(${colName} AS NVARCHAR(MAX)) LIKE N'%${escapedVal}%'`;
}

// Funkce pro předběžné rozlišení DeviceId na základě filtrů (zrychluje SQL dotazy)
async function getMatchedDeviceIds(pool, query) {
  const deviceFilters = [];
  const request = pool.request();

  // Dropdowny (přesná shoda)
  addFilter(request, deviceFilters, 'df_region', 'DR.Name', query.region || query['region[]']);
  addFilter(request, deviceFilters, 'df_locality', 'DL.Name', query.locality || query['locality[]']);
  addFilter(request, deviceFilters, 'df_type', 'DT.Name', query.type || query['type[]']);
  addFilter(request, deviceFilters, 'df_frequency', 'D.Frequency', query.frequency || query['frequency[]']);
  addFilter(request, deviceFilters, 'df_device', 'D.Name', query.device || query['device[]']);

  // Sloupcové filtry (částečná shoda LIKE)
  if (query.col2) deviceFilters.push(`D.Name LIKE N'%${escapeSqlString(escapeLike(query.col2))}%'`);
  if (query.col3) deviceFilters.push(`DR.Name LIKE N'%${escapeSqlString(escapeLike(query.col3))}%'`);
  if (query.col4) deviceFilters.push(`DL.Name LIKE N'%${escapeSqlString(escapeLike(query.col4))}%'`);
  if (query.col5) deviceFilters.push(`D.Frequency LIKE N'%${escapeSqlString(escapeLike(query.col5))}%'`);
  if (query.col6) deviceFilters.push(`DT.Name LIKE N'%${escapeSqlString(escapeLike(query.col6))}%'`);

  if (deviceFilters.length === 0) return null;

  const deviceJoinSQL = `
    SELECT D.Id 
    FROM dbo.Device D
    LEFT JOIN dbo.DeviceRegion DR ON DR.Id = D.DeviceRegionId
    LEFT JOIN dbo.DeviceLocality DL ON DL.Id = D.DeviceLocalityId
    LEFT JOIN dbo.DeviceType DT ON DT.Id = D.DeviceTypeId
    WHERE ${deviceFilters.join(' AND ')}
  `;

  try {
    const result = await request.query(deviceJoinSQL);
    return result.recordset.map(r => r.Id);
  } catch (err) {
    console.error('getMatchedDeviceIds error:', err);
    return null;
  }
}

// Funkce pro předběžné rozlišení DevicePropertyId (zrychluje SQL dotazy)
async function getMatchedPropertyIds(pool, query) {
  const propFilters = [];
  const request = pool.request();
  addFilter(request, propFilters, 'pf_name', 'Name', query.property || query['property[]']);
  if (query.col7) propFilters.push(`Name LIKE N'%${escapeSqlString(escapeLike(query.col7))}%'`);

  if (propFilters.length === 0) return null;

  try {
    const result = await request.query(`SELECT Id FROM dbo.DeviceProperty WHERE ${propFilters.join(' AND ')}`);
    return result.recordset.map(r => r.Id);
  } catch (err) {
    console.error('getMatchedPropertyIds error:', err);
    return null;
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

    // Zjistíme ID pro rychlejší vyhledávání v DeviceData bez VIEW
    const devRes = await request.query('SELECT Id FROM dbo.Device WHERE Name = @device');
    const deviceId = devRes.recordset.length > 0 ? devRes.recordset[0].Id : -1;

    const propRes = await request.query('SELECT Id FROM dbo.DeviceProperty WHERE Name = @property');
    const propertyId = propRes.recordset.length > 0 ? propRes.recordset[0].Id : -1;

    let whereClauses = [
      `DeviceId = ${deviceId}`,
      `DevicePropertyId = ${propertyId}`,
      'NewValueReal IS NOT NULL'
    ];

    if (req.query.dateFrom) {
      request.input('dateFrom', sql.Date, req.query.dateFrom);
      whereClauses.push('ModifiedOn >= @dateFrom');
    }
    if (req.query.dateTo) {
      request.input('dateTo', sql.Date, req.query.dateTo);
      whereClauses.push('ModifiedOn < DATEADD(day, 1, @dateTo)');
    }
    if (req.query.timeFrom && req.query.timeFrom.trim() !== '') {
      request.input('timeFrom', sql.VarChar(12), req.query.timeFrom.replace('.', ':'));
      whereClauses.push("CONVERT(VARCHAR(12), ModifiedOn, 114) >= @timeFrom");
    }
    if (req.query.timeTo && req.query.timeTo.trim() !== '') {
      request.input('timeTo', sql.VarChar(12), req.query.timeTo.replace('.', ':'));
      whereClauses.push("CONVERT(VARCHAR(12), ModifiedOn, 114) <= @timeTo");
    }
    const columns = [
      'Id', 'ModifiedOn', 'Name', 'DeviceRegion', 'DeviceLocality',
      'Frequency', 'DeviceType', 'DeviceProperty', 'OldValue', 'NewValue',
      'OldValueReal', 'NewValueReal'
    ];

    // Globální vyhledávání (pokud je zadáno)
    if (req.query.searchGlobal) {
      const search = req.query.searchGlobal;
      const escaped = escapeSqlString(escapeLike(search));
      let globConditions = [
        `OldValue LIKE N'%${escaped}%'`,
        `NewValue LIKE N'%${escaped}%'`
      ];
      if (/^\d+$/.test(search)) {
        globConditions.push(`Id = ${parseInt(search)}`);
      }
      if (/^[0-9\- \:\.]+$/.test(search)) {
        whereClauses.push(`((${globConditions.join(' OR ')}) OR CONVERT(VARCHAR(23), ModifiedOn, 121) LIKE N'%${escaped}%')`);
      } else {
        whereClauses.push(`(${globConditions.join(' OR ')})`);
      }
    }

    // Sloupcové filtry
    for (let i = 0; i < columns.length; i++) {
      const val = req.query['col' + i];
      if (val && val.trim() !== '') {
        const colName = columns[i];
        if (colName === 'Id' || colName === 'OldValueReal' || colName === 'NewValueReal') {
          whereClauses.push(parseNumericFilter(colName, val));
        } else if (colName === 'ModifiedOn') {
          whereClauses.push(`CONVERT(VARCHAR(23), ${colName}, 121) LIKE N'%${escapeSqlString(escapeLike(val))}%'`);
        } else {
          whereClauses.push(`${colName} LIKE N'%${escapeSqlString(escapeLike(val))}%'`);
        }
      }
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

    if (req.query.dateFrom) { request.input('dateFrom', sql.Date, req.query.dateFrom); whereClauses.push('ModifiedOn >= @dateFrom'); }
    if (req.query.dateTo) { request.input('dateTo', sql.Date, req.query.dateTo); whereClauses.push('ModifiedOn < DATEADD(day, 1, @dateTo)'); }
    if (req.query.timeFrom && req.query.timeFrom.trim()) { request.input('timeFrom', sql.VarChar(12), req.query.timeFrom.replace('.', ':')); whereClauses.push("CONVERT(VARCHAR(12), ModifiedOn, 114) >= @timeFrom"); }
    if (req.query.timeTo && req.query.timeTo.trim()) { request.input('timeTo', sql.VarChar(12), req.query.timeTo.replace('.', ':')); whereClauses.push("CONVERT(VARCHAR(12), ModifiedOn, 114) <= @timeTo"); }
    const columns = [
      'Id', 'ModifiedOn', 'Name', 'DeviceRegion', 'DeviceLocality',
      'Frequency', 'DeviceType', 'DeviceProperty', 'OldValue', 'NewValue',
      'OldValueReal', 'NewValueReal'
    ];

    // Globální vyhledávání
    if (req.query.searchGlobal) {
      const search = req.query.searchGlobal;
      const escaped = escapeSqlString(escapeLike(search));
      let globConditions = [`OldValue LIKE N'%${escaped}%'`, `NewValue LIKE N'%${escaped}%'`];
      if (/^\d+$/.test(search)) globConditions.push(`Id = ${parseInt(search)}`);
      if (/^[0-9\- \:\.]+$/.test(search)) {
        whereClauses.push(`((${globConditions.join(' OR ')}) OR CONVERT(VARCHAR(23), ModifiedOn, 121) LIKE N'%${escaped}%')`);
      } else {
        whereClauses.push(`(${globConditions.join(' OR ')})`);
      }
    }

    // Sloupcové filtry
    for (let i = 0; i < columns.length; i++) {
      const val = req.query['col' + i];
      if (val && val.trim() !== '') {
        const colName = columns[i];
        if (colName === 'Id' || colName === 'OldValueReal' || colName === 'NewValueReal') {
          whereClauses.push(parseNumericFilter(colName, val));
        } else if (colName === 'ModifiedOn') {
          whereClauses.push(`CONVERT(VARCHAR(23), ${colName}, 121) LIKE N'%${escapeSqlString(escapeLike(val))}%'`);
        } else {
          whereClauses.push(`${colName} LIKE N'%${escapeSqlString(escapeLike(val))}%'`);
        }
      }
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
        time: dt.toISOString().replace('T', ' ').substring(0, 23) + ' UTC',
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
  const startTime = Date.now();
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

    // 1. Předvýběr ID pro zrychlení dotazů
    const deviceIds = await getMatchedDeviceIds(pool, req.query);
    if (deviceIds !== null) {
      if (deviceIds.length === 0) {
        return res.json({ draw, recordsTotal: 0, recordsFiltered: 0, data: [], serverTimeMs: Date.now() - startTime });
      }
      whereConditions.push(`DD.DeviceId IN (${deviceIds.join(',')})`);
    }

    const propertyIds = await getMatchedPropertyIds(pool, req.query);
    if (propertyIds !== null) {
      if (propertyIds.length === 0) {
        return res.json({ draw, recordsTotal: 0, recordsFiltered: 0, data: [], serverTimeMs: Date.now() - startTime });
      }
      whereConditions.push(`DD.DevicePropertyId IN (${propertyIds.join(',')})`);
    }

    // 2. Filtry data a času (SARGable)
    if (req.query.dateFrom) {
      requestParams.input('dateFrom', sql.Date, req.query.dateFrom);
      whereConditions.push('DD.ModifiedOn >= @dateFrom');
    }
    if (req.query.dateTo) {
      requestParams.input('dateTo', sql.Date, req.query.dateTo);
      whereConditions.push('DD.ModifiedOn < DATEADD(day, 1, @dateTo)');
    }
    if (req.query.timeFrom && req.query.timeFrom.trim() !== '') {
      requestParams.input('timeFrom', sql.VarChar(12), req.query.timeFrom.replace('.', ':'));
      whereConditions.push("CONVERT(VARCHAR(12), DD.ModifiedOn, 114) >= @timeFrom");
    }
    if (req.query.timeTo && req.query.timeTo.trim() !== '') {
      requestParams.input('timeTo', sql.VarChar(12), req.query.timeTo.replace('.', ':'));
      whereConditions.push("CONVERT(VARCHAR(12), DD.ModifiedOn, 114) <= @timeTo");
    }

    // 3. Globální vyhledávání (Search)
    if (searchValue) {
      const escapedSearch = escapeSqlString(escapeLike(searchValue));
      // Pro globální search stále musíme trochu joinovat, ale aspoň si předvybereme zařízení
      const prefetchReq = pool.request();
      const devRes = await prefetchReq.query(`
        SELECT D.Id FROM dbo.Device D
        LEFT JOIN dbo.DeviceRegion DR ON DR.Id = D.DeviceRegionId
        LEFT JOIN dbo.DeviceLocality DL ON DL.Id = D.DeviceLocalityId
        LEFT JOIN dbo.DeviceType DT ON DT.Id = D.DeviceTypeId
        WHERE D.Name LIKE N'%${escapedSearch}%' 
           OR D.Frequency LIKE N'%${escapedSearch}%'
           OR DR.Name LIKE N'%${escapedSearch}%'
           OR DL.Name LIKE N'%${escapedSearch}%'
           OR DT.Name LIKE N'%${escapedSearch}%'
      `);
      const matchedDevIds = devRes.recordset.map(r => r.Id);

      const propRes = await prefetchReq.query(`SELECT Id FROM dbo.DeviceProperty WHERE Name LIKE N'%${escapedSearch}%'`);
      const matchedPrIds = propRes.recordset.map(r => r.Id);

      let globSearch = [
        `DD.OldValue LIKE N'%${escapedSearch}%'`,
        `DD.NewValue LIKE N'%${escapedSearch}%'`
      ];
      if (matchedDevIds.length > 0) globSearch.push(`DD.DeviceId IN (${matchedDevIds.join(',')})`);
      if (matchedPrIds.length > 0) globSearch.push(`DD.DevicePropertyId IN (${matchedPrIds.join(',')})`);
      if (/^\d+$/.test(searchValue)) globSearch.push(`DD.Id = ${parseInt(searchValue)}`);

      whereConditions.push(`(${globSearch.join(' OR ')})`);
    }

    // 4. Sloupcové filtry
    for (let i = 0; i < columns.length; i++) {
      const val = req.query['col' + i];
      if (val && val.trim() !== '') {
        const colName = columns[i];

        // Metadata sloupce jsou již vyřešeny pomocí ID v kroku 1 (deviceIds, propertyIds)
        if (['Name', 'DeviceRegion', 'DeviceLocality', 'Frequency', 'DeviceType', 'DeviceProperty'].includes(colName)) {
          continue;
        }

        if (colName === 'Id' || colName === 'OldValueReal' || colName === 'NewValueReal') {
          whereConditions.push(parseNumericFilter('DD.' + colName, val));
        } else if (colName === 'ModifiedOn') {
          whereConditions.push(`CONVERT(VARCHAR(23), DD.${colName}, 121) LIKE N'%${escapeSqlString(escapeLike(val))}%'`);
        } else {
          whereConditions.push(`DD.${colName} LIKE N'%${escapeSqlString(escapeLike(val))}%'`);
        }
      }
    }

    const whereClause = whereConditions.length ? 'WHERE ' + whereConditions.join(' AND ') : '';
    const baseTable = 'dbo.DeviceData DD';

    // Rychlé získání celkového počtu záznamů ze systémových metadat (instantní u 24M+ řádků)
    const totalRes = await pool.request().query("SELECT SUM(rows) AS cnt FROM sys.partitions WHERE object_id = OBJECT_ID('dbo.DeviceData') AND index_id < 2");
    const recordsTotal = totalRes.recordset[0].cnt;

    const countQuery = `SELECT COUNT(*) AS cnt FROM ${baseTable} WITH (NOLOCK) ${whereClause}`;
    const filtRes = await requestParams.query(countQuery);
    const recordsFiltered = filtRes.recordset[0].cnt;

    // Finální dotaz s JOINem na metadata (přes VIEW) jen pro aktuální stránku
    // VIEW bylo aktualizováno, aby obsahovalo i DevicePropertyId, takže můžeme použít stejnou WHERE klauzuli.
    const dataQuery = `
      SELECT *
      FROM dbo.DeviceDataView DD
      ${whereClause}
      ORDER BY DD.${orderColumn} ${orderDir}
      OFFSET ${start} ROWS 
      FETCH NEXT ${length} ROWS ONLY
    `;

    const dataRes = await requestParams.query(dataQuery);

    res.json({
      draw,
      recordsTotal,
      recordsFiltered,
      data: dataRes.recordset,
      serverTimeMs: Date.now() - startTime
    });

  } catch (err) {
    console.error('Chyba při načítání dat:', err);
    res.json({
      draw: parseInt(req.query.draw) || 1,
      recordsTotal: 0,
      recordsFiltered: 0,
      data: [],
      error: 'Chyba při načítání dat: ' + err.message,
      serverTimeMs: Date.now() - startTime
    });
  }
});

// --- Získání statistik (asynchronně vůči tabulce) ---
app.get('/api/stats', async (req, res) => {
  const startTime = Date.now();
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

    const deviceIds = await getMatchedDeviceIds(pool, req.query);
    if (deviceIds !== null) {
      if (deviceIds.length === 0) return res.json({ min: 0, max: 0, avg: 0, count: 0, serverTimeMs: Date.now() - startTime });
      whereConditions.push(`DeviceId IN (${deviceIds.join(',')})`);
    }

    const propertyIds = await getMatchedPropertyIds(pool, req.query);
    if (propertyIds !== null) {
      if (propertyIds.length === 0) return res.json({ min: 0, max: 0, avg: 0, count: 0, serverTimeMs: Date.now() - startTime });
      whereConditions.push(`DevicePropertyId IN (${propertyIds.join(',')})`);
    }

    if (req.query.dateFrom) { requestParams.input('dateFrom', sql.Date, req.query.dateFrom); whereConditions.push('ModifiedOn >= @dateFrom'); }
    if (req.query.dateTo) { requestParams.input('dateTo', sql.Date, req.query.dateTo); whereConditions.push('ModifiedOn < DATEADD(day, 1, @dateTo)'); }
    if (req.query.timeFrom && req.query.timeFrom.trim() !== '') { requestParams.input('timeFrom', sql.VarChar(12), req.query.timeFrom.replace('.', ':')); whereConditions.push("CONVERT(VARCHAR(12), ModifiedOn, 114) >= @timeFrom"); }
    if (req.query.timeTo && req.query.timeTo.trim() !== '') { requestParams.input('timeTo', sql.VarChar(12), req.query.timeTo.replace('.', ':')); whereConditions.push("CONVERT(VARCHAR(12), ModifiedOn, 114) <= @timeTo"); }

    if (searchValue) {
      const escapedSearch = escapeSqlString(escapeLike(searchValue));
      const prefetchReq = pool.request();
      const devRes = await prefetchReq.query(`
        SELECT D.Id FROM dbo.Device D 
        LEFT JOIN dbo.DeviceLocality DL ON DL.Id=D.DeviceLocalityId 
        LEFT JOIN dbo.DeviceRegion DR ON DR.Id=D.DeviceRegionId 
        LEFT JOIN dbo.DeviceType DT ON DT.Id=D.DeviceTypeId 
        WHERE D.Name LIKE N'%${escapedSearch}%' OR D.Frequency LIKE N'%${escapedSearch}%' 
           OR DL.Name LIKE N'%${escapedSearch}%' OR DR.Name LIKE N'%${escapedSearch}%' OR DT.Name LIKE N'%${escapedSearch}%'
      `);
      const matchedDeviceIds = devRes.recordset.map(r => r.Id);

      const propRes = await prefetchReq.query(`
        SELECT Name FROM dbo.DeviceProperty WHERE Name LIKE N'%${escapedSearch}%'
      `);
      const matchedPropNames = propRes.recordset.map(r => `N'${escapeSqlString(r.Name)}'`);

      let globSearch = [
        `OldValue LIKE N'%${escapedSearch}%'`,
        `NewValue LIKE N'%${escapedSearch}%'`
      ];

      if (matchedDeviceIds.length > 0) {
        globSearch.push(`DeviceId IN (${matchedDeviceIds.join(',')})`);
      }
      if (matchedPropNames.length > 0) {
        globSearch.push(`DeviceProperty IN (${matchedPropNames.join(',')})`);
      }

      if (/^\d+$/.test(searchValue)) {
        globSearch.push(`Id = ${parseInt(searchValue)}`);
      }
      if (/^[0-9\-\ \:\.]+$/.test(searchValue)) {
        globSearch.push(`CONVERT(VARCHAR(23), ModifiedOn, 121) LIKE N'%${escapedSearch}%'`);
      }

      whereConditions.push(`(${globSearch.join(' OR ')})`);
    }

    for (let i = 0; i < columns.length; i++) {
      const val = req.query['col' + i];
      if (val && val.trim() !== '') {
        const colName = columns[i];
        const escapedVal = escapeSqlString(escapeLike(val));
        if (colName === 'Id' || colName === 'OldValueReal' || colName === 'NewValueReal') {
          whereConditions.push(parseNumericFilter(colName, val));
        } else if (colName === 'ModifiedOn') {
          whereConditions.push(`CONVERT(VARCHAR(23), ${colName}, 121) LIKE N'%${escapeSqlString(escapeLike(val))}%'`);
        } else {
          whereConditions.push(`${colName} LIKE N'%${escapeSqlString(escapeLike(val))}%'`);
        }
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

    stats.serverTimeMs = Date.now() - startTime;
    res.json(stats);
  } catch (err) {
    console.error('Chyba při výpočtu statistik:', err);
    res.status(500).json({ error: 'Chyba při výpočtu statistik', serverTimeMs: Date.now() - startTime });
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

    if (req.query.dateFrom) { requestParams.input('dateFrom', sql.Date, req.query.dateFrom); whereConditions.push('ModifiedOn >= @dateFrom'); }
    if (req.query.dateTo) { requestParams.input('dateTo', sql.Date, req.query.dateTo); whereConditions.push('ModifiedOn < DATEADD(day, 1, @dateTo)'); }
    if (req.query.timeFrom) { requestParams.input('timeFrom', sql.VarChar(12), req.query.timeFrom.replace('.', ':')); whereConditions.push("CONVERT(VARCHAR(12), ModifiedOn, 114) >= @timeFrom"); }
    if (req.query.timeTo) { requestParams.input('timeTo', sql.VarChar(12), req.query.timeTo.replace('.', ':')); whereConditions.push("CONVERT(VARCHAR(12), ModifiedOn, 114) <= @timeTo"); }

    if (searchValue) {
      const escapedSearch = escapeSqlString(escapeLike(searchValue));
      let globSearch = [
        `Name LIKE N'%${escapedSearch}%'`,
        `DeviceRegion LIKE N'%${escapedSearch}%'`,
        `DeviceLocality LIKE N'%${escapedSearch}%'`,
        `Frequency LIKE N'%${escapedSearch}%'`,
        `DeviceType LIKE N'%${escapedSearch}%'`,
        `DeviceProperty LIKE N'%${escapedSearch}%'`,
        `OldValue LIKE N'%${escapedSearch}%'`,
        `NewValue LIKE N'%${escapedSearch}%'`
      ];

      if (/^\d+$/.test(searchValue)) {
        globSearch.push(`Id = ${parseInt(searchValue)}`);
      }
      if (/^[0-9\-\ \:\.]+$/.test(searchValue)) {
        globSearch.push(`CONVERT(VARCHAR(23), ModifiedOn, 121) LIKE N'%${escapedSearch}%'`);
      }

      whereConditions.push(`(${globSearch.join(' OR ')})`);
    }

    for (let i = 0; i < columns.length; i++) {
      const val = req.query['col' + i];
      if (val && val.trim() !== '') {
        const colName = columns[i];
        const escapedVal = escapeSqlString(escapeLike(val));
        if (colName === 'Id' || colName === 'OldValueReal' || colName === 'NewValueReal') {
          whereConditions.push(parseNumericFilter(colName, val));
        } else if (colName === 'ModifiedOn') {
          whereConditions.push(`CONVERT(VARCHAR(23), ${colName}, 121) LIKE N'%${escapeSqlString(escapeLike(val))}%'`);
        } else {
          whereConditions.push(`${colName} LIKE N'%${escapeSqlString(escapeLike(val))}%'`);
        }
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
        if (c.key === 'ModifiedOn') return val ? val.toISOString().replace('T', ' ').substring(0, 23) : '';
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

    if (req.query.dateFrom) { requestParams.input('dateFrom', sql.Date, req.query.dateFrom); whereConditions.push('ModifiedOn >= @dateFrom'); }
    if (req.query.dateTo) { requestParams.input('dateTo', sql.Date, req.query.dateTo); whereConditions.push('ModifiedOn < DATEADD(day, 1, @dateTo)'); }
    if (req.query.timeFrom) { requestParams.input('timeFrom', sql.VarChar(12), req.query.timeFrom.replace('.', ':')); whereConditions.push("CONVERT(VARCHAR(12), ModifiedOn, 114) >= @timeFrom"); }
    if (req.query.timeTo) { requestParams.input('timeTo', sql.VarChar(12), req.query.timeTo.replace('.', ':')); whereConditions.push("CONVERT(VARCHAR(12), ModifiedOn, 114) <= @timeTo"); }

    if (searchValue) {
      const escapedSearch = escapeSqlString(escapeLike(searchValue));
      const prefetchReq = pool.request();
      const devRes = await prefetchReq.query(`
        SELECT D.Id FROM dbo.Device D 
        LEFT JOIN dbo.DeviceLocality DL ON DL.Id=D.DeviceLocalityId 
        LEFT JOIN dbo.DeviceRegion DR ON DR.Id=D.DeviceRegionId 
        LEFT JOIN dbo.DeviceType DT ON DT.Id=D.DeviceTypeId 
        WHERE D.Name LIKE N'%${escapedSearch}%' OR D.Frequency LIKE N'%${escapedSearch}%' 
           OR DL.Name LIKE N'%${escapedSearch}%' OR DR.Name LIKE N'%${escapedSearch}%' OR DT.Name LIKE N'%${escapedSearch}%'
      `);
      const matchedDeviceIds = devRes.recordset.map(r => r.Id);

      const propRes = await prefetchReq.query(`
        SELECT Name FROM dbo.DeviceProperty WHERE Name LIKE N'%${escapedSearch}%'
      `);
      const matchedPropNames = propRes.recordset.map(r => `N'${escapeSqlString(r.Name)}'`);

      let globSearch = [
        `OldValue LIKE N'%${escapedSearch}%'`,
        `NewValue LIKE N'%${escapedSearch}%'`
      ];

      if (matchedDeviceIds.length > 0) {
        globSearch.push(`DeviceId IN (${matchedDeviceIds.join(',')})`);
      }
      if (matchedPropNames.length > 0) {
        globSearch.push(`DeviceProperty IN (${matchedPropNames.join(',')})`);
      }

      if (/^\d+$/.test(searchValue)) {
        globSearch.push(`Id = ${parseInt(searchValue)}`);
      }
      if (/^[0-9\-\ \:\.]+$/.test(searchValue)) {
        globSearch.push(`CONVERT(VARCHAR(23), ModifiedOn, 121) LIKE N'%${escapedSearch}%'`);
      }

      whereConditions.push(`(${globSearch.join(' OR ')})`);
    }

    for (let i = 0; i < columns.length; i++) {
      const val = req.query['col' + i];
      if (val && val.trim() !== '') {
        const colName = columns[i];
        const escapedVal = escapeSqlString(escapeLike(val));
        if (colName === 'Id' || colName === 'OldValueReal' || colName === 'NewValueReal') {
          whereConditions.push(parseNumericFilter(colName, val));
        } else if (colName === 'ModifiedOn') {
          whereConditions.push(`CONVERT(VARCHAR(23), ${colName}, 121) LIKE N'%${escapeSqlString(escapeLike(val))}%'`);
        } else {
          whereConditions.push(`${colName} LIKE N'%${escapeSqlString(escapeLike(val))}%'`);
        }
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
