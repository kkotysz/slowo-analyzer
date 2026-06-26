export interface HelpSection {
  title: string;
  tag: string;
  tone: "green" | "yellow" | "blue" | "red" | "violet" | "slate" | "teal" | "orange";
  takeaway: string;
  body: string[];
}

export const HELP_SECTIONS: HelpSection[] = [
  {
    title: "Jak działa aplikacja",
    tag: "Start",
    tone: "green",
    takeaway: "Wpisz hasło, dodawaj ruchy, a aplikacja sama zawęzi kandydatów.",
    body: [
      "Słowo Analyzer pomaga analizować polskie Wordle: po każdym ruchu zawęża listę możliwych odpowiedzi i liczy ranking kolejnych zgadnięć.",
      "Domyślny tryb to symulacja z hasłem: wpisujesz hasło końcowe, potem dodajesz słowa, a kolory są liczone automatycznie. W trybie ręcznym sam ustawiasz kolory kafelków.",
      "Kliknięcie słowa z listy kandydatów, rankingu albo pola Najlepszy ruch od razu dodaje je jako kolejny ruch.",
    ],
  },
  {
    title: "Słownik i cache",
    tag: "Dane",
    tone: "slate",
    takeaway: "Po zmianie slowa.txt albo hasla.txt kliknij Wczytaj. Cache-buster doda się automatycznie.",
    body: [
      "Aplikacja ładuje lokalne pliki public/slowa.txt i public/hasla.txt, a po pierwszym wczytaniu zapisuje słownik w cache przeglądarki.",
      "slowa.txt zawiera szeroką listę dopuszczalnych prób z SJP, hasla.txt zawiera możliwe odpowiedzi ograniczone do top 6000 słów z przecięcia SJP i KWJP według ARF, a answer-metadata.json oznacza odmiany wykryte przez PoliMorf.",
      "Jeśli zmienisz pliki słownika, kliknij Wczytaj w panelu słownika. Aplikacja automatycznie doda cache-buster, więc nie trzeba dopisywać ?v=1 ręcznie.",
      "Słowa spoza słownika nie są dodawane do gry. Zobaczysz komunikat To nie jest słowo ze słownika.",
    ],
  },
  {
    title: "Odmiany i unlikely",
    tag: "Filtr",
    tone: "slate",
    takeaway: "Ukryj unlikely domyślnie usuwa odmiany z kandydatów, rankingu, losowania i solvera.",
    body: [
      "Odmiana to słowo, które w PoliMorf występuje tylko jako forma innego lematu, np. narzędnik albo dopełniacz. Nie oznacza to rzadkości frekwencyjnej.",
      "Gdy Ukryj unlikely jest włączone, takie hasła nie są brane jako zwykłe odpowiedzi ani kolejne ruchy strategii. Ręcznie wpisane hasło w symulacji nadal może zostać przeanalizowane.",
      "Po wyłączeniu filtra odmiany wracają na listy i dostają badge odmiana z podpowiedzią lematu.",
    ],
  },
  {
    title: "Entropia",
    tag: "Informacja",
    tone: "blue",
    takeaway: "Wyżej zwykle znaczy lepiej: ruch daje więcej informacji.",
    body: [
      "Entropia mierzy, ile informacji średnio daje dane zgadnięcie. Im wyższa, tym lepiej ruch rozdziela kandydatów na różne wyniki kolorów.",
      "Wysoka entropia zwykle oznacza, że po ruchu zostanie mniej możliwych odpowiedzi.",
    ],
  },
  {
    title: "Max bucket",
    tag: "Ryzyko",
    tone: "red",
    takeaway: "Niżej znaczy bezpieczniej: to rozmiar najgorszego możliwego wyniku.",
    body: [
      "Max bucket to najgorszy przypadek: największa grupa kandydatów, jaka może zostać po danym ruchu dla któregoś wzoru kolorów.",
      "Niższy Max bucket oznacza bezpieczniejszy ruch, bo ogranicza najgorszy możliwy wynik.",
    ],
  },
  {
    title: "Średni bucket",
    tag: "Praktyka",
    tone: "teal",
    takeaway: "Niżej znaczy lepiej: to oczekiwana liczba kandydatów po ruchu.",
    body: [
      "Średni bucket to oczekiwana liczba kandydatów po ruchu. Im niższa, tym lepiej.",
      "Ta metryka jest praktycznym odpowiednikiem pytania: ile słów przeciętnie zostanie mi po tym zgadnięciu?",
    ],
  },
  {
    title: "P(hit)",
    tag: "Trafienie",
    tone: "yellow",
    takeaway: "Ważne pod koniec gry: pokazuje szansę natychmiastowego rozwiązania.",
    body: [
      "P(hit) to prawdopodobieństwo natychmiastowego trafienia. Jeśli słowo jest możliwą odpowiedzią, wynosi 1 / liczba kandydatów.",
      "Jeśli słowo jest tylko informacyjne i nie jest możliwą odpowiedzią, P(hit) wynosi 0%.",
    ],
  },
  {
    title: "Dokładnie i heurystyka",
    tag: "Szybkość",
    tone: "violet",
    takeaway: "Dokładnie jest wolniejsze, ale liczy pełniejszą pulę słów.",
    body: [
      "Gdy Dokładnie jest wyłączone, aplikacja używa szybkiego trybu: przy wielu kandydatach najpierw wybiera obiecujące słowa heurystyką literową, a dopiero potem liczy dla nich pełne metryki.",
      "Heurystyka liczy, w ilu aktualnych kandydatach występuje każda litera. Słowo dostaje punkty za unikalne litery, które często pojawiają się w pozostałych kandydatach, plus mały bonus za liczbę unikalnych liter.",
      "Gdy Dokładnie jest włączone, aplikacja pomija to przycinanie i liczy ranking dla pełniejszej puli. Jest to bardziej wiarygodne, ale wolniejsze na początku gry.",
    ],
  },
  {
    title: "Solver startowy",
    tag: "Solver",
    tone: "teal",
    takeaway: "Sprawdza rozkład liczby prób dla wybranego słowa startowego.",
    body: [
      "Panel Solver startowy uruchamiasz ręcznie przyciskiem Start. Wpisane słowo jest pierwszą próbą, a limit prób obejmuje także ten ruch.",
      "Solver testuje aktywną pulę haseł ze słownika odpowiedzi. Po każdym buckecie wybiera następne słowo według aktualnych ustawień rankingu: Tylko kandydaci, Dokładnie, Ukryj unlikely i aktywnej metryki sortowania.",
      "Histogram pokazuje, ile haseł rozwiązało się w 1..n próbach. Słupek > n zbiera hasła nierozwiązane w zadanym limicie.",
    ],
  },
  {
    title: "Historia i strategia",
    tag: "Strategia",
    tone: "orange",
    takeaway: "Kliknij wcześniejszy etap, żeby uciąć późniejsze ruchy i spróbować inaczej.",
    body: [
      "Panel Stan gry pokazuje kolejne ruchy, liczbę kandydatów po ruchu, redukcję i luck score.",
      "Kliknięcie wcześniejszego etapu przycina późniejsze ruchy. To pozwala szybko wrócić i sprawdzić alternatywną strategię.",
      "Przycisk Losowe hasło wybiera odpowiedź ze słownika i pozwala trenować bez ręcznego wymyślania hasła.",
    ],
  },
];
