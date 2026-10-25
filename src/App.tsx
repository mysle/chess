import { useState, useEffect, useRef } from 'react';
import { stockfish, type EngineStatus } from './engine/stockfishClient';
import { PUZZLES_FROM_LICHESS } from './puzzles_data';

// Pasek oceny: centypiony (perspektywa białych) -> % dla białych + etykieta
export function evalToDisplay(ev: { cp: number | null; mate: number | null }): { pct: number; label: string } {
  if (ev.mate !== null && ev.mate !== undefined) {
    const w = ev.mate > 0;
    return { pct: w ? 100 : 0, label: w ? `M${ev.mate}` : `-M${Math.abs(ev.mate)}` };
  }
  const cp = ev.cp ?? 0;
  return {
    pct: Math.min(99, Math.max(1, 100 / (1 + Math.exp(-0.004 * cp)))),
    label: `${cp >= 0 ? '+' : ''}${(cp / 100).toFixed(1)}`,
  };
}

export type GameResultType = 'mate' | 'stalemate' | 'draw-50' | 'draw-repetition' | 'draw-material' | 'draw-agreement' | 'resign' | 'timeout';
export interface MoveRec { from: number; to: number; piece: string; captured?: string | null; promotion?: string; san: string; }
interface HistorySnapshot {
  board: (string | null)[];
  side: 'w' | 'b';
  castle: { wk: boolean; wq: boolean; bk: boolean; bq: boolean };
  ep: number;
  half: number;
  cw: string[];
  cb: string[];
  mh: MoveRec[];
  lm: { from: number; to: number } | null;
}
interface PuzzleReturnState {
  board: (string | null)[];
  side: 'w' | 'b';
  castle: { wk: boolean; wq: boolean; bk: boolean; bq: boolean };
  ep: number;
  half: number;
  lastProgress: { kind: 'start' | 'pawn' | 'capture'; san: string };
  positionCounts: Record<string, number>;
  historyStack: HistorySnapshot[];
  cw: string[];
  cb: string[];
  mh: MoveRec[];
  lm: { from: number; to: number } | null;
  gameMode: 'ai' | 'human';
  humanColor: 'w' | 'b';
  flipped: boolean;
  gameActive: boolean;
  gameResult: { type: GameResultType; winner: 'w' | 'b' | null } | null;
  timeRefs: { w: number; b: number };
  whiteTime: number;
  blackTime: number;
  openingName: string;
}

export const BOARD_THEMES = [
  { id: 'classic', name: 'Klasyk', light: 'linear-gradient(145deg,#f0d9b5 0%,#e8c89a 100%)', dark: 'linear-gradient(145deg,#b58863 0%,#9c7354 100%)' },
  { id: 'green', name: 'Zieleń', light: 'linear-gradient(145deg,#e8eed9 0%,#d4dfb8 100%)', dark: 'linear-gradient(145deg,#769656 0%,#5f7d45 100%)' },
  { id: 'blue', name: 'Błękit', light: 'linear-gradient(145deg,#dee3e6 0%,#c3ccd1 100%)', dark: 'linear-gradient(145deg,#7399b5 0%,#5a7d99 100%)' },
  { id: 'gray', name: 'Grafit', light: 'linear-gradient(145deg,#f2f2f2 0%,#d9d9d9 100%)', dark: 'linear-gradient(145deg,#7a7a7a 0%,#5c5c5c 100%)' },
];

/* (zestaw Unicode usunięty - zastąpiony przez Kingdom, generator poniżej) */

const ECO_POS: Record<string, string> = {
  "r..q.rk..bp.bpppp.np.n...p..p.......P....BP..N.PPP.P.PP.RNBQR.K.w": "Partia Hiszpańska, wariant Zajcewa",
  "r..qkb.r.bpp.pppp.n..n...p..p.......P....B...N..PPPP.PPPRNBQ.RK.w": "Partia Hiszpańska, neo-archangielski",
  "r..qkbnrppp.pppp..n........p......PP..b......N..PP..PPPPRNBQKB.Rw": "Obrona Czigorina, wariant Janowskiego",
  "r.b.k..rppppnppp..n..q....b........NP.....P.B...PP...PPPRN.QKB.Rw": "Partia Szkocka, wariant Lollego",
  "r.b.k.nrpppp.ppp..n..q....b........NP.......B...PPP..PPPRN.QKB.Rw": "Partia Szkocka, wariant Lollego",
  "r.b.k.nrpppp.ppp..n..q....b........NP.....P.B...PP...PPPRN.QKB.Rb": "Partia Szkocka, wariant Lollego",
  "r.b.kb.rpp.n.ppp..p.pn..q..p..B...PP......N.PN..PP...PPPR..QKB.Rw": "Gambit Hetmański, wariant Cambridge Springs",
  "r.b.kbnrpppp.ppp..n................NP..q........PPP..PPPRNBQKB.Rw": "Partia Szkocka, wariant Steinitza",
  "r.bq.rk...p.bpppp..p.n..np..p.......P....BP..N.PPP.P.PP.RNBQR.K.w": "Partia Hiszpańska, wariant Czigorina",
  "r.bq.rk...p.bpppp.np.n...p..p.......P....BP..N..PP.P.PPPRNBQR.K.w": "Partia Hiszpańska, wariant Zajcewa",
  "r.bq.rk...p.bpppp.np.n...p..p.......P....BP..N.PPP.P.PP.RNBQR.K.b": "Partia Hiszpańska, wariant Zajcewa",
  "r.bq.rk.ppp..pbp..np.np.....p.....PPP.....N..N..PP..BPPPR.BQ.RK.w": "Obrona Królewsko-indyjska, Mar del Plata",
  "r.bq.rk.ppp..pbp..np.np....Pp.....P.P.....N..N..PP..BPPPR.BQ.RK.b": "Obrona Królewsko-indyjska, Mar del Plata",
  "r.bq.rk.ppp.npbp...p.np....Pp.....P.P.....N..N..PP..BPPPR.BQ.RK.w": "Obrona Królewsko-indyjska, Mar del Plata",
  "r.bqk..r..p.bpppp.np.n...p..p.......P....B...N..PPPP.PPPRNBQR.K.w": "Partia Hiszpańska, wariant Zajcewa",
  "r.bqk..r..p.bpppp.np.n...p..p.......P....BP..N..PP.P.PPPRNBQR.K.b": "Partia Hiszpańska, wariant Zajcewa",
  "r.bqk..r..ppbpppp.n..n...p..p.......P....B...N..PPPP.PPPRNBQR.K.b": "Partia Hiszpańska, wariant Zajcewa",
  "r.bqk..r..ppbpppp.n..n...p..p...B...P........N..PPPP.PPPRNBQR.K.w": "Partia Hiszpańska, wariant Zajcewa",
  "r.bqk..r.pppbpppp.n..n......p...B...P........N..PPPP.PPPRNBQ.RK.w": "Partia Hiszpańska, wariant Zajcewa",
  "r.bqk..r.pppbpppp.n..n......p...B...P........N..PPPP.PPPRNBQR.K.b": "Partia Hiszpańska, wariant Zajcewa",
  "r.bqk..rppp..ppp..np.n....b.p.....B.P.....PP.N..PP...PPPRNBQK..Rw": "Partia Włoska z ...d6",
  "r.bqk..rpppp.ppp..n..n....b.p.....B.P.....P..N..PP.P.PPPRNBQK..Rw": "Partia Włoska z ...d6",
  "r.bqk..rpppp.ppp..n..n....b.p.....BPP.....P..N..PP...PPPRNBQK..Rb": "Partia Włoska, atak Moellera",
  "r.bqk..rpppp.ppp..n..n...B..p....b..P.....N..N..PPPP.PPPR.BQK..Rw": "Partia Czterech Skoczków, hiszpańska",
  "r.bqk.nrpppp.ppp..n.........p....bB.P........N..P.PP.PPPRNBQK..Rw": "Partia Włoska, gambit Evansa przyjęty (główny)",
  "r.bqk.nrpppp.ppp..n.........p....bB.P.....P..N..P..P.PPPRNBQK..Rb": "Partia Włoska, gambit Evansa przyjęty (główny)",
  "r.bqk.nrpppp.ppp..n.......b.........P....N......PPP..PPPRNBQKB.Rb": "Partia Szkocka, wariant Pottera",
  "r.bqk.nrpppp.ppp..n.......b........NP...........PPP..PPPRNBQKB.Rw": "Partia Szkocka, wariant Pottera",
  "r.bqk.nrpppp.ppp..n.......b........NP.......B...PPP..PPPRN.QKB.Rb": "Partia Szkocka, wariant Lollego",
  "r.bqk.nrpppp.ppp..n.......b.p.....B.P........N..PPPP.PPPRNBQK..Rw": "Partia Włoska, gambit Evansa przyjęty (główny)",
  "r.bqk.nrpppp.ppp..n.......b.p.....B.P.....P..N..PP.P.PPPRNBQK..Rb": "Partia Włoska z ...d6",
  "r.bqk.nrpppp.ppp..n.......b.p....PB.P........N..P.PP.PPPRNBQK..Rb": "Partia Włoska, gambit Evansa przyjęty (główny)",
  "r.bqk.nrpppp.ppp..n......Bb.p.......P........N..PPPP.PPPRNBQK..Rw": "Partia Hiszpańska, obrona klasyczna",
  "r.bqk.nrpppp.ppp..n.....b...p.....B.P.....P..N..P..P.PPPRNBQK..Rw": "Partia Włoska, gambit Evansa przyjęty (główny)",
  "r.bqk.nrpppp.ppp.bn.........p....PB.P........N..P.PP.PPPRNBQK..Rw": "Partia Włoska, gambit Evansa odrzucony",
  "r.bqk.nrppppbppp..n.........p.....B.P........N..PPPP.PPPRNBQK..Rw": "Obrona Węgierska",
  "r.bqkb.r..pp.pppp.n..n...p..p.......P....B...N..PPPP.PPPRNBQ.RK.b": "Partia Hiszpańska, neo-archangielski",
  "r.bqkb.r..pp.pppp.n..n...p..p...B...P........N..PPPP.PPPRNBQ.RK.w": "Partia Hiszpańska, neo-archangielski",
  "r.bqkb.r.pp..pppp.n........pp...B...n........N..PPPP.PPPRNBQR.K.w": "Partia Hiszpańska, kontratak Marshalla",
  "r.bqkb.r.ppp.pppp.n.........p...B...n........N..PPPP.PPPRNBQR.K.b": "Partia Hiszpańska, kontratak Marshalla",
  "r.bqkb.r.ppp.pppp.n..n......p...B...P........N..PPPP.PPPRNBQK..Rw": "Partia Hiszpańska, neo-archangielski",
  "r.bqkb.r.ppp.pppp.n..n...B..p.......P.....N..N..PPPP.PPPR.BQK..Rw": "Partia Czterech Skoczków, wariant Gunsberga",
  "r.bqkb.rp.p..ppp..n..n...p.Pp.N...B.............PPPP.PPPRNBQK..Rw": "Obrona Dwóch Skoczków, wariant Ulvestada",
  "r.bqkb.rpp...ppp..np.n......p......NP.....N.....PPP.BPPPR.BQK..Rw": "Sycylijska, wariant Bolesławskiego",
  "r.bqkb.rpp..pppp..np.n.............NP.....N.....PPP.BPPPR.BQK..Rb": "Sycylijska, wariant Bolesławskiego",
  "r.bqkb.rpp..pppp..np.n............BNP.....N.....PPP..PPPR.BQK..Rb": "Sycylijska, atak Sozina",
  "r.bqkb.rpp..pppp..np.n........B....NP.....N.....PPP..PPPR..QKB.Rb": "Sycylijska, atak Richtera-Rauzera",
  "r.bqkb.rpp.n.ppp..p.pn............pP......NBPN..PP...PPPR.BQK..Rw": "Obrona Słowiańska, wariant Merana",
  "r.bqkb.rpp.n.ppp..p.pn.....p......PP......N.PN..PP...PPPR.BQKB.Rw": "Obrona Słowiańska, wariant Merana",
  "r.bqkb.rpp.n.ppp..p.pn.....p......PP......NBPN..PP...PPPR.BQK..Rb": "Obrona Słowiańska, wariant Merana",
  "r.bqkb.rpp.n.ppp..p.pn.....p..B...PP......N.P...PP...PPPR..QKBNRw": "Gambit Hetmański, wariant Cambridge Springs",
  "r.bqkb.rpp.n.ppp..p.pn.....p..B...PP......N.PN..PP...PPPR..QKB.Rb": "Gambit Hetmański, wariant Cambridge Springs",
  "r.bqkb.rpp.p.ppp..n..n......p......NP.....N.....PPP..PPPR.BQKB.Rw": "Obrona Sycylijska, wariant Swiesznikowa",
  "r.bqkb.rpp.ppppp..n..n.............NP...........PPP..PPPRNBQKB.Rw": "Obrona Sycylijska, wariant Swiesznikowa",
  "r.bqkb.rpp.ppppp..n..n.............NP.....N.....PPP..PPPR.BQKB.Rb": "Obrona Sycylijska, wariant Swiesznikowa",
  "r.bqkb.rppp..ppp.....n.....Pp.N...Bn............PPPP.PPPRNBQK..Rw": "Obrona Dwóch Skoczków, wariant Fritza",
  "r.bqkb.rppp..ppp..n........np.N...B.............PPPP.PPPRNBQK..Rw": "Partia Włoska, atak Wątróbki (Fried Liver)",
  "r.bqkb.rppp..ppp..n..n.....Pp.N...B.............PPPP.PPPRNBQK..Rb": "Obrona Dwóch Skoczków, wariant Ulvestada",
  "r.bqkb.rppp..ppp..n..n.....pP.....Bp.........N..PPP..PPPRNBQK..Rw": "Obrona Dwóch Skoczków, wariant otwarty",
  "r.bqkb.rppp..ppp..n..n.....pp.N...B.P...........PPPP.PPPRNBQK..Rw": "Obrona Dwóch Skoczków, wariant Ulvestada",
  "r.bqkb.rpppn.ppp....pn.....p..B...PP......N.....PP..PPPPR..QKBNRw": "Gambit Hetmański, wariant Cambridge Springs",
  "r.bqkb.rpppn.ppp....pn.....p..B...PP......N.P...PP...PPPR..QKBNRb": "Gambit Hetmański, wariant Cambridge Springs",
  "r.bqkb.rpppp.Bpp..n..n......p.......P........N..PPPP.PPPRNBQK..Rb": "Gambit Jerome'a",
  "r.bqkb.rpppp.ppp.....n...B..p......nP.....N..N..PPPP.PPPR.BQK..Rw": "Partia Czterech Skoczków, wariant Rubinsteina",
  "r.bqkb.rpppp.ppp..n..n.............NP.....N.....PPP..PPPR.BQKB.Rb": "Partia Szkocka, wariant Czterech Skoczków",
  "r.bqkb.rpppp.ppp..n..n............BpP........N..PPP..PPPRNBQK..Rw": "Obrona Dwóch Skoczków, wariant otwarty",
  "r.bqkb.rpppp.ppp..n..n......N.......P.....N.....PPPP.PPPR.BQKB.Rb": "Partia Czterech Skoczków, gambit Halloween",
  "r.bqkb.rpppp.ppp..n..n......P.....Bp.........N..PPP..PPPRNBQK..Rb": "Obrona Dwóch Skoczków, wariant otwarty",
  "r.bqkb.rpppp.ppp..n..n......p.......P.....P..N..PP.P.PPPRNBQKB.Rw": "Debiut Ponzianiego, wariant Jaenischa",
  "r.bqkb.rpppp.ppp..n..n......p......PP.....N..N..PPP..PPPR.BQKB.Rb": "Partia Czterech Skoczków, szkocka",
  "r.bqkb.rpppp.ppp..n..n......p.....BPP........N..PPP..PPPRNBQK..Rb": "Obrona Dwóch Skoczków, wariant otwarty",
  "r.bqkb.rpppp.ppp..n..n......p.....P.......N..N..PP.PPPPPR.BQKB.Rw": "Debiut Angielski, czterech skoczków",
  "r.bqkb.rpppp.ppp..n..n......p.N...B.P...........PPPP.PPPRNBQK..Rb": "Obrona Dwóch Skoczków, wariant Ulvestada",
  "r.bqkb.rpppp.ppp..n..n...B..p.......P........N..PPPP.PPPRNBQK..Rw": "Partia Hiszpańska, obrona Berlińska",
  "r.bqkb.rpppp.ppp..n..n...B..p.......P.....N..N..PPPP.PPPR.BQK..Rb": "Partia Czterech Skoczków, wariant Gunsberga",
  "r.bqkb.rppppnppp..n......B..p.......P........N..PPPP.PPPRNBQK..Rw": "Partia Hiszpańska, obrona Cozio",
  "r.bqkbnr.pp..pppp.p.........p.......P........N..PPPP.PPPRNBQ.RK.b": "Partia Hiszpańska, wariant wymienny z roszadą",
  "r.bqkbnr.pp..pppp.p.........p.......P........N..PPPP.PPPRNBQK..Rw": "Partia Hiszpańska, wariant wymienny z roszadą",
  "r.bqkbnr.ppp.pppp.n.........p...B...P........N..PPPP.PPPRNBQK..Rb": "Partia Hiszpańska, neo-archangielski",
  "r.bqkbnrpp...ppp..n.p.....ppP......P......P.....PP...PPPRNBQKBNRw": "Obrona Francuska, wariant posunięty (główny)",
  "r.bqkbnrpp...ppp..n.p.....ppP......P......P..N..PP...PPPRNBQKB.Rb": "Obrona Francuska, wariant posunięty (główny)",
  "r.bqkbnrpp.npppp..p................PN...........PPP..PPPR.BQKBNRw": "Obrona Caro-Kann, wariant Karpow",
  "r.bqkbnrpp.p.ppp..n.........p......NP...........PPP..PPPRNBQKB.Rw": "Obrona Sycylijska, wariant Kałasznikowa",
  "r.bqkbnrpp.p.ppp..n.p..............NP...........PPP..PPPRNBQKB.Rw": "Obrona Sycylijska, wariant Tajmanowa",
  "r.bqkbnrpp.ppp.p..n...p............NP...........PPP..PPPRNBQKB.Rw": "Obrona Sycylijska, przyśpieszony Smok",
  "r.bqkbnrpp.ppppp..n................NP...........PPP..PPPRNBQKB.Rb": "Obrona Sycylijska, przyśpieszony Smok",
  "r.bqkbnrpp.ppppp..n................pP........N..PPP..PPPRNBQKB.Rw": "Obrona Sycylijska, przyśpieszony Smok",
  "r.bqkbnrpp.ppppp..n.......p.........P.....N.....PPPP.PPPR.BQKBNRw": "Obrona Sycylijska, atak Grand Prix",
  "r.bqkbnrpp.ppppp..n.......p.........PP....N.....PPPP..PPR.BQKBNRb": "Obrona Sycylijska, atak Grand Prix",
  "r.bqkbnrpp.ppppp..n.......p........PP........N..PPP..PPPRNBQKB.Rb": "Obrona Sycylijska, przyśpieszony Smok",
  "r.bqkbnrpp.ppppp..n......Bp.........P........N..PPPP.PPPRNBQK..Rb": "Obrona Sycylijska, wariant Rossolimo",
  "r.bqkbnrppp..ppp..n.........P.....Pp.........N..PP..PPPPRNBQKB.Rw": "Kontratak Albina, wariant główny",
  "r.bqkbnrppp..ppp..n........pp.......P.....P..N..PP.P.PPPRNBQKB.Rw": "Debiut Ponzianiego, kontra Caro",
  "r.bqkbnrppp..ppp..n........pp.......PP....N.....PPPP..PPR.BQKBNRw": "Debiut Wiedeński, wariant Steinitza",
  "r.bqkbnrppp..ppp..n........pp.....PP.........N..PP..PPPPRNBQKB.Rw": "Obrona Czigorina, łódzka",
  "r.bqkbnrppp..ppp..np.....B..p.......P........N..PPPP.PPPRNBQK..Rw": "Partia Hiszpańska, obrona Steinitza",
  "r.bqkbnrppp.pppp..n........p......PP............PP..PPPPRNBQKBNRw": "Obrona Czigorina, łódzka",
  "r.bqkbnrpppn.ppp...p........p......PP........N..PPP..PPPRNBQKB.Rw": "Obrona Philidora, wariant Hanhama",
  "r.bqkbnrpppp..pp..n......B..pp......P........N..PPPP.PPPRNBQK..Rw": "Partia Hiszpańska, gambit Schliemanna",
  "r.bqkbnrpppp.p.p..n...p.....p.......P.....N..N..PPPP.PPPR.BQKB.Rw": "Debiut Trzech Skoczków, wariant Steinitza",
  "r.bqkbnrpppp.ppp............p.....BnP........N..PPPP.PPPRNBQK..Rw": "Gambit Shillinga (Blackburne)",
  "r.bqkbnrpppp.ppp.........B..p......nP........N..PPPP.PPPRNBQK..Rw": "Partia Hiszpańska, obrona Birda",
  "r.bqkbnrpppp.ppp..n.................P.....N..N..PP...PPPR.BQKB.Rb": "Partia Szkocka, Göring przyjęty (główny)",
  "r.bqkbnrpppp.ppp..n.................P.....p..N..PP...PPPRNBQKB.Rw": "Partia Szkocka, Göring przyjęty (główny)",
  "r.bqkbnrpppp.ppp..n................NP...........PPP..PPPRNBQKB.Rb": "Partia Szkocka, wariant Pottera",
  "r.bqkbnrpppp.ppp..n...............BpP........N..PPP..PPPRNBQK..Rb": "Gambit Szkocki",
  "r.bqkbnrpppp.ppp..n.........p.......P........N..PPPP.PPPRNBQKB.Rw": "Debiut Ponzianiego, kontra Caro",
  "r.bqkbnrpppp.ppp..n.........p.......P.....N.....PPPP.PPPR.BQKBNRw": "Debiut Wiedeński, wariant Steinitza",
  "r.bqkbnrpppp.ppp..n.........p.......P.....P..N..PP.P.PPPRNBQKB.Rb": "Debiut Ponzianiego, kontra Caro",
  "r.bqkbnrpppp.ppp..n.........p.......PP....N.....PPPP..PPR.BQKBNRb": "Debiut Wiedeński, wariant Steinitza",
  "r.bqkbnrpppp.ppp..n.........p......PP...........PPP..PPPRNBQKBNRw": "Obrona Nimzowitscha, wariant Kennedy'ego",
  "r.bqkbnrpppp.ppp..n.........p......PP........N..PPP..PPPRNBQKB.Rb": "Partia Szkocka, Göring przyjęty (główny)",
  "r.bqkbnrpppp.ppp..n......B..p.......P........N..PPPP.PPPRNBQK..Rb": "Partia Hiszpańska, neo-archangielski",
  "r.bqkbnrppppp.pp..n..........p......P........N..PPPP.PPPRNBQKB.Rw": "Obrona Nimzowitscha, gambit Kolorado",
  "rn.qkb.rp.pp.pppbp..pn............PP.........NP.PP..PP.PRNBQKB.Rw": "Obrona Hetmańsko-indyjska, wariant klasyczny",
  "rn.qkb.rppp.pppp.....n.....p.b.....P.B......P...PPP..PPPRN.QKBNRw": "System Londyński nowoczesny",
  "rn.qkbnrpp..pppp..p..........b.....P..........N.PPP..PPPR.BQKBNRb": "Obrona Caro-Kann, klasyczny (główny)",
  "rn.qkbnrpp..pppp..p..........b.....PN...........PPP..PPPR.BQKBNRw": "Obrona Caro-Kann, klasyczny (główny)",
  "rn.qkbnrpp..pppp..p...b............P..........N.PPP..PPPR.BQKBNRw": "Obrona Caro-Kann, klasyczny (główny)",
  "rnb.kb.r.p...ppppq.ppn........B....NPP....N.....PPP...PPR..QKB.Rw": "Sycylijska, Najdorf i zatruty pion",
  "rnb.kb.rppp.pppp.....n..q..........P......N.....PPP..PPPR.BQKBNRw": "Obrona Skandynawska, wariant główny",
  "rnb.kb.rppp.pppp.....n..q..........P......N..N..PPP..PPPR.BQKB.Rb": "Obrona Skandynawska, wariant główny",
  "rnb.kbnrppp..ppp...........qp................N..PPPP.PPPRNBQKB.Rw": "Gambit Słonia, wariant Maróczyego",
  "rnb.kbnrppp.pppp........q.................N.....PPPP.PPPR.BQKBNRw": "Obrona Skandynawska, wariant główny",
  "rnb.kbnrppp.pppp........q..........P......N.....PPP..PPPR.BQKBNRb": "Obrona Skandynawska, wariant główny",
  "rnb.kbnrpppp.ppp............p.......PP.q........PPPP..PPRNBQKBNRw": "Gambit Królewski, obrona Keene'a",
  "rnb.kbnrppppqppp....................Pp.......N..PPPP..PPRNBQKB.Rw": "Gambit Królewski, wariant Norwala",
  "rnb.kbnrppppqppp............p.......P........N..PPPP.PPPRNBQKB.Rw": "Obrona Gunderama",
  "rnbq.rk...p.bpppp..p.n...p..p.......P....BP..N.PPP.P.PP.RNBQR.K.w": "Partia Hiszpańska, wariant Breyera",
  "rnbq.rk.pp..ppbp...p.np...p.......PPP.....N.BP..PP....PPR..QKBNRw": "Obrona Królewsko-indyjska, Sämisch (główny)",
  "rnbq.rk.ppp..pbp...p.np.....p.....PPP.....N..N..PP..BPPPR.BQ.RK.b": "Obrona Królewsko-indyjska, Mar del Plata",
  "rnbq.rk.ppp..ppp....pn.....p.....bPP......NBP...PP...PPPR.BQK.NRw": "Obrona Nimzo-indyjska, klasyczny (główny)",
  "rnbq.rk.ppp.ppbp...p.np...........PPP.....N.....PP..BPPPR.BQK.NRw": "Obrona Królewsko-indyjska, wariant Awerbacha",
  "rnbq.rk.ppp.ppbp...p.np...........PPP.....N...P.PP...P.PR.BQKBNRw": "Obrona Królewsko-indyjska, fianchetto (główny)",
  "rnbq.rk.ppp.ppbp...p.np...........PPP.....N...P.PP...PBPR.BQK.NRb": "Obrona Królewsko-indyjska, fianchetto (główny)",
  "rnbq.rk.ppp.ppbp...p.np...........PPP.....N..P..PP....PPR.BQKBNRw": "Obrona Królewsko-indyjska, Sämisch (główny)",
  "rnbq.rk.ppp.ppbp...p.np...........PPP.....N.BP..PP....PPR..QKBNRb": "Obrona Królewsko-indyjska, Sämisch (główny)",
  "rnbq.rk.ppp.ppbp...p.np...........PPPP....N.....PP....PPR.BQKBNRw": "Obrona Królewsko-indyjska, Cztery Piony (główny)",
  "rnbq.rk.ppp.ppbp...p.np...........PPPP....N..N..PP....PPR.BQKB.Rb": "Obrona Królewsko-indyjska, Cztery Piony (główny)",
  "rnbq.rk.ppp.ppbp...p.np.......B...PPP.....N.....PP..BPPPR..QK.NRb": "Obrona Królewsko-indyjska, wariant Awerbacha",
  "rnbq.rk.pppp.ppp....pn...........bPP......N.P...PP...PPPR.BQKBNRw": "Obrona Nimzo-indyjska, klasyczny (główny)",
  "rnbq.rk.pppp.ppp....pn...........bPP......NBP...PP...PPPR.BQK.NRb": "Obrona Nimzo-indyjska, klasyczny (główny)",
  "rnbq.rk.ppppp.bp.....np......p.....P.........NP.PPP.PPBPRNBQ.RK.w": "Obrona Holenderska, leningradzki (główny)",
  "rnbqk..rpp..ppbp...p.np............NP.....N.B...PPP..PPPR..QKB.Rw": "Sycylijska, Smok jugosłowiański",
  "rnbqk..rpp..ppbp...p.np............NP.....N.BP..PPP...PPR..QKB.Rb": "Sycylijska, Smok jugosłowiański",
  "rnbqk..rpp.p.ppp....pn....p.......PP....P.P.........PPPPR.BQKBNRw": "Obrona Nimzo-indyjska, Sämisch (główny)",
  "rnbqk..rpp.p.ppp....pn....p......bPP......N.P...PP...PPPR.BQKBNRw": "Obrona Nimzo-indyjska, wariant Hübnera",
  "rnbqk..rppp..ppp....pn.....p..B..bPP......N.....PP..PPPPR..QKBNRw": "Gambit Hetmański, wariant Ragozina",
  "rnbqk..rppp.bpp.....pn.p...p......PP...B..N.P...PP...PPPR..QKBNRb": "Gambit Hetmański, obrona Laskera",
  "rnbqk..rppp.bppp....pn.....p......PP..........P.PP..PPBPRNBQK.NRw": "Partia Katalońska zamknięta",
  "rnbqk..rppp.bppp....pn.....p......PP.........NP.PP..PPBPRNBQK..Rb": "Partia Katalońska zamknięta",
  "rnbqk..rppp.bppp....pn.....p..B...PP......N.....PP..PPPPR..QKBNRw": "Gambit Hetmański, obrona Laskera",
  "rnbqk..rppp.ppbp......p............PP.....P.....P....PPPR.BQKBNRw": "Obrona Grünfelda, wymienny (główny)",
  "rnbqk..rppp.ppbp.....np....p......PP.....QN..N..PP..PPPPR.B.KB.Rb": "Obrona Grünfelda, wariant rosyjski",
  "rnbqk..rppp.ppbp.....np....p....Q.PP......N..N..PP..PPPPR.B.KB.Rb": "Obrona Grünfelda, wariant sztokholmski",
  "rnbqk..rppp.ppbp...p.np............PP.....N..N..PPP..PPPR.BQKB.Rw": "Obrona Pirca, atak 150",
  "rnbqk..rppp.ppbp...p.np............PP.....N.BN..PPP..PPPR..QKB.Rb": "Obrona Pirca, atak 150",
  "rnbqk..rppp.ppbp...p.np...........PPP.....N.....PP...PPPR.BQKBNRw": "Obrona Królewsko-indyjska, Cztery Piony (główny)",
  "rnbqk..rppp.ppbp...p.np...........PPP.....N.....PP..BPPPR.BQK.NRb": "Obrona Królewsko-indyjska, wariant Awerbacha",
  "rnbqk..rppp.ppbp...p.np...........PPP.....N..N..PP...PPPR.BQKB.Rb": "Obrona Królewsko-indyjska, Mar del Plata",
  "rnbqk..rpppp.ppp....pn............PP....P.P.........PPPPR.BQKBNRb": "Obrona Nimzo-indyjska, Sämisch (główny)",
  "rnbqk..rpppp.ppp....pn............PP....P.b......P..PPPPR.BQKBNRw": "Obrona Nimzo-indyjska, Sämisch (główny)",
  "rnbqk..rpppp.ppp....pn...........bPP.........N..PP.BPPPPRN.QKB.Rb": "Obrona Bogo-indyjska, wariant główny",
  "rnbqk..rpppp.ppp....pn...........bPP......N.P...PP...PPPR.BQKBNRb": "Obrona Nimzo-indyjska, wariant Hübnera",
  "rnbqk..rppppp.bp.....np......p.....P.........NP.PPP.PPBPRNBQ.RK.b": "Obrona Holenderska, leningradzki (główny)",
  "rnbqk..rppppp.bp.....np......p.....P.........NP.PPP.PPBPRNBQK..Rw": "Obrona Holenderska, leningradzki (główny)",
  "rnbqk..rppppppbp.....np...........PP......N.....PP..PPPPR.BQKBNRw": "Obrona Królewsko-indyjska, Cztery Piony (główny)",
  "rnbqk..rppppppbp.....np...........PPP.....N.....PP...PPPR.BQKBNRb": "Obrona Królewsko-indyjska, Cztery Piony (główny)",
  "rnbqk.nrpp...ppp....p.....ppP....b.P......N.....PPP..PPPR.BQKBNRw": "Obrona Francuska, Winawer (główny)",
  "rnbqk.nrppp..ppp..........bpp.....B.P.....P.....PP.P.PPPRNBQK.NRw": "Debiut Gońca, kontragambit Lewisa",
  "rnbqk.nrppp..ppp....p......pP....b.P......N.....PPP..PPPR.BQKBNRb": "Obrona Francuska, Winawer (główny)",
  "rnbqk.nrppp..ppp...p......b.p.......PP.......N..PPPP..PPRNBQKB.Rw": "Gambit Królewski, obrona nowoczesna",
  "rnbqk.nrpppp.ppp..........b.p.......P........N..PPPP.PPPRNBQKB.Rw": "Gambit Buscha-Gassa",
  "rnbqk.nrpppp.ppp..........b.p.......PP.......N..PPPP..PPRNBQKB.Rb": "Gambit Królewski, obrona nowoczesna",
  "rnbqk.nrpppp.ppp..........b.p.....B.P...........PPPP.PPPRNBQK.NRw": "Debiut Gońca, kontragambit Lewisa",
  "rnbqk.nrpppp.ppp..........b.p.....B.P.....P.....PP.P.PPPRNBQK.NRb": "Debiut Gońca, kontragambit Lewisa",
  "rnbqk.nrpppp.ppp...b........p.......P........N..PPPP.PPPRNBQKB.Rw": "Obrona Żółwia",
  "rnbqk.nrppppbppp....................Pp.......N..PPPP..PPRNBQKB.Rw": "Gambit Królewski, obrona Cunninghama",
  "rnbqk.nrppppppbp......p............PP...........PPP..PPPRNBQKBNRw": "Obrona Nowoczesna, wariant główny",
  "rnbqkb.r...pppppp....n...PpP....................PP..PPPPRNBQKBNRw": "Gambit Wołżański przyjęty",
  "rnbqkb.r.p...pppp..ppn........B....NP.....N.....PPP..PPPR..QKB.Rw": "Sycylijska, Najdorf i zatruty pion",
  "rnbqkb.r.p...pppp..ppn........B....NPP....N.....PPP...PPR..QKB.Rb": "Sycylijska, Najdorf i zatruty pion",
  "rnbqkb.r.p..ppppp..p.n........B....NP.....N.....PPP..PPPR..QKB.Rb": "Sycylijska, Najdorf i zatruty pion",
  "rnbqkb.r.p..ppppp.p..n.....p......PP......N..N..PP..PPPPR.BQKB.Rw": "Obrona Słowiańska, wariant Czebanienki",
  "rnbqkb.rp..ppppp.....n...PpP....................PP..PPPPRNBQKBNRb": "Gambit Wołżański przyjęty",
  "rnbqkb.rp.pp.ppp.p..pn.............P........PN..PPP..PPPRNBQKB.Rw": "System Zukertorta",
  "rnbqkb.rp.pp.ppp.p..pn............PP.........NP.PP..PP.PRNBQKB.Rb": "Obrona Hetmańsko-indyjska, wariant klasyczny",
  "rnbqkb.rpp....pp..p.pn.....p.p....PP.........NP.PP..PPBPRNBQK..Rw": "Obrona Holenderska, Stonewall (główny)",
  "rnbqkb.rpp...p.p...p.np...pP..............N..NP.PP..PP.PR.BQKB.Rb": "Obrona Benoni, fianchetto",
  "rnbqkb.rpp...ppp....pn....p.......BP........PN..PP...PPPRNBQK..Rw": "Gambit Hetmański przyjęty, wariant klasyczny",
  "rnbqkb.rpp...ppp....pn....pp.......P.......BPN..PPP..PPPRNBQK..Rw": "System Collego, wariant główny",
  "rnbqkb.rpp...ppp...p.n....pPp.....P.......N.....PP..PPPPR.BQKBNRw": "Obrona Benoni, czeski (główny)",
  "rnbqkb.rpp...ppp...p.n....pPp.....P.P.....N.....PP...PPPR.BQKBNRb": "Obrona Benoni, czeski (główny)",
  "rnbqkb.rpp...ppp...ppn.............NP.....N.....PPP..PPPR.BQKB.Rw": "Obrona Sycylijska, wariant Scheveningen",
  "rnbqkb.rpp...ppp..p..p.............P............PPP..PPPR.BQKBNRw": "Obrona Caro-Kann, wariant Bronsteina-Larsena",
  "rnbqkb.rpp...ppp..p.pn.....p......PP......N.PN..PP...PPPR.BQKB.Rb": "Obrona Słowiańska, wariant Merana",
  "rnbqkb.rpp...ppp..p.pn.....p..B...PP......N.....PP..PPPPR..QKBNRw": "Gambit Hetmański, gambit Marshalla",
  "rnbqkb.rpp...ppp..p.pn.....p..B...PPP.....N.....PP...PPPR..QKBNRb": "Gambit Hetmański, gambit Marshalla",
  "rnbqkb.rpp..pp.p...p.np............NP.....N.....PPP..PPPR.BQKB.Rw": "Sycylijska, atak Levenfisha",
  "rnbqkb.rpp..pp.p...p.np............NP.....N.B...PPP..PPPR..QKB.Rb": "Sycylijska, Smok jugosłowiański",
  "rnbqkb.rpp..pp.p...p.np............NPP....N.....PPP...PPR.BQKB.Rb": "Sycylijska, atak Levenfisha",
  "rnbqkb.rpp..pp.p..p..np....p......PP......N..N..PP..PPPPR.BQKB.Rw": "Obrona Słowiańska, wariant Schlechtera",
  "rnbqkb.rpp..pp.p..p..np....p......PP......N.P...PP...PPPR.BQKBNRw": "Obrona Słowiańska, wariant Steinera",
  "rnbqkb.rpp..pppp.....n....pp.......P.B......P...PPP..PPPRN.QKBNRw": "System Londyński z ...c5",
  "rnbqkb.rpp..pppp...p.n....pP......P.............PP..PPPPRNBQKBNRw": "Obrona Benoni, blokada",
  "rnbqkb.rpp..pppp..p..N.............P............PPP..PPPR.BQKBNRb": "Obrona Caro-Kann, wariant Bronsteina-Larsena",
  "rnbqkb.rpp..pppp..p..n.............PN...........PPP..PPPR.BQKBNRw": "Obrona Caro-Kann, wariant Bronsteina-Larsena",
  "rnbqkb.rpp..pppp..p..n............pPP.....N..N..PP...PPPR.BQKB.Rb": "Obrona Słowiańska, gambit Gellera",
  "rnbqkb.rpp..pppp..p..n.....p......PP......N.....PP..PPPPR.BQKBNRw": "Obrona Słowiańska, wariant Steinera",
  "rnbqkb.rpp..pppp..p..n.....p......PP......N.P...PP...PPPR.BQKBNRb": "Obrona Słowiańska, wariant Steinera",
  "rnbqkb.rpp.p.ppp.....n....pPp.....P.......N.....PP..PPPPR.BQKBNRb": "Obrona Benoni, czeski (główny)",
  "rnbqkb.rpp.ppppp.....n....p.........P........N..PPPP.PPPRNBQKB.Rw": "Sycylijska, wariant Nimzowitscha",
  "rnbqkb.rpp.ppppp.....n....p.......PP............PP..PPPPRNBQKBNRw": "Obrona Benoni, blokada",
  "rnbqkb.rpp.ppppp.....n....pP......P.............PP..PPPPRNBQKBNRb": "Obrona Benoni, blokada",
  "rnbqkb.rppp...pp....pn.....p.p....PP.........NP.PP..PPBPRNBQK..Rb": "Obrona Holenderska, Stonewall (główny)",
  "rnbqkb.rppp..Npp...p.n..............P...........PPPP.PPPRNBQKB.Rb": "Obrona Rosyjska, gambit Cochranea",
  "rnbqkb.rppp..ppp...........np.............N...P.PP.PPP.PR.BQKBNRw": "Debiut Angielski, odwrócony Smok",
  "rnbqkb.rppp..ppp.....n.....Pp.............N...P.PP.PPP.PR.BQKBNRb": "Debiut Angielski, odwrócony Smok",
  "rnbqkb.rppp..ppp.....n.....pp.......PP....N.....PPPP..PPR.BQKBNRw": "Debiut Wiedeński, Falkbeer wiedeński",
  "rnbqkb.rppp..ppp.....n.....pp.....P.......N...P.PP.PPP.PR.BQKBNRw": "Debiut Angielski, odwrócony Smok",
  "rnbqkb.rppp..ppp....pn............BP........PN..PP...PPPRNBQK..Rb": "Gambit Hetmański przyjęty, wariant klasyczny",
  "rnbqkb.rppp..ppp....pn............pP..........P.PP..PPBPRNBQK.NRw": "Partia Katalońska otwarta",
  "rnbqkb.rppp..ppp....pn............pP........PN..PP...PPPRNBQKB.Rw": "Gambit Hetmański przyjęty, wariant klasyczny",
  "rnbqkb.rppp..ppp....pn........B...pP......N.....PP..PPPPR..QKBNRw": "Gambit Hetmański, wariant wiedeński",
  "rnbqkb.rppp..ppp....pn.....p.................NP.PPPPPPBPRNBQ.RK.b": "Atak Królewsko-indyjski (KIA)",
  "rnbqkb.rppp..ppp....pn.....p.................NP.PPPPPPBPRNBQK..Rw": "Atak Królewsko-indyjski (KIA)",
  "rnbqkb.rppp..ppp....pn.....p.......P........PN..PPP..PPPRNBQKB.Rw": "System Collego, wariant główny",
  "rnbqkb.rppp..ppp....pn.....p.......P.......BPN..PPP..PPPRNBQK..Rb": "System Collego, wariant główny",
  "rnbqkb.rppp..ppp....pn.....p......PP......N.....PP..PPPPR.BQKBNRw": "Gambit Hetmański odrzucony (kolejność Nimzo)",
  "rnbqkb.rppp..ppp....pn.....p......PPP.....N.....PP...PPPR.BQKBNRb": "Gambit Hetmański, gambit Marshalla (pełny)",
  "rnbqkb.rppp..ppp....pn.....p..B...PP......N.....PP..PPPPR..QKBNRb": "Gambit Hetmański, gambit Marshalla",
  "rnbqkb.rppp..ppp....pn.....pP......P......N.....PPP..PPPR.BQKBNRb": "Obrona Francuska, klasyczny (główny)",
  "rnbqkb.rppp..ppp...p.n......p......PP........N..PPP..PPPRNBQKB.Rw": "Obrona Philidora, wariant główny",
  "rnbqkb.rppp.pp.p......p............PP.....P.....P....PPPR.BQKBNRb": "Obrona Grünfelda, wymienny (główny)",
  "rnbqkb.rppp.pp.p......p............PP.....n.....PP...PPPR.BQKBNRw": "Obrona Grünfelda, wymienny (główny)",
  "rnbqkb.rppp.pp.p.....np....p......PP.B....N.....PP..PPPPR..QKBNRb": "Obrona Grünfelda, wariant węgierski",
  "rnbqkb.rppp.pp.p...p.np............PPP....N.....PPP...PPR.BQKBNRb": "Obrona Pirca, atak austriacki",
  "rnbqkb.rppp.pp.p.n....p............PP.....N.....PP...PPPR.BQKBNRw": "Obrona Grünfelda, wariant wymienny",
  "rnbqkb.rppp.pppp.....n.............P......N..p..PPP...PPR.BQKBNRw": "Gambit Blackmara-Diemera przyjęty",
  "rnbqkb.rppp.pppp.....n.............Pp.....N.....PPP..PPPR.BQKBNRw": "Gambit Blackmara-Diemera przyjęty",
  "rnbqkb.rppp.pppp.....n.............Pp.....N..P..PPP...PPR.BQKBNRb": "Gambit Blackmara-Diemera przyjęty",
  "rnbqkb.rppp.pppp.....n............pP.........N..PP..PPPPRNBQKB.Rw": "Gambit Hetmański przyjęty, wariant klasyczny",
  "rnbqkb.rppp.pppp.....n............pP........PN..PP...PPPRNBQKB.Rb": "Gambit Hetmański przyjęty, wariant klasyczny",
  "rnbqkb.rppp.pppp.....n.....P....................PPPP.PPPRNBQKBNRw": "Obrona Skandynawska, wariant nowoczesny",
  "rnbqkb.rppp.pppp.....n.....p.................NP.PPPPPP.PRNBQKB.Rw": "Atak Królewsko-indyjski (KIA)",
  "rnbqkb.rppp.pppp.....n.....p.................NP.PPPPPPBPRNBQK..Rb": "Atak Królewsko-indyjski (KIA)",
  "rnbqkb.rppp.pppp.....n.....p.......PP.....N.....PPP..PPPR.BQKBNRb": "Gambit Blackmara-Diemera",
  "rnbqkb.rppp.pppp.....n.....p..B....P......N.....PPP.PPPPR..QKBNRb": "Debiut Veresova",
  "rnbqkb.rppp.pppp...p.......nP......P.........N..PPP..PPPRNBQKB.Rb": "Obrona Alechina, wariant nowoczesny",
  "rnbqkb.rppp.pppp...p.n.............P.........N..PPP.PPPPRNBQKB.Rw": "Obrona Wade'a",
  "rnbqkb.rppp.pppp.n.P..............PP............PP...PPPRNBQKBNRb": "Obrona Alechina, wariant wymienny",
  "rnbqkb.rppp.pppp.n.p........P.....PP.P..........PP....PPRNBQKBNRb": "Obrona Alechina, wariant Czterech Pionów",
  "rnbqkb.rpppn.ppp....p......pP......P......N.....PPP..PPPR.BQKBNRw": "Obrona Francuska, klasyczny (główny)",
  "rnbqkb.rpppp..pp....pn.......p....PP......N.....PP..PPPPR.BQKBNRw": "Obrona Holenderska, wariant z Sc3",
  "rnbqkb.rpppp.p.p.....np.....p.....P.......N...P.PP.PPP.PR.BQKBNRw": "Debiut Angielski, system Botwinnika",
  "rnbqkb.rpppp.pp.....pn.p...........PP..B........PPP..PPPRN.QKBNRb": "Atak Trompowskiego, wariant główny",
  "rnbqkb.rpppp.pp.....pn.p......B....PP...........PPP..PPPRN.QKBNRw": "Atak Trompowskiego, wariant główny",
  "rnbqkb.rpppp.ppp............P.....P...n.........PP..PPPPRNBQKBNRw": "Gambit Budapeszteński, wariant główny",
  "rnbqkb.rpppp.ppp............P.....P.n...........PP..PPPPRNBQKBNRw": "Gambit Budapeszteński, wariant Fajarowicza",
  "rnbqkb.rpppp.ppp............p.....B.n........N..PPPP.PPPRNBQ.RK.b": "Debiut Gońca, gambit Bodena-Kieseritzkyego",
  "rnbqkb.rpppp.ppp............p.....B.n........N..PPPP.PPPRNBQK..Rw": "Debiut Gońca, gambit Bodena-Kieseritzkyego",
  "rnbqkb.rpppp.ppp............p.....B.n.....N.....PPPP.PPPR.BQK.NRw": "Debiut Wiedeński, wariant Hamppe-Meitnera",
  "rnbqkb.rpppp.ppp.....n......p.......P.....N.....PPPP.PPPR.BQKBNRw": "Debiut Wiedeński, Pchła",
  "rnbqkb.rpppp.ppp.....n......p.......P.....N...P.PPPP.P.PR.BQKBNRb": "Debiut Wiedeński, Pchła",
  "rnbqkb.rpppp.ppp.....n......p......PP........N..PPP..PPPRNBQKB.Rb": "Obrona Rosyjska, atak nowoczesny",
  "rnbqkb.rpppp.ppp.....n......p.....B.P........N..PPPP.PPPRNBQK..Rb": "Debiut Gońca, gambit Bodena-Kieseritzkyego",
  "rnbqkb.rpppp.ppp.....n......p.....P...........P.PP.PPP.PRNBQKBNRw": "Debiut Angielski, atak królewsko-indyjski",
  "rnbqkb.rpppp.ppp.....n......p.....P...........P.PP.PPPBPRNBQK.NRb": "Debiut Angielski, atak królewsko-indyjski",
  "rnbqkb.rpppp.ppp.....n......p.....P.......N..N..PP.PPPPPR.BQKB.Rb": "Debiut Angielski, czterech skoczków",
  "rnbqkb.rpppp.ppp.....n......p.....P.P.....N.....PP.P.PPPR.BQKBNRb": "Debiut Angielski, gambit Reversed",
  "rnbqkb.rpppp.ppp.....n......p.....PP............PP..PPPPRNBQKBNRw": "Gambit Budapeszteński, wariant Fajarowicza",
  "rnbqkb.rpppp.ppp....pn...................P......PBPPPPPPRN.QKBNRw": "Debiut Larsena, wariant klasyczny z Sf6",
  "rnbqkb.rpppp.ppp....pn.............P........PN..PPP..PPPRNBQKB.Rb": "System Zukertorta",
  "rnbqkb.rpppp.ppp....pn............P.......N.....PP.PPPPPR.BQKBNRw": "Debiut Angielski, wariant Mikenas-Carls",
  "rnbqkb.rpppp.ppp....pn............P.P.....N.....PP.P.PPPR.BQKBNRb": "Debiut Angielski, wariant Mikenas-Carls",
  "rnbqkb.rpppp.ppp....pn............PP..........P.PP..PP.PRNBQKBNRb": "Partia Katalońska zamknięta",
  "rnbqkb.rpppp.ppp....pn............PP......N.....PP..PPPPR.BQKBNRb": "Gambit Hetmański odrzucony (kolejność Nimzo)",
  "rnbqkb.rpppp.ppp....pn........B....P............PPP.PPPPRN.QKBNRw": "Atak Trompowskiego, wariant główny",
  "rnbqkb.rpppp.ppp....pn........B....P.........N..PPP.PPPPRN.QKB.Rb": "Atak Torrego",
  "rnbqkb.rpppp.ppp....pn........B....PP...........PPP..PPPRN.QKBNRb": "Atak Trompowskiego, wariant główny",
  "rnbqkb.rppppnppp....................Pp.......N..PPPP..PPRNBQKB.Rw": "Gambit Królewski, obrona Svenoniusa",
  "rnbqkb.rppppnppp............p.......P........N..PPPP.PPPRNBQKB.Rw": "System Gleka",
  "rnbqkb.rppppp..p.....np......p.....P..........P.PPP.PPBPRNBQK.NRw": "Obrona Holenderska, wariant leningradzki",
  "rnbqkb.rppppp..p.....np......p.....P.........NP.PPP.PP.PRNBQKB.Rw": "Obrona Holenderska, leningradzki (główny)",
  "rnbqkb.rppppp..p.....np......p.....P.........NP.PPP.PPBPRNBQK..Rb": "Obrona Holenderska, leningradzki (główny)",
  "rnbqkb.rppppp.pp.....n.......p.....P..........P.PPP.PPBPRNBQK.NRb": "Obrona Holenderska, Stonewall (główny)",
  "rnbqkb.rppppp.pp.....n.......p.....P.........N..PPP.PPPPRNBQKB.Rw": "Obrona Holenderska, wariant klasyczny",
  "rnbqkb.rppppp.pp.....n.......p....PP............PP..PPPPRNBQKBNRw": "Obrona Holenderska, wariant z Sc3",
  "rnbqkb.rppppp.pp.....n.......p....PP......N.....PP..PPPPR.BQKBNRb": "Obrona Holenderska, wariant z Sc3",
  "rnbqkb.rpppppp.p.....np............P.B..........PPP.PPPPRN.QKBNRw": "System Londyński, fianchetto",
  "rnbqkb.rpppppp.p.....np...........PP............PP..PPPPRNBQKBNRw": "Obrona Grünfelda, wariant sztokholmski",
  "rnbqkb.rpppppp.p.....np...........PP......N.....PP..PPPPR.BQKBNRb": "Obrona Grünfelda, wariant sztokholmski",
  "rnbqkb.rpppppppp..............B....Pn...........PPP.PPPPRN.QKBNRw": "Atak Trompowskiego, wariant klasyczny",
  "rnbqkbnr.p.p.pppp...p..............NP...........PPP..PPPRNBQKB.Rw": "Obrona Sycylijska, wariant Kana",
  "rnbqkbnr.p.pppppp.........p.........P........N..PPPP.PPPRNBQKB.Rw": "Sycylijska, wariant O'Kelly'ego",
  "rnbqkbnrp.pp.ppp.........p..p.....B.P...........PPPP.PPPRNBQK.NRw": "Debiut Gońca, gambit Skrzydłowy",
  "rnbqkbnrp.pp.ppp.p..........p.......P........N..PPPP.PPPRNBQKB.Rw": "Obrona Kenilworth",
  "rnbqkbnrp.pp.ppp.p..........p.....B.P...........PPPP.PPPRNBQK.NRw": "Debiut Gońca, obrona Anderssena",
  "rnbqkbnrp.pp.ppp.p..p.............PP............PP..PPPPRNBQKBNRw": "Obrona Angielska",
  "rnbqkbnrpp...ppp....p......P.......p......N.....PP..PPPPR.BQKBNRw": "Gambit Hetmański, wariant Henniga-Schary",
  "rnbqkbnrpp...ppp....p.....pP.......P......N.....PP..PPPPR.BQKBNRb": "Gambit Hetmański, wariant Henniga-Schary",
  "rnbqkbnrpp...ppp....p.....pp.......PP...........PPPN.PPPR.BQKBNRw": "Obrona Francuska, Tarrasch otwarty",
  "rnbqkbnrpp...ppp....p.....ppP......P............PPP..PPPRNBQKBNRw": "Obrona Francuska, wariant posunięty (główny)",
  "rnbqkbnrpp...ppp....p.....ppP......P......P.....PP...PPPRNBQKBNRb": "Obrona Francuska, wariant posunięty (główny)",
  "rnbqkbnrpp...ppp..p........pp.....PP......N.....PP..PPPPR.BQKBNRw": "Obrona Słowiańska, kontragambit Winawera",
  "rnbqkbnrpp..pppp...........p.......P............PP..PPPPRNBQKBNRw": "Obrona Słowiańska, wariant wymienny",
  "rnbqkbnrpp..pppp...........p.......P............PPP..PPPRNBQKBNRw": "Obrona Caro-Kann, atak Panowa-Botwinnika",
  "rnbqkbnrpp..pppp...........p......PP............PP...PPPRNBQKBNRb": "Obrona Caro-Kann, atak Panowa-Botwinnika",
  "rnbqkbnrpp..pppp...p......p.........P........N..PPPP.PPPRNBQKB.Rw": "Sycylijska, Najdorf i zatruty pion",
  "rnbqkbnrpp..pppp...p.....Bp.........P........N..PPPP.PPPRNBQK..Rb": "Obrona Sycylijska, wariant moskiewski",
  "rnbqkbnrpp..pppp..p........P.......P............PP..PPPPRNBQKBNRb": "Obrona Słowiańska, wariant wymienny",
  "rnbqkbnrpp.p.ppp..........p.p.......P........N..PPPP.PPPRNBQKB.Rw": "Obrona Freda",
  "rnbqkbnrpp.p.ppp..p.........p.......P........N..PPPP.PPPRNBQKB.Rw": "Obrona McLeoda",
  "rnbqkbnrpp.p.ppp..p.........p.....B.P...........PPPP.PPPRNBQK.NRw": "Debiut Gońca, wariant Steina",
  "rnbqkbnrpp.ppppp...................pP...........PPP..PPPRNBQKBNRw": "Obrona Sycylijska, gambit Morry",
  "rnbqkbnrpp.ppppp...................pP.....P.....PP...PPPRNBQKBNRb": "Obrona Sycylijska, gambit Morry",
  "rnbqkbnrppp..p.p...........p......B.Ppp......N..PPPP..PPRNBQ.RK.w": "Gambit Królewski, obrona Polerio",
  "rnbqkbnrppp..ppp............P.....Pp............PP..PPPPRNBQKBNRw": "Kontratak Albina, wariant główny",
  "rnbqkbnrppp..ppp............P.....Pp.........N..PP..PPPPRNBQKB.Rb": "Kontratak Albina, wariant główny",
  "rnbqkbnrppp..ppp............p......Pp.....N.....PPP..PPPR.BQKBNRw": "Gambit Blackmara-Diemera, obrona Euwe",
  "rnbqkbnrppp..ppp...........Pp................N..PPPP.PPPRNBQKB.Rb": "Gambit Słonia, wariant Maróczyego",
  "rnbqkbnrppp..ppp...........p.......P............PP..PPPPRNBQKBNRw": "Gambit Hetmański, wariant wymienny",
  "rnbqkbnrppp..ppp...........p.......P............PPP..PPPRNBQKBNRw": "Obrona Francuska, wariant wymienny (pełny)",
  "rnbqkbnrppp..ppp...........p.......pP.....P.....PP...PPPRNBQKBNRw": "Gambit Duński, obrona Schlechtera",
  "rnbqkbnrppp..ppp...........pP.....P.............PP..PPPPRNBQKBNRb": "Kontratak Albina, wariant główny",
  "rnbqkbnrppp..ppp...........pp.................P.PPPPPPBPRNBQK.NRw": "Otwarcie Benko z ...e5",
  "rnbqkbnrppp..ppp...........pp.......PP..........PPPP..PPRNBQKBNRw": "Gambit Królewski, kontrgambit Falkbeera",
  "rnbqkbnrppp..ppp....p..............Pp.....N.....PPP..PPPR.BQKBNRw": "Obrona Francuska, wariant Rubinsteina",
  "rnbqkbnrppp..ppp....p......P.......P............PP..PPPPRNBQKBNRb": "Gambit Hetmański, wariant wymienny",
  "rnbqkbnrppp..ppp....p......p.......PP.....N.....PPP..PPPR.BQKBNRb": "Obrona Francuska, klasyczny (główny)",
  "rnbqkbnrppp..ppp....p......pP......P............PPP..PPPRNBQKBNRb": "Obrona Francuska, wariant posunięty (główny)",
  "rnbqkbnrppp..ppp...p........p.......P........N..PPPP.PPPRNBQKB.Rw": "Obrona Philidora, wariant główny",
  "rnbqkbnrppp..ppp...p........p.....PP............PP..PPPPRNBQKBNRw": "Obrona Szczura",
  "rnbqkbnrppp.pppp..........................N.....PPPP.PPPR.BQKBNRw": "Obrona Skandynawska, wariant Gubinskiego-Meltsa",
  "rnbqkbnrppp.pppp..................Pp.........N..PP.PPPPPRNBQKB.Rw": "Debiut Rétiego, wariant posunięty",
  "rnbqkbnrppp.pppp..................p..........N..PP.PPPPPRNBQKB.Rw": "Debiut Rétiego, gambit przyjęty",
  "rnbqkbnrppp.pppp..................pP............PP..PPPPRNBQKBNRw": "Gambit Hetmański przyjęty, wariant stary",
  "rnbqkbnrppp.pppp..................pP.........N..PP..PPPPRNBQKB.Rb": "Gambit Hetmański przyjęty, wariant klasyczny",
  "rnbqkbnrppp.pppp..................pP........P...PP...PPPRNBQKBNRb": "Gambit Hetmański przyjęty, wariant stary",
  "rnbqkbnrpppp..pp............Np......P...........PPPP.PPPRNBQKB.Rb": "Gambit Łotewski, wariant Młota",
  "rnbqkbnrpppp..pp............p.......P...........PPPP.PPPRNBQKB.Rw": "Obrona Damiano, refutacja",
  "rnbqkbnrpppp..pp............p..Q....P...........PPPP.PPPRNB.KB.Rb": "Obrona Damiano, refutacja",
  "rnbqkbnrpppp..pp............pp....B.P...........PPPP.PPPRNBQK.NRw": "Debiut Gońca, kontragambit Kalabryjski",
  "rnbqkbnrpppp..pp.....p......N.......P...........PPPP.PPPRNBQKB.Rb": "Obrona Damiano, refutacja",
  "rnbqkbnrpppp.p.p..............N.....PppP........PPPP..P.RNBQKB.Rb": "Gambit Królewski, gambit Allgaiera",
  "rnbqkbnrpppp.p.p..............p.....Pp.......N..PPPP..PPRNBQKB.Rw": "Gambit Królewski, obrona Polerio",
  "rnbqkbnrpppp.p.p..............p.....Pp....N..N..PPPP..PPR.BQKB.Rb": "Gambit Królewski, gambit Quaade",
  "rnbqkbnrpppp.p.p............N.......PppP........PPPP..P.RNBQKB.Rb": "Gambit Królewski, wariant Kieseritzkyego",
  "rnbqkbnrpppp.p.p......p.....p.......P........N..PPPP.PPPRNBQKB.Rw": "Wariant Sollera",
  "rnbqkbnrpppp.pp........p............Pp.......N..PPPP..PPRNBQKB.Rw": "Gambit Królewski, obrona Beckera",
  "rnbqkbnrpppp.ppp....................P.....p.....PP...PPPRNBQKBNRw": "Gambit Duński przyjęty",
  "rnbqkbnrpppp.ppp....................Pp.......N..PPPP..PPRNBQKB.Rb": "Gambit Królewski, obrona Svenoniusa",
  "rnbqkbnrpppp.ppp...................QP...........PPP..PPPRNB.KBNRb": "Partia Centralna",
  "rnbqkbnrpppp.ppp...................pP.....P.....PP...PPPRNBQKBNRb": "Gambit Duński, obrona Schlechtera",
  "rnbqkbnrpppp.ppp..................B.P...........Pp...PPPRNBQK.NRw": "Gambit Duński przyjęty",
  "rnbqkbnrpppp.ppp..................B.P.....p.....PP...PPPRNBQK.NRb": "Gambit Duński przyjęty",
};

const OPENING_BOOK: { prefix: string[]; name: string }[] = [
  // --- 1.e4: hiszpańskie i włoskie ---
  { prefix: ['e2e4','e7e5','g1f3','b8c6','f1b5','g8f6'], name: 'Partia Hiszpańska, obrona Berlińska' },
  { prefix: ['e2e4','e7e5','g1f3','b8c6','f1b5','a7a6','b5a4','g8f6'], name: 'Partia Hiszpańska, odroczony Steinitz' },
  { prefix: ['e2e4','e7e5','g1f3','b8c6','f1b5','a7a6','b5c6'], name: 'Partia Hiszpańska, wariant wymienny' },
  { prefix: ['e2e4','e7e5','g1f3','b8c6','f1b5','a7a6'], name: "Partia Hiszpańska, wariant Morphy'ego (zamknięty)" },
  { prefix: ['e2e4','e7e5','g1f3','b8c6','f1b5'], name: 'Partia Hiszpańska (Ruy Lopez)' },
  { prefix: ['e2e4','e7e5','g1f3','b8c6','f1c4','f8c5','c2c3','g8f6','d2d3'], name: 'Partia Włoska, pianissimo' },
  { prefix: ['e2e4','e7e5','g1f3','b8c6','f1c4','f8c5','b2b4'], name: 'Partia Włoska, gambit Evansa' },
  { prefix: ['e2e4','e7e5','g1f3','b8c6','f1c4','f8c5'], name: 'Partia Włoska (Giuoco Piano)' },
  { prefix: ['e2e4','e7e5','g1f3','b8c6','f1c4','g8f6'], name: 'Obrona Dwóch Skoczków' },
  { prefix: ['e2e4','e7e5','g1f3','b8c6','f1c4','f8e7'], name: 'Obrona Węgierska' },
  { prefix: ['e2e4','e7e5','g1f3','b8c6','f1c4'], name: 'Partia Włoska' },
  // --- 1.e4: szkockie, skoczkowe, centralne ---
  { prefix: ['e2e4','e7e5','g1f3','b8c6','d2d4','e5d4','f3d4','g8f6','b1c3'], name: 'Partia Szkocka, wariant Czterech Skoczków' },
  { prefix: ['e2e4','e7e5','g1f3','b8c6','d2d4','e5d4','f3d4'], name: 'Partia Szkocka' },
  { prefix: ['e2e4','e7e5','g1f3','b8c6','d2d4','e5d4','c2c3'], name: 'Partia Szkocka, gambit Göringa' },
  { prefix: ['e2e4','e7e5','g1f3','b8c6','d2d4'], name: 'Partia Szkocka' },
  { prefix: ['e2e4','e7e5','g1f3','b8c6','b1c3','g8f6','f1b5','f8b4'], name: 'Partia Czterech Skoczków, hiszpańska' },
  { prefix: ['e2e4','e7e5','g1f3','b8c6','b1c3','g8f6','d2d4'], name: 'Partia Czterech Skoczków, szkocka' },
  { prefix: ['e2e4','e7e5','g1f3','b8c6','b1c3','g8f6'], name: 'Partia Czterech Skoczków' },
  { prefix: ['e2e4','e7e5','g1f3','b8c6','b1c3'], name: 'Debiut Trzech Skoczków' },
  { prefix: ['e2e4','e7e5','g1f3','b8c6','c2c3'], name: 'Debiut Ponzianiego' },
  { prefix: ['e2e4','e7e5','d2d4','e5d4','d1d4'], name: 'Partia Centralna' },
  { prefix: ['e2e4','e7e5','d2d4','e5d4','c2c3'], name: 'Gambit Duński' },
  // --- 1.e4: gambit królewski, Wiedeń, goniec ---
  { prefix: ['e2e4','e7e5','f2f4','e5f4'], name: 'Gambit Królewski przyjęty' },
  { prefix: ['e2e4','e7e5','f2f4','f8c5'], name: 'Gambit Królewski odrzucony (klasyczny)' },
  { prefix: ['e2e4','e7e5','f2f4','d7d5'], name: 'Gambit Królewski, kontrgambit Falkbeera' },
  { prefix: ['e2e4','e7e5','f2f4'], name: 'Gambit Królewski' },
  { prefix: ['e2e4','e7e5','b1c3','g8f6','f2f4'], name: 'Debiut Wiedeński, gambit' },
  { prefix: ['e2e4','e7e5','b1c3'], name: 'Debiut Wiedeński' },
  { prefix: ['e2e4','e7e5','f1c4','g8f6'], name: 'Debiut Gońca Królewskiego, obrona Berlińska' },
  { prefix: ['e2e4','e7e5','f1c4'], name: 'Debiut Gońca Królewskiego' },
  // --- 1.e4: półotwarte czarne ---
  { prefix: ['e2e4','e7e5','g1f3','d7d6'], name: 'Obrona Philidora' },
  { prefix: ['e2e4','e7e5','g1f3','g8f6','f3e5','d7d6'], name: 'Obrona Rosyjska (Petrowa), wariant klasyczny' },
  { prefix: ['e2e4','e7e5','g1f3','g8f6'], name: 'Obrona Rosyjska (Petrowa)' },
  { prefix: ['e2e4','e7e5','g1f3','f7f5'], name: 'Gambit Łotewski' },
  { prefix: ['e2e4','e7e5','g1f3','d7d5'], name: 'Gambit Słonia' },
  { prefix: ['e2e4','e7e5','g1f3','f7f6'], name: 'Obrona Damiano' },
  // --- Francuska ---
  { prefix: ['e2e4','e7e6','d2d4','d7d5','b1c3','f8b4'], name: 'Obrona Francuska, wariant Winawera' },
  { prefix: ['e2e4','e7e6','d2d4','d7d5','b1c3','g8f6'], name: 'Obrona Francuska, wariant klasyczny' },
  { prefix: ['e2e4','e7e6','d2d4','d7d5','b1d2'], name: 'Obrona Francuska, wariant Tarrascha' },
  { prefix: ['e2e4','e7e6','d2d4','d7d5','b1c3','d5e4'], name: 'Obrona Francuska, wariant Rubinsteina' },
  { prefix: ['e2e4','e7e6','e4e5'], name: 'Obrona Francuska, wariant posunięty' },
  { prefix: ['e2e4','e7e6','d2d4','d7d5','e4d5'], name: 'Obrona Francuska, wariant wymienny' },
  { prefix: ['e2e4','e7e6','d2d4'], name: 'Obrona Francuska' },
  { prefix: ['e2e4','e7e6'], name: 'Obrona Francuska' },
  // --- Caro-Kann ---
  { prefix: ['e2e4','c7c6','d2d4','d7d5','b1c3','d5e4','c3e4'], name: 'Obrona Caro-Kann, wariant klasyczny' },
  { prefix: ['e2e4','c7c6','d2d4','d7d5','e4d5','c6d5','c2c4'], name: 'Obrona Caro-Kann, atak Panowa-Botwinnika' },
  { prefix: ['e2e4','c7c6','e4e5'], name: 'Obrona Caro-Kann, wariant posunięty' },
  { prefix: ['e2e4','c7c6','d2d4','d7d5','e4d5'], name: 'Obrona Caro-Kann, wariant wymienny' },
  { prefix: ['e2e4','c7c6','f2f3'], name: 'Obrona Caro-Kann, wariant Fantasy' },
  { prefix: ['e2e4','c7c6','d2d4'], name: 'Obrona Caro-Kann' },
  { prefix: ['e2e4','c7c6'], name: 'Obrona Caro-Kann' },
  // --- Sycylijska ---
  { prefix: ['e2e4','c7c5','g1f3','d7d6','d2d4','c5d4','f3d4','g8f6','b1c3','a7a6'], name: 'Obrona Sycylijska, wariant Najdorfa' },
  { prefix: ['e2e4','c7c5','g1f3','d7d6','d2d4','c5d4','f3d4','g8f6','b1c3','g7g6'], name: 'Obrona Sycylijska, Wariant Smoka' },
  { prefix: ['e2e4','c7c5','g1f3','d7d6','d2d4','c5d4','f3d4','g8f6','b1c3','e7e6'], name: 'Obrona Sycylijska, wariant Scheveningen' },
  { prefix: ['e2e4','c7c5','g1f3','d7d6','d2d4','c5d4','f3d4','g8f6','b1c3','b8c6'], name: 'Obrona Sycylijska, wariant klasyczny' },
  { prefix: ['e2e4','c7c5','g1f3','b8c6','d2d4','c5d4','f3d4','g8f6','b1c3','e7e5'], name: 'Obrona Sycylijska, wariant Swiesznikowa' },
  { prefix: ['e2e4','c7c5','g1f3','b8c6','d2d4','c5d4','f3d4','e7e5'], name: 'Obrona Sycylijska, wariant Kałasznikowa' },
  { prefix: ['e2e4','c7c5','g1f3','b8c6','d2d4','c5d4','f3d4','g7g6'], name: 'Obrona Sycylijska, przyśpieszony Smok' },
  { prefix: ['e2e4','c7c5','g1f3','e7e6','d2d4','c5d4','f3d4','a7a6'], name: 'Obrona Sycylijska, wariant Kana' },
  { prefix: ['e2e4','c7c5','g1f3','e7e6','d2d4','c5d4','f3d4','b8c6'], name: 'Obrona Sycylijska, wariant Tajmanowa' },
  { prefix: ['e2e4','c7c5','g1f3','b8c6','f1b5'], name: 'Obrona Sycylijska, wariant Rossolimo' },
  { prefix: ['e2e4','c7c5','g1f3','d7d6','f1b5'], name: 'Obrona Sycylijska, wariant moskiewski' },
  { prefix: ['e2e4','c7c5','d2d4','c5d4','c2c3'], name: 'Obrona Sycylijska, gambit Morry' },
  { prefix: ['e2e4','c7c5','b1c3','b8c6','f2f4'], name: 'Obrona Sycylijska, atak Grand Prix' },
  { prefix: ['e2e4','c7c5','c2c3'], name: 'Obrona Sycylijska, wariant Ałapina' },
  { prefix: ['e2e4','c7c5','b1c3'], name: 'Obrona Sycylijska zamknięta' },
  { prefix: ['e2e4','c7c5'], name: 'Obrona Sycylijska' },
  // --- pozostałe vs 1.e4 ---
  { prefix: ['e2e4','d7d6','d2d4','g8f6','b1c3','g7g6'], name: 'Obrona Pirca' },
  { prefix: ['e2e4','g7g6'], name: 'Obrona Nowoczesna' },
  { prefix: ['e2e4','d7d5','e4d5','d8d5','b1c3','d5a5'], name: 'Obrona Skandynawska, wariant główny' },
  { prefix: ['e2e4','d7d5','e4d5','g8f6'], name: 'Obrona Skandynawska, wariant nowoczesny' },
  { prefix: ['e2e4','d7d5'], name: 'Obrona Skandynawska' },
  { prefix: ['e2e4','g8f6','e4e5','f6d5','d2d4','d7d6'], name: 'Obrona Alechina, wariant główny' },
  { prefix: ['e2e4','g8f6'], name: 'Obrona Alechina' },
  { prefix: ['e2e4','b8c6'], name: 'Obrona Nimzowitscha' },
  { prefix: ['e2e4','b7b6'], name: 'Obrona Owena' },
  { prefix: ['e2e4','a7a6'], name: 'Obrona św. Jerzego' },
  // --- 1.d4: gambit hetmański ---
  { prefix: ['d2d4','d7d5','c2c4','e7e6','b1c3','g8f6','c1g5','f8e7','e2e3','h7h6'], name: 'Gambit Hetmański, wariant Tartakowera' },
  { prefix: ['d2d4','d7d5','c2c4','e7e6','b1c3','g8f6','c1g5','f8e7'], name: 'Gambit Hetmański, obrona ortodoksyjna' },
  { prefix: ['d2d4','d7d5','c2c4','e7e6','b1c3','g8f6','c1g5','f8b4'], name: 'Gambit Hetmański, wariant Ragozina' },
  { prefix: ['d2d4','d7d5','c2c4','e7e6','b1c3','g8f6','c1g5','d5c4'], name: 'Gambit Hetmański, wariant wiedeński' },
  { prefix: ['d2d4','d7d5','c2c4','e7e6','c4d5','e6d5'], name: 'Gambit Hetmański, wariant wymienny' },
  { prefix: ['d2d4','d7d5','c2c4','e7e6'], name: 'Gambit Hetmański odrzucony' },
  { prefix: ['d2d4','d7d5','c2c4','d5c4','g1f3','g8f6','e2e3','e7e6','f1c4','c7c5'], name: 'Gambit Hetmański przyjęty, wariant klasyczny' },
  { prefix: ['d2d4','d7d5','c2c4','d5c4'], name: 'Gambit Hetmański przyjęty' },
  { prefix: ['d2d4','d7d5','c2c4'], name: 'Gambit Hetmański' },
  // --- 1.d4: słowiańskie ---
  { prefix: ['d2d4','d7d5','c2c4','c7c6','g1f3','g8f6','b1c3','e7e6','e2e3','b8d7','f1d3','d5c4'], name: 'Obrona Słowiańska, wariant Merana' },
  { prefix: ['d2d4','d7d5','c2c4','c7c6','g1f3','g8f6','b1c3','d5c4'], name: 'Obrona Słowiańska, wariant główny' },
  { prefix: ['d2d4','d7d5','c2c4','c7c6','g1f3','g8f6','b1c3','e7e6'], name: 'Obrona Słowiańska, półsłowiańska' },
  { prefix: ['d2d4','d7d5','c2c4','c7c6','g1f3','g8f6','b1c3','a7a6'], name: 'Obrona Słowiańska, wariant Czebanienki' },
  { prefix: ['d2d4','d7d5','c2c4','c7c6','c4d5','c6d5'], name: 'Obrona Słowiańska, wariant wymienny' },
  { prefix: ['d2d4','d7d5','c2c4','c7c6'], name: 'Obrona Słowiańska' },
  { prefix: ['d2d4','d7d5','c2c4','b8c6'], name: 'Obrona Czigorina' },
  { prefix: ['d2d4','d7d5','c2c4','e7e5'], name: 'Kontratak Albina' },
  // --- 1.d4: katalońska, londyn, systemy ---
  { prefix: ['d2d4','g8f6','c2c4','e7e6','g2g3','d7d5','f1g2','d5c4'], name: 'Partia Katalońska otwarta' },
  { prefix: ['d2d4','g8f6','c2c4','e7e6','g2g3'], name: 'Partia Katalońska' },
  { prefix: ['d2d4','d7d5','c1f4'], name: 'System Londyński' },
  { prefix: ['d2d4','g8f6','c1f4','g7g6'], name: 'System Londyński, fianchetto' },
  { prefix: ['d2d4','g8f6','c1f4'], name: 'System Londyński' },
  { prefix: ['d2d4','d7d5','g1f3','g8f6','e2e3'], name: 'System Collego' },
  { prefix: ['d2d4','g8f6','c1g5','e7e6','e2e4','h7h6','g5h4'], name: 'Atak Trompowskiego, wariant główny' },
  { prefix: ['d2d4','g8f6','c1g5'], name: 'Atak Trompowskiego' },
  { prefix: ['d2d4','g8f6','g1f3','e7e6','c1g5'], name: 'Atak Torrego' },
  { prefix: ['d2d4','d7d5','b1c3','g8f6','c1g5'], name: 'Debiut Veresova' },
  { prefix: ['d2d4','d7d5','b1c3','g8f6','e2e4'], name: 'Gambit Blackmara-Diemera' },
  // --- 1.d4: indyjskie ---
  { prefix: ['d2d4','g8f6','c2c4','e7e6','b1c3','f8b4','e2e3'], name: 'Obrona Nimzo-indyjska, wariant Rubinsteina' },
  { prefix: ['d2d4','g8f6','c2c4','e7e6','b1c3','f8b4','a2a3'], name: 'Obrona Nimzo-indyjska, wariant Sämischa' },
  { prefix: ['d2d4','g8f6','c2c4','e7e6','b1c3','f8b4'], name: 'Obrona Nimzo-indyjska' },
  { prefix: ['d2d4','g8f6','c2c4','e7e6','g1f3','b7b6'], name: 'Obrona Hetmańsko-indyjska' },
  { prefix: ['d2d4','g8f6','c2c4','e7e6','g1f3','f8b4'], name: 'Obrona Bogo-indyjska' },
  { prefix: ['d2d4','e7e6','c2c4','b7b6'], name: 'Obrona Angielska' },
  { prefix: ['d2d4','g8f6','c2c4','g7g6','b1c3','f8g7','e2e4','d7d6','g1f3'], name: 'Obrona Królewsko-indyjska, wariant klasyczny' },
  { prefix: ['d2d4','g8f6','c2c4','g7g6','b1c3','f8g7','e2e4','d7d6','f2f3'], name: 'Obrona Królewsko-indyjska, wariant Sämischa' },
  { prefix: ['d2d4','g8f6','c2c4','g7g6','b1c3','f8g7','e2e4','d7d6','g2g3'], name: 'Obrona Królewsko-indyjska, fianchetto' },
  { prefix: ['d2d4','g8f6','c2c4','g7g6','b1c3','f8g7','e2e4','d7d6','f1e2','e8g8','c1g5'], name: 'Obrona Królewsko-indyjska, wariant Awerbacha' },
  { prefix: ['d2d4','g8f6','c2c4','g7g6','b1c3','f8g7','e2e4','d7d6','f2f4'], name: 'Obrona Królewsko-indyjska, wariant Czterech Pionów' },
  { prefix: ['d2d4','g8f6','c2c4','g7g6','b1c3','f8g7','e2e4','d7d6'], name: 'Obrona Królewsko-indyjska' },
  { prefix: ['d2d4','g8f6','c2c4','g7g6','b1c3','d7d5','c4d5','f6d5','e2e4','d5b6'], name: 'Obrona Grünfelda, wariant wymienny' },
  { prefix: ['d2d4','g8f6','c2c4','g7g6','b1c3','d7d5','g1f3','f8g7','d1b3'], name: 'Obrona Grünfelda, wariant rosyjski' },
  { prefix: ['d2d4','g8f6','c2c4','g7g6','b1c3','d7d5'], name: 'Obrona Grünfelda' },
  // --- 1.d4: holenderska, Benoni, gambity ---
  { prefix: ['d2d4','f7f5','g2g3','g8f6','f1g2','g7g6'], name: 'Obrona Holenderska, wariant leningradzki' },
  { prefix: ['d2d4','f7f5','g2g3','g8f6','f1g2','e7e6','c2c4','d7d5'], name: 'Obrona Holenderska, Stonewall' },
  { prefix: ['d2d4','f7f5','g1f3','g8f6','g2g3'], name: 'Obrona Holenderska, wariant klasyczny' },
  { prefix: ['d2d4','f7f5'], name: 'Obrona Holenderska' },
  { prefix: ['d2d4','g8f6','c2c4','c7c5','d4d5','e7e6','b1c3','e6d5','c4d5','d7d6'], name: 'Obrona Benoni, wariant główny' },
  { prefix: ['d2d4','g8f6','c2c4','c7c5','d4d5','e7e5'], name: 'Obrona Benoni, wariant czeski' },
  { prefix: ['d2d4','g8f6','c2c4','c7c5','d4d5','e7e6'], name: 'Obrona Benoni' },
  { prefix: ['d2d4','g8f6','c2c4','c7c5','d4d5','b7b5'], name: 'Gambit Wołżański (Benko)' },
  { prefix: ['d2d4','g8f6','c2c4','e7e5'], name: 'Gambit Budapeszteński' },
  // --- 1.c4 angielska ---
  { prefix: ['c2c4','e7e5','b1c3','g8f6','g2g3','d7d5','c4d5','f6d5'], name: 'Debiut Angielski, odwrócony Smok' },
  { prefix: ['c2c4','e7e5','b1c3','g8f6','g2g3','g7g6'], name: 'Debiut Angielski, system Botwinnika' },
  { prefix: ['c2c4','e7e5','b1c3'], name: 'Debiut Angielski, królewski' },
  { prefix: ['c2c4','e7e5'], name: 'Debiut Angielski' },
  { prefix: ['c2c4','c7c5','g1f3'], name: 'Debiut Angielski symetryczny' },
  { prefix: ['c2c4','c7c5'], name: 'Debiut Angielski symetryczny' },
  { prefix: ['c2c4','e7e6'], name: 'Debiut Angielski, wariant Agincourt' },
  { prefix: ['c2c4','g8f6','b1c3','e7e6','e2e4'], name: 'Debiut Angielski, wariant Mikenas-Carls' },
  // --- skoczek, flankowe ---
  { prefix: ['g1f3','d7d5','g2g3','g8f6','f1g2','e7e6','e1g1'], name: 'Atak Królewsko-indyjski (KIA)' },
  { prefix: ['g1f3','d7d5','g2g3'], name: 'Debiut Rétiego' },
  { prefix: ['g1f3','d7d5','c2c4','d5c4'], name: 'Debiut Rétiego, gambit przyjęty' },
  { prefix: ['g1f3'], name: 'Debiut Rétiego' },
  { prefix: ['e2e4','e7e5','g1f3','b8c6','f1b5','a7a6','b5a4','g8f6','e1g1','f8e7','f1e1','b7b5','a4b3','d7d6','c2c3','e8g8','h2h3','c6a5'], name: 'Partia Hiszpańska, wariant Czigorina' },
  { prefix: ['e2e4','e7e5','g1f3','b8c6','f1b5','a7a6','b5a4','g8f6','e1g1','f8e7','f1e1','b7b5','a4b3','d7d6','c2c3','e8g8','h2h3','c6b8'], name: 'Partia Hiszpańska, wariant Breyera' },
  { prefix: ['e2e4','e7e5','g1f3','b8c6','f1b5','a7a6','b5a4','g8f6','e1g1','f8e7','f1e1','b7b5','a4b3','d7d6','c2c3','e8g8','h2h3','c8b7'], name: 'Partia Hiszpańska, wariant Zajcewa' },
  { prefix: ['e2e4','e7e5','g1f3','b8c6','f1b5','a7a6','b5a4','g8f6','e1g1','f6e4','f1e1','d7d5'], name: 'Partia Hiszpańska, kontratak Marshalla' },
  { prefix: ['e2e4','e7e5','g1f3','b8c6','f1b5','a7a6','b5a4','g8f6','e1g1','f6e4'], name: 'Partia Hiszpańska otwarta' },
  { prefix: ['e2e4','e7e5','g1f3','b8c6','f1b5','a7a6','b5c6','d7c6','e1g1'], name: 'Partia Hiszpańska, wariant wymienny z roszadą' },
  { prefix: ['e2e4','e7e5','g1f3','b8c6','f1b5','f7f5'], name: 'Partia Hiszpańska, gambit Schliemanna' },
  { prefix: ['e2e4','e7e5','g1f3','b8c6','f1b5','c6d4'], name: 'Partia Hiszpańska, obrona Birda' },
  { prefix: ['e2e4','e7e5','g1f3','b8c6','f1b5','f8c5'], name: 'Partia Hiszpańska, obrona klasyczna' },
  { prefix: ['e2e4','e7e5','g1f3','b8c6','f1b5','g8e7'], name: 'Partia Hiszpańska, obrona Cozio' },
  { prefix: ['e2e4','e7e5','g1f3','b8c6','f1b5','d7d6'], name: 'Partia Hiszpańska, obrona Steinitza' },
  { prefix: ['e2e4','e7e5','g1f3','b8c6','f1c4','f8c5','b2b4','c5b6'], name: 'Partia Włoska, gambit Evansa odrzucony' },
  { prefix: ['e2e4','e7e5','g1f3','b8c6','f1c4','g8f6','f3g5','d7d5','e4d5','f6d5'], name: 'Partia Włoska, atak Wątróbki (Fried Liver)' },
  { prefix: ['e2e4','e7e5','g1f3','b8c6','f1c4','g8f6','f3g5','d7d5','e4d5','c6d4'], name: 'Obrona Dwóch Skoczków, wariant Fritza' },
  { prefix: ['e2e4','e7e5','g1f3','b8c6','f1c4','g8f6','f3g5','d7d5','e4d5','b7b5'], name: 'Obrona Dwóch Skoczków, wariant Ulvestada' },
  { prefix: ['e2e4','e7e5','g1f3','b8c6','f1c4','f8c5','c2c3','g8f6','d2d4'], name: 'Partia Włoska, atak Moellera' },
  { prefix: ['e2e4','e7e5','g1f3','b8c6','d2d4','e5d4','f3d4','f8c5'], name: 'Partia Szkocka, wariant klasyczny' },
  { prefix: ['e2e4','e7e5','g1f3','b8c6','d2d4','e5d4','f3d4','g8f6'], name: 'Partia Szkocka, wariant Schmidta' },
  { prefix: ['e2e4','e7e5','g1f3','b8c6','d2d4','e5d4','f3d4','d8h4'], name: 'Partia Szkocka, wariant Steinitza' },
  { prefix: ['e2e4','e7e5','g1f3','b8c6','b1c3','g8f6','f1b5','c6d4'], name: 'Partia Czterech Skoczków, wariant Rubinsteina' },
  { prefix: ['e2e4','e7e5','g1f3','b8c6','b1c3','g8f6','f3e5'], name: 'Partia Czterech Skoczków, gambit Halloween' },
  { prefix: ['e2e4','e7e5','g1f3','d7d6','d2d4','b8d7'], name: 'Obrona Philidora, wariant Hanhama' },
  { prefix: ['e2e4','e7e5','g1f3','g8f6','d2d4'], name: 'Obrona Rosyjska, atak nowoczesny' },
  { prefix: ['e2e4','e7e5','g1f3','g8f6','f3e5','d7d6','e5f7'], name: 'Obrona Rosyjska, gambit Cochranea' },
  { prefix: ['e2e4','e7e5','g1f3','f7f5','f3e5'], name: 'Gambit Łotewski, wariant Młota' },
  { prefix: ['e2e4','e7e5','g1f3','f7f6','f3e5','f6e5','d1h5'], name: 'Obrona Damiano, refutacja' },
  { prefix: ['e2e4','e7e5','g1f3','d7d5','e4d5','d8d5'], name: 'Gambit Słonia, wariant Maróczyego' },
  { prefix: ['e2e4','e7e5','g1f3','f8c5'], name: 'Gambit Buscha-Gassa' },
  { prefix: ['e2e4','e7e5','g1f3','c7c6'], name: 'Obrona McLeoda' },
  { prefix: ['e2e4','e7e5','g1f3','f8d6'], name: 'Obrona Żółwia' },
  { prefix: ['e2e4','e7e5','g1f3','g8e7'], name: 'System Gleka' },
  { prefix: ['e2e4','e7e5','g1f3','b7b6'], name: 'Obrona Kenilworth' },
  { prefix: ['e2e4','e7e5','g1f3','g7g6'], name: 'Wariant Sollera' },
  { prefix: ['e2e4','e7e5','g1f3','c7c5'], name: 'Obrona Freda' },
  { prefix: ['e2e4','e7e5','g1f3','d8e7'], name: 'Obrona Gunderama' },
  { prefix: ['e2e4','e7e5','a2a3'], name: 'Otwarcie Mengariniego' },
  { prefix: ['e2e4','e7e5','d2d3'], name: 'Wariant Leonardisa' },
  { prefix: ['e2e4','e7e5','f1d3'], name: 'Otwarcie Taylera' },
  { prefix: ['e2e4','e7e5','d1e2'], name: 'Wariant Clam' },
  { prefix: ['e2e4','e7e5','d1f3'], name: 'Atak Napoleona' },
  { prefix: ['e2e4','e7e5','f1b5'], name: 'Otwarcie Portugalskie' },
  { prefix: ['e2e4','e7e5','d1h5'], name: 'Atak Królowej (Wayward Queen)' },
  { prefix: ['e2e4','e7e5','g1e2'], name: 'Otwarcie Ałapina' },
  { prefix: ['e2e4','e7e6','d2d4','d7d5','e4e5','c7c5','c2c3','b8c6','g1f3'], name: 'Obrona Francuska, wariant posunięty (główny)' },
  { prefix: ['e2e4','e7e6','d2d4','d7d5','b1c3','f8b4','e4e5','c7c5'], name: 'Obrona Francuska, Winawer (główny)' },
  { prefix: ['e2e4','e7e6','d2d4','d7d5','b1c3','g8f6','e4e5','f6d7'], name: 'Obrona Francuska, klasyczny (główny)' },
  { prefix: ['e2e4','e7e6','d2d4','d7d5','b1d2','c7c5'], name: 'Obrona Francuska, Tarrasch otwarty' },
  { prefix: ['e2e4','e7e6','d2d4','d7d5','e4d5','e6d5'], name: 'Obrona Francuska, wariant wymienny (pełny)' },
  { prefix: ['e2e4','c7c6','d2d4','d7d5','b1c3','d5e4','c3e4','c8f5','e4g3','f5g6'], name: 'Obrona Caro-Kann, klasyczny (główny)' },
  { prefix: ['e2e4','c7c6','d2d4','d7d5','b1c3','d5e4','c3e4','b8d7'], name: 'Obrona Caro-Kann, wariant Karpow' },
  { prefix: ['e2e4','c7c6','d2d4','d7d5','b1c3','d5e4','c3e4','g8f6','e4f6','e7f6'], name: 'Obrona Caro-Kann, wariant Bronsteina-Larsena' },
  { prefix: ['e2e4','c7c6','f1c4'], name: 'Obrona Caro-Kann, Hillbilly' },
  { prefix: ['e2e4','c7c6','c2c4'], name: 'Obrona Caro-Kann, przyśpieszony Panov' },
  { prefix: ['e2e4','c7c5','g1f3','d7d6','d2d4','c5d4','f3d4','g8f6','b1c3','b8c6','c1g5'], name: 'Sycylijska, atak Richtera-Rauzera' },
  { prefix: ['e2e4','c7c5','g1f3','d7d6','d2d4','c5d4','f3d4','g8f6','b1c3','b8c6','f1c4'], name: 'Sycylijska, atak Sozina' },
  { prefix: ['e2e4','c7c5','g1f3','d7d6','d2d4','c5d4','f3d4','g8f6','b1c3','b8c6','f1e2','e7e5'], name: 'Sycylijska, wariant Bolesławskiego' },
  { prefix: ['e2e4','c7c5','g1f3','d7d6','d2d4','c5d4','f3d4','g8f6','b1c3','g7g6','c1e3','f8g7','f2f3'], name: 'Sycylijska, Smok jugosłowiański' },
  { prefix: ['e2e4','c7c5','g1f3','d7d6','d2d4','c5d4','f3d4','g8f6','b1c3','g7g6','f2f4'], name: 'Sycylijska, atak Levenfisha' },
  { prefix: ['e2e4','c7c5','g1f3','d7d6','d2d4','c5d4','f3d4','g8f6','b1c3','a7a6','c1g5','e7e6','f2f4','d8b6'], name: 'Sycylijska, Najdorf i zatruty pion' },
  { prefix: ['e2e4','c7c5','g1f3','a7a6'], name: "Sycylijska, wariant O'Kelly'ego" },
  { prefix: ['e2e4','c7c5','g1f3','g8f6'], name: 'Sycylijska, wariant Nimzowitscha' },
  { prefix: ['e2e4','d7d6','d2d4','g8f6','b1c3','g7g6','f2f4'], name: 'Obrona Pirca, atak austriacki' },
  { prefix: ['e2e4','d7d6','d2d4','g8f6','b1c3','g7g6','g1f3'], name: 'Obrona Pirca, wariant klasyczny' },
  { prefix: ['e2e4','d7d6','d2d4','g8f6','b1c3','g7g6','g1f3','f8g7','c1e3'], name: 'Obrona Pirca, atak 150' },
  { prefix: ['e2e4','g7g6','d2d4','f8g7'], name: 'Obrona Nowoczesna, wariant główny' },
  { prefix: ['e2e4','g7g6','f1c4'], name: 'Obrona Nowoczesna, Zadek Małpy' },
  { prefix: ['e2e4','d7d5','e4d5','d8d5','b1c3','d5a5','d2d4','g8f6','g1f3'], name: 'Obrona Skandynawska, wariant główny' },
  { prefix: ['e2e4','d7d5','e4d5','d8d5','b1c3','d5d8'], name: 'Obrona Skandynawska, wariant Gubinskiego-Meltsa' },
  { prefix: ['e2e4','g8f6','e4e5','f6d5','d2d4','d7d6','c2c4','d5b6','f2f4'], name: 'Obrona Alechina, wariant Czterech Pionów' },
  { prefix: ['e2e4','g8f6','e4e5','f6d5','d2d4','d7d6','g1f3'], name: 'Obrona Alechina, wariant nowoczesny' },
  { prefix: ['e2e4','g8f6','e4e5','f6d5','d2d4','d7d6','c2c4','d5b6','e5d6'], name: 'Obrona Alechina, wariant wymienny' },
  { prefix: ['e2e4','b8c6','d2d4','e7e5'], name: "Obrona Nimzowitscha, wariant Kennedy'ego" },
  { prefix: ['e2e4','b8c6','g1f3','f7f5'], name: 'Obrona Nimzowitscha, gambit Kolorado' },
  { prefix: ['e2e4','e7e5','f2f4','e5f4','g1f3','g7g5','h2h4','g5g4','f3e5'], name: 'Gambit Królewski, wariant Kieseritzkyego' },
  { prefix: ['e2e4','e7e5','f2f4','e5f4','g1f3','g7g5','f1c4','g5g4','e1g1'], name: 'Gambit Królewski, gambit Muzio' },
  { prefix: ['e2e4','e7e5','f2f4','e5f4','g1f3','f8e7'], name: 'Gambit Królewski, obrona Cunninghama' },
  { prefix: ['e2e4','e7e5','f2f4','e5f4','g1f3','g7g5','h2h4','g5g4','f3g5'], name: 'Gambit Królewski, gambit Allgaiera' },
  { prefix: ['e2e4','e7e5','f2f4','f8c5','g1f3','d7d6'], name: 'Gambit Królewski, obrona nowoczesna' },
  { prefix: ['e2e4','e7e5','f2f4','e5f4','g1f3','g7g5','b1c3'], name: 'Gambit Królewski, gambit Quaade' },
  { prefix: ['e2e4','e7e5','b1c3','g8f6','f1c4'], name: 'Debiut Wiedeński, wariant Stanleya' },
  { prefix: ['e2e4','e7e5','b1c3','g8f6','f2f4','d7d5'], name: 'Debiut Wiedeński, Falkbeer wiedeński' },
  { prefix: ['e2e4','e7e5','f1c4','f7f5'], name: 'Debiut Gońca, kontragambit Kalabryjski' },
  { prefix: ['e2e4','e7e5','f1c4','g8f6','g1f3','f6e4','e1g1'], name: 'Debiut Gońca, gambit Bodena-Kieseritzkyego' },
  { prefix: ['e2e4','e7e5','g1f3','b8c6','c2c3','g8f6'], name: 'Debiut Ponzianiego, wariant Jaenischa' },
  { prefix: ['e2e4','e7e5','d2d4','e5d4','c2c3','d4c3','f1c4','c3b2'], name: 'Gambit Duński przyjęty' },
  { prefix: ['d2d4','d7d5','c2c4','e7e6','b1c3','g8f6','c1g5','b8d7','e2e3','c7c6','g1f3','d8a5'], name: 'Gambit Hetmański, wariant Cambridge Springs' },
  { prefix: ['d2d4','d7d5','c2c4','e7e6','b1c3','g8f6','c1g5','f8e7','e2e3','h7h6','g5h4'], name: 'Gambit Hetmański, obrona Laskera' },
  { prefix: ['d2d4','d7d5','c2c4','e7e6','b1c3','c7c5'], name: 'Gambit Hetmański, obrona Tarrascha' },
  { prefix: ['d2d4','d7d5','c2c4','e7e6','b1c3','g8f6','c1g5','c7c6','e2e4'], name: 'Gambit Hetmański, gambit Marshalla' },
  { prefix: ['d2d4','d7d5','c2c4','e7e6','b1c3','c7c5','c4d5','c5d4'], name: 'Gambit Hetmański, wariant Henniga-Schary' },
  { prefix: ['d2d4','d7d5','c2c4','d5c4','e2e3'], name: 'Gambit Hetmański przyjęty, wariant stary' },
  { prefix: ['d2d4','d7d5','c2c4','c7c6','g1f3','g8f6','b1c3','d5c4','e2e4'], name: 'Obrona Słowiańska, gambit Gellera' },
  { prefix: ['d2d4','d7d5','c2c4','c7c6','b1c3','g8f6','e2e3','g7g6'], name: 'Obrona Słowiańska, wariant Steinera' },
  { prefix: ['d2d4','d7d5','c2c4','c7c6','g1f3','g8f6','b1c3','g7g6'], name: 'Obrona Słowiańska, wariant Schlechtera' },
  { prefix: ['d2d4','d7d5','c2c4','c7c6','b1c3','e7e5'], name: 'Obrona Słowiańska, kontragambit Winawera' },
  { prefix: ['d2d4','d7d5','c2c4','b8c6','g1f3','c8g4'], name: 'Obrona Czigorina, wariant Janowskiego' },
  { prefix: ['d2d4','d7d5','c2c4','b8c6','g1f3','e7e5'], name: 'Obrona Czigorina, łódzka' },
  { prefix: ['d2d4','d7d5','c2c4','e7e5','d4e5','d5d4','g1f3','b8c6'], name: 'Kontratak Albina, wariant główny' },
  { prefix: ['d2d4','g8f6','c2c4','e7e6','g2g3','d7d5','f1g2','f8e7','g1f3'], name: 'Partia Katalońska zamknięta' },
  { prefix: ['d2d4','d7d5','c1f4','g8f6','e2e3','c7c5'], name: 'System Londyński z ...c5' },
  { prefix: ['d2d4','d7d5','c1f4','g8f6','e2e3','c8f5'], name: 'System Londyński nowoczesny' },
  { prefix: ['d2d4','d7d5','g1f3','g8f6','e2e3','e7e6','f1d3','c7c5'], name: 'System Collego, wariant główny' },
  { prefix: ['d2d4','g8f6','g1f3','e7e6','e2e3','b7b6'], name: 'System Zukertorta' },
  { prefix: ['d2d4','g8f6','c1g5','f6e4'], name: 'Atak Trompowskiego, wariant klasyczny' },
  { prefix: ['d2d4','g8f6','c2c4','e7e6','b1c3','f8b4','e2e3','e8g8','f1d3','d7d5'], name: 'Obrona Nimzo-indyjska, klasyczny (główny)' },
  { prefix: ['d2d4','g8f6','c2c4','e7e6','b1c3','f8b4','e2e3','c7c5'], name: 'Obrona Nimzo-indyjska, wariant Hübnera' },
  { prefix: ['d2d4','g8f6','c2c4','e7e6','b1c3','f8b4','a2a3','b4c3','b2c3','c7c5'], name: 'Obrona Nimzo-indyjska, Sämisch (główny)' },
  { prefix: ['d2d4','g8f6','c2c4','e7e6','g1f3','b7b6','g2g3','c8a6'], name: 'Obrona Hetmańsko-indyjska, wariant klasyczny' },
  { prefix: ['d2d4','g8f6','c2c4','g7g6','b1c3','f8g7','e2e4','d7d6','g1f3','e8g8','f1e2','e7e5'], name: 'Obrona Królewsko-indyjska, klasyczny (główny)' },
  { prefix: ['d2d4','g8f6','c2c4','g7g6','b1c3','f8g7','e2e4','d7d6','g1f3','e8g8','f1e2','e7e5','e1g1','b8c6','d4d5','c6e7'], name: 'Obrona Królewsko-indyjska, Mar del Plata' },
  { prefix: ['d2d4','g8f6','c2c4','g7g6','b1c3','f8g7','e2e4','d7d6','f2f3','e8g8','c1e3','c7c5'], name: 'Obrona Królewsko-indyjska, Sämisch (główny)' },
  { prefix: ['d2d4','g8f6','c2c4','g7g6','b1c3','f8g7','e2e4','d7d6','g2g3','e8g8','f1g2'], name: 'Obrona Królewsko-indyjska, fianchetto (główny)' },
  { prefix: ['d2d4','g8f6','c2c4','g7g6','b1c3','f8g7','e2e4','d7d6','f2f4','e8g8','g1f3'], name: 'Obrona Królewsko-indyjska, Cztery Piony (główny)' },
  { prefix: ['d2d4','g8f6','c2c4','g7g6','b1c3','d7d5','c4d5','f6d5','e2e4','d5c3','b2c3','f8g7'], name: 'Obrona Grünfelda, wymienny (główny)' },
  { prefix: ['d2d4','g8f6','c2c4','g7g6','b1c3','d7d5','c1f4'], name: 'Obrona Grünfelda, wariant węgierski' },
  { prefix: ['d2d4','g8f6','c2c4','g7g6','b1c3','d7d5','g1f3','f8g7','d1a4'], name: 'Obrona Grünfelda, wariant sztokholmski' },
  { prefix: ['d2d4','f7f5','g2g3','g8f6','g1f3','g7g6','f1g2','f8g7','e1g1','e8g8'], name: 'Obrona Holenderska, leningradzki (główny)' },
  { prefix: ['d2d4','f7f5','g2g3','g8f6','f1g2','e7e6','c2c4','d7d5','g1f3','c7c6'], name: 'Obrona Holenderska, Stonewall (główny)' },
  { prefix: ['d2d4','g8f6','c2c4','c7c5','d4d5','e7e6','b1c3','e6d5','c4d5','d7d6','g1f3','g7g6'], name: 'Obrona Benoni, wariant główny' },
  { prefix: ['d2d4','g8f6','c2c4','c7c5','d4d5','e7e6','b1c3','e6d5','c4d5','d7d6','g1f3','g7g6','g2g3'], name: 'Obrona Benoni, fianchetto' },
  { prefix: ['d2d4','g8f6','c2c4','c7c5','d4d5','e7e5','b1c3','d7d6','e2e4'], name: 'Obrona Benoni, czeski (główny)' },
  { prefix: ['d2d4','g8f6','c2c4','c7c5','d4d5','b7b5','c4b5','a7a6'], name: 'Gambit Wołżański przyjęty' },
  { prefix: ['d2d4','g8f6','c2c4','e7e5','d4e5','f6g4'], name: 'Gambit Budapeszteński, wariant główny' },
  { prefix: ['d2d4','g8f6','c2c4','e7e5','d4e5','f6e4'], name: 'Gambit Budapeszteński, wariant Fajarowicza' },
  { prefix: ['d2d4','e7e5'], name: 'Gambit Englunda' },
  { prefix: ['d2d4','b7b5'], name: 'Obrona Polska' },
  { prefix: ['d2d4','d7d6','c2c4','e7e5'], name: 'Obrona Szczura' },
  { prefix: ['d2d4','g8f6','g1f3','d7d6'], name: "Obrona Wade'a" },
  { prefix: ['d2d4','d7d5','e2e4','d5e4','b1c3','g8f6','f2f3','e4f3'], name: 'Gambit Blackmara-Diemera przyjęty' },
  { prefix: ['d2d4','d7d5','e2e4','d5e4','b1c3','e7e5'], name: 'Gambit Blackmara-Diemera, obrona Euwe' },
  { prefix: ['c2c4','e7e5','g2g3','g8f6','f1g2'], name: 'Debiut Angielski, atak królewsko-indyjski' },
  { prefix: ['c2c4','e7e5','b1c3','g8f6','g1f3','b8c6'], name: 'Debiut Angielski, czterech skoczków' },
  { prefix: ['g1f3','d7d5','c2c4','d5d4'], name: 'Debiut Rétiego, wariant posunięty' },
  { prefix: ['b1c3','d7d5'], name: 'Atak Van Geeta, otwarcie Dunsta' },
  { prefix: ['b1c3','e7e5'], name: 'Atak Van Geeta, kontra Kolorado' },
  { prefix: ['g1h3','d7d5'], name: 'Debiut Amara, wariant paryski' },
  { prefix: ['f2f3','e7e5'], name: 'Otwarcie Barnesa, Hammerschlag' },
  { prefix: ['b1a3','g7g5'], name: 'Debiut Durkina, atak Sodowy' },
  { prefix: ['a2a4','e7e5'], name: "Debiut Ware'a, Krab" },
  { prefix: ['g2g4','d7d5','f1g2'], name: 'Debiut Groba, wariant główny' },
  { prefix: ['g2g4','e7e5'], name: 'Debiut Groba, kontragambit Romforda' },
  { prefix: ['b2b4','e7e5','c1b2'], name: 'Debiut Sokolskiego, wariant główny' },
  { prefix: ['b2b4','c7c5'], name: 'Debiut Sokolskiego, gambit Birmingham' },
  { prefix: ['f2f4','d7d5'], name: 'Debiut Birda, wariant główny' },
  { prefix: ['f2f4','e7e5'], name: 'Debiut Birda, gambit Froma' },
  { prefix: ['b2b3','e7e5'], name: 'Debiut Larsena, wariant nowoczesny' },
  { prefix: ['b2b3','d7d5'], name: 'Debiut Larsena, wariant klasyczny' },
  { prefix: ['c2c3','e7e5'], name: 'Debiut Saragossy, wariant główny' },
  { prefix: ['e2e4','e7e5','g1f3','b8c6','f1b5','a7a6','b5a4','g8f6','e1g1','b7b5','a4b3','c8b7'], name: 'Partia Hiszpańska, neo-archangielski' },
  { prefix: ['e2e4','e7e5','g1f3','b8c6','f1c4','f8c5','c2c3','g8f6','d2d3','d7d6'], name: 'Partia Włoska z ...d6' },
  { prefix: ['e2e4','e7e5','g1f3','b8c6','f1c4','f8c5','b2b4','c5b4','c2c3','b4a5'], name: 'Partia Włoska, gambit Evansa przyjęty (główny)' },
  { prefix: ['e2e4','e7e5','g1f3','b8c6','f1c4','g8f6','d2d4','e5d4','e4e5','d7d5'], name: 'Obrona Dwóch Skoczków, wariant otwarty' },
  { prefix: ['e2e4','e7e5','g1f3','b8c6','f1c4','g8f6','c4f7'], name: "Gambit Jerome'a" },
  { prefix: ['e2e4','e7e5','g1f3','b8c6','f1c4','c6d4'], name: 'Gambit Shillinga (Blackburne)' },
  { prefix: ['e2e4','e7e5','g1f3','b8c6','d2d4','e5d4','f3d4','f8c5','c1e3','d8f6','c2c3','g8e7'], name: 'Partia Szkocka, wariant Lollego' },
  { prefix: ['e2e4','e7e5','g1f3','b8c6','d2d4','e5d4','f3d4','f8c5','d4b3'], name: 'Partia Szkocka, wariant Pottera' },
  { prefix: ['e2e4','e7e5','g1f3','b8c6','d2d4','e5d4','f1c4'], name: 'Gambit Szkocki' },
  { prefix: ['e2e4','e7e5','g1f3','b8c6','d2d4','e5d4','c2c3','d4c3','b1c3'], name: 'Partia Szkocka, Göring przyjęty (główny)' },
  { prefix: ['e2e4','e7e5','g1f3','b8c6','b1c3','g8f6','f1b5','a7a6'], name: 'Partia Czterech Skoczków, wariant Gunsberga' },
  { prefix: ['e2e4','e7e5','g1f3','b8c6','b1c3','g7g6'], name: 'Debiut Trzech Skoczków, wariant Steinitza' },
  { prefix: ['e2e4','e7e5','g1f3','b8c6','c2c3','d7d5'], name: 'Debiut Ponzianiego, kontra Caro' },
  { prefix: ['e2e4','e7e5','d2d4','e5d4','c2c3','d7d5'], name: 'Gambit Duński, obrona Schlechtera' },
  { prefix: ['e2e4','e7e5','f2f4','e5f4','g1f3','g7g5','f1c4','g5g4','e1g1','d7d5'], name: 'Gambit Królewski, obrona Polerio' },
  { prefix: ['e2e4','e7e5','f2f4','d8h4'], name: "Gambit Królewski, obrona Keene'a" },
  { prefix: ['e2e4','e7e5','f2f4','e5f4','g1f3','d8e7'], name: 'Gambit Królewski, wariant Norwala' },
  { prefix: ['e2e4','e7e5','f2f4','e5f4','g1f3','h7h6'], name: 'Gambit Królewski, obrona Beckera' },
  { prefix: ['e2e4','e7e5','f2f4','e5f4','g1f3','g8e7'], name: 'Gambit Królewski, obrona Svenoniusa' },
  { prefix: ['e2e4','e7e5','b1c3','g8f6','f1c4','f6e4'], name: 'Debiut Wiedeński, wariant Hamppe-Meitnera' },
  { prefix: ['e2e4','e7e5','b1c3','b8c6','f2f4','d7d5'], name: 'Debiut Wiedeński, wariant Steinitza' },
  { prefix: ['e2e4','e7e5','b1c3','g8f6','g2g3'], name: 'Debiut Wiedeński, Pchła' },
  { prefix: ['e2e4','e7e5','f1c4','f8c5','c2c3','d7d5'], name: 'Debiut Gońca, kontragambit Lewisa' },
  { prefix: ['e2e4','e7e5','f1c4','b7b5'], name: 'Debiut Gońca, gambit Skrzydłowy' },
  { prefix: ['e2e4','e7e5','f1c4','b7b6'], name: 'Debiut Gońca, obrona Anderssena' },
  { prefix: ['e2e4','e7e5','f1c4','c7c6'], name: 'Debiut Gońca, wariant Steina' },
  { prefix: ['e2e4','e7e5','g1f3','d7d6','d2d4','g8f6'], name: 'Obrona Philidora, wariant główny' },
  { prefix: ['d2d4','d7d5','c2c4','e7e6','b1c3','g8f6','e2e4'], name: 'Gambit Hetmański, gambit Marshalla (pełny)' },
  { prefix: ['d2d4','g8f6','c2c4','e7e6','g1f3','f8b4','c1d2'], name: 'Obrona Bogo-indyjska, wariant główny' },
  { prefix: ['d2d4','g8f6','c2c4','e7e6','b1c3','d7d5'], name: 'Gambit Hetmański odrzucony (kolejność Nimzo)' },
  { prefix: ['d2d4','f7f5','c2c4','g8f6','b1c3','e7e6'], name: 'Obrona Holenderska, wariant z Sc3' },
  { prefix: ['d2d4','g8f6','c2c4','c7c5','d4d5','d7d6'], name: 'Obrona Benoni, blokada' },
  { prefix: ['c2c4','e7e5','b1c3','g8f6','e2e4'], name: 'Debiut Angielski, gambit Reversed' },
  { prefix: ['g2g3','d7d5','f1g2','e7e5'], name: 'Otwarcie Benko z ...e5' },
  { prefix: ['b2b3','g8f6','c1b2','e7e6'], name: 'Debiut Larsena, wariant klasyczny z Sf6' },
  { prefix: ['e2e3','d7d5','d2d4'], name: "Otwarcie Van't Kruijsa, odwrócony francuski" },
  { prefix: ['d2d3','d7d5','g2g3'], name: 'Debiut Miesesa z fianchetto' },
];

// 🧩 ZAGADKI (65): maty klasyczne + najlepsze ruchy z partii GM (Stockfish 10).
export interface Puzzle { name: string; level: 1 | 2 | 3; goal: 'mat' | 'tac'; mn: number; fen: string; tip: string; sol: string; accept: string[]; pv: string; meta: string; }
const PUZZLES: Puzzle[] = [
  { name: 'Taktyka: Leko–Kramnik', level: 1, goal: 'tac', mn: 0, fen: '3rR3/pkp2bpp/1p6/8/2P5/1P6/P2b1PPP/6K1 w - - 0 27', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Leko–Kramnik 2001 [C67].', sol: 'Rxd8 (jedyny dobry ruch – ratuje pozycję)', accept: ['e8d8'], pv: '27. Rxd8 Bc3 28. g4 g5 29. Kg2 Kc6 30. Kf3 Be5', meta: 'Leko–Kramnik 2001 [C67]' },
  { name: 'Taktyka: Kramnik–Leko', level: 3, goal: 'tac', mn: 0, fen: '2r2rk1/p6p/bn2qp2/3N2p1/2P4B/Q3PpPP/P4P2/R2R2K1 w - - 0 27', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Kramnik–Leko 2001 [E15].', sol: 'Qxa6 (+2.2 dla białych)', accept: ['a3a6'], pv: '27. Qxa6 gxh4', meta: 'Kramnik–Leko 2001 [E15]' },
  { name: 'Taktyka: Kramnik–Leko', level: 1, goal: 'tac', mn: 0, fen: '3r1rk1/p3q2p/b4p2/3N2p1/2nR2P1/4PpBP/P4P2/R5K1 w - - 0 31', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Kramnik–Leko 2001 [E15].', sol: 'Nxe7+ (jedyny dobry ruch – ratuje pozycję)', accept: ['d5e7'], pv: '31. Nxe7+ Kf7 32. Nf5 Rxd4 33. Nxd4 Bb7 34. Rd1 Rd8', meta: 'Kramnik–Leko 2001 [E15]' },
  { name: 'Taktyka: Leko–Kramnik', level: 3, goal: 'tac', mn: 0, fen: '4b2r/pkp1b3/1p3p2/2p2n1p/4N3/1P1R4/P1P1NPPP/2B3K1 w - - 0 21', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Leko–Kramnik 2001 [C67].', sol: 'h3 (+1.8 dla białych)', accept: ['h2h3'], pv: '21. h3 Nh4 22. Bb2 c4 23. bxc4', meta: 'Leko–Kramnik 2001 [C67]' },
  { name: 'Taktyka: Leko–Kramnik', level: 3, goal: 'tac', mn: 0, fen: '5r2/pkp5/1pbb1Nn1/2pN1p1p/8/1P1R1PP1/PBP4P/6K1 w - - 1 27', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Leko–Kramnik 2001 [C67].', sol: 'Nxh5 (+1.4 dla białych)', accept: ['f6h5'], pv: '27. Nxh5 a5 28. f4 a4 29. Ng7 a3 30. Bxa3 Ra8', meta: 'Leko–Kramnik 2001 [C67]' },
  { name: 'Taktyka: Kramnik–Leko', level: 1, goal: 'tac', mn: 0, fen: 'r4rk1/3bq3/p6p/1p1P1pp1/P1p5/7P/1PB2PP1/R3R1K1 w - - 0 25', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Kramnik–Leko 2001 [A43].', sol: 'Rxe7 (+0.6 dla białych)', accept: ['e1e7'], pv: '25. Rxe7 Rf7 26. Rxf7 Kxf7 27. axb5 a5 28. f4 gxf4', meta: 'Kramnik–Leko 2001 [A43]' },
  { name: 'Taktyka: Leko–Kramnik', level: 2, goal: 'tac', mn: 0, fen: '5k2/p1r2p2/1p4pp/3r4/n2p1P2/P2B1KP1/1PP1R2P/1R6 w - - 5 29', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Leko–Kramnik 2001 [B45].', sol: 'Be4 (+7.5 dla białych)', accept: ['d3e4'], pv: '29. Be4 Nc5 30. Bxd5 d3 31. cxd3', meta: 'Leko–Kramnik 2001 [B45]' },
  { name: 'Taktyka: Leko–Kramnik', level: 1, goal: 'tac', mn: 0, fen: '8/p1rr1pk1/1p4pp/8/n2pBP2/P4KP1/1PPR3P/1R6 w - - 9 31', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Leko–Kramnik 2001 [B45].', sol: 'b3 (+3.5 dla białych)', accept: ['b2b3'], pv: '31. b3 Rc3+ 32. Kf2 b5 33. bxa4 bxa4', meta: 'Leko–Kramnik 2001 [B45]' },
  { name: 'Taktyka: Sasikiran–Bischoff', level: 1, goal: 'tac', mn: 0, fen: 'r3rb2/2pn2pk/4pnR1/p6q/2N2B2/1P4P1/2P1QPNP/5RK1 w - - 3 27', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Sasikiran–Bischoff 2001 [A07].', sol: 'Qxh5+ (+1.9 dla białych)', accept: ['e2h5'], pv: '27. Qxh5+ Nxh5 28. Rg4 Nhf6 29. Rh4+ Kg8 30. Ra1 Nd5', meta: 'Sasikiran–Bischoff 2001 [A07]' },
  { name: 'Taktyka: Bischoff–Speelman', level: 1, goal: 'tac', mn: 0, fen: 'r4r1k/6pp/2p1R3/2P3q1/1P3p2/8/2Q2PPP/4R1K1 w - - 0 27', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Bischoff–Speelman 2001 [E32].', sol: 'R1e5 (+14.2 dla białych)', accept: ['e1e5'], pv: '27. R1e5 f3 28. Rxg5 fxg2 29. Rxc6', meta: 'Bischoff–Speelman 2001 [E32]' },
  { name: 'Taktyka: Bischoff–Ftacnik', level: 1, goal: 'tac', mn: 0, fen: '3rrk2/p4p1p/1p3p2/6q1/PR6/5QP1/5P1P/5RK1 w - - 6 25', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Bischoff–Ftacnik 2001 [A31].', sol: 'Rb5 (+6.0 dla białych)', accept: ['b4b5'], pv: '25. Rb5 Re6 26. Rxg5', meta: 'Bischoff–Ftacnik 2001 [A31]' },
  { name: 'Taktyka: Ulibin–Hillarp Persso', level: 2, goal: 'tac', mn: 0, fen: 'r1rq2k1/4ppb1/1pbp2p1/2n4p/1pP1P3/P1N1BP2/2RQB1PP/1R5K w - - 0 21', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Ulibin–Hillarp Persso 2001 [B38].', sol: 'axb4 (+0.8 dla białych)', accept: ['a3b4'], pv: '21. axb4 Nd7 22. Kg1 Ra3 23. Bg5 Qf8 24. Rbc1 Kh7', meta: 'Ulibin–Hillarp Persso 2001 [B38]' },
  { name: 'Taktyka: Ulibin–Hillarp Persso', level: 2, goal: 'tac', mn: 0, fen: 'r1r1q1k1/4ppb1/1pbp2p1/7p/nPP1P3/4BP2/2RQB1PP/1R1N3K w - - 3 23', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Ulibin–Hillarp Persso 2001 [B38].', sol: 'b5 (+3.5 dla białych)', accept: ['b4b5'], pv: '23. b5 h4 24. bxc6 Rxc6', meta: 'Ulibin–Hillarp Persso 2001 [B38]' },
  { name: 'Taktyka: Ulibin–Hillarp Persso', level: 3, goal: 'tac', mn: 0, fen: 'r1rq2k1/4pp2/2bp2p1/7p/nPBQP3/4NP2/2R3PP/1R5K w - - 1 27', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Ulibin–Hillarp Persso 2001 [B38].', sol: 'Qa1 (+4.5 dla białych)', accept: ['d4a1'], pv: '27. Qa1 h4 28. b5 e5 29. bxc6 Rxc6', meta: 'Ulibin–Hillarp Persso 2001 [B38]' },
  { name: 'Taktyka: Ulibin–Hillarp Persso', level: 2, goal: 'tac', mn: 0, fen: 'r2q4/4pk2/2rp2p1/7p/nP1QP3/4NP2/6PP/1R5K w - - 0 29', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Ulibin–Hillarp Persso 2001 [B38].', sol: 'Qd5+ (+1.4 dla białych)', accept: ['d4d5'], pv: '29. Qd5+ Kf8 30. Qxc6 Qc8 31. Qxc8+ Rxc8 32. h4 e6', meta: 'Ulibin–Hillarp Persso 2001 [B38]' },
  { name: 'Taktyka: Gyimesi–Agrest', level: 3, goal: 'tac', mn: 0, fen: 'r3k2r/2qn1pb1/p3p1p1/1p1b2Pp/4NP1P/1P2Q3/P3N1B1/3R1RK1 w kq - 0 21', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Gyimesi–Agrest 2001 [B07].', sol: 'b4 (+2.4 dla białych)', accept: ['b3b4'], pv: '21. b4 Nb8 22. Nf6+ Bxf6 23. Bxd5', meta: 'Gyimesi–Agrest 2001 [B07]' },
  { name: 'Taktyka: Gyimesi–Agrest', level: 2, goal: 'tac', mn: 0, fen: 'r4k1r/2qn1pb1/p4Np1/1p1p2Pp/5P1P/1P2Q3/P3N3/3R1RK1 w - - 0 23', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Gyimesi–Agrest 2001 [B07].', sol: 'Nxd5 (+3.1 dla białych)', accept: ['f6d5'], pv: '23. Nxd5 Qc5 24. Qxc5+ Nxc5 25. f5 Kg8 26. fxg6 fxg6', meta: 'Gyimesi–Agrest 2001 [B07]' },
  { name: 'Taktyka: Gurevich–Van Wely', level: 1, goal: 'tac', mn: 0, fen: '2rq1rk1/p4ppp/1p3n2/2b5/4bB2/6P1/PP2PPBP/RQ2R1K1 w - - 0 17', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Gurevich–Van Wely 2001 [E17].', sol: 'Bxe4 (jedyny dobry ruch – ratuje pozycję)', accept: ['g2e4'], pv: '17. Bxe4 Nxe4 18. Qxe4 Re8 19. Qf3 Qd4 20. Rab1 Bb4', meta: 'Gurevich–Van Wely 2001 [E17]' },
  { name: 'Taktyka: Gurevich–Van Wely', level: 3, goal: 'tac', mn: 0, fen: '2r1r1k1/p4ppp/1p3n2/2b5/3q1B2/5BP1/PP2P2P/RQ3R1K w - - 4 21', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Gurevich–Van Wely 2001 [E17].', sol: 'h4 (+1.9 dla białych)', accept: ['h2h4'], pv: '21. h4 g5 22. Rd1 gxf4 23. Rxd4', meta: 'Gurevich–Van Wely 2001 [E17]' },
  { name: 'Taktyka: Gurevich–Van Wely', level: 1, goal: 'tac', mn: 0, fen: '2r1r1k1/p4ppp/1p3n2/5Q2/2q2B2/4bBP1/PP2P2P/R2R3K w - - 8 23', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Gurevich–Van Wely 2001 [E17].', sol: 'Be5 (+5.1 dla białych)', accept: ['f4e5'], pv: '23. Be5 Rxe5 24. Qxe5 Ng4', meta: 'Gurevich–Van Wely 2001 [E17]' },
  { name: 'Taktyka: Gurevich–Van Wely', level: 1, goal: 'tac', mn: 0, fen: '4r1k1/p4p1p/1p3np1/8/5P2/1P1R1B2/P1r1P2P/R6K w - - 0 27', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Gurevich–Van Wely 2001 [E17].', sol: 'e3 (+4.9 dla białych)', accept: ['e2e3'], pv: '27. e3 h5 28. Bd1 Ng4 29. Bxc2 Rxe3 30. Rxe3 Nxe3', meta: 'Gurevich–Van Wely 2001 [E17]' },
  { name: 'Taktyka: Vaganian–Kengis', level: 3, goal: 'tac', mn: 0, fen: '1qr3k1/5p1p/1p1b2p1/1Brpn3/P2Q2n1/4PN2/1B3PPP/R2R2K1 w - - 6 25', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Vaganian–Kengis 2001 [E14].', sol: 'h3 (+4.1 dla białych)', accept: ['h2h3'], pv: '25. h3 Rxb5 26. axb5 Nxf3+ 27. gxf3', meta: 'Vaganian–Kengis 2001 [E14]' },
  { name: 'Taktyka: Agdestein–Hansen', level: 1, goal: 'tac', mn: 0, fen: 'r1br2k1/p4ppp/1pq1pn2/8/2BP4/BQP5/P4PPP/R4RK1 w - - 0 15', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Agdestein–Hansen 2001 [E54].', sol: 'Be7 (+6.0 dla białych)', accept: ['a3e7'], pv: '15. Be7 a5 16. Bxd8 a4', meta: 'Agdestein–Hansen 2001 [E54]' },
  { name: 'Taktyka: Agdestein–Hansen', level: 1, goal: 'tac', mn: 0, fen: '6k1/prrn1pp1/4p2p/R1P5/3P4/2q2P2/6PP/B4RK1 w - - 0 31', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Agdestein–Hansen 2001 [E54].', sol: 'Bxc3 (+1.0 dla białych)', accept: ['a1c3'], pv: '31. Bxc3 Rb3 32. Rc1 Nb8 33. d5 exd5 34. Be5 Rc8', meta: 'Agdestein–Hansen 2001 [E54]' },
  { name: 'Taktyka: Leko–Fedorov', level: 2, goal: 'tac', mn: 0, fen: '3r1rk1/1p1n2pp/p2pb3/1P1Npn2/2P2P1q/6P1/P1N4P/2RQRBK1 b - - 0 20', tip: 'Znajdź najsilniejszy ruch (czarne). Z partii: Leko–Fedorov 2001 [B32].', sol: 'Nxg3 (+1.3 dla czarnych)', accept: ['f5g3'], pv: '20. Nxg3 hxg3 21. Qxg3+ Bg2 22. Bg4 Re3 23. Qxe3+ Ndxe3', meta: 'Leko–Fedorov 2001 [B32]' },
  { name: 'Taktyka: Shirov–Topalov', level: 3, goal: 'tac', mn: 0, fen: 'r1bqkb1r/1p1n1p1p/p4n2/4pPP1/3p4/2N1BQ2/PPP2P1P/2KR1B1R w kq - 2 13', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Shirov–Topalov 2001 [B81].', sol: 'Bxd4 (jedyny dobry ruch – ratuje pozycję)', accept: ['e3d4'], pv: '13. Bxd4 exd4 14. Rxd4 Bg7 15. gxf6 Qxf6 16. Qe3+ Kd8', meta: 'Shirov–Topalov 2001 [B81]' },
  { name: 'Taktyka: Shirov–Topalov', level: 1, goal: 'tac', mn: 0, fen: 'r1b1k2r/1p1n1p1p/p1q2P1b/4pP2/8/2B3Q1/PPP2P1P/1K1R1B1R b kq - 4 17', tip: 'Znajdź najsilniejszy ruch (czarne). Z partii: Shirov–Topalov 2001 [B81].', sol: 'a5 (+8.1 dla czarnych)', accept: ['a6a5'], pv: '17. a5 Bxe5 18. Qxh1 a3 19. Nxe5 Qxe5+ 20. Kf8', meta: 'Shirov–Topalov 2001 [B81]' },
  { name: 'Taktyka: Piket–Morozevich', level: 1, goal: 'tac', mn: 0, fen: 'r4qk1/p6p/1p3pn1/2pPpr2/2P1N3/1Q3PP1/P6P/R3K2R w KQ - 0 22', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Piket–Morozevich 2001 [D07].', sol: 'g4 (+6.1 dla białych)', accept: ['g3g4'], pv: '22. g4 Nh4 23. gxf5 Nxf5 24. Rg1+ Kh8', meta: 'Piket–Morozevich 2001 [D07]' },
  { name: 'Taktyka: Piket–Morozevich', level: 2, goal: 'tac', mn: 0, fen: 'r4qk1/p3n2p/1p5r/2pPppPP/2P1N3/1Q3P2/P7/2KR3R b - - 0 26', tip: 'Znajdź najsilniejszy ruch (czarne). Z partii: Piket–Morozevich 2001 [D07].', sol: 'fxe4 (jedyny dobry ruch – ratuje pozycję)', accept: ['f5e4'], pv: '26. fxe4 gxh6 27. Qf4+ Kb2 28. exf3 Rhf1 29. Rf8 Qc3', meta: 'Piket–Morozevich 2001 [D07]' },
  { name: 'Taktyka: Van Wely–Ivanchuk', level: 1, goal: 'tac', mn: 0, fen: '1rb1nrk1/1p1nqpbp/p2p2p1/2pP4/P3PB2/2N2N1P/1P2BPP1/R2QR1K1 b - - 0 14', tip: 'Znajdź najsilniejszy ruch (czarne). Z partii: Van Wely–Ivanchuk 2001 [A61].', sol: 'Qf6 (+3.7 dla czarnych)', accept: ['e7f6'], pv: '14. Qf6 a5 15. Qxf4', meta: 'Van Wely–Ivanchuk 2001 [A61]' },
  { name: 'Taktyka: Van Wely–Ivanchuk', level: 2, goal: 'tac', mn: 0, fen: '2rr2k1/1bn2pqp/1p4p1/p1nP4/P1R5/2N2N1P/3Q1PP1/4RBK1 w - - 0 28', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Van Wely–Ivanchuk 2001 [A61].', sol: 'Rd4 (+2.2 dla białych)', accept: ['c4d4'], pv: '28. Rd4 h5 29. d6 Bxf3 30. gxf3', meta: 'Van Wely–Ivanchuk 2001 [A61]' },
  { name: 'Taktyka: Adams–Anand', level: 1, goal: 'tac', mn: 0, fen: 'r3k2r/1pq2pp1/p4n1p/2pbp3/4P3/6P1/PPPQ1PBP/3R1RK1 w kq - 0 16', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Adams–Anand 2001 [B47].', sol: 'exd5 (+0.8 dla białych)', accept: ['e4d5'], pv: '16. exd5 Qd6 17. c4 O-O 18. Rfe1 b5 19. b3 bxc4', meta: 'Adams–Anand 2001 [B47]' },
  { name: 'Taktyka: Adams–Anand', level: 1, goal: 'tac', mn: 0, fen: '3r2k1/1r1n1pp1/p2P3p/2p5/P1P5/6P1/3R2BP/6K1 w - - 0 25', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Adams–Anand 2001 [B47].', sol: 'Bxb7 (+0.5 dla białych)', accept: ['g2b7'], pv: '25. Bxb7 a5 26. Rd5 g5 27. Bc6 Nb6 28. Rxc5 Rxd6', meta: 'Adams–Anand 2001 [B47]' },
  { name: 'Taktyka: Topalov–Piket', level: 1, goal: 'tac', mn: 0, fen: 'r1N2bk1/3n1ppp/Qp2pn2/8/P2PP3/p4PP1/1B4KP/2RR4 b - - 0 26', tip: 'Znajdź najsilniejszy ruch (czarne). Z partii: Topalov–Piket 2001 [E15].', sol: 'Rxa6 (jedyny dobry ruch – ratuje pozycję)', accept: ['a8a6'], pv: '26. Rxa6 Ba1 27. Rxa4 d5 28. b5 d6 29. b4 Ne7+', meta: 'Topalov–Piket 2001 [E15]' },
  { name: 'Taktyka: Topalov–Piket', level: 1, goal: 'tac', mn: 0, fen: '2N3k1/3n1ppp/1p2Pn2/2b5/r3P3/p4PP1/6KP/B1RR4 b - - 0 29', tip: 'Znajdź najsilniejszy ruch (czarne). Z partii: Topalov–Piket 2001 [E15].', sol: 'fxe6 (jedyny dobry ruch – ratuje pozycję)', accept: ['f7e6'], pv: '29. fxe6 Nd6 30. h6 Nb7 31. Bf8 Rc6 32. e5 Rc7', meta: 'Topalov–Piket 2001 [E15]' },
  { name: 'Taktyka: Morozevich–Timman', level: 1, goal: 'tac', mn: 0, fen: '3r2k1/ppq2pp1/2p2n1r/8/2Pp3Q/3P2N1/P1P2PK1/1R5R w - - 6 31', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Morozevich–Timman 2001 [C26].', sol: 'Qg5 (jedyny dobry ruch – ratuje pozycję)', accept: ['h4g5'], pv: '31. Qg5 Rg6 32. Qh4 Kf8 33. Rbe1 Ng8 34. Kf1 Rh6', meta: 'Morozevich–Timman 2001 [C26]' },
  { name: 'Taktyka: Ivanchuk–Adams', level: 2, goal: 'tac', mn: 0, fen: 'r2r4/p2bn1k1/1p3ppp/3np3/BP6/PN2P1P1/1B3P1P/2R1K2R w K - 1 25', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Ivanchuk–Adams 2001 [E34].', sol: 'Bxd7 (jedyny dobry ruch – ratuje pozycję)', accept: ['a4d7'], pv: '25. Bxd7 Rxd7 26. O-O Rc8 27. Rxc8 Nxc8 28. e4 Nc7', meta: 'Ivanchuk–Adams 2001 [E34]' },
  { name: 'Taktyka: Ivanchuk–Adams', level: 1, goal: 'tac', mn: 0, fen: '3r4/p1nRnk2/1p3ppp/1P2p3/8/PN2P1P1/1B2KP1P/2R5 b - - 0 29', tip: 'Znajdź najsilniejszy ruch (czarne). Z partii: Ivanchuk–Adams 2001 [E34].', sol: 'Rxd7 (jedyny dobry ruch – ratuje pozycję)', accept: ['d8d7'], pv: '29. Rxd7 a4 30. Ne6 Ba3 31. Rd5 Nd2 32. f5 e4', meta: 'Ivanchuk–Adams 2001 [E34]' },
  { name: 'Taktyka: Milov–Dominguez', level: 2, goal: 'tac', mn: 0, fen: '1k1r3r/1b3pp1/1q2p2p/2nnP3/1p1N4/8/1PBB1PPP/R1R1Q1K1 b - - 1 23', tip: 'Znajdź najsilniejszy ruch (czarne). Z partii: Milov–Dominguez 2001 [D47].', sol: 'b3 (+1.5 dla czarnych)', accept: ['b4b3'], pv: '23. b3 f3 24. bxc2 Rxc2', meta: 'Milov–Dominguez 2001 [D47]' },
  { name: 'Taktyka: Milov–Dominguez', level: 1, goal: 'tac', mn: 0, fen: '1kr4r/1b3pp1/1q2p2p/3nP3/1p6/1n6/1PBB1PPP/R1R1Q1K1 w - - 0 25', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Milov–Dominguez 2001 [D47].', sol: 'Bxb3 (+1.5 dla białych)', accept: ['c2b3'], pv: '25. Bxb3 Rxc1 26. Bxc1 Rd8 27. Bxd5 Rxd5 28. Be3 Qb5', meta: 'Milov–Dominguez 2001 [D47]' },
  { name: 'Taktyka: Akopian–Burmakin', level: 1, goal: 'tac', mn: 0, fen: 'r2q1k2/ppp1bPp1/1n2b2r/6p1/3PP3/2Q2N2/PP2BPPP/1K1R3R b - - 4 14', tip: 'Znajdź najsilniejszy ruch (czarne). Z partii: Akopian–Burmakin 2001 [D37].', sol: 'Na4 (+10.6 dla czarnych)', accept: ['b6a4'], pv: '14. Na4 Ne5 15. Nxc3+ bxc3 16. Bxf7 Nxf7 17. Kxf7', meta: 'Akopian–Burmakin 2001 [D37]' },
  { name: 'Taktyka: Akopian–Burmakin', level: 2, goal: 'tac', mn: 0, fen: 'r4k2/ppp1bPp1/1n1qb2r/8/3PP2p/2Q2N2/PP2BPP1/1K1R3R w - - 0 16', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Akopian–Burmakin 2001 [D37].', sol: 'e5 (+1.4 dla białych)', accept: ['e4e5'], pv: '16. e5 Na4 17. exd6 Nxc3+ 18. bxc3 cxd6', meta: 'Akopian–Burmakin 2001 [D37]' },
  { name: 'Taktyka: Kacheishvili–Zhang Zhong', level: 3, goal: 'tac', mn: 0, fen: 'rn1q1rk1/pp3pb1/1n4p1/2pP1b1p/8/2N3PP/PP2NPB1/R1BQ1RK1 w - - 0 13', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Kacheishvili–Zhang Zhong 2001 [D72].', sol: 'Qd2 (+2.4 dla białych)', accept: ['d1d2'], pv: '13. Qd2 Bxc3 14. Nxc3 a6', meta: 'Kacheishvili–Zhang Zhong 2001 [D72]' },
  { name: 'Taktyka: Kacheishvili–Zhang Zhong', level: 2, goal: 'tac', mn: 0, fen: '4rbk1/pp3p2/1n1P2p1/5q1p/1nr2B2/6PP/P2Q1PBK/2NR1R2 w - - 0 25', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Kacheishvili–Zhang Zhong 2001 [D72].', sol: 'd7 (+4.8 dla białych)', accept: ['d6d7'], pv: '25. d7 Nxd7 26. Qxd7 Qxd7 27. Rxd7 Rc2 28. Nb3 Nxa2', meta: 'Kacheishvili–Zhang Zhong 2001 [D72]' },
  { name: 'Taktyka: Motylev–Zhang Zhong', level: 2, goal: 'tac', mn: 0, fen: '2kr1br1/Qbp4p/1np2p2/P2p4/2P2P2/2NB3q/1PKB3P/3R3R b - - 0 20', tip: 'Znajdź najsilniejszy ruch (czarne). Z partii: Motylev–Zhang Zhong 2001 [C45].', sol: 'dxc4 (jedyny dobry ruch – ratuje pozycję)', accept: ['d5c4'], pv: '20. dxc4 Be4 21. Nd5 Kc1 22. Nb4 Na4 23. Na6 Be3', meta: 'Motylev–Zhang Zhong 2001 [C45]' },
  { name: 'Taktyka: Motylev–Zhang Zhong', level: 1, goal: 'tac', mn: 0, fen: '1kb3r1/7p/2p2p2/Qpq5/2B2P2/1P2b3/3R3P/1N1K3R w - - 4 31', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Motylev–Zhang Zhong 2001 [C45].', sol: 'Bxg8 (+9.1 dla białych)', accept: ['c4g8'], pv: '31. Bxg8 Bg4+ 32. Ke1 Bxd2+ 33. Nxd2', meta: 'Motylev–Zhang Zhong 2001 [C45]' },
  { name: 'Taktyka: Kacheishvili–Sakaev', level: 1, goal: 'tac', mn: 0, fen: 'r4rk1/1bpn2bn/pp1p1q1p/3P4/2P1p2N/3B2PP/PPQ2P2/R1B1R1K1 w - - 0 19', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Kacheishvili–Sakaev 2001 [E14].', sol: 'Bxe4 (+1.7 dla białych)', accept: ['d3e4'], pv: '19. Bxe4 Ng5 20. Bxg5 hxg5 21. Bh7+ Kf7 22. Re6 gxh4', meta: 'Kacheishvili–Sakaev 2001 [E14]' },
  { name: 'Taktyka: Van der Sterre–Aronian', level: 3, goal: 'tac', mn: 0, fen: '1rbq1k1r/2N1bppp/4pn2/4n3/1p1p1P2/6P1/1PQPP1BP/R1B2RK1 w - - 2 16', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Van der Sterre–Aronian 2001 [A13].', sol: 'fxe5 (jedyny dobry ruch – ratuje pozycję)', accept: ['f4e5'], pv: '16. fxe5 Ng4 17. d3 h5 18. h4 Nxe5 19. Bf4 Ng4', meta: 'Van der Sterre–Aronian 2001 [A13]' },
  { name: 'Taktyka: Bischoff–Khenkin', level: 2, goal: 'tac', mn: 0, fen: 'r3r1k1/pbpp1ppp/2n4q/2b1p3/PpP3n1/1P1PPN1P/1BQ1BPP1/R3KN1R w KQ - 1 14', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Bischoff–Khenkin 2001 [A01].', sol: 'Ng3 (+5.6 dla białych)', accept: ['f1g3'], pv: '14. Ng3 a6 15. hxg4', meta: 'Bischoff–Khenkin 2001 [A01]' },
  { name: 'Taktyka: Bischoff–Khenkin', level: 1, goal: 'tac', mn: 0, fen: 'r3r1k1/pbpp1ppp/2n4q/2b1p3/PpP5/1P1PPN1P/1BQ1BnP1/R3KNR1 w Q - 0 15', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Bischoff–Khenkin 2001 [A01].', sol: 'Kxf2 (+1.3 dla białych)', accept: ['e1f2'], pv: '15. Kxf2 f5 16. g3 e4 17. Nh4 f4 18. Nf5 fxe3+', meta: 'Bischoff–Khenkin 2001 [A01]' },
  { name: 'Taktyka: Bischoff–Khenkin', level: 1, goal: 'tac', mn: 0, fen: 'r3r1k1/pbpp2pp/2n4q/4pp2/PpP5/1P1PbN1P/1BQ1B1P1/R3KNR1 w - - 0 17', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Bischoff–Khenkin 2001 [A01].', sol: 'Nxe3 (+1.9 dla białych)', accept: ['f1e3'], pv: '17. Nxe3 Qxe3 18. Qd2 Qc5 19. Kd1 d5 20. d4 exd4', meta: 'Bischoff–Khenkin 2001 [A01]' },
  { name: 'Taktyka: Rogers–Kunte', level: 1, goal: 'tac', mn: 0, fen: 'r3r1k1/p2p1ppp/bp3q2/n1pp4/2P5/P3PQ1N/1P3PPP/2R1KB1R w K - 0 14', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Rogers–Kunte 2001 [E32].', sol: 'Qxf6 (+0.6 dla białych)', accept: ['f3f6'], pv: '14. Qxf6 gxf6 15. cxd5 Bxf1 16. Rxf1 Kg7 17. Nf4 Rac8', meta: 'Rogers–Kunte 2001 [E32]' },
  { name: 'Taktyka: Rogers–Kunte', level: 1, goal: 'tac', mn: 0, fen: '7r/p2pkp1p/1p6/2pPrn2/4PN2/P4PR1/1P2K2P/2R5 w - - 0 25', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Rogers–Kunte 2001 [E32].', sol: 'Nd3 (+5.0 dla białych)', accept: ['f4d3'], pv: '25. Nd3 Nd4+ 26. Kd1 Nb3 27. Nxe5', meta: 'Rogers–Kunte 2001 [E32]' },
  { name: 'Taktyka: Rogers–Kunte', level: 1, goal: 'tac', mn: 0, fen: '7r/p3kp1p/1p1p3R/2pP2r1/3nPN2/P4P2/1P3K1P/2R5 w - - 0 28', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Rogers–Kunte 2001 [E32].', sol: 'h4 (+6.4 dla białych)', accept: ['h2h4'], pv: '28. h4 f6 29. a4 b5', meta: 'Rogers–Kunte 2001 [E32]' },
  { name: 'Taktyka: Gutman–Savchenko', level: 1, goal: 'tac', mn: 0, fen: 'r3r1k1/1p3ppp/nqp1pn2/3p4/Pp4b1/2PP1NP1/2QNPPBP/RR4K1 w - - 0 15', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Gutman–Savchenko 2001 [A07].', sol: 'Nd4 (+4.7 dla białych)', accept: ['f3d4'], pv: '15. Nd4 c5 16. a5 cxd4', meta: 'Gutman–Savchenko 2001 [A07]' },
  { name: 'Taktyka: Gutman–Savchenko', level: 1, goal: 'tac', mn: 0, fen: '4R3/1p3ppk/1P4p1/8/3rn3/4N1PP/2q2P2/6K1 w - - 2 33', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Gutman–Savchenko 2001 [A07].', sol: 'Nxc2 (jedyny dobry ruch – ratuje pozycję)', accept: ['e3c2'], pv: '33. Nxc2 Rd1+ 34. Kg2 f5 35. Re7 Rd2 36. Ne3 Rxf2+', meta: 'Gutman–Savchenko 2001 [A07]' },
  { name: 'Taktyka: Van Wely–Morozevich', level: 1, goal: 'tac', mn: 0, fen: '1k1r1b2/pp1q1B1p/5p2/2p2N2/P7/1QBnP3/1P3r1P/R5KR w - - 2 19', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Van Wely–Morozevich 2001 [D16].', sol: 'Be6 (+6.4 dla białych)', accept: ['f7e6'], pv: '19. Be6 c4 20. Qxc4', meta: 'Van Wely–Morozevich 2001 [D16]' },
  { name: 'Taktyka: Kasparov–Anand', level: 1, goal: 'tac', mn: 0, fen: '1r1q1r1k/4nppp/p2p4/PP2p3/4P3/1nP1PQ1P/1P1N2P1/R4RK1 w - - 0 20', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Kasparov–Anand 2001 [C78].', sol: 'Nxb3 (+0.6 dla białych)', accept: ['d2b3'], pv: '20. Nxb3 Rxb5 21. Nd2 Rxb2 22. Nc4 Rb3 23. Qd1 Rxc3', meta: 'Kasparov–Anand 2001 [C78]' },
  { name: 'Taktyka: Kasparov–Anand', level: 1, goal: 'tac', mn: 0, fen: '5r1k/1nq2pp1/pr1p3p/4p3/RP2P3/2PQP2P/3N2P1/5RK1 w - - 2 27', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Kasparov–Anand 2001 [C78].', sol: 'Nc4 (+5.4 dla białych)', accept: ['d2c4'], pv: '27. Nc4 f6 28. Nxb6 Qxb6 29. Rxa6', meta: 'Kasparov–Anand 2001 [C78]' },
  { name: 'Taktyka: Kasparov–Anand', level: 2, goal: 'tac', mn: 0, fen: '5r1k/1nq2pp1/2rp3p/p3p3/RP2P3/R1PQP2P/3N2P1/6K1 w - - 0 29', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Kasparov–Anand 2001 [C78].', sol: 'bxa5 (+3.2 dla białych)', accept: ['b4a5'], pv: '29. bxa5 f6 30. a6', meta: 'Kasparov–Anand 2001 [C78]' },
  { name: 'Taktyka: Piket–Leko', level: 1, goal: 'tac', mn: 0, fen: 'rn1qk2r/pp1npp1p/2p3pb/3pNb2/3P4/2N5/PPPQPPPP/2KR1B1R w kq - 0 9', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Piket–Leko 2001 [D00].', sol: 'Qxh6 (+0.6 dla białych)', accept: ['d2h6'], pv: '9. Qxh6 Nxe5 10. Qg7 Rf8 11. Qxe5 Nd7 12. Qf4 Qb6', meta: 'Piket–Leko 2001 [D00]' },
  { name: 'Taktyka: Piket–Leko', level: 2, goal: 'tac', mn: 0, fen: 'r3k2r/ppqnpp1p/2p3pQ/3pPb2/5P2/2N5/PPP1P1PP/2KR1B1R w kq - 1 12', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Piket–Leko 2001 [D00].', sol: 'e3 (+2.0 dla białych)', accept: ['e2e3'], pv: '12. e3 Nxe5 13. fxe5 Qxe5', meta: 'Piket–Leko 2001 [D00]' },
  { name: 'Taktyka: Adams–Kramnik', level: 2, goal: 'tac', mn: 0, fen: '1r3rk1/4qpbp/p2p4/1p3b2/4p3/2P5/PPN1BPPP/R2Q1RK1 w - - 0 18', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Adams–Kramnik 2001 [B33].', sol: 'g4 (+3.4 dla białych)', accept: ['g2g4'], pv: '18. g4 a5 19. gxf5', meta: 'Adams–Kramnik 2001 [B33]' },
  { name: 'Taktyka: Adams–Kramnik', level: 1, goal: 'tac', mn: 0, fen: '1r4k1/5p1p/3p4/p3b1q1/p3b3/2P2R2/1P2B1PP/R2Q3K w - - 0 25', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Adams–Kramnik 2001 [B33].', sol: 'h4 (+7.6 dla białych)', accept: ['h2h4'], pv: '25. h4 Qxh4+ 26. Rh3 Bg3 27. Rxh4 Bxh4 28. Qxa4', meta: 'Adams–Kramnik 2001 [B33]' },
  { name: 'Taktyka: Shirov–Fedorov', level: 2, goal: 'tac', mn: 0, fen: 'r1bq1rk1/p3pp1p/2p3p1/3n4/3b4/2N2P2/PPPQ2PP/2KR1B1R w - - 0 13', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Shirov–Fedorov 2001 [B76].', sol: 'Qxd4 (jedyny dobry ruch – ratuje pozycję)', accept: ['d2d4'], pv: '13. Qxd4 Qc7 14. Qc5 Nxc3 15. Qxc3 Be6 16. Kb1 Rab8', meta: 'Shirov–Fedorov 2001 [B76]' },
  { name: 'Taktyka: Shirov–Fedorov', level: 1, goal: 'tac', mn: 0, fen: 'rr4k1/pq2pp1p/2p1b1p1/2Q5/3R4/1Pn2PP1/P1P1B2P/2K4R w - - 0 20', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Shirov–Fedorov 2001 [B76].', sol: 'Qxc3 (+0.7 dla białych)', accept: ['c5c3'], pv: '20. Qxc3 a5 21. a4 c5 22. Rh4 Rd8 23. Kb2 Rac8', meta: 'Shirov–Fedorov 2001 [B76]' },
  { name: 'Taktyka: Shirov–Fedorov', level: 3, goal: 'tac', mn: 0, fen: 'rr4k1/4pp2/2p1b3/p5pP/R7/1PQ3P1/P1P1Bq2/2K4R w - - 0 26', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Shirov–Fedorov 2001 [B76].', sol: 'Re4 (+3.9 dla białych)', accept: ['a4e4'], pv: '26. Re4 c5 27. Qe5 a4 28. Rxa4', meta: 'Shirov–Fedorov 2001 [B76]' },
  { name: 'Taktyka: Ivanchuk–Kasparov', level: 1, goal: 'tac', mn: 0, fen: 'r1b2rk1/4qppp/p1np4/3n4/1p2Pp2/5B2/PPP3PP/R1B1QRK1 w - - 0 16', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Ivanchuk–Kasparov 2001 [B85].', sol: 'exd5 (jedyny dobry ruch – ratuje pozycję)', accept: ['e4d5'], pv: '16. exd5 Qxe1 17. Rxe1 Nd4 18. Bxf4 Nxc2 19. Bxd6 Rd8', meta: 'Ivanchuk–Kasparov 2001 [B85]' },
  { name: 'Taktyka: Ivanchuk–Kasparov', level: 1, goal: 'tac', mn: 0, fen: 'r1b2rk1/5ppp/p1np4/3P4/1p3p2/5B2/PPP3PP/R1B1qRK1 w - - 0 17', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Ivanchuk–Kasparov 2001 [B85].', sol: 'Rxe1 (jedyny dobry ruch – ratuje pozycję)', accept: ['f1e1'], pv: '17. Rxe1 Nd4 18. Bxf4 Nxc2 19. Bxd6 Rd8 20. Bc7 Rf8', meta: 'Ivanchuk–Kasparov 2001 [B85]' },
  { name: 'Taktyka: Ivanchuk–Kasparov', level: 1, goal: 'tac', mn: 0, fen: 'r4k2/5ppp/p7/1b1P4/8/R4B2/1P4PP/6K1 w - - 1 24', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Ivanchuk–Kasparov 2001 [B85].', sol: 'd6 (+7.5 dla białych)', accept: ['d5d6'], pv: '24. d6 f6 25. Bxa8 f5', meta: 'Ivanchuk–Kasparov 2001 [B85]' },
  { name: 'Taktyka: Morozevich–Adams', level: 1, goal: 'tac', mn: 0, fen: 'r1bqr1k1/ppp1npp1/7p/b2P4/3PQ3/BB6/P4PPP/RN3RK1 w - - 1 16', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Morozevich–Adams 2001 [C52].', sol: 'Bc2 (+3.3 dla białych)', accept: ['b3c2'], pv: '16. Bc2 Qxd5 17. Qh7+ Kf8', meta: 'Morozevich–Adams 2001 [C52]' },
  { name: 'Taktyka: Morozevich–Adams', level: 1, goal: 'tac', mn: 0, fen: 'r3r1k1/1bp2pp1/7p/p2PNn2/3P4/1Bb3Pq/3Q1P1P/4RRK1 w - - 0 27', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Morozevich–Adams 2001 [C52].', sol: 'Qxc3 (jedyny dobry ruch – ratuje pozycję)', accept: ['d2c3'], pv: '27. Qxc3 Nd6 28. Qc2 a4 29. Bxa4 Bxd5', meta: 'Morozevich–Adams 2001 [C52]' },
  { name: 'Taktyka: Kramnik–Tiviakov', level: 1, goal: 'tac', mn: 0, fen: 'r5k1/p2n1pp1/1p1q2b1/n1pP3p/2P1r2P/P1B1PQ2/6P1/RB3RK1 w - - 0 23', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Kramnik–Tiviakov 2001 [E59].', sol: 'Bxe4 (+1.1 dla białych)', accept: ['b1e4'], pv: '23. Bxe4 Nxc4 24. Qf4 Qxf4 25. Rxf4 Nxe3 26. Bf3 Nc2', meta: 'Kramnik–Tiviakov 2001 [E59]' },
  { name: 'Taktyka: Kramnik–Tiviakov', level: 1, goal: 'tac', mn: 0, fen: 'r5k1/p2n1pp1/1p4b1/2pP3p/2n1Bq1P/P1B1P3/6P1/R4RK1 w - - 0 25', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Kramnik–Tiviakov 2001 [E59].', sol: 'Rxf4 (+0.6 dla białych)', accept: ['f1f4'], pv: '25. Rxf4 Nxe3 26. Bf3 Nc2 27. Ra2 Re8 28. Kf2 Ne3', meta: 'Kramnik–Tiviakov 2001 [E59]' },
  { name: 'Taktyka: Shirov–Piket', level: 1, goal: 'tac', mn: 0, fen: 'r1q2r1k/pp1n1ppp/2p2n2/2PpN1B1/3P1P1Q/2b5/PP4PP/R3R1K1 w - - 0 19', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Shirov–Piket 2001 [C42].', sol: 'bxc3 (jedyny dobry ruch – ratuje pozycję)', accept: ['b2c3'], pv: '19. bxc3 Ne4 20. Be7 Nxe5 21. fxe5 Re8 22. c4 Qe6', meta: 'Shirov–Piket 2001 [C42]' },
  { name: 'Taktyka: Shirov–Piket', level: 1, goal: 'tac', mn: 0, fen: 'r1q2r2/pp3Npk/2p2n1p/2Pp3Q/3P1P2/2P1R3/P5PP/R5K1 w - - 1 24', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Shirov–Piket 2001 [C42].', sol: 'Ng5+ (+1.8 dla białych)', accept: ['f7g5'], pv: '24. Ng5+ Kg8 25. Qg6 hxg5 26. Re7 Ne8 27. Rae1 b6', meta: 'Shirov–Piket 2001 [C42]' },
  { name: 'Taktyka: Shirov–Piket', level: 2, goal: 'tac', mn: 0, fen: 'r1q2rk1/pp4p1/2p2nQ1/2Pp2p1/3P1P2/2P1R3/P5PP/R5K1 w - - 0 26', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Shirov–Piket 2001 [C42].', sol: 'Re7 (+0.5 dla białych)', accept: ['e3e7'], pv: '26. Re7 Ne8 27. Rae1 Qg4 28. g3 Rxf4 29. Rxe8+ Rxe8', meta: 'Shirov–Piket 2001 [C42]' },
  { name: 'Taktyka: Topalov–Van Wely', level: 3, goal: 'tac', mn: 0, fen: 'r3k2r/5p2/pQ2p2p/4qp2/4b2P/6R1/P3BPP1/3R2K1 w kq - 0 23', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Topalov–Van Wely 2001 [D39].', sol: 'Rb3 (+4.2 dla białych)', accept: ['g3b3'], pv: '23. Rb3 Kf8 24. Re3 f4 25. Qb4+ Kg7 26. Rxe4', meta: 'Topalov–Van Wely 2001 [D39]' },
  { name: 'Taktyka: Topalov–Van Wely', level: 2, goal: 'tac', mn: 0, fen: 'r3k2r/5p2/p3p2p/4q3/1Q2bp1P/6R1/P3BPP1/3R2K1 w kq - 0 24', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Topalov–Van Wely 2001 [D39].', sol: 'Bf3 (+3.7 dla białych)', accept: ['e2f3'], pv: '24. Bf3 fxg3 25. Bxe4 Qb5 26. Qxb5+ axb5', meta: 'Topalov–Van Wely 2001 [D39]' },
  { name: 'Taktyka: Topalov–Van Wely', level: 2, goal: 'tac', mn: 0, fen: '1r2k2r/5p2/4p2p/p3q3/4bpRP/Q7/P3BPP1/3R2K1 w k - 0 26', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Topalov–Van Wely 2001 [D39].', sol: 'Bc4 (+6.0 dla białych)', accept: ['e2c4'], pv: '26. Bc4 f3 27. gxf3', meta: 'Topalov–Van Wely 2001 [D39]' },
  { name: 'Taktyka: Van Wely–Leko', level: 3, goal: 'tac', mn: 0, fen: 'r2q1rk1/pp2npbp/1np3p1/3Pp3/4P3/2N2QPP/PP3PB1/R1B2RK1 w - - 0 14', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Van Wely–Leko 2001 [D76].', sol: 'd6 (+3.3 dla białych)', accept: ['d5d6'], pv: '14. d6 f5 15. dxe7 Qxe7 16. exf5 gxf5', meta: 'Van Wely–Leko 2001 [D76]' },
  { name: 'Taktyka: Van Wely–Leko', level: 1, goal: 'tac', mn: 0, fen: '1r2r1k1/pp3pbp/3P2p1/8/1B1q4/5BPP/PP3P2/2RR2K1 w - - 0 25', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Van Wely–Leko 2001 [D76].', sol: 'Rxd4 (+2.6 dla białych)', accept: ['d1d4'], pv: '25. Rxd4 Bxd4 26. d7 Red8 27. Bd6 Ra8 28. Rc7 Bf6', meta: 'Van Wely–Leko 2001 [D76]' },
  { name: 'Taktyka: Van Wely–Leko', level: 3, goal: 'tac', mn: 0, fen: '1r2r1k1/pp3p1p/3P2p1/8/1B1b4/5BPP/PP3P2/2R3K1 w - - 0 26', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Van Wely–Leko 2001 [D76].', sol: 'd7 (+2.4 dla białych)', accept: ['d6d7'], pv: '26. d7 Red8 27. Bd6 Ra8 28. Rc7 Kg7 29. Rxb7 Bb6', meta: 'Van Wely–Leko 2001 [D76]' },
  { name: 'Taktyka: Piket–Fedorov', level: 2, goal: 'tac', mn: 0, fen: 'r4q1k/1ppbn1bp/p2p3r/P2PppBB/2P5/2N4Q/1P3PPP/R4RK1 w - - 10 21', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Piket–Fedorov 2001 [E70].', sol: 'Qh4 (+4.7 dla białych)', accept: ['h3h4'], pv: '21. Qh4 e4 22. Bxe7', meta: 'Piket–Fedorov 2001 [E70]' },
  { name: 'Taktyka: Piket–Fedorov', level: 1, goal: 'tac', mn: 0, fen: 'r4q1k/1ppbn1bp/p2p4/P2PppBr/2P2P2/2N4Q/1P4PP/R4RK1 w - - 0 22', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Piket–Fedorov 2001 [E70].', sol: 'Qxh5 (+2.1 dla białych)', accept: ['h3h5'], pv: '22. Qxh5 e4 23. Rae1 Ng8 24. Qh3 Qf7 25. Nd1 Nf6', meta: 'Piket–Fedorov 2001 [E70]' },
  { name: 'Taktyka: Kasparov–Kramnik', level: 1, goal: 'tac', mn: 0, fen: 'r1b1k2r/ppp2ppp/2p5/4Pnb1/8/2N2N1P/PPP2PP1/R4RK1 w - - 0 12', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Kasparov–Kramnik 2001 [C67].', sol: 'Nxg5 (+0.6 dla białych)', accept: ['f3g5'], pv: '12. Nxg5 h5 13. Rad1 Ke7 14. Nce4 b6 15. Rfe1 Be6', meta: 'Kasparov–Kramnik 2001 [C67]' },
  { name: 'Taktyka: Kasparov–Kramnik', level: 2, goal: 'tac', mn: 0, fen: '7r/p1p2pp1/1pp1k3/4P3/1PP2P1p/3r3P/P4KP1/3R4 w - - 0 30', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Kasparov–Kramnik 2001 [C67].', sol: 'Rxd3 (jedyny dobry ruch – ratuje pozycję)', accept: ['d1d3'], pv: '30. Rxd3 f6 31. exf6 gxf6 32. Ra3 Ra8 33. Kf3 Rg8', meta: 'Kasparov–Kramnik 2001 [C67]' },
  { name: 'Taktyka: Timman–Shirov', level: 1, goal: 'tac', mn: 0, fen: 'r3r1k1/5pbp/6p1/pb6/2P1pP2/B2nP3/PP2K1PP/R1N4R w - - 0 21', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Timman–Shirov 2001 [D03].', sol: 'cxb5 (jedyny dobry ruch – ratuje pozycję)', accept: ['c4b5'], pv: '21. cxb5 Rec8 22. Rd1 Rc2+ 23. Kf1 Rf2+ 24. Kg1 Nxb2', meta: 'Timman–Shirov 2001 [D03]' },
  { name: 'Taktyka: Timman–Shirov', level: 3, goal: 'tac', mn: 0, fen: '2r3k1/5p1p/6p1/pP6/P3pP2/2b1P3/1r4PP/R1N1RK2 w - - 3 29', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Timman–Shirov 2001 [D03].', sol: 'Rd1 (jedyny dobry ruch – ratuje pozycję)', accept: ['e1d1'], pv: '29. Rd1 Bb4 30. b6 Bc5 31. Ra2 Rxa2 32. b7 Rb8', meta: 'Timman–Shirov 2001 [D03]' },
  { name: 'Taktyka: Leko–Adams', level: 1, goal: 'tac', mn: 0, fen: 'r1bq1rk1/2p1bppp/p7/1p1nn3/8/1BP5/PP1P1PPP/RNBQR1K1 w - - 0 11', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Leko–Adams 2001 [C89].', sol: 'Rxe5 (+0.7 dla białych)', accept: ['e1e5'], pv: '11. Rxe5 Nf6 12. d4 Bb7 13. Bg5 h6 14. Bxf6 Bxf6', meta: 'Leko–Adams 2001 [C89]' },
  { name: 'Taktyka: Leko–Adams', level: 1, goal: 'tac', mn: 0, fen: '3r4/5pkp/p2b4/1p1p2p1/3P2b1/1PP1r1P1/PB1N1PKP/R7 w - - 0 24', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Leko–Adams 2001 [C89].', sol: 'fxe3 (jedyny dobry ruch – ratuje pozycję)', accept: ['f2e3'], pv: '24. fxe3 Re8 25. Kf2 Re6 26. a4 Rf6+ 27. Kg1 Re6', meta: 'Leko–Adams 2001 [C89]' },
  { name: 'Taktyka: Piket–Timman', level: 3, goal: 'tac', mn: 0, fen: 'rnbqkb1r/pp3ppp/5n2/4p3/2Pp4/5NP1/PP2PPBP/RNBQK2R w KQkq - 0 8', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Piket–Timman 2001 [E01].', sol: 'Qa4+ (+1.7 dla białych)', accept: ['d1a4'], pv: '8. Qa4+ Nc6 9. Nxe5', meta: 'Piket–Timman 2001 [E01]' },
  { name: 'Taktyka: Topalov–Tiviakov', level: 2, goal: 'tac', mn: 0, fen: 'rn1q1rk1/p1ppbppp/1p2p3/8/2PP3N/6P1/PP2PPbP/R1BQR1K1 w - - 0 12', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Topalov–Tiviakov 2001 [A15].', sol: 'Nxg2 (+0.6 dla białych)', accept: ['h4g2'], pv: '12. Nxg2 d5 13. cxd5 exd5 14. Nf4 Re8 15. Qd3 Nc6', meta: 'Topalov–Tiviakov 2001 [A15]' },
  { name: 'Taktyka: Shirov–Van Wely', level: 2, goal: 'tac', mn: 0, fen: '2kr3r/pp4p1/1qb1p1n1/1P1p4/3Np1P1/3B1Nb1/P3QP2/2R2RK1 w - - 0 22', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Shirov–Van Wely 2001 [C02].', sol: 'fxg3 (+1.5 dla białych)', accept: ['f2g3'], pv: '22. fxg3 Ne5 23. Nxe5 Qxd4+ 24. Kg2 exd3 25. Nxd3 Qe4+', meta: 'Shirov–Van Wely 2001 [C02]' },
  { name: 'Taktyka: Shirov–Van Wely', level: 1, goal: 'tac', mn: 0, fen: '2kr3r/pp4p1/1qb1p1n1/1P1p4/3N2P1/3B1pP1/P3Q3/2R2RK1 w - - 0 23', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Shirov–Van Wely 2001 [C02].', sol: 'Qe3 (+3.9 dla białych)', accept: ['e2e3'], pv: '23. Qe3 e5 24. bxc6 Qxd4 25. Qxd4 exd4 26. Bxg6 Rd6', meta: 'Shirov–Van Wely 2001 [C02]' },
  { name: 'Taktyka: Shirov–Van Wely', level: 1, goal: 'tac', mn: 0, fen: '2kr3r/ppq3p1/2b1p1n1/1P1p4/3N2P1/3BQpP1/P7/2R2RK1 w - - 2 24', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Shirov–Van Wely 2001 [C02].', sol: 'Rxf3 (+6.2 dla białych)', accept: ['f1f3'], pv: '24. Rxf3 Ne5 25. bxc6 Kb8 26. Nxe6 Nxf3+ 27. Qxf3 Qb6+', meta: 'Shirov–Van Wely 2001 [C02]' },
  { name: 'Taktyka: Kramnik–Anand', level: 1, goal: 'tac', mn: 0, fen: '2r3k1/r4pp1/1p2n1np/pP2P2B/2q1P3/R5Q1/1B4PP/5R1K w - - 0 33', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Kramnik–Anand 2001 [E55].', sol: 'Rc1 (+5.7 dla białych)', accept: ['f1c1'], pv: '33. Rc1 Qxb5 34. Rxc8+ Kh7', meta: 'Kramnik–Anand 2001 [E55]' },
  { name: 'Taktyka: Fedorov–Ivanchuk', level: 1, goal: 'tac', mn: 0, fen: 'r4rk1/p1p2p1p/8/2p2q2/2bPp2P/2P3p1/PP2QBP1/R2K1R2 w - - 0 22', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Fedorov–Ivanchuk 2001 [C39].', sol: 'Qxc4 (jedyny dobry ruch – ratuje pozycję)', accept: ['e2c4'], pv: '22. Qxc4 gxf2 23. Qe2 cxd4 24. Rxf2 Qg6 25. h5 Qg3', meta: 'Fedorov–Ivanchuk 2001 [C39]' },
  { name: 'Taktyka: Fedorov–Ivanchuk', level: 2, goal: 'tac', mn: 0, fen: '5r1k/p1p2p1p/3q4/5R2/6QP/2P1K3/PP1p2P1/8 w - - 0 32', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Fedorov–Ivanchuk 2001 [C39].', sol: 'Rf1 (jedyny dobry ruch – ratuje pozycję)', accept: ['f5f1'], pv: '32. Rf1 Re8+ 33. Kf2 Qf6+ 34. Kg3 Qxf1 35. Qd4+ f6', meta: 'Fedorov–Ivanchuk 2001 [C39]' },
  { name: 'Taktyka: Kasparov–Topalov', level: 2, goal: 'tac', mn: 0, fen: 'r3kb1r/1b3pp1/p2ppn1p/q7/np1NP1PP/PP2BP2/2PQ4/2KR1B1R w kq - 0 15', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Kasparov–Topalov 2001 [B80].', sol: 'axb4 (+0.5 dla białych)', accept: ['a3b4'], pv: '15. axb4 Qc7 16. bxa4 d5 17. Bf4 Qb6 18. Be5 Qxb4', meta: 'Kasparov–Topalov 2001 [B80]' },
  { name: 'Taktyka: Adams–Shirov', level: 2, goal: 'tac', mn: 0, fen: '2r1k2b/1p2pp2/p1qpb3/3N2p1/2n1P3/1Q4B1/PPP1BPP1/1K1R4 w - - 2 21', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Adams–Shirov 2001 [B90].', sol: 'Rh1 (+3.1 dla białych)', accept: ['d1h1'], pv: '21. Rh1 Bxb2 22. Bxc4 Bxd5 23. exd5 Qxc4 24. Qxc4 Rxc4', meta: 'Adams–Shirov 2001 [B90]' },
  { name: 'Taktyka: Adams–Shirov', level: 1, goal: 'tac', mn: 0, fen: '2r5/4kp2/p2pp2R/8/1p2PPpb/1P6/P1PK2P1/8 w - - 0 34', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Adams–Shirov 2001 [B90].', sol: 'Rxh4 (jedyny dobry ruch – ratuje pozycję)', accept: ['h6h4'], pv: '34. Rxh4 f5 35. Rh7+ Kf6 36. Rh6+ Ke7 37. Rh7+', meta: 'Adams–Shirov 2001 [B90]' },
  { name: 'Taktyka: Ivanchuk–Kramnik', level: 1, goal: 'tac', mn: 0, fen: 'r1bq1rk1/p1p2ppp/2p2n2/2bpN3/4P3/2PP4/PP3PPP/RNBQK2R w KQ - 0 8', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Ivanchuk–Kramnik 2001 [C65].', sol: 'Nxc6 (+4.0 dla białych)', accept: ['e5c6'], pv: '8. Nxc6 Bxf2+ 9. Kxf2 Nxe4+ 10. dxe4 Qf6+ 11. Ke1', meta: 'Ivanchuk–Kramnik 2001 [C65]' },
  { name: 'Taktyka: Ivanchuk–Kramnik', level: 3, goal: 'tac', mn: 0, fen: 'r1bqr1k1/p1p2ppp/2p2n2/2bpN1B1/4P3/2PP4/PP3PPP/RN1QK2R w KQ - 2 9', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Ivanchuk–Kramnik 2001 [C65].', sol: 'd4 (+0.5 dla białych)', accept: ['d3d4'], pv: '9. d4 Bd6 10. Nd2 Bxe5 11. dxe5 Rxe5 12. f4', meta: 'Ivanchuk–Kramnik 2001 [C65]' },
  { name: 'Taktyka: Ivanchuk–Kramnik', level: 1, goal: 'tac', mn: 0, fen: 'r1bqr1k1/p1p2ppp/1b3n2/2p1N1B1/3PpP2/2P5/PP1N2PP/R2QK2R w KQ - 0 12', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Ivanchuk–Kramnik 2001 [C65].', sol: 'Nc6 (+4.9 dla białych)', accept: ['e5c6'], pv: '12. Nc6 e3 13. Nxd8', meta: 'Ivanchuk–Kramnik 2001 [C65]' },
  { name: 'Taktyka: Van Wely–Piket', level: 2, goal: 'tac', mn: 0, fen: 'rnbqk2r/1pp2ppp/4pn2/p7/1bpP4/5NP1/PP1BPPBP/RN1QK2R w KQkq - 0 7', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Van Wely–Piket 2001 [E11].', sol: 'Qa4+ (+3.4 dla białych)', accept: ['d1a4'], pv: '7. Qa4+ c6 8. Bxb4', meta: 'Van Wely–Piket 2001 [E11]' },
  { name: 'Taktyka: Van Wely–Piket', level: 1, goal: 'tac', mn: 0, fen: 'rr4k1/2p2ppp/2n2n2/pp1p4/3P2P1/2PbP2P/P2BNPB1/R3K2R w KQ - 2 17', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Van Wely–Piket 2001 [E11].', sol: 'Nc1 (+4.4 dla białych)', accept: ['e2c1'], pv: '17. Nc1 h6 18. Nxd3', meta: 'Van Wely–Piket 2001 [E11]' },
  { name: 'Taktyka: Van Wely–Piket', level: 1, goal: 'tac', mn: 0, fen: 'rr4k1/2p2ppp/2n2n2/p2p4/3P2P1/2PbPP1P/Pp1B1KB1/R1N4R w - - 0 20', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Van Wely–Piket 2001 [E11].', sol: 'Nxd3 (+0.5 dla białych)', accept: ['c1d3'], pv: '20. Nxd3 bxa1=Q 21. Rxa1 Ne7 22. e4 c6 23. Rc1 Nd7', meta: 'Van Wely–Piket 2001 [E11]' },
  { name: 'Taktyka: Shirov–Tiviakov', level: 1, goal: 'tac', mn: 0, fen: '6k1/p1p2ppp/1p6/1q6/P3r3/2B2P2/3R3P/K7 w - - 0 30', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Shirov–Tiviakov 2001 [E20].', sol: 'axb5 (+2.2 dla białych)', accept: ['a4b5'], pv: '30. axb5 Ra4+ 31. Kb2 Kf8 32. Kb3 Rf4 33. Ra2 Rxf3', meta: 'Shirov–Tiviakov 2001 [E20]' },
  { name: 'Taktyka: Leko–Kasparov', level: 2, goal: 'tac', mn: 0, fen: 'r2qr1k1/1p1n1ppp/2pb1n2/p3p2b/2P1P3/PP3NP1/1BQN1PBP/R4RK1 w - - 1 14', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Leko–Kasparov 2001 [A12].', sol: 'Qd3 (+2.6 dla białych)', accept: ['c2d3'], pv: '14. Qd3 Bxf3 15. Nxf3 a4 16. Qxd6', meta: 'Leko–Kasparov 2001 [A12]' },
  { name: 'Taktyka: Leko–Kasparov', level: 1, goal: 'tac', mn: 0, fen: 'r3r1k1/1p3ppp/2p2n2/2q4b/1pP1n2N/P4NP1/2Q2PBP/1R3RK1 w - - 0 22', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Leko–Kasparov 2001 [A12].', sol: 'axb4 (jedyny dobry ruch – ratuje pozycję)', accept: ['a3b4'], pv: '22. axb4 Qa7 23. Rfe1 Bg4 24. h3 Bd7 25. g4 h6', meta: 'Leko–Kasparov 2001 [A12]' },
  { name: 'Taktyka: Fedorov–Kramnik', level: 1, goal: 'tac', mn: 0, fen: '3r1bk1/pb3qp1/1p2Q2p/2pn4/P2B4/1PP3NP/5PP1/R3N1K1 w - - 2 25', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Fedorov–Kramnik 2001 [C24].', sol: 'Qxf7+ (jedyny dobry ruch – ratuje pozycję)', accept: ['e6f7'], pv: '25. Qxf7+ Kxf7 26. Be5 Ne7 27. c4 Nc6 28. Bc3 Na5', meta: 'Fedorov–Kramnik 2001 [C24]' },
  { name: 'Taktyka: Fedorov–Kramnik', level: 3, goal: 'tac', mn: 0, fen: '3r1b2/pb3kp1/1p5p/2pn4/P2B4/1PP3NP/5PP1/R3N1K1 w - - 0 26', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Fedorov–Kramnik 2001 [C24].', sol: 'Be5 (jedyny dobry ruch – ratuje pozycję)', accept: ['d4e5'], pv: '26. Be5 Ne7 27. a5 bxa5 28. c4 Nc6 29. Bc3 g6', meta: 'Fedorov–Kramnik 2001 [C24]' },
  { name: 'Taktyka: Topalov–Anand', level: 2, goal: 'tac', mn: 0, fen: 'r1bqk2r/2p2ppp/p1n2n2/1pb1p3/3P4/2P2p2/PPBN1PPP/R1BQ1RK1 w kq - 0 10', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Topalov–Anand 2001 [C78].', sol: 'Qxf3 (+1.3 dla białych)', accept: ['d1f3'], pv: '10. Qxf3 Be7 11. Qxc6+ Bd7 12. Qf3 exd4 13. Ne4 O-O', meta: 'Topalov–Anand 2001 [C78]' },
  { name: 'Taktyka: Topalov–Anand', level: 3, goal: 'tac', mn: 0, fen: 'r1bqk2r/2p1bppp/p1n2n2/1p2p3/3P4/2P2Q2/PPBN1PPP/R1B2RK1 w kq - 1 11', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Topalov–Anand 2001 [C78].', sol: 'Qxc6+ (+0.8 dla białych)', accept: ['f3c6'], pv: '11. Qxc6+ Bd7 12. Qf3 exd4 13. Ne4 O-O 14. cxd4 Nxe4', meta: 'Topalov–Anand 2001 [C78]' },
  { name: 'Taktyka: Topalov–Anand', level: 1, goal: 'tac', mn: 0, fen: '5rk1/5ppp/p3b3/1pp5/3b4/4Bq2/PP3PPP/R2R2K1 w - - 0 20', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Topalov–Anand 2001 [C78].', sol: 'gxf3 (jedyny dobry ruch – ratuje pozycję)', accept: ['g2f3'], pv: '20. gxf3 Bxb2 21. Bxc5 Ra8 22. Rab1 Bf6 23. a3 Ba2', meta: 'Topalov–Anand 2001 [C78]' },
  { name: 'Taktyka: Timman–Van Wely', level: 1, goal: 'tac', mn: 0, fen: 'rn1q1rk1/1p2bppp/p2p1n2/4p3/2b1P3/2NQBN2/PPP2PPP/2KR3R w - - 0 11', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Timman–Van Wely 2001 [B90].', sol: 'Qxc4 (jedyny dobry ruch – ratuje pozycję)', accept: ['d3c4'], pv: '11. Qxc4 b5 12. Qd3 Nbd7 13. a3 Rb8 14. h3 Qc7', meta: 'Timman–Van Wely 2001 [B90]' },
  { name: 'Taktyka: Timman–Van Wely', level: 1, goal: 'tac', mn: 0, fen: '4Qbk1/2r2ppp/p7/qp2p3/4P1P1/1Pp1N3/P1P3PP/1K5R w - - 7 28', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Timman–Van Wely 2001 [B90].', sol: 'Rd1 (+11.1 dla białych)', accept: ['h1d1'], pv: '28. Rd1 Ra7 29. Rd8 h5 30. Qxf8+ Kh7 31. gxh5', meta: 'Timman–Van Wely 2001 [B90]' },
  { name: 'Taktyka: Timman–Van Wely', level: 1, goal: 'tac', mn: 0, fen: '5bk1/2r2ppp/p7/1p2Q3/4P1P1/qPp1N3/P1P3PP/1K5R w - - 1 29', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Timman–Van Wely 2001 [B90].', sol: 'Nd1 (+1.1 dla białych)', accept: ['e3d1'], pv: '29. Nd1 Qe7 30. Qxe7 Rxe7 31. Re1 b4 32. Nf2 Re6', meta: 'Timman–Van Wely 2001 [B90]' },
  { name: 'Taktyka: Piket–Adams', level: 2, goal: 'tac', mn: 0, fen: 'r2q1rk1/1b1n1ppp/1p2p3/8/1bB1n3/4P1N1/1BQ2PPP/2RR2K1 w - - 0 18', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Piket–Adams 2001 [E46].', sol: 'Nxe4 (jedyny dobry ruch – ratuje pozycję)', accept: ['g3e4'], pv: '18. Nxe4 Qe7 19. Bb5 Rfc8 20. Qd3 Rxc1 21. Rxc1 Nf8', meta: 'Piket–Adams 2001 [E46]' },
  { name: 'Taktyka: Piket–Adams', level: 1, goal: 'tac', mn: 0, fen: 'r4rk1/1b1nqppp/1p2p3/8/1bB1N3/4P3/1BQ2PPP/2RR2K1 w - - 1 19', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Piket–Adams 2001 [E46].', sol: 'Rxd7 (+3.5 dla białych)', accept: ['d1d7'], pv: '19. Rxd7 Bxe4 20. Rxe7 Bxc2 21. Rb7', meta: 'Piket–Adams 2001 [E46]' },
  { name: 'Taktyka: Piket–Adams', level: 1, goal: 'tac', mn: 0, fen: 'r2r2k1/1b1nqppp/1p2p3/8/1bB1N2P/4P3/1BQ2PP1/2RR2K1 w - - 1 20', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Piket–Adams 2001 [E46].', sol: 'Rxd7 (+4.0 dla białych)', accept: ['d1d7'], pv: '20. Rxd7 Qxd7 21. Ng5 Ra4 22. Qxh7+ Kf8', meta: 'Piket–Adams 2001 [E46]' },
  { name: 'Taktyka: Morozevich–Ivanchuk', level: 1, goal: 'tac', mn: 0, fen: '4r3/3nkp2/pp1b2pp/1p1Pp3/1P2NP2/P5P1/1B1r3P/4R1K1 w - - 0 30', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Morozevich–Ivanchuk 2001 [C26].', sol: 'Nxd2 (jedyny dobry ruch – ratuje pozycję)', accept: ['e4d2'], pv: '30. Nxd2 Kd8 31. fxe5 Bxe5 32. Bc1 Bd4+ 33. Kf1 Rxe1+', meta: 'Morozevich–Ivanchuk 2001 [C26]' },
  { name: 'Taktyka: Nijboer–Gulko', level: 2, goal: 'tac', mn: 0, fen: 'r1b2rk1/pp2bpp1/3ppn1p/q7/3QPP1B/2N5/PPP3PP/2KR1B1R w - - 1 12', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Nijboer–Gulko 2001 [B65].', sol: 'b4 (+8.2 dla białych)', accept: ['b2b4'], pv: '12. b4 g5 13. bxa5 gxh4', meta: 'Nijboer–Gulko 2001 [B65]' },
  { name: 'Taktyka: Gurevich–Nijboer', level: 1, goal: 'tac', mn: 0, fen: 'q4rk1/rb1nbpp1/pp1p3p/4p3/2P1n3/2N1PNBP/PPB1QPP1/R2R2K1 w - - 2 17', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Gurevich–Nijboer 2001 [A45].', sol: 'Qd3 (+5.6 dla białych)', accept: ['e2d3'], pv: '17. Qd3 a5 18. Nxe4 Bxe4 19. Qxe4 Qxe4 20. Bxe4', meta: 'Gurevich–Nijboer 2001 [A45]' },
  { name: 'Taktyka: Gurevich–Nijboer', level: 3, goal: 'tac', mn: 0, fen: '5r1k/6pn/1pbb2qp/1P2pp2/2P5/2N1PP1P/4QBP1/3R2K1 w - - 0 34', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Gurevich–Nijboer 2001 [A45].', sol: 'bxc6 (+2.3 dla białych)', accept: ['b5c6'], pv: '34. bxc6 Bc7 35. e4 f4 36. Rb1 Qxc6 37. Nd5 Nf6', meta: 'Gurevich–Nijboer 2001 [A45]' },
  { name: 'Taktyka: Luther–Gulko', level: 3, goal: 'tac', mn: 0, fen: 'r4rk1/pp3pbp/3p2P1/3N3n/2q1P2Q/P3B2R/1P4PP/n5K1 w - - 0 21', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Luther–Gulko 2001 [B09].', sol: 'Ne7+ (+1.4 dla białych)', accept: ['d5e7'], pv: '21. Ne7+ Kh8 22. Qxh5 Qf1+ 23. Kxf1 fxg6+ 24. Qf3 Rxf3+', meta: 'Luther–Gulko 2001 [B09]' },
  { name: 'Taktyka: Luther–Gulko', level: 1, goal: 'tac', mn: 0, fen: 'r4r1k/pp2Npbp/3p2P1/7n/2q1P2Q/P3B2R/1P4PP/n5K1 w - - 2 22', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Luther–Gulko 2001 [B09].', sol: 'Qxh5 (+1.4 dla białych)', accept: ['h4h5'], pv: '22. Qxh5 Qf1+ 23. Kxf1 fxg6+ 24. Qf3 Rxf3+ 25. gxf3 Bxb2', meta: 'Luther–Gulko 2001 [B09]' },
  { name: 'Taktyka: Luther–Gulko', level: 2, goal: 'tac', mn: 0, fen: '4r2k/pp5p/3p3B/4P3/3b1P2/P5R1/7P/5K2 w - - 1 34', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Luther–Gulko 2001 [B09].', sol: 'exd6 (+5.0 dla białych)', accept: ['e5d6'], pv: '34. exd6 Bf6 35. d7 Re6 36. Kf2', meta: 'Luther–Gulko 2001 [B09]' },
  { name: 'Taktyka: Gurevich–Luther', level: 1, goal: 'tac', mn: 0, fen: '2rqr1k1/pp1b1ppp/5n2/2P5/P1p5/B1P1PN2/2Q2PPP/R3K2R w KQ - 0 16', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Gurevich–Luther 2001 [D31].', sol: 'Nd2 (+7.7 dla białych)', accept: ['f3d2'], pv: '16. Nd2 Qa5', meta: 'Gurevich–Luther 2001 [D31]' },
  { name: 'Taktyka: Gurevich–Luther', level: 2, goal: 'tac', mn: 0, fen: '2rqr1k1/pp3ppp/2b5/2P5/P1pN2n1/B1P1P3/2Q2PPP/R4RK1 w - - 4 18', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Gurevich–Luther 2001 [D31].', sol: 'Rfb1 (+3.3 dla białych)', accept: ['f1b1'], pv: '18. Rfb1 Nxe3 19. fxe3 Rxe3 20. Nxc6 bxc6', meta: 'Gurevich–Luther 2001 [D31]' },
  { name: 'Taktyka: Gurevich–Luther', level: 1, goal: 'tac', mn: 0, fen: '4r1k1/2N2p1p/6pB/5P2/1pp1r3/2P2q1P/5R1K/8 w - - 0 35', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Gurevich–Luther 2001 [D31].', sol: 'Rxf3 (jedyny dobry ruch – ratuje pozycję)', accept: ['f2f3'], pv: '35. Rxf3 Rd8 36. fxg6 hxg6 37. cxb4 Rd7 38. Na6 Rd3', meta: 'Gurevich–Luther 2001 [D31]' },
  { name: 'Taktyka: Ponomariov–Korchnoi', level: 1, goal: 'tac', mn: 0, fen: '4r1k1/6pp/4br2/pq1p4/3N4/2P5/5PPP/R3R1K1 w - - 0 25', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Ponomariov–Korchnoi 2001 [C83].', sol: 'Nxb5 (+0.8 dla białych)', accept: ['d4b5'], pv: '25. Nxb5 Bd7 26. Rxe8+ Bxe8 27. Nc7 Bc6 28. Rxa5 Rd6', meta: 'Ponomariov–Korchnoi 2001 [C83]' },
  { name: 'Taktyka: Ponomariov–Korchnoi', level: 1, goal: 'tac', mn: 0, fen: '6k1/6pp/2b5/R7/8/5P2/1r2NKPP/8 w - - 8 35', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Ponomariov–Korchnoi 2001 [C83].', sol: 'Ra6 (+4.0 dla białych)', accept: ['a5a6'], pv: '35. Ra6 h5 36. Rxc6', meta: 'Ponomariov–Korchnoi 2001 [C83]' },
  { name: 'Taktyka: Korchnoi–Ponomariov', level: 2, goal: 'tac', mn: 0, fen: '2rr2k1/1q2bpp1/ppbppnnp/8/1PP1P3/PNN3BP/4QPP1/2R1RBK1 w - - 0 21', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Korchnoi–Ponomariov 2001 [A33].', sol: 'b5 (+3.8 dla białych)', accept: ['b4b5'], pv: '21. b5 Bxe4 22. Nxe4 Nxe4 23. Qxe4', meta: 'Korchnoi–Ponomariov 2001 [A33]' },
  { name: 'Taktyka: Korchnoi–Ponomariov', level: 1, goal: 'tac', mn: 0, fen: '1qr1rbk1/1b3pp1/pn1pp2p/4n3/1PP1P3/PN2QP1P/5BP1/1R1R1BK1 w - - 0 28', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Korchnoi–Ponomariov 2001 [A33].', sol: 'Qxb6 (+1.7 dla białych)', accept: ['e3b6'], pv: '28. Qxb6 Nxc4 29. Bxc4 Rxc4 30. Na5 Rc7 31. b5 axb5', meta: 'Korchnoi–Ponomariov 2001 [A33]' },
  { name: 'Taktyka: Korchnoi–Ponomariov', level: 1, goal: 'tac', mn: 0, fen: '1qr1rbk1/1b3pp1/pQ1pp2p/8/1Pn1P3/PN3P1P/5BP1/1R1R1BK1 w - - 0 29', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Korchnoi–Ponomariov 2001 [A33].', sol: 'Bxc4 (+2.8 dla białych)', accept: ['f1c4'], pv: '29. Bxc4 Rxc4 30. Na5 Rc7 31. b5 Qc8 32. Nxb7 Rxb7', meta: 'Korchnoi–Ponomariov 2001 [A33]' },
  { name: 'Taktyka: Ponomariov–Korchnoi', level: 1, goal: 'tac', mn: 0, fen: 'r5k1/2pqb1pp/p1n1br2/1p1p4/8/1P2BN1P/PP2NPP1/2RQ1RK1 w - - 0 16', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Ponomariov–Korchnoi 2001 [C80].', sol: 'Rxc6 (+6.2 dla białych)', accept: ['c1c6'], pv: '16. Rxc6 Qxc6', meta: 'Ponomariov–Korchnoi 2001 [C80]' },
  { name: 'Taktyka: Ponomariov–Korchnoi', level: 3, goal: 'tac', mn: 0, fen: 'r5k1/2pqb1pp/p3br2/1p1p4/3n4/1P2BN1P/PP3PP1/2RQ1RK1 w - - 0 17', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Ponomariov–Korchnoi 2001 [C80].', sol: 'Bxd4 (+1.5 dla białych)', accept: ['e3d4'], pv: '17. Bxd4 Rh6 18. Be3 Rf6 19. Ne5 Qe8 20. Bg5 Rf5', meta: 'Ponomariov–Korchnoi 2001 [C80]' },
  { name: 'Taktyka: Ponomariov–Korchnoi', level: 3, goal: 'tac', mn: 0, fen: '4r1k1/3q1b1p/3p2p1/p2p4/1p1NrP2/1P4RP/PP1Q2PK/5R2 w - - 1 31', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Ponomariov–Korchnoi 2001 [C80].', sol: 'f5 (+4.0 dla białych)', accept: ['f4f5'], pv: '31. f5 Qe7 32. Nc6 Qh4 33. fxg6 hxg6 34. Qf2 Qh7', meta: 'Ponomariov–Korchnoi 2001 [C80]' },
  { name: 'Taktyka: Ponomariov–Korchnoi', level: 1, goal: 'tac', mn: 0, fen: '3q2k1/pp2r1pp/5p2/nP2P3/3p4/P1rb1N1P/2P1Q1P1/4RRK1 w - - 0 26', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Ponomariov–Korchnoi 2001 [B45].', sol: 'cxd3 (+1.3 dla białych)', accept: ['c2d3'], pv: '26. cxd3 Nb3 27. Qa2 f5 28. Nd2 Qd5 29. Rxf5 Rxd3', meta: 'Ponomariov–Korchnoi 2001 [B45]' },
  { name: 'Taktyka: Ponomariov–Korchnoi', level: 1, goal: 'tac', mn: 0, fen: '4q2k/pp2r2p/5p2/1P6/3p3N/PnrP3P/Q5P1/4RRK1 w - - 2 30', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Ponomariov–Korchnoi 2001 [B45].', sol: 'Rb1 (+4.0 dla białych)', accept: ['e1b1'], pv: '30. Rb1 Rxd3 31. Rxb3 Rxb3', meta: 'Ponomariov–Korchnoi 2001 [B45]' },
  { name: 'Taktyka: Korchnoi–Ponomariov', level: 1, goal: 'tac', mn: 0, fen: 'r4rk1/2Bn2pp/pp2pnp1/q2p4/P2N4/2bPP2P/5PB1/R2Q1RK1 w - - 2 22', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Korchnoi–Ponomariov 2001 [A07].', sol: 'Nc6 (+4.4 dla białych)', accept: ['d4c6'], pv: '22. Nc6 Ne8 23. Nxa5 Nxc7', meta: 'Korchnoi–Ponomariov 2001 [A07]' },
  { name: 'Taktyka: Korchnoi–Ponomariov', level: 2, goal: 'tac', mn: 0, fen: 'r4rk1/2Bn2pp/pp2pnp1/q2p4/P2b4/3PP2P/5PB1/1R1Q1RK1 w - - 0 23', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Korchnoi–Ponomariov 2001 [A07].', sol: 'exd4 (jedyny dobry ruch – ratuje pozycję)', accept: ['e3d4'], pv: '23. exd4 Rfc8 24. Bf4 Qc3 25. Qe2 Re8 26. Qe3 Qa5', meta: 'Korchnoi–Ponomariov 2001 [A07]' },
  { name: 'Taktyka: Korchnoi–Ponomariov', level: 1, goal: 'tac', mn: 0, fen: 'r4rk1/6pp/pn2pnp1/3p4/P2P4/2qP3P/5PB1/1R1Q1RK1 w - - 0 25', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Korchnoi–Ponomariov 2001 [A07].', sol: 'Rxb6 (jedyny dobry ruch – ratuje pozycję)', accept: ['b1b6'], pv: '25. Rxb6 Nh5 26. Qa1 Qc7 27. Rxe6 Nf4 28. Re5 Qf7', meta: 'Korchnoi–Ponomariov 2001 [A07]' },
  { name: 'Taktyka: Ponomariov–Korchnoi', level: 1, goal: 'tac', mn: 0, fen: 'r1b1kb1r/pp3pp1/4pn1p/8/3q3B/5N2/PPP1BPPP/R3K2R w KQkq - 0 11', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Ponomariov–Korchnoi 2001 [C10].', sol: 'Nxd4 (+0.6 dla białych)', accept: ['f3d4'], pv: '11. Nxd4 Bd7', meta: 'Ponomariov–Korchnoi 2001 [C10]' },
  { name: 'Taktyka: Ponomariov–Korchnoi', level: 1, goal: 'tac', mn: 0, fen: '4n3/3bkp2/r3p1pp/1p6/p2R4/P1N2BP1/1PP2PP1/2K5 w - - 1 26', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Ponomariov–Korchnoi 2001 [C10].', sol: 'Bg4 (+5.3 dla białych)', accept: ['f3g4'], pv: '26. Bg4 Kf8 27. Rxd7', meta: 'Ponomariov–Korchnoi 2001 [C10]' },
  { name: 'Taktyka: Ponomariov–Korchnoi', level: 2, goal: 'tac', mn: 0, fen: '8/4kp2/2bnp1p1/rp5p/pR6/P1N3P1/1PPK1PP1/5B2 w - - 0 30', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Ponomariov–Korchnoi 2001 [C10].', sol: 'Rd4 (+2.4 dla białych)', accept: ['b4d4'], pv: '30. Rd4 b4 31. axb4', meta: 'Ponomariov–Korchnoi 2001 [C10]' },
  { name: 'Taktyka: Macieja–Stefansson', level: 3, goal: 'tac', mn: 0, fen: 'r1b1kb1r/p2p2p1/1pn1p1qp/4Pp2/3P4/3B1NP1/PP3P1P/RN1QK2R w KQkq - 0 11', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Macieja–Stefansson 2001 [A46].', sol: 'Nbd2 (+2.6 dla białych)', accept: ['b1d2'], pv: '11. Nbd2 d6 12. O-O dxe5', meta: 'Macieja–Stefansson 2001 [A46]' },
  { name: 'Taktyka: Macieja–Stefansson', level: 2, goal: 'tac', mn: 0, fen: '3r2k1/pb1pb1p1/1p2p1qp/n2PPp2/QP6/P1rB1NP1/5P1P/2R2RK1 w - - 0 18', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Macieja–Stefansson 2001 [A46].', sol: 'Rxc3 (+2.1 dla białych)', accept: ['c1c3'], pv: '18. Rxc3 Qg4 19. Bb5 Bxd5 20. Bxd7 Bxf3 21. h3 Qe4', meta: 'Macieja–Stefansson 2001 [A46]' },
  { name: 'Taktyka: Macieja–Stefansson', level: 1, goal: 'tac', mn: 0, fen: '3r2k1/p3b1p1/1pnpp1qp/4Pp2/1Pb5/P1R2NP1/5P1P/3QR1K1 w - - 0 22', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Macieja–Stefansson 2001 [A46].', sol: 'Rxc4 (+2.2 dla białych)', accept: ['c3c4'], pv: '22. Rxc4 Nxe5 23. Rc7 Qf6 24. Rxa7 Nxf3+ 25. Qxf3 d5', meta: 'Macieja–Stefansson 2001 [A46]' },
  { name: 'Taktyka: Lesiege–Shabalov', level: 2, goal: 'tac', mn: 0, fen: 'r2r2k1/1p3ppp/p6q/n1Nn4/P3B3/1PR2P2/4Q1PP/2R3K1 w - - 2 29', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Lesiege–Shabalov 2001 [D16].', sol: 'Bxd5 (+2.1 dla białych)', accept: ['e4d5'], pv: '29. Bxd5 Rxd5 30. b4 Nc6 31. Nxb7 Re5 32. Qxe5 Qxc1+', meta: 'Lesiege–Shabalov 2001 [D16]' },
  { name: 'Taktyka: Lesiege–Shabalov', level: 3, goal: 'tac', mn: 0, fen: 'r5k1/1p3ppp/p6q/n1Nr4/P7/1PR2P2/4Q1PP/2R3K1 w - - 0 30', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Lesiege–Shabalov 2001 [D16].', sol: 'b4 (+2.4 dla białych)', accept: ['b3b4'], pv: '30. b4 Nc6 31. Nxb7 Re5 32. Qxe5 Qxc1+ 33. Rxc1 Nxe5', meta: 'Lesiege–Shabalov 2001 [D16]' },
  { name: 'Taktyka: Lesiege–Macieja', level: 2, goal: 'tac', mn: 0, fen: 'rnbq1rk1/pp1p1ppp/4p3/2P5/1b1P4/2N5/PP1nNPPP/R2QKB1R w KQ - 0 9', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Lesiege–Macieja 2001 [E42].', sol: 'Qxd2 (jedyny dobry ruch – ratuje pozycję)', accept: ['d1d2'], pv: '9. Qxd2 b6 10. a3 Bxc3 11. Nxc3 Bb7 12. Rd1 d6', meta: 'Lesiege–Macieja 2001 [E42]' },
  { name: 'Taktyka: Lesiege–Macieja', level: 1, goal: 'tac', mn: 0, fen: 'rn3rk1/p4ppp/3qp3/1Bp5/8/P7/1P3PPP/2KR3R w - - 0 17', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Lesiege–Macieja 2001 [E42].', sol: 'Rxd6 (+0.8 dla białych)', accept: ['d1d6'], pv: '17. Rxd6 g6 18. Kc2 Kg7 19. Rhd1 Rc8 20. Ba4 a6', meta: 'Lesiege–Macieja 2001 [E42]' },
  { name: 'Taktyka: Lesiege–Macieja', level: 2, goal: 'tac', mn: 0, fen: '1n3rk1/r4p1p/p2Rp1p1/2p5/8/P7/1P2BPPP/2KR4 w - - 0 20', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Lesiege–Macieja 2001 [E42].', sol: 'Rd8 (+4.1 dla białych)', accept: ['d6d8'], pv: '20. Rd8 a5 21. Rxf8+ Kxf8', meta: 'Lesiege–Macieja 2001 [E42]' },
  { name: 'Taktyka: Shabalov–Gershon', level: 1, goal: 'tac', mn: 0, fen: 'r3kb1r/ppp1pppp/2n2n2/3q4/3P4/5b1P/PPP1BPP1/RNBQK2R w KQkq - 0 7', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Shabalov–Gershon 2001 [B01].', sol: 'Bxf3 (+1.5 dla białych)', accept: ['e2f3'], pv: '7. Bxf3 Qa5+ 8. c3 e5 9. O-O O-O-O 10. Bxc6 bxc6', meta: 'Shabalov–Gershon 2001 [B01]' },
  { name: 'Taktyka: Shabalov–Gershon', level: 2, goal: 'tac', mn: 0, fen: '2kr1b1r/pppq1ppp/2n5/6B1/3p2n1/2P4P/PP3PP1/RN1Q1RK1 w - - 0 12', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Shabalov–Gershon 2001 [B01].', sol: 'Bxd8 (jedyny dobry ruch – ratuje pozycję)', accept: ['g5d8'], pv: '12. Bxd8 Nxf2 13. Rxf2 Qxd8 14. cxd4 Qxd4 15. Qxd4 Nxd4', meta: 'Shabalov–Gershon 2001 [B01]' },
  { name: 'Taktyka: Shabalov–Gershon', level: 2, goal: 'tac', mn: 0, fen: '2k4r/pppq1ppp/2n5/8/3b4/2N4P/PP3RP1/R2Q3K w - - 0 17', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Shabalov–Gershon 2001 [B01].', sol: 'Rd2 (+2.4 dla białych)', accept: ['f2d2'], pv: '17. Rd2 Rd8 18. Ne2 Qd6 19. Rc1 Qf6 20. Rxc6 Qxc6', meta: 'Shabalov–Gershon 2001 [B01]' },
  { name: 'Taktyka: Motylev–Kobalija', level: 1, goal: 'tac', mn: 0, fen: '1k1r3r/1bq2ppp/pp3n2/8/P2N1P2/R1Nn4/1PP2QPP/5R1K w - - 0 21', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Motylev–Kobalija 2001 [B48].', sol: 'cxd3 (jedyny dobry ruch – ratuje pozycję)', accept: ['c2d3'], pv: '21. cxd3 Ng4 22. Qg1 Qd6 23. Nf3 Rhe8 24. Ne4 Qb4', meta: 'Motylev–Kobalija 2001 [B48]' },
  { name: 'Taktyka: Motylev–Kobalija', level: 1, goal: 'tac', mn: 0, fen: '1k1rr3/1b3ppp/pp3n2/8/P4P2/R1NP1N1P/1P3qP1/5R1K w - - 0 24', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Motylev–Kobalija 2001 [B48].', sol: 'Rxf2 (jedyny dobry ruch – ratuje pozycję)', accept: ['f1f2'], pv: '24. Rxf2 Rxd3 25. Kh2 Bxf3 26. Rxf3 Rxf3 27. gxf3 Rd8', meta: 'Motylev–Kobalija 2001 [B48]' },
  { name: 'Taktyka: Motylev–Kobalija', level: 1, goal: 'tac', mn: 0, fen: '1k2r3/5ppp/pp3n2/8/P4P2/R1N2r1P/1P4PK/8 w - - 0 27', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Motylev–Kobalija 2001 [B48].', sol: 'gxf3 (jedyny dobry ruch – ratuje pozycję)', accept: ['g2f3'], pv: '27. gxf3 Rd8 28. Rb3 Kc7 29. Rb4 Nh5 30. f5 Rd2+', meta: 'Motylev–Kobalija 2001 [B48]' },
  { name: 'Taktyka: Zvjaginsev–Turov', level: 1, goal: 'tac', mn: 0, fen: '2rr1k2/R6p/2B1P1p1/1pb2p2/1P3P2/6P1/P3K2P/8 w - - 0 33', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Zvjaginsev–Turov 2001 [D92].', sol: 'bxc5 (+1.1 dla białych)', accept: ['b4c5'], pv: '33. bxc5 Rxc6 34. e7+ Ke8 35. exd8=Q+ Kxd8 36. Rb7 Rxc5', meta: 'Zvjaginsev–Turov 2001 [D92]' },
  { name: 'Taktyka: Bacrot–Gershon', level: 3, goal: 'tac', mn: 0, fen: '5rk1/p3nppp/1p2pn2/1N4N1/3Pb3/P7/1Pr1PPPP/1R2KB1R w K - 7 16', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Bacrot–Gershon 2001 [E12].', sol: 'Nd6 (+1.2 dla białych)', accept: ['b5d6'], pv: '16. Nd6 Bc6 17. e4 a6 18. Bxa6', meta: 'Bacrot–Gershon 2001 [E12]' },
  { name: 'Taktyka: Bacrot–Gershon', level: 1, goal: 'tac', mn: 0, fen: 'r5k1/N3nppp/1p2pnb1/6N1/3P4/P3P3/1Pr2PPP/1R2KB1R w K - 1 18', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Bacrot–Gershon 2001 [E12].', sol: 'Nb5 (+0.5 dla białych)', accept: ['a7b5'], pv: '18. Nb5 Ned5 19. h4 Ra5 20. h5 Nxh5 21. Nf3 Nhf6', meta: 'Bacrot–Gershon 2001 [E12]' },
  { name: 'Taktyka: Arencibia–Zhang Zhong', level: 3, goal: 'tac', mn: 0, fen: 'r1b1kb1r/pp1npppp/3p4/qBp1P3/3P4/2n2N2/PPPB1PPP/R2QK2R w KQkq - 0 8', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Arencibia–Zhang Zhong 2001 [B51].', sol: 'Bxd7+ (jedyny dobry ruch – ratuje pozycję)', accept: ['b5d7'], pv: '8. Bxd7+ Bxd7 9. Bxc3 Qa6 10. Qd2 f6 11. exd6 Qxd6', meta: 'Arencibia–Zhang Zhong 2001 [B51]' },
  { name: 'Taktyka: Bacrot–Motylev', level: 1, goal: 'tac', mn: 0, fen: '5r1k/pp4np/6n1/1P1N4/2P3P1/4q3/P3BR1P/7K w - - 0 35', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Bacrot–Motylev 2001 [E97].', sol: 'Rxf8+ (+3.4 dla białych)', accept: ['f2f8'], pv: '35. Rxf8+ Nxf8 36. Nxe3 Nge6 37. Kg2 Kg7 38. Kg3 Kf6', meta: 'Bacrot–Motylev 2001 [E97]' },
  { name: 'Taktyka: Kacheishvili–Najer', level: 1, goal: 'tac', mn: 0, fen: '3q1rk1/3nnpbp/Qr2p1p1/p2p4/P2P1P2/2N3P1/1P2PBBP/R4RK1 w - - 3 18', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Kacheishvili–Najer 2001 [D79].', sol: 'Qd3 (jedyny dobry ruch – ratuje pozycję)', accept: ['a6d3'], pv: '18. Qd3 Rxb2 19. Rfb1 Rxb1+ 20. Rxb1 Nf6 21. h3 h5', meta: 'Kacheishvili–Najer 2001 [D79]' },
  { name: 'Taktyka: Zhang Zhong–Epishin', level: 1, goal: 'tac', mn: 0, fen: 'r1bq1rk1/pp1n1pbp/2n1p1p1/2ppP3/5B2/3P1NP1/PPP1QPBP/RN3RK1 w - - 3 10', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Zhang Zhong–Epishin 2001 [B40].', sol: 'Bg5 (+6.1 dla białych)', accept: ['f4g5'], pv: '10. Bg5 Ndxe5 11. Bxd8 Nxf3+ 12. Qxf3 Rxd8', meta: 'Zhang Zhong–Epishin 2001 [B40]' },
  { name: 'Taktyka: Zhang Zhong–Epishin', level: 3, goal: 'tac', mn: 0, fen: 'r1bq1rk1/pp4b1/4pnpp/2ppN3/3n1B1P/3P2P1/PPPNQPB1/R4RK1 w - - 2 14', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Zhang Zhong–Epishin 2001 [B40].', sol: 'Qd1 (+1.5 dla białych)', accept: ['e2d1'], pv: '14. Qd1 Qe8 15. c3 Nf5 16. Ndf3 b6 17. a4 Bb7', meta: 'Zhang Zhong–Epishin 2001 [B40]' },
  { name: 'Taktyka: Zhang Zhong–Epishin', level: 3, goal: 'tac', mn: 0, fen: 'r1bq2k1/pp4b1/4p2p/2pp4/3n1r1P/3P2P1/PPPN1PB1/R2Q1RK1 w - - 0 17', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Zhang Zhong–Epishin 2001 [B40].', sol: 'gxf4 (+1.5 dla białych)', accept: ['g3f4'], pv: '17. gxf4 Qxh4 18. c3 Nf5 19. Qf3 Bd7 20. Bh3 Rf8', meta: 'Zhang Zhong–Epishin 2001 [B40]' },
  { name: 'Taktyka: Kobalija–Ibragimov', level: 1, goal: 'tac', mn: 0, fen: '4rrn1/p2bq2k/1p1n3p/2pPp3/2P1P1pP/P1PB2Q1/5RP1/2B2RK1 w - - 0 26', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Kobalija–Ibragimov 2001 [E20].', sol: 'Rxf8 (+1.4 dla białych)', accept: ['f2f8'], pv: '26. Rxf8 Rxf8 27. Rxf8 Qxf8 28. Qxe5 Qe7 29. Qf4 Kg7', meta: 'Kobalija–Ibragimov 2001 [E20]' },
  { name: 'Taktyka: Kobalija–Ibragimov', level: 1, goal: 'tac', mn: 0, fen: '5rn1/p2bq2k/1p1n3p/2pPp3/2P1P1pP/P1PB2Q1/6P1/2B2RK1 w - - 0 27', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Kobalija–Ibragimov 2001 [E20].', sol: 'Rxf8 (+1.9 dla białych)', accept: ['f1f8'], pv: '27. Rxf8 Qxf8 28. Qxe5 Kg6 29. Qxd6+ Qxd6 30. e5+ Kh5', meta: 'Kobalija–Ibragimov 2001 [E20]' },
  { name: 'Taktyka: Kobalija–Ibragimov', level: 1, goal: 'tac', mn: 0, fen: '5qn1/p2b3k/1p1n3p/2pPp3/2P1P1pP/P1PB2Q1/6P1/2B3K1 w - - 0 28', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Kobalija–Ibragimov 2001 [E20].', sol: 'Qxe5 (+0.7 dla białych)', accept: ['g3e5'], pv: '28. Qxe5 Qe7 29. Qg3 Kh8 30. e5 Nf5 31. Qf4 Qxh4', meta: 'Kobalija–Ibragimov 2001 [E20]' },
  { name: 'Taktyka: Bruzon–Kempinski', level: 1, goal: 'tac', mn: 0, fen: 'r2q1rk1/1pp2pbp/3p2p1/p7/2n1P1b1/3NB1P1/PP1QN1BP/3R1R1K w - - 0 17', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Bruzon–Kempinski 2001 [A26].', sol: 'Qc1 (+0.5 dla białych)', accept: ['d2c1'], pv: '17. Qc1 Nxb2 18. Nxb2 Bxe2 19. e5 Bxf1 20. Rxf1 Qd7', meta: 'Bruzon–Kempinski 2001 [A26]' },
  { name: 'Taktyka: Bruzon–Kempinski', level: 1, goal: 'tac', mn: 0, fen: 'r2q1rk1/1pp2pbp/3p2p1/p7/4P1b1/3NB1P1/Pn1QN1BP/2R2R1K w - - 0 18', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Bruzon–Kempinski 2001 [A26].', sol: 'Nxb2 (+6.7 dla białych)', accept: ['d3b2'], pv: '18. Nxb2 b5 19. Nd3 b4 20. h3 Be6 21. Bd4 Bxd4', meta: 'Bruzon–Kempinski 2001 [A26]' },
  { name: 'Taktyka: Bruzon–Kempinski', level: 1, goal: 'tac', mn: 0, fen: 'r2q1rk1/1pp2pbp/3p2p1/p7/4P3/4B1P1/PN1Qb1BP/2R2R1K w - - 0 19', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Bruzon–Kempinski 2001 [A26].', sol: 'Qxe2 (+7.5 dla białych)', accept: ['d2e2'], pv: '19. Qxe2 Qe7 20. Qd2 a4 21. Nc4 Rab8 22. Bd4 Bxd4', meta: 'Bruzon–Kempinski 2001 [A26]' },
  { name: 'Taktyka: Golod–Turov', level: 2, goal: 'tac', mn: 0, fen: 'r1bqr1k1/pp3ppp/3p1n2/2pPn3/1b2P3/2N2PN1/PP1B2PP/R2QKB1R w KQ - 3 11', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Golod–Turov 2001 [E20].', sol: 'f4 (+2.9 dla białych)', accept: ['f3f4'], pv: '11. f4 h6', meta: 'Golod–Turov 2001 [E20]' },
  { name: 'Taktyka: Dominguez–Kobalija', level: 2, goal: 'tac', mn: 0, fen: '1rbqr1k1/1p5p/p2p2p1/4b3/2P1p3/1P4QP/P3NPP1/1BRR2K1 w - - 2 25', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Dominguez–Kobalija 2001 [B42].', sol: 'Qe3 (+1.1 dla białych)', accept: ['g3e3'], pv: '25. Qe3 Bf5 26. Nc3 Qh4 27. Bxe4 Bxe4 28. Nxe4 Bb2', meta: 'Dominguez–Kobalija 2001 [B42]' },
  { name: 'Taktyka: Dominguez–Kobalija', level: 1, goal: 'tac', mn: 0, fen: '4r3/1p2r1kp/p2p2p1/3Bbq2/2P5/1P5P/P2Q1PP1/3RR1K1 w - - 4 33', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Dominguez–Kobalija 2001 [B42].', sol: 'Bf3 (+9.6 dla białych)', accept: ['d5f3'], pv: '33. Bf3 b6 34. Be4 h6 35. Bxf5', meta: 'Dominguez–Kobalija 2001 [B42]' },
  { name: 'Taktyka: Kacheishvili–Sturua', level: 3, goal: 'tac', mn: 0, fen: 'rn1q1rk1/p3ppbp/1p3n2/3p1p2/3P4/1QN1PN2/PP3PPP/R1B2RK1 w - - 0 11', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Kacheishvili–Sturua 2001 [D94].', sol: 'Nh4 (+1.7 dla białych)', accept: ['f3h4'], pv: '11. Nh4 f4 12. exf4', meta: 'Kacheishvili–Sturua 2001 [D94]' },
  { name: 'Taktyka: Kacheishvili–Sturua', level: 1, goal: 'tac', mn: 0, fen: 'r5k1/6rp/1p2p3/p2p1n2/3bpNR1/Bq6/PP4PP/3R3K w - - 0 27', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Kacheishvili–Sturua 2001 [D94].', sol: 'Rxg7+ (jedyny dobry ruch – ratuje pozycję)', accept: ['g4g7'], pv: '27. Rxg7+ Bxg7 28. axb3 Kf7 29. Nh3 Rg8 30. b4 axb4', meta: 'Kacheishvili–Sturua 2001 [D94]' },
  { name: 'Taktyka: Kacheishvili–Sturua', level: 1, goal: 'tac', mn: 0, fen: 'r5k1/6rp/1p2N3/p2pbn2/6R1/BP2p3/1P4PP/3R3K w - - 0 29', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Kacheishvili–Sturua 2001 [D94].', sol: 'Nxg7 (jedyny dobry ruch – ratuje pozycję)', accept: ['e6g7'], pv: '29. Nxg7 Bxg7 30. Rxd5 Re8 31. Rd1 e2 32. Re1 Nd4', meta: 'Kacheishvili–Sturua 2001 [D94]' },
  { name: 'Taktyka: Zvjaginsev–Motylev', level: 1, goal: 'tac', mn: 0, fen: 'r2q1r1k/pp2b1pp/4b3/2pP1p2/1n1P4/2n1BN2/PP2BPPP/R2QR1K1 w - - 0 16', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Zvjaginsev–Motylev 2001 [C42].', sol: 'bxc3 (+1.0 dla białych)', accept: ['b2c3'], pv: '16. bxc3 Nxd5 17. Bd2 Nf6 18. Bg5 Ne4 19. Bxe7 Qxe7', meta: 'Zvjaginsev–Motylev 2001 [C42]' },
  { name: 'Taktyka: Zvjaginsev–Motylev', level: 2, goal: 'tac', mn: 0, fen: 'r2q1rbk/pp2b1pp/8/3n1p2/3N4/2P5/P2BBPPP/R2QR1K1 w - - 1 19', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Zvjaginsev–Motylev 2001 [C42].', sol: 'c4 (+3.5 dla białych)', accept: ['c3c4'], pv: '19. c4 f4 20. cxd5 Qxd5', meta: 'Zvjaginsev–Motylev 2001 [C42]' },
  { name: 'Taktyka: Najer–Ibragimov', level: 1, goal: 'tac', mn: 0, fen: '3qr1k1/1b2rp2/3Nn1p1/pp5p/1Q1Pp2P/P3R1P1/1P3PB1/3R2K1 w - - 0 29', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Najer–Ibragimov 2001 [E12].', sol: 'Nxb7 (+0.6 dla białych)', accept: ['d6b7'], pv: '29. Nxb7 axb4 30. Nxd8 Rxd8 31. d5 f5 32. Bf1 Nc7', meta: 'Najer–Ibragimov 2001 [E12]' },
  { name: 'Taktyka: Turov–Sakaev', level: 1, goal: 'tac', mn: 0, fen: 'r1b3k1/1pp2pp1/p7/3P4/1P1bPp2/P1NB1P2/6K1/2R1q1N1 w - - 0 31', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Turov–Sakaev 2001 [E48].', sol: 'Rxe1 (jedyny dobry ruch – ratuje pozycję)', accept: ['c1e1'], pv: '31. Rxe1 Bxc3 32. Rc1 Be5 33. Nh3 a5 34. b5 Bd7', meta: 'Turov–Sakaev 2001 [E48]' },
  { name: 'Taktyka: Tukmakov–Sturua', level: 3, goal: 'tac', mn: 0, fen: '5rk1/1B1b1ppp/4pn2/p5B1/P1rP4/2b5/1P3PPP/R2R2K1 w - - 0 23', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Tukmakov–Sturua 2001 [D15].', sol: 'bxc3 (jedyny dobry ruch – ratuje pozycję)', accept: ['b2c3'], pv: '23. bxc3 Nd5 24. Ba6 Rxc3 25. Bd2 Rb3 26. Bc4 Rb2', meta: 'Tukmakov–Sturua 2001 [D15]' },
  { name: 'Taktyka: Korchnoi–Sturua', level: 1, goal: 'tac', mn: 0, fen: '3rr1k1/p2q2pp/1p1bbp2/n2p4/3B4/2Q1PNP1/PP3PBP/2R2RK1 w - - 0 19', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Korchnoi–Sturua 2001 [D41].', sol: 'b4 (+4.8 dla białych)', accept: ['b2b4'], pv: '19. b4 b5 20. bxa5', meta: 'Korchnoi–Sturua 2001 [D41]' },
  { name: 'Taktyka: Korchnoi–Sturua', level: 2, goal: 'tac', mn: 0, fen: '3rr1k1/p2q2pp/1p3p2/n2p4/4b3/bPB1PNP1/P2R1PBP/3Q1RK1 w - - 7 25', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Korchnoi–Sturua 2001 [D41].', sol: 'b4 (+4.1 dla białych)', accept: ['b3b4'], pv: '25. b4 h6 26. bxa5 bxa5 27. Bxa5', meta: 'Korchnoi–Sturua 2001 [D41]' },
  { name: 'Taktyka: Anand–Leko', level: 2, goal: 'tac', mn: 0, fen: 'r2q1b1k/7p/p2p4/1p2nbr1/5N2/N1P1Q3/PP2BP1P/3R1R1K w - - 1 25', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Anand–Leko 2001 [B33].', sol: 'h4 (+3.3 dla białych)', accept: ['h2h4'], pv: '25. h4 h6 26. Qd4 Bg7 27. hxg5 Qxg5', meta: 'Anand–Leko 2001 [B33]' },
  { name: 'Taktyka: Anand–Leko', level: 1, goal: 'tac', mn: 0, fen: 'r6k/4q1bp/p2p4/1p1N1b2/8/N1P2P2/PP5P/6RK w - - 0 31', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Anand–Leko 2001 [B33].', sol: 'Nxe7 (jedyny dobry ruch – ratuje pozycję)', accept: ['d5e7'], pv: '31. Nxe7 Be6 32. Nc2 Bxa2 33. Re1 a5 34. Nf5 b4', meta: 'Anand–Leko 2001 [B33]' },
  { name: 'Taktyka: Adams–Timman', level: 1, goal: 'tac', mn: 0, fen: 'r2qrbk1/ppp3pp/4bp2/3p4/1nPP4/P1n1BN2/1P2BPPP/R2Q1RK1 w - - 0 15', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Adams–Timman 2001 [C42].', sol: 'bxc3 (+1.1 dla białych)', accept: ['b2c3'], pv: '15. bxc3 Nc6 16. cxd5 Bxd5 17. Nd2 Bf7 18. Qc2 Rb8', meta: 'Adams–Timman 2001 [C42]' },
  { name: 'Taktyka: Kasparov–Shirov', level: 1, goal: 'tac', mn: 0, fen: '2r1r2k/p1n3p1/1p1B2pp/3pP3/P2P2q1/2P2R2/2Q3PP/5RK1 w - - 2 25', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Kasparov–Shirov 2001 [C42].', sol: 'Re1 (+8.8 dla białych)', accept: ['f1e1'], pv: '25. Re1 Qe4 26. Rxe4 dxe4 27. Qxe4', meta: 'Kasparov–Shirov 2001 [C42]' },
  { name: 'Taktyka: Ivanchuk–Topalov', level: 1, goal: 'tac', mn: 0, fen: 'r2qk2r/pp3p2/1n1p4/2pP2pn/P1P1p1bB/2P1P3/2B3PP/R3KQNR w KQkq - 0 16', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Ivanchuk–Topalov 2001 [E31].', sol: 'h3 (+3.5 dla białych)', accept: ['h2h3'], pv: '16. h3 f5 17. hxg4 fxg4', meta: 'Ivanchuk–Topalov 2001 [E31]' },
  { name: 'Taktyka: Ivanchuk–Topalov', level: 1, goal: 'tac', mn: 0, fen: '4r2r/pp1k1p2/3p1qb1/P1pP2p1/2P1p3/2P1P1NP/3K2P1/R4R2 w - - 0 32', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Ivanchuk–Topalov 2001 [E31].', sol: 'Rxf6 (jedyny dobry ruch – ratuje pozycję)', accept: ['f1f6'], pv: '32. Rxf6 Ke7 33. Rff1 Rb8 34. Rf2 Rhf8 35. Nf5+ Bxf5', meta: 'Ivanchuk–Topalov 2001 [E31]' },
  { name: 'Taktyka: Van Wely–Fedorov', level: 2, goal: 'tac', mn: 0, fen: '3r2k1/4qpbp/2bp1np1/r1p5/1pP1P3/1p1RBPPP/P2QN1B1/3R2K1 w - - 0 24', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Van Wely–Fedorov 2001 [E63].', sol: 'axb3 (+0.7 dla białych)', accept: ['a2b3'], pv: '24. axb3 Ne8 25. Bg5 f6 26. Bf4 Bf8 27. h4 Rda8', meta: 'Van Wely–Fedorov 2001 [E63]' },
  { name: 'Taktyka: Van Wely–Fedorov', level: 3, goal: 'tac', mn: 0, fen: 'r3nbk1/4q2p/2bp1pp1/r1p5/1pP1PB1P/1P1R1PP1/3QN1B1/3R2K1 w - - 1 28', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Van Wely–Fedorov 2001 [E63].', sol: 'Re3 (+2.8 dla białych)', accept: ['d3e3'], pv: '28. Re3 f5 29. exf5', meta: 'Van Wely–Fedorov 2001 [E63]' },
  { name: 'Taktyka: Kramnik–Morozevich', level: 1, goal: 'tac', mn: 0, fen: 'r2qkb1r/pp1n1ppp/2p5/4pb2/P1NP4/2n3P1/1P2PPBP/R1BQK2R w KQkq - 0 10', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Kramnik–Morozevich 2001 [D17].', sol: 'bxc3 (+0.9 dla białych)', accept: ['b2c3'], pv: '10. bxc3 exd4 11. Qxd4 Qf6 12. O-O Qxd4 13. cxd4 Be6', meta: 'Kramnik–Morozevich 2001 [D17]' },
  { name: 'Taktyka: Kramnik–Morozevich', level: 1, goal: 'tac', mn: 0, fen: '2b1k2r/p4ppp/4n3/2p5/2P5/3q1PP1/2N1P1BP/R5K1 w k - 0 25', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Kramnik–Morozevich 2001 [D17].', sol: 'exd3 (+1.0 dla białych)', accept: ['e2d3'], pv: '25. exd3 a6 26. f4 g6 27. Kf2 h5 28. h4 Ke7', meta: 'Kramnik–Morozevich 2001 [D17]' },
  { name: 'Taktyka: Topalov–Kramnik', level: 1, goal: 'tac', mn: 0, fen: 'r4rk1/pp1bnp1p/1q4p1/3p4/Q7/P2BP3/5PPP/2R2RK1 w - - 0 22', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Topalov–Kramnik 2001 [D37].', sol: 'Qxd7 (jedyny dobry ruch – ratuje pozycję)', accept: ['a4d7'], pv: '22. Qxd7 Nc6 23. Rb1 Rfd8 24. Qxb7 Qxb7 25. Rxb7 Rab8', meta: 'Topalov–Kramnik 2001 [D37]' },
  { name: 'Taktyka: Fedorov–Morozevich', level: 2, goal: 'tac', mn: 0, fen: '3q1rk1/4ppb1/2Pp2pp/4n3/8/6PP/1r1B1PB1/R2Q1RK1 w - - 0 22', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Fedorov–Morozevich 2001 [B70].', sol: 'Bd5 (+3.5 dla białych)', accept: ['g2d5'], pv: '22. Bd5 Rxd2 23. Qxd2 Qb6 24. Rfb1', meta: 'Fedorov–Morozevich 2001 [B70]' },
  { name: 'Taktyka: Fedorov–Morozevich', level: 1, goal: 'tac', mn: 0, fen: '5rk1/2P1ppb1/3p2pp/B2Q4/5qn1/7P/1r3PB1/R4RK1 w - - 0 26', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Fedorov–Morozevich 2001 [B70].', sol: 'hxg4 (jedyny dobry ruch – ratuje pozycję)', accept: ['h3g4'], pv: '26. hxg4 Be5 27. Qxe5 Qxe5 28. Bc6 Qd4 29. Ra4 Qc5', meta: 'Fedorov–Morozevich 2001 [B70]' },
  { name: 'Taktyka: Van Wely–Adams', level: 2, goal: 'tac', mn: 0, fen: '2r2rk1/p2nbpp1/2p1pn1p/qb6/2pPP3/2N2NP1/P1Q2PBP/R1BR2K1 w - - 0 20', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Van Wely–Adams 2001 [E15].', sol: 'e5 (+3.2 dla białych)', accept: ['e4e5'], pv: '20. e5 c5 21. exf6 Nxf6', meta: 'Van Wely–Adams 2001 [E15]' },
  { name: 'Taktyka: Van Wely–Adams', level: 2, goal: 'tac', mn: 0, fen: '2r2rk1/p2n1pp1/2p1pn1p/qb6/1bpPP3/2N2NP1/P1QB1PBP/R2R2K1 w - - 2 21', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Van Wely–Adams 2001 [E15].', sol: 'a3 (+5.4 dla białych)', accept: ['a2a3'], pv: '21. a3 Bxa3 22. Nxb5 Qxb5', meta: 'Van Wely–Adams 2001 [E15]' },
  { name: 'Taktyka: Van Wely–Adams', level: 3, goal: 'tac', mn: 0, fen: '2rr2k1/p2n1pp1/4pnq1/4P3/b1pN4/2B4p/P3QPBK/1R2R3 w - - 0 31', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Van Wely–Adams 2001 [E15].', sol: 'Bf3 (jedyny dobry ruch – ratuje pozycję)', accept: ['g2f3'], pv: '31. Bf3 Qd3 32. Rbc1 Qxe2 33. Rxe2 Nh7 34. Bb7 Rc7', meta: 'Van Wely–Adams 2001 [E15]' },
  { name: 'Taktyka: Shirov–Anand', level: 1, goal: 'tac', mn: 0, fen: 'r1bqkb1r/pp1n1ppp/4p3/2p5/3Pn3/3B1N2/PPP2PPP/R1BQ1RK1 w kq - 0 8', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Shirov–Anand 2001 [C10].', sol: 'Bxe4 (+0.8 dla białych)', accept: ['d3e4'], pv: '8. Bxe4 Nf6 9. Bd3 cxd4 10. Bf4 Bc5 11. Ne5 O-O', meta: 'Shirov–Anand 2001 [C10]' },
  { name: 'Taktyka: Shirov–Anand', level: 2, goal: 'tac', mn: 0, fen: 'r1br2k1/1pq2pbp/p3pp2/7Q/3N4/2P3P1/PP3PBP/R3R1K1 w - - 5 19', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Shirov–Anand 2001 [C10].', sol: 'Be4 (+3.6 dla białych)', accept: ['g2e4'], pv: '19. Be4 e5', meta: 'Shirov–Anand 2001 [C10]' },
  { name: 'Taktyka: Shirov–Anand', level: 2, goal: 'tac', mn: 0, fen: 'r1b1r1k1/1p3pbp/pq2pp2/7Q/8/1NP3P1/PP3PBP/3RR1K1 w - - 9 21', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Shirov–Anand 2001 [C10].', sol: 'Bd5 (+6.5 dla białych)', accept: ['g2d5'], pv: '21. Bd5 exd5 22. Rxe8+ Bf8 23. Rxd5', meta: 'Shirov–Anand 2001 [C10]' },
  { name: 'Taktyka: Piket–Kasparov', level: 2, goal: 'tac', mn: 0, fen: '3rr1k1/pb2qp2/1p3bp1/2P4p/3n4/P1N1P2P/BP1R1PP1/2RQ2K1 w - - 0 23', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Piket–Kasparov 2001 [D58].', sol: 'exd4 (+0.6 dla białych)', accept: ['e3d4'], pv: '23. exd4 bxc5 24. Re2 Qf8 25. Rxe8 Qxe8 26. d5 Qe5', meta: 'Piket–Kasparov 2001 [D58]' },
  { name: 'Taktyka: Piket–Kasparov', level: 3, goal: 'tac', mn: 0, fen: '3rr1k1/p3qp2/1p4p1/3b3p/3b4/P6P/BP1R1PP1/2RQ2K1 w - - 0 26', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Piket–Kasparov 2001 [D58].', sol: 'Bxd5 (jedyny dobry ruch – ratuje pozycję)', accept: ['a2d5'], pv: '26. Bxd5 Rxd5 27. Rxd4 Re5 28. Rd2 Kg7 29. Rdc2 Re1+', meta: 'Piket–Kasparov 2001 [D58]' },
  { name: 'Taktyka: Piket–Kasparov', level: 1, goal: 'tac', mn: 0, fen: '4r1k1/p3qp2/1p4p1/3r3p/3b4/P6P/1P1R1PP1/2RQ2K1 w - - 0 27', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Piket–Kasparov 2001 [D58].', sol: 'Rxd4 (jedyny dobry ruch – ratuje pozycję)', accept: ['d2d4'], pv: '27. Rxd4 Re5 28. Rd7 Qf6 29. b4 b5 30. Qd4 Re1+', meta: 'Piket–Kasparov 2001 [D58]' },
  { name: 'Taktyka: Anand–Piket', level: 2, goal: 'tac', mn: 0, fen: 'r1b2qk1/p1b2p2/n1p4p/2Pp2p1/3B1P1N/2PB2Q1/P5PP/4R1K1 w - - 0 23', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Anand–Piket 2001 [C42].', sol: 'Qf2 (+5.8 dla białych)', accept: ['g3f2'], pv: '23. Qf2 Nxc5 24. Bxc5 Bb6 25. Bxb6 axb6 26. fxg5 hxg5', meta: 'Anand–Piket 2001 [C42]' },
  { name: 'Taktyka: Adams–Fedorov', level: 1, goal: 'tac', mn: 0, fen: 'r1b2rk1/p1q1ppbp/6p1/3Q4/8/4BP2/PPP3PP/2KR1B1R w - - 1 14', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Adams–Fedorov 2001 [B76].', sol: 'Kb1 (+7.3 dla białych)', accept: ['c1b1'], pv: '14. Kb1 e6 15. Qxa8 a5', meta: 'Adams–Fedorov 2001 [B76]' },
  { name: 'Taktyka: Adams–Fedorov', level: 3, goal: 'tac', mn: 0, fen: 'r4rk1/p3ppbp/B3b1p1/4q3/8/Q3BP2/PPP3PP/2KR3R w - - 7 17', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Adams–Fedorov 2001 [B76].', sol: 'Bb7 (+6.5 dla białych)', accept: ['a6b7'], pv: '17. Bb7 g5 18. Bd4 Qxd4 19. Rxd4 Bxd4 20. Bxa8 Rxa8', meta: 'Adams–Fedorov 2001 [B76]' },
  { name: 'Taktyka: Adams–Fedorov', level: 1, goal: 'tac', mn: 0, fen: '3r2k1/p3pp1p/Bq4pb/5b2/8/Q1P1BPP1/PP5P/2K1R3 w - - 3 23', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Adams–Fedorov 2001 [B76].', sol: 'f4 (jedyny dobry ruch – ratuje pozycję)', accept: ['f3f4'], pv: '23. f4 Qc6 24. Rd1 Rxd1+ 25. Kxd1 Qd5+ 26. Ke1 Qh1+', meta: 'Adams–Fedorov 2001 [B76]' },
  { name: 'Taktyka: Morozevich–Topalov', level: 2, goal: 'tac', mn: 0, fen: 'r1bqkb1r/pp2pp1p/2np1np1/8/2PNP3/2N5/PP3PPP/R1BQKB1R w KQkq - 0 7', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Morozevich–Topalov 2001 [B36].', sol: 'Nde2 (+3.3 dla białych)', accept: ['d4e2'], pv: '7. Nde2 d5 8. cxd5', meta: 'Morozevich–Topalov 2001 [B36]' },
  { name: 'Taktyka: Morozevich–Topalov', level: 1, goal: 'tac', mn: 0, fen: '2r3k1/r4p1p/1pbp2p1/8/8/2B5/1P3PPP/R5K1 w - - 0 24', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Morozevich–Topalov 2001 [B36].', sol: 'Rxa7 (jedyny dobry ruch – ratuje pozycję)', accept: ['a1a7'], pv: '24. Rxa7 Ra8 25. Rxa8+ Bxa8 26. Bb4 d5 27. Bc3 Bc6', meta: 'Morozevich–Topalov 2001 [B36]' },
  { name: 'Taktyka: Ivanchuk–Shirov', level: 2, goal: 'tac', mn: 0, fen: 'rnb1k2r/1p2ppb1/pq1p1n1p/6p1/2BNP3/2N3BP/PPP2PP1/R2QK2R w KQkq - 3 12', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Ivanchuk–Shirov 2001 [B90].', sol: 'b3 (+4.6 dla białych)', accept: ['b2b3'], pv: '12. b3 Kd8 13. Nf5', meta: 'Ivanchuk–Shirov 2001 [B90]' },
  { name: 'Taktyka: Ivanchuk–Shirov', level: 1, goal: 'tac', mn: 0, fen: 'rn2k2r/1p3pb1/p2pb2p/6p1/2Bq4/6BP/PPP1QPP1/R4RK1 w kq - 2 16', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Ivanchuk–Shirov 2001 [B90].', sol: 'Bxe6 (+2.6 dla białych)', accept: ['c4e6'], pv: '16. Bxe6 O-O 17. Rad1 Qb6 18. Bb3 Nc6 19. Rxd6 Nd4', meta: 'Ivanchuk–Shirov 2001 [B90]' },
  { name: 'Taktyka: Ivanchuk–Shirov', level: 2, goal: 'tac', mn: 0, fen: '5r2/7k/2p3qb/P2p4/1P1B2P1/2P2r2/5QK1/3RR3 w - - 0 35', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Ivanchuk–Shirov 2001 [B90].', sol: 'Qxf3 (+4.5 dla białych)', accept: ['f2f3'], pv: '35. Qxf3 Rxf3 36. Kxf3 Qf7+ 37. Kg2 Qd7 38. Kg3 Qc7+', meta: 'Ivanchuk–Shirov 2001 [B90]' },
  { name: 'Taktyka: Kasparov–Timman', level: 3, goal: 'tac', mn: 0, fen: '6k1/1p1q3p/p4p1P/3b2p1/P1nP2P1/5PB1/4r1B1/4Q1K1 w - - 0 34', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Kasparov–Timman 2001 [A29].', sol: 'Qxe2 (jedyny dobry ruch – ratuje pozycję)', accept: ['e1e2'], pv: '34. Qxe2 Be6 35. Qd3 Bf7 36. d5 Bxd5 37. f4 Nb6', meta: 'Kasparov–Timman 2001 [A29]' },
  { name: 'Taktyka: Timman–Anand', level: 3, goal: 'tac', mn: 0, fen: '1r3rk1/pbqnbp1p/4p1p1/2P5/2P1p3/1NB3P1/PQ3P1P/3RRBK1 w - - 0 22', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Timman–Anand 2001 [E15].', sol: 'Kh1 (+1.7 dla białych)', accept: ['g1h1'], pv: '22. Kh1 Nxc5', meta: 'Timman–Anand 2001 [E15]' },
  { name: 'Taktyka: Timman–Anand', level: 1, goal: 'tac', mn: 0, fen: '1r4k1/qb2br1p/4p1p1/1Nn2p2/2P1p3/2B3P1/P4PBP/3RR1K1 w - - 0 27', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Timman–Anand 2001 [E15].', sol: 'Nxa7 (jedyny dobry ruch – ratuje pozycję)', accept: ['b5a7'], pv: '27. Nxa7 Nd3 28. Re2 Bf8 29. Rc2 Rc7 30. Ba5 Rd7', meta: 'Timman–Anand 2001 [E15]' },
  { name: 'Taktyka: Timman–Anand', level: 2, goal: 'tac', mn: 0, fen: '1r4k1/Nb3r1p/4p1p1/2b2p2/2P1p3/2Bn2P1/P3RPBP/3R2K1 w - - 3 29', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Timman–Anand 2001 [E15].', sol: 'Nb5 (jedyny dobry ruch – ratuje pozycję)', accept: ['a7b5'], pv: '29. Nb5 Rd8 30. a4 Rdd7 31. Kf1 f4 32. Bxe4 f3', meta: 'Timman–Anand 2001 [E15]' },
  { name: 'Taktyka: Van Wely–Kasparov', level: 2, goal: 'tac', mn: 0, fen: 'rnbq1rk1/pp3ppp/4p3/2bn4/5B2/2N1PN2/PP3PPP/R2QKB1R w KQ - 0 9', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Van Wely–Kasparov 2001 [D37].', sol: 'Bg5 (+3.1 dla białych)', accept: ['f4g5'], pv: '9. Bg5 Nxc3 10. Qxd8', meta: 'Van Wely–Kasparov 2001 [D37]' },
  { name: 'Taktyka: Van Wely–Kasparov', level: 1, goal: 'tac', mn: 0, fen: 'r1bq1rk1/pp3ppp/1bn5/3p4/5B2/P2BPN2/1P3PPP/R2QK2R w KQ - 3 12', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Van Wely–Kasparov 2001 [D37].', sol: 'Bg5 (+7.2 dla białych)', accept: ['f4g5'], pv: '12. Bg5 Ba5+ 13. b4 Nxb4 14. Bxd8 Nxd3+ 15. Kf1', meta: 'Van Wely–Kasparov 2001 [D37]' },
  { name: 'Taktyka: Van Wely–Kasparov', level: 1, goal: 'tac', mn: 0, fen: '3r2k1/1p4p1/pbn5/5p2/1P1Pr3/Pq1RBN1P/5PK1/4R3 w - - 0 26', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Van Wely–Kasparov 2001 [D37].', sol: 'Rxb3 (jedyny dobry ruch – ratuje pozycję)', accept: ['d3b3'], pv: '26. Rxb3 Nxd4 27. Bxd4 Bxd4 28. Rd1 Bf6 29. Rxd8+ Bxd8', meta: 'Van Wely–Kasparov 2001 [D37]' },
  { name: 'Taktyka: Piket–Ivanchuk', level: 1, goal: 'tac', mn: 0, fen: '3r2k1/1pprnpp1/p4b1p/4p3/PP2P3/1q1PBN1P/5PP1/1R1R2K1 w - - 0 21', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Piket–Ivanchuk 2001 [A28].', sol: 'Rxb3 (jedyny dobry ruch – ratuje pozycję)', accept: ['b1b3'], pv: '21. Rxb3 Ng6 22. g3 Be7 23. Kg2 b5 24. axb5 axb5', meta: 'Piket–Ivanchuk 2001 [A28]' },
  { name: 'Taktyka: Adams–Tiviakov', level: 1, goal: 'tac', mn: 0, fen: '1r2kb1r/3q1ppp/3ppP2/2p5/8/3p1Q1P/1PP2PP1/R1B1R1K1 w k - 0 16', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Adams–Tiviakov 2001 [B51].', sol: 'Qa8 (+7.6 dla białych)', accept: ['f3a8'], pv: '16. Qa8 Rxa8 17. Rxa8+ Qc8 18. Rxc8+ Kd7', meta: 'Adams–Tiviakov 2001 [B51]' },
  { name: 'Taktyka: Adams–Tiviakov', level: 1, goal: 'tac', mn: 0, fen: '5r1k/4q2p/1r1p1p1b/2p1p3/8/R6P/1PPQ1PP1/R5K1 w - - 0 24', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Adams–Tiviakov 2001 [B51].', sol: 'Qxh6 (+1.2 dla białych)', accept: ['d2h6'], pv: '24. Qxh6 Qg7 25. Qd2 Qg5 26. Qd1 Rxb2 27. Qxd6 Rbb8', meta: 'Adams–Tiviakov 2001 [B51]' },
  { name: 'Taktyka: Adams–Tiviakov', level: 1, goal: 'tac', mn: 0, fen: 'r6k/7p/1r1p4/2p1ppq1/8/7P/1PP2PP1/R2Q2K1 w - - 0 28', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Adams–Tiviakov 2001 [B51].', sol: 'Rxa8+ (+1.6 dla białych)', accept: ['a1a8'], pv: '28. Rxa8+ Kg7 29. Ra7+ Kh8 30. g3 f4 31. Qd5 Qg8', meta: 'Adams–Tiviakov 2001 [B51]' },
  { name: 'Taktyka: Leko–Morozevich', level: 2, goal: 'tac', mn: 0, fen: '1r2k2r/2qbbpp1/p1p1pn1p/3p1P2/4P1P1/2N2Q2/PPP4P/1KBR1B1R w k - 2 15', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Leko–Morozevich 2001 [B98].', sol: 'Bf4 (+4.2 dla białych)', accept: ['c1f4'], pv: '15. Bf4 dxe4 16. Bxc7', meta: 'Leko–Morozevich 2001 [B98]' },
  { name: 'Taktyka: Leko–Morozevich', level: 3, goal: 'tac', mn: 0, fen: '1r2k1nr/5pp1/p1p1b2p/3p2b1/3q2P1/3N1Q2/PPP4P/1KBR1B1R w k - 2 20', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Leko–Morozevich 2001 [B98].', sol: 'Bf4 (+1.2 dla białych)', accept: ['c1f4'], pv: '20. Bf4 Bxf4', meta: 'Leko–Morozevich 2001 [B98]' },
  { name: 'Taktyka: Shirov–Kramnik', level: 2, goal: 'tac', mn: 0, fen: 'r1bq1rk1/1p4pp/2n1pn2/p2pb3/8/1N1B1N2/PPP1QPPP/1K1R3R w - - 0 14', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Shirov–Kramnik 2001 [B12].', sol: 'Nxe5 (jedyny dobry ruch – ratuje pozycję)', accept: ['f3e5'], pv: '14. Nxe5 a4 15. Nd2 a3 16. b3 Qa5 17. Nxc6 bxc6', meta: 'Shirov–Kramnik 2001 [B12]' },
  { name: 'Taktyka: Shirov–Kramnik', level: 2, goal: 'tac', mn: 0, fen: 'r1b2rk1/1p4pp/2n1pn2/q3N3/2p5/pP1B4/P3QPPP/1KNR3R w - - 0 18', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Shirov–Kramnik 2001 [B12].', sol: 'Nxc4 (jedyny dobry ruch – ratuje pozycję)', accept: ['e5c4'], pv: '18. Nxc4 Qc7 19. Be4 e5 20. Bxc6 Qxc6 21. Nd3 Nd5', meta: 'Shirov–Kramnik 2001 [B12]' },
  { name: 'Taktyka: Shirov–Kramnik', level: 2, goal: 'tac', mn: 0, fen: 'r1b2rk1/1pq3pp/2n1p3/3n4/2N5/pP1B4/P3QPPP/1KNRR3 w - - 3 20', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Shirov–Kramnik 2001 [B12].', sol: 'Qd2 (jedyny dobry ruch – ratuje pozycję)', accept: ['e2d2'], pv: '20. Qd2 Ncb4 21. Ne2 Rxf2 22. Be4 b5 23. Ne3 Bb7', meta: 'Shirov–Kramnik 2001 [B12]' },
  { name: 'Taktyka: Fedorov–Topalov', level: 2, goal: 'tac', mn: 0, fen: 'r1q2rk1/p3ppbp/1pnp1np1/8/4PP2/1NN1B3/PPPQb1PP/3R1R1K w - - 0 14', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Fedorov–Topalov 2001 [B74].', sol: 'Qxe2 (+0.6 dla białych)', accept: ['d2e2'], pv: '14. Qxe2 Qe6 15. Nd4 Nxd4 16. Bxd4 Rac8 17. Kg1 Nd7', meta: 'Fedorov–Topalov 2001 [B74]' },
  { name: 'Taktyka: Fedorov–Topalov', level: 3, goal: 'tac', mn: 0, fen: '2r2rk1/p3ppbp/1pnp1np1/8/4PPq1/1NN1B3/PPP3PP/3RQR1K w - - 3 16', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Fedorov–Topalov 2001 [B74].', sol: 'a4 (+3.1 dla białych)', accept: ['a2a4'], pv: '16. a4 Nb4 17. Nd4', meta: 'Fedorov–Topalov 2001 [B74]' },
  { name: 'Taktyka: Fedorov–Topalov', level: 2, goal: 'tac', mn: 0, fen: '2r1r1k1/p2nppbp/1p1pq1p1/8/3nPP2/P1N4P/1PP3P1/3RQRBK w - - 0 20', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Fedorov–Topalov 2001 [B74].', sol: 'Bxd4 (+0.5 dla białych)', accept: ['g1d4'], pv: '20. Bxd4 f5 21. Qg3 Bxd4 22. Rxd4 fxe4 23. Nxe4 Qa2', meta: 'Fedorov–Topalov 2001 [B74]' },
  { name: 'Taktyka: Topalov–Leko', level: 3, goal: 'tac', mn: 0, fen: 'rn1q1rk1/4ppb1/pn2b1p1/1pP1P3/8/1QN2N2/PP3PP1/R1B1KB1R w KQ - 1 14', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Topalov–Leko 2001 [D97].', sol: 'Qc2 (+2.2 dla białych)', accept: ['b3c2'], pv: '14. Qc2 Bf5 15. Qe2 Nd5 16. Nd4 Nxc3 17. bxc3 Qd5', meta: 'Topalov–Leko 2001 [D97]' },
  { name: 'Taktyka: Topalov–Leko', level: 1, goal: 'tac', mn: 0, fen: 'rn1q1rk1/4ppb1/p3b1p1/1pP1P3/2n5/Q1N2N2/PP3PP1/R1B1KB1R w KQ - 7 17', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Topalov–Leko 2001 [D97].', sol: 'Bxc4 (+1.0 dla białych)', accept: ['f1c4'], pv: '17. Bxc4 Bxc4 18. Bh6 Bxh6 19. Rd1 Qc7 20. Rxh6 Nc6', meta: 'Topalov–Leko 2001 [D97]' },
  { name: 'Taktyka: Topalov–Leko', level: 1, goal: 'tac', mn: 0, fen: 'r4rk1/2q1pp2/p1n3pR/1pPbP3/8/Q4N2/PP3PP1/3RK3 w - - 0 22', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Topalov–Leko 2001 [D97].', sol: 'Rxd5 (+0.8 dla białych)', accept: ['d1d5'], pv: '22. Rxd5 Rad8 23. Rxd8 Rxd8 24. Kf1 Qd7 25. Kg1 Qd3', meta: 'Topalov–Leko 2001 [D97]' },
  { name: 'Taktyka: Kasparov–Adams', level: 1, goal: 'tac', mn: 0, fen: 'r1bqk2r/p1p2ppp/2n1p3/1Q6/2pP4/P4NP1/1P1KPPBP/nN5R w kq - 0 12', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Kasparov–Adams 2001 [E04].', sol: 'Qxc6+ (jedyny dobry ruch – ratuje pozycję)', accept: ['b5c6'], pv: '12. Qxc6+ Bd7 13. Qxc4 c5 14. Qa2 Rc8 15. Rc1 Qa5+', meta: 'Kasparov–Adams 2001 [E04]' },
  { name: 'Taktyka: Kasparov–Adams', level: 1, goal: 'tac', mn: 0, fen: 'r2qk2r/p1pb1ppp/2Q1p3/8/2pP4/P4NP1/1P1KPPBP/nN5R w kq - 1 13', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Kasparov–Adams 2001 [E04].', sol: 'Qxc4 (+0.7 dla białych)', accept: ['c6c4'], pv: '13. Qxc4 c5 14. Qa2 Rc8 15. Rc1 Qa5+ 16. b4 cxb4', meta: 'Kasparov–Adams 2001 [E04]' },
  { name: 'Taktyka: Kasparov–Adams', level: 2, goal: 'tac', mn: 0, fen: '3rk2r/p2b1ppp/8/q3p3/3N4/P1N3P1/QP1KPPBP/R7 w k - 0 18', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Kasparov–Adams 2001 [E04].', sol: 'Nc6 (+3.5 dla białych)', accept: ['d4c6'], pv: '18. Nc6 Be6+ 19. Ke1', meta: 'Kasparov–Adams 2001 [E04]' },
  { name: 'Taktyka: Tiviakov–Fedorov', level: 1, goal: 'tac', mn: 0, fen: '1k4r1/1p3p1p/2b5/1p1rp3/P2p3q/3Q1PP1/2P1NR1P/R5K1 w - - 0 22', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Tiviakov–Fedorov 2001 [B23].', sol: 'axb5 (+2.5 dla białych)', accept: ['a4b5'], pv: '22. axb5 Rxb5 23. c4 Rb4 24. Qa3 Ra4 25. Qd6+ Kc8', meta: 'Tiviakov–Fedorov 2001 [B23]' },
  { name: 'Taktyka: Tiviakov–Fedorov', level: 1, goal: 'tac', mn: 0, fen: '1k4r1/1p3p1p/2b5/4p3/r1Pp3q/Q4PP1/4NR1P/R5K1 w - - 3 25', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Tiviakov–Fedorov 2001 [B23].', sol: 'Qd6+ (+2.1 dla białych)', accept: ['a3d6'], pv: '25. Qd6+ Kc8 26. Rxa4 Bxa4 27. Qa3 Be8 28. Qa8+ Kc7', meta: 'Tiviakov–Fedorov 2001 [B23]' },
  { name: 'Taktyka: Tiviakov–Fedorov', level: 1, goal: 'tac', mn: 0, fen: '2k3r1/1p3p1p/3Q4/4p3/b1Pp3q/5PP1/4NR1P/6K1 w - - 0 27', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Tiviakov–Fedorov 2001 [B23].', sol: 'Kh1 (+11.6 dla białych)', accept: ['g1h1'], pv: '27. Kh1 Bd1 28. Qc5+ Kd7 29. gxh4', meta: 'Tiviakov–Fedorov 2001 [B23]' },
  { name: 'Taktyka: Ivanchuk–Timman', level: 1, goal: 'tac', mn: 0, fen: 'r2q1rk1/p1pp2pp/np2pb2/4Np2/2PP4/2B3P1/PPQ1PPbP/3R1RK1 w - - 0 13', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Ivanchuk–Timman 2001 [E18].', sol: 'Kxg2 (+1.0 dla białych)', accept: ['g1g2'], pv: '13. Kxg2 Qe8 14. Nf3 c6 15. e4 Be7 16. d5 fxe4', meta: 'Ivanchuk–Timman 2001 [E18]' },
  { name: 'Taktyka: Ivanchuk–Timman', level: 2, goal: 'tac', mn: 0, fen: 'r5k1/pq1p1rpp/npp1p3/4Pp2/1PP5/2B3P1/P1Q1PP1P/3RR1K1 w - - 0 18', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Ivanchuk–Timman 2001 [E18].', sol: 'b5 (+4.0 dla białych)', accept: ['b4b5'], pv: '18. b5 c5 19. bxa6 Qxa6', meta: 'Ivanchuk–Timman 2001 [E18]' },
  { name: 'Taktyka: Ivanchuk–Timman', level: 2, goal: 'tac', mn: 0, fen: '1nr2k2/3p1rpp/3Rp3/1pp1P3/P3p1P1/2p1B3/4PPKP/2R5 w - - 0 31', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Ivanchuk–Timman 2001 [E18].', sol: 'axb5 (+3.5 dla białych)', accept: ['a4b5'], pv: '31. axb5 c2 32. Rxc2 c4 33. Rc3 h6 34. b6 h5', meta: 'Ivanchuk–Timman 2001 [E18]' },
  { name: 'Taktyka: Morozevich–Shirov', level: 1, goal: 'tac', mn: 0, fen: '2r3k1/3p2b1/4p1R1/p3qn2/3r4/1B1Q1P2/1PP3P1/2B2K1R w - - 3 29', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Morozevich–Shirov 2001 [B23].', sol: 'Qe2 (jedyny dobry ruch – ratuje pozycję)', accept: ['d3e2'], pv: '29. Qe2 Kf7 30. Rg5 Ng3+ 31. Rxg3 Qxg3 32. Rh3 Qe5', meta: 'Morozevich–Shirov 2001 [B23]' },
  { name: 'Taktyka: Morozevich–Shirov', level: 2, goal: 'tac', mn: 0, fen: '8/2rp1kb1/4p3/p7/1r6/1B1QBPq1/1PP3P1/5K1R w - - 4 34', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Morozevich–Shirov 2001 [B23].', sol: 'Bf2 (+2.3 dla białych)', accept: ['e3f2'], pv: '34. Bf2 Qg6 35. Qd6', meta: 'Morozevich–Shirov 2001 [B23]' },
  { name: 'Taktyka: Anand–Van Wely', level: 2, goal: 'tac', mn: 0, fen: 'rr4k1/2qnbppp/3p4/3Rp1P1/pp2PnBP/4BP2/PPP2Q2/1KN4R w - - 4 21', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Anand–Van Wely 2001 [B90].', sol: 'Bxf4 (+1.1 dla białych)', accept: ['e3f4'], pv: '21. Bxf4 exf4 22. Bxd7 Qxd7 23. Nd3 Qc6 24. h5 b3', meta: 'Anand–Van Wely 2001 [B90]' },
  { name: 'Taktyka: Anand–Van Wely', level: 1, goal: 'tac', mn: 0, fen: 'r5k1/3qbppp/3p4/1r1R2P1/pp2Pp1P/5P2/PPPQ4/1KN4R w - - 2 24', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Anand–Van Wely 2001 [B90].', sol: 'Qd3 (+7.4 dla białych)', accept: ['d2d3'], pv: '24. Qd3 Rxd5 25. Qxd5 h6 26. Qxa8+ Kh7', meta: 'Anand–Van Wely 2001 [B90]' },
  { name: 'Taktyka: Anand–Van Wely', level: 1, goal: 'tac', mn: 0, fen: '1r3bk1/3q1ppp/3p4/3N2P1/3RP2P/Pp2QP2/1P4r1/1K5R w - - 9 32', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Anand–Van Wely 2001 [B90].', sol: 'Nf4 (+7.3 dla białych)', accept: ['d5f4'], pv: '32. Nf4 h6 33. Nxg2 hxg5', meta: 'Anand–Van Wely 2001 [B90]' },
  { name: 'Taktyka: Gulko–Gurevich', level: 1, goal: 'tac', mn: 0, fen: 'r1b1rnk1/p4ppp/2pb1q2/3p4/3P4/2NBPN1P/P1Q2PP1/1R3RK1 w - - 2 18', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Gulko–Gurevich 2001 [D36].', sol: 'Nd1 (+7.3 dla białych)', accept: ['c3d1'], pv: '18. Nd1 h5 19. Qxc6 g6 20. Qxe8', meta: 'Gulko–Gurevich 2001 [D36]' },
  { name: 'Taktyka: Gulko–Gurevich', level: 1, goal: 'tac', mn: 0, fen: 'r1b1rnk1/p4ppp/2pb3q/8/3PN3/3B1N1P/P1Q2PP1/1R3RK1 w - - 1 20', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Gulko–Gurevich 2001 [D36].', sol: 'Qxc6 (+8.6 dla białych)', accept: ['c2c6'], pv: '20. Qxc6 a5 21. Nxd6 a4 22. Qxa8 Qxd6 23. Qxa4', meta: 'Gulko–Gurevich 2001 [D36]' },
  { name: 'Taktyka: Luther–Nijboer', level: 2, goal: 'tac', mn: 0, fen: 'r2q1rk1/6bp/p1npb3/1p1Np3/5p2/2P1N3/PPB2PPP/R2QK2R w KQ - 0 17', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Luther–Nijboer 2001 [B33].', sol: 'Qh5 (+1.2 dla białych)', accept: ['d1h5'], pv: '17. Qh5 Rf7 18. Bxh7+ Kf8 19. Bf5 Qc8 20. Bxe6 Qxe6', meta: 'Luther–Nijboer 2001 [B33]' },
  { name: 'Taktyka: Korchnoi–Ponomariov', level: 1, goal: 'tac', mn: 0, fen: 'r4rk1/p2pnpp1/1p2p2p/1P6/4Pn2/P4N2/1P3PPP/1BRq1RK1 w - - 0 18', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Korchnoi–Ponomariov 2001 [A33].', sol: 'Rcxd1 (+1.2 dla białych)', accept: ['c1d1'], pv: '18. Rcxd1 d5 19. Nd4 dxe4 20. Bxe4 Rac8 21. Nc6 Rc7', meta: 'Korchnoi–Ponomariov 2001 [A33]' },
  { name: 'Taktyka: Korchnoi–Ponomariov', level: 1, goal: 'tac', mn: 0, fen: '2r2rk1/p3np2/1p2p3/1P1pP2p/5n1P/P4Pp1/1P4PN/1B1RR1K1 w - - 0 24', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Korchnoi–Ponomariov 2001 [A33].', sol: 'Nf1 (+0.8 dla białych)', accept: ['h2f1'], pv: '24. Nf1 Neg6 25. Rd4 Rc1 26. Rxc1 Ne2+ 27. Kh1 Nxd4', meta: 'Korchnoi–Ponomariov 2001 [A33]' },
  { name: 'Taktyka: Gershon–Stefansson', level: 2, goal: 'tac', mn: 0, fen: '5nk1/pb3p2/1p5p/1P4p1/2qPpn1P/P3N1B1/B4PP1/6K1 w - - 0 31', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Gershon–Stefansson 2001 [E32].', sol: 'Bxc4 (+1.5 dla białych)', accept: ['a2c4'], pv: '31. Bxc4 N8g6 32. Bxf4 gxf4 33. Nf5 h5 34. g3 e3', meta: 'Gershon–Stefansson 2001 [E32]' },
  { name: 'Taktyka: Macieja–Shabalov', level: 2, goal: 'tac', mn: 0, fen: 'rnbq1rk1/pp2nppp/4p3/2ppP3/3P2Q1/P1P5/2P2PPP/R1B1KBNR w KQ - 2 8', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Macieja–Shabalov 2001 [C18].', sol: 'dxc5 (+4.7 dla białych)', accept: ['d4c5'], pv: '8. dxc5 g6 9. Bd3 g5 10. Qxg5+ Ng6', meta: 'Macieja–Shabalov 2001 [C18]' },
  { name: 'Taktyka: Macieja–Shabalov', level: 1, goal: 'tac', mn: 0, fen: '4r3/p5pk/1p3nbp/3pQ3/3N4/P1q2P1P/2P3P1/R1R3K1 w - - 0 24', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Macieja–Shabalov 2001 [C18].', sol: 'Qf4 (+1.8 dla białych)', accept: ['e5f4'], pv: '24. Qf4 Nh5 25. Qh4 Ng3 26. Qxg3 Qxd4+ 27. Qf2 Qc4', meta: 'Macieja–Shabalov 2001 [C18]' },
  { name: 'Taktyka: Shabalov–Stefansson', level: 3, goal: 'tac', mn: 0, fen: 'r2q1rk1/1bp2pp1/pbnp1n1p/1p4B1/P2PP3/NB3N2/1P3PPP/R2Q1RK1 w - - 0 13', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Shabalov–Stefansson 2001 [C78].', sol: 'Bxf6 (+0.9 dla białych)', accept: ['g5f6'], pv: '13. Bxf6 Qxf6 14. Bd5 Rfb8 15. Nc2 bxa4 16. Rxa4 a5', meta: 'Shabalov–Stefansson 2001 [C78]' },
  { name: 'Taktyka: Stefansson–Lesiege', level: 2, goal: 'tac', mn: 0, fen: '2q2rk1/3b2p1/3p1p1p/Pp1P4/2P1rQP1/P1Bp4/5PKP/4R3 w - - 0 25', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Stefansson–Lesiege 2001 [A35].', sol: 'Rxe4 (+1.6 dla białych)', accept: ['e1e4'], pv: '25. Rxe4 Re8 26. Rd4 h5 27. h3 hxg4 28. hxg4 Re5', meta: 'Stefansson–Lesiege 2001 [A35]' },
  { name: 'Taktyka: Gershon–Macieja', level: 2, goal: 'tac', mn: 0, fen: 'r3qrk1/2p3p1/1pn1p2p/2PpPp2/pPnP1B1P/P4N2/4QPP1/R4RK1 w - - 1 20', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Gershon–Macieja 2001 [E14].', sol: 'b5 (+2.2 dla białych)', accept: ['b4b5'], pv: '20. b5 bxc5 21. bxc6 Qxc6', meta: 'Gershon–Macieja 2001 [E14]' },
  { name: 'Taktyka: Shabalov–Lesiege', level: 1, goal: 'tac', mn: 0, fen: 'r1b2rk1/1pq1bppp/p2ppn2/8/3nPP2/2N1B1Q1/PPP1B1PP/R4RK1 w - - 0 12', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Shabalov–Lesiege 2001 [B85].', sol: 'Bxd4 (+1.4 dla białych)', accept: ['e3d4'], pv: '12. Bxd4 d5 13. Kh1 Rd8 14. exd5 exd5 15. Bf3 Be6', meta: 'Shabalov–Lesiege 2001 [B85]' },
  { name: 'Taktyka: Shabalov–Lesiege', level: 1, goal: 'tac', mn: 0, fen: '3r1rk1/1q2bppp/p1bppn2/8/3BPP2/P2B2Q1/2P3PP/3NRR1K w - - 1 19', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Shabalov–Lesiege 2001 [B85].', sol: 'Nb2 (+5.6 dla białych)', accept: ['d1b2'], pv: '19. Nb2 h6 20. Nc4 Bxe4 21. Bxe4', meta: 'Shabalov–Lesiege 2001 [B85]' },
  { name: 'Taktyka: Macieja–Lesiege', level: 1, goal: 'tac', mn: 0, fen: '2r1qrk1/p1n1b2p/1pb1p3/4Ppp1/P7/1N4P1/1PQBPP1P/2RR2K1 w - - 0 20', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Macieja–Lesiege 2001 [A90].', sol: 'Qxc6 (+2.6 dla białych)', accept: ['c2c6'], pv: '20. Qxc6 f4 21. Qxe8 Rfxe8 22. gxf4 gxf4 23. Bxf4 Nd5', meta: 'Macieja–Lesiege 2001 [A90]' },
  { name: 'Taktyka: Macieja–Lesiege', level: 2, goal: 'tac', mn: 0, fen: '4qr2/pQ2bk2/1p2p2p/3nPNp1/P7/6P1/1P1BPP1P/2rR2K1 w - - 0 24', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Macieja–Lesiege 2001 [A90].', sol: 'Rxc1 (+5.4 dla białych)', accept: ['d1c1'], pv: '24. Rxc1 Kg8 25. Nxh6+ Kg7 26. Bxg5 Kg6 27. Bxe7 Qxe7', meta: 'Macieja–Lesiege 2001 [A90]' },
  { name: 'Taktyka: Gershon–Shabalov', level: 1, goal: 'tac', mn: 0, fen: '1r4k1/1bq3pp/pp1np3/2p3P1/2P3P1/1P2BB1P/P4Q2/3R2K1 w - - 1 25', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Gershon–Shabalov 2001 [B23].', sol: 'Bf4 (+4.8 dla białych)', accept: ['e3f4'], pv: '25. Bf4 Bxf3 26. Qxf3 Rd8 27. Qd3 Qe7 28. Bxd6 Qxg5', meta: 'Gershon–Shabalov 2001 [B23]' },
  { name: 'Taktyka: Hracek–Lutz', level: 3, goal: 'tac', mn: 0, fen: 'r4rk1/1b1pbppp/p1q1p3/4P3/2p2P2/P2BB3/1P2Q1PP/R2R2K1 w - - 0 17', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Hracek–Lutz 2001 [B48].', sol: 'Bxc4 (+0.8 dla białych)', accept: ['d3c4'], pv: '17. Bxc4 Bc5 18. Bxc5 Qxc5+ 19. Kh1 Rac8 20. Bxa6 Bxa6', meta: 'Hracek–Lutz 2001 [B48]' },
  { name: 'Taktyka: Baklan–Andersson', level: 1, goal: 'tac', mn: 0, fen: 'r2qk1r1/5pQ1/p1p1bn1p/b1Bp4/8/P1NB4/1PP2PPP/R3K2R w KQq - 1 15', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Baklan–Andersson 2001 [B46].', sol: 'Qxh6 (+2.3 dla białych)', accept: ['g7h6'], pv: '15. Qxh6 Rxg2 16. O-O-O Kd7 17. Rhg1 Rxg1 18. Rxg1 Qh8', meta: 'Baklan–Andersson 2001 [B46]' },
  { name: 'Taktyka: Baklan–Andersson', level: 1, goal: 'tac', mn: 0, fen: 'r2qk3/3n1p2/p1Q1b3/3p4/1b6/P1NB4/1PP2PrP/R3K2R w KQ - 0 20', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Baklan–Andersson 2001 [B46].', sol: 'axb4 (+2.8 dla białych)', accept: ['a3b4'], pv: '20. axb4 Rc8 21. Qd6 Qe7 22. Qxe7+ Kxe7 23. Bxa6 Rb8', meta: 'Baklan–Andersson 2001 [B46]' },
  { name: 'Taktyka: Baklan–Andersson', level: 3, goal: 'tac', mn: 0, fen: '2r1k3/3n1p2/p2Qb3/3p4/1P5P/2N5/1PP1Bqr1/2KR3R w - - 0 25', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Baklan–Andersson 2001 [B46].', sol: 'Kb1 (+4.4 dla białych)', accept: ['c1b1'], pv: '25. Kb1 d4 26. Rxd4 Rg1+ 27. Rxg1 Qxg1+ 28. Rd1', meta: 'Baklan–Andersson 2001 [B46]' },
  { name: 'Taktyka: Georgiev–Bacrot', level: 1, goal: 'tac', mn: 0, fen: 'r2q1rk1/pp2ppbp/6p1/n7/2BPP1b1/4BP2/P3N1PP/R2Q1RK1 w - - 1 13', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Georgiev–Bacrot 2001 [D88].', sol: 'Qc1 (+4.5 dla białych)', accept: ['d1c1'], pv: '13. Qc1 Nxc4 14. Qxc4 h5 15. fxg4', meta: 'Georgiev–Bacrot 2001 [D88]' },
  { name: 'Taktyka: Georgiev–Bacrot', level: 1, goal: 'tac', mn: 0, fen: 'r2q1rk1/1n1bppbp/p5p1/8/3PP3/4BP2/P3N1PP/1R1Q1RK1 w - - 0 16', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Georgiev–Bacrot 2001 [D88].', sol: 'Rxb7 (+1.5 dla białych)', accept: ['b1b7'], pv: '16. Rxb7 Rb8 17. Rxb8 Qxb8 18. Qd2 Rc8 19. Rc1 Rxc1+', meta: 'Georgiev–Bacrot 2001 [D88]' },
  { name: 'Taktyka: Georgiev–Bacrot', level: 1, goal: 'tac', mn: 0, fen: 'r1r3k1/2q1pp1p/pR4p1/1b1P4/4P3/2b1BP2/P1Q2RPP/2N3K1 w - - 3 23', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Georgiev–Bacrot 2001 [D88].', sol: 'f4 (+5.8 dla białych)', accept: ['f3f4'], pv: '23. f4 a5 24. Rxb5', meta: 'Georgiev–Bacrot 2001 [D88]' },
  { name: 'Taktyka: Anastasian–Sakaev', level: 2, goal: 'tac', mn: 0, fen: 'r1b1r1k1/pp2qpbp/2p1n1p1/4p2n/2P1P3/2N1BNPP/PPQ2PB1/3R1RK1 w - - 5 15', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Anastasian–Sakaev 2001 [A11].', sol: 'g4 (+4.2 dla białych)', accept: ['g3g4'], pv: '15. g4 h6 16. gxh5 gxh5', meta: 'Anastasian–Sakaev 2001 [A11]' },
  { name: 'Taktyka: Anastasian–Sakaev', level: 2, goal: 'tac', mn: 0, fen: 'r1b1rqk1/pp3pbp/2p1n1p1/4p2n/2P1P3/2N1BNPP/PPQ2PB1/3RR1K1 w - - 7 16', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Anastasian–Sakaev 2001 [A11].', sol: 'g4 (+4.7 dla białych)', accept: ['g3g4'], pv: '16. g4 b6 17. gxh5 gxh5', meta: 'Anastasian–Sakaev 2001 [A11]' },
  { name: 'Taktyka: Anastasian–Sakaev', level: 2, goal: 'tac', mn: 0, fen: 'r1b1rqk1/p4pbp/1pp1n1p1/4p2n/2P1P3/2N1BNPP/PP2QPB1/3RR1K1 w - - 0 17', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Anastasian–Sakaev 2001 [A11].', sol: 'g4 (+4.3 dla białych)', accept: ['g3g4'], pv: '17. g4 f6 18. gxh5 gxh5', meta: 'Anastasian–Sakaev 2001 [A11]' },
  { name: 'Taktyka: Kobalija–Psakhis', level: 1, goal: 'tac', mn: 0, fen: '5k2/pnq2ppp/1p6/1BnrpP2/P5P1/2P1BP2/Q5KP/8 w - - 0 27', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Kobalija–Psakhis 2001 [E25].', sol: 'Qxd5 (+1.4 dla białych)', accept: ['a2d5'], pv: '27. Qxd5 a6 28. Bc4 Nxa4 29. Bxa6 Nac5 30. Bb5 Kg8', meta: 'Kobalija–Psakhis 2001 [E25]' },
  { name: 'Taktyka: Ibragimov–Anastasian', level: 3, goal: 'tac', mn: 0, fen: 'rn1qr1k1/p2p1ppp/1p3n2/2pP4/4P3/P1N5/1P2bPPP/R1BQ1RK1 w - - 0 13', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Ibragimov–Anastasian 2001 [E42].', sol: 'Qxe2 (+1.3 dla białych)', accept: ['d1e2'], pv: '13. Qxe2 d6 14. Bf4 a6 15. g4 h6 16. h4 Nh7', meta: 'Ibragimov–Anastasian 2001 [E42]' },
  { name: 'Taktyka: Ibragimov–Anastasian', level: 2, goal: 'tac', mn: 0, fen: '4r1k1/2qnrp1p/1p1p4/pPpP2pn/4P3/P1N4P/2Q2PPB/3RR1K1 w - - 0 22', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Ibragimov–Anastasian 2001 [E42].', sol: 'g4 (+4.0 dla białych)', accept: ['g2g4'], pv: '22. g4 Ndf6 23. gxh5 Nxh5', meta: 'Ibragimov–Anastasian 2001 [E42]' },
  { name: 'Taktyka: Akopian–Kobalija', level: 3, goal: 'tac', mn: 0, fen: 'rq2kb1r/3p1ppp/pp2b2n/2p1P1N1/2N5/1P6/nB1KQPPP/3R1B1R w kq - 8 20', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Akopian–Kobalija 2001 [B40].', sol: 'f4 (+2.3 dla białych)', accept: ['f2f4'], pv: '20. f4 Nf5 21. Qd3', meta: 'Akopian–Kobalija 2001 [B40]' },
  { name: 'Taktyka: Zhang Zhong–Arencibia', level: 2, goal: 'tac', mn: 0, fen: '2k4r/2nr1pbp/p1q5/1ppp4/2P3P1/PB4B1/1P1Q3P/1K1R3R w - - 0 23', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Zhang Zhong–Arencibia 2001 [B01].', sol: 'cxd5 (+1.8 dla białych)', accept: ['c4d5'], pv: '23. cxd5 Rhd8 24. Qf4 Qf6 25. Qxf6 Bxf6 26. Rhf1 Bd4', meta: 'Zhang Zhong–Arencibia 2001 [B01]' },
  { name: 'Taktyka: Anastasian–Kacheishvili', level: 1, goal: 'tac', mn: 0, fen: 'r4rk1/1pp2pp1/p1nbbq1p/3p4/3P4/1QN1PN2/PP2BPPP/R4RK1 w - - 2 13', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Anastasian–Kacheishvili 2001 [D38].', sol: 'Qxb7 (+4.8 dla białych)', accept: ['b3b7'], pv: '13. Qxb7 Nb4 14. a3 c5 15. axb4', meta: 'Anastasian–Kacheishvili 2001 [D38]' },
  { name: 'Taktyka: Anastasian–Kacheishvili', level: 1, goal: 'tac', mn: 0, fen: '5rk1/R7/pp4rp/3p4/1P2q1p1/P3PP1b/3Q2pP/2R1N1K1 w - - 0 33', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Anastasian–Kacheishvili 2001 [D38].', sol: 'Rg7+ (+4.0 dla białych)', accept: ['a7g7'], pv: '33. Rg7+ Rxg7 34. fxe4', meta: 'Anastasian–Kacheishvili 2001 [D38]' },
  { name: 'Taktyka: Kobalija–Eljanov', level: 2, goal: 'tac', mn: 0, fen: '1r4k1/pp2rppp/3b4/8/1PpNn3/P5PP/1B2PPB1/4R1K1 w - - 0 24', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Kobalija–Eljanov 2001 [D34].', sol: 'Nf5 (+1.4 dla białych)', accept: ['d4f5'], pv: '24. Nf5 c3 25. Ba1 Rbe8 26. Nxe7+ Rxe7 27. Bxe4 Rxe4', meta: 'Kobalija–Eljanov 2001 [D34]' },
  { name: 'Taktyka: Kacheishvili–Bruzon', level: 2, goal: 'tac', mn: 0, fen: 'r2r2k1/pq3pp1/1p3n1p/1Qbp4/8/2N1PNP1/PP3PP1/R2R2K1 w - - 2 19', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Kacheishvili–Bruzon 2001 [D58].', sol: 'Na4 (+3.7 dla białych)', accept: ['c3a4'], pv: '19. Na4 a6 20. Nxc5', meta: 'Kacheishvili–Bruzon 2001 [D58]' },
  { name: 'Taktyka: Agrest–Gofshtein', level: 1, goal: 'tac', mn: 0, fen: 'r2qr1k1/ppp2ppp/2n2n2/4pb2/2P5/PPQ1PN2/1B3PPP/R3KB1R w KQ - 1 12', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Agrest–Gofshtein 2001 [E33].', sol: 'Nh4 (+4.3 dla białych)', accept: ['f3h4'], pv: '12. Nh4 a5', meta: 'Agrest–Gofshtein 2001 [E33]' },
  { name: 'Taktyka: Georgiev–Miezis', level: 2, goal: 'tac', mn: 0, fen: '4rr1k/pb5p/2pq1n2/3p4/1P3p2/P2N4/B3PP1P/2RQ1R1K w - - 2 22', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Georgiev–Miezis 2001 [A40].', sol: 'Nc5 (+2.3 dla białych)', accept: ['d3c5'], pv: '22. Nc5 Qe5 23. Nxb7 Qxe2 24. Qxe2 Rxe2', meta: 'Georgiev–Miezis 2001 [A40]' },
  { name: 'Taktyka: Georgiev–Miezis', level: 1, goal: 'tac', mn: 0, fen: '5r1k/p6p/2p2qb1/2N5/1PBp1p2/P1n1rP2/3RP1QP/6RK w - - 11 30', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Georgiev–Miezis 2001 [A40].', sol: 'Nd7 (+5.2 dla białych)', accept: ['c5d7'], pv: '30. Nd7 Qf5 31. Nxf8 Qxf8 32. Rxd4 Qf6 33. Rd7 Re8', meta: 'Georgiev–Miezis 2001 [A40]' },
  { name: 'Taktyka: Agrest–Georgiev', level: 3, goal: 'tac', mn: 0, fen: 'r1bq1rk1/pppp1ppp/2n2n2/3N4/1bP1p3/4PN2/PPQP1PPP/R1B1KB1R w KQ - 0 7', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Agrest–Georgiev 2001 [A28].', sol: 'Nxf6+ (+1.5 dla białych)', accept: ['d5f6'], pv: '7. Nxf6+ Qxf6 8. Qxe4 Be7 9. Bd3 Qg6 10. Qxg6 hxg6', meta: 'Agrest–Georgiev 2001 [A28]' },
  { name: 'Taktyka: Agrest–Georgiev', level: 2, goal: 'tac', mn: 0, fen: 'r1b2rk1/pppp1ppp/2n2q2/8/1bP1p3/4PN2/PPQP1PPP/R1B1KB1R w KQ - 0 8', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Agrest–Georgiev 2001 [A28].', sol: 'Qxe4 (+1.5 dla białych)', accept: ['c2e4'], pv: '8. Qxe4 Be7 9. Bd3 Qg6 10. O-O d6 11. Qxg6 fxg6', meta: 'Agrest–Georgiev 2001 [A28]' },
  { name: 'Taktyka: Agrest–Georgiev', level: 1, goal: 'tac', mn: 0, fen: 'r1b2rk1/ppp2p1p/2np2p1/8/1bP4q/3BPN2/PP1P1PPP/R1B1K2R w KQ - 0 11', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Agrest–Georgiev 2001 [A28].', sol: 'Nxh4 (+1.2 dla białych)', accept: ['f3h4'], pv: '11. Nxh4 Bc5 12. a3 Re8 13. O-O Be6 14. b4 Ne5', meta: 'Agrest–Georgiev 2001 [A28]' },
  { name: 'Taktyka: Shabalov–Macieja', level: 1, goal: 'tac', mn: 0, fen: '6r1/3pk3/1r1bp3/p1p2p2/7q/1P3RP1/P1P1B1PP/3R2K1 w - - 0 26', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Shabalov–Macieja 2001 [B49].', sol: 'gxh4 (+1.0 dla białych)', accept: ['g3h4'], pv: '26. gxh4 Be5 27. g3 a4 28. Kg2 axb3 29. axb3 Ra8', meta: 'Shabalov–Macieja 2001 [B49]' },
  { name: 'Taktyka: Shabalov–Macieja', level: 3, goal: 'tac', mn: 0, fen: '8/2r3r1/3kpb2/p1p2p1P/2Rp4/PP3B2/2P3PP/3R1K2 w - - 3 35', tip: 'Znajdź najsilniejszy ruch (białe). Z partii: Shabalov–Macieja 2001 [B49].', sol: 'Re1 (+2.2 dla białych)', accept: ['d1e1'], pv: '35. Re1 f4 36. h6', meta: 'Shabalov–Macieja 2001 [B49]' },
];






export function sqToAlg(sq: number): string {
  const f = 'abcdefgh'[sq % 8];
  const r = 8 - Math.floor(sq / 8);
  return `${f}${r}`;
}
export function algToSq(alg: string): number {
  const f = alg.charCodeAt(0) - 97;
  const r = 8 - parseInt(alg[1], 10);
  return r * 8 + f;
}
// Ruch czarnych? (helper omija zawężanie literałów TS przy refach)
export function isBlackTurn(s: 'w' | 'b'): boolean {
  return s === 'b';
}
function positionKey(b: (string | null)[], side: 'w' | 'b', castle: { wk: boolean; wq: boolean; bk: boolean; bq: boolean }, ep: number): string {
  return b.map(p => p || '.').join('') + side + (castle.wk ? 'K' : '') + (castle.wq ? 'Q' : '') + (castle.bk ? 'k' : '') + (castle.bq ? 'q' : '') + ep;
}
function isInsufficientMaterial(b: (string | null)[]): boolean {
  const pieces: { p: string; sq: number }[] = [];
  b.forEach((p, sq) => { if (p && p.toUpperCase() !== 'K') pieces.push({ p, sq }); });
  if (pieces.length === 0) return true;
  if (pieces.length === 1) {
    const t = pieces[0].p.toUpperCase();
    if (t === 'B' || t === 'N') return true;
  }
  if (pieces.length === 2 && pieces.every(x => x.p.toUpperCase() === 'B')) {
    const colors = pieces.map(x => (Math.floor(x.sq / 8) + (x.sq % 8)) % 2);
    if (colors[0] === colors[1]) return true;
  }
  return false;
}

// 👑 KINGDOM - ORYGINALNE obrysy z fontu CHESS KINGDOM v1.1 (Armando H. Marroquin, 1998, freeware)
// Font z ~/Pobrane/kingdom/KINGFONT.TTF. Mapowanie klawiszy wg README_A.TXT:
// białe figury: p n b r q k (kontury), czarne: o m v t w l (pełne z wycięciami).
const KINGDOM_D: Record<string, string> = {
  p: 'M55 58L55 44L45 44L45 58Q41 60 39 63Q36 67 36 71Q36 77 40 81Q44 85 50 85Q56 85 60 81Q64 77 64 71Q64 67 61 63Q59 60 57 59ZM57 87Q53 88 50 88Q46 88 43 87L40 93L60 93ZM45 33Q42 31 42 27Q42 24 45 22Q47 19 50 19Q53 19 55 22Q58 24 58 27Q58 31 55 33L64 44L58 44L58 56Q62 59 64 63Q67 67 67 71Q67 76 65 80Q63 83 59 85L65 96L35 96L41 85Q33 81 33 71Q33 67 36 63Q38 59 42 56L42 44L36 44ZM52 34Q51 35 50 35Q49 35 48 34L42 41L58 41ZM50 22Q45 22 45 27Q45 32 50 32Q55 32 55 27Q55 22 52 22Z',
  o: 'M45 33Q42 31 42 27Q42 24 45 22Q47 19 50 19Q53 19 55 22Q58 24 58 27Q58 31 55 33L64 44L58 44L58 56Q62 59 64 63Q67 67 67 71Q67 76 65 80Q63 83 59 85L65 96L35 96L41 85Q33 81 33 71Q33 67 36 63Q38 59 42 56L42 44L36 44Z',
  n: 'M25 65Q24 65 23 66Q23 68 22 68Q21 68 21 67Q20 66 21 65Q22 63 25 63Q25 64 25 64ZM34 61Q34 62 33 62Q32 62 32 61Q32 61 33 60Q34 59 35 58Q37 56 41 55Q42 55 42 56Q42 56 42 57Q41 57 40 57Q41 60 44 61Q46 61 49 59Q51 57 52 53Q52 52 52 50Q52 48 53 48Q54 48 54 50Q54 52 54 54Q54 57 52 59Q54 59 56 57Q57 57 57 57Q58 57 58 58Q58 58 58 59Q55 61 52 62Q52 62 52 62Q52 62 52 62Q53 62 54 62Q55 62 56 62Q57 62 57 64Q57 65 56 65Q55 65 54 65Q52 65 49 64Q48 66 47 68Q46 69 44 72Q40 77 38 82Q35 86 35 93L78 93Q77 78 76 67Q74 57 70 49Q66 41 61 37Q55 34 49 34Q48 32 47 30Q45 26 45 26Q44 26 44 31Q43 33 43 33Q43 33 43 34Q43 35 42 35Q41 36 41 35L39 34Q38 33 37 32Q37 32 37 33Q37 34 35 36Q34 37 33 40Q32 42 32 43Q32 45 32 46Q31 50 30 52Q30 53 29 54Q29 55 28 56Q27 57 27 57Q26 58 25 59Q23 61 22 62Q21 63 20 64Q18 65 18 66Q18 68 19 70Q20 70 20 71Q21 72 22 71Q23 70 23 69Q23 69 24 69Q25 67 26 67Q26 67 27 67Q28 67 29 68Q30 69 30 70Q29 73 27 73Q25 74 25 74Q26 75 27 75Q29 75 29 74Q30 73 31 72Q32 70 33 69Q34 67 35 66Q35 65 36 63Q37 62 39 61Q38 60 37 59Q37 59 36 59Q35 60 35 61ZM35 45Q37 43 38 41Q38 41 39 40Q41 40 41 42Q41 42 41 42Q41 42 41 42Q40 43 40 43Q41 44 41 45Q41 47 39 48Q38 48 37 47Q36 47 36 47Q36 47 36 47Q34 48 34 46Q34 45 34 45ZM81 96L32 96Q32 82 37 77Q39 74 41 71Q44 68 46 63Q44 64 43 63Q43 63 41 63Q39 64 38 65Q37 66 36 67Q33 73 32 75Q30 78 28 77Q26 76 25 76Q24 76 24 76Q23 75 23 74Q24 72 25 72Q28 71 28 70Q28 69 26 69Q25 69 23 72Q22 73 21 74Q19 75 18 72Q17 71 17 70Q16 69 16 67Q16 65 17 63Q18 61 19 61Q20 60 21 59Q22 59 22 58Q24 57 26 54Q27 51 28 49Q28 47 29 45Q29 42 30 39Q31 37 33 33Q33 32 33 31Q33 29 33 29Q33 28 33 27Q33 24 34 24Q35 24 36 24Q36 25 38 27Q40 30 41 31Q41 28 43 25Q44 22 45 22Q46 22 46 23Q47 25 48 26Q48 27 49 28Q49 29 50 31L58 30L59 33L65 33L65 37L71 38L70 42L77 46L73 48L79 53L76 55L82 60L78 62L84 68L79 68L84 75L80 76L84 83L80 83L83 89L80 91L83 94Z',
  m: 'M45 29Q45 29 45 30Q44 31 44 32Q44 34 45 34Q45 33 46 33Q47 33 47 33Q48 33 48 32Q47 31 46 30Q46 29 46 29ZM37 31Q36 31 36 34Q36 35 37 35Q37 35 38 35Q39 35 39 35Q40 35 40 34Q39 33 38 32Q38 31 37 31ZM78 93Q77 78 76 67Q74 57 70 49Q67 42 63 39Q59 36 54 35Q51 34 51 36Q51 37 53 37Q58 39 62 42Q65 45 68 52Q71 60 73 69Q74 79 74 93ZM25 65Q25 64 25 63Q22 63 21 65Q20 66 20 67Q21 68 22 68Q23 68 23 66Q24 65 24 65ZM49 64Q52 65 54 65Q55 65 56 65Q57 65 57 64Q57 62 56 62Q55 62 54 62Q53 62 52 62Q52 62 52 62Q52 62 52 62Q55 61 58 59Q58 58 58 58Q58 57 57 57Q57 57 56 57Q54 59 52 59Q54 57 54 54Q54 52 54 50Q54 48 53 48Q52 48 52 50Q52 52 52 53Q51 57 48 60Q47 60 47 62Q47 63 48 64ZM39 61Q40 62 40 62Q42 62 42 60Q42 60 41 59Q40 59 40 58Q41 57 42 57Q43 56 42 56Q42 55 41 55Q37 56 35 58Q34 59 33 60Q32 61 32 61Q32 63 33 62Q34 62 34 61Q35 60 37 59Q37 59 37 59Q38 60 39 61ZM34 45Q32 45 33 46Q33 48 35 48Q35 48 36 47Q37 48 38 48Q40 48 40 45Q40 44 39 43Q40 42 40 42Q40 42 40 42Q40 42 40 42Q40 40 38 40Q37 40 37 41Q36 43 35 44ZM81 96L32 96Q32 82 37 77Q39 74 41 71Q44 68 46 63Q44 64 43 63Q43 63 41 63Q39 64 38 65Q37 66 36 67Q33 73 32 75Q30 78 28 77Q26 76 25 76Q24 76 24 76Q23 75 23 74Q24 73 26 72Q28 71 28 70Q28 68 26 69Q25 69 23 72Q22 73 21 74Q19 75 18 72Q17 71 17 70Q16 69 16 67Q16 65 17 63Q18 61 19 61Q20 60 21 59Q22 59 22 58Q24 57 26 54Q27 51 28 49Q28 47 29 45Q29 42 30 39Q31 37 33 33Q33 32 33 31Q33 29 33 29Q33 28 33 27Q33 24 34 24Q35 24 36 24Q36 25 38 27Q40 30 41 31Q41 28 43 25Q44 22 45 22Q46 22 46 23Q47 25 48 26Q48 27 49 28Q49 29 50 31L58 30L59 33L65 33L65 37L71 38L70 42L77 46L73 48L79 53L76 55L82 60L78 62L84 68L79 68L84 75L80 76L84 83L80 83L83 89L80 91L83 94Z',
  b: 'M50 86Q42 91 34 91Q30 91 26 89Q22 88 19 86Q19 87 19 87Q19 87 19 88Q19 88 19 88Q20 88 20 88Q18 88 17 89Q25 94 34 94Q42 94 50 89Q58 94 66 94Q75 94 83 89Q82 88 80 88Q81 88 81 88Q81 87 81 87Q81 87 81 86Q78 88 74 89Q71 91 66 91Q58 91 54 88ZM50 83Q58 88 66 88Q71 88 76 86Q81 84 85 81Q85 82 84 84Q83 86 83 87Q83 87 84 88Q86 89 88 91Q89 92 89 94Q88 95 87 95Q87 94 87 94Q87 91 85 91Q84 91 83 92Q75 96 66 96Q58 96 50 92Q42 96 34 96Q25 96 17 92Q16 91 15 91Q13 91 13 94Q13 94 13 95Q13 95 13 95Q12 94 12 94Q11 92 12 91Q13 89 16 88Q16 87 17 87Q17 86 16 84Q15 82 16 81Q19 84 24 86Q29 88 34 88Q42 88 46 86ZM61 64Q64 58 65 55Q66 52 65 48Q65 43 60 37Q56 32 50 29Q43 32 39 38Q35 43 35 48Q35 52 35 55Q36 59 39 64Q42 63 47 63L47 51L41 51L41 44L47 44L47 37L53 37L53 44L59 44L59 51L53 51L53 63Q57 63 59 63ZM51 63L51 49L57 49L57 46L51 46L51 39L49 39L49 46L43 46L43 49L49 49L49 63Q49 63 50 63Q50 63 51 63Q51 63 51 63ZM62 69L61 80Q61 81 58 82Q54 83 50 83Q45 83 42 82Q39 81 39 80L38 69Q35 64 33 59Q32 54 32 49Q32 35 47 28Q47 27 47 26Q46 25 46 23Q46 19 50 19Q54 19 54 23Q54 25 53 26Q53 28 53 28Q54 29 55 29Q56 29 57 28Q57 28 57 26Q56 25 56 23Q56 19 60 19Q65 19 65 23Q65 26 63 27Q62 28 63 28Q70 37 69 49Q69 53 68 56Q68 59 66 62Q65 64 64 65Q63 67 63 68ZM50 76Q46 76 44 77Q41 77 41 78Q41 79 44 80Q46 81 50 81Q54 81 56 80Q59 79 59 78Q59 77 56 77Q54 76 52 76ZM59 75L60 66Q56 65 50 65Q45 65 40 66L41 75Q44 74 50 74Q56 74 58 74ZM60 21Q59 21 59 23Q59 25 60 25Q62 25 62 23Q62 21 61 21ZM50 21Q48 21 48 23Q48 25 50 25Q52 25 52 23Q52 21 51 21ZM55 69L50 71L46 69L50 68ZM68 49Q68 47 66 40Q64 34 60 29Q59 29 59 29Q58 29 58 30Q57 30 57 31Q62 34 65 40Q68 46 68 48Z',
  v: 'M60 65Q56 64 50 64Q44 64 40 65L40 68Q45 67 50 67Q56 67 60 68ZM41 80Q42 79 44 78Q47 78 50 78Q54 78 56 78Q59 79 59 80L59 77Q56 75 50 75Q47 75 45 76Q42 76 41 77ZM55 71L50 69L45 71L50 73ZM67 52Q68 49 67 42Q65 34 60 31Q59 30 59 30Q58 30 57 31Q56 32 57 33Q63 37 65 43Q67 49 67 50ZM50 21Q48 21 48 23Q48 25 50 25Q52 25 52 23Q52 21 51 21ZM60 21Q59 21 59 23Q59 25 60 25Q62 25 62 23Q62 21 61 21ZM62 69L61 80Q61 81 58 82Q54 83 50 83Q45 83 42 82Q39 81 39 80L38 69Q35 64 33 59Q32 54 32 49Q32 35 47 28Q47 27 47 26Q46 25 46 23Q46 19 50 19Q54 19 54 23Q54 25 53 26Q53 28 53 28Q54 29 55 29Q56 29 57 28Q57 28 57 26Q56 25 56 23Q56 19 60 19Q65 19 65 23Q65 26 63 27Q62 28 63 28Q70 37 69 49Q69 53 68 56Q68 59 66 62Q65 64 64 65Q63 67 63 68ZM50 83Q57 90 66 90Q71 90 76 87Q81 84 85 81Q85 82 84 84Q83 86 83 87Q83 87 84 88Q86 89 88 91Q89 92 89 94Q88 95 87 95Q87 94 87 94Q87 91 85 91Q84 91 83 92Q75 96 66 96Q62 96 58 95Q54 93 50 91Q46 93 42 95Q38 96 34 96Q25 96 17 92Q16 91 15 91Q13 91 13 94Q13 94 13 95Q13 95 13 95Q12 94 12 94Q11 92 12 91Q13 89 16 88Q16 87 17 87Q17 86 16 84Q15 82 16 81Q19 84 24 87Q29 90 34 90Q38 90 42 88Q47 86 48 85ZM50 38L48 38L48 45L42 45L42 50L48 50L48 62L52 62L52 50L58 50L58 45L52 45L52 38Z',
  r: 'M73 78L76 81L76 84L79 84L79 96L21 96L21 84L24 84L24 81L27 78L30 78L30 38L24 38L24 19L35 19L35 26L44 26L44 19L56 19L56 26L65 26L65 19L76 19L76 38L70 38L70 78ZM71 81L29 81L27 82L27 84L73 84L73 82ZM58 38L58 45L67 45L67 38ZM45 38L45 45L55 45L55 38ZM33 38L33 45L42 45L42 38ZM52 48L52 56L61 56L61 48ZM39 48L39 56L48 56L48 48ZM64 48L64 56L67 56L67 48ZM33 48L33 56L36 56L36 48ZM64 70L64 78L67 78L67 70ZM52 70L52 78L61 78L61 70ZM39 70L39 78L48 78L48 70ZM58 59L58 67L67 67L67 59ZM45 59L45 67L55 67L55 59ZM33 59L33 67L42 67L42 59ZM33 70L33 78L36 78L36 70ZM24 87L24 93L76 93L76 87ZM50 35L73 35L73 22L68 22L68 29L53 29L53 22L47 22L47 29L32 29L32 22L27 22L27 35Z',
  t: 'M27 84L27 88L73 88L73 84ZM73 78L76 81L76 84L79 84L79 96L21 96L21 84L24 84L24 81L27 78L33 78L33 81L67 81L67 78ZM59 38L70 38L70 45L59 45ZM44 38L56 38L56 45L44 45ZM30 38L30 45L41 45L41 38ZM52 48L62 48L62 56L52 56ZM38 48L48 48L48 56L38 56ZM65 48L70 48L70 56L65 56ZM30 48L35 48L35 56L30 56ZM65 70L70 70L70 78L65 78ZM52 70L62 70L62 78L52 78ZM38 70L48 70L48 78L38 78ZM59 59L70 59L70 67L59 67ZM44 59L56 59L56 67L44 67ZM30 59L41 59L41 67L30 67ZM30 70L35 70L35 78L30 78ZM67 38L67 35L33 35L33 38L24 38L24 19L35 19L35 26L44 26L44 19L56 19L56 26L65 26L65 19L76 19L76 38Z',
  q: 'M73 81Q73 80 73 78L69 78L72 81ZM27 81L28 81L30 79L27 78Q27 79 27 80ZM74 90Q66 86 50 86Q34 86 26 90Q34 93 50 93Q58 93 64 92Q71 91 72 91ZM74 71Q74 70 74 69Q74 69 74 68Q74 63 75 58Q73 61 69 61Q67 61 65 60Q63 58 63 55Q63 55 63 55Q64 52 63 52Q63 52 62 53Q61 58 57 58Q54 58 52 56Q50 54 50 51Q50 50 50 50Q49 50 49 51Q49 54 48 56Q46 58 43 58Q39 58 37 53Q37 52 37 52Q36 52 37 55Q37 55 37 55Q37 55 37 55Q37 58 35 60Q33 61 30 61Q27 61 25 58Q26 63 26 68Q26 70 26 71Q35 68 50 68Q65 68 70 69ZM84 46Q82 46 80 44Q78 42 78 39Q78 36 80 34Q82 32 84 32Q87 32 89 34Q91 36 91 39Q91 42 89 44Q87 46 86 46ZM84 42Q88 42 88 39Q88 36 84 36Q81 36 81 39Q81 42 83 42ZM16 42Q19 42 19 39Q19 36 16 36Q12 36 12 39Q12 42 14 42ZM16 46Q13 46 11 44Q9 42 9 39Q9 36 11 34Q13 32 16 32Q18 32 20 34Q22 36 22 39Q22 42 20 44Q18 46 17 46ZM68 38Q65 38 63 36Q61 34 61 31Q61 28 63 26Q65 24 68 24Q71 24 73 26Q75 28 75 31Q75 34 73 36Q71 38 69 38ZM68 34Q71 34 71 31Q71 28 68 28Q65 28 65 31Q65 34 66 34ZM32 34Q35 34 35 31Q35 28 32 28Q29 28 29 31Q29 34 30 34ZM32 38Q29 38 27 36Q25 34 25 31Q25 28 27 26Q29 24 32 24Q35 24 37 26Q39 28 39 31Q39 34 37 36Q35 38 33 38ZM50 29Q53 29 53 26Q53 23 50 23Q47 23 47 26Q47 29 48 29ZM50 33Q47 33 45 31Q43 29 43 26Q43 23 45 21Q47 19 50 19Q53 19 55 21Q57 23 57 26Q57 29 55 31Q53 33 51 33ZM18 46L20 44L28 57Q29 58 30 58Q34 58 34 55Q34 55 34 55L32 38L35 38L41 53Q42 55 43 55Q46 55 46 52L48 33L51 33L53 52Q54 55 57 55Q58 55 59 53L65 38L68 38L66 55Q66 55 66 55Q66 55 66 55Q66 58 69 58Q71 58 72 57L80 44L83 45Q77 56 77 68Q77 69 77 70Q77 71 77 72Q76 77 76 81Q76 87 78 92Q75 93 68 95Q60 96 50 96Q40 96 32 95Q24 93 22 91Q24 87 24 81Q24 77 23 72Q23 71 23 70Q23 69 23 68Q23 56 20 51ZM56 77L50 80L44 77L50 75ZM73 82L71 82L66 78L73 77Q73 75 74 73Q65 71 50 71Q35 71 26 74Q26 74 27 76L34 78L29 82L27 82Q27 84 27 86Q35 83 50 83Q64 83 73 86Q73 83 73 83ZM53 77L50 76L47 77L50 79Z',
  w: 'M28 82L29 82L34 78L27 76Q28 79 28 80ZM73 91L72 87Q64 84 50 84Q36 84 28 87L27 91Q34 88 50 88Q65 88 69 90ZM72 82Q72 79 73 76L66 78L71 82ZM27 73Q35 70 50 70Q57 70 63 71Q69 71 73 72Q73 71 73 71Q74 70 74 69Q65 66 50 66Q35 66 26 69Q26 70 26 71Q27 72 27 72ZM56 77L50 74L44 77L50 81ZM18 46L20 44L28 57Q29 58 30 58Q34 58 34 55Q34 55 34 55L32 38L35 38L41 53Q42 55 43 55Q46 55 46 52L48 33L51 33L53 52Q54 55 57 55Q58 55 59 53L65 38L68 38L66 55Q66 55 66 55Q66 55 66 55Q66 58 69 58Q71 58 72 57L80 44L83 45Q77 56 77 68Q77 69 77 70Q77 71 77 72Q76 77 76 81Q76 87 78 92Q75 93 68 95Q60 96 50 96Q40 96 32 95Q24 93 22 91Q24 87 24 81Q24 77 23 72Q23 71 23 70Q23 69 23 68Q23 56 20 51ZM50 33Q47 33 45 31Q43 29 43 26Q43 23 45 21Q47 19 50 19Q53 19 55 21Q57 23 57 26Q57 29 55 31Q53 33 51 33ZM32 38Q29 38 27 36Q25 34 25 31Q25 28 27 26Q29 24 32 24Q35 24 37 26Q39 28 39 31Q39 34 37 36Q35 38 33 38ZM68 38Q65 38 63 36Q61 34 61 31Q61 28 63 26Q65 24 68 24Q71 24 73 26Q75 28 75 31Q75 34 73 36Q71 38 69 38ZM16 46Q13 46 11 44Q9 42 9 39Q9 36 11 34Q13 32 16 32Q18 32 20 34Q22 36 22 39Q22 42 20 44Q18 46 17 46ZM84 46Q82 46 80 44Q78 42 78 39Q78 36 80 34Q82 32 84 32Q87 32 89 34Q91 36 91 39Q91 42 89 44Q87 46 86 46Z',
  k: 'M56 78L50 81L44 78L50 75ZM50 37Q47 37 46 37Q44 38 44 39Q44 39 46 40Q47 40 50 40Q53 40 54 40Q56 39 56 39Q56 38 54 37Q53 37 51 37ZM50 71Q51 71 52 71Q52 70 52 69Q52 67 53 65Q53 65 53 64Q54 61 54 58Q54 50 53 43Q51 43 50 43Q49 43 47 43Q46 50 46 58Q46 61 47 64Q47 65 47 65Q48 67 48 69Q48 70 48 71Q49 71 50 71ZM44 42Q43 42 43 41Q38 45 38 50Q37 56 39 62Q40 63 40 64Q40 65 39 67Q39 68 39 69Q39 70 39 70Q40 71 40 71Q42 71 45 71Q45 70 45 69Q45 68 45 67Q44 66 44 64Q43 61 43 58Q42 50 43 46ZM34 38Q33 38 33 38Q22 44 21 52Q20 54 21 57Q22 60 23 63Q25 64 25 67Q25 67 25 67Q25 67 25 67Q24 68 25 69Q25 72 27 73Q28 73 29 73Q30 72 30 71Q30 70 30 69Q30 67 29 67Q25 60 25 53Q25 49 27 45Q29 42 31 40ZM41 40Q40 39 38 39Q33 41 31 45Q29 49 29 53Q29 59 32 65Q33 67 33 69Q33 71 32 72Q33 72 34 72Q35 72 37 71Q36 70 36 69Q36 67 37 65Q37 64 37 64Q37 63 36 62Q35 59 34 55Q34 52 34 48Q36 44 38 42ZM28 38Q28 38 28 38Q28 38 27 38Q24 38 21 40Q18 41 17 44Q14 47 14 50Q14 55 17 58Q18 60 19 61Q18 58 18 56Q18 54 18 51Q19 43 23 40ZM50 83Q58 83 64 84Q71 84 75 86L74 83L73 84L67 80L74 78L74 77Q69 75 63 74Q57 73 50 73Q43 73 37 74Q31 75 26 77L26 78L33 80L27 84L26 83L25 86Q29 84 36 84Q42 83 46 83ZM50 96Q40 96 32 95Q24 93 22 91L23 80Q24 76 23 74Q23 73 22 70Q21 67 19 65Q18 64 16 63Q15 62 14 60Q12 57 11 51Q11 45 15 41Q17 38 21 37Q24 36 28 35Q30 35 32 35Q33 35 35 36Q38 36 41 37Q44 34 50 34Q57 34 59 37Q62 36 65 36Q67 35 68 35Q70 35 72 35Q76 36 79 37Q83 38 85 41Q89 45 89 51Q88 57 86 60Q85 62 84 63Q83 64 81 65Q79 67 78 70Q77 73 77 74Q76 77 77 80L78 91Q76 93 68 95Q60 96 55 96ZM75 90Q66 86 50 86Q34 86 26 90Q34 93 50 93Q58 93 65 92Q71 91 73 90ZM56 42Q58 50 57 58Q57 61 56 64Q56 66 55 67Q55 68 55 69Q55 70 55 71Q58 71 60 71Q61 70 61 70Q61 69 61 69Q61 68 61 67Q60 65 60 64Q60 63 61 62Q63 56 62 50Q62 45 57 41Q57 42 56 42ZM66 38Q71 42 73 45Q75 49 75 53Q75 60 71 67Q70 67 70 69Q70 72 71 73Q72 73 73 73Q75 72 76 69Q76 68 75 67Q75 67 75 67Q75 67 75 67Q75 64 77 63Q79 60 79 57Q80 54 79 52Q78 44 68 38Q67 38 67 38ZM60 40Q64 44 66 48Q66 52 66 55Q65 59 64 62Q63 63 63 64Q63 65 63 65Q64 67 64 69Q64 70 64 71Q65 72 66 72Q67 72 68 72Q67 71 67 69Q67 67 68 65Q71 59 71 53Q71 49 69 45Q67 41 62 39Q60 39 60 40ZM72 38Q81 43 82 51Q83 56 81 61Q82 60 83 58Q86 55 86 50Q86 47 83 44Q82 41 79 40Q76 38 73 38Q72 38 72 38Q72 38 72 38ZM50 19L52 19L52 25L55 25L55 28L52 28L52 34L49 34L49 28L45 28L45 25L49 25L49 19Z',
  l: 'M74 73Q75 71 75 69Q76 68 75 67Q75 67 75 67Q75 64 77 63Q78 61 79 59Q79 59 79 59Q79 58 79 58Q81 54 81 50Q81 46 78 43Q76 41 73 40Q70 39 67 39Q67 39 66 39Q67 39 68 39Q72 42 73 46Q75 49 75 53Q75 60 71 67Q70 67 70 69Q70 71 70 71Q72 72 73 72ZM74 78L74 75Q69 74 63 73Q57 72 50 72Q43 72 37 73Q31 74 26 75L26 78Q31 77 37 76Q43 75 50 75Q64 75 69 77ZM50 19L52 19L52 25L55 25L55 28L52 28L52 34L49 34L49 28L45 28L45 25L49 25L49 19ZM50 96Q40 96 32 95Q24 93 22 91L23 80Q24 76 23 74Q23 73 22 70Q21 67 19 65Q18 64 16 63Q15 62 14 60Q12 57 11 51Q11 45 15 41Q17 38 21 37Q24 36 28 35Q30 35 32 35Q33 35 35 36Q38 36 41 37Q44 34 50 34Q57 34 59 37Q62 36 65 36Q67 35 68 35Q70 35 72 35Q76 36 79 37Q83 38 85 41Q89 45 89 51Q88 57 86 60Q85 62 84 63Q83 64 81 65Q79 67 78 70Q77 73 77 74Q76 77 77 80L78 91Q76 93 68 95Q60 96 55 96ZM26 86L28 86L34 82L27 81ZM74 86L73 81L66 82L72 86ZM26 73Q29 72 30 71Q30 71 30 69Q30 67 29 67Q25 60 25 53Q25 49 27 46Q28 42 32 39Q33 39 34 39Q33 39 33 39Q30 39 27 40Q24 41 22 43Q19 46 19 50Q19 54 21 58Q21 58 21 59Q21 59 21 59Q22 61 23 63Q25 64 25 67Q25 67 25 67Q25 67 25 67Q24 68 25 69Q25 71 26 72ZM57 80L50 78L44 80L50 83ZM70 91Q73 90 75 90Q66 86 50 86Q34 86 26 90Q28 91 30 91Q38 89 50 89Q62 89 66 90ZM41 44Q38 43 37 41Q32 46 32 53Q31 59 35 65Q36 67 36 69Q36 69 36 70Q39 70 42 70Q43 69 43 69Q43 68 42 67Q41 66 41 64Q40 61 40 58Q40 51 40 47ZM53 45Q52 45 50 45Q48 45 47 45Q46 51 46 58Q46 61 47 64Q47 65 47 65Q48 67 48 69Q48 69 48 69Q48 69 48 69Q49 69 49 69Q50 69 50 69Q50 69 51 69Q51 69 52 69Q52 69 52 69Q52 69 52 69Q52 67 53 65Q53 65 53 64Q54 61 54 58Q54 51 54 48ZM63 41Q62 43 59 44Q60 51 60 58Q60 61 59 64Q59 66 58 67Q57 68 57 69Q57 69 58 70Q59 70 61 70Q63 70 64 70Q64 69 64 69Q64 67 65 65Q69 59 68 53Q68 46 66 44Z',
};

const KINGDOM_OUTER: Record<string, string> = {
  p: 'M45 33Q42 31 42 27Q42 24 45 22Q47 19 50 19Q53 19 55 22Q58 24 58 27Q58 31 55 33L64 44L58 44L58 56Q62 59 64 63Q67 67 67 71Q67 76 65 80Q63 83 59 85L65 96L35 96L41 85Q33 81 33 71Q33 67 36 63Q38 59 42 56L42 44L36 44Z',
  n: 'M81 96L32 96Q32 82 37 77Q39 74 41 71Q44 68 46 63Q44 64 43 63Q43 63 41 63Q39 64 38 65Q37 66 36 67Q33 73 32 75Q30 78 28 77Q26 76 25 76Q24 76 23 76Q23 75 23 74Q24 72 25 72Q28 71 28 70Q28 69 26 69Q25 69 23 72Q22 73 21 74Q19 75 18 72Q17 71 16 70Q16 69 16 67Q16 65 17 63Q18 61 19 61Q20 60 21 59Q21 59 22 58Q23 57 25 54Q27 51 28 49Q28 47 29 45Q29 42 30 39Q31 37 33 33Q33 32 33 31Q33 29 33 29Q33 28 33 27Q33 24 34 24Q35 24 36 24Q36 25 38 27Q40 30 41 31Q41 28 43 25Q44 22 45 22Q46 22 46 23Q47 25 48 26Q48 27 49 28Q49 29 50 31L58 30L59 33L65 33L65 37L71 38L70 42L77 46L73 48L79 53L76 55L82 60L78 62L84 68L79 68L84 75L80 76L84 83L80 83L83 89L80 91L83 94Z',
  b: 'M50 83Q58 88 66 88Q71 88 76 86Q81 84 85 81Q85 82 84 84Q83 86 83 87Q83 87 84 88Q86 89 88 91Q89 92 89 94Q88 95 87 95Q87 94 87 94Q87 91 85 91Q84 91 83 92Q75 96 66 96Q58 96 50 92Q42 96 34 96Q25 96 17 92Q16 91 15 91Q13 91 13 94Q13 94 13 95Q13 95 13 95Q12 94 12 94Q11 92 12 91Q13 89 16 88Q16 87 17 87Q17 86 16 84Q15 82 16 81Q19 84 24 86Q29 88 34 88Q42 88 46 86ZM62 69L61 80Q61 81 58 82Q54 83 50 83Q45 83 42 82Q39 81 39 80L38 69Q35 64 33 59Q32 54 32 49Q32 35 47 28Q47 27 47 26Q46 25 46 23Q46 19 50 19Q54 19 54 23Q54 25 53 26Q53 28 53 28Q54 29 55 29Q56 29 57 28Q57 28 57 26Q56 25 56 23Q56 19 60 19Q65 19 65 23Q65 26 63 27Q62 28 63 28Q70 37 69 49Q69 53 68 56Q68 59 66 62Q65 64 64 65Q63 67 63 68Z',
  r: 'M73 78L76 81L76 84L79 84L79 96L21 96L21 84L24 84L24 81L27 78L30 78L30 38L24 38L24 19L35 19L35 26L44 26L44 19L56 19L56 26L65 26L65 19L76 19L76 38L70 38L70 78Z',
  q: 'M84 46Q82 46 80 44Q78 42 78 39Q78 36 80 34Q82 32 84 32Q87 32 89 34Q91 36 91 39Q91 42 89 44Q87 46 86 46ZM16 46Q13 46 11 44Q9 42 9 39Q9 36 11 34Q13 32 16 32Q18 32 20 34Q22 36 22 39Q22 42 20 44Q18 46 17 46ZM68 38Q65 38 63 36Q61 34 61 31Q61 28 63 26Q65 24 68 24Q71 24 73 26Q75 28 75 31Q75 34 73 36Q71 38 69 38ZM32 38Q29 38 27 36Q25 34 25 31Q25 28 27 26Q29 24 32 24Q35 24 37 26Q39 28 39 31Q39 34 37 36Q35 38 33 38ZM50 33Q47 33 45 31Q43 29 43 26Q43 23 45 21Q47 19 50 19Q53 19 55 21Q57 23 57 26Q57 29 55 31Q53 33 51 33ZM18 46L20 44L28 57Q29 58 30 58Q34 58 34 55Q34 55 34 55L32 38L35 38L41 53Q42 55 43 55Q46 55 46 52L48 33L51 33L53 52Q54 55 57 55Q58 55 59 53L65 38L68 38L66 55Q66 55 66 55Q66 55 66 55Q66 58 69 58Q71 58 72 57L80 44L83 45Q77 56 77 68Q77 69 77 70Q77 71 77 72Q76 77 76 81Q76 87 78 92Q75 93 68 95Q60 96 50 96Q40 96 32 95Q24 93 22 91Q24 87 24 81Q24 77 23 72Q23 71 23 70Q23 69 23 68Q23 56 20 51Z',
  k: 'M50 96Q40 96 32 95Q24 93 22 91L23 80Q24 76 23 74Q23 73 22 70Q21 67 19 65Q18 64 16 63Q15 62 14 60Q12 57 11 51Q11 45 15 41Q17 38 21 37Q24 36 28 35Q30 35 32 35Q33 35 35 36Q38 36 41 37Q44 34 50 34Q56 34 59 37Q62 36 65 36Q67 35 68 35Q70 35 72 35Q76 36 79 37Q83 38 85 41Q89 45 89 51Q88 57 86 60Q85 62 84 63Q83 64 81 65Q79 67 78 70Q77 73 77 74Q76 77 77 80L78 91Q76 93 68 95Q60 96 55 96ZM50 19L52 19L52 25L55 25L55 28L52 28L52 34L49 34L49 28L45 28L45 25L49 25L49 19Z',
};

const KINGDOM_KEY: Record<string, string> = {
  K: 'k', Q: 'q', R: 'r', B: 'b', N: 'n', P: 'p',
  k: 'l', q: 'w', r: 't', b: 'v', n: 'm', p: 'o',
};

function kingdomSVG(piece: string): string {
  const isW = piece === piece.toUpperCase();
  const key = KINGDOM_KEY[piece] || 'p';
  const d = KINGDOM_D[key] || '';
  if (!isW) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="${d}" fill="#161616" stroke="#ededed" stroke-width="0.7" fill-rule="evenodd"/></svg>`;
  }
  // Białe: pełne wypełnienie sylwetki (warstwa spodnia) + oryginalne linie/detale fontu (warstwa wierzchnia)
  const o = KINGDOM_OUTER[key] || '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="${o}" fill="#fbfbf8" stroke="#151515" stroke-width="1.9" stroke-linejoin="round"/><path d="${d}" fill="#fbfbf8" fill-rule="evenodd" stroke="#151515" stroke-width="0.9" stroke-linejoin="round"/></svg>`;
};

export default function App() {
  const boardRef = useRef<(string | null)[]>(Array(64).fill(null));
  const sideToMoveRef = useRef<'w' | 'b'>('w');
  const enPassantRef = useRef(-1);
  const gameActiveRef = useRef(true);
  const engineRunningRef = useRef(false);
  // Prawa do roszady: wieża/król ruszone lub wieża zbita na polu startowym = prawo stracone
  const castleRef = useRef({ wk: true, wq: true, bk: true, bq: true });
  const halfmoveRef = useRef(0);
  const lastProgressRef = useRef<{ kind: 'start' | 'pawn' | 'capture'; san: string }>({ kind: 'start', san: '' });
  const positionCountsRef = useRef<Record<string, number>>({});
  const historyStackRef = useRef<{ board: (string | null)[]; side: 'w' | 'b'; castle: { wk: boolean; wq: boolean; bk: boolean; bq: boolean }; ep: number; half: number; cw: string[]; cb: string[]; mh: MoveRec[]; lm: { from: number; to: number } | null }[]>([]);
  const soundOnRef = useRef(true);
  // Lustra stanów dla logiki asynchronicznej (AI odpowiada 400ms później):
  // chronią historię, zbicia i autosave przed nieaktualnymi domknięciami
  const mhRef = useRef<MoveRec[]>([]);
  const cwRef = useRef<string[]>([]);
  const cbRef = useRef<string[]>([]);
  const arrowStartRef = useRef<number | null>(null);
  const touchStartRef = useRef(false);
  const timeRefs = useRef({ w: 300, b: 300 });
  const autoFlipRef = useRef(false);
  // Token unieważniający spóźnione odpowiedzi silnika (np. Nowa Gra w trakcie myślenia)
  const aiMoveTokenRef = useRef(0);
  // 🧩 Tryb treningu matowego (refy = logika, stany = UI)
  const puzzleModeRef = useRef(false);
  const puzzleIdxRef = useRef(0);
  const puzzleSideRef = useRef<'w' | 'b'>('w');
  const puzzleFenRef = useRef('');
  const attemptsRef = useRef(0);
  const puzzleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const puzzleReturnRef = useRef<PuzzleReturnState | null>(null);
  const gameResultRef = useRef<null | { type: GameResultType; winner: 'w' | 'b' | null }>(null);

  const [board, setBoard] = useState<(string | null)[]>(Array(64).fill(null));
  const [sideToMove, setSideToMove] = useState<'w' | 'b'>('w');
  const [moveHistory, setMoveHistory] = useState<MoveRec[]>([]);
  const [selectedSquare, setSelectedSquare] = useState<number | null>(null);
  const [possibleMoves, setPossibleMoves] = useState<number[]>([]);
  const [lastMove, setLastMove] = useState<{from: number, to: number} | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [gameActive, setGameActive] = useState(true);
  const [capturedWhite, setCapturedWhite] = useState<string[]>([]);
  const [capturedBlack, setCapturedBlack] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState(2);
  const [evalScore, setEvalScore] = useState<{ cp: number | null; mate: number | null }>({ cp: 25, mate: null });
  const [engineStatus, setEngineStatus] = useState<EngineStatus>('off');
  const [gameMode, setGameMode] = useState<'ai' | 'human'>('ai');
  // 🎨 Kolor gracza w grze z komputerem: 'w' = grasz białymi (zaczynasz),
  // 'b' = grasz czarnymi (komputer zaczyna białymi). Ref do logiki asynchronicznej.
  const [humanColor, setHumanColor] = useState<'w' | 'b'>('w');
  const humanColorRef = useRef<'w' | 'b'>('w');
  // 🆕 Wybór nowej partii w panelu: przeciwnik × kolor + Start (jedno miejsce
  // zamiast 6 osobnych przycisków - działa tak samo z komputerem i z człowiekiem).
  const [newOpponent, setNewOpponent] = useState<'ai' | 'human'>('ai');
  const [newColor, setNewColor] = useState<'w' | 'b' | 'random'>('w');
  const [autoFlip, setAutoFlip] = useState(false);
  const [showLegalMoves, setShowLegalMoves] = useState(true);
  const [engineRunning, setEngineRunning] = useState(false);
  const [activeTab, setActiveTab] = useState('analysis');
  const [promotionSquare, setPromotionSquare] = useState<{square: number, isWhite: boolean} | null>(null);
  const [gameResult, setGameResult] = useState<null | { type: GameResultType, winner: 'w' | 'b' | null }>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [volume, setVolume] = useState(80);
  const [timeControl, setTimeControl] = useState(5);
  const [whiteTime, setWhiteTime] = useState(300);
  const [blackTime, setBlackTime] = useState(300);
  const [boardTheme, setBoardTheme] = useState('classic');
  const [pieceTheme, setPieceTheme] = useState<'merida' | 'kingdom'>('merida');
  const [arrows, setArrows] = useState<{ from: number; to: number; color: string }[]>([]);
  const [circles, setCircles] = useState<{ sq: number; color: string }[]>([]);
  const [arrowMode, setArrowMode] = useState<'drag' | 'click'>('drag');
  const [arrowPending, setArrowPending] = useState<number | null>(null);
  const [hintMove, setHintMove] = useState<{ from: number; to: number } | null>(null);
  const [fenBox, setFenBox] = useState('');
  const [openingName, setOpeningName] = useState('');
  const [puzzleUi, setPuzzleUi] = useState<{ idx: number } | null>(null);
  const [puzzleSolved, setPuzzleSolved] = useState(false);
  const [puzzleLevelFilter, setPuzzleLevelFilter] = useState<'all' | 1 | 2 | 3>('all');
  const [puzzleMsg, setPuzzleMsg] = useState('');
  const [solvedPuzzles, setSolvedPuzzles] = useState<number[]>([]);
  const [listMsg, setListMsg] = useState('');

  // ♟️ FIGURY TURNIEJOWE MERIDA - oficjalny krój z turniejów silników (TCEC/ChessBase/Cute Chess)
  // Oryginalne sylwetki Armando Marroquina: smukłe, maksymalnie rozróżnialne
  const pieceSVGs: Record<string, string> = {
    'K': '<svg xmlns="http://www.w3.org/2000/svg" fill-rule="evenodd" clip-rule="evenodd" image-rendering="optimizeQuality" shape-rendering="geometricPrecision" text-rendering="geometricPrecision" viewBox="0 0 50 50"><linearGradient id="mgwK" x1="21.376" x2="77.641" y1="37.346" y2="37.346" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><path fill="#1f1a17" d="M25.821 12.022h-1.76v-3.25h-2.067c-.558 0-.838-.272-.838-.822v-.025c0-.542.28-.813.838-.813h2.066V5.004c0-.585.297-.872.89-.872.575 0 .871.287.871.872v2.108h2.134c.542 0 .813.27.813.813v.025c0 .55-.271.821-.813.821l-2.117.026zM11.03 37.744l-.813-4.64c-.017 0-.042-.033-.076-.101-.085-.119-.322-.271-.711-.457-.381-.195-.838-.517-1.346-.982a41.99 41.99 0 0 1-1.702-1.49 8.509 8.509 0 0 1-1.1-1.237C4.273 27.45 3.705 25.772 3.595 23.8c-.17-1.897.601-3.794 2.303-5.682 1.719-1.88 4.047-2.768 6.968-2.65 1.092.068 2.38.33 3.844.796.483.195.974.39 1.482.576l1.498.584c.263.136.5.271.695.398a4.38 4.38 0 0 1-.127-1.041c0-1.287.457-2.388 1.38-3.302.914-.906 2.023-1.372 3.31-1.389 1.287 0 2.388.466 3.302 1.38.906.915 1.363 2.015 1.363 3.285 0 .263-.034.61-.101 1.042.228-.144.457-.271.669-.373.762-.33 1.76-.72 3.005-1.16 1.423-.482 2.701-.753 3.844-.821 2.921-.136 5.241.753 6.943 2.65 1.668 1.888 2.447 3.785 2.328 5.681-.127 1.973-.703 3.65-1.71 5.038-.33.449-.703.863-1.118 1.253a40.5 40.5 0 0 1-1.66 1.473c-.541.466-1.007.796-1.388.982-.38.186-.6.347-.669.457a.294.294 0 0 1-.05.077c-.017.017-.026.034-.026.05l-.796 4.666 1.643 6.121c-.83.745-2.684 1.355-5.554 1.837-2.879.483-6.206.72-9.974.72-3.835 0-7.214-.254-10.118-.754-2.912-.508-4.741-1.143-5.486-1.896z"/><path fill="url(#mgwK)" d="M25.796 29.532c2.845.033 5.444.203 7.806.508 2.37.304 4.225.694 5.563 1.151a126.32 126.32 0 0 0 2.057-1.651 12.018 12.018 0 0 0 1.863-1.846c.787-1.007 1.185-2.337 1.185-3.996 0-1.482-.356-2.726-1.067-3.717-1.27-1.854-3.209-2.777-5.8-2.777-1.557 0-3.149.322-4.792.965-1.439.584-2.531 1.228-3.268 1.94-1.388 1.388-2.421 3.174-3.082 5.35-.228.779-.364 1.49-.406 2.125s-.06 1.287-.06 1.947zm-13.25 6.697c3.14-.796 7.306-1.194 12.505-1.194 5.088 0 9.203.38 12.327 1.143l.618-3.65c-3.327-.871-7.67-1.312-13.047-1.312-5.41 0-9.745.45-13.022 1.338zm25.298 4.41-.737-2.844c-3.276-.728-7.332-1.092-12.158-1.092-4.809 0-8.856.364-12.133 1.092l-.787 2.87c3.158-.923 7.468-1.388 12.946-1.388 5.444 0 9.728.457 12.869 1.363zm.652 2.338c-3.192-1.287-7.68-1.94-13.445-1.94-5.986 0-10.516.661-13.598 1.99 2.913 1.152 7.417 1.736 13.522 1.736 2.912 0 5.562-.16 7.958-.483 2.405-.321 4.25-.762 5.563-1.303M24.077 29.532c-.008-.644-.034-1.287-.068-1.922s-.16-1.347-.372-2.126c-.677-2.21-1.702-3.996-3.082-5.35-.711-.695-1.795-1.347-3.268-1.94-1.685-.66-3.285-.99-4.792-.99-2.608 0-4.547.931-5.8 2.803-.711.99-1.067 2.235-1.067 3.716 0 1.626.398 2.955 1.186 3.997.482.61 1.092 1.227 1.837 1.837s1.44 1.168 2.083 1.66c2.895-1.042 7.34-1.6 13.343-1.685m.872-4.615c.119-.465.212-.787.296-.965.17-.643.356-1.194.576-1.643.093-.279.237-.6.432-.973.186-.373.39-.805.61-1.279.127-.28.27-.626.415-1.033.152-.406.304-.804.448-1.202.136-.33.203-.686.203-1.067 0-.813-.296-1.498-.872-2.066-.575-.575-1.278-.863-2.108-.863-1.964 0-2.955.99-2.955 2.955 0 .38.068.736.203 1.067.365 1.075.644 1.82.839 2.235.22.474.415.906.6 1.278.179.373.34.694.466.974.22.55.398 1.092.55 1.642.035.094.128.415.297.94"/></svg>',
    'Q': '<svg xmlns="http://www.w3.org/2000/svg" fill-rule="evenodd" clip-rule="evenodd" image-rendering="optimizeQuality" shape-rendering="geometricPrecision" text-rendering="geometricPrecision" viewBox="0 0 50 50"><linearGradient id="mgwQ" x1="21.253" x2="77.641" y1="37.224" y2="37.346" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><path fill="#1f1a17" stroke="#1f1a17" stroke-width=".076" d="M44.541 14.723c-.94 0-1.744-.33-2.404-.982s-.991-1.448-.991-2.396q0-1.3845.99-2.388c.66-.677 1.465-1.007 2.405-1.007.931 0 1.727.33 2.388 1.007.66.67.99 1.465.99 2.388 0 .948-.33 1.744-.99 2.396a3.28 3.28 0 0 1-2.388.982zm-4.31 29.219c-.812.71-2.633 1.304-5.46 1.786-2.828.474-6.088.72-9.771.72-3.75 0-7.053-.254-9.898-.745-2.844-.5-4.64-1.118-5.384-1.863l1.566-5.952-.694-3.895L8.405 30.2 6.297 14.774l1.21-.474 6.8 11.455.152-13.64 1.685-.296 5.182 13.716 2.776-14.757h1.72l2.776 14.706L33.73 11.82l1.71.296.153 13.64 6.824-11.48 1.16.541-2.058 15.359-2.21 3.793-.694 3.945zM14.535 11.988c-.948 0-1.752-.321-2.413-.973-.66-.652-.99-1.456-.99-2.396 0-.923.33-1.719.99-2.38s1.465-.99 2.413-.99c.923 0 1.719.33 2.38.99s.99 1.457.99 2.38c0 .94-.33 1.744-.99 2.396a3.266 3.266 0 0 1-2.38.973zM5.4 14.723c-.94 0-1.736-.33-2.388-.982s-.982-1.448-.982-2.396c0-.923.33-1.719.982-2.388C3.664 8.28 4.46 7.95 5.4 7.95c.948 0 1.744.33 2.413 1.007.66.67.99 1.465.99 2.388 0 .948-.33 1.744-.99 2.396a3.323 3.323 0 0 1-2.413.982zm19.55-3.97c-.94 0-1.745-.33-2.397-.991-.652-.66-.974-1.465-.974-2.405 0-.931.322-1.727.974-2.387s1.456-.99 2.396-.99c.923 0 1.727.33 2.396.99a3.23 3.23 0 0 1 1 2.387c0 .94-.33 1.744-1 2.405-.669.66-1.473.99-2.396.99zm10.413 1.235c-.94 0-1.736-.321-2.387-.973-.652-.652-.983-1.456-.983-2.396 0-.923.33-1.719.983-2.38s1.447-.99 2.387-.99c.948 0 1.753.33 2.413.99s.99 1.457.99 2.38c0 .94-.33 1.744-.99 2.396s-1.465.973-2.413.973z"/><path fill="url(#mgwQ)" stroke="#1f1a17" stroke-width=".076" d="M38.217 43.044c-3.023-1.253-7.417-1.88-13.166-1.88-5.876 0-10.313.644-13.327 1.931 2.896 1.143 7.316 1.71 13.25 1.71 2.845 0 5.445-.152 7.798-.465 2.363-.314 4.175-.745 5.445-1.296zM24.949 9.017c1.11 0 1.66-.56 1.66-1.66 0-1.092-.55-1.642-1.66-1.642-1.092 0-1.634.55-1.634 1.642 0 1.1.542 1.66 1.634 1.66zm12.624 24.976c-3.192-.812-7.366-1.21-12.522-1.21-5.292 0-9.517.406-12.675 1.236l.373 2.379c3.217-.762 7.323-1.143 12.302-1.143 4.944 0 8.975.372 12.099 1.117zm.618-1.49 1.617-2.853a6.432 6.432 0 0 1-2.43.474c-2.218 0-3.987-.897-5.308-2.7-.99.82-2.1 1.235-3.328 1.235-1.583 0-2.853-.618-3.793-1.862-1.058 1.16-2.32 1.744-3.793 1.744-1.194 0-2.286-.406-3.276-1.22-1.389 1.77-3.184 2.65-5.385 2.65a7.055 7.055 0 0 1-2.506-.465l1.735 2.972c3.21-.923 7.62-1.389 13.225-1.389 5.707 0 10.118.474 13.242 1.414zm-11.108-5.926-2.108-12.133-2.109 11.989c.051-.034.161-.119.348-.254.38-.745.956-1.118 1.735-1.118.847 0 1.389.373 1.634 1.118.102.101.271.237.5.398zm6.866.474V15.56l-4.09 11.261c.314-.11.577-.262.797-.44.33-.415.779-.627 1.338-.627.66 0 1.193.297 1.591.872.043.068.102.136.17.212.067.076.135.144.194.212zm-13.936-.347L15.95 15.562v11.336c.043-.067.119-.144.22-.245.33-.694.872-1.042 1.634-1.042.627 0 1.143.263 1.541.796.449.195.67.297.67.297zm-6.3 1.388L8.38 18.89l1.363 8.382c.94.66 1.863.99 2.752.99.347 0 .753-.059 1.219-.169zm22.395.119c.381.118.805.178 1.27.178 1.008 0 1.948-.314 2.828-.94l1.363-8.585zm1.49 12.556-.745-2.803c-3.242-.71-7.205-1.066-11.904-1.066-4.648 0-8.61.355-11.878 1.066l-.771 2.828c3.073-.931 7.298-1.388 12.675-1.388 5.24 0 9.448.448 12.623 1.363zM14.535 10.253c1.084 0 1.634-.542 1.634-1.634s-.55-1.634-1.634-1.634c-1.109 0-1.668.542-1.668 1.634s.56 1.634 1.668 1.634zm20.828 0c1.11 0 1.668-.542 1.668-1.634s-.559-1.634-1.668-1.634c-1.083 0-1.634.542-1.634 1.634s.55 1.634 1.634 1.634zM5.4 12.988c1.109 0 1.668-.55 1.668-1.643 0-1.11-.56-1.66-1.668-1.66-1.084 0-1.634.55-1.634 1.66 0 1.092.55 1.643 1.634 1.643zm39.141 0c1.092 0 1.643-.55 1.643-1.643 0-1.11-.55-1.66-1.643-1.66-1.1 0-1.66.55-1.66 1.66 0 1.092.56 1.643 1.66 1.643z"/></svg>',
    'R': '<svg xmlns="http://www.w3.org/2000/svg" fill-rule="evenodd" clip-rule="evenodd" image-rendering="optimizeQuality" shape-rendering="geometricPrecision" text-rendering="geometricPrecision" viewBox="0 0 50 50"><linearGradient id="mgwR" x1="21.376" x2="77.641" y1="37.469" y2="37.469" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><path fill="#1f1a17" d="M28.408 9.22h4.216V5.825h6.799v9.296l-5.503 4.242v11.862l4.216 4.216v5.08h3.793v5.927H8.071V40.52h3.793v-5.08l4.242-4.216V19.363l-5.504-4.242V5.825h6.774V9.22h4.242V5.825h6.79z"/><path fill="url(#mgwR)" d="m33.073 17.678 3.15-2.557h-22.42l3.175 2.557zm7.197 24.528H9.756v2.557H40.27zm-3.844-5.055H13.6v3.37h22.826zm-4.217-17.788H17.816v11.862h14.393zm5.504-5.927V7.51h-3.395v3.395h-7.646V7.51h-3.344v3.395h-7.62V7.51h-3.395v5.926zm-1.914 22.005-2.548-2.531H16.8l-2.6 2.531z"/></svg>',
    'B': '<svg xmlns="http://www.w3.org/2000/svg" fill-rule="evenodd" clip-rule="evenodd" image-rendering="optimizeQuality" shape-rendering="geometricPrecision" text-rendering="geometricPrecision" viewBox="0 0 50 50"><linearGradient id="mgwB" x1="21.13" x2="77.641" y1="37.592" y2="37.469" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><path fill="#1f1a17" d="M25.447 42.008c-.228.94-.516 1.592-.846 1.956s-.762.745-1.313 1.143c-.592.415-1.295.762-2.108 1.05s-1.71.364-2.7.211l-6.969-.965a2.858 2.858 0 0 0-.762 0c-.22.034-.432.051-.635.051-.347 0-.787.076-1.32.237-.542.152-.957.381-1.254.677l-2.404-3.945c.296-.33.559-.559.787-.694.237-.127.508-.271.821-.415a9.179 9.179 0 0 1 3.074-.822c.466-.033.923-.042 1.363-.025a9.8 9.8 0 0 0 1.397-.05c.89.152 1.786.287 2.684.406.906.127 1.812.254 2.718.39.99 0 1.66-.102 2.006-.297.187-.102.474-.288.872-.55.398-.263.796-.652 1.194-1.169-.88-.093-1.77-.262-2.684-.508a24.094 24.094 0 0 1-2.404-.753l2.582-6.401c-1.295-.745-2.193-1.338-2.71-1.795a5.3 5.3 0 0 1-1.21-1.575c-.432-.762-.711-1.499-.83-2.21a9.341 9.341 0 0 1-.16-1.913c.016-.99.245-2.083.702-3.285.457-1.194 1.312-2.27 2.566-3.21a79.091 79.091 0 0 0 3.056-2.455 27.746 27.746 0 0 0 2.946-2.954c-1.219-.627-1.828-1.626-1.828-2.998 0-.93.321-1.718.973-2.387.652-.66 1.457-.99 2.396-.99.923 0 1.72.33 2.38.99.66.669.99 1.456.99 2.387 0 1.355-.61 2.354-1.829 2.998a26.796 26.796 0 0 0 2.913 2.954c.982.839 2.015 1.66 3.09 2.456 1.236.94 2.083 2.015 2.523 3.209.449 1.202.694 2.294.72 3.285 0 .567-.05 1.202-.17 1.913s-.38 1.448-.795 2.21a6.084 6.084 0 0 1-1.253 1.575c-.5.457-1.389 1.05-2.667 1.795l2.582 6.4a28.57 28.57 0 0 1-2.455.754c-.915.246-1.787.415-2.634.508.381.517.771.906 1.169 1.168.398.263.694.45.897.55.347.196 1.016.297 2.007.297a263.35 263.35 0 0 1 2.692-.39 81.13 81.13 0 0 0 2.718-.406c.44.051.89.068 1.346.051a13.12 13.12 0 0 1 1.406.025 9.627 9.627 0 0 1 3.073.822c.297.144.567.288.805.415.245.135.508.364.804.694l-2.43 3.945c-.296-.296-.711-.525-1.253-.677-.534-.16-.965-.237-1.296-.237-.22 0-.44-.017-.66-.05a2.794 2.794 0 0 0-.753 0l-6.952.964c-.99.153-1.913.085-2.76-.194-.855-.28-1.558-.652-2.1-1.118a20.04 20.04 0 0 1-1.303-1.151c-.322-.322-.593-.957-.805-1.897"/><path fill="url(#mgwB)" d="M26.32 39.197c0 1.092.245 2.024.753 2.794.5.77 1.041 1.372 1.626 1.795.905.669 2.235 1 3.987 1 .432 0 1.279-.094 2.532-.28a74.737 74.737 0 0 1 2.48-.356c.627-.076 1.05-.135 1.27-.186a6.53 6.53 0 0 1 1.982.05c.262.068.559.128.88.187a1.6 1.6 0 0 1 .805.38l1.194-1.93a7.372 7.372 0 0 0-2.16-.72c-1.252-.22-2.353-.262-3.301-.151-.28.033-.644.118-1.101.245-.457.136-1.067.263-1.846.372-1.676.272-2.557.399-2.658.399-.644 0-1.203-.077-1.685-.246a10.37 10.37 0 0 1-1.287-.542c-.88-.398-1.77-1.338-2.684-2.81zm-1.762 0h-.795c-.932 1.49-1.812 2.43-2.659 2.811-.398.195-.83.373-1.312.542-.483.17-1.033.246-1.66.246-.118 0-.999-.127-2.658-.398-.788-.11-1.423-.238-1.88-.373a8.828 8.828 0 0 0-1.092-.245c-.948-.11-2.04-.068-3.302.152a7.056 7.056 0 0 0-2.134.72l1.194 1.93c.195-.195.457-.322.779-.381.322-.06.618-.119.88-.186a6.53 6.53 0 0 1 1.982-.051c.22.05.643.11 1.27.186.626.076 1.465.195 2.506.356 1.236.186 2.083.28 2.531.28 1.736 0 3.065-.331 3.988-1 .567-.423 1.1-1.024 1.6-1.795.508-.77.762-1.702.762-2.794m.89-9.347c1.6 0 3.14.127 4.614.372 1.617-.575 2.794-1.481 3.522-2.7a6.745 6.745 0 0 0 .94-3.497c0-.762-.187-1.6-.568-2.523-.38-.915-.999-1.744-1.862-2.49-.974-.812-2.04-1.701-3.2-2.666a33.093 33.093 0 0 1-3.447-3.387c-1.16 1.287-2.311 2.421-3.47 3.387a406.55 406.55 0 0 0-3.176 2.667c-.88.745-1.499 1.574-1.871 2.489-.373.923-.559 1.76-.559 2.523 0 1.27.305 2.438.914 3.497.712 1.219 1.897 2.125 3.548 2.7a27.749 27.749 0 0 1 4.614-.372zm0 4.513c1.938 0 3.793.194 5.579.575l-1.185-3.056a28.297 28.297 0 0 0-4.395-.347c-1.507 0-2.98.118-4.41.347l-1.194 3.056c1.769-.38 3.64-.575 5.604-.575zm0-23.538c1.126 0 1.684-.559 1.684-1.685s-.559-1.693-1.685-1.693-1.684.567-1.684 1.693.558 1.685 1.684 1.685zm0 27.009a18.97 18.97 0 0 0 3.285-.28c1.066-.194 2.1-.423 3.09-.685-1.94-.508-4.064-.77-6.376-.77-2.345 0-4.47.262-6.375.77.957.262 1.973.49 3.048.686a19.46 19.46 0 0 0 3.327.279zm-.89-14.334-2.065-.026c-.56 0-.839-.279-.839-.846 0-.559.28-.838.839-.838h2.065v-2.134c0-.576.297-.872.89-.872.575 0 .872.296.872.872v2.134h2.133c.542 0 .813.28.813.838 0 .567-.271.846-.813.846H26.32v2.032c0 .602-.297.898-.873.898-.592 0-.889-.296-.889-.898z"/></svg>',
    'N': '<svg xmlns="http://www.w3.org/2000/svg" fill-rule="evenodd" clip-rule="evenodd" image-rendering="optimizeQuality" shape-rendering="geometricPrecision" text-rendering="geometricPrecision" viewBox="0 0 50 50"><linearGradient id="mgwN" x1="21.405" x2="77.641" y1="37.346" y2="37.346" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><path fill="#1f1a17" d="M26.178 9.395c2.6.17 5.004.838 7.222 2.015 2.21 1.169 4.098 2.676 5.656 4.513 1.092 1.287 2.117 2.845 3.082 4.665a28.684 28.684 0 0 1 2.32 5.774 36.511 36.511 0 0 1 1.253 7.46c.177 2.599.262 5.012.262 7.23v5.402H15.468c-.153 0-.22-.407-.212-1.21.009-.814.06-1.466.16-1.965.06-.398.221-.957.467-1.685.254-.728.66-1.609 1.244-2.65.263-.534.89-1.304 1.88-2.32.999-1.016 2.133-2.201 3.429-3.539.745-.762 1.32-1.719 1.744-2.879.423-1.151.601-2.201.533-3.15a8.37 8.37 0 0 1-2.006 1.22c-3.505 1.253-6.045 3.073-7.612 5.452-.118.153-.49.822-1.117 2.015-.33.627-.618 1.059-.847 1.287-.313.314-.77.491-1.363.525-.923.043-1.643-.398-2.16-1.346-.693.203-1.312.288-1.862.254-.923-.347-1.592-.72-2.006-1.117-.847-.847-1.389-1.685-1.651-2.532a9.43 9.43 0 0 1-.381-2.726c0-1.389.855-3.226 2.582-5.512 2.015-2.625 3.09-4.631 3.217-6.003 0-.593.06-1.261.178-2.007a4.198 4.198 0 0 1 .618-1.49c.22-.33.364-.558.432-.677.076-.127.212-.313.415-.559.144-.203.27-.355.372-.457.093-.11.22-.254.373-.44.178-.212.406-.457.694-.745a18.06 18.06 0 0 1-1.067-7.46c3.285 1.169 6.054 3.015 8.28 5.53.551-1.872 1.626-3.387 3.226-4.539 1.321.923 2.371 2.15 3.15 3.666"/><path fill="url(#mgwN)" d="M42.976 44.693c-.017 0 0-.449.042-1.346.051-.906.076-1.88.076-2.921.017-2.066.017-4.2 0-6.41a26.837 26.837 0 0 0-.889-6.612c-.567-2.117-1.185-3.92-1.862-5.419-.678-1.498-1.414-2.785-2.21-3.878-1.185-1.786-2.811-3.302-4.86-4.538-2.049-1.244-4.19-2.057-6.426-2.438.152.813.22 1.609.203 2.387-.034.593-.313.89-.847.89-.61 0-.88-.297-.82-.89.05-2.184-.729-4.055-2.33-5.604-1.252 1.32-1.938 2.853-2.031 4.605-.034.585-.33.839-.898.77-.525-.016-.787-.32-.787-.914 0 0 .017-.067.042-.203-.677.22-1.388.525-2.133.923-.474.33-.864.246-1.16-.245-.297-.5-.17-.89.398-1.169.71-.364 1.244-.635 1.608-.821a17.634 17.634 0 0 0-4.86-3.522 17.31 17.31 0 0 0 1.889 6.528c.279.423.211.804-.204 1.134-.465.364-.855.313-1.168-.17a8.87 8.87 0 0 1-.491-.897c-.347.347-.584.61-.694.77-.119.153-.322.483-.61.991-.288.517-.5.94-.635 1.27-.144.415-.212.745-.186 1.008.025.254.05.533.067.855a7.61 7.61 0 0 1-1.007 2.752 133.71 133.71 0 0 1-1.998 3.15 127.607 127.607 0 0 1-1.787 2.675c-.415.601-.728 1.354-.94 2.286-.152.559-.152 1.244 0 2.04.144.805.475 1.431.966 1.88.762.77 1.498 1.126 2.21 1.067.228 0 .541-.093.93-.28.39-.178.687-.525.907-1.041.423-.94.779-1.414 1.067-1.414.406 0 .635.237.668.694 0 .102-.135.517-.397 1.245-.153.33-.348.677-.593 1.041-.322.432-.457.61-.423.542.262.948.702 1.11 1.312.5.178-.178.39-.525.618-1.016q.3555-.75 1.092-2.007c.584-.982 1.202-1.77 1.863-2.388.66-.61 1.244-1.109 1.76-1.481.297-.22.661-.466 1.093-.745.432-.288 1.008-.576 1.736-.872.576-.229 1.219-.517 1.922-.856s1.329-.77 1.87-1.303c.763-.745 1.347-1.66 1.762-2.752.22-.61.296-1.363.245-2.26-.144-.56.136-.839.847-.839.533 0 .83.271.898.821 0 1.863-.534 3.565-1.592 5.106.347 1.058.44 2.218.27 3.471-.143 1.008-.499 2.091-1.05 3.243-.558 1.143-1.676 2.421-3.36 3.827-3.43 2.845-5.046 5.774-4.86 8.78h12.175zM9.338 29.613c-.483.297-.77.695-.872 1.194.017.542-.237.839-.762.89-.584.067-.88-.178-.898-.746.068-1.092.55-1.955 1.465-2.599.432-.347.83-.322 1.194.093.364.449.322.838-.127 1.169zm7.366-11.827c.212.33.296.677.245 1.041-.16 1.058-.753 1.499-1.76 1.338a1.596 1.596 0 0 1-.72-.296c-.06.076-.161.262-.297.541-.178.534-.525.712-1.041.55-.508-.202-.711-.575-.593-1.117.745-1.905 2.091-3.209 4.039-3.92.567-.17.94 0 1.117.491.204.534.051.898-.448 1.092a2.745 2.745 0 0 1-.271.136c-.085.042-.17.093-.271.144"/></svg>',
    'P': '<svg xmlns="http://www.w3.org/2000/svg" fill-rule="evenodd" clip-rule="evenodd" image-rendering="optimizeQuality" shape-rendering="geometricPrecision" text-rendering="geometricPrecision" viewBox="0 0 50 50"><linearGradient id="mgwP" x1="21.13" x2="77.764" y1="37.346" y2="37.469" gradientTransform="matrix(1 0 0 .97324 0 1.243)" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><path fill="#1f1a17" d="M25 46.448H11.606a13.139 13.139 0 0 1-.99-5.043c0-2.975.863-5.644 2.598-8.018 1.736-2.365 3.971-4.054 6.697-5.067a6.824 6.824 0 0 1-2.861-2.398c-.737-1.071-1.1-2.283-1.1-3.634 0-1.69.575-3.156 1.735-4.392 1.151-1.244 2.574-1.961 4.267-2.15-1.346-.981-2.015-2.283-2.015-3.89 0-1.351.491-2.513 1.482-3.477.982-.964 2.176-1.442 3.581-1.442 1.389 0 2.582.478 3.573 1.442.99.964 1.49 2.126 1.49 3.477 0 1.607-.669 2.909-2.015 3.89 1.693.189 3.116.906 4.267 2.15 1.16 1.236 1.736 2.703 1.736 4.392 0 1.351-.373 2.563-1.126 3.634a7.036 7.036 0 0 1-2.862 2.398c2.726 1.013 4.962 2.702 6.697 5.067 1.736 2.374 2.6 5.043 2.6 8.018q0 2.6085-.966 5.043z"/><path fill="url(#mgwP)" d="M25 44.808h12.175a11.79 11.79 0 0 0 .525-3.403c0-2.513-.711-4.787-2.142-6.831-1.43-2.044-3.277-3.552-5.52-4.516-1.584-.62-1.643-.659-1.643-1.738 0-.849.559-1.475 1.668-1.879 1.533-1.046 2.303-2.43 2.303-4.153 0-1.244-.432-2.324-1.287-3.263-.864-.931-1.905-1.467-3.124-1.615-1-.083-1.49-.626-1.49-1.64 0-.453.178-.873.542-1.26.897-.676 1.346-1.558 1.346-2.654 0-.898-.339-1.673-1-2.315-.66-.643-1.447-.964-2.353-.964-.94 0-1.744.32-2.396.964a3.136 3.136 0 0 0-.974 2.315c0 1.08.44 1.961 1.338 2.653.364.355.542.775.542 1.261 0 1.014-.483 1.557-1.465 1.64a4.9 4.9 0 0 0-3.133 1.615c-.855.94-1.278 2.019-1.278 3.263 0 1.722.77 3.107 2.303 4.153 1.11.412 1.668 1.046 1.668 1.879 0 1.08-.068 1.118-1.668 1.738-2.244.964-4.081 2.472-5.503 4.516-1.423 2.044-2.134 4.318-2.134 6.831 0 1.195.178 2.324.525 3.403z"/></svg>',
    'k': '<svg xmlns="http://www.w3.org/2000/svg" fill-rule="evenodd" clip-rule="evenodd" image-rendering="optimizeQuality" shape-rendering="geometricPrecision" text-rendering="geometricPrecision" viewBox="0 0 50 50"><linearGradient id="mgbK" x1="21.13" x2="77.764" y1="37.224" y2="37.469" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><path fill="#1f1a17" d="M25.821 12.022h-1.76v-3.25h-2.067c-.558 0-.838-.272-.838-.822v-.025c0-.542.28-.813.838-.813h2.066V5.004c0-.585.297-.872.89-.872.575 0 .871.287.871.872v2.108h2.134c.542 0 .813.27.813.813v.025c0 .55-.271.821-.813.821l-2.117.026zM11.03 37.744l-.813-4.64c-.017 0-.042-.033-.076-.101-.085-.119-.322-.271-.711-.457-.381-.195-.838-.517-1.346-.982a41.99 41.99 0 0 1-1.702-1.49 8.509 8.509 0 0 1-1.1-1.237C4.273 27.45 3.705 25.772 3.595 23.8c-.17-1.897.601-3.794 2.303-5.682 1.719-1.88 4.047-2.768 6.968-2.65 1.092.068 2.38.33 3.844.796.483.195.974.39 1.482.576l1.498.584c.263.136.5.271.695.398a4.38 4.38 0 0 1-.127-1.041c0-1.287.457-2.388 1.38-3.302.914-.906 2.023-1.372 3.31-1.389 1.287 0 2.388.466 3.302 1.38.906.915 1.363 2.015 1.363 3.285 0 .263-.034.61-.101 1.042.228-.144.457-.271.669-.373.762-.33 1.76-.72 3.005-1.16 1.423-.482 2.701-.753 3.844-.821 2.921-.136 5.241.753 6.943 2.65 1.668 1.888 2.447 3.785 2.328 5.681-.127 1.973-.703 3.65-1.71 5.038-.33.449-.703.863-1.118 1.253a40.5 40.5 0 0 1-1.66 1.473c-.541.466-1.007.796-1.388.982-.38.186-.6.347-.669.457a.294.294 0 0 1-.05.077c-.017.017-.026.034-.026.05l-.796 4.666 1.643 6.121c-.83.745-2.684 1.355-5.554 1.837-2.879.483-6.206.72-9.974.72-3.835 0-7.214-.254-10.118-.754-2.912-.508-4.741-1.143-5.486-1.896z"/><path fill="url(#mgbK)" d="M24.95 20.675a2.295 2.295 0 0 0-.128-.423 5.606 5.606 0 0 0-.245-.72c-.051-.11-.119-.254-.195-.431a9.028 9.028 0 0 1-.254-.56c-.05-.118-.11-.27-.186-.456-.068-.195-.136-.373-.187-.534a1.735 1.735 0 0 1-.067-.474c0-.872.415-1.312 1.261-1.312.88 0 1.313.431 1.313 1.287 0 .22-.034.372-.094.474-.237.626-.355.965-.372 1.016-.254.5-.406.821-.474.965-.119.27-.195.508-.22.72-.051.101-.085.186-.102.262s-.034.136-.05.186m-2.778 8.56c-2.066.034-3.954.136-5.673.322-1.71.178-3.03.44-3.979.77a18.973 18.973 0 0 0-1.719-1.854 33.007 33.007 0 0 1-1.727-1.744c-.83-.847-1.236-1.77-1.236-2.777 0-1.245.203-2.15.618-2.726.44-.67 1.135-1.16 2.058-1.482a8.486 8.486 0 0 1 2.802-.483c1.194 0 2.328.263 3.42.796 1.076.56 1.787 1.008 2.134 1.338 1.126 1.143 2.007 2.38 2.633 3.717.212.5.373 1.194.483 2.074.11.89.17 1.567.186 2.05zm2.777-4.318c.119-.466.212-.787.296-.965.17-.643.356-1.194.576-1.643.093-.279.237-.6.432-.973.186-.373.39-.805.61-1.279.127-.28.27-.626.415-1.033.152-.406.304-.804.448-1.202.136-.33.203-.686.203-1.067 0-.813-.296-1.498-.872-2.066-.575-.575-1.278-.863-2.108-.863-1.964 0-2.955.99-2.955 2.955 0 .38.068.736.203 1.066.365 1.076.644 1.82.839 2.236.22.474.415.906.6 1.278.179.373.34.694.466.974.22.55.398 1.092.55 1.642.035.093.128.415.297.94m-.889 6.223c0-.66-.017-1.575-.05-2.735-.034-1.168-.161-2.142-.373-2.92-.677-2.21-1.702-3.997-3.082-5.351-.711-.695-1.795-1.347-3.268-1.94-1.685-.66-3.285-.99-4.792-.99-2.608 0-4.547.931-5.8 2.803-.711.99-1.067 2.235-1.067 3.716 0 1.626.398 2.955 1.186 3.997.415.592 1.21 1.329 2.387 2.21 1.169.872 2.168 1.684 2.972 2.43 1.44-.314 3.065-.585 4.877-.822 1.812-.229 4.149-.364 7.01-.398m13.784 11.735-.737-2.93c-3.225-.736-7.281-1.109-12.158-1.109-4.826 0-8.864.373-12.107 1.11l-.787 2.954c3.14-.956 7.442-1.439 12.92-1.439 2.624 0 5.071.136 7.315.398 2.252.262 4.106.601 5.554 1.016m-.643-7.417c-3.04-.838-7.096-1.261-12.15-1.261-5.097 0-9.195.431-12.302 1.287l.372 2.506c3.125-.813 7.095-1.22 11.93-1.22 4.809 0 8.729.398 11.752 1.194zm-11.363-4.292c2.845.05 5.182.194 7.002.423 1.812.229 3.455.508 4.91.821.907-.897 1.914-1.744 3.023-2.557s1.888-1.507 2.337-2.083c.788-1.075 1.186-2.413 1.186-4.021 0-1.465-.356-2.701-1.067-3.692-1.27-1.87-3.218-2.802-5.825-2.802-1.524 0-3.108.33-4.767.99-1.507.593-2.59 1.237-3.277 1.93-1.405 1.364-2.43 3.15-3.073 5.36-.246.762-.381 1.727-.407 2.904s-.042 2.083-.042 2.727m1.812-1.93c0-.483.06-1.16.16-2.05.111-.88.28-1.575.509-2.074.618-1.338 1.49-2.574 2.633-3.717.33-.33 1.042-.779 2.134-1.338a7.655 7.655 0 0 1 3.446-.796c.93 0 1.845.161 2.768.483.915.322 1.609.813 2.066 1.482.415.559.627 1.464.627 2.726 0 .99-.407 1.913-1.22 2.777a40.35 40.35 0 0 1-1.71 1.651c-.61.55-1.202 1.202-1.76 1.947-.958-.33-2.295-.592-4.006-.77-1.71-.186-3.59-.288-5.647-.322z"/></svg>',
    'q': '<svg xmlns="http://www.w3.org/2000/svg" fill-rule="evenodd" clip-rule="evenodd" image-rendering="optimizeQuality" shape-rendering="geometricPrecision" text-rendering="geometricPrecision" viewBox="0 0 50 50"><linearGradient id="mgbQ" x1="21.253" x2="77.764" y1="37.224" y2="37.36" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><path fill="#1f1a17" d="M24.95 10.752c-.94 0-1.745-.33-2.397-.99s-.974-1.465-.974-2.405c0-.931.322-1.727.974-2.387s1.456-.99 2.396-.99c.923 0 1.727.33 2.396.99a3.23 3.23 0 0 1 1 2.387c0 .94-.33 1.744-1 2.405-.669.66-1.473.99-2.396.99zm15.281 33.19c-.812.71-2.633 1.304-5.46 1.786-2.828.474-6.088.72-9.771.72-3.75 0-7.053-.254-9.898-.745-2.844-.5-4.64-1.118-5.384-1.863l1.566-5.952-.694-3.895L8.405 30.2 6.297 14.774l1.21-.474 6.8 11.455.152-13.64 1.685-.296 5.182 13.716 2.776-14.757h1.72l2.776 14.706L33.73 11.82l1.71.296.153 13.64 6.824-11.48 1.16.541-2.058 15.359-2.21 3.793-.694 3.945zM14.535 11.989c-.948 0-1.752-.322-2.413-.974-.66-.652-.99-1.456-.99-2.396 0-.923.33-1.719.99-2.38s1.465-.99 2.413-.99c.923 0 1.719.33 2.38.99s.99 1.457.99 2.38c0 .94-.33 1.744-.99 2.396a3.266 3.266 0 0 1-2.38.974m20.828 0c-.94 0-1.736-.322-2.387-.974-.652-.652-.982-1.456-.982-2.396 0-.923.33-1.719.982-2.38s1.447-.99 2.387-.99c.948 0 1.753.33 2.413.99s.99 1.457.99 2.38c0 .94-.33 1.744-.99 2.396s-1.465.974-2.413.974M5.4 14.723c-.94 0-1.736-.33-2.388-.982s-.982-1.448-.982-2.396c0-.923.33-1.719.982-2.388C3.664 8.28 4.46 7.95 5.4 7.95c.948 0 1.744.33 2.413 1.007.66.67.99 1.465.99 2.388 0 .948-.33 1.744-.99 2.396a3.323 3.323 0 0 1-2.413.982m39.141 0c-.94 0-1.744-.33-2.404-.982s-.991-1.448-.991-2.396q0-1.3845.99-2.388c.66-.677 1.465-1.007 2.405-1.007.931 0 1.727.33 2.388 1.007.66.67.99 1.465.99 2.388 0 .948-.33 1.744-.99 2.396a3.28 3.28 0 0 1-2.388.982"/><path fill="url(#mgbQ)" d="M37.2 35.73c-3.04-.84-7.095-1.262-12.15-1.262-5.096 0-9.194.431-12.301 1.286l.372 2.507c3.124-.813 7.095-1.22 11.93-1.22 4.809 0 8.729.398 11.752 1.194zm1.736-4.437c-1.372-.5-3.302-.906-5.791-1.228-2.49-.322-5.233-.483-8.247-.483-2.946 0-5.638.153-8.085.458-2.447.304-4.378.702-5.783 1.202l1.245 2.252c1.388-.406 3.191-.703 5.41-.89 2.21-.177 4.631-.27 7.264-.27s5.063.093 7.29.27q3.3525.2805 5.436.915zm-1.092 11.853-.737-2.93c-3.226-.736-7.281-1.109-12.158-1.109-4.826 0-8.864.373-12.107 1.11l-.788 2.954c3.142-.956 7.443-1.44 12.92-1.44 2.625 0 5.072.136 7.316.399 2.252.262 4.106.601 5.554 1.016"/></svg>',
    'r': '<svg xmlns="http://www.w3.org/2000/svg" fill-rule="evenodd" clip-rule="evenodd" image-rendering="optimizeQuality" shape-rendering="geometricPrecision" text-rendering="geometricPrecision" viewBox="0 0 50 50"><linearGradient id="mgbR" x1="21.192" x2="77.736" y1="37.552" y2="37.429" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><path fill="#1f1a17" d="M28.408 9.22h4.216V5.825h6.799v9.296l-5.503 4.242v11.862l4.216 4.216v5.08h3.793v5.927H8.071V40.52h3.793v-5.08l4.242-4.216V19.363l-5.504-4.242V5.825h6.774V9.22h4.242V5.825h6.79z"/><path fill="url(#mgbR)" d="M25.013 35.043h-10.27L13.6 36.11v1.44h22.826v-1.44l-1.143-1.067zM13.6 40.123v2.532h22.826v-2.532zM25.013 13.04h-12.7v1.142l1.812 1.364h21.801l1.761-1.364V13.04zm0 4.19h-8.679l1.482 1.169v1.414h14.393v-1.414l1.482-1.168zm0 13.547h-7.197v1.143l-1.482 1.44h17.357l-1.482-1.44v-1.143z"/></svg>',
    'b': '<svg xmlns="http://www.w3.org/2000/svg" fill-rule="evenodd" clip-rule="evenodd" image-rendering="optimizeQuality" shape-rendering="geometricPrecision" text-rendering="geometricPrecision" viewBox="0 0 50 50"><linearGradient id="mgbB" x1="21.094" x2="77.669" y1="37.101" y2="37.469" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><path fill="#1f1a17" d="M25 42.162c-.229.94-.516 1.592-.847 1.956-.33.364-.762.745-1.312 1.143-.593.415-1.295.762-2.108 1.05s-1.71.364-2.701.211l-6.968-.965a2.858 2.858 0 0 0-.762 0c-.22.034-.432.051-.635.051-.347 0-.787.076-1.32.237-.543.153-.958.381-1.254.677l-2.405-3.945c.297-.33.56-.559.788-.694.237-.127.508-.271.821-.415a9.179 9.179 0 0 1 3.073-.821c.466-.034.923-.043 1.364-.026a9.8 9.8 0 0 0 1.397-.05c.889.152 1.786.287 2.684.406.905.127 1.811.254 2.717.39.991 0 1.66-.102 2.007-.297.186-.102.474-.288.872-.55.398-.263.796-.652 1.194-1.169-.88-.093-1.77-.262-2.684-.508a24.094 24.094 0 0 1-2.405-.753l2.583-6.401c-1.296-.745-2.193-1.338-2.71-1.795a5.3 5.3 0 0 1-1.21-1.575c-.432-.762-.712-1.498-.83-2.21a9.341 9.341 0 0 1-.16-1.913c.016-.99.245-2.083.702-3.285.457-1.194 1.312-2.27 2.565-3.209a79.091 79.091 0 0 0 3.057-2.455 27.746 27.746 0 0 0 2.946-2.955c-1.22-.627-1.829-1.626-1.829-2.997 0-.932.322-1.72.974-2.388.652-.66 1.456-.99 2.396-.99.923 0 1.719.33 2.38.99.66.669.99 1.456.99 2.388q0 2.031-1.83 2.997a26.796 26.796 0 0 0 2.914 2.955 56.74 56.74 0 0 0 3.09 2.455c1.236.94 2.083 2.015 2.523 3.209.449 1.202.694 2.294.72 3.285 0 .567-.051 1.202-.17 1.913s-.38 1.448-.796 2.21a6.084 6.084 0 0 1-1.253 1.575c-.5.457-1.388 1.05-2.667 1.795l2.583 6.4c-.729.263-1.55.517-2.456.754-.914.246-1.786.415-2.633.508.381.517.77.906 1.168 1.169.398.262.695.448.898.55.347.195 1.016.296 2.007.296a263.35 263.35 0 0 1 2.692-.39 81.13 81.13 0 0 0 2.718-.406c.44.051.889.068 1.346.051a13.12 13.12 0 0 1 1.405.026 9.627 9.627 0 0 1 3.074.82c.296.145.567.289.804.416.246.135.508.364.804.694l-2.43 3.945c-.296-.296-.71-.524-1.253-.677-.533-.16-.965-.237-1.295-.237-.22 0-.44-.017-.66-.05a2.794 2.794 0 0 0-.754 0l-6.95.964c-.992.153-1.914.085-2.761-.194-.855-.28-1.558-.652-2.1-1.118-.542-.449-.982-.83-1.304-1.151-.321-.322-.592-.957-.804-1.897"/><path fill="url(#mgbB)" d="M24.086 23.705v2.108c0 .61.304.914.914.914s.914-.304.914-.914v-2.134h2.236c.575 0 .872-.296.872-.897 0-.593-.297-.889-.872-.889h-2.236v-2.235c0-.61-.304-.915-.914-.915s-.914.305-.914.915v2.235H21.9c-.584 0-.872.296-.872.889 0 .601.288.897.872.897zm7.51 13.741-1.042-2.531c-1.685-.364-3.539-.542-5.554-.542-1.998 0-3.835.178-5.503.542l-1.042 2.506c2.05-.517 4.234-.77 6.545-.77 2.286 0 4.479.262 6.596.795m-2.083-5.114-.72-1.735v-.67a27.03 27.03 0 0 0-3.793-.27 27.35 27.35 0 0 0-3.768.27l-.025.67-.669 1.735A25.85 25.85 0 0 1 25 31.96c1.592 0 3.09.127 4.513.372m-.864 9.381c-.66-.5-1.33-1.287-1.99-2.362h-.787c0 .813.186 1.6.567 2.362zm-5.114 0c.381-.812.576-1.6.576-2.362h-.796c-.643 1.059-1.312 1.846-2.015 2.362z"/></svg>',
    'n': '<svg xmlns="http://www.w3.org/2000/svg" fill-rule="evenodd" clip-rule="evenodd" image-rendering="optimizeQuality" shape-rendering="geometricPrecision" text-rendering="geometricPrecision" viewBox="0 0 50 50"><linearGradient id="mgbN" x1="21.253" x2="77.641" y1="37.592" y2="37.469" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><path fill="#1f1a17" d="M26.178 9.395c2.6.17 5.004.838 7.222 2.015 2.21 1.169 4.098 2.676 5.656 4.513 1.092 1.287 2.117 2.845 3.082 4.665a28.684 28.684 0 0 1 2.32 5.774 36.511 36.511 0 0 1 1.253 7.46c.177 2.599.262 5.012.262 7.23v5.402H15.468c-.153 0-.22-.407-.212-1.21.009-.814.06-1.466.16-1.965.06-.398.221-.957.467-1.685.254-.728.66-1.609 1.244-2.65.263-.534.89-1.304 1.88-2.32.999-1.016 2.133-2.201 3.429-3.539.745-.762 1.32-1.719 1.744-2.879.423-1.151.601-2.201.533-3.15a8.37 8.37 0 0 1-2.006 1.22c-3.505 1.253-6.045 3.073-7.612 5.452-.118.153-.49.822-1.117 2.015-.33.627-.618 1.059-.847 1.287-.313.314-.77.491-1.363.525-.923.043-1.643-.398-2.16-1.346-.693.203-1.312.288-1.862.254-.923-.347-1.592-.72-2.006-1.117-.847-.847-1.389-1.685-1.651-2.532a9.43 9.43 0 0 1-.381-2.726c0-1.389.855-3.226 2.582-5.512 2.015-2.625 3.09-4.631 3.217-6.003 0-.593.06-1.261.178-2.007a4.198 4.198 0 0 1 .618-1.49c.22-.33.364-.558.432-.677.076-.127.212-.313.415-.559.144-.203.27-.355.372-.457.093-.11.22-.254.373-.44.178-.212.406-.457.694-.745a18.06 18.06 0 0 1-1.067-7.46c3.285 1.169 6.054 3.015 8.28 5.53.551-1.872 1.626-3.387 3.226-4.539 1.321.923 2.371 2.15 3.15 3.666"/><path fill="url(#mgbN)" d="m15.688 17.786.542-.28c.5-.194.652-.559.474-1.092-.195-.491-.576-.66-1.143-.491-1.947.711-3.294 2.015-4.039 3.92-.118.542.076.914.593 1.118.516.16.864-.017 1.041-.55.136-.28.229-.466.297-.543.186.144.423.246.72.297 1.007.16 1.6-.28 1.76-1.338a1.498 1.498 0 0 0-.245-1.041M11.573 34.55c.06-.153.17-.373.322-.67.28-.693.415-1.108.415-1.244-.026-.457-.271-.694-.72-.694-.33 0-.711.474-1.16 1.414a.97.97 0 0 1-.296.347c-.449.466-.381.855.194 1.168.534.314.94.212 1.245-.321m14.63-9.204c1.16-1.524 1.728-3.217 1.71-5.08-.067-.55-.38-.82-.94-.82-.761 0-1.057.279-.897.837.051.915-.033 1.668-.27 2.261-.382.94-.805 1.643-1.262 2.108-.254.5-.102.864.449 1.092.525.246.931.119 1.21-.398M19.726 13.24a6.798 6.798 0 0 1 .051-1.93c-.99.194-1.922.66-2.802 1.388-.525.28-.652.67-.373 1.169.28.508.67.592 1.169.245.347-.186.669-.355.956-.508.288-.16.618-.28 1-.364zm23.25 31.454c-.017 0 0-.449.042-1.346.131-3.108.096-6.221.076-9.33a26.837 26.837 0 0 0-.889-6.613c-.84-3.31-2.124-6.485-4.072-9.297-2.634-3.845-6.814-6.033-11.286-6.976.126.766.033 1.54.076 2.311a25.82 25.82 0 0 1 4.538 2.032c4.241 2.555 6.414 7.276 7.197 11.93 1.272 6.154.453 11.557.813 17.289zM9.439 30.139c.475-.34.525-.729.144-1.194-.398-.381-.83-.415-1.312-.102-1.007.66-1.55 1.533-1.617 2.608.017.542.347.804.974.77.592-.05.88-.355.863-.922.136-.525.449-.915.948-1.16"/></svg>',
    'p': '<svg xmlns="http://www.w3.org/2000/svg" fill-rule="evenodd" clip-rule="evenodd" image-rendering="optimizeQuality" shape-rendering="geometricPrecision" text-rendering="geometricPrecision" viewBox="0 0 50 50"><path fill="#1f1a17" d="M25 46.448H11.606a13.139 13.139 0 0 1-.99-5.043c0-2.975.863-5.644 2.598-8.018 1.736-2.365 3.971-4.054 6.697-5.067a6.824 6.824 0 0 1-2.861-2.398c-.737-1.071-1.1-2.283-1.1-3.634 0-1.69.575-3.156 1.735-4.392 1.151-1.244 2.574-1.961 4.267-2.15-1.346-.981-2.015-2.283-2.015-3.89 0-1.351.491-2.513 1.482-3.477.982-.964 2.176-1.442 3.581-1.442 1.389 0 2.582.478 3.573 1.442s1.49 2.126 1.49 3.477c0 1.607-.669 2.909-2.015 3.89 1.693.189 3.116.906 4.267 2.15 1.16 1.236 1.736 2.703 1.736 4.392 0 1.351-.373 2.563-1.126 3.634a7.036 7.036 0 0 1-2.862 2.398c2.726 1.013 4.962 2.702 6.697 5.067 1.736 2.374 2.6 5.043 2.6 8.018q0 2.6085-.966 5.043z"/></svg>'
  };

  // 🔊 TURNIEJOWE DŹWIĘKI - synteza WebAudio w stylu transmisji TCEC/Chess.com:
  // drewniane stuknięcie = niski korpus sinusoidalny + krótki trzask szumu, fanfary na triangle
  const audioCtxRef = useRef<AudioContext | null>(null);
  const noiseBufRef = useRef<AudioBuffer | null>(null);
  const volumeRef = useRef(0.8);

  const ensureAudio = (): AudioContext | null => {
    try {
      if (!audioCtxRef.current) {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return null;
        audioCtxRef.current = new AC();
      }
      if (audioCtxRef.current.state === 'suspended') void audioCtxRef.current.resume();
      return audioCtxRef.current;
    } catch { return null; }
  };

  const getNoise = (ctx: AudioContext): AudioBuffer => {
    if (!noiseBufRef.current) {
      const len = Math.floor(ctx.sampleRate * 0.3);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
      noiseBufRef.current = buf;
    }
    return noiseBufRef.current;
  };

  // Drewniane stuknięcie: korpus + trzask
  const knock = (ctx: AudioContext, t: number, vol: number, bodyFrom: number, bodyTo: number, bodyDur: number, clickFreq: number, clickDur: number, clickVol: number) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(bodyFrom, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, bodyTo), t + bodyDur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + bodyDur);
    o.connect(g); g.connect(ctx.destination);
    o.start(t); o.stop(t + bodyDur + 0.02);

    const n = ctx.createBufferSource();
    n.buffer = getNoise(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = clickFreq; bp.Q.value = 0.9;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(clickVol, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + clickDur);
    n.connect(bp); bp.connect(ng); ng.connect(ctx.destination);
    n.start(t); n.stop(t + clickDur + 0.02);
  };

  const tone = (ctx: AudioContext, t: number, freq: number, dur: number, vol: number, type: OscillatorType = 'triangle') => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  };

  const playSound = (type: 'move' | 'capture' | 'castle' | 'promote' | 'check' | 'notify' | 'start' | 'win' | 'lose' | 'draw' | 'tick' | 'levelup') => {
    if (!soundOnRef.current) return;
    const ctx = ensureAudio();
    if (!ctx) return;
    try {
      const t = ctx.currentTime + 0.01;
      const V = volumeRef.current;
      // Lekka losowa odchyłka jak prawdziwe bierki - nic nie brzmi mechanicznie
      const j = () => 0.97 + Math.random() * 0.06;
      const bell = (tt: number, base: number, vol: number, dur = 0.28) => {
        tone(ctx, tt, base * j(), dur, vol, 'sine');
        tone(ctx, tt, base * 2.99 * j(), dur * 0.6, vol * 0.30, 'sine');
      };
      switch (type) {
        case 'move':
          // Krótkie suche "tok" jak na Chess.com/TCEC: ~60ms, jasny trzask
          knock(ctx, t, 0.50 * V, 300 * j(), 120, 0.06, 2500, 0.025, 0.32 * V);
          break;
        case 'capture':
          // Głębsze "tuk" z korpusem
          knock(ctx, t, 0.65 * V, 140 * j(), 55, 0.13, 520, 0.07, 0.5 * V);
          knock(ctx, t + 0.015, 0.30 * V, 340 * j(), 130, 0.05, 2700, 0.025, 0.28 * V);
          break;
        case 'castle':
          knock(ctx, t, 0.50 * V, 300 * j(), 120, 0.06, 2500, 0.025, 0.3 * V);
          knock(ctx, t + 0.08, 0.48 * V, 275 * j(), 110, 0.065, 2300, 0.025, 0.3 * V);
          break;
        case 'promote':
          knock(ctx, t, 0.45 * V, 290 * j(), 115, 0.06, 2400, 0.03, 0.3 * V);
          tone(ctx, t + 0.05, 784, 0.10, 0.20 * V);
          tone(ctx, t + 0.12, 1047, 0.12, 0.20 * V);
          tone(ctx, t + 0.20, 1568, 0.18, 0.18 * V, 'sine');
          break;
        case 'check':
          // Sygnatura TCEC: stuk + podwójny dzwonek
          knock(ctx, t, 0.38 * V, 290 * j(), 115, 0.055, 2400, 0.025, 0.22 * V);
          bell(t + 0.03, 1568, 0.22 * V);
          bell(t + 0.17, 1568, 0.20 * V);
          break;
        case 'notify':
          tone(ctx, t, 740, 0.08, 0.18 * V, 'sine');
          break;
        case 'tick':
          tone(ctx, t, 1250, 0.035, 0.12 * V, 'square');
          break;
        case 'start':
          knock(ctx, t, 0.42 * V, 280 * j(), 115, 0.06, 2300, 0.03, 0.24 * V);
          tone(ctx, t + 0.05, 523, 0.16, 0.16 * V, 'sine');
          tone(ctx, t + 0.05, 784, 0.20, 0.13 * V, 'sine');
          break;
        case 'levelup': {
          [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((fq, i) => {
            tone(ctx, t + i * 0.065, fq, 0.16, 0.17 * V, i % 2 ? 'sawtooth' : 'triangle');
          });
          const sweep = ctx.createOscillator();
          const sweepGain = ctx.createGain();
          const sweepFilter = ctx.createBiquadFilter();
          sweep.type = 'sawtooth';
          sweep.frequency.setValueAtTime(320, t);
          sweep.frequency.exponentialRampToValueAtTime(2400, t + 0.55);
          sweepFilter.type = 'lowpass';
          sweepFilter.frequency.setValueAtTime(700, t);
          sweepFilter.frequency.exponentialRampToValueAtTime(9500, t + 0.5);
          sweepFilter.Q.value = 5;
          sweepGain.gain.setValueAtTime(0.0001, t);
          sweepGain.gain.exponentialRampToValueAtTime(0.13 * V, t + 0.06);
          sweepGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
          sweep.connect(sweepFilter); sweepFilter.connect(sweepGain); sweepGain.connect(ctx.destination);
          sweep.start(t); sweep.stop(t + 0.62);
          [1568, 2093, 2637, 3136].forEach((fq, i) => tone(ctx, t + 0.22 + i * 0.07, fq, 0.22, 0.07 * V, 'sine'));
          [523.25, 659.25, 783.99, 1046.5].forEach(fq => tone(ctx, t + 0.42, fq, 0.65, 0.10 * V, 'sine'));
          bell(t + 0.42, 2093, 0.10 * V, 0.8);
          break;
        }
        case 'win':
          // Krótki zdecydowany dżingiel jak koniec partii na transmisji
          [523, 659, 784].forEach((fq, i) => tone(ctx, t + i * 0.09, fq, 0.22, 0.24 * V));
          tone(ctx, t + 0.27, 1047, 0.45, 0.24 * V);
          bell(t + 0.27, 2093, 0.10 * V, 0.4);
          break;
        case 'lose':
          tone(ctx, t, 392, 0.22, 0.22 * V, 'sine');
          tone(ctx, t + 0.16, 311, 0.32, 0.22 * V, 'sine');
          break;
        case 'draw':
          tone(ctx, t, 587, 0.18, 0.20 * V, 'sine');
          tone(ctx, t + 0.16, 587, 0.26, 0.20 * V, 'sine');
          break;
      }
    } catch {
      // Audio nieobsługiwane
    }
  };

  useEffect(() => {
    try {
      const v = localStorage.getItem('ad3-vol');
      if (v !== null) { setVolume(Number(v)); volumeRef.current = Number(v) / 100; }
      const pz = localStorage.getItem('ad3-puzzles4');
      if (pz) setSolvedPuzzles(JSON.parse(pz));
    } catch { /* ignore */ }
    initGame();
    // Silnik Stockfish ładuj w tle (nie blokuj startu planszy)
    const offEngineStatus = stockfish.onStatus((s) => setEngineStatus(s));
    stockfish.ensureReady().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => offEngineStatus();
  }, []);

  // ⏱️ Zegary szachowe
  useEffect(() => {
    if (!gameActive || timeControl === 0 || moveHistory.length === 0) return;
    const id = setInterval(() => {
      if (!gameActiveRef.current) { clearInterval(id); return; }
      if (sideToMoveRef.current === 'w') {
        timeRefs.current.w = Math.max(0, timeRefs.current.w - 1);
        setWhiteTime(timeRefs.current.w);
        if (timeRefs.current.w <= 10 && timeRefs.current.w > 0) playSound('tick');
        if (timeRefs.current.w <= 0) onFlag('w');
      } else {
        timeRefs.current.b = Math.max(0, timeRefs.current.b - 1);
        setBlackTime(timeRefs.current.b);
        if (timeRefs.current.b <= 10 && timeRefs.current.b > 0) playSound('tick');
        if (timeRefs.current.b <= 0) onFlag('b');
      }
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameActive, timeControl, sideToMove, moveHistory.length]);

  const onFlag = (who: 'w' | 'b') => {
    if (!gameActiveRef.current) return;
    gameActiveRef.current = false;
    setGameActive(false);
    const winner = who === 'w' ? 'b' : 'w';
    finishGame('timeout', winner);
  };

  const parseFENBoard = (fen: string): { board: (string | null)[]; side: 'w' | 'b'; castle: { wk: boolean; wq: boolean; bk: boolean; bq: boolean }; ep: number } | null => {
    try {
      const parts = fen.trim().split(/\s+/);
      const rows = parts[0].split('/');
      if (rows.length !== 8) return null;
      const nb: (string | null)[] = Array(64).fill(null);
      rows.forEach((row, r) => {
        let f = 0;
        for (const c of row) {
          if (/\d/.test(c)) f += parseInt(c, 10);
          else { nb[r * 8 + f] = c; f++; }
        }
      });
      const side: 'w' | 'b' = parts[1] === 'b' ? 'b' : 'w';
      const cs = parts[2] || '-';
      const castle = { wk: cs.includes('K'), wq: cs.includes('Q'), bk: cs.includes('k'), bq: cs.includes('q') };
      let ep = -1;
      if (parts[3] && parts[3] !== '-') {
        const sq = algToSq(parts[3]);
        if (sq >= 0 && sq < 64) {
          // Pole en passant tylko gdy NASZ pion naprawdę może bić (inaczej puste bicia)
          const er = Math.floor(sq / 8), ef = sq % 8;
          const own = side === 'w' ? 'P' : 'p';
          const pr = side === 'w' ? er + 1 : er - 1;
          const okEp = pr >= 0 && pr < 8 && [ef - 1, ef + 1].some(f => f >= 0 && f < 8 && nb[pr * 8 + f] === own);
          if (okEp) ep = sq;
        }
      }
      return { board: nb, side, castle, ep };
    } catch { return null; }
  };

  const boardToFEN = (): string => {
    const b = boardRef.current;
    const rows: string[] = [];
    for (let r = 0; r < 8; r++) {
      let row = '', empty = 0;
      for (let f = 0; f < 8; f++) {
        const p = b[r * 8 + f];
        if (!p) empty++;
        else { if (empty > 0) { row += String(empty); empty = 0; } row += p; }
      }
      if (empty > 0) row += String(empty);
      rows.push(row);
    }
    const c = castleRef.current;
    const cs = (c.wk ? 'K' : '') + (c.wq ? 'Q' : '') + (c.bk ? 'k' : '') + (c.bq ? 'q' : '') || '-';
    const ep = enPassantRef.current >= 0 ? sqToAlg(enPassantRef.current) : '-';
    const full = Math.floor(moveHistory.length / 2) + 1;
    return `${rows.join('/')} ${sideToMoveRef.current} ${cs} ${ep} ${halfmoveRef.current} ${full}`;
  };

  const loadFEN = (fen: string, skipAIMove = false): boolean => {
    const parsed = parseFENBoard(fen);
    if (!parsed) return false;
    pushHistory();
    boardRef.current = parsed.board;
    sideToMoveRef.current = parsed.side;
    castleRef.current = parsed.castle;
    enPassantRef.current = parsed.ep;
    halfmoveRef.current = 0;
    lastProgressRef.current = { kind: 'start', san: '' };
    gameActiveRef.current = true;
    setBoard([...parsed.board]);
    setSideToMove(parsed.side);
    mhRef.current = [];
    setMoveHistory([]);
    setLastMove(null);
    setSelectedSquare(null);
    setPossibleMoves([]);
    cwRef.current = []; cbRef.current = [];
    setCapturedWhite([]);
    setCapturedBlack([]);
    setGameActive(true);
    setGameResult(null);
    gameResultRef.current = null;
    // Ręczny import FEN zawsze opuszcza tryb treningu
    clearPuzzleTimer();
    puzzleModeRef.current = false;
    setPuzzleUi(null); setPuzzleSolved(false); setPuzzleMsg('');
    setArrows([]); setCircles([]); setHintMove(null); setArrowPending(null);
    positionCountsRef.current = {};
    recordPosition();
    updateOpening([]);
    saveGame();
    // Wczytana pozycja z turą komputera? Komputer rusza sam (z pominięciem treningu,
    // który ustawia puzzleModeRef synchronicznie zaraz po loadFEN).
    setTimeout(() => {
      if (skipAIMove) return;
      if (gameMode === 'ai' && !puzzleModeRef.current && gameActiveRef.current
        && !gameResultRef.current && sideToMoveRef.current !== humanColorRef.current) {
        engineRunningRef.current = true;
        setEngineRunning(true);
        makeAIMove();
      }
    }, 400);
    return true;
  };

  const buildPGN = (): string => {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '.');
    const whiteName = gameMode === 'ai' ? (humanColorRef.current === 'w' ? 'Gracz' : 'Super Chess') : 'Gracz';
    const blackName = gameMode === 'ai' ? (humanColorRef.current === 'b' ? 'Gracz' : 'Super Chess') : 'Super Chess';
    let res = `[Event "Super Chess"]\n[Site "Browser"]\n[Date "${date}"]\n[White "${whiteName}"]\n[Black "${blackName}"]\n[Result "${gameResult ? (gameResult.winner === 'w' ? '1-0' : gameResult.winner === 'b' ? '0-1' : '1/2-1/2') : '*'}"]\n[FEN "${boardToFEN()}"]\n\n`;
    moveHistory.forEach((m, i) => {
      if (i % 2 === 0) res += `${Math.floor(i / 2) + 1}. `;
      res += `${m.san} `;
    });
    res += gameResult ? (gameResult.winner === 'w' ? '1-0' : gameResult.winner === 'b' ? '0-1' : '1/2-1/2') : '*';
    return res;
  };

  const saveGame = () => {
    try {
      localStorage.setItem('ad3-save', JSON.stringify({
        board: boardRef.current, side: sideToMoveRef.current, castle: castleRef.current,
        ep: enPassantRef.current, half: halfmoveRef.current, mh: [...mhRef.current],
        cw: [...cwRef.current], cb: [...cbRef.current], tc: timeControl, tw: timeRefs.current.w, tb: timeRefs.current.b,
        hc: humanColorRef.current, gm: gameMode,
      }));
    } catch { /* ignore */ }
  };

  const pushHistory = () => {
    historyStackRef.current.push({
      board: [...boardRef.current], side: sideToMoveRef.current,
      castle: { ...castleRef.current }, ep: enPassantRef.current, half: halfmoveRef.current,
      cw: [...cwRef.current], cb: [...cbRef.current], mh: [...mhRef.current],
      lm: lastMove ? { ...lastMove } : null,
    });
    if (historyStackRef.current.length > 200) historyStackRef.current.shift();
  };

  const recordPosition = () => {
    const k = positionKey(boardRef.current, sideToMoveRef.current, castleRef.current, enPassantRef.current);
    positionCountsRef.current[k] = (positionCountsRef.current[k] || 0) + 1;
  };

  const updateOpening = (mh: MoveRec[]) => {
    // 1) Dopasowanie POZYCYJNE (ECO) - odporne na transpozycje kolejności ruchów.
    // Klucz to rozstaw bierek + strona do ruchu, dokładnie jak wygenerowany python-chess.
    const posKey = boardRef.current.map(p => p || '.').join('') + sideToMoveRef.current;
    const posName = ECO_POS[posKey] || '';
    // 2) Fallback: dopasowanie sekwencji od 1. ruchu (głębsze warianty wygrywają)
    const uci = mh.map(m => sqToAlg(m.from) + sqToAlg(m.to)).join(' ');
    let best = '';
    for (const o of OPENING_BOOK) {
      const pre = o.prefix.join(' ');
      if (uci.startsWith(pre) && pre.length > best.length) best = o.name;
      else if (uci === pre) best = o.name;
    }
    best = posName || best;
    if (!best && mh.length >= 1) {
      // Pierwsze posunięcie - pełna polska nazwa otwarcia flankowego
      const first: Record<string, string> = {
        e2e4: 'Otwarcie pionem królewskim (1.e4)', d2d4: 'Otwarcie pionem hetmańskim (1.d4)',
        c2c4: 'Debiut Angielski (1.c4)', g1f3: 'Debiut Rétiego (1.Sf3)',
        g2g3: 'Otwarcie Benko (1.g3)', b2b3: 'Debiut Larsena (1.b3)',
        f2f4: 'Debiut Birda (1.f4)', b2b4: 'Debiut Sokolskiego (1.b4, Polski)',
        g2g4: 'Debiut Groba (1.g4)', b1c3: 'Atak Van Geeta (1.Sc3)',
        d2d3: 'Debiut Miesesa (1.d3)', e2e3: "Otwarcie Van't Kruijsa (1.e3)",
        c2c3: 'Debiut Saragossy (1.c3)', h2h3: 'Debiut Clemenza (1.h3)',
        a2a3: 'Debiut Anderssena (1.a3)', h2h4: 'Debiut Despreza (1.h4)',
        g1h3: 'Debiut Amara (1.Sh3)', a2a4: "Debiut Ware'a (1.a4)",
        b1a3: 'Debiut Durkina (1.Sa3)', f2f3: 'Otwarcie Barnesa (1.f3)',
      };
      best = first[sqToAlg(mh[0].from) + sqToAlg(mh[0].to)] || '';
    }
    setOpeningName(best);
  };

  const finishGame = (type: GameResultType, winner: 'w' | 'b' | null) => {
    setGameResult({ type, winner });
    gameResultRef.current = { type, winner };
    // Dźwięk z perspektywy gracza: wygrana / przegrana / remis.
    // W grze z komputerem gracz może mieć dowolny kolor, w grze z człowiekiem
    // zachowano dawną konwencję (białe = wygrana).
    // W treningu matowym każdy mat to sukces gracza, niezależnie od koloru.
    if (type === 'mate') playSound('levelup');
    else if (puzzleModeRef.current) playSound('draw');
    else if (winner === (gameMode === 'ai' ? humanColorRef.current : 'w')) playSound('win');
    else if (winner === null) playSound('draw');
    else playSound('lose');
    try { localStorage.removeItem('ad3-save'); } catch { /* ignore */ }
  };

  const initGame = (mode: 'ai' | 'human' = 'ai', customFen?: string, color?: 'w' | 'b' | 'random', autoStart: boolean = true) => {
    const fen = customFen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
    setGameMode(mode);
    // Wybór koloru/strony. W grze z komputerem to kolor GRACZA (losowanie możliwe).
    // W grze z człowiekiem to orientacja planszy: która strona zaczyna na dole.
    // Brak = standardowo (białe na dole, w grze z komputerem: graj dalej tym samym kolorem).
    const resolveColor = (c: 'w' | 'b' | 'random'): 'w' | 'b' =>
      c === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : c;
    let hc: 'w' | 'b' = humanColorRef.current;
    if (mode === 'ai') {
      if (color) hc = resolveColor(color);
      humanColorRef.current = hc;
      setHumanColor(hc);
      // Plansza od strony gracza (przy czarnych odwrócona, żeby własne bierki były na dole)
      setFlipped(hc === 'b');
    } else {
      setFlipped(color ? resolveColor(color) === 'b' : false);
    }
    const newBoard: (string | null)[] = Array(64).fill(null);
    let rank = 0, file = 0;
    
    for (let i = 0; i < fen.length; i++) {
      const c = fen[i];
      if (c === '/') { rank++; file = 0; }
      else if (/\d/.test(c)) { file += parseInt(c); }
      else { newBoard[rank * 8 + file] = c; file++; }
    }
    
    boardRef.current = newBoard;
    sideToMoveRef.current = 'w';
    gameActiveRef.current = true;
    engineRunningRef.current = false;
    enPassantRef.current = -1;
    castleRef.current = { wk: true, wq: true, bk: true, bq: true };
    halfmoveRef.current = 0;
    lastProgressRef.current = { kind: 'start', san: '' };
    positionCountsRef.current = {};
    historyStackRef.current = [];
    const secs = timeControl * 60;
    timeRefs.current = { w: secs, b: secs };
    setWhiteTime(secs); setBlackTime(secs);
    
    setBoard([...newBoard]);
    setSideToMove('w');
    mhRef.current = [];
    setMoveHistory([]);
    setSelectedSquare(null);
    setPossibleMoves([]);
    setLastMove(null);
    cwRef.current = []; cbRef.current = [];
    setCapturedWhite([]);
    setCapturedBlack([]);
    setGameActive(true);
    setEngineRunning(false);
    setGameResult(null);
    gameResultRef.current = null;
    clearPuzzleTimer();
    puzzleModeRef.current = false;
    setPuzzleUi(null); setPuzzleSolved(false); setPuzzleMsg('');
    setArrows([]); setCircles([]); setHintMove(null); setArrowPending(null);
    setOpeningName(''); setFenBox('');
    recordPosition();
    // Nowa partia unieważnia spóźnione odpowiedzi silnika
    aiMoveTokenRef.current++;
    stockfish.newGame();
    setEvalScore({ cp: 25, mate: null });

    playSound('start');
    // Grasz czarnymi? Komputer (białe) rusza pierwszy (tylko gdy autoStart włączony).
    if (autoStart && mode === 'ai' && hc === 'b') {
      engineRunningRef.current = true;
      setEngineRunning(true);
      setTimeout(() => makeAIMove(), 600);
    }
  };

  const undoMove = () => {
    if (engineRunningRef.current || historyStackRef.current.length === 0 || puzzleModeRef.current) return;
    // Cofnij do ostatniego ruchu GRACZA (jego kolor, nie zawsze białe): 1 lub 2 półruchy.
    // Po cofnięciu samego ruchu gracza jest ruch AI - cofnij wtedy też odpowiedź AI.
    let snap = historyStackRef.current.pop();
    if (gameMode === 'ai' && snap && snap.side !== humanColorRef.current && historyStackRef.current.length > 0) {
      snap = historyStackRef.current.pop() || snap;
    }
    if (!snap) return;
    boardRef.current = [...snap.board];
    sideToMoveRef.current = snap.side;
    castleRef.current = { ...snap.castle };
    enPassantRef.current = snap.ep;
    halfmoveRef.current = snap.half;
    cwRef.current = [...snap.cw]; cbRef.current = [...snap.cb];
    setCapturedWhite([...snap.cw]); setCapturedBlack([...snap.cb]);
    mhRef.current = [...snap.mh];
    setMoveHistory([...snap.mh]);
    setLastMove(snap.lm);
    setBoard([...snap.board]); setSideToMove(snap.side);
    setSelectedSquare(null); setPossibleMoves([]);
    gameActiveRef.current = true; setGameActive(true);
    setGameResult(null);
    gameResultRef.current = null;
    setArrows([]); setCircles([]); setHintMove(null); setArrowPending(null);
    updateOpening(snap.mh);
    playSound('move');
    // Po cofnięciu do ruchu komputera (np. gracz czarnymi cofa pierwszy ruch białych)
    // komputer musi zagrać ponownie - inaczej partia utknie.
    if (gameMode === 'ai' && gameActiveRef.current && sideToMoveRef.current !== humanColorRef.current) {
      engineRunningRef.current = true;
      setEngineRunning(true);
      setTimeout(() => makeAIMove(), 400);
    }
  };

  const resignGame = () => {
    if (!gameActiveRef.current || puzzleModeRef.current) return;
    gameActiveRef.current = false; setGameActive(false);
    // W grze z komputerem zawsze poddaje się gracz (nawet gdy akurat myśli AI).
    // W grze z człowiekiem przegrywa strona, która ma ruch.
    const winner = gameMode === 'ai'
      ? (humanColorRef.current === 'w' ? 'b' : 'w')
      : (sideToMoveRef.current === 'w' ? 'b' : 'w');
    finishGame('resign', winner);
  };

  const offerDraw = () => {
    if (!gameActiveRef.current || puzzleModeRef.current) return;
    // Gra z człowiekiem: obaj gracze przy planszy, remis od razu
    if (gameMode === 'human') {
      gameActiveRef.current = false; setGameActive(false);
      finishGame('draw-agreement', null);
      return;
    }
    const ev = evaluateBoard(boardRef.current);
    // AI przyjmuje remis gdy ONO nie wygrywa wyraźnie (ocena z perspektywy komputera,
    // bo gracz może mieć dowolny kolor; dawniej na sztywno zakładano AI czarnymi).
    const aiScore = humanColorRef.current === 'w' ? -ev : ev;
    if (aiScore < 150) {
      gameActiveRef.current = false; setGameActive(false);
      finishGame('draw-agreement', null);
    } else {
      playSound('notify');
      setOpeningName('AI odrzuca remis — gra dalej!');
      setTimeout(() => updateOpening(mhRef.current), 1500);
    }
  };

  // 🎨 Kolory adnotacji jak na lichess: PPM = zielona, Shift+PPM = niebieska, Alt+PPM = czerwona, Ctrl+PPM = pomarańczowa
  const arrowColor = (e: { shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean }): string => {
    if (e.shiftKey) return '#1971c2';
    if (e.altKey) return '#e03131';
    if (e.ctrlKey || e.metaKey) return '#f08c00';
    return '#2b8a3e';
  };

  const showHint = async () => {
    if (!gameActiveRef.current || engineRunningRef.current) return;
    // W trybie zagadek użyj zweryfikowanego ruchu z Lichess (pole accept) - najszybsze i najdokładniejsze
    if (puzzleModeRef.current && puzzleIdxRef.current !== null) {
      const p = PUZZLES_FROM_LICHESS[puzzleIdxRef.current];
      if (p && p.accept && p.accept.length > 0) {
        const bestMove = p.accept[0];
        const from = algToSq(bestMove.substring(0, 2));
        const to = algToSq(bestMove.substring(2, 4));
        setHintMove({ from, to });
        setArrows([{ from, to, color: '#22d3ee' }]);
        setPuzzleMsg(`💡 Podpowiedź: ${sqToAlg(from)}${sqToAlg(to)}`);
        return;
      }
    }
    // Podpowiedź ze Stockfisha: pełna siła (poziom 4), ale z limitem 3 s myślenia.
    const sideAtStart = sideToMoveRef.current;
    try {
      const r = await stockfish.findBestMove(boardToFEN(), 4, undefined, 3000);
      if (
        r && gameActiveRef.current &&
        sideToMoveRef.current === sideAtStart &&
        getLegalMoves(r.from).includes(r.to)
      ) {
        setHintMove({ from: r.from, to: r.to });
        setArrows([{ from: r.from, to: r.to, color: '#22d3ee' }]);
      }
    } catch {
      // Brak podpowiedzi gdy silnik niedostępny - nie zgadujemy słabym ruchem.
    }
  };

  const clearPuzzleTimer = () => {
    if (puzzleTimerRef.current) { clearTimeout(puzzleTimerRef.current); puzzleTimerRef.current = null; }
  };

  // Wczytaj pozycję zadania (bez kasowania licznika prób)
  const restorePuzzleFen = () => {
    clearPuzzleTimer();
    const ok = loadFEN(puzzleFenRef.current);
    // loadFEN opuszcza tryb treningu - wracamy do niego natychmiast
    puzzleModeRef.current = true;
    gameResultRef.current = null;
    setPuzzleUi({ idx: puzzleIdxRef.current });
    setPuzzleSolved(false);
    return ok;
  };

  const leavePuzzle = (tab: string = 'history') => {
    clearPuzzleTimer();
    puzzleModeRef.current = false;
    puzzleIdxRef.current = -1;
    puzzleFenRef.current = '';
    attemptsRef.current = 0;
    setPuzzleUi(null); setPuzzleSolved(false); setPuzzleMsg(''); setListMsg('');
    setSelectedSquare(null); setPossibleMoves([]);
    setArrows([]); setCircles([]); setHintMove(null); setArrowPending(null);
    setPromotionSquare(null);
    aiMoveTokenRef.current++;
    stockfish.newGame();
    engineRunningRef.current = false;
    setEngineRunning(false);
    setFlipped(false);
    const snap = puzzleReturnRef.current;
    puzzleReturnRef.current = null;
    if (snap) {
      boardRef.current = [...snap.board];
      sideToMoveRef.current = snap.side;
      castleRef.current = { ...snap.castle };
      enPassantRef.current = snap.ep;
      halfmoveRef.current = snap.half;
      lastProgressRef.current = { ...snap.lastProgress };
      positionCountsRef.current = { ...snap.positionCounts };
      historyStackRef.current = snap.historyStack.map(h => ({
        ...h, board: [...h.board], castle: { ...h.castle },
        cw: [...h.cw], cb: [...h.cb], mh: [...h.mh],
        lm: h.lm ? { ...h.lm } : null,
      }));
      cwRef.current = [...snap.cw]; cbRef.current = [...snap.cb];
      mhRef.current = [...snap.mh];
      setBoard([...snap.board]);
      setSideToMove(snap.side);
      setCapturedWhite([...snap.cw]); setCapturedBlack([...snap.cb]);
      setMoveHistory([...snap.mh]);
      setLastMove(snap.lm);
      setGameMode(snap.gameMode);
      humanColorRef.current = snap.humanColor;
      setHumanColor(snap.humanColor);
      gameActiveRef.current = snap.gameActive;
      setGameActive(snap.gameActive);
      setGameResult(snap.gameResult);
      gameResultRef.current = snap.gameResult;
      timeRefs.current = { ...snap.timeRefs };
      setWhiteTime(snap.whiteTime); setBlackTime(snap.blackTime);
      setOpeningName(snap.openingName);
      setEvalScore({ cp: 25, mate: null });
    }
    setActiveTab(tab);
  };

  const handleTabChange = (tab: string) => {
    if (tab !== 'puzzles' && puzzleModeRef.current) {
      leavePuzzle(tab);
      return;
    }
    setActiveTab(tab);
  };

  const startPuzzle = (i: number) => {
    const p = PUZZLES_FROM_LICHESS[i];
    if (!p) return;
    if (!puzzleModeRef.current) {
      puzzleReturnRef.current = {
        board: [...boardRef.current],
        side: sideToMoveRef.current,
        castle: { ...castleRef.current },
        ep: enPassantRef.current,
        half: halfmoveRef.current,
        lastProgress: { ...lastProgressRef.current },
        positionCounts: { ...positionCountsRef.current },
        historyStack: historyStackRef.current.map(h => ({
          ...h, board: [...h.board], castle: { ...h.castle },
          cw: [...h.cw], cb: [...h.cb], mh: [...h.mh],
          lm: h.lm ? { ...h.lm } : null,
        })),
        cw: [...cwRef.current],
        cb: [...cbRef.current],
        mh: [...mhRef.current],
        lm: lastMove ? { ...lastMove } : null,
        gameMode,
        humanColor: humanColorRef.current,
        flipped,
        gameActive: gameActiveRef.current,
        gameResult: gameResultRef.current ? { ...gameResultRef.current } : null,
        timeRefs: { ...timeRefs.current },
        whiteTime,
        blackTime,
        openingName,
      };
    }
    puzzleIdxRef.current = i;
    puzzleFenRef.current = p.fen;
    puzzleSideRef.current = (p.fen.split(' ')[1] === 'b' ? 'b' : 'w');
    attemptsRef.current = 0;
    // Szachownica od razu stroną gracza: czarne zadania = widok czarnych
    setFlipped(puzzleSideRef.current === 'b');
    // W zagadce gracz rusza figurami strony, która ma ruch w FEN
    setGameMode('human');
    humanColorRef.current = puzzleSideRef.current;
    restorePuzzleFen();
    setPuzzleMsg(`💡 ${p.tip}`);
    setActiveTab('puzzles');
    setListMsg('');
    playSound('start');
  };

  // Losowa zagadka spośród jeszcze niezrobionych (postęp zapamiętany)
  const randomUnsolved = (): number => {
    const open = PUZZLES_FROM_LICHESS.map((_, i) => i).filter(i => !solvedPuzzles.includes(i));
    if (open.length === 0) return -1;
    return open[Math.floor(Math.random() * open.length)];
  };

  const resetPuzzles = () => {
    try { localStorage.removeItem('ad3-puzzles4'); } catch { /* ignore */ }
    setSolvedPuzzles([]);
    setListMsg('');
    startPuzzle(Math.floor(Math.random() * PUZZLES_FROM_LICHESS.length));
  };

  // Werdykt treningu "znajdź najlepszy ruch": trafienie w zweryfikowany zbiór Stockfisha
  const puzzleSuccess = () => {
    const idx = puzzleIdxRef.current;
    const p = PUZZLES_FROM_LICHESS[idx];
    setPuzzleSolved(true);
    const pvText = p?.pv ? ` Kontynuacja z partii: ${p.pv}` : '';
    setPuzzleMsg(`🏆 Dobrze! ${p?.sol || ''}${pvText}`);
    setPuzzleUi({ idx });
    setSolvedPuzzles(prev => {
      if (prev.includes(idx)) return prev;
      const n = [...prev, idx];
      try { localStorage.setItem('ad3-puzzles4', JSON.stringify(n)); } catch { /* ignore */ }
      return n;
    });
  };

  const puzzleFail = () => {
    attemptsRef.current += 1;
    const n = attemptsRef.current;
    const p = PUZZLES_FROM_LICHESS[puzzleIdxRef.current];
    const correctMove = p?.accept?.[0] ? ` Poprawny ruch: ${p.accept[0]}` : '';
    setPuzzleMsg(`❌ To nie to — próba ${n}. Pozycja wraca…${correctMove}`);
    clearPuzzleTimer();
    puzzleTimerRef.current = setTimeout(() => {
      restorePuzzleFen();
      setPuzzleMsg(`🔁 Próba ${n + 1}. 💡 ${PUZZLES_FROM_LICHESS[puzzleIdxRef.current]?.tip || ''}`);
    }, 1100);
  };

  const handlePuzzleMove = (from: number, to: number, promotion?: string) => {
    const p = PUZZLES_FROM_LICHESS[puzzleIdxRef.current];
    const actual = (sqToAlg(from) + sqToAlg(to) + (promotion || '')).toLowerCase();
    if (p && p.accept.includes(actual)) puzzleSuccess();
    else puzzleFail();
  };

  const refreshBoard = () => {
    setBoard([...boardRef.current]);
    setSideToMove(sideToMoveRef.current);
  };

  const svgFor = (p: string): string => (pieceTheme === 'kingdom' ? kingdomSVG(p) : (pieceSVGs[p] || ''));

  const onSquareClick = (square: number) => {
    if (!gameActiveRef.current || engineRunningRef.current || puzzleTimerRef.current) return;
    
    const currentBoard = boardRef.current;
    const piece = currentBoard[square];
    const turn = sideToMoveRef.current;
    const isWhitePiece = piece ? piece === piece.toUpperCase() : false;
    // W grze z komputerem wolno ruszać tylko własnym kolorem (gdy tura gracza).
    // W grze z człowiekiem - bierkami strony, która ma ruch.
    const isMyPiece = gameMode === 'human'
      ? ((turn === 'w' && isWhitePiece) || (turn === 'b' && !isWhitePiece))
      : (turn === humanColorRef.current && (humanColorRef.current === 'w' ? isWhitePiece : !isWhitePiece));
    
    if (selectedSquare === square) {
      setSelectedSquare(null);
      setPossibleMoves([]);
      return;
    }
    
    if (selectedSquare !== null) {
      const moves = getLegalMoves(selectedSquare);
      if (moves.includes(square)) {
        const movingPiece = currentBoard[selectedSquare];
        if (movingPiece) {
          const toRank = Math.floor(square / 8);
          const isWhite = movingPiece === movingPiece.toUpperCase();
          const promoRank = isWhite ? 0 : 7;
          
          if (movingPiece.toUpperCase() === 'P' && toRank === promoRank) {
            setPromotionSquare({ square, isWhite });
          } else {
            executeMove(selectedSquare, square);
            setSelectedSquare(null);
            setPossibleMoves([]);
          }
        }
        return;
      }
    }
    
    if (piece && isMyPiece) {
      setSelectedSquare(square);
      setPossibleMoves(getLegalMoves(square));
    } else {
      setSelectedSquare(null);
      setPossibleMoves([]);
    }
  };

  const getLegalMoves = (square: number): number[] => {
    const b = boardRef.current;
    const piece = b[square];
    if (!piece) return [];
    const isWhite = piece === piece.toUpperCase();
    const pseudoMoves = getPseudoLegalMoves(square, piece, isWhite);
    
    return pseudoMoves.filter(to => {
      const testBoard = [...b];
      const moving = testBoard[square];
      testBoard[to] = moving;
      testBoard[square] = null;
      // En passant: na planszy testowej zdejmij też bitego pionka (słynna szpilka
      // odsłaniająca króla) - inaczej test widziałby go jako blokadę promienia
      if (moving && moving.toUpperCase() === 'P' && to === enPassantRef.current && !b[to]) {
        testBoard[to + (moving === moving.toUpperCase() ? 8 : -8)] = null;
      }
      const kingChar = sideToMoveRef.current === 'w' ? 'K' : 'k';
      const kingSq = testBoard.indexOf(kingChar);
      return !isSquareAttacked(testBoard, kingSq, sideToMoveRef.current === 'w' ? 'b' : 'w');
    });
  };

  // Aktualizacja praw do roszady: ruch króla/wieży z pola startowego lub bicie wieży na polu startowym
  const updateCastleRights = (from: number, to: number) => {
    const c = castleRef.current;
    if (from === 60) { c.wk = false; c.wq = false; }
    if (from === 4) { c.bk = false; c.bq = false; }
    if (from === 63 || to === 63) c.wk = false;
    if (from === 56 || to === 56) c.wq = false;
    if (from === 7 || to === 7) c.bk = false;
    if (from === 0 || to === 0) c.bq = false;
  };

  const getPseudoLegalMoves = (square: number, piece: string, isWhite: boolean): number[] => {
    const moves: number[] = [];
    const rank = Math.floor(square / 8);
    const file = square % 8;
    const b = boardRef.current;
    
    switch (piece.toUpperCase()) {
      case 'P': {
        const dir = isWhite ? -1 : 1;
        const startRank = isWhite ? 6 : 1;
        const sRank = rank + dir;
        if (sRank >= 0 && sRank < 8) {
          if (!b[sRank * 8 + file]) {
            moves.push(sRank * 8 + file);
            if (rank === startRank && !b[(rank + dir*2) * 8 + file]) {
              moves.push((rank + dir*2) * 8 + file);
            }
          }
          for (const df of [-1, 1]) {
            const nf = file + df;
            if (nf >= 0 && nf < 8) {
              const capSq = sRank * 8 + nf;
              const target = b[capSq];
              if (target && ((target === target.toUpperCase()) !== isWhite)) {
                moves.push(capSq);
              } else if (capSq === enPassantRef.current) {
                moves.push(capSq);
              }
            }
          }
        }
        break;
      }
      case 'N': {
        for (const [dr, df] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
          const nr = rank + dr, nf = file + df;
          if (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) {
            const target = nr * 8 + nf;
            const tp = b[target];
            if (!tp || ((tp === tp.toUpperCase()) !== isWhite)) moves.push(target);
          }
        }
        break;
      }
      case 'B': case 'R': case 'Q': {
        const dirs = piece.toUpperCase() === 'B' ? [[-1,-1],[-1,1],[1,-1],[1,1]] :
                     piece.toUpperCase() === 'R' ? [[-1,0],[1,0],[0,-1],[0,1]] :
                     [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
        for (const [dr, df] of dirs) {
          let nr = rank + dr, nf = file + df;
          while (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) {
            const target = nr * 8 + nf;
            const tp = b[target];
            if (!tp) { moves.push(target); }
            else { if ((tp === tp.toUpperCase()) !== isWhite) moves.push(target); break; }
            nr += dr; nf += df;
          }
        }
        break;
      }
      case 'K': {
        for (const [dr, df] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
          const nr = rank + dr, nf = file + df;
          if (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) {
            const target = nr * 8 + nf;
            const tp = b[target];
            if (!tp || ((tp === tp.toUpperCase()) !== isWhite)) moves.push(target);
          }
        }
        // Roszady: prawa + puste pola + król nie pod szachem i nie przechodzi przez bite pole
        // Indeksy: białe e1=60 f1=61 g1=62 d1=59 c1=58 b1=57 a1=56 h1=63 | czarne e8=4 f8=5 g8=6 d8=3 c8=2 b8=1 a8=0 h8=7
        if (isWhite && square === 60) {
          if (castleRef.current.wk && !b[61] && !b[62] && b[63] === 'R'
              && !isSquareAttacked(b, 60, 'b') && !isSquareAttacked(b, 61, 'b') && !isSquareAttacked(b, 62, 'b')) moves.push(62);
          if (castleRef.current.wq && !b[59] && !b[58] && !b[57] && b[56] === 'R'
              && !isSquareAttacked(b, 60, 'b') && !isSquareAttacked(b, 59, 'b') && !isSquareAttacked(b, 58, 'b')) moves.push(58);
        } else if (!isWhite && square === 4) {
          if (castleRef.current.bk && !b[5] && !b[6] && b[7] === 'r'
              && !isSquareAttacked(b, 4, 'w') && !isSquareAttacked(b, 5, 'w') && !isSquareAttacked(b, 6, 'w')) moves.push(6);
          if (castleRef.current.bq && !b[3] && !b[2] && !b[1] && b[0] === 'r'
              && !isSquareAttacked(b, 4, 'w') && !isSquareAttacked(b, 3, 'w') && !isSquareAttacked(b, 2, 'w')) moves.push(2);
        }
        break;
      }
    }
    return moves;
  };

  const isSquareAttacked = (b: (string | null)[], sq: number, byColor: 'w' | 'b'): boolean => {
    if (sq === -1) return false;
    const rank = Math.floor(sq / 8);
    const file = sq % 8;
    
    for (let i = 0; i < 64; i++) {
      const p = b[i];
      if (!p) continue;
      const pIsWhite = p === p.toUpperCase();
      if ((byColor === 'w' && !pIsWhite) || (byColor === 'b' && pIsWhite)) continue;
      
      const pr = Math.floor(i / 8);
      const pf = i % 8;
      const dr = Math.abs(pr - rank);
      const df = Math.abs(pf - file);
      const pt = p.toUpperCase();
      
      if (pt === 'P') {
        // Biały pion idzie w stronę rank 0 i bije rank-1, czarny odwrotnie:
        // pole 'rank' jest bite gdy pion stoi rank+1 (białe) / rank-1 (czarne)
        const pawnDir = byColor === 'w' ? -1 : 1;
        if (pr === rank - pawnDir && (pf === file - 1 || pf === file + 1)) return true;
      }
      if (pt === 'N' && ((dr === 2 && df === 1) || (dr === 1 && df === 2))) return true;
      if (pt === 'K' && dr <= 1 && df <= 1) return true;
      if ((pt === 'R' || pt === 'Q') && (pr === rank || pf === file)) {
        const stepR = Math.sign(rank - pr);
        const stepF = Math.sign(file - pf);
        let blocked = false;
        for (let j = 1; j < Math.max(dr, df); j++) {
          if (b[(pr + j*stepR) * 8 + (pf + j*stepF)]) { blocked = true; break; }
        }
        if (!blocked) return true;
      }
      if ((pt === 'B' || pt === 'Q') && dr === df) {
        const stepR = Math.sign(rank - pr);
        const stepF = Math.sign(file - pf);
        let blocked = false;
        for (let j = 1; j < dr; j++) {
          if (b[(pr + j*stepR) * 8 + (pf + j*stepF)]) { blocked = true; break; }
        }
        if (!blocked) return true;
      }
    }
    return false;
  };

  // Sprawdzenie końca partii dla strony która ma ruch (po przełączeniu sideToMoveRef).
  const checkGameEnd = (): boolean => {
    const turn = sideToMoveRef.current;
    const b = boardRef.current;
    // Remisy automatyczne
    if (isInsufficientMaterial(b)) {
      gameActiveRef.current = false; setGameActive(false);
      finishGame('draw-material', null); return true;
    }
    if (halfmoveRef.current >= 100) {
      gameActiveRef.current = false; setGameActive(false);
      finishGame('draw-50', null); return true;
    }
    const k = positionKey(b, turn, castleRef.current, enPassantRef.current);
    if ((positionCountsRef.current[k] || 0) >= 3) {
      gameActiveRef.current = false; setGameActive(false);
      finishGame('draw-repetition', null); return true;
    }
    const kingChar = turn === 'w' ? 'K' : 'k';
    const enemy: 'w' | 'b' = turn === 'w' ? 'b' : 'w';
    const kingSq = b.indexOf(kingChar);
    const inCheck = kingSq !== -1 && isSquareAttacked(b, kingSq, enemy);

    let hasMoves = false;
    for (let i = 0; i < 64 && !hasMoves; i++) {
      const p = b[i];
      if (!p) continue;
      const pIsWhite = p === p.toUpperCase();
      if ((turn === 'w') !== pIsWhite) continue;
      if (getLegalMoves(i).length > 0) hasMoves = true;
    }

    if (hasMoves) {
      if (inCheck) playSound('check');
      return false;
    }
    gameActiveRef.current = false;
    setGameActive(false);
    if (inCheck) finishGame('mate', enemy);
    else finishGame('stalemate', null);
    return true;
  };

  const buildBaseSAN = (from: number, to: number, piece: string, promotion: string | undefined, isCapture: boolean): string => {
    const pt = piece.toUpperCase();
    const dest = sqToAlg(to);
    if (pt === 'K' && Math.abs(to - from) === 2) return to > from ? 'O-O' : 'O-O-O';
    if (pt === 'P') {
      const fileChar = 'abcdefgh'[from % 8];
      const promo = promotion ? `=${promotion.toUpperCase()}` : '';
      if (isCapture) return `${fileChar}x${dest}${promo}`;
      return `${dest}${promo}`;
    }
    // Rozróżnianie figur tego samego typu
    let disamb = '';
    const others: number[] = [];
    for (let i = 0; i < 64; i++) {
      if (i === from) continue;
      const p = boardRef.current[i];
      if (!p || p !== piece) continue;
      if (getLegalMoves(i).includes(to)) others.push(i);
    }
    if (others.length > 0) {
      const sameFile = others.some(o => (o % 8) === (from % 8));
      const sameRank = others.some(o => Math.floor(o / 8) === Math.floor(from / 8));
      if (!sameFile) disamb = 'abcdefgh'[from % 8];
      else if (!sameRank) disamb = String(8 - Math.floor(from / 8));
      else disamb = sqToAlg(from);
    }
    return `${pt}${disamb}${isCapture ? 'x' : ''}${dest}`;
  };

  const executeMove = (from: number, to: number, promotion?: string) => {
    const b = [...boardRef.current];
    const piece = b[from];
    const captured = b[to];
    if (!piece) return;
    
    const isWhite = piece === piece.toUpperCase();
    const pieceType = piece.toUpperCase();
    const fromRank = Math.floor(from / 8);
    const toRank = Math.floor(to / 8);
    const lostWhite: string[] = [];
    const lostBlack: string[] = [];
    const isEp = pieceType === 'P' && to === enPassantRef.current && !captured;
    const isCapture = !!captured || isEp;
    const isCastle = pieceType === 'K' && Math.abs(to - from) === 2;
    const baseSan = buildBaseSAN(from, to, piece, promotion, isCapture);
    pushHistory();
    
    if (isCastle) {
      if (isWhite) {
        if (to === 62) { b[61] = b[63]; b[63] = null; }
        else if (to === 58) { b[59] = b[56]; b[56] = null; }
      } else {
        if (to === 6) { b[5] = b[7]; b[7] = null; }
        else if (to === 2) { b[3] = b[0]; b[0] = null; }
      }
    }
    
    if (isEp) {
      const epSq = to + (isWhite ? 8 : -8);
      const capP = b[epSq];
      if (capP) {
        if (isWhite) lostBlack.push(capP);
        else lostWhite.push(capP);
      }
      b[epSq] = null;
    }
    
    if (captured) {
      if (isWhite) lostBlack.push(captured);
      else lostWhite.push(captured);
      playSound('capture');
    } else if (isEp) {
      playSound('capture');
    } else if (isCastle) {
      playSound('castle');
    } else {
      playSound('move');
    }
    if (promotion) setTimeout(() => playSound('promote'), 140);
    
    b[to] = promotion || piece;
    b[from] = null;
    
    if (pieceType === 'P' && Math.abs(toRank - fromRank) === 2) {
      enPassantRef.current = ((fromRank + toRank) / 2) * 8 + (from % 8);
    } else {
      enPassantRef.current = -1;
    }
    halfmoveRef.current = (pieceType === 'P' || isCapture) ? 0 : halfmoveRef.current + 1;
    
    boardRef.current = b;
    sideToMoveRef.current = sideToMoveRef.current === 'w' ? 'b' : 'w';
    gameActiveRef.current = true;
    updateCastleRights(from, to);
    recordPosition();
    
    // Sufiks + / # po wykonaniu ruchu
    const nextTurn = sideToMoveRef.current;
    const nkChar = nextTurn === 'w' ? 'K' : 'k';
    const nkSq = b.indexOf(nkChar);
    const givesCheck = nkSq !== -1 && isSquareAttacked(b, nkSq, nextTurn === 'w' ? 'b' : 'w');
    let hasReply = false;
    for (let i = 0; i < 64 && !hasReply; i++) {
      const p = b[i];
      if (!p) continue;
      if ((nextTurn === 'w') !== (p === p.toUpperCase())) continue;
      const saved = boardRef.current;
      boardRef.current = b;
      const lm = getLegalMoves(i).length > 0;
      boardRef.current = saved;
      if (lm) hasReply = true;
    }
    const suffix = givesCheck ? (hasReply ? '+' : '#') : '';
    const san = baseSan + suffix;
    if (pieceType === 'P' || isCapture) lastProgressRef.current = { kind: pieceType === 'P' ? 'pawn' : 'capture', san };

    const rec: MoveRec = { from, to, piece, captured: captured || (isEp ? (isWhite ? 'p' : 'P') : null), promotion, san };
    const newHistory = [...mhRef.current, rec];
    mhRef.current = newHistory;
    setLastMove({ from, to });
    setMoveHistory(newHistory);
    updateOpening(newHistory);
    if (lostWhite.length) { cwRef.current = [...cwRef.current, ...lostWhite]; setCapturedWhite(prev => [...prev, ...lostWhite]); }
    if (lostBlack.length) { cbRef.current = [...cbRef.current, ...lostBlack]; setCapturedBlack(prev => [...prev, ...lostBlack]); }
    setArrows([]); setCircles([]); setHintMove(null); setArrowPending(null);
    refreshBoard();
    saveGame();
    // Obrót szachownicy co ruch: plansza zawsze stroną gracza, który ma ruch
    if (autoFlipRef.current) setFlipped(isBlackTurn(sideToMoveRef.current));

    if (puzzleModeRef.current) {
      handlePuzzleMove(from, to, promotion);
      return;
    }

    if (checkGameEnd()) return;

    // Komputer gra stroną przeciwną do gracza (nie zawsze czarnymi!)
    if (sideToMoveRef.current !== humanColorRef.current && difficulty > 0 && gameMode === 'ai' && !puzzleModeRef.current) {
      engineRunningRef.current = true;
      setEngineRunning(true);
      setTimeout(() => makeAIMove(), 400);
    }
  };

  // Aplikuje ruch AI (Stockfish) na planszę. AI gra stroną przeciwną do gracza:
  // gracz białymi -> AI czarnymi i na odwrót. Wszystkie stałe (roszada, en passant,
  // promocja, wykrywanie szacha) liczone są względem koloru AI, nie na sztywno.
  const applyAIMove = (bestMove: { from: number; to: number; promotion?: string }) => {
    const b = boardRef.current;
    {
      const ai: 'w' | 'b' = humanColorRef.current === 'w' ? 'b' : 'w';
      const hu: 'w' | 'b' = humanColorRef.current;
      const aiUp = ai === 'w';
      const aiPawn = aiUp ? 'P' : 'p';
      const aiKing = aiUp ? 'K' : 'k';
      const huKing = hu === 'w' ? 'K' : 'k';
      const piece = b[bestMove.from];
      const fromRank = Math.floor(bestMove.from / 8);
      const toRank = Math.floor(bestMove.to / 8);
      // ♛ Inteligentna promocja: wybierz figurę dającą najlepszą ocenę, nie zawsze hetmana
      let promotion: string | undefined = bestMove.promotion;
      if (!promotion && piece && piece.toUpperCase() === 'P' && toRank === (aiUp ? 0 : 7)) {
        let bestScore = aiUp ? -Infinity : Infinity;
        let bestP = aiUp ? 'Q' : 'q';
        for (const cand of (aiUp ? ['Q', 'R', 'B', 'N'] : ['q', 'r', 'b', 'n'])) {
          const tb = [...b];
          tb[bestMove.to] = cand; tb[bestMove.from] = null;
          const s = evaluateBoard(tb);
          if (aiUp ? s > bestScore : s < bestScore) { bestScore = s; bestP = cand; }
        }
        promotion = bestP;
      }

      const isEpMove = piece === aiPawn && bestMove.to === enPassantRef.current && !b[bestMove.to];
      const isCap = !!b[bestMove.to] || isEpMove;
      const baseSan = piece ? buildBaseSAN(bestMove.from, bestMove.to, piece, promotion, isCap) : `${sqToAlg(bestMove.from)}${sqToAlg(bestMove.to)}`;
      pushHistory();
      const newB = [...b];
      const cap = newB[bestMove.to];
      const lostWhite: string[] = [];
      const lostBlack: string[] = [];
      const noteLost = (capP: string) => {
        if (capP === capP.toUpperCase()) lostWhite.push(capP);
        else lostBlack.push(capP);
      };

      if (piece === aiKing && Math.abs(bestMove.to - bestMove.from) === 2) {
        if (aiUp) {
          if (bestMove.to === 62) { newB[61] = newB[63]; newB[63] = null; }
          else if (bestMove.to === 58) { newB[59] = newB[56]; newB[56] = null; }
        } else {
          if (bestMove.to === 6) { newB[5] = newB[7]; newB[7] = null; }
          else if (bestMove.to === 2) { newB[3] = newB[0]; newB[0] = null; }
        }
      }

      if (isEpMove) {
        const epSq = bestMove.to + (aiUp ? 8 : -8);
        if (newB[epSq]) { noteLost(newB[epSq] as string); }
        newB[epSq] = null;
      }

      if (piece && piece.toUpperCase() === 'P' && Math.abs(toRank - fromRank) === 2) {
        enPassantRef.current = ((fromRank + toRank) / 2) * 8 + (bestMove.from % 8);
      } else {
        enPassantRef.current = -1;
      }
      halfmoveRef.current = (piece && piece.toUpperCase() === 'P' || isCap) ? 0 : halfmoveRef.current + 1;

      newB[bestMove.to] = promotion || newB[bestMove.from];
      newB[bestMove.from] = null;
      const aiCastle = piece === aiKing && Math.abs(bestMove.to - bestMove.from) === 2;
      if (cap) { noteLost(cap); playSound('capture'); }
      else if (lostWhite.length || lostBlack.length) playSound('capture');
      else if (aiCastle) playSound('castle');
      else playSound('move');
      if (promotion) setTimeout(() => playSound('promote'), 140);

      boardRef.current = newB;
      sideToMoveRef.current = hu;
      updateCastleRights(bestMove.from, bestMove.to);
      recordPosition();
      const huKingSq = newB.indexOf(huKing);
      const givesCheck = huKingSq !== -1 && isSquareAttacked(newB, huKingSq, ai);
      let hasReply = false;
      for (let i = 0; i < 64 && !hasReply; i++) {
        const p = newB[i];
        if (!p) continue;
        const isHuPiece = (p === p.toUpperCase()) === (hu === 'w');
        if (!isHuPiece) continue;
        const saved = boardRef.current;
        boardRef.current = newB;
        sideToMoveRef.current = hu;
        if (getLegalMoves(i).length > 0) hasReply = true;
        boardRef.current = saved;
      }
      sideToMoveRef.current = hu;
      const san = baseSan + (givesCheck ? (hasReply ? '+' : '#') : '');
      if (piece && piece.toUpperCase() === 'P' || isCap) lastProgressRef.current = { kind: piece && piece.toUpperCase() === 'P' ? 'pawn' : 'capture', san };
      const rec: MoveRec = { from: bestMove.from, to: bestMove.to, piece: piece || '', captured: cap || (isEpMove ? (aiUp ? 'p' : 'P') : null), promotion, san };
      const newHistory = [...mhRef.current, rec];
      mhRef.current = newHistory;
      setLastMove({ from: bestMove.from, to: bestMove.to });
      setMoveHistory(newHistory);
      updateOpening(newHistory);
      if (lostWhite.length) { cwRef.current = [...cwRef.current, ...lostWhite]; setCapturedWhite(prev => [...prev, ...lostWhite]); }
      if (lostBlack.length) { cbRef.current = [...cbRef.current, ...lostBlack]; setCapturedBlack(prev => [...prev, ...lostBlack]); }
      setArrows([]); setCircles([]); setHintMove(null); setArrowPending(null);
      refreshBoard();
      saveGame();
      const stmAfter: 'w' | 'b' = sideToMoveRef.current;
      if (autoFlipRef.current) setFlipped(isBlackTurn(stmAfter));
      checkGameEnd();
    }
  };

  // Jedyny silnik gry: Stockfish 19. Brak fallbacku - w razie awarii ruch nie jest wykonywany,
  // blokada AI jest zwalniana, a gracz widzi komunikat (znacznik przy tytule + konsola).
  const makeAIMove = async () => {
    const token = aiMoveTokenRef.current;
    const fen = boardToFEN();
    // Zegar: silnik dostaje pozostały czas SWOJEJ strony i sam skraca myślenie w niedoczasie.
    const aiSide: 'w' | 'b' = sideToMoveRef.current;
    const clockMs = timeControl === 0 ? undefined : Math.max(0, (aiSide === 'w' ? timeRefs.current.w : timeRefs.current.b) * 1000);
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const r = await stockfish.findBestMove(fen, difficulty, clockMs);
        if (token !== aiMoveTokenRef.current || !gameActiveRef.current) {
          engineRunningRef.current = false;
          setEngineRunning(false);
          return;
        }
        if (r && getLegalMoves(r.from).includes(r.to)) {
          // Klient zwraca ocenę w perspektywie białych (jak lichess) - bez negacji.
          if (r.mateIn !== null) setEvalScore({ cp: null, mate: r.mateIn });
          else if (r.scoreCp !== null) setEvalScore({ cp: r.scoreCp, mate: null });
          applyAIMove({ from: r.from, to: r.to, promotion: r.promotion ? (aiSide === 'w' ? r.promotion.toUpperCase() : r.promotion.toLowerCase()) : undefined });
          engineRunningRef.current = false;
          setEngineRunning(false);
          return;
        }
        console.warn(`[AI] Stockfish zwrócił pusty/nielegalny ruch (próba ${attempt}/3).`);
      } catch (e) {
        console.warn(`[AI] Błąd Stockfisha (próba ${attempt}/3):`, e);
      }
      if (token !== aiMoveTokenRef.current || !gameActiveRef.current) {
        engineRunningRef.current = false;
        setEngineRunning(false);
        return;
      }
      stockfish.stop();
    }
    console.error('[AI] Stockfish niedostępny po 3 próbach - ruch AI pominięty. Odśwież stronę.');
    setOpeningName('❌ Błąd silnika Stockfish — odśwież stronę i zagraj ponownie.');
    setTimeout(() => updateOpening(mhRef.current), 4000);
    engineRunningRef.current = false;
    setEngineRunning(false);
  };

  // 🧠 Statyczna ocena materiałowo-pozycyjna (PST) - tylko do wyświetlania przewagi
  // materiałowej i decyzji o remisie. Ruchy wybiera wyłącznie Stockfish.
  const PST = {
    P: [
      [0,  0,  0,  0,  0,  0,  0,  0],
      [50, 50, 50, 50, 50, 50, 50, 50],
      [10, 10, 20, 30, 30, 20, 10, 10],
      [5,  5, 10, 25, 25, 10,  5,  5],
      [0,  0, 10, 20, 20, 10,  0,  0],
      [0,  0, 10, 15, 15, 10,  0,  0],
      [0,  0, 10, 10, 10, 10,  0,  0],
      [0,  0,  0,  0,  0,  0,  0,  0]
    ],
    N: [
      [-50,-40,-30,-30,-30,-30,-40,-50],
      [-40,-20,  0,  0,  0,  0, -20,-40],
      [-30,  0, 10, 15, 15, 10,  0, -30],
      [-30,  5, 15, 20, 20, 15,  5, -30],
      [-30,  0, 15, 20, 20, 15,  0, -30],
      [-30,  5, 10, 15, 15, 10,  5, -30],
      [-40,-20,  0,  5,  5,  0, -20,-40],
      [-50,-40,-30,-30,-30,-30,-40,-50]
    ],
    B: [
      [-20,-10,-10,-10,-10,-10,-10,-20],
      [-10,  5,  0,  0,  0,  0,  5, -10],
      [-10,  0, 10, 10, 10, 10,  0, -10],
      [-10,  0, 10, 10, 10, 10,  0, -10],
      [-10,  0, 10, 10, 10, 10,  0, -10],
      [-10,  0, 10, 10, 10, 10,  0, -10],
      [-10,  5,  0,  0,  0,  0,  5, -10],
      [-20,-10,-10,-10,-10,-10,-10,-20]
    ],
    R: [
      [0,  0,  0,  0,  0,  0,  0,  0],
      [5, 10, 10, 10, 10, 10, 10,  5],
      [-5,  0,  0,  0,  0,  0,  0, -5],
      [-5,  0,  0,  0,  0,  0,  0, -5],
      [-5,  0,  0,  0,  0,  0,  0, -5],
      [-5,  0,  0,  0,  0,  0,  0, -5],
      [-5,  0,  0,  0,  0,  0,  0, -5],
      [0,  0,  0,  5,  5,  0,  0,  0]
    ],
    Q: [
      [-20,-10,-10,-10,-10,-10,-10,-20],
      [-10,  0,  0,  0,  0,  0,  0, -10],
      [-10,  0,  5,  5,  5,  5,  0, -10],
      [-10,  0,  5,  5,  5,  5,  0, -10],
      [-10,  0,  5,  5,  5,  5,  0, -10],
      [-10,  0,  5,  5,  5,  5,  0, -10],
      [-10,  0,  0,  0,  0,  0,  0, -10],
      [-20,-10,-10,-10,-10,-10,-10,-20]
    ],
    K: [
      [-30,-40,-40,-50,-50,-40,-40,-30],
      [-30,-40,-40,-50,-50,-40,-40,-30],
      [-30,-40,-40,-50,-50,-40,-40,-30],
      [-30,-40,-40,-50,-50,-40,-40,-30],
      [-20,-30,-30,-40,-40,-30,-30,-20],
      [-10,-20,-20,-20,-20,-20,-20,-10],
      [20, 20,  0,  0,  0,  0, 20, 20],
      [20, 30, 10,  0,  0, 10, 30, 20]
    ]
  };

  const evaluateBoard = (b: (string | null)[]): number => {
    const vals: Record<string, number> = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000 };
    let score = 0;
    for (let i = 0; i < 64; i++) {
      const p = b[i];
      if (!p) continue;
      const isW = p === p.toUpperCase();
      const type = p.toUpperCase();
      const v = vals[type] || 0;

      const r = Math.floor(i / 8);
      const f = i % 8;

      // Pobierz wartość z tabeli pozycji (odwróć r dla czarnych)
      const pstVal = isW ? PST[type][r][f] : PST[type][7 - r][f];

      score += (isW ? v + pstVal : -(v + pstVal));
    }
    return score;
  };


  const handlePromotion = (pieceChar: string) => {
    if (promotionSquare && selectedSquare !== null) {
      const promo = promotionSquare.isWhite ? pieceChar.toUpperCase() : pieceChar.toLowerCase();
      executeMove(selectedSquare, promotionSquare.square, promo);
      setSelectedSquare(null);
      setPossibleMoves([]);
      setPromotionSquare(null);
    }
  };

  return (
    <>
    <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-gray-100 min-h-[100dvh] flex flex-col" style={{ WebkitOverflowScrolling: 'touch' }}>
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        .square {
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          position: relative;
          transition: all 0.15s ease;
          user-select: none;
          aspect-ratio: 1;
        }
        .square.light { 
          background: linear-gradient(145deg, #f0d9b5 0%, #e8c89a 100%);
        }
        .square.dark { 
          background: linear-gradient(145deg, #b58863 0%, #9c7354 100%);
        }
        .square.selected {
          background: linear-gradient(145deg, #76b041 0%, #5a9628 100%) !important;
          box-shadow: inset 0 0 25px rgba(0, 0, 0, 0.5), 0 0 30px rgba(118, 176, 65, 0.6);
          z-index: 10;
          animation: selected-pulse 2s infinite;
        }
        @keyframes selected-pulse {
          0%, 100% { box-shadow: inset 0 0 25px rgba(0, 0, 0, 0.5), 0 0 30px rgba(118, 176, 65, 0.6); }
          50% { box-shadow: inset 0 0 25px rgba(0, 0, 0, 0.5), 0 0 40px rgba(118, 176, 65, 0.8); }
        }
        .square.last-move {
          background: linear-gradient(145deg, rgba(255, 255, 0, 0.5) 0%, rgba(220, 220, 0, 0.4) 100%) !important;
          animation: last-move-flash 1s ease-out;
        }
        @keyframes last-move-flash {
          0% { background: linear-gradient(145deg, rgba(255, 255, 0, 0.8) 0%, rgba(220, 220, 0, 0.7) 100%) !important; }
          100% { background: linear-gradient(145deg, rgba(255, 255, 0, 0.5) 0%, rgba(220, 220, 0, 0.4) 100%) !important; }
        }
        .square.possible-move::after {
          content: '';
          position: absolute;
          width: 30%;
          height: 30%;
          background: rgba(0, 0, 0, 0.3);
          border-radius: 50%;
        }
        .square.possible-capture::after {
          content: '';
          position: absolute;
          width: 92%;
          height: 92%;
          border: 4px solid rgba(0, 0, 0, 0.35);
          border-radius: 50%;
          background: transparent;
        }
        .square:hover { filter: brightness(1.08); }
        .square.in-check { background: radial-gradient(circle, #ff3b30 0%, #b71c1c 70%) !important; box-shadow: inset 0 0 25px rgba(255,0,0,.7), 0 0 25px rgba(255,0,0,.8); z-index: 5; animation: check-blink 1s infinite; }
        @keyframes check-blink { 0%,100% { filter: brightness(1); } 50% { filter: brightness(1.35); } }
        .square.hint { outline: 3px solid #22d3ee !important; outline-offset: -3px; z-index: 6; }
        .square.arrow-from { outline: 3px solid rgba(34,211,238,.9) !important; outline-offset: -3px; }
        .piece-appear { animation: piece-pop .22s ease-out; }
        @keyframes piece-pop { from { transform: scale(.7); opacity:.4; } to { transform: scale(1); opacity:1; } }
        .piece-unicode { font-size: clamp(28px, 5vw, 52px); line-height:1; }
        .piece-unicode.white { color:#fafafa; text-shadow: -1px -1px 0 #222, 1px -1px 0 #222, -1px 1px 0 #222, 1px 1px 0 #222, 0 3px 5px rgba(0,0,0,.6); }
        .piece-unicode.black { color:#111; text-shadow: -1px -1px 0 #eee, 1px -1px 0 #eee, -1px 1px 0 #eee, 1px 1px 0 #eee, 0 3px 5px rgba(0,0,0,.6); }
        .arrows-layer { position:absolute; inset:0; pointer-events:none; z-index:1; filter: drop-shadow(0 1px 1px rgba(0,0,0,.45)); }
        .arrows-layer .annot { animation: annot-in .16s ease-out; }
        @keyframes annot-in { from { opacity: 0; } }
        .piece-svg, .piece-unicode { position: relative; z-index: 2; }
        .clock-bar { display:flex; align-items:stretch; justify-content:center; gap:8px; margin:0 0 4px; }
        .clock { flex:1; max-width:220px; display:flex; align-items:center; justify-content:space-between; gap:8px; padding:6px 12px; border-radius:12px; background:linear-gradient(135deg,rgba(45,45,60,.95),rgba(20,20,30,.95)); border:2px solid rgba(255,255,255,.10); transition:all .25s ease; }
        .clock .clock-label { font-size:10px; letter-spacing:1.5px; text-transform:uppercase; color:#9ca3af; font-weight:700; }
        .clock .clock-name { font-size:11px; font-weight:800; }
        .clock .clock-time { font-family:'Consolas','SF Mono',monospace; font-size:clamp(20px,2.2vw,28px); font-weight:900; letter-spacing:1.5px; font-variant-numeric:tabular-nums; line-height:1; }
        .clock.active-w { border-color:#60a5fa; box-shadow:0 0 0 1px #60a5fa, 0 0 28px rgba(96,165,250,.55), inset 0 0 18px rgba(96,165,250,.15); transform:translateY(-1px); }
        .clock.active-w .clock-time { color:#bfdbfe; text-shadow:0 0 18px rgba(96,165,250,.8); }
        .clock.active-b { border-color:#f87171; box-shadow:0 0 0 1px #f87171, 0 0 28px rgba(248,113,113,.55), inset 0 0 18px rgba(248,113,113,.15); transform:translateY(-1px); }
        .clock.active-b .clock-time { color:#fecaca; text-shadow:0 0 18px rgba(248,113,113,.8); }
        .clock .dot { width:10px; height:10px; border-radius:50%; background:#374151; flex-shrink:0; }
        .clock.active-w .dot { background:#22c55e; box-shadow:0 0 12px #22c55e; animation:pulse 1s infinite; }
        .clock.active-b .dot { background:#ef4444; box-shadow:0 0 12px #ef4444; animation:pulse 1s infinite; }
        .clock.low .clock-time { color:#fbbf24 !important; }
        .clock.critical .clock-time { color:#ef4444 !important; animation:check-blink .7s infinite; }
        .clock-mid { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:0px; min-width:48px; color:#9ca3af; font-size:10px; font-weight:700; letter-spacing:1px; }
        .clock-mid .vs { font-size:14px; }
        
        /* FIGURY 2D FLAT */
        .piece-svg {
          width: 82%;
          height: 82%;
          transition: transform 0.1s ease;
          filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.35));
        }
        .piece-svg svg {
          width: 100%;
          height: 100%;
          display: block;
          overflow: visible;
        }
        .square.selected .piece-svg {
          transform: scale(1.1);
          filter: drop-shadow(0 0 15px rgba(255, 215, 0, 0.8)) drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5));
        }
        .piece-svg:active { transform: scale(1.1); }
        .square.selected .piece-svg {
          transform: scale(1.15);
          filter: drop-shadow(0 0 20px rgba(255, 215, 0, 0.9)) drop-shadow(0 2px 6px rgba(0, 0, 0, 0.6));
        }
        
        .piece.black { 
          color: #000000;
          -webkit-text-stroke: 0.5px #cccccc;
          text-shadow: 
            -1px -1px 1px rgba(255, 255, 255, 0.3),
            1px -1px 1px rgba(255, 255, 255, 0.3),
            -1px 1px 1px rgba(255, 255, 255, 0.3),
            1px 1px 1px rgba(255, 255, 255, 0.3),
            0 2px 4px rgba(0, 0, 0, 0.4);
        }
        
        .square.selected .piece {
          transform: scale(1.15);
          filter: drop-shadow(0 0 20px rgba(255, 215, 0, 0.9));
        }
        
        .panel {
          background: linear-gradient(135deg, rgba(35, 35, 45, 0.95) 0%, rgba(25, 25, 35, 0.95) 100%);
          border-radius: 16px;
          padding: 24px;
          margin: 10px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .btn {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border: none;
          color: white;
          padding: 12px 24px;
          border-radius: 10px;
          cursor: pointer;
          font-weight: bold;
          transition: all 0.3s ease;
          font-size: 13px;
          box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
        }
        .btn:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(102, 126, 234, 0.5); }
        .btn-secondary { background: linear-gradient(135deg, #505285 0%, #6b6696 100%); }
        .status-indicator {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          display: inline-block;
          margin-right: 10px;
        }
        .status-indicator.online { background: #27ae60; box-shadow: 0 0 10px #27ae60; }
        .status-indicator.busy { background: #f39c12; animation: pulse 0.8s infinite; }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .engine-info {
          background: rgba(0, 0, 0, 0.3);
          border-radius: 10px;
          padding: 18px;
          margin-top: 15px;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }
        .info-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        .info-row:last-child { border-bottom: none; }
        .rule50 { margin: 6px 0 2px; }
        .rule50-bar { height: 10px; border-radius: 999px; background: rgba(255,255,255,.08); overflow: hidden; border: 1px solid rgba(255,255,255,.1); }
        .rule50-fill { height: 100%; width: 0; border-radius: 999px; background: linear-gradient(90deg,#22c55e,#a3e635); transition: width .3s ease; }
        .rule50-fill.warn { background: linear-gradient(90deg,#f59e0b,#fbbf24); }
        .rule50-fill.crit { background: linear-gradient(90deg,#ef4444,#f87171); }
        .rule50-text { font-size: 12px; font-weight: 700; color: #e2e8f0; margin-top: 4px; }
        .rule50-sub { font-size: 11px; color: #9ca3af; margin-top: 2px; }
        .info-label { color: #aaa; font-size: 13px; }
        .info-value { font-weight: bold; color: #667eea; font-size: 13px; }
        .tab-container { display: flex; gap: 4px; margin-bottom: 18px; flex-wrap: wrap; }
        .tab {
          padding: 12px 20px;
          background: rgba(255, 255, 255, 0.05);
          border: none;
          color: #888;
          cursor: pointer;
          border-radius: 10px 10px 0 0;
          transition: all 0.3s ease;
          font-weight: 500;
        }
        .tab:hover { background: rgba(102, 126, 234, 0.2); color: #ddd; }
        .tab.active {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }
        .tab-content { display: none; }
        .tab-content.active { display: block; }
        .promotion-modal {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.9);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        .promotion-options {
          background: linear-gradient(135deg, #2d3748 0%, #1a202c 100%);
          padding: 20px;
          border-radius: 16px;
          display: flex;
          gap: 15px;
          border: 2px solid #667eea;
        }
        .promotion-piece {
          font-size: 54px;
          cursor: pointer;
          padding: 15px;
          border-radius: 12px;
          transition: all 0.2s ease;
          background: rgba(255,255,255,0.1);
        }
        .promotion-piece:hover {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          transform: scale(1.15);
        }
        .captured-pieces {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0;
          max-height: 25vh;
          overflow-y: auto;
          padding: 8px 10px;
          border-radius: 12px;
          background: linear-gradient(135deg, rgba(30,30,42,.9), rgba(15,15,24,.9));
          border: 1px solid rgba(255,255,255,.08);
          box-shadow: inset 0 2px 8px rgba(0,0,0,.5);
        }
        .cap-card { border-radius: 12px; padding: 6px 8px; background: linear-gradient(135deg, rgba(40,40,58,.9), rgba(18,18,28,.9)); border: 1px solid rgba(255,255,255,.09); box-shadow: 0 4px 14px rgba(0,0,0,.4); }
        .cap-card.side-w { border-top: 3px solid #e8edf5; }
        .cap-card.side-b { border-top: 3px solid #1a1a22; box-shadow: 0 4px 14px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.06); }
        .cap-head { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
        .cap-name { font-size: 12px; font-weight: 800; letter-spacing: .3px; }
        .cap-name.w { color: #e8edf5; } .cap-name.b { color: #aab2c5; }
        .cap-count { font-size: 10px; font-weight: 800; background: rgba(255,255,255,.10); padding: 1px 7px; border-radius: 999px; color: #cbd5e1; }
        .cap-adv { font-size: 11px; font-weight: 900; padding: 1px 8px; border-radius: 999px; }
        .cap-adv.plus-w { background: linear-gradient(135deg,#3b82f6,#1d4ed8); color: #fff; box-shadow: 0 0 12px rgba(59,130,246,.6); }
        .cap-adv.plus-b { background: linear-gradient(135deg,#ef4444,#991b1b); color: #fff; box-shadow: 0 0 12px rgba(239,68,68,.6); }
        .cap-list { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; }
        .captured-piece {
          width: 38px;
          height: 38px;
          margin-left: 0;
          border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 3px 8px rgba(0,0,0,.55);
          transition: transform .15s ease;
          overflow: hidden;
          flex-shrink: 0;
        }
        .captured-piece:first-child { margin-left: 0; }
        .captured-piece:hover { transform: translateY(-3px) scale(1.15); z-index: 5; }
        .captured-piece.tile-w { background: linear-gradient(145deg,#0b1220,#1e293b); border: 2px solid #f8fafc; box-shadow: 0 3px 8px rgba(0,0,0,.65), 0 0 12px rgba(255,255,255,.35); }
        .captured-piece.tile-b { background: linear-gradient(145deg,#ffffff,#c3ccd9); border: 1.5px solid rgba(15,23,42,.35); box-shadow: 0 3px 8px rgba(0,0,0,.5), 0 0 10px rgba(255,255,255,.25); }
        .captured-piece .cap-svg { width: 92%; height: 92%; display: flex; align-items: center; justify-content: center; }
        .captured-piece .cap-svg svg { width: 100%; height: 100%; display: block; overflow: visible; }
        .captured-piece.uni { font-size: 26px; line-height: 1; }
        .captured-piece.uni.is-w { color: #f8fafc; text-shadow: -1px -1px 0 #1e293b, 1px -1px 0 #1e293b, -1px 1px 0 #1e293b, 1px 1px 0 #1e293b; }
        .captured-piece.uni.is-b { color: #0b0b10; text-shadow: -1px -1px 0 #cbd5e1, 1px -1px 0 #cbd5e1, -1px 1px 0 #cbd5e1, 1px 1px 0 #cbd5e1; }
        .cap-empty { color: rgba(255,255,255,.28); font-size: 12px; font-style: italic; padding: 2px 4px; }
        .promotion-piece svg { width: 60px; height: 60px; display: block; }
        .difficulty-selector { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
        .difficulty-btn {
          flex: 1;
          min-width: 80px;
          padding: 10px;
          background: rgba(255, 255, 255, 0.05);
          border: 2px solid rgba(255, 255, 255, 0.1);
          color: #888;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.3s ease;
          font-weight: bold;
        }
        .difficulty-btn:hover { background: rgba(102, 126, 234, 0.2); border-color: #667eea; color: #ddd; }
        .difficulty-btn.active { 
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
          color: white; 
          border-color: #667eea;
        }
        .coord-file { position: absolute; bottom: 1px; right: 3px; font-size: 9px; font-weight: bold; color: rgba(0,0,0,0.45); pointer-events: none; z-index: 5; }
        .coord-rank { position: absolute; top: 1px; left: 3px; font-size: 9px; font-weight: bold; color: rgba(255,255,255,0.65); pointer-events: none; z-index: 5; text-shadow: 0 1px 2px rgba(0,0,0,0.6); }
        .move-history {
          max-height: 280px;
          overflow-y: auto;
          font-family: 'Consolas', monospace;
          font-size: 13px;
          background: rgba(0, 0, 0, 0.3);
          border-radius: 8px;
          padding: 10px;
        }
        .move-history::-webkit-scrollbar { width: 6px; }
        .move-history::-webkit-scrollbar-thumb { background: #667eea; border-radius: 3px; }
        .move-row {
          display: flex;
          padding: 5px 8px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        .move-num { width: 40px; color: #888; font-weight: bold; }
        .move-white, .move-black { flex: 1; }
        /* Dolna sekcja: przyjazny "control deck" - karty, segmenty, duże cele dotykowe */
        .bottom-section { display: flex; flex-direction: column; gap: 10px; }
        .captured-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .captured-empty { color: rgba(255, 255, 255, 0.25); font-size: 20px; line-height: 30px; }
        .bottom-bar { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr)); gap: 10px; align-items: stretch; }
        @media (min-width: 1280px) {
          .bottom-bar { grid-template-columns: 1.35fr 1fr 1fr; }
        }
        .bottom-group { display: flex; align-items: center; gap: 6px; }
        .bottom-btn { padding: 8px 14px; font-size: 12px; }
        .bottom-diff { min-width: 0 !important; flex: none !important; padding: 7px 10px !important; font-size: 12px; }
        /* Karty sterowania */
        .ctl-card {
          min-width: 0;
          background: linear-gradient(135deg, rgba(38,38,52,.96), rgba(18,18,28,.96));
          border: 1px solid rgba(255,255,255,.10);
          border-radius: 14px; padding: 12px 14px;
          box-shadow: 0 6px 20px rgba(0,0,0,.45);
          display: flex; flex-direction: column; gap: 8px;
        }
        .ctl-title {
          font-size: 11px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase;
          color: #9ca3af; display: flex; align-items: center; gap: 6px;
        }
        .ctl-hint { font-size: 12px; color: #9ca3af; line-height: 1.35; }
        .ctl-hint strong { color: #e2e8f0; }
        /* Segmented control: Komputer / Człowiek, Białe / Czarne / Losowo */
        .seg {
          display: flex; gap: 4px; padding: 4px; border-radius: 12px;
          background: rgba(0,0,0,.38); border: 1px solid rgba(255,255,255,.08);
        }
        .seg-btn {
          flex: 1 1 0; min-width: 0; min-height: 44px; padding: 8px 10px;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          border-radius: 10px; border: 1px solid transparent;
          background: transparent; color: #cbd5e1;
          font-size: 13px; font-weight: 800; cursor: pointer;
          transition: all .18s ease; white-space: nowrap;
        }
        .seg-btn > span { min-width: 0; }
        .seg-btn .seg-ico { font-size: 17px; line-height: 1; }
        .seg-btn .seg-sub { display: block; font-size: 10px; font-weight: 600; color: #94a3b8; }
        .seg-btn:hover { background: rgba(102,126,234,.16); color: #fff; }
        .seg-btn:focus-visible, .action-btn:focus-visible, .chip:focus-visible, .start-btn:focus-visible {
          outline: 2px solid #22d3ee; outline-offset: 2px;
        }
        .seg-btn.active[data-variant="ai"] { background: linear-gradient(135deg,#3b82f6,#1d4ed8); color: #fff; box-shadow: 0 4px 14px rgba(59,130,246,.5); border-color: rgba(147,197,253,.5); }
        .seg-btn.active[data-variant="human"] { background: linear-gradient(135deg,#16a34a,#065f46); color: #fff; box-shadow: 0 4px 14px rgba(34,197,94,.5); border-color: rgba(110,231,183,.5); }
        .seg-btn.active[data-variant="white"] { background: linear-gradient(135deg,#f8fafc,#cbd5e1); color: #0f172a; box-shadow: 0 4px 14px rgba(255,255,255,.35); border-color: #fff; }
        .seg-btn.active[data-variant="white"] .seg-sub { color: #475569; }
        .seg-btn.active[data-variant="black"] { background: linear-gradient(135deg,#334155,#020617); color: #fff; box-shadow: 0 4px 14px rgba(0,0,0,.7), 0 0 0 1px rgba(255,255,255,.25) inset; border-color: #64748b; }
        .seg-btn.active[data-variant="black"] .seg-sub { color: #cbd5e1; }
        .seg-btn.active[data-variant="random"] { background: linear-gradient(135deg,#8b5cf6,#6d28d9); color: #fff; box-shadow: 0 4px 14px rgba(139,92,246,.5); border-color: rgba(196,181,253,.5); }
        /* Duży Start */
        .start-btn {
          min-height: 48px; border: none; border-radius: 12px; cursor: pointer;
          font-size: 15px; font-weight: 900; letter-spacing: .5px; color: #fff;
          background: linear-gradient(135deg,#22c55e,#15803d);
          box-shadow: 0 6px 18px rgba(34,197,94,.45);
          display: flex; align-items: center; justify-content: center; gap: 8px;
          transition: all .18s ease; width: 100%;
        }
        .start-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 22px rgba(34,197,94,.55); filter: brightness(1.06); }
        .start-btn:active { transform: translateY(0) scale(.99); }
        /* Siatka akcji partii */
        .actions-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
        .action-btn {
          min-width: 0; min-height: 48px; padding: 8px 6px; border-radius: 12px; cursor: pointer;
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
          background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.10); color: #e2e8f0;
          font-size: 12px; font-weight: 800; transition: all .18s ease; text-align: center;
        }
        .action-btn .act-ico { font-size: 18px; line-height: 1; }
        .action-btn:hover:not(:disabled) { background: rgba(102,126,234,.22); border-color: #667eea; transform: translateY(-1px); }
        .action-btn:active:not(:disabled) { transform: scale(.98); }
        .action-btn:disabled { opacity: .38; cursor: not-allowed; }
        .action-btn.danger { background: rgba(239,68,68,.12); border-color: rgba(239,68,68,.35); }
        .action-btn.danger:hover:not(:disabled) { background: rgba(239,68,68,.28); border-color: #ef4444; }
        /* Chipy: poziom + czas */
        .chips { display: flex; flex-wrap: wrap; gap: 6px; }
        .chip {
          min-width: 0; min-height: 38px; padding: 7px 13px; border-radius: 999px; cursor: pointer;
          background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12); color: #cbd5e1;
          font-size: 12px; font-weight: 800; transition: all .18s ease; flex: 1 1 auto;
          display: inline-flex; align-items: center; justify-content: center; gap: 5px; text-align: center;
        }
        .chip:hover { background: rgba(102,126,234,.2); border-color: #667eea; color: #fff; }
        .chip.active { background: linear-gradient(135deg,#667eea,#764ba2); color: #fff; border-color: #818cf8; box-shadow: 0 3px 12px rgba(102,126,234,.5); }
        .chip.active-time { background: linear-gradient(135deg,#0ea5e9,#0369a1); border-color: #38bdf8; box-shadow: 0 3px 12px rgba(14,165,233,.5); color: #fff; }
        /* Telefony: pełne etykiety, nic nie przycięte, wygodne cele dotykowe */
        @media (max-width: 640px) {
          .panel { padding: 12px !important; margin: 6px !important; }
          .captured-row { grid-template-columns: 1fr; }
          .bottom-bar { grid-template-columns: 1fr; }
          .ctl-card { padding: 12px; }
          .actions-grid { grid-template-columns: repeat(3, 1fr); gap: 6px; }
          .seg { gap: 3px; padding: 3px; }
          .seg-btn { font-size: 11px; gap: 5px; padding: 8px 4px; white-space: normal; line-height: 1.25; }
          .seg-btn .seg-ico { font-size: 15px; }
          .seg-btn .seg-sub { font-size: 9px; }
          .action-btn { font-size: 11px; min-height: 52px; }
          .chip { font-size: 11px; min-height: 40px; padding: 7px 10px; }
          .tab { padding: 10px 12px; font-size: 13px; }
          .ctl-hint { font-size: 11px; }
        }
        /* Bardzo wąskie ekrany: zegary jeden pod drugim, pełna szerokość */
        @media (max-width: 440px) {
          .clock-bar { flex-direction: column; align-items: stretch; }
          .clock { max-width: none; width: 100%; }
          .clock-mid { flex-direction: row; min-width: 0; padding: 2px 0; }
          .seg-btn { font-size: 10px; }
        }
        /* Szerokie ekrany: strona swobodnie się przewija (nic nie jest ucinane),
           plansza ma naturalny rozmiar, panel boczny przyklejony */
        @media (min-width: 1280px) {
          .panel { padding: 12px; margin: 0; }
          .chess-board { margin-inline: auto; }
          .chess-board-container { width: 100%; max-width: 760px; margin-inline: auto; }
          .move-history { max-height: 260px; }
          .bottom-btn { padding: 6px 10px !important; font-size: 11px !important; }
          .bottom-diff { padding: 5px 8px !important; font-size: 11px !important; }
          .side-sticky { position: sticky; top: 8px; max-height: calc(100dvh - 16px); overflow-y: auto; }
          .captured-piece { width: 34px; height: 34px; }
          .engine-info { padding: 12px; margin-top: 8px; }
          .info-row { padding: 5px 0; }
          .tab { padding: 8px 14px; }
          .tab-container { margin-bottom: 8px; }
        }
        .mate-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.55);
          backdrop-filter: blur(2px);
          z-index: 50;
          border-radius: 6px;
          animation: mate-fade 0.4s ease-out;
        }
        @keyframes mate-fade { from { opacity: 0; } to { opacity: 1; } }
        .mate-card {
          text-align: center;
          padding: 28px 44px;
          border-radius: 20px;
          background: linear-gradient(135deg, #1a1a2e 0%, #2d2a1a 50%, #1a1a2e 100%);
          border: 3px solid #f5c542;
          box-shadow: 0 0 60px rgba(245, 197, 66, 0.45), 0 20px 60px rgba(0, 0, 0, 0.7);
          animation: mate-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        @keyframes mate-pop {
          0% { transform: scale(0.5); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        .mate-trophy { font-size: 56px; margin-bottom: 8px; }
        .mate-title {
          font-size: 38px;
          font-weight: 900;
          letter-spacing: 2px;
          background: linear-gradient(135deg, #f5c542 0%, #ffed9e 50%, #f5c542 100%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          margin-bottom: 6px;
        }
        .mate-sub { font-size: 18px; color: #eee; margin-bottom: 18px; font-weight: 600; }
        @media (max-width: 1024px) {
          .panel { margin: 8px; padding: 18px; }
        }
        .puzzle-list { display: flex; flex-direction: column; gap: 8px; max-height: 60vh; overflow-y: auto; padding-right: 4px; scrollbar-width: thin; }
        .puzzle-item { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 12px; border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; background: rgba(255,255,255,0.03); }
        .puzzle-item:hover { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.15); }
        .puzzle-info { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; }
        .puzzle-level { font-size: 14px; width: 24px; text-align: center; flex-shrink: 0; }
        .puzzle-name { color: #e2e8f0; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
        .puzzle-goal { color: #94a3b8; font-size: 11px; margin-left: auto; flex-shrink: 0; }
        .puzzle-solved { color: #22c55e; font-size: 11px; margin-left: 8px; flex-shrink: 0; }
        .puzzle-btn { padding: 8px 14px; font-size: 12px; border-radius: 6px; border: none; background: rgba(255,255,255,0.1); color: #e2e8f0; cursor: pointer; flex-shrink: 0; }
        .puzzle-btn:hover { background: rgba(255,255,255,0.2); }
        .puzzle-btn.solved { background: rgba(34,197,94,0.2); color: #22c55e; cursor: pointer; }
        .puzzle-btn.solved:hover { background: rgba(34,197,94,0.3); }
        .puzzle-item.solved { opacity: 0.7; }
        .puzzle-item.solved:hover { opacity: 1; }
        .puzzle-solved { color: #22c55e; font-weight: 700; margin-left: 6px; font-size: 12px; }
        .puzzles-header h3 { margin: 0; font-size: 18px; }
        .puzzles-header p { margin: 2px 0 0 0; font-size: 13px; }
      `}</style>
      
      <div className="mx-auto px-2 w-full flex flex-col" style={{ maxWidth: '1400px' }}>
        <header className="text-center mb-0 shrink-0">
          <h1 className="text-xl xl:text-2xl font-bold mb-0 bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500 bg-clip-text text-transparent">
            ♔ Super Chess
          </h1>
          <p className="text-xs text-gray-400 max-w-2xl mx-auto hidden xl:block">
            Figury Merida / Kingdom - wybierz w Ustawieniach
          </p>
        </header>
        
        <div className="flex flex-col xl:flex-row gap-4 items-start flex-1">
          <div className="flex-1 min-w-0 w-full flex flex-col">
              <div className="panel flex-1 flex flex-col" style={{ margin: 0 }}>
              <div className="flex justify-between items-center mb-1 shrink-0 flex-wrap gap-2">
                <div className="flex items-center">
                  <span className={`status-indicator ${engineRunning ? 'busy' : 'online'}`}></span>
                  <span className="font-bold text-lg">Super Chess</span>
                  <span
                    title={engineStatus === 'ready' ? 'Przeciwnik: Stockfish 19 (pełna siła) - kliknij, by przeładować silnik' : engineStatus === 'loading' ? 'Silnik Stockfish się ładuje…' : 'Stockfish niedostępny - kliknij, by spróbować ponownie'}
                    onClick={() => { if (engineStatus === 'error') stockfish.retry().catch(() => {}); }}
                    style={{
                      marginLeft: 10, fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 999,
                      background: engineStatus === 'ready' ? 'linear-gradient(135deg,#16a34a,#065f46)' : engineStatus === 'loading' ? 'linear-gradient(135deg,#d97706,#92400e)' : 'linear-gradient(135deg,#dc2626,#7f1d1d)',
                      color: '#fff', whiteSpace: 'nowrap',
                      cursor: engineStatus === 'error' ? 'pointer' : 'default',
                    }}
                  >
                    {engineStatus === 'ready' ? '♟️ Stockfish 19' : engineStatus === 'loading' ? '⏳ Ładowanie silnika…' : '❌ Brak silnika (kliknij)'}
                  </span>
                </div>
                <div className={`font-bold ${gameResult ? 'text-yellow-400' : sideToMove === 'w' ? 'text-blue-400' : 'text-red-400'}`}>
                  {gameResult
                    ? (gameResult.type === 'mate'
                        ? (gameResult.winner === 'w' ? '🏆 Szach-mat! Białe wygrywają' : '🏆 Szach-mat! Czarne wygrywają')
                        : gameResult.type === 'stalemate' ? '🤝 Pat! Remis'
                        : gameResult.type === 'draw-50' ? '🤝 Remis: reguła 50 ruchów'
                        : gameResult.type === 'draw-repetition' ? '🤝 Remis: 3x powtórzenie'
                        : gameResult.type === 'draw-material' ? '🤝 Remis: brak materiału'
                        : gameResult.type === 'draw-agreement' ? '🤝 Remis za zgodą'
                        : gameResult.type === 'resign' ? '🏳️ Poddanie!'
                        : '⏱️ Czas!')
                    : (gameMode === 'human'
                        ? (sideToMove === 'w' ? '⚪ Ruch białych' : '⚫ Ruch czarnych')
                        : (sideToMove === humanColor
                            ? (humanColor === 'w' ? '🎯 Twój ruch - Białe' : '🎯 Twój ruch - Czarne')
                            : (humanColor === 'w' ? '🤖 Komputer myśli... - Czarne' : '🤖 Komputer myśli... - Białe')))}
                </div>
              </div>
              <div className="text-center text-xs text-emerald-300" style={{ marginBottom: 2, minHeight: 16 }}>{openingName ? `📖 ${openingName}` : ' '}</div>
              <div className="clock-bar">
                {(() => {
                  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
                  const wActive = gameActive && !gameResult && sideToMove === 'w';
                  const bActive = gameActive && !gameResult && sideToMove === 'b';
                  const wCls = whiteTime <= 10 && timeControl > 0 ? 'critical' : whiteTime <= 30 && timeControl > 0 ? 'low' : '';
                  const bCls = blackTime <= 10 && timeControl > 0 ? 'critical' : blackTime <= 30 && timeControl > 0 ? 'low' : '';
                  return (<>
                    <div className={`clock ${wActive ? 'active-w' : ''} ${wCls}`}>
                      <div><div className="clock-label">Białe ♔</div><div className="clock-name">{gameMode === 'ai' ? (humanColor === 'w' ? 'Ty' : 'Komputer') : 'Gracz 1'}</div></div>
                      <div className="clock-time">{timeControl === 0 ? '∞' : fmt(whiteTime)}</div>
                      <div className="dot"></div>
                    </div>
                    <div className="clock-mid"><span className="vs">⚔️</span><span>{timeControl === 0 ? 'bez czasu' : `${timeControl} min`}</span></div>
                    <div className={`clock ${bActive ? 'active-b' : ''} ${bCls}`}>
                      <div className="dot"></div>
                      <div className="clock-time">{timeControl === 0 ? '∞' : fmt(blackTime)}</div>
                      <div style={{ textAlign: 'right' }}><div className="clock-label">♚ Czarne</div><div className="clock-name">{gameMode === 'ai' ? (humanColor === 'b' ? 'Ty' : 'Komputer') : 'Gracz 2'}</div></div>
                    </div>
                  </>);
                })()}
              </div>
              
              <div className="w-full flex items-center justify-center min-h-0" style={{ marginBottom: 0 }}>
                <div className="chess-board-container flex justify-center gap-2 w-full" style={{ position: 'relative' }}>
                  <div className="w-full flex items-center justify-center">
                    <div className="chess-board grid grid-cols-8 gap-0 border-8 rounded-md overflow-hidden shadow-2xl aspect-[1]"
                         style={{
                          maxWidth: '95vw',
                          maxHeight: '70vh',
                           width: 'auto',
                           height: 'auto',
                           borderColor: '#5c3a1e',
                           boxShadow: '0 25px 60px rgba(0, 0, 0, 0.8), inset 0 0 30px rgba(0,0,0,0.3)',
                           position: 'relative'
                         }}>
                    {(() => {
                      const ranks = flipped ? [7,6,5,4,3,2,1,0] : [0,1,2,3,4,5,6,7];
                      const files = flipped ? [7,6,5,4,3,2,1,0] : [0,1,2,3,4,5,6,7];
                      const theme = BOARD_THEMES.find(t => t.id === boardTheme) || BOARD_THEMES[0];
                      const kChar = sideToMove === 'w' ? 'K' : 'k';
                      const kSq = board.indexOf(kChar);
                      const enemy: 'w' | 'b' = sideToMove === 'w' ? 'b' : 'w';
                      const checkSq = (!gameResult && kSq >= 0 && isSquareAttacked(board, kSq, enemy)) ? kSq : -1;
                      
                      return ranks.map((rank, ri) =>
                        files.map((file, fi) => {
                          const sq = rank * 8 + file;
                          const isLight = (rank + file) % 2 === 0;
                          const piece = board[sq];
                          const isSelected = selectedSquare === sq;
                          const showMoves = showLegalMoves && possibleMoves.includes(sq);
                          const isLast = lastMove && (lastMove.from === sq || lastMove.to === sq);
                          const hasEnemy = piece && possibleMoves.includes(sq);
                          const isCheck = sq === checkSq;
                          const isHint = hintMove && (hintMove.from === sq || hintMove.to === sq);
                          const sqAlg = sqToAlg(sq);

                          const doMove = (fromSq: number, toSq: number) => {
                            const mv = boardRef.current[fromSq];
                            if (!mv) return;
                            const tr = Math.floor(toSq / 8);
                            const iw = mv === mv.toUpperCase();
                            if (mv.toUpperCase() === 'P' && (tr === 0 || tr === 7)) {
                              setSelectedSquare(fromSq);
                              setPromotionSquare({ square: toSq, isWhite: iw });
                            } else {
                              executeMove(fromSq, toSq);
                              setSelectedSquare(null);
                              setPossibleMoves([]);
                            }
                          };

                          return (
                            <div
                              key={sq}
                              className={`square ${isLight ? 'light' : 'dark'} ${isSelected ? 'selected' : ''} ${isLast ? 'last-move' : ''} ${isCheck ? 'in-check' : ''} ${isHint ? 'hint' : ''} ${arrowPending === sq ? 'arrow-from' : ''} ${showMoves ? (hasEnemy || sq === enPassantRef.current ? 'possible-capture' : 'possible-move') : ''}`}
                              style={{ background: isSelected || isLast || isCheck ? undefined : (isLight ? theme.light : theme.dark) }}
                              onClick={() => { if (touchStartRef.current) return; onSquareClick(sq); }}
                              onTouchStart={() => { touchStartRef.current = true; onSquareClick(sq); setTimeout(() => { touchStartRef.current = false; }, 400); }}
                              onMouseDown={e => { if (e.button === 2) arrowStartRef.current = sq; }}
                              draggable={false}
                              onDragStart={e => {
                                e.dataTransfer.setData('text/plain', String(sq));
                                if (piece) { setSelectedSquare(sq); setPossibleMoves(getLegalMoves(sq)); }
                              }}
                              onDragOver={e => e.preventDefault()}
                              onDrop={e => {
                                e.preventDefault();
                                const fromStr = e.dataTransfer.getData('text/plain');
                                const fromSq = fromStr ? parseInt(fromStr, 10) : selectedSquare;
                                if (fromSq !== null && !isNaN(fromSq as number)) {
                                  if (getLegalMoves(fromSq as number).includes(sq)) doMove(fromSq as number, sq);
                                }
                              }}
                              onContextMenu={e => {
                                e.preventDefault();
                                const color = arrowColor(e);
                                if (arrowMode === 'click') {
                                  // Tryb klik-klik: 1. PPM = początek, 2. PPM = koniec (strzałka),
                                  // 2. PPM w to samo pole = kółko
                                  if (arrowPending === null) {
                                    setArrowPending(sq);
                                  } else if (arrowPending === sq) {
                                    setCircles(prev => prev.some(c => c.sq === sq)
                                      ? prev.filter(c => c.sq !== sq)
                                      : [...prev, { sq, color }]);
                                    setArrowPending(null);
                                  } else {
                                    setArrows(prev => [...prev, { from: arrowPending, to: sq, color }]);
                                    setArrowPending(null);
                                  }
                                } else {
                                  setArrowPending(null);
                                  setCircles(prev => prev.some(c => c.sq === sq)
                                    ? prev.filter(c => c.sq !== sq)
                                    : [...prev, { sq, color }]);
                                }
                              }}
                              onMouseUp={e => {
                                if (e.button === 2 && arrowStartRef.current !== null && arrowStartRef.current !== sq) {
                                  const a = arrowStartRef.current;
                                  setArrows(prev => [...prev, { from: a, to: sq, color: arrowColor(e) }]);
                                  arrowStartRef.current = null;
                                  setArrowPending(null);
                                }
                              }}
                              title={sqAlg}
                            >
                              {piece && (
                                <div className="piece-svg piece-appear" dangerouslySetInnerHTML={{ __html: svgFor(piece) }} />
                              )}
                              {fi === 0 && <span className="coord-rank">{8 - rank}</span>}
                              {ri === 7 && <span className="coord-file">{String.fromCharCode(97 + file)}</span>}
                            </div>
                          );
                        })
                      );
                    })()}
                    <svg className="arrows-layer" viewBox="0 0 8 8">
                      {(() => {
                        // Geometria strzałki jak na lichess: smukły trzon + ostry grot (pełny wielokąt, zero markerów)
                        const AR = { shaft: 0.085, headW: 0.20, headL: 0.42, tipIn: 0.18, startIn: 0.05 };
                        const arrowPoly = (fx: number, fy: number, tx: number, ty: number, k: number): string => {
                          const dx = tx - fx, dy = ty - fy;
                          const len = Math.sqrt(dx * dx + dy * dy) || 1;
                          const ux = dx / len, uy = dy / len;
                          const nx = -uy, ny = ux;
                          const ax = fx + ux * AR.startIn, ay = fy + uy * AR.startIn;
                          const tipx = tx - ux * AR.tipIn, tipy = ty - uy * AR.tipIn;
                          const bx = tipx - ux * AR.headL, by = tipy - uy * AR.headL;
                          const sw = AR.shaft * k, hw = AR.headW * k;
                          const pts = [
                            [ax + nx * sw, ay + ny * sw],
                            [bx + nx * sw, by + ny * sw],
                            [bx + nx * hw, by + ny * hw],
                            [tipx, tipy],
                            [bx - nx * hw, by - ny * hw],
                            [bx - nx * sw, by - ny * sw],
                            [ax - nx * sw, ay - ny * sw],
                          ];
                          return pts.map(p => `${p[0].toFixed(3)},${p[1].toFixed(3)}`).join(' ');
                        };
                        const pt = (sq: number): [number, number] => {
                          let x = (sq % 8) + 0.5, y = Math.floor(sq / 8) + 0.5;
                          if (flipped) { x = 8 - x; y = 8 - y; }
                          return [x, y];
                        };
                        return (<>
                          {arrows.map((a, i) => {
                            const [fx, fy] = pt(a.from);
                            const [tx, ty] = pt(a.to);
                            return (
                              <g key={`a${i}`} className="annot">
                                <polygon points={arrowPoly(fx, fy, tx, ty, 1.55)} fill="#000" opacity="0.30" stroke="#000" strokeWidth="0.03" strokeLinejoin="round" />
                                <polygon points={arrowPoly(fx, fy, tx, ty, 1)} fill={a.color} opacity="0.9" />
                              </g>
                            );
                          })}
                          {circles.map((c, i) => {
                            const [cx, cy] = pt(c.sq);
                            return (
                              <g key={`c${i}`} className="annot">
                                <circle cx={cx} cy={cy} r="0.37" fill="none" stroke="#000" strokeWidth="0.17" opacity="0.28" />
                                <circle cx={cx} cy={cy} r="0.37" fill="none" stroke={c.color} strokeWidth="0.10" opacity="0.9" />
                              </g>
                            );
                          })}
                        </>);
                      })()}
                    </svg>
                  </div>
                  {gameResult && !(puzzleUi && puzzleSolved) && (
                    <div className="mate-overlay">
                      <div className="mate-card">
                        <div className="mate-trophy">{gameResult.type === 'mate' ? '🏆' : gameResult.type === 'resign' ? '🏳️' : gameResult.type === 'timeout' ? '⏱️' : '🤝'}</div>
                        <div className="mate-title">{gameResult.type === 'mate' ? 'SZACH-MAT!' : gameResult.type === 'stalemate' ? 'PAT!' : gameResult.type === 'resign' ? 'PDDANIE' : gameResult.type === 'timeout' ? 'CZAS!' : 'REMIS!'}</div>
                        <div className="mate-sub">
                          {gameResult.type === 'mate'
                            ? (gameResult.winner === 'w' ? '🤍 Białe wygrywają partię!' : '🖤 Czarne wygrywają partię!')
                            : gameResult.type === 'resign' ? (gameMode === 'human' ? 'Jedna ze stron się poddała.' : 'Poddałeś się — wygrywa komputer.')
                            : gameResult.type === 'timeout' ? (gameMode === 'human'
                                ? (gameResult.winner === 'w' ? 'Czas czarnych minął!' : 'Czas białych minął!')
                                : (gameResult.winner === humanColor ? 'Czas komputera minął — wygrywasz!' : 'Twój czas minął!'))
                            : gameResult.type === 'draw-50' ? 'Reguła 50 ruchów.'
                            : gameResult.type === 'draw-repetition' ? 'Trzykrotne powtórzenie pozycji.'
                            : gameResult.type === 'draw-material' ? 'Za mało materiału do mata.'
                            : 'Zgoda na remis.'}
                        </div>
                        <button className="btn" onClick={() => initGame()}>🎮 Nowa Gra</button>
                      </div>
                    </div>
                  )}
                  {puzzleUi && puzzleSolved && (
                    <div className="mate-overlay">
                      <div className="mate-card">
                        <div className="mate-trophy">🏆</div>
                        <div className="mate-title">ZADANIE ZALICZONE!</div>
                          <div className="mate-sub">🧩 {PUZZLES_FROM_LICHESS[puzzleUi.idx]?.name} ({PUZZLES_FROM_LICHESS[puzzleUi.idx]?.sol})</div>
                          {PUZZLES_FROM_LICHESS[puzzleUi.idx]?.pv && (
                            <div style={{ fontSize: 12, color: '#cbd5e1', marginBottom: 14, fontFamily: 'Consolas, monospace' }}>
                              ▶️ Kontynuacja Stockfisha: {PUZZLES_FROM_LICHESS[puzzleUi.idx]?.pv}
                            </div>
                          )}
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                          {(() => {
                            const open = PUZZLES_FROM_LICHESS.map((_, i) => i).filter(i => !solvedPuzzles.includes(i) && i !== puzzleUi.idx);
                            if (open.length === 0) return <div className="mate-sub">🏆 Wszystkie zaliczone! Mistrz!</div>;
                            return <button className="btn" onClick={() => startPuzzle(open[Math.floor(Math.random() * open.length)])}>🎲 Następna losowa</button>;
                          })()}
                          <button className="btn btn-secondary" onClick={() => { restorePuzzleFen(); setPuzzleMsg(`💡 ${PUZZLES_FROM_LICHESS[puzzleIdxRef.current]?.tip || ''}`); }}>🔁 Powtórz</button>
                          <button className="btn btn-secondary" onClick={() => leavePuzzle()}>🚪 Wyjdź</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              </div>
              
              <div className="bottom-section shrink-0">
                <div className="captured-row">
                  {(() => {
                    const order: Record<string, number> = { Q: 0, q: 0, R: 1, r: 1, B: 2, b: 2, N: 3, n: 3, P: 4, p: 4 };
                    const val: Record<string, number> = { Q: 9, q: 9, R: 5, r: 5, B: 3, b: 3, N: 3, n: 3, P: 1, p: 1 };
                    const sortCaps = (arr: string[]) => [...arr].sort((a, b) => (order[a] ?? 9) - (order[b] ?? 9));
                    const sumW = capturedWhite.reduce((s, p) => s + (val[p] || 0), 0);
                    const sumB = capturedBlack.reduce((s, p) => s + (val[p] || 0), 0);
                    const leadW = sumB - sumW; // dodatnie = białe prowadzą materiałem
                    const leadB = sumW - sumB;
                    const renderCap = (p: string, i: number, isWhite: boolean) => {
                      const title = `${isWhite ? 'Biały' : 'Czarny'} ${p.toUpperCase()} — zdobyta`;
                      if (pieceTheme === 'kingdom') {
                        return (
                          <div key={i} className={`captured-piece ${isWhite ? 'tile-w' : 'tile-b'}`} title={title}>
                            <div className="cap-svg" dangerouslySetInnerHTML={{ __html: kingdomSVG(p) }} />
                          </div>
                        );
                      }
                      return (
                        <div key={i} className={`captured-piece ${isWhite ? 'tile-w' : 'tile-b'}`} title={title}>
                          <div className="cap-svg" dangerouslySetInnerHTML={{ __html: pieceSVGs[p] || '' }} />
                        </div>
                      );
                    };
                    return (<>
                      <div className="cap-card side-w">
                        <div className="cap-head">
                          <span className="cap-name w">🤍 Straty białych</span>
                          <span className="cap-count">{capturedWhite.length}</span>
                          {leadB > 0 && <span className="cap-adv plus-b">+{leadB}</span>}
                        </div>
                        <div className="captured-pieces">
                          {capturedWhite.length === 0 && <span className="cap-empty">brak strat — czysta gra</span>}
                          <div className="cap-list">{sortCaps(capturedWhite).map((p, i) => renderCap(p, i, true))}</div>
                        </div>
                      </div>
                      <div className="cap-card side-b">
                        <div className="cap-head">
                          <span className="cap-name b">🖤 Straty czarnych</span>
                          <span className="cap-count">{capturedBlack.length}</span>
                          {leadW > 0 && <span className="cap-adv plus-w">+{leadW}</span>}
                        </div>
                        <div className="captured-pieces">
                          {capturedBlack.length === 0 && <span className="cap-empty">brak strat — czysta gra</span>}
                          <div className="cap-list">{sortCaps(capturedBlack).map((p, i) => renderCap(p, i, false))}</div>
                        </div>
                      </div>
                    </>);
                  })()}
                </div>
                <div className="bottom-bar">
                  <div className="ctl-card" title="Jedno miejsce na start partii: wybierz przeciwnika i kolor, potem Start">
                    <div className="ctl-title">🎮 Nowa partia</div>
                    <div className="ctl-hint">Przeciwnik:</div>
                    <div className="seg" role="group" aria-label="Wybierz przeciwnika">
                      <button type="button" data-variant="ai" className={`seg-btn ${newOpponent === 'ai' ? 'active' : ''}`} aria-pressed={newOpponent === 'ai'} title="Przeciwnik: komputer (Stockfish 19). Wybierz, potem wciśnij Start." onClick={() => setNewOpponent('ai')}>
                        <span className="seg-ico">🤖</span><span>Komputer<span className="seg-sub">Stockfish 19</span></span>
                      </button>
                      <button type="button" data-variant="human" className={`seg-btn ${newOpponent === 'human' ? 'active' : ''}`} aria-pressed={newOpponent === 'human'} title="Przeciwnik: człowiek — dwie osoby przy jednej planszy. Wybierz, potem wciśnij Start." onClick={() => setNewOpponent('human')}>
                        <span className="seg-ico">👥</span><span>Człowiek<span className="seg-sub">2 osoby</span></span>
                      </button>
                    </div>
                    <div className="ctl-hint">{newOpponent === 'ai' ? 'Twój kolor:' : 'Ułożenie planszy:'}</div>
                    <div className="seg" role="group" aria-label="Wybierz kolor">
                      <button type="button" data-variant="white" className={`seg-btn ${newColor === 'w' ? 'active' : ''}`} aria-pressed={newColor === 'w'} title="Białe: z komputerem grasz białymi i zaczynasz; z człowiekiem białe na dole" onClick={() => setNewColor('w')}>
                        <span className="seg-ico">🤍</span><span>Białe<span className="seg-sub">{newOpponent === 'ai' ? 'zaczynasz' : 'na dole'}</span></span>
                      </button>
                      <button type="button" data-variant="black" className={`seg-btn ${newColor === 'b' ? 'active' : ''}`} aria-pressed={newColor === 'b'} title="Czarne: z komputerem grasz czarnymi (komputer zaczyna); z człowiekiem czarne na dole" onClick={() => setNewColor('b')}>
                        <span className="seg-ico">🖤</span><span>Czarne<span className="seg-sub">{newOpponent === 'ai' ? 'komputer zaczyna' : 'na dole'}</span></span>
                      </button>
                      <button type="button" data-variant="random" className={`seg-btn ${newColor === 'random' ? 'active' : ''}`} aria-pressed={newColor === 'random'} title="Losowo: kolor/strona losowana przed partią" onClick={() => setNewColor('random')}>
                        <span className="seg-ico">🎲</span><span>Losowo<span className="seg-sub">niespodzianka</span></span>
                      </button>
                    </div>
                    <button
                      type="button"
                      className="start-btn"
                      title={newOpponent === 'ai'
                        ? (newColor === 'w' ? 'Start: grasz białymi, ruszasz pierwszy' : newColor === 'b' ? 'Start: grasz czarnymi, komputer zaczyna' : 'Start: kolor losowany')
                        : (newColor === 'w' ? 'Start: dwie osoby, białe na dole' : newColor === 'b' ? 'Start: dwie osoby, czarne na dole' : 'Start: dwie osoby, strona losowana')}
                      onClick={() => initGame(newOpponent, undefined, newColor)}
                    >▶ Start partii</button>
                    <div className="ctl-hint" aria-live="polite">
                      <strong>{newOpponent === 'ai'
                        ? (newColor === 'w' ? 'Zagrasz białymi — ruszasz pierwszy.' : newColor === 'b' ? 'Zagrasz czarnymi — komputer zaczyna.' : 'Kolor zostanie wylosowany.')
                        : (newColor === 'w' ? 'Dwie osoby — białe na dole.' : newColor === 'b' ? 'Dwie osoby — czarne na dole.' : 'Dwie osoby — strona zostanie wylosowana.')}</strong>
                      {gameMode === 'ai' && (
                        <> • teraz grasz: {humanColor === 'w' ? '🤍 białymi' : '🖤 czarnymi'}</>
                      )}
                    </div>
                  </div>
                  <div className="ctl-card" title="Akcje w trakcie partii">
                    <div className="ctl-title">⚡ Akcje partii</div>
                    <div className="actions-grid">
                      <button type="button" className="action-btn" onClick={() => setFlipped(!flipped)} title="Obróć planszę (zmień stronę na dole)" aria-label="Obróć planszę"><span className="act-ico">🔄</span>Obróć</button>
                      <button type="button" className="action-btn" onClick={undoMove} disabled={engineRunning || historyStackRef.current.length === 0} title={engineRunning ? 'Poczekaj — komputer myśli' : historyStackRef.current.length === 0 ? 'Brak ruchów do cofnięcia' : 'Cofnij ostatni ruch'} aria-label="Cofnij ruch"><span className="act-ico">↩️</span>Cofnij</button>
                      <button type="button" className="action-btn" onClick={showHint} title="Pokaż podpowiedź komputera (najlepszy ruch)" aria-label="Podpowiedź"><span className="act-ico">💡</span>Podpowiedź</button>
                      <button type="button" className="action-btn" onClick={offerDraw} title="Zaproponuj remis" aria-label="Zaproponuj remis"><span className="act-ico">🤝</span>Remis</button>
                      <button type="button" className="action-btn danger" onClick={resignGame} title="Poddaj partię" aria-label="Poddaj partię"><span className="act-ico">🏳️</span>Poddaj</button>
                      <button type="button" className="action-btn" onClick={() => { setArrows([]); setCircles([]); setArrowPending(null); }} title="Wyczyść strzałki i kółka z planszy" aria-label="Wyczyść adnotacje"><span className="act-ico">🧹</span>Wyczyść</button>
                    </div>
                  </div>
                  <div className="ctl-card" title="Poziom komputera i tempo gry">
                    <div className="ctl-title">🎚️ Poziom i tempo</div>
                    <div className="ctl-hint">Siła komputera:</div>
                    <div className="chips" role="group" aria-label="Poziom trudności komputera">
                      {[1, 2, 3, 4].map(level => (
                        <button
                          type="button"
                          key={level}
                          aria-pressed={difficulty === level}
                          title={['Łatwy: nauka i zabawa', 'Średni: spokojna gra', 'Trudny: wymagający', 'Mistrz: pełna siła'][level - 1]}
                          className={`chip ${difficulty === level ? 'active' : ''}`}
                          onClick={() => setDifficulty(level)}
                        >
                          {['🟢 Łatwy', '🟡 Średni', '🟠 Trudny', '🔴 Mistrz'][level - 1]}
                        </button>
                      ))}
                    </div>
                    <div className="ctl-hint">⏱️ Czas na partię (dla każdego):</div>
                    <div className="chips" role="group" aria-label="Kontrola czasu">
                      {[0, 1, 3, 5, 10, 15, 25, 30, 45, 60, 90, 120, 180].map(m => (
                        <button type="button" key={m} aria-pressed={timeControl === m} title={m === 0 ? 'Gra bez zegara' : `Każdy gracz ma ${m} minut`} className={`chip ${timeControl === m ? 'active-time' : ''}`} onClick={() => {
                          setTimeControl(m);
                          timeRefs.current = { w: m * 60, b: m * 60 };
                          setWhiteTime(m * 60); setBlackTime(m * 60);
                        }}>{m === 0 ? '∞ bez czasu' : `${m} min`}</button>
                      ))}
                    </div>
                    <div className="ctl-hint">{arrowMode === 'click' ? 'PPM: początek → 2. PPM: koniec (strzałka) / to samo pole (kółko)' : 'PPM: kółko • PPM + przeciągnij: strzałka'}</div>
                  </div>
                </div>
                <div className="text-center text-[10px] text-gray-500 mt-1">
                  Silnik: Stockfish 19 (GPLv3, Chess.com) • Figury Merida / Kingdom • v2.1
                </div>
              </div>
            </div>
          </div>
          
          <div className="w-full xl:w-[340px] shrink-0 side-sticky">
            <div className="tab-container">
              {['history', 'puzzles', 'options'].map(tab => (
                <button 
                  key={tab}
                  className={`tab ${activeTab === tab ? 'active' : ''}`}
                  onClick={() => handleTabChange(tab)}
                >
                  {tab === 'history' && '📊 '}
                  {tab === 'puzzles' && '🧩 '}
                  {tab === 'options' && '⚙️ '}
                  {tab === 'history' ? 'Analiza Gry' : tab === 'puzzles' ? 'Zagadki' : 'Opcje'}
                </button>
              ))}
            </div>
            
            <div className={`tab-content ${activeTab === 'analysis' ? 'active' : ''} panel`}>
            </div>

            <div className={`tab-content ${activeTab === 'history' ? 'active' : ''} panel`}>
              <h3 className="font-bold text-lg mb-4">📊 Analiza Gry</h3>
              
              <div className="info-row">
                <span className="info-label">🎮 Stan gry:</span>
                <span className="info-value">
                  {gameResult
                    ? (gameResult.type === 'mate'
                        ? (gameResult.winner === 'w' ? '🏆 Mat - białe wygrały!' : '🏆 Mat - czarne wygrały!')
                        : gameResult.type === 'stalemate' ? '🤝 Pat!'
                        : gameResult.type === 'timeout' ? '⏱️ Koniec czasu!'
                        : gameResult.type === 'resign' ? '🏳️ Poddanie!'
                        : '🤝 Remis!')
                    : (!gameActive ? '❌ Zakończona' : engineRunning ? '🤖 AI myśli...' : (gameMode === 'human' ? (sideToMove === 'w' ? '✅ Ruch białych' : '✅ Ruch czarnych') : `✅ Twój ruch (${humanColor === 'w' ? 'białe' : 'czarne'})`))}
                </span>
              </div>
              <div className="info-row">
                <span className="info-label">♟️ Ruch:</span>
                <span className="info-value">{Math.floor(moveHistory.length / 2) + 1}. — {sideToMove === 'w' ? 'białe' : 'czarne'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">⏳ Reguła 50 ruchów:</span>
                <span className="info-value">{halfmoveRef.current}/100</span>
              </div>
              <div className="rule50">
                <div className="rule50-bar">
                  <div className={`rule50-fill ${halfmoveRef.current >= 70 ? 'crit' : halfmoveRef.current >= 30 ? 'warn' : ''}`} style={{ width: `${halfmoveRef.current}%` }} />
                </div>
                <div className="rule50-text">
                  {halfmoveRef.current === 0
                    ? 'Licznik wyzerowany — remis daleko ✅'
                    : `Bez postępu: ${halfmoveRef.current}/100 • remis za ${Math.ceil((100 - halfmoveRef.current) / 2)} ruchów`}
                </div>
                <div className="rule50-sub">
                  Ostatni postęp: {lastProgressRef.current.kind === 'start'
                    ? 'start partii'
                    : lastProgressRef.current.kind === 'pawn'
                      ? `♟️ pionem ${lastProgressRef.current.san}`
                      : `⚔️ bicie ${lastProgressRef.current.san}`}
                </div>
              </div>
              <div className="info-row">
                <span className="info-label">♟️ Silnik:</span>
                <span className="info-value">
                  {engineStatus === 'ready' ? 'Stockfish 19 ✅' : engineStatus === 'loading' ? 'Ładowanie…' : 'Błąd ❌'}
                </span>
              </div>
              <div className="info-row">
                <span className="info-label">🏆 Materiał:</span>
                <span className="info-value">
                  {(() => {
                    const evalVal = evaluateBoard(board);
                    if (evalVal > 200) return `+${(evalVal/100).toFixed(1)} - Białe wygrywają!`;
                    if (evalVal > 50) return `+${(evalVal/100).toFixed(1)} - Lekka przewaga białych`;
                    if (evalVal < -200) return `${(evalVal/100).toFixed(1)} - Czarne wygrywają!`;
                    if (evalVal < -50) return `${(evalVal/100).toFixed(1)} - Lekka przewaga czarnych`;
                    return '🤝 Równowaga';
                  })()}
                </span>
              </div>
              <div className="info-row">
                <span className="info-label">📖 Debiut:</span>
                <span className="info-value">{openingName || '—'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">FEN:</span>
                <span className="info-value" style={{ fontSize: 10, overflowWrap: 'anywhere' }}>{boardToFEN()}</span>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-secondary bottom-btn" onClick={() => { try { navigator.clipboard.writeText(boardToFEN()); } catch { /* ignore */ } }}>📋 Kopiuj FEN</button>
                <button className="btn btn-secondary bottom-btn" onClick={() => { try { navigator.clipboard.writeText(buildPGN()); } catch { /* ignore */ } }}>📋 Kopiuj PGN</button>
              </div>
              
              <div style={{ marginTop: 12 }}>
                <div className="text-gray-300 mb-1">📥 Import FEN:</div>
                <input value={fenBox} onChange={e => setFenBox(e.target.value)} placeholder="rnbqkbnr/pppppppp/..." className="w-full p-2 rounded bg-black/40 text-xs" />
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <button className="btn btn-secondary bottom-btn" onClick={() => { if (fenBox && loadFEN(fenBox)) setFenBox(''); }}>Wczytaj FEN</button>
                </div>
              </div>

              <h3 className="font-bold text-lg mt-8 mb-4">📜 Historia Ruchów</h3>
              <div className="move-history">
                {moveHistory.length === 0 ? (
                  <div className="text-gray-400 text-center py-6">🎮 Kliknij "Nowa Gra" aby rozpocząć!</div>
                ) : (
                  (() => {
                    const rows = [];
                    for (let i = 0; i < moveHistory.length; i += 2) {
                      rows.push(
                        <div key={i} className="move-row">
                          <span className="move-num">{Math.floor(i / 2) + 1}.</span>
                          <span className="move-white">{moveHistory[i]?.san || ''}</span>
                          <span className="move-black">{moveHistory[i + 1]?.san || ''}</span>
                        </div>
                      );
                    }
                    return rows;
                  })()
                )}
              </div>
            </div>
            
            <div className={`tab-content ${activeTab === 'options' ? 'active' : ''} panel`}>
              <h3 className="font-bold text-lg mb-4">⚙️ Opcje</h3>
              <div className="space-y-4">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showLegalMoves}
                    onChange={e => setShowLegalMoves(e.target.checked)}
                    className="mr-3 w-5 h-5"
                  />
                  <span className="text-gray-300">Pokazuj możliwe ruchy (kropki)</span>
                </label>
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoFlip}
                    onChange={e => { setAutoFlip(e.target.checked); autoFlipRef.current = e.target.checked; }}
                    className="mr-3 w-5 h-5"
                  />
                  <span className="text-gray-300">🔄 Obrót szachownicy co ruch (2 graczy)</span>
                </label>
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={soundEnabled}
                    onChange={e => { setSoundEnabled(e.target.checked); soundOnRef.current = e.target.checked; }}
                    className="mr-3 w-5 h-5"
                  />
                  <span className="text-gray-300">🔊 Dźwięki turniejowe</span>
                </label>
                <label className="flex items-center gap-2">
                  <span className="text-gray-300 text-sm">🔈 Głośność:</span>
                  <input
                    type="range" min={0} max={100} value={volume}
                    onChange={e => {
                      const v = Number(e.target.value);
                      setVolume(v); volumeRef.current = v / 100;
                      try { localStorage.setItem('ad3-vol', String(v)); } catch { /* ignore */ }
                    }}
                    className="flex-1"
                  />
                  <span className="text-gray-400 text-xs w-9">{volume}%</span>
                  <button className="btn btn-secondary bottom-btn" onClick={() => playSound('move')}>▶️ Test</button>
                  <button className="btn btn-secondary bottom-btn" onClick={() => playSound('levelup')}>🏆 Mat</button>
                </label>
                <div>
                  <div className="text-gray-300 mb-1">🎨 Motyw planszy:</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {BOARD_THEMES.map(t => (
                      <button key={t.id} className={`difficulty-btn bottom-diff ${boardTheme === t.id ? 'active' : ''}`} onClick={() => setBoardTheme(t.id)}>{t.name}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-gray-300 mb-1">➡️ Strzałki (PPM):</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className={`difficulty-btn bottom-diff ${arrowMode === 'drag' ? 'active' : ''}`} onClick={() => { setArrowMode('drag'); setArrowPending(null); }}>Przeciągnij</button>
                    <button className={`difficulty-btn bottom-diff ${arrowMode === 'click' ? 'active' : ''}`} onClick={() => { setArrowMode('click'); setArrowPending(null); }}>Klik-klik</button>
                  </div>
                  <div className="text-gray-400 text-xs mt-1">Shift = niebieska, Alt = czerwona, Ctrl = pomarańczowa</div>
                </div>
                <div>
                  <div className="text-gray-300 mb-1">♟️ Figury:</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className={`difficulty-btn bottom-diff ${pieceTheme === 'merida' ? 'active' : ''}`} onClick={() => setPieceTheme('merida')}>Merida</button>
                    <button className={`difficulty-btn bottom-diff ${pieceTheme === 'kingdom' ? 'active' : ''}`} onClick={() => setPieceTheme('kingdom')}>👑 Kingdom</button>
                  </div>
                </div>
              </div>
            </div>

            <div className={`tab-content ${activeTab === 'puzzles' ? 'active' : ''} panel`}>
              {puzzleUi ? (
                <div className="puzzle-training-panel">
                  <h3 className="font-bold text-lg mb-2">🧩 Trening Zagadki</h3>
                  <div className="info-row">
                    <span className="info-label">🎯 Zadanie:</span>
                    <span className="info-value">{PUZZLES_FROM_LICHESS[puzzleUi.idx]?.name}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">📜 Partia:</span>
                    <span className="info-value" style={{ fontSize: 11 }}>{PUZZLES_FROM_LICHESS[puzzleUi.idx]?.meta}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">💡 Wskazówka:</span>
                    <span className="info-value">{PUZZLES_FROM_LICHESS[puzzleUi.idx]?.tip}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">🔁 Próby:</span>
                    <span className="info-value">{attemptsRef.current}</span>
                  </div>
                  {puzzleMsg && <div style={{ fontSize: 12, marginTop: 6 }}>{puzzleMsg}</div>}
                  <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                      <button
                        className="btn btn-secondary bottom-btn"
                        title="Pokaż najlepszy ruch na szachownicy"
                        onClick={() => { showHint(); setPuzzleMsg(`💡 Podpowiedź na szachownicy powyżej!`); }}
                      >💡 Podpowiedź</button>
                    <button className="btn btn-secondary bottom-btn" onClick={() => { restorePuzzleFen(); setPuzzleMsg(`🔁 Zagadka zresetowana. 💡 ${PUZZLES_FROM_LICHESS[puzzleUi.idx]?.tip || ''}`); }}>🔄 Resetuj zagadkę</button>
                    <button className="btn btn-secondary bottom-btn" onClick={() => leavePuzzle()}>🚪 Opuść trening</button>
                  </div>
                  <div className="text-center text-gray-500 text-xs mt-4">
                    Plansza powyżej — wykonaj ruch stukając w figurę, a potem w pole docelowe.
                  </div>
                </div>
              ) : (
                <div>
                  <div className="puzzles-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
                    <div>
                      <h3 className="font-bold text-lg mb-1">🧩 Zagadki Szachowe (Lichess)</h3>
                      <p className="text-gray-400 text-sm">
                        {solvedPuzzles.length} / {PUZZLES_FROM_LICHESS.length} rozwiązanych
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        className="btn btn-secondary bottom-btn"
                        onClick={resetPuzzles}
                        title="Zeruje postęp rozwiązywania wszystkich zagadek"
                      >🧹 Reset postępów</button>
                      <button
                        className="btn bottom-btn"
                        onClick={() => { const idx = randomUnsolved(); if (idx < 0) setListMsg('🏆 Wszystkie zagadki rozwiązane!'); else startPuzzle(idx); }}
                        title="Losowa nierozwiązana zagadka"
                      >🎲 Losowa</button>
                      <button
                        className="btn btn-secondary bottom-btn"
                        onClick={() => { showHint(); setActiveTab('history'); }}
                        title="Pokaż najlepszy ruch na szachownicy"
                      >💡 Podpowiedź</button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                    <button
                      className={`btn ${puzzleLevelFilter === 'all' ? 'active' : ''} bottom-btn`}
                      onClick={() => setPuzzleLevelFilter('all')}
                    >Wszystkie</button>
                    <button
                      className={`btn btn-secondary ${puzzleLevelFilter === 1 ? 'active' : ''} bottom-btn`}
                      onClick={() => setPuzzleLevelFilter(1)}
                    >Łatwe</button>
                    <button
                      className={`btn btn-secondary ${puzzleLevelFilter === 2 ? 'active' : ''} bottom-btn`}
                      onClick={() => setPuzzleLevelFilter(2)}
                    >Średnie</button>
                    <button
                      className={`btn btn-secondary ${puzzleLevelFilter === 3 ? 'active' : ''} bottom-btn`}
                      onClick={() => setPuzzleLevelFilter(3)}
                    >Trudne</button>
                  </div>
                  {(() => {
                    const filtered = puzzleLevelFilter === 'all'
                      ? PUZZLES_FROM_LICHESS
                      : PUZZLES_FROM_LICHESS.filter(p => p.level === puzzleLevelFilter);
                    const solvedSet = new Set(solvedPuzzles);
                    return (
                      <>
                        <div className="puzzle-list">
                          {filtered.map((p, i) => {
                            const globalIdx = PUZZLES_FROM_LICHESS.indexOf(p);
                            const isSolved = solvedSet.has(globalIdx);
                            return (
                              <div key={i} className={`puzzle-item ${isSolved ? 'solved' : ''}`}>
                                <div className="puzzle-info">
                                  <span className={`puzzle-level lvl${p.level}`}>{p.level === 1 ? '🟢' : p.level === 2 ? '🟡' : '🔴'}</span>
                                  <span className="puzzle-name">{p.name}</span>
                                  <span className="puzzle-goal">{p.goal === 'mat' ? '♟️ Mat' : '🎯 Ruch'}</span>
                                  {isSolved && <span className="puzzle-solved">✅</span>}
                                </div>
                                <button
                                  className="puzzle-btn"
                                  onClick={() => { startPuzzle(globalIdx); }}
                                >
                                  {isSolved ? '✅ Rozwiąż ponownie' : '▶️ Rozwiąż'}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                        {filtered.length === 0 && (
                          <div className="text-center text-gray-400 text-sm py-8">Brak zagadek w tym filtrze</div>
                        )}
                      </>
                    );
                  })()}
                  <div className="text-center text-gray-500 text-xs mt-4">
                    Źródło: Lichess puzzle database • {PUZZLES_FROM_LICHESS.length} zagadek • Kliknij dowolną zagadkę, aby rozwiązać (można rozwiązywać wielokrotnie)
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {promotionSquare && (
        <div className="promotion-modal" onClick={() => setPromotionSquare(null)}>
          <div className="promotion-options" onClick={e => e.stopPropagation()}>
            {(promotionSquare.isWhite ? ['Q', 'R', 'B', 'N'] : ['q', 'r', 'b', 'n']).map(p => (
              <div key={p} className="promotion-piece" onClick={() => handlePromotion(p)}>
                <div dangerouslySetInnerHTML={{ __html: svgFor(p) }} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div></>
  );
}
