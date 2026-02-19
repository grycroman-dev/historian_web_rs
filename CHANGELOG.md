# Changelog

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
