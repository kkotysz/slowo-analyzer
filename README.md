# Slowo Analyzer

Polski WordleBot-lite: lokalna aplikacja do analizy strategii w polskiej wersji Wordle. Dziala jako statyczna web app w przegladarce, bez backendu.

## Uruchomienie

```bash
npm install
npm run dev
```

Domyslny adres Vite to:

```text
http://localhost:5173
```

Testy i build:

```bash
npm test
npm run build
```

Build dla podstrony `https://plokoon12.github.io/slowo-analyzer/`:

```bash
npm run build:pages
npm run preview:pages
```

Ten build zaklada, ze pliki zostana opublikowane pod folderem
`slowo-analyzer/` w repo strony. Najbezpieczniejszy deploy bez commitowania
pliku builda do repo strony to workflow GitHub Pages w repo
`kkotysz/plokoon12.github.io`, ktory checkoutuje to repo tylko do odczytu,
kopiuje `dist/` do artefaktu Pages i publikuje artefakt.

Push na `main` w tym repo moze automatycznie odpalac workflow strony bez prawa
pushowania do repo strony. W tym repo dodaj secret
`SITE_WORKFLOW_DISPATCH_TOKEN`: fine-grained personal access token ograniczony
do repo `kkotysz/plokoon12.github.io` z uprawnieniem **Actions: Read and write**.
Token nie potrzebuje uprawnienia `Contents: Write`.

## Glowny przeplyw

Domyslny tryb to **Symulacja z haslem**:

1. Wpisz haslo koncowe.
2. Wpisz slowo w aktywnym wierszu albo kliknij slowo z kandydatow/rankingu.
3. Aplikacja automatycznie liczy kolory przez mechanike Wordle.
4. Po ruchu widzisz kandydatow, ranking kolejnych ruchow i metryki jakosci.

Klikniecie slowa z panelu kandydatow albo rankingu od razu dodaje je jako kolejny ruch. Po zatwierdzeniu fokus przechodzi do nastepnego pola.

Tryb **Analiza reczna** pozwala samodzielnie ustawic kolory kafelkow. Kafelki przechodza cyklem:

```text
szary -> zolty -> zielony
```

## Widok mobilny

Na ekranach do `980px` aplikacja dzieli przestrzen na trzy zakladki:

- **Gra**: status slownika, tryb, haslo, plansza, klawiatura i historia,
- **Analiza**: ranking, kandydaci i zwijane szczegoly ruchu,
- **Solver**: ustawienia, postep i histogram solvera startowego.

Mobilna klawiatura wpisuje litery bez otwierania klawiatury systemowej. **Enter**
zatwierdza slowo, klawisz cofania usuwa ostatnia litere, a **PL** otwiera rzad
`Ą Ć Ę Ł Ń Ó Ś Ź Ż`. Po wybraniu znaku rzad
zamyka sie automatycznie. Fizyczna klawiatura nadal obsluguje aktywny wiersz.

Kolory klawiszy wynikaja z zatwierdzonych prob, z priorytetem zielony, zolty,
szary. W Analizie przycisk **i** tylko rozwija szczegoly rekomendacji.
Klikniecie calego wiersza rankingu albo kandydata od razu dodaje slowo i wraca
do zakladki Gra. Solver kontynuuje obliczenia po zmianie zakladki.

## Historia i strategie

Panel **Stan gry** pokazuje kolejne etapy rozgrywki:

- slowo i wzor kolorow,
- liczbe kandydatow po ruchu,
- redukcje listy kandydatow,
- podstawowy luck score.

Metryki u gory panelu oceniaja ostatnie zatwierdzone slowo wzgledem
kandydatow dostepnych przed tym ruchem. Nie sa to metryki najlepszego
nastepnego slowa; rekomendacje pozostaja w panelu rankingu.

Klikniecie wczesniejszego etapu przycina pozniejsze ruchy. Dzieki temu mozna szybko wrocic do poprzedniego momentu i sprawdzic inna strategie.

Przycisk **Losowe haslo** wybiera haslo ze slownika odpowiedzi i resetuje gre do treningu.

## Solver startowy

Panel **Solver startowy** sprawdza, w ilu probach dana strategia rozwiazuje wszystkie hasla ze slownika odpowiedzi.

1. Wpisz slowo startowe.
2. Ustaw limit prob `n`.
3. Kliknij **Start**.

Wpisane slowo liczy sie jako pierwsza proba. Kolejne ruchy sa wybierane z bucketow wedlug aktualnych ustawien rankingu: **Tylko kandydaci**, **Dokladnie** i aktywnej metryki sortowania.

Histogram pokazuje liczbe hasel rozwiazanych w `1..n` probach. Slupek `> n` zawiera hasla nierozwiazane w zadanym limicie.

## Slownik

Aplikacja uzywa dwoch lokalnych plikow:

```text
public/slowa.txt
public/hasla.txt
public/answer-metadata.json
public/opening-moves.json
```

`public/slowa.txt` to szeroka lista dopuszczalnych prob z piecioliterowych form SJP. `public/hasla.txt` to lista mozliwych odpowiedzi uzywana do kandydatow i przycisku **Losowe haslo**: top 6000 slow z przeciecia SJP i KWJP, sortowanych przy generowaniu wedlug czestosci `ARF`.

`public/answer-metadata.json` oznacza hasla, ktore w PoliMorf wystepuja tylko jako odmiana innego lematu. Domyslnie wlaczony checkbox **Ukryj unlikely** usuwa takie hasla z kandydatow, rankingu, losowania i solvera. Po odznaczeniu checkboxa odmiany sa nadal dostepne, ale dostaja badge `odmiana` i nie sa wizualnie pogrubione.

Pliki powinny miec jedno slowo na linie. Loader normalizuje slowa, usuwa duplikaty, odrzuca wpisy inne niz 5 polskich liter, sortuje wynik po polsku i odrzuca hasla, ktorych nie ma w liscie prob.

Slownik jest generowany odtwarzalnym skryptem:

```bash
npm run dictionary:build
```

Generator pobiera pinowany slownik SJP do gier (`sjp-20260601.zip`), liste czestosci KWJP (`kwjp100-slowa-orth_lc-all.csv.gz`) oraz PoliMorf (`PoliMorf-0.6.7.tab.gz`). Wszystkie piecioliterowe formy SJP trafiaja do prob, a hasla sa ograniczane do top 6000 slow z przeciecia SJP i KWJP wedlug `ARF`. `public/opening-moves.json` zawiera preliczony dokladny ranking startowy dla pelnej puli i profilu `likelyOnly`.

Po pierwszym wczytaniu slownik jest cache'owany w przegladarce. Jesli zmienisz `public/slowa.txt`, `public/hasla.txt` albo `public/answer-metadata.json`, kliknij **Wczytaj** w panelu slownika. Aplikacja automatycznie doda cache-buster do pobrania, wiec nie trzeba dopisywac `?v=1` recznie.

Slowo spoza slownika nie zostanie dodane do planszy. Aplikacja pokaze komunikat:

```text
To nie jest slowo ze slownika.
```

## Metryki rankingu

Ranking domyslnie pokazuje tylko mozliwych kandydatow i sortuje po **Entropii**. Sortowanie zmieniasz klikajac naglowki tabeli: Entropia, Max, Sr., P(hit) albo Sr. ruchy.

### Entropia

Entropia mierzy, ile informacji srednio daje dane zgadniecie. Im wyzsza entropia, tym lepiej slowo rozdziela mozliwe odpowiedzi na rozne wyniki kolorow.

W praktyce wysoka entropia oznacza, ze po takim ruchu zwykle zostanie mniej kandydatow.

### Max bucket

Max bucket to najgorszy przypadek. Oznacza najwieksza grupe kandydatow, jaka moze zostac po danym ruchu dla ktoregos wzoru kolorow.

Nizszy Max bucket oznacza bezpieczniejszy ruch, bo ogranicza najgorszy mozliwy wynik.

### Sredni bucket

Sredni bucket to oczekiwana liczba kandydatow po wykonaniu ruchu. Im nizszy, tym lepiej.

To praktyczna odpowiedz na pytanie: ile slow przecietnie zostanie mi po tym zgadnieciu?

### P(hit)

P(hit) to prawdopodobienstwo natychmiastowego trafienia hasla. Jesli slowo jest mozliwa odpowiedzia:

```text
P(hit) = 1 / liczba kandydatow
```

Jesli slowo jest tylko informacyjne i nie jest mozliwa odpowiedzia, P(hit) wynosi `0%`.

### Srednia liczba ruchow

**Sr. ruchy** pokazuje, ile prob przecietnie potrzebuje solver, gdy oceniane
slowo jest pierwsza proba tej symulacji. Kolejne ruchy sa zawsze wybierane
wedlug entropii, z zachowaniem ustawien **Tylko kandydaci**, **Dokladnie** i
filtra unlikely.

Wartosc z prefiksem `~`, na przyklad `~4,12`, jest szybka estymacja z rozmiarow
bucketow. Web Worker nastepnie zastepuje ja wynikiem symulacji wszystkich
aktualnych kandydatow.

Symulacja ma twardy limit 6 prob. Srednia obejmuje hasla rozwiazane w tym
limicie, dlatego obok znajduje sie solve rate, np. `98%`, informujacy, jaka
czesc kandydatow zostala rozwiazana.

Sortowanie po tej kolumnie najpierw preferuje wyzszy solve rate, a potem
nizsza srednia. Dla wydajnosci pelna symulacja obejmuje szersza shortliste:

- 48 slow przy ponad 200 kandydatach,
- do 96 slow przy maksymalnie 200 kandydatach.

Jest to dokladne porownanie wewnatrz shortlisty, a nie gwarancja znalezienia
globalnie najlepszego slowa w calym slowniku.

## Tryb Dokladnie

Pole **Dokladnie** zmienia sposob liczenia rankingu.

Gdy jest wylaczone, aplikacja uzywa szybkiego trybu. Przy duzej liczbie kandydatow nie liczy pelnych metryk dla absolutnie kazdego slowa, tylko najpierw ogranicza pule heurystyka literowa. Dzieki temu UI nie zawiesza sie na poczatku gry.

Gdy jest wlaczone, aplikacja liczy ranking dla pelniejszej puli. Wynik jest bardziej wiarygodny, ale moze byc wolniejszy.

## Heurystyka szybkiego rankingu

Heurystyka wybiera slowa, ktore prawdopodobnie warto policzyc dokladnie:

1. Bierze aktualna liste kandydatow.
2. Liczy, w ilu kandydatach wystepuje kazda litera.
3. Dla kazdego potencjalnego ruchu bierze tylko unikalne litery.
4. Sumuje popularnosc tych liter.
5. Dodaje maly bonus za liczbe unikalnych liter.
6. Bierze top-N slow i dopiero dla nich liczy entropie oraz buckety.

Powtorzona litera nie jest liczona podwojnie w heurystyce, bo zwykle daje mniej nowej informacji.

Aktualne progi:

- ponad 700 kandydatow: kandydaci sa przycinani heurystyka do 700 slow,
- ponad 350 kandydatow: slowa informacyjne sa przycinane heurystyka do 900 slow,
- przy wlaczonym **Dokladnie** przycinanie jest pomijane.

## Szczegoly ruchu

Panel **Szczegoly ruchu** pokazuje najwieksze buckety dla wybranego ruchu z rankingu. Bucket to grupa odpowiedzi, ktore dadza ten sam wzor kolorow.

To pomaga zrozumiec, czy slowo jest bezpieczne: dobry ruch nie tylko ma wysoka entropie, ale tez nie zostawia ogromnego najgorszego bucketa.

## Offline i PWA

Aplikacja rejestruje service workera w buildzie produkcyjnym. Cache'owane sa podstawowe zasoby aplikacji, manifest oraz lokalne `slowa.txt`, `hasla.txt`, `answer-metadata.json` i `opening-moves.json`.

## Zrodla danych

Slownik prob pochodzi ze slownika do gier SJP.PL, lista hasel jest filtrowana rankingiem czestosci KWJP, a oznaczenia odmian pochodza z PoliMorf. Szczegoly atrybucji sa w `NOTICE.md`.

## Stack

- Vite
- React
- TypeScript
- Vitest
- Web Worker dla rankingu
- IndexedDB dla wiekszego cache slownika
- localStorage dla ustawien, motywu i sesji

## Testy

Testy pokrywaja m.in.:

- scoring Wordle i powtarzajace sie litery,
- filtrowanie kandydatow,
- entropie i ranking,
- walidacje slownika,
- komendy gry,
- solver WordleBot-lite,
- interakcje komponentow.
