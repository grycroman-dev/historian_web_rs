# Changelog

## 2.1.6 - 2026-02-21
- **Vylepšení:**
    - Zpoždění automatického vyhledávání po stisku klávesy prodlouženo na 800ms (pohodlnější dopisování filtru).
    - Oprava stability číselného filtrování ve sloupcích.
    - Robustnější parsování operátorů (`<`, `>`, `..`) s podporou mezer i uvozovek.
    - Oprava rozsahů: Nyní funguje jak `..`, tak klasická pomlčka `-` (např. `10-20` nebo `-116..-121`).
    - Automatické seřazení mezí v rozsahu (vždy najde cestu od menšího k většímu číslu).

## 2.1.5 - 2026-02-21
- **Novinky:**
    - Pokročilé filtrování číselných hodnot (`Id`, `OldValueReal`, `NewValueReal`). 
    - Podpora operátorů: `>`, `<`, `>=`, `<=`, `=`, a rozsahů pomocí `..` (např. `10..20` pro hodnoty mezi 10 a 20).
    - Funguje ve všech částech aplikace: hlavní tabulka, statistiky i exporty do CSV/Excel.

## 2.1.4 - 2026-02-21
- **Novinky:**
    - Zobrazení milisekund v celém systému (tabulka, exporty, grafy).
    - Rozšíření časového filtru o podporu sekund a milisekund. Filtrování probíhá s přesností na tisíciny vteřiny.

## 2.1.3 - 2026-02-21
- **Novinky:**
    - Přidáno měření a zobrazování doby načítání dat v patičce aplikace. Zobrazuje se celkový čas (od požadavku po vykreslení) a čistý čas SQL dotazu na serveru, což usnadňuje další optimalizaci výkonu.

## 2.1.2 - 2026-02-20
- **Opravy:**
    - Oprava zobrazení verze aplikace v patičce (aktualizace package.json na 2.1.2).
    - Oprava responzivity filtrů (přidán `flex-wrap` pro správné zalamování na malých displejích).
    - Oprava viditelnosti ikon (přiřazena primární barva) a nativních ikon kalendáře/času v panelech nastavení v tmavém režimu (přidán invertující CSS filtr a color-scheme).
    - Oprava intervalu automatického obnovení dat z 5 sekund na 30 sekund (jak je uvedeno v UI).
    - Zvýšení viditelnosti zvýraznění nových záznamů (sytější barva a fallback pro případ selhání animace).
- **Optimalizace výkonu:**
    - Zásadní posun ve vyhledávání (Search): Algoritmus pro zjišťování shod (LIKE '%hledání%') byl přepsán. Server místo extrémně výpočetně náročného prohledávání 10 miliónů řádků napříč 6 spojenými tabulkami (pomocí operátoru `OR`) nyní využívá instatní asynchronní metodu "Pre-fetch" – nejdřív se rychlým zlomkem vteřiny podívá do číselníků, vytáhne si příslušná unikátní `Id` a pro obrovskou tabulku použije klauzuli `IN`. Vyhledávání řetězců jako `"test"` kleslo z desítek vteřin na hranici zhruba 2 vteřin.
    - Optimalizace databáze: Sloupce `OldValueReal` a `NewValueReal` se nyní počítají přímo do tabulky `DeviceData` (a jejich automatický výpočet běží v SQL proceduře `SaveData` při ukládání záznamu) místo toho, aby se dynamicky pro obrovská množství dat přepočítávaly až v dotazu na pohled (VIEW). Nyní byly dodatečně upraveny s podmínkou `NOT NULL` a výpočetní bloky `ISNULL` a `CASE` byly z pohledu `DeviceDataView` zcela odebrány.
    - Zvýšen časový limit (timeout) pro dlouhotrvající a komplexní vyhledávací operace u SQL databáze ze standardních 15 na 60 sekund (zabrání se tak chybě `Request failed to complete in 15000ms`).
    - Zásadní zrychlení globálního a sloupcového vyhledávání odstraněním vynucené verifikace `COLLATE Latin1_General_CI_AI` a vynecháním `CAST()` operací v případě, že vyhledávaný výraz neobsahuje číslice nebo znaky data. Výrazně klesla zátěž na databázi při prohledávání miliónů záznamů.
    - Optimalizace rychlosti načítání tabulky: Výpočet globálních statistik (dashboard) byl oddělen do samostatného asynchronního požadavku (`/api/stats`), takže již neblokuje a nezdržuje hlavní načítání dat záznamů.

## 2.1.1 - 2026-02-19
- **Opravy:**
    - Oprava statistiky "Za poslední hodinu" a "Za posledních 24h" – nyní používá UTC čas pro správné porovnání s databází (řeší problém s nezobrazováním nových záznamů).
    - Oprava zvýrazňování nových záznamů zelenou barvou (sjednocení názvu CSS třídy v kódu a ve stylu).

## 2.1.0 - 2026-02-19
- **Grafy:**
    - Přidána možnost volby barvy grafu (7 barevných schémat).
    - Barva grafu se pamatuje i po obnovení stránky (localStorage).
    - Automatické přizpůsobení barev světlému a tmavému režimu.
- **Export:**
    - Opraven export dat z grafu do Excelu (nyní generuje validní .xlsx s daty).
    - Tlačítko Excel přesunuto na konec toolbaru.
- **Optimalizace:**
    - Konsolidace kódu pro obsluhu grafů a odstranění duplicit.
    - Oprava stavu tlačítka "Graf" po resetování všech filtrů (nyní se správně deaktivuje).

## 2.0.17 - 2026-02-19
- Oprava vertikálního centrování modálních oken (Nápověda, Historie změn) – použití CSS třídy `.show` s `display: flex`.
- Sjednocení logiky otevírání/zavírání okna Nápověda – tlačítko, Alt+F1, klik na pozadí i Esc nyní používají konzistentně `addClass/removeClass('show')`.
- Oprava zaoblení všech 4 rohů okna Historie změn – scrollování přesunuto do `.modal-body`, vnější rám má `overflow: hidden`.
- Patička "Stáhnout Changelog" přesunuta mimo scrollovatelnou oblast – vždy viditelná (nový element `.modal-footer-fixed`).
- Okno "Zpracovávám..." – 50% průhlednost (`rgba(..., 0.5)`) s reflexí světlého i tmavého tématu.
- Aktivní tlačítko stránky v paginaci – bílé písmo na modrém podkladu (silnější CSS selektor s `!important`).
- Oprava vertikálního centrování modálů na mobilních zařízeních.

## 2.0.16 - 2026-02-19
- Kompletní redesign uživatelského rozhraní na "Premium" vzhled.
- Implementace glassmorphism efektu, moderních stínů a vylepšené typografie (Inter).
- Optimalizace mobilního zobrazení (Card View) s důrazem na čitelnost a "moderní SaaS" estetiku.
- Plynulé animace a mikro-interakce v ovládacím panelu a dropdown menu.
- Vylepšené vyhledávací pole s modernizovaným tlačítkem pro vymazání.

## 2.0.15 - 2026-02-19
- Přidán panel statistik v reálném čase (počty změn za 1h/24h, nejoblíbenější zařízení/vlastnost/frekvence).
- Přidány klávesové zkratky pro navigaci v tabulce:
    - `Alt + T`: Fokus na tabulku (první vstupní filtr).
    - `Alt + Šipky vlevo/vpravo` (nebo `PageUp/Down`): Stránkování.
    - `Alt + Home/End`: Skok na první/poslední stránku.
- Aktualizace nápovědy o nové navigační zkratky.

## 2.0.14 - 2026-02-18
- Oprava chyby v exportu dat (chybějící definice řazení), která blokovala stažení souboru.
- Oprava kódování CSV exportu přidáním UTF-8 BOM (řeší špatné zobrazení češtiny v Excelu).
- Plná podpora klávesnice v exportním menu (šipky, Enter, Space, Esc).
- Automatický fokus na položky menu při použití zkratky Alt + E.

## 2.0.13 - 2026-02-18
- Prepracované UI exportu: Samostatné tlačítko s dropdown menu.
- Přejmenování volby na "Všechny sloupce" (profesionálnější termín).
- Jasné rozlišení mezi exportem zobrazených a všech sloupců pro CSV i Excel.

## 2.0.12 - 2026-02-18
- Sjednocení názvů exportovaných souborů (včetně časového razítka).
- Export nyní respektuje viditelnost sloupců v tabulce.
- Přidána volba "Celý řádek" pro export všech sloupců i při jejich skrytí v UI.

## 2.0.11 - 2026-02-18
- Oprava vyhledávání v číselných sloupcích (Frekvence, REAL hodnoty) pomocí SQL CAST a NVARCHAR(MAX).
- Sjednocení a oprava exportu do Excelu (doplněn chybějící filtr Zařízení).

## 2.0.10 - 2026-02-18
- Přidán filtr "Frekvence" do rozhraní i API.
- Oprava klávesových zkratek (Alt + A pro auto-refresh).
- Vylepšení čitelnosti klávesových zkratek v nápovědě (tmavý režim).
- Oprava Alt + C (reset všech filtrů) - nyní správně maže i sloupcové filtry.

## 2.0.9 - 2026-02-17
- Implementace logiky zvýrazňování nových záznamů (od posledního načtení).
- Přidány stavové ikony do patičky (Hlavní/Záložní DB).

## 2.0.8 - 2026-02-16
- Příprava pro nasazení jako Windows Service (PM2 / node-windows).

## 1.0.0 - 2026-01-01
- Úvodní verze aplikace Historian Web.
