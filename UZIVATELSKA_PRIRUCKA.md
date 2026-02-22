# 📖 Uživatelská příručka: Prohlížeč dat RCMS RCOM (v2.1.8)

Tato aplikace slouží k rychlému prohlížení, analýze a exportu auditních záznamů ze systému RCMS RCOM. Podporuje pokročilé filtrování milionů záznamů v reálném čase.

## 1. Ovládací panel a Filtry
V horní části aplikace se nachází panel **Filtrace a nastavení**, který můžete sbalit/rozbalit (ikona šipky nebo klávesová zkratka `Alt+P`).

*   **Multiselect (Výběr více hodnot):** U polí jako Region, Lokalita nebo Zařízení můžete vybrat více položek najednou. Tabulka se aktualizuje okamžitě po výběru.
*   **Časové filtry:** Umožňují vybrat rozmezí Datum (+ volitelně čas s přesností na milisekundy).
*   **Globální hledání:** Fulltextové vyhledávání napříč všemi sloupci. Má nastavené chytré zpoždění (800 ms), aby vás nebrzdilo při psaní delšího slova.
*   **Doporučení pro složité filtry:** Pokud připravujete složitější číselný filtr (např. dlouhé rozmezí nebo specifický operátor), doporučujeme si jej nejdříve napsat v textovém editoru (Poznámkový blok) a poté jej do pole vložit (`Ctrl+V`). Zabráníte tím opakovanému spouštění náročných dotazů na server při každém napsaném znaku.

## 2. Pokročilé číselné filtry
V záhlaví tabulky u sloupců **Id**, **Stará hod. (REAL)** a **Nová hod. (REAL)** můžete zadávat matematické výrazy pro filtrování:

*   **Porovnávání:** Zadejte např. `>100` (hodnoty větší než 100) nebo `<= -50.5` (hodnoty menší nebo rovny -50.5).
*   **Rozsahy:** 
    *   Pomocí dvou teček: `10..50` (najde vše mezi 10 a 50).
    *   Pomocí pomlčky: `10-20` (vhodné i pro záporná čísla, např. `-120--115`).
    *   *Poznámka: Systém automaticky rozpozná menší/větší číslo, takže i zápis 50..10 bude fungovat správně.*
*   **Přesná shoda:** Stačí napsat samotné číslo, např. `9546960`.

## 3. Práce s Grafy 📈
Grafy jsou interaktivní a slouží k vizualizaci trendů u číselných hodnot.

*   **Aktivace:** Tlačítko **Graf** se zpřístupní pouze tehdy, pokud je ve filtrech vybráno **přesně 1 Zařízení** a **přesně 1 Vlastnost**.
*   **Respektování filtrů:** Graf zobrazuje pouze ta data, která vidíte vyfiltrovaná v tabulce. Pokud tedy v tabulce omezíte záznamy pomocí filtru ID nebo času, graf se podle toho okamžitě zúží.
*   **Funkce v grafu:**
    *   Můžete měnit typ (Liniový, Sloupcový, Bodový).
    *   Můžete měnit barvu křivky (uloží se do paměti prohlížeče).
    *   Data přímo z grafu lze exportovat samostatně do **CSV** nebo **Excelu**.

## 4. Exporty a Sloupce
*   **Export Dat:** V pravé části panelu najdete tlačítko **Export**. Můžete exportovat buď všechny dostupné sloupce, nebo pouze ty, které máte aktuálně zobrazené (vhodné pro čistší přehledy).
*   **Správa sloupců:** Tlačítko **Sloupce** (`Alt+V`) umožňuje skrýt sloupce, které pro danou analýzu nepotřebujete. Vaše nastavení si prohlížeč pamatuje.

## 5. Klávesové zkratky (pro rychlou práci)
*   `Alt + C` – **Reset všeho**: Okamžitě zruší všechny filtry a vymaže hledání.
*   `Alt + P` – **Skryje/zobrazí** horní panel filtrů a nastavení.
*   `Alt + T` – Přesune fokus do **Tabulky** (následně lze používat šipky, `Home` nebo `End` pro rychlou navigaci).
*   `Alt + H` – Přesune fokus do pole **Globální hledání**.
*   `Alt + G` – Otevře **Graf** (pokud je aktivní tlačítko).
*   `Alt + V` – Otevře nastavení **viditelnosti sloupců**.
*   `Alt + E` – Otevře nabídku pro **Export dat**.
*   `Alt + A` – Zapne/vypne **Auto-refresh** (aktualizace každých 30s).
*   `Alt + S` – Přepne **Zdroj dat** (Hlavní vs. Záložní databáze).
*   `Alt + F1` – Zobrazí kompletní nápovědu ke zkratkám.

---
*Tip: Pokud se tabulka zdá prázdná, zkontrolujte, zda nemáte zapomenutý text v některém ze sloupcových filtrů úplně dole v záhlaví tabulky.*
