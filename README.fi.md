# Suomi vs. EU: keskeiset indikaattorit

Pieni kojelauta, joka vertaa Suomea Pohjoismaihin, Baltiaan, Itävaltaan ja EU27-keskiarvoon neljällä keskeisellä talous- ja yhteiskunnallisella indikaattorilla.

**Julkinen sivu:** https://iisakkahkonen.github.io/finnish-data-dashboard/
**In English:** [README.md](README.md)

## Mitä sivu näyttää

- **Indikaattorit:** työttömyysaste (15–74-vuotiaat), kuluttajahintojen inflaatio (HICP, vuosimuutos), BKT asukasta kohden ostovoimakorjattuna (PPS, EU27 = 100) ja köyhyysriski (60 % kansallisesta mediaanitulosta).
- **Maat:** Suomi, Ruotsi, Tanska, Norja, Itävalta, Islanti, muut EU27-maat ja EU27-keskiarvo. Voit valita mitä tahansa yhdistelmää tai käyttää valmista valintaa, kuten "Pohjoismaat" tai "Baltia".
- **Kolme näkymää:**
  - Viivakuvio ajan yli enintään 8 maalle, jossa voit asettaa alku- ja loppuvuoden.
  - Järjestetyt palkit yhdelle vuodelle, kun valittuja maita on yli 8. Jokaisen palkin päällä on tarkka arvo.
  - Taulukko yhdelle vuodelle, jossa näkyvät arvot ja maan sijoitus EU27-maiden joukossa.
- **Kielet:** suomi ja englanti.

## Datalähteet

Kaikki luvut ovat [Eurostatilta](https://ec.europa.eu/eurostat), ja ne tulevat seuraavista tietokannoista:

| Indikaattori | Eurostatin tietokanta |
|---|---|
| Työttömyysaste | `une_rt_a` |
| HICP-inflaatio, vuosimuutos | `prc_hicp_aind` |
| BKT asukasta kohden PPS | `tec00114` |
| Köyhyysriski | `ilc_li02` |

Data päivitetään joka maanantai ja jokaisella muutoksella `main`-haaraan. Käsittelyskripti hakee uusimmat arvot ja rakentaa sivun uudelleen.

## Miten lukea kuvaajia

- **Sijoitus** lasketaan vain EU27-jäsenmaiden kesken. Norja ja Islanti näkyvät vertailun vuoksi, mutta niitä ei sijoiteta.
- **BKT asukasta kohden** on volyymi-indeksi, jossa EU27-keskiarvo on 100. Eurostatin mukaan tämä sarja on pääasiassa tarkoitettu maiden vertailuun keskenään, ei yhden maan kehityksen seuraamiseen ajan yli. Sivu näyttää tästä huomautuksen BKT-kuvaajien yhteydessä.
- **Puuttuvia arvoja** ei täytetä. Jos maalla ei ole arvoa valitulle vuodelle, tilarivi kertoo sen.
- **Köyhyysriski** on niiden ihmisten osuus, joiden tulot ovat alle 60 % kansallisesta mediaanitulosta.

## Käynnistys omalla koneella

Datan käsittelyskripti (repositorion juurikansiosta):

```
pip install -r data-pipeline/requirements.txt
python -m pytest data-pipeline/tests
python data-pipeline/build.py
```

Tämä kirjoittaa tiedoston `data/indicators.json`.

Sivusto (`web`-kansiosta):

```
npm install
npm run dev
```

Avaa osoite, jonka Vite tulostaa, yleensä `http://localhost:5173`.

## Projektin rakenne

```
data-pipeline/       Python: Eurostat-haku, jäsennys, sijoitukset, testit
data/                Luotu indicators.json
web/                 Vite + TypeScript -sivusto, Chart.js, suomenkieliset ja englanninkieliset tekstit
.github/workflows/   Testit, datan päivitys ja GitHub Pages -julkaisu
```

## Lisenssi

- **Koodi:** [Apache License 2.0](LICENSE). Katso myös [NOTICE](NOTICE).
- **Data:** © Eurostat, lisenssi [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Mainitse Eurostat, jos käytät lukuja uudelleen.
