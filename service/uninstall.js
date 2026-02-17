const Service = require('node-windows').Service;
const path = require('path');

// Create a new service object
const svc = new Service({
    name: 'RCMS RCOM Historian Web',
    script: path.join(__dirname, '..', 'server.js')
});

// Listen for the "uninstall" event so we know when it's done.
svc.on('uninstall', function () {
    console.log('Služba byla úspěšně odinstalována.');
    console.log('Služba už v systému neexistuje.');
});

// Uninstall the service.
svc.uninstall();
