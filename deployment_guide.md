# Návod na nasazení (Deployment Guide) - Windows Server 2019

Tento dokument popisuje kroky potřebné k instalaci a spuštění aplikace **RCMS RCOM / Historian Web** na Windows Server 2019.

Máte dvě možnosti, jak aplikaci spouštět na pozadí:
1.  **Jako Windows Službu (Native)** - pomocí `node-windows` (viz Sekce 4).
2.  **Pomocí PM2 (Process Manager)** - moderní správce procesů, doporučeno pro lepší správu logů a monitoring (viz Sekce 5).

---

## 1. Prerekvizity (Společné)

Před instalací se ujistěte, že na serveru jsou nainstalovány následující komponenty:

### 1.1 Node.js (LTS verze)
Aplikace běží na platformě Node.js.
1.  Stáhněte si **Node.js (LTS verze, doporučeno v18 nebo novější)** z oficiálních stránek: [https://nodejs.org/](https://nodejs.org/)
2.  Spusťte instalátor a proklikejte "Next" (výchozí nastavení jsou v pořádku).
3.  Po instalaci otevřete příkazový řádek (CMD nebo PowerShell) a ověřte instalaci příkazem:
    ```cmd
    node -v
    npm -v
    ```

### 1.2 Přístup k databázi (MSSQL)
- Ujistěte se, že ze serveru, kde poběží web, je vidět na databázový server (ping, firewall port 1433).

---

## 2. Instalace aplikace

1.  Vytvořte na serveru složku pro aplikaci, např. `C:\Apps\Historian_Web`.
2.  Zkopírujte do ní obsah celého projektu.
3.  Pokud server má internet, spusťte v adresáři aplikace:
    ```cmd
    npm install
    ```
    *(Pokud je offline, musíte zkopírovat i složku `node_modules` z online počítače.)*

---

## 3. Konfigurace

Otevřete soubor `config/db.js` a nastavte připojení k databázi (Main/Backup).

---

## 4. Varianta A: Instalace jako Windows Služba (Standardní)

Tato metoda vytvoří klasickou službu ve správci `services.msc`.

1.  Spusťte PowerShell/CMD jako **Správce**.
2.  Přejděte do složky aplikace: `cd C:\Apps\Historian_Web`
3.  Spusťte skript:
    ```cmd
    node service/install.js
    ```
4.  Ověřte v prohlížeči na `http://localhost:3000`.

---

## 5. Varianta B: Instalace a správa pomocí PM2 (Pokročilé)

### 5.1 Instalace PM2
#### Pokud má server přístup k internetu:
```cmd
npm install pm2 -g
npm install pm2-windows-startup -g
```

#### Pokud je server OFFLINE (bez internetu):
Pokud nemůžete instalovat přímo z internetu, musíte balíčky stáhnout na jiném PC a přenést je.

**Na online počítači:**
1.  Vytvořte si prázdnou složku, např. `pm2-offline`.
2.  Otevřete v ní příkazový řádek a stáhněte balíčky jako `.tgz` soubory:
    ```cmd
    npm pack pm2
    npm pack pm2-windows-startup
    ```
    *(Vzniknou soubory jako `pm2-5.3.0.tgz` a `pm2-windows-startup-x.x.x.tgz`.)*
3.  Tyto soubory zkopírujte na offline server (např. do `C:\Install`).

**Na offline serveru:**
1.  Otevřete CMD/PowerShell jako Správce.
2.  Přejděte do složky se zkopírovanými soubory.
3.  Nainstalujte je globálně přímo ze souborů:
    ```cmd
    npm install -g pm2-x.x.x.tgz
    npm install -g pm2-windows-startup-x.x.x.tgz
    ```
    *(Doplňte přesné názvy souborů, které se vygenerovaly.)*

### 5.2 Spuštění aplikace
V adresáři aplikace (`C:\Apps\Historian_Web`) spusťte:
```cmd
pm2 start server.js --name "HistorianWeb"
```

### 5.3 Nastavení automatického startu (Persistence)
Aby se PM2 (a vaše aplikace) spustil po restartu serveru:
```cmd
pm2-startup install
pm2 save
```
*(Pokud by příkaz `pm2-startup` nebyl nalezen, ujistěte se, že instalace `pm2-windows-startup` proběhla úspěšně.)*

### 5.4 Užitečné příkazy PM2 (Správa)
*   **Stav:** `pm2 status`
*   **Logy:** `pm2 logs HistorianWeb`
*   **Restart:** `pm2 restart HistorianWeb`
*   **Stop:** `pm2 stop HistorianWeb`

---

## 6. Řešení problémů

*   **Firewall:** Povolte v bráně Windows Firewall příchozí port 3000 (TCP).
*   **Offline přenos:** Nejsnazší cesta pro offline server je na online počítači v projektu spustit `npm install`, smazat případné mezipaměti nebo symlinky, a pak zkopírovat **celou složku projektu včetně `node_modules`** na server. Tím odpadá většina problémů s instalací závislostí aplikace. Pro PM2 výše uvedený postup s `npm pack` funguje spolehlivě.
