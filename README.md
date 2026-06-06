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

## Glowny przeplyw

Domyslny tryb to **Symulacja z haslem**:

1. Wpisz haslo koncowe.
2. Wpisz slowo w aktywnym wierszu albo kliknij slowo z kandydatow/rankingu.
3. Aplikacja automatycznie liczy kolory przez mechanike Wordle.
4. Po ruchu widzisz kandydatow, ranking kolejnych ruchow i metryki jakosci.

Klikniecie slowa z panelu kandydatow, rankingu albo pola **Najlepszy ruch** od razu dodaje je jako kolejny ruch. Po zatwierdzeniu fokus przechodzi do nastepnego pola.

Tryb **Analiza reczna** pozwala samodzielnie ustawic kolory kafelkow. Kafelki przechodza cyklem:

```text
szary -> zolty -> zielony
```

## Historia i strategie

Panel **Stan gry** pokazuje kolejne etapy rozgrywki:

- slowo i wzor kolorow,
- liczbe kandydatow po ruchu,
- redukcje listy kandydatow,
- podstawowy luck score.

Klikniecie wczesniejszego etapu przycina pozniejsze ruchy. Dzieki temu mozna szybko wrocic do poprzedniego momentu i sprawdzic inna strategie.

Przycisk **Losowe haslo** wybiera haslo ze slownika odpowiedzi i resetuje gre do treningu.

## Slownik

Aplikacja uzywa lokalnego pliku:

```text
public/slowa.txt
```

Plik powinien miec jedno slowo na linie. Loader normalizuje slowa, usuwa duplikaty, odrzuca wpisy inne niz 5 polskich liter i sortuje wynik po polsku.

Po pierwszym wczytaniu slownik jest cache'owany w przegladarce. Jesli zmienisz `public/slowa.txt`, kliknij **Wczytaj** w panelu slownika. Aplikacja automatycznie doda cache-buster do pobrania, wiec nie trzeba dopisywac `?v=1` recznie.

Slowo spoza slownika nie zostanie dodane do planszy. Aplikacja pokaze komunikat:

```text
To nie jest slowo ze slownika.
```

## Metryki rankingu

Ranking domyslnie pokazuje tylko mozliwych kandydatow i sortuje po **Entropii**. Sortowanie zmieniasz klikajac naglowki tabeli: Entropia, Max, Sr. albo P(hit).

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

Aplikacja rejestruje service workera w buildzie produkcyjnym. Cache'owane sa podstawowe zasoby aplikacji, manifest i lokalny `slowa.txt`.

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
