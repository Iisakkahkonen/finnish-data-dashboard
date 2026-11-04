# Suomi vs. EU: keskeiset indikaattorit

Kaksikielinen kojelauta, joka vertaa Suomea Pohjoismaihin, Baltian maihin, muihin EU-maihin ja EU27-keskiarvoon keskeisillä talouden, hyvinvoinnin ja koulutuksen mittareilla.

**Julkinen sivu:** https://iisakkahkonen.github.io/finnish-data-dashboard/
**In English:** [README.md](README.md)

## Mitä sivu näyttää

- **11 indikaattoria:** työttömyysaste (15–74-vuotiaat), kuluttajahintojen inflaatio (YKHI/HICP), BKT asukasta kohden ostovoimakorjattuna (EU27 = 100), köyhyysriskiaste (60 % maan mediaanitulosta), ekvivalentti mediaanitulo ostovoimastandardeina ja euroina, elinajanodote syntyessä, tulojen Gini-kerroin sekä 15-vuotiaiden PISA-tulokset matematiikassa (vuodesta 2003), lukutaidossa (vuodesta 2000) ja luonnontieteissä (vuodesta 2006) vuoteen 2022 asti.
- **Maat:** kaikki EU27-maat, Norja ja Islanti sekä EU27-keskiarvo. Maita voi valita vapaasti tai käyttää valmista valintaa, kuten "Pohjoismaat" tai "Baltia". Kun PISA-indikaattori on valittuna, mukaan voi ottaa myös 60 muuta PISAan osallistuvaa maata (esimerkiksi Japani, Singapore ja Kanada) sekä OECD-keskiarvon.
- **Kuusi näkymää:**
  - **Kuvio:** viivakuvio ajan yli. Alku- ja loppuvuoden voi valita, ja maiden nimet näkyvät viivojen päässä.
  - **Järjestetyt palkit:** kaikki valitut maat yhdeltä vuodelta järjestyksessä, tarkka arvo jokaisen palkin kohdalla.
  - **Taulukko:** yksi vuosi, arvot ja kunkin maan sijoitus EU27-maiden joukossa.
  - **Suomen ero:** Suomen ja EU27-keskiarvon (PISAssa OECD-keskiarvon) erotus ajan yli.
  - **Sijoitus ajan yli:** miten valittujen maiden sijoitus EU27-maiden joukossa on muuttunut.
  - **Vertaa kahta:** kahden indikaattorin hajontakuvio yhdeltä vuodelta, korrelaatiokerroin ja muistutus siitä, ettei yhteys todista syy-seuraussuhdetta.
- **Selitykset arkikielellä:** jokaisella indikaattorilla on lyhyt "Mitä tämä luku tarkoittaa?" -teksti aikuiselle maallikkolukijalle molemmilla kielillä.
- **Jakaminen ja vienti:** näkymän tila (indikaattori, maat, vuodet, näkymä ja kieli) tallentuu osoitteeseen, joten kopioitu linkki avaa saman näkymän. Jokaisen näkymän voi ladata CSV-tiedostona.
- **Kielet:** suomi ja englanti.

## Datalähteet

Useimmat luvut ovat [Eurostatilta](https://ec.europa.eu/eurostat):

| Indikaattori | Eurostatin tietokanta | Miten data tulee sivulle |
|---|---|---|
| Työttömyysaste | `une_rt_a` | Haetaan Eurostatin rajapinnasta jokaisella julkaisulla |
| Inflaatio, vuosimuutos | `prc_hicp_aind` | Haetaan Eurostatin rajapinnasta jokaisella julkaisulla |
| BKT asukasta kohden PPS | `tec00114` | Haetaan Eurostatin rajapinnasta jokaisella julkaisulla |
| Köyhyysriskiaste | `ilc_li02` | Haetaan Eurostatin rajapinnasta jokaisella julkaisulla |
| Ekvivalentti mediaanitulo (PPS ja euroa) | `ilc_di03` | Viety CSV-tiedostoksi kansioon `data-pipeline/raw/` |
| Gini-kerroin | `ilc_di12` | Viety CSV-tiedostoksi kansioon `data-pipeline/raw/` |
| Elinajanodote syntyessä | `demo_mlexpec` | Viety CSV-tiedostoksi kansioon `data-pipeline/raw/` |

PISA-tulokset ovat OECD:n PISA-tutkimuksesta, ja ne ovat CSV-tiedostoina kansiossa `data-pipeline/raw/`:

- `pisa-scores.csv`: vuodet 2000–2018 World Bank EdStatsin DataHub-peilistä (CC BY 4.0).
- `pisa-2022-and-oecd-averages.csv`: vuoden 2022 maakohtaiset keskiarvot ja OECD-keskiarvot, kirjattu käsin OECD:n PISA-raporteista. Lukutaidon vuosien 2003–2009 ja luonnontieteiden vuosien 2006–2009 OECD-keskiarvoja ei ole raporttien taulukoissa käyttökelpoisessa muodossa, joten ne on laskettu aineiston OECD-maista. Kun niitä voi verrata viralliseen lukuun, ero on enintään noin 3 pistettä.
- Luxemburgilla ei ole arvoa vuodelta 2022, koska sitä ei ole puretuissa vuoden 2022 taulukoissa.

Sivu rakennetaan uudelleen joka maanantai ja jokaisen `main`-haaraan tehdyn muutoksen jälkeen. Jokainen julkaisu hakee neljän rajapintaindikaattorin uusimmat arvot.

## Miten lukuja tulkitaan

- **Sijoitus** lasketaan vain EU:n 27 jäsenmaan kesken. Norja, Islanti ja Euroopan ulkopuoliset PISA-maat näkyvät vertailun vuoksi, mutta niitä ei sijoiteta.
- **Inflaatiossa** maat sijoitetaan sen mukaan, kuinka lähellä ne ovat Euroopan keskuspankin kahden prosentin tavoitetta.
- **Gini-kertoimessa** sijoitus 1 on maa, jossa tulot jakautuvat tasaisimmin.
- **BKT asukasta kohden** on Eurostatin mukaan tarkoitettu maiden väliseen vertailuun, ei yhden maan kehityksen seuraamiseen. Sivu näyttää tästä huomautuksen.
- **Puuttuvia arvoja** ei täytetä. Jos maalla ei ole arvoa valitulle vuodelle, tilarivi kertoo sen.
- **PISAssa** ei ole EU27-keskiarvoa, joten vertailukohtana on OECD-keskiarvo. Muutaman pisteen erot mahtuvat yleensä virhemarginaaliin.

## Testit

- `data-pipeline/tests`: pytest-testit jäsennykselle, sijoituksille ja jokaiselle datalähteelle.
- `web/e2e/smoke.mjs`: Playwright-selaintesti, joka ajetaan testiaineistolla ja tarkistaa kaikki näkymät, kielen vaihdon, jaettavan linkin, CSV-lataukset ja PISA-maiden näkyvyyden.

Molemmat ajetaan GitHub Actionsissa ennen jokaista julkaisua. Jos testi epäonnistuu, sivua ei julkaista.

## Käynnistys omalla koneella

Datan käsittely (repositorion juurikansiosta):

```
pip install -r data-pipeline/requirements.txt
python -m pytest data-pipeline/tests
python data-pipeline/build.py
```

Tämä kirjoittaa tiedoston `data/indicators.json`.

Sivusto (`web`-kansiosta):

```
npm install
npm run dev          # kehityspalvelin
npm run test:e2e     # selaintestit
```

Avaa osoite, jonka Vite tulostaa, yleensä `http://localhost:5173`.

## Projektin rakenne

```
data-pipeline/       Python: Eurostat-haku, CSV- ja PISA-lukijat, sijoitukset, testit
data-pipeline/raw/   Mukana tulevat lähde-CSV:t (PISA ja Eurostatista viedyt tiedostot)
data/                Luotu indicators.json
web/                 Vite + TypeScript -sivusto, Chart.js, suomen- ja englanninkieliset tekstit
web/e2e/             Playwright-selaintesti ja testiaineisto
.github/workflows/   Testit, datan päivitys ja GitHub Pages -julkaisu
```

## Lisenssi

- **Koodi:** [Apache License 2.0](LICENSE). Katso myös [NOTICE](NOTICE).
- **Data:** © Euroopan unioni (Eurostat), lisenssi [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Mainitse Eurostat, jos käytät lukuja uudelleen.
- **PISA-data:** OECD:n PISA-tulokset DataHubin ja World Bank EdStatsin kautta, lisenssi CC BY 4.0.
