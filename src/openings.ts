import { OPENING_ENTRIES, type OpeningEntry } from './openings_data';
import { POLISH_OPENING_ENTRIES, type PolishOpeningEntry } from './openings_data_pl';
import { localizeOpeningName } from './opening_names';

export interface DetectedOpening {
  eco: string;
  name: string;
  uci: string;
  plies: number;
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
// Klucz "zlagodzony": sama plansza + strona do ruchu (bez praw do roszady i bicia w przelocie).
// Dzieki temu lapane sa transpozycje, ktore roznia sie tylko metadanymi pozycji.
const BY_BOARD = new Map<string, OpeningEntry[]>();
for (const entry of OPENING_ENTRIES) {
  EXACT.set(entry.uci, entry);
  const list = BY_POSITION.get(entry.key);
  if (list) list.push(entry);
  else BY_POSITION.set(entry.key, [entry]);
  const boardKey = entry.key.slice(0, 65);
  const blist = BY_BOARD.get(boardKey);
  if (blist) blist.push(entry);
  else BY_BOARD.set(boardKey, [entry]);
}

const PL_EXACT = new Map<string, PolishOpeningEntry>();
const PL_BY_POSITION = new Map<string, PolishOpeningEntry[]>();
const PL_BY_BOARD = new Map<string, PolishOpeningEntry[]>();
for (const entry of POLISH_OPENING_ENTRIES) {
  PL_EXACT.set(entry.uci, entry);
  const list = PL_BY_POSITION.get(entry.key);
  if (list) list.push(entry);
  else PL_BY_POSITION.set(entry.key, [entry]);
  const boardKey = entry.key.slice(0, 65);
  const blist = PL_BY_BOARD.get(boardKey);
  if (blist) blist.push(entry);
  else PL_BY_BOARD.set(boardKey, [entry]);
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
  const boardKey = positionKey.slice(0, 65);

  let english = deepestExact(EXACT, uci);
  const englishPosition = bestPosition(BY_POSITION, uci, positionKey);
  if (englishPosition && (!english || englishPosition.plies > english.plies)) english = englishPosition;
  const englishBoard = bestPosition(BY_BOARD, uci, boardKey);
  if (englishBoard && (!english || englishBoard.plies > english.plies)) english = englishBoard;

  let polish = deepestExact(PL_EXACT, uci);
  const polishPosition = bestPosition(PL_BY_POSITION, uci, positionKey);
  if (polishPosition && (!polish || polishPosition.plies > polish.plies)) polish = polishPosition;
  const polishBoard = bestPosition(PL_BY_BOARD, uci, boardKey);
  if (polishBoard && (!polish || polishBoard.plies > polish.plies)) polish = polishBoard;

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
      name: localizeOpeningName(english.entry.name),
      uci: english.entry.uci,
      plies: english.plies,
    };
  }

  return null;
}
