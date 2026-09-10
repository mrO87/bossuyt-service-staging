# Fixtures voor het uitlezen van werkbonnen

`*-docling.json` is de uitvoer van de docling-container voor één bon: elk
tekstfragment met het vakje waarin het staat. De tests in
`tests/werkbon-zones.test.ts` draaien daartegen, zodat ze offline werken en niet
afhangen van een container die toevallig aan staat.

| bestand | wat het is |
|---|---|
| `sauna-molenhoeve.pdf` | een bon zoals de ERP hem verstuurt — een PDF met tekstlaag |
| `sauna-molenhoeve.json` | de velden die een mens van dat blad afleest |
| `sauna-molenhoeve-docling.json` | wat docling van die PDF maakt |
| `victor-23-docling.json` | wat docling maakt van een **foto** van een papieren bon, nadat `lib/deskew.ts` hem rechtgetrokken heeft |

De twee docling-bestanden dekken verschillende dingen. Een PDF komt terug in
punten (595 x 842) met nette losse vakjes. Een foto komt terug in pixels
(1654 x 2339), met hele kolommen aan elkaar geplakt en labels die OCR verhaspeld
heeft. Beide moeten blijven werken.

## Opnieuw genereren

Nodig wanneer de indeling van de bon verandert of docling geüpgraded wordt.

```bash
curl -X POST http://127.0.0.1:5001/v1/convert/file \
  -F "files=@tests/fixtures/sauna-molenhoeve.pdf" \
  -F "to_formats=json" -F "do_ocr=true" \
  -F "ocr_lang=nl" -F "ocr_lang=fr" \
  -F "page_range=1" -F "page_range=1" -F "do_table_structure=false"
```

Neem uit het antwoord `document.json_content` en bewaar daarvan alleen `pages`
en `texts` (met per fragment `text` en `prov`).

Voor de fotofixture: trek eerst een foto recht met `warpToA4` uit
`lib/deskew.ts` (vier hoeken van het blad, met de klok mee vanaf linksboven) en
stuur het resultaat als JPEG naar dezelfde route.

> De brondfoto staat niet in de repo: hij is 3,4 MB en bevat de naam, het adres
> en het telefoonnummer van een echte klant.
