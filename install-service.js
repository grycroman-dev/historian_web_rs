const Service = require('node-windows').Service;
const path = require('path');

 Vytvoření objektu služby
const svc = new Service({
  name 'Historian Audit Browser',
  description 'Webový prohlížeč auditních záznamů HISTORIAN',
  script path.join(__dirname, 'server.js'),
  nodeOptions [
    '--harmony',
    '--max_old_space_size=4096'
  ]
});

 Posluchač události instalace
svc.on('install', function() {
  console.log('Služba byla nainstalována!');
  svc.start();
});

 Instalace služby
svc.install();
