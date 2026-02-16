const sql = require('mssql');
const config = {
  user: 'sa',
  password: 'contrans',
  server: '127.0.0.1',
  database: 'RohdeSchwarz',
  options: { encrypt: false, trustServerCertificate: true }
};
let pool;
async function getPool() {
  if (!pool) pool = await sql.connect(config);
  return pool;
}
module.exports = { sql, getPool };
