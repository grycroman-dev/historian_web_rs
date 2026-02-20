const sql = require('mssql');

const mainConfig = {
  user: 'sa',
  password: 'contrans',
  server: '127.0.0.1',
  database: 'RohdeSchwarz',
  requestTimeout: 60000,
  options: { encrypt: false, trustServerCertificate: true }
};

const backupConfig = {
  user: 'sa',
  password: 'contrans',
  server: '127.0.0.1', // Zde zadejte IP zalozniho serveru
  database: 'RohdeSchwarz',
  requestTimeout: 60000,
  options: { encrypt: false, trustServerCertificate: true }
};

let poolMain;
let poolBackup;

async function getPool(type = 'main') {
  if (type === 'backup') {
    if (!poolBackup) {
      console.log('Connecting to BACKUP database...');
      poolBackup = await new sql.ConnectionPool(backupConfig).connect();
    }
    return poolBackup;
  } else {
    if (!poolMain) {
      console.log('Connecting to MAIN database...');
      poolMain = await new sql.ConnectionPool(mainConfig).connect();
    }
    return poolMain;
  }
}

module.exports = { sql, getPool };
