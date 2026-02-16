const express = require('express');
const path = require('path');
const { sql, getPool } = require('./config/db');

const app = express();
const PORT = 3001;

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

// Načtení filtrů (Region, Locality, Type, Property)
app.get('/api/filters', async (req, res) => {
  try {
    const pool = await getPool();

    // Načteme unikátní hodnoty pro filtry
    // Pozn: Pro velký objem dat by bylo lepší mít samostatné tabulky (což máme: DeviceRegion, atd.)
    // Ale zde pro jednoduchost a jistotu vezmeme to, co je v pohledu nebo tabulkách.
    // V zadání máme tabulky DeviceRegion, DeviceLocality, DeviceType, DeviceProperty.

    const regions = await pool.request().query('SELECT Name FROM dbo.DeviceRegion ORDER BY Name');
    const localities = await pool.request().query('SELECT Name FROM dbo.DeviceLocality ORDER BY Name');
    const types = await pool.request().query('SELECT Name FROM dbo.DeviceType ORDER BY Name');
    const properties = await pool.request().query('SELECT Name FROM dbo.DeviceProperty ORDER BY Name');

    res.json({
      regions: regions.recordset.map(r => r.Name),
      localities: localities.recordset.map(l => l.Name),
      types: types.recordset.map(t => t.Name),
      properties: properties.recordset.map(p => p.Name)
    });

  } catch (err) {
    console.error('Chyba při načítání filtrů:', err);
    res.status(500).json({ error: 'Chyba při načítání filtrů' });
  }
});

// Načtení dat (DeviceDataView)
app.get('/api/devicedata', async (req, res) => {
  try {
    const pool = await getPool();

    const draw = parseInt(req.query.draw) || 1;
    const start = parseInt(req.query.start) || 0;
    const length = parseInt(req.query.length) || 10;
    const searchValue = req.query['search[value]'] || '';
    const orderColIdx = parseInt(req.query['order[0][column]']) || 0;
    const orderDir = req.query['order[0][dir]'] === 'asc' ? 'ASC' : 'DESC';

    // Specifické filtry
    const region = req.query.region;
    const locality = req.query.locality;
    const type = req.query.type;
    const property = req.query.property;

    const dateFrom = req.query.dateFrom;
    const dateTo = req.query.dateTo;
    const timeFrom = req.query.timeFrom;
    const timeTo = req.query.timeTo;

    // Mapování indexů sloupců z DataTables na názvy v DB
    // 0: Id, 1: ModifiedOn, 2: Name, 3: DeviceRegion, 4: DeviceLocality, 5: Frequency, 6: DeviceType, 7: DeviceProperty, 8: OldValue, 9: NewValue
    const columns = [
      'Id', 'ModifiedOn', 'Name', 'DeviceRegion', 'DeviceLocality',
      'Frequency', 'DeviceType', 'DeviceProperty', 'OldValue', 'NewValue'
    ];

    const orderColumn = columns[orderColIdx] || 'Id';

    let whereConditions = [];
    const requestParams = pool.request();

    // Filtry dropdownů
    if (region) {
      requestParams.input('region', sql.NVarChar, region);
      whereConditions.push('DeviceRegion = @region');
    }
    if (locality) {
      requestParams.input('locality', sql.NVarChar, locality);
      whereConditions.push('DeviceLocality = @locality');
    }
    if (type) {
      requestParams.input('type', sql.NVarChar, type);
      whereConditions.push('DeviceType = @type');
    }
    if (property) {
      requestParams.input('property', sql.NVarChar, property);
      whereConditions.push('DeviceProperty = @property');
    }

    // Filtry data a času
    if (dateFrom) {
      requestParams.input('dateFrom', sql.Date, dateFrom);
      whereConditions.push('CAST(ModifiedOn AS DATE) >= @dateFrom');
    }
    if (dateTo) {
      requestParams.input('dateTo', sql.Date, dateTo);
      whereConditions.push('CAST(ModifiedOn AS DATE) <= @dateTo');
    }
    if (timeFrom && timeFrom.trim() !== '') {
      requestParams.input('timeFrom', sql.VarChar(5), timeFrom);
      whereConditions.push("CONVERT(CHAR(5), ModifiedOn, 108) >= @timeFrom");
    }
    if (timeTo && timeTo.trim() !== '') {
      requestParams.input('timeTo', sql.VarChar(5), timeTo);
      whereConditions.push("CONVERT(CHAR(5), ModifiedOn, 108) <= @timeTo");
    }

    // Globální vyhledávání (Fulltext na textové sloupce)
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

    // Sloupcové filtry (pro inputy pod hlavičkou)
    for (let i = 0; i < columns.length; i++) {
      const val = req.query['col' + i];
      if (val && val.trim() !== '') {
        const colName = columns[i];
        const escapedVal = escapeSqlString(escapeLike(val));

        if (colName === 'Id') {
          if (/^\d+$/.test(val)) {
            whereConditions.push(`CAST(${colName} AS NVARCHAR) LIKE N'%${escapedVal}%'`);
          }
        } else if (colName === 'ModifiedOn') {
          whereConditions.push(`CONVERT(VARCHAR(23), ${colName}, 121) LIKE N'%${escapedVal}%'`);
        } else {
          whereConditions.push(`${colName} LIKE N'%${escapedVal}%' COLLATE Latin1_General_CI_AI`);
        }
      }
    }

    const whereClause = whereConditions.length
      ? 'WHERE ' + whereConditions.join(' AND ')
      : '';

    // Count Total
    const totalRes = await pool.request().query('SELECT COUNT(*) AS cnt FROM dbo.DeviceDataView');
    const recordsTotal = totalRes.recordset[0].cnt;

    // Count Filtered
    const countQuery = `SELECT COUNT(*) AS cnt FROM dbo.DeviceDataView ${whereClause}`;
    const filtRes = await requestParams.query(countQuery);
    const recordsFiltered = filtRes.recordset[0].cnt;

    // Data Query
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
    const pool = await getPool();
    const requestParams = pool.request();

    const searchValue = req.query.search || '';
    const orderColIdx = parseInt(req.query.orderCol) || 0;
    const orderDir = req.query.orderDir === 'asc' ? 'ASC' : 'DESC';

    const region = req.query.region;
    const locality = req.query.locality;
    const type = req.query.type;
    const property = req.query.property;

    const dateFrom = req.query.dateFrom;
    const dateTo = req.query.dateTo;
    const timeFrom = req.query.timeFrom;
    const timeTo = req.query.timeTo;

    const columns = [
      'Id', 'ModifiedOn', 'Name', 'DeviceRegion', 'DeviceLocality',
      'Frequency', 'DeviceType', 'DeviceProperty', 'OldValue', 'NewValue'
    ];
    const orderColumn = columns[orderColIdx] || 'Id';

    let whereConditions = [];

    // Stejná logika filtrů jako nahoře...
    if (region) { requestParams.input('region', sql.NVarChar, region); whereConditions.push('DeviceRegion = @region'); }
    if (locality) { requestParams.input('locality', sql.NVarChar, locality); whereConditions.push('DeviceLocality = @locality'); }
    if (type) { requestParams.input('type', sql.NVarChar, type); whereConditions.push('DeviceType = @type'); }
    if (property) { requestParams.input('property', sql.NVarChar, property); whereConditions.push('DeviceProperty = @property'); }

    if (dateFrom) { requestParams.input('dateFrom', sql.Date, dateFrom); whereConditions.push('CAST(ModifiedOn AS DATE) >= @dateFrom'); }
    if (dateTo) { requestParams.input('dateTo', sql.Date, dateTo); whereConditions.push('CAST(ModifiedOn AS DATE) <= @dateTo'); }
    if (timeFrom) { requestParams.input('timeFrom', sql.VarChar(5), timeFrom); whereConditions.push("CONVERT(CHAR(5), ModifiedOn, 108) >= @timeFrom"); }
    if (timeTo) { requestParams.input('timeTo', sql.VarChar(5), timeTo); whereConditions.push("CONVERT(CHAR(5), ModifiedOn, 108) <= @timeTo"); }

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

    let csv = 'Id;Datum;Zarizeni;Region;Lokalita;Frekvence;Typ;Vlastnost;StaraHodnota;NovaHodnota\n';
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
        esc(r.NewValue)
      ].join(';') + '\n';
    });

    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.header('Content-Disposition', 'attachment; filename="devicedata.csv"');
    res.send(csv);

  } catch (err) {
    console.error('Chyba při exportu CSV:', err);
    res.status(500).send('Chyba při exportu CSV');
  }
});

// Excel export
app.get('/api/devicedata/xlsx', async (req, res) => {
  try {
    const ExcelJS = require('exceljs');
    const pool = await getPool();
    const requestParams = pool.request();

    // -- Opakujeme logiku pro sestavení WHERE (stejné jako pro CSV) --
    const searchValue = req.query.search || '';
    const orderColIdx = parseInt(req.query.orderCol) || 0;
    const orderDir = req.query.orderDir === 'asc' ? 'ASC' : 'DESC';

    const region = req.query.region;
    const locality = req.query.locality;
    const type = req.query.type;
    const property = req.query.property;

    const dateFrom = req.query.dateFrom;
    const dateTo = req.query.dateTo;
    const timeFrom = req.query.timeFrom;
    const timeTo = req.query.timeTo;

    const columns = [
      'Id', 'ModifiedOn', 'Name', 'DeviceRegion', 'DeviceLocality',
      'Frequency', 'DeviceType', 'DeviceProperty', 'OldValue', 'NewValue'
    ];
    const orderColumn = columns[orderColIdx] || 'Id';

    let whereConditions = [];

    if (region) { requestParams.input('region', sql.NVarChar, region); whereConditions.push('DeviceRegion = @region'); }
    if (locality) { requestParams.input('locality', sql.NVarChar, locality); whereConditions.push('DeviceLocality = @locality'); }
    if (type) { requestParams.input('type', sql.NVarChar, type); whereConditions.push('DeviceType = @type'); }
    if (property) { requestParams.input('property', sql.NVarChar, property); whereConditions.push('DeviceProperty = @property'); }

    if (dateFrom) { requestParams.input('dateFrom', sql.Date, dateFrom); whereConditions.push('CAST(ModifiedOn AS DATE) >= @dateFrom'); }
    if (dateTo) { requestParams.input('dateTo', sql.Date, dateTo); whereConditions.push('CAST(ModifiedOn AS DATE) <= @dateTo'); }
    if (timeFrom) { requestParams.input('timeFrom', sql.VarChar(5), timeFrom); whereConditions.push("CONVERT(CHAR(5), ModifiedOn, 108) >= @timeFrom"); }
    if (timeTo) { requestParams.input('timeTo', sql.VarChar(5), timeTo); whereConditions.push("CONVERT(CHAR(5), ModifiedOn, 108) <= @timeTo"); }

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
      { header: 'Nová hodnota', key: 'NewValue', width: 20 }
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
        ModifiedOn: r.ModifiedOn, // ExcelJS si poradí s Date objektem
        Name: r.Name,
        DeviceRegion: r.DeviceRegion,
        DeviceLocality: r.DeviceLocality,
        Frequency: r.Frequency,
        DeviceType: r.DeviceType,
        DeviceProperty: r.DeviceProperty,
        OldValue: r.OldValue,
        NewValue: r.NewValue
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

app.listen(PORT, () => console.log(`Server běží na http://localhost:${PORT}`));
