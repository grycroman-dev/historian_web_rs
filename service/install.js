const Service = require('node-windows').Service;
const path = require('path');

// Create a new service object
const svc = new Service({
    name: 'RCMS RCOM Historian Web',
    description: 'Webové rozhraní pro prohlížení auditních záznamů (RCMS RCOM).',
    script: path.join(__dirname, '..', 'server.js'),
    nodeOptions: [
        '--harmony',
        '--max_old_space_size=4096'
    ]
    //, workingDirectory: '...'
    //, allowServiceLogon: true
});

// Listen for the "install" event, which indicates the
// process is available as a service.
svc.on('install', function () {
    console.log('Služba byla úspěšně nainstalována.');
    console.log('Spouštím službu...');
    svc.start();
});

svc.on('alreadyinstalled', function () {
    console.log('Služba už je nainstalována.');
    console.log('Pokouším se ji spustit...');
    svc.start();
});

svc.on('start', function () {
    console.log('Služba běží.');
});

// Install the script as a service.
svc.install();
