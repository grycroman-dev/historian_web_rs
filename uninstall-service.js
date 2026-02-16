const Service = require('node-windows').Service;
const path = require('path');

const svc = new Service({
  name: 'Historian Audit Browser',
  script: path.join(__dirname, 'server.js')
});

svc.on('uninstall', function() {
  console.log('Služba byla odinstalována.');
});

svc.uninstall();
