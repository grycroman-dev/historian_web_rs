# ==========================================================================
Varianta 1: PM2 (doporuèuji)
# --------------------------------------------------------------------------
PM2 je populární process manager pro Node.js, který umí aplikace restartovat pøi pádu a spouštìt po startu Windows.

Instalace:
npm install -g pm2
npm install -g pm2-windows-startup

Konfigurace automatického startu:
pm2-startup install

Spuštìní aplikace:
cd C:\cesta\k\vašemu\projektu
pm2 start server.js --name "historian-audit"

Uložení konfigurace pro automatický start:
pm2 save

Užiteèné pøíkazy:
pm2 list              # seznam bìžících aplikací
pm2 logs historian-audit   # zobrazení logù
pm2 restart historian-audit  # restart aplikace
pm2 stop historian-audit     # zastavení aplikace
pm2 delete historian-audit   # odstranìní z PM2
# ==========================================================================

# ==========================================================================
Varianta 2: node-windows (nativní Windows služba)
# --------------------------------------------------------------------------
Tento balíèek vytvoøí skuteènou Windows službu.
npm install node-windows

Vytvoøte soubor install-service.js v koøenovém adresáøi projektu:

const Service = require('node-windows').Service;
const path = require('path');

// Vytvoøení objektu služby
const svc = new Service({
  name: 'Historian Audit Browser',
  description: 'Webový prohlížeè auditních záznamù HISTORIAN',
  script: path.join(__dirname, 'server.js'),
  nodeOptions: [
    '--harmony',
    '--max_old_space_size=4096'
  ]
});

// Posluchaè události instalace
svc.on('install', function() {
  console.log('Služba byla nainstalována!');
  svc.start();
});

// Instalace služby
svc.install();
# --------------------------------------------------------------------------
Spuštìní instalace služby:
node install-service.js
# --------------------------------------------------------------------------
Pro odinstalaci vytvoøte soubor uninstall-service.js:
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
# --------------------------------------------------------------------------
Spuštìní odinstalace:
node uninstall-service.js
# ==========================================================================

# ==========================================================================
Varianta 3: NSSM (Non-Sucking Service Manager)
# --------------------------------------------------------------------------
NSSM je jednoduchý nástroj pro vytváøení Windows služeb z jakékoliv aplikace.

Instalace:
Stáhnìte NSSM z https://nssm.cc/download
Rozbalte a zkopírujte nssm.exe do složky projektu nebo do C:\Windows\System32

Vytvoøení služby:
nssm install HistorianAudit

Otevøe se GUI, kde vyplníte:
Path: C:\Program Files\nodejs\node.exe
Startup directory: C:\cesta\k\vašemu\projektu
Arguments: server.js
Service name: HistorianAudit

Spuštìní služby:
nssm start HistorianAudit

Další pøíkazy:
nssm stop HistorianAudit      # zastavení
nssm restart HistorianAudit   # restart
nssm remove HistorianAudit    # odstranìní služby
nssm status HistorianAudit    # stav služby
# ==========================================================================

# ==========================================================================
Varianta 4: Windows Task Scheduler (nejjednodušší)
# --------------------------------------------------------------------------
Pokud nechcete instalovat další software, mùžete použít Plánovaè úloh Windows.

Postup:
Otevøete Plánovaè úloh (Task Scheduler)
Kliknìte na Vytvoøit úlohu (Create Task)
Záložka Obecné:
Název: Historian Audit Browser
Zaškrtnìte: Spustit bez ohledu na to, zda je uživatel pøihlášen
Zaškrtnìte: Spustit s nejvyššími oprávnìními
Záložka Aktivaèní události (Triggers):
Nová aktivaèní událost: Pøi spuštìní systému
Záložka Akce (Actions):
Akce: Spustit program
Program: C:\Program Files\nodejs\node.exe
Argumenty: server.js
Zaèít v: C:\cesta\k\vašemu\projektu
Uložte úlohu
# ==========================================================================