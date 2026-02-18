## 2.0.10 - 2026-02-18
# Changelog

## 2.0.9 - 2026-02-18
- Přidána možnost měnit velikost rozbalovacích seznamů filtrů (drag & drop resize za pravý dolní roh)

## 2.0.8 - 2026-02-18
- Implementováno fulltext vyhledávání uvnitř multiselect filtrů (umožňuje rychle najít např. konkrétní zařízení)
- Přesun filtru Zařízení hned za Region (Region -> Zařízení -> Lokalita)

## 2.0.7 - 2026-02-18
- Přidán filtr Zařízení (multiselect) do UI
- Doplněna podpora filtrování podle zařízení `device` do API a exportů (CSV, XLSX)

## 2.0.6 - 2026-02-18
- Přidány sloupce OldValueReal / NewValueReal (numerická konverze hodnot v SQL pohledu)
- Konfigurátor viditelnosti sloupců – dropdown s checkboxy, klávesová zkratka Alt+V
- Horizontální scroll tabulky pro zobrazení většího počtu sloupců
- Zvýraznění vyhledávacího výrazu (CSS pro `<mark>`, podpora dark mode)
- Oprava duplicitního filtru `type` na serveru (CSV, XLSX i hlavní API)
- Rozšíření CSV a XLSX exportu o sloupce OldValueReal / NewValueReal
- Úprava SQL schématu – nový sloupec Type v tabulce DeviceProperty

## 2.0.5 - 2026-02-17
- Přidán filtr Frekvence (za Lokalitou)
- Oprava klávesové zkratky Alt+A (duplicitní handler)
- Oprava čitelnosti klávesových zkratek v nápovědě (dark mode)
- Oprava resetu sloupcových filtrů (Alt+C / tlačítko Zrušit filtry)

## 2.0.4 - 2026-02-17
- Oprava zvýrazňování nových záznamů (dle ID)
- Pamatování stavu automatického obnovování (localStorage)
- Oprava duplicitního kódu

## 2.0.3 - 2026-02-17
- Přidána automatizace pro ChangeLog.

## 2.0.2 - 2026-02-17
- Verzování

## 2.0.1 - 2026-02-17
- Výchozí verze
