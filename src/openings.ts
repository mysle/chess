import { OPENING_ENTRIES, type OpeningEntry } from './openings_data';
import { POLISH_OPENING_ENTRIES, type PolishOpeningEntry } from './openings_data_pl';

export interface DetectedOpening {
  eco: string;
  name: string;
  uci: string;
  plies: number;
}

const PL_FAMILIES: Record<string, string> = {
  "Ruy Lopez": "Partia Hiszpańska",
  "Sicilian Defense": "Obrona Sycylijska",
  "French Defense": "Obrona Francuska",
  "Caro-Kann Defense": "Obrona Caro-Kann",
  "Caro-Kann": "Obrona Caro-Kann",
  "King's Indian Defense": "Obrona Królewsko-indyjska",
  "Scotch Game": "Partia Szkocka",
  "Queen's Gambit Declined": "Gambit Hetmański odrzucony",
  "Queen's Gambit Accepted": "Gambit Hetmański przyjęty",
  "Queen's Gambit": "Gambit Hetmański",
  "English Opening": "Debiut Angielski",
  "King's Gambit Accepted": "Gambit Królewski przyjęty",
  "King's Gambit Declined": "Gambit Królewski odrzucony",
  "King's Gambit": "Gambit Królewski",
  "Slav Defense": "Obrona Słowiańska",
  "Semi-Slav Defense": "Obrona Słowiańska",
  "Italian Game": "Partia Włoska",
  "Dutch Defense": "Obrona Holenderska",
  "Benoni Defense": "Obrona Benoni",
  "Four Knights Game": "Partia Czterech Skoczków",
  "Three Knights Opening": "Debiut Trzech Skoczków",
  "Vienna Game": "Debiut Wiedeński",
  "Nimzo-Indian Defense": "Obrona Nimzo-indyjska",
  "Grünfeld Defense": "Obrona Grünfelda",
  "Bishop's Opening": "Debiut Gońca",
  "Scandinavian Defense": "Obrona Skandynawska",
  "Alekhine Defense": "Obrona Alechina",
  "Pirc Defense": "Obrona Pirca",
  "Ponziani Opening": "Debiut Ponzianiego",
  "Philidor Defense": "Obrona Philidora",
  "Modern Defense": "Obrona Nowoczesna",
  "Nimzowitsch Defense": "Obrona Nimzowitscha",
  "Trompowsky Attack": "Atak Trompowskiego",
  "Nimzo-Larsen Attack": "Debiut Larsena",
  "Petrov's Defense": "Obrona Rosyjska (Petrowa)",
  "Latvian Gambit": "Gambit Łotewski",
  "Elephant Gambit": "Gambit Słonia",
  "Queen's Indian Defense": "Obrona Hetmańsko-indyjska",
  "Bogo-Indian Defense": "Obrona Bogo-indyjska",
  "Réti Opening": "Debiut Rétiego",
  "Tarrasch Defense": "Obrona Tarrascha",
  "Van Geet Opening": "Atak Van Geeta",
  "Grob Opening": "Debiut Groba",
  "Polish Opening": "Debiut Sokolskiego",
  "Bird Opening": "Debiut Birda",
  "Catalan Opening": "Partia Katalońska",
  "Center Game": "Partia Centralna",
  "Danish Gambit": "Gambit Duński",
  "Owen Defense": "Obrona Owena",
  "St. George Defense": "Obrona św. Jerzego",
  "Benko Gambit": "Gambit Wołżański (Benko)",
  "King's Indian Attack": "Atak Królewsko-indyjski (KIA)",
  "Zukertort Opening": "Debiut Rétiego",
  "King's Pawn Game": "Otwarcie pionem królewskim",
  "Queen's Pawn Game": "Otwarcie pionem hetmańskim",
  "Indian Defense": "Obrona Indyjska",
  "Indian Game": "Partia Indyjska",
  "Opening Game": "Otwarcie",
  "Open Game": "Partia Otwarta",
  "Closed Game": "Partia Zamknięta",
  "Semi-Open Game": "Partia Półotwarta",
  "Semi-Closed Game": "Partia Półzamknięta",
  "Hungarian Opening": "Otwarcie Węgierskie",
  "Saragossa Opening": "Debiut Saragossy",
  "Mieses Opening": "Debiut Miesesa",
  "Anderssen's Opening": "Debiut Anderssena",
  "Ware Opening": "Debiut Ware'a",
  "Sodium Attack": "Atak Sodowy",
  "Clemenz Opening": "Debiut Clemenza",
  "Barnes Opening": "Otwarcie Barnesa",
  "Amar Opening": "Debiut Amara",
  "Kádas Opening": "Otwarcie Kádasa",
  "Van't Kruijs Opening": "Otwarcie Van't Kruijsa",
  "English Defense": "Obrona Angielska",
  "Budapest Gambit": "Gambit Budapeszteński",
  "Blackmar-Diemer Gambit": "Gambit Blackmara-Diemera",
  "Albin Countergambit": "Kontrgambit Albina",
  "King's Knight Opening": "Otwarcie Skoczka Królewskiego",
  "Queen's Knight Opening": "Otwarcie Skoczka Hetmańskiego",
  "King's Bishop's Opening": "Otwarcie Gońca Królewskiego",
  "Queen's Bishop's Opening": "Otwarcie Gońca Hetmańskiego",
  "Bishop's Gambit": "Gambit Gońca",
  "Evans Gambit": "Gambit Evansa",
  "Two Knights Defense": "Obrona Dwóch Skoczków",
  "Giuoco Piano": "Partia Włoska (Giuoco Piano)",
  "Giuoco Pianissimo": "Partia Włoska, pianissimo"
};

function localizeName(name: string): string {
  const colon = name.indexOf(':');
  const family = (colon === -1 ? name : name.slice(0, colon)).trim();
  const rest = colon === -1 ? '' : name.slice(colon);
  const polish = PL_FAMILIES[family];
  return polish ? polish + rest : name;
}

function plies(uci: string): number {
  return uci ? uci.split(' ').length : 0;
}

function commonPrefix(a: string, b: string): number {
  const aa = a.split(' ');
  const bb = b.split(' ');
  const n = Math.min(aa.length, bb.length);
  let i = 0;
  while (i < n && aa[i] === bb[i]) i++;
  return i;
}

const EXACT = new Map<string, OpeningEntry>();
const BY_POSITION = new Map<string, OpeningEntry[]>();
for (const entry of OPENING_ENTRIES) {
  EXACT.set(entry.uci, entry);
  const list = BY_POSITION.get(entry.key);
  if (list) list.push(entry);
  else BY_POSITION.set(entry.key, [entry]);
}

const PL_EXACT = new Map<string, PolishOpeningEntry>();
const PL_BY_POSITION = new Map<string, PolishOpeningEntry[]>();
for (const entry of POLISH_OPENING_ENTRIES) {
  PL_EXACT.set(entry.uci, entry);
  const list = PL_BY_POSITION.get(entry.key);
  if (list) list.push(entry);
  else PL_BY_POSITION.set(entry.key, [entry]);
}

function deepestExact<T extends { uci: string }>(map: Map<string, T>, uci: string): { entry: T; plies: number } | null {
  const parts = uci.split(' ');
  for (let i = parts.length; i >= 1; i--) {
    const hit = map.get(parts.slice(0, i).join(' '));
    if (hit) return { entry: hit, plies: i };
  }
  return null;
}

function bestPosition<T extends { uci: string }>(map: Map<string, T[]>, uci: string, key: string): { entry: T; plies: number } | null {
  const candidates = map.get(key);
  if (!candidates || candidates.length === 0) return null;
  let best: { entry: T; plies: number } | null = null;
  let bestCommon = -1;
  for (const candidate of candidates) {
    const candidatePlies = plies(candidate.uci);
    const common = commonPrefix(uci, candidate.uci);
    if (common > bestCommon || (common === bestCommon && (!best || candidatePlies > best.plies))) {
      best = { entry: candidate, plies: candidatePlies };
      bestCommon = common;
    }
  }
  return best;
}

/**
 * Wykrywa najbardziej szczegółowe otwarcie dla bieżącej historii i pozycji.
 * Najpierw szuka dokładnej linii (najgłębszy prefiks), potem transpozycji
 * po pełnym kluczu pozycji. Polskie nazwy z ręcznego booka wygrywają przy
 * równej głębokości; głębsze warianty dostają standardowe nazwy ECO.
 */
export function detectOpening(uci: string, positionKey: string): DetectedOpening | null {
  let english = deepestExact(EXACT, uci);
  const englishPosition = bestPosition(BY_POSITION, uci, positionKey);
  if (englishPosition && (!english || englishPosition.plies > english.plies)) english = englishPosition;

  let polish = deepestExact(PL_EXACT, uci);
  const polishPosition = bestPosition(PL_BY_POSITION, uci, positionKey);
  if (polishPosition && (!polish || polishPosition.plies > polish.plies)) polish = polishPosition;

  if (polish && (!english || polish.plies >= english.plies)) {
    return {
      eco: english?.entry.eco ?? '',
      name: polish.entry.name,
      uci: polish.entry.uci,
      plies: polish.plies,
    };
  }

  if (english) {
    return {
      eco: english.entry.eco,
      name: localizeName(english.entry.name),
      uci: english.entry.uci,
      plies: english.plies,
    };
  }

  return null;
}
