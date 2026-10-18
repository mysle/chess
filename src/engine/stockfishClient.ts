// ♟️ Klient Stockfish 19 działający w Web Workerze.
// Pliki silnika leżą w public/engine (kopiowane do dist) - brak CORSów, działa i na Pages.
// Zawsze jest to Stockfish 19 - są 3 poziomy ładowania tego samego silnika:
//   1) engine/stockfish-19-lite-single.js + stockfish-19-lite-single.wasm (szybki, mocny),
//   2) engine/stockfish-19-asm.js (JS bez WASM - działa nawet z pliku file://),
//   3) wbudowany w bundle kod ASM przez Blob (działa ZAWSZE, nawet jako pojedynczy .html z dysku).
//
// Dlaczego tak? `new Worker("./engine/...")` + fetch WASM-u pada gdy:
//  - pojedynczy .html leży bez folderu engine/ obok (np. kopia na Pulpicie),
//  - strona otwarta jest przez file:// (fetch file:// jest blokowany),
//  - base URL ma podścieżkę (Pages) a ścieżka jest względna.
// Ten klient rozwiązuje wszystkie trzy: absolutne URL-e, jawny adres WASM w hashu
// (wrapper stockfish.js bierze go z location.hash) oraz awaryjny Blob bez sieci.

// @ts-ignore - Vite ?raw zwraca tekst pliku
import asmEmbeddedSource from './stockfish-19-asm.bundle.js?raw';

export interface EngineMove {
  from: number;
  to: number;
  promotion?: string;
  /** Ocena w centypionach z perspektywy BIAŁYCH (jak na lichess). */
  scoreCp: number | null;
  /** Mat w N (dodatni = matują białe, ujemny = matują czarne), null gdy brak. */
  mateIn: number | null;
  pvUci: string[];
}

export interface EngineLevel {
  skill: number;
  depth: number;
  movetimeMs: number;
}

// Poziomy 1-4: Łatwy -> Mistrz (pełna siła Stockfisha 19, bez sztucznych limitów).
// depth to GÓRNY limit bezpieczeństwa - wiążący jest movetime (silnik staje po czasie).
// Poziom 4 (Mistrz): Skill 20 + UCI_LimitStrength=false + depth 60 = gra jak najmocniej.
export const ENGINE_LEVELS: Record<number, EngineLevel> = {
  1: { skill: 2, depth: 8, movetimeMs: 300 },
  2: { skill: 9, depth: 16, movetimeMs: 800 },
  3: { skill: 15, depth: 30, movetimeMs: 2500 },
  4: { skill: 20, depth: 60, movetimeMs: 8000 },
};

// Optymalna konfiguracja UCI dla Stockfish 19 Lite WASM (silnik jednowątkowy: Threads max 1).
// Hash 128 MB w zupełności wystarcza przy myśleniu rzędu sekund, a nie wywraca mobilnych przeglądarek.
const UCI_HASH_MB = 128;
const UCI_THREADS = 1;
const UCI_MOVE_OVERHEAD_MS = 100;

/** Ile ms czekamy na uciok/readyok одного kandydata zanim spróbujemy następnego. */
const HANDSHAKE_TIMEOUT_MS = 10000;

export type EngineStatus = 'off' | 'loading' | 'ready' | 'error';
export type EngineFlavor = 'wasm' | 'asm-external' | 'asm-embedded' | null;

function sqToIndex(sq: string): number {
  const f = sq.charCodeAt(0) - 97;
  const r = 8 - parseInt(sq[1], 10);
  return r * 8 + f;
}

/** Absolutny URL względem dokumentu - działa i dla ./ i dla / i dla podścieżek Pages i file://. */
function absUrl(relative: string): string {
  try {
    return new URL(relative, document.baseURI).href;
  } catch {
    return relative;
  }
}

export class StockfishClient {
  private worker: Worker | null = null;
  private status: EngineStatus = 'off';
  private flavor: EngineFlavor = null;
  private statusListeners = new Set<(s: EngineStatus) => void>();
  private pending: {
    resolve: (m: EngineMove | null) => void;
    searchId: number;
    whiteToMove: boolean;
    lastScoreCp: number | null;
    lastMate: number | null;
    lastPv: string[];
  } | null = null;
  private activeSearchId: number | null = null;
  private searchSeq = 0;
  private readyPromise: Promise<void> | null = null;

  onStatus(cb: (s: EngineStatus) => void): () => void {
    this.statusListeners.add(cb);
    cb(this.status);
    return () => {
      this.statusListeners.delete(cb);
    };
  }

  private setStatus(s: EngineStatus) {
    this.status = s;
    this.statusListeners.forEach((cb) => {
      try {
        cb(s);
      } catch {
        /* ignore */
      }
    });
  }

  getStatus(): EngineStatus {
    return this.status;
  }

  /** Skąd pochodzi załadowany silnik (do logów / etykiety w UI). */
  getFlavor(): EngineFlavor {
    return this.flavor;
  }

  /** Jednorazowa optymalna konfiguracja silnika pod maksymalną siłę gry. */
  private configureEngine(w: Worker) {
    try {
      w.postMessage(`setoption name Threads value ${UCI_THREADS}`);
      w.postMessage(`setoption name Hash value ${UCI_HASH_MB}`);
      w.postMessage('setoption name Ponder value false');
      w.postMessage('setoption name MultiPV value 1');
      // Wyłączony limitator siły - osłabianie niższych poziomów robi wyłącznie Skill Level.
      w.postMessage('setoption name UCI_LimitStrength value false');
      try {
        w.postMessage('setoption name UCI_ShowWDL value true');
      } catch {
        /* ASM może nie znać tej opcji - ignoruj */
      }
      w.postMessage(`setoption name Move Overhead value ${UCI_MOVE_OVERHEAD_MS}`);
    } catch {
      /* ignore - silnik i tak zagra na domyślnych opcjach */
    }
  }

  /**
   * Uzgadnia handshake UCI z workerem: wysyła `uci`, czeka na `uciok`,
   * wysyła `isready`, czeka na `readyok`. Zwraca worker gotowy do gry.
   */
  private handshakeWithWorker(w: Worker, label: string): Promise<Worker> {
    return new Promise<Worker>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Timeout handshake (${label})`));
      }, HANDSHAKE_TIMEOUT_MS);

      const cleanup = () => {
        clearTimeout(timer);
        w.onerror = null;
        w.onmessage = null;
      };

      w.onerror = (e: any) => {
        console.error(`[Stockfish] Worker Error (${label}):`, e);
        cleanup();
        reject(new Error('Stockfish worker failed to start: ' + (e?.message || 'Unknown error')));
      };

      w.onmessage = (e: MessageEvent) => {
        const line = String(e.data ?? '');
        if (line.startsWith('uciok')) {
          console.log(`[Stockfish] UCI OK (${label})`);
          // NIE podmieniamy tu onmessage - czekamy na readyok w tym handlerze.
          // (Wcześniej podmiana zjadała readyok i silnik nigdy nie stawał się ready.)
          try {
            w.postMessage('isready');
          } catch (err) {
            cleanup();
            reject(err);
          }
        } else if (line.startsWith('readyok')) {
          console.log(`[Stockfish] Ready OK (${label})`);
          cleanup();
          w.onmessage = (ev: MessageEvent) => this.handleMessage(String(ev.data ?? ''));
          w.onerror = (ev: any) => {
            console.error('[Stockfish] Runtime worker error:', ev);
            this.setStatus('error');
            this.readyPromise = null;
            this.worker = null;
          };
          resolve(w);
        }
      };

      try {
        w.postMessage('uci');
      } catch (err) {
        cleanup();
        reject(err);
      }
    });
  }

  /**
   * Próbuje stworzyć workera z podanego URL-a skryptu (opcjonalnie z hashem
   * wskazującym jawny adres WASM) i uzgodnić handshake. Po niepowodzeniu
   * worker jest ubijany, żeby nie wyciekał.
   */
  private async tryWorkerUrl(scriptUrl: string, label: string, flavor: EngineFlavor): Promise<void> {
    console.log('[Stockfish] Attempting to load worker from:', scriptUrl);
    let w: Worker;
    try {
      w = new Worker(scriptUrl);
    } catch (e) {
      console.warn(`[Stockfish] new Worker() threw (${label}):`, e);
      throw e;
    }
    try {
      await this.handshakeWithWorker(w, label);
    } catch (e) {
      try {
        w.terminate();
      } catch {
        /* ignore */
      }
      throw e;
    }
    this.worker = w;
    this.flavor = flavor;
    this.configureEngine(w);
    this.setStatus('ready');
  }

  /** Pełna sekwencja ładowania: WASM (2 warianty ścieżki) -> ASM zewnętrzny -> ASM wbudowany. */
  private async loadWithFallbacks(): Promise<void> {
    this.setStatus('loading');
    const errors: string[] = [];

    // --- 1) Stockfish 19 lite-single (WASM) - jawny adres WASM w hashu ---
    // Wrapper stockfish.js bierze adres WASM z location.hash (przed przecinkiem),
    // więc podajemy go explicite - domyślne wyliczanie z pathname gubi się
    // przy blob:, podścieżkach i innych bazach.
    const baseCandidates = Array.from(
      new Set(
        [
          `${import.meta.env.BASE_URL}engine/stockfish-19-lite-single.js`,
          'engine/stockfish-19-lite-single.js',
          '/engine/stockfish-19-lite-single.js',
        ].filter(Boolean),
      ),
    );
    for (const rel of baseCandidates) {
      const jsAbs = absUrl(rel);
      const wasmAbs = absUrl(rel.replace(/\.js([?#].*)?$/, '.wasm'));
      const withHash = `${jsAbs}#${encodeURIComponent(wasmAbs)}`;
      try {
        await this.tryWorkerUrl(withHash, `wasm:${rel}`, 'wasm');
        console.log('[Stockfish] Engine ready (Stockfish 19 lite-single WASM) via', rel);
        return;
      } catch (e: any) {
        errors.push(`wasm ${rel}: ${e?.message || e}`);
      }
    }

    // --- 2) Stockfish 19 ASM z pliku (bez WASM - odporny na file:// fetch) ---
    const asmCandidates = Array.from(
      new Set(
        [
          `${import.meta.env.BASE_URL}engine/stockfish-19-asm.js`,
          'engine/stockfish-19-asm.js',
          '/engine/stockfish-19-asm.js',
        ].filter(Boolean),
      ),
    );
    for (const rel of asmCandidates) {
      try {
        await this.tryWorkerUrl(absUrl(rel), `asm:${rel}`, 'asm-external');
        console.log('[Stockfish] Engine ready (Stockfish 19 ASM external) via', rel);
        return;
      } catch (e: any) {
        errors.push(`asm ${rel}: ${e?.message || e}`);
      }
    }

    // --- 3) Stockfish 19 ASM wbudowany w bundle (Blob - działa ZAWSZE) ---
    // Nawet gdy pojedynczy .html leży sam na Pulpicie bez folderu engine/
    // albo strona jest otwarta przez file:// w Chrome (blokuje Workery z pliku).
    try {
      if (typeof asmEmbeddedSource === 'string' && asmEmbeddedSource.length > 100000) {
        const blobUrl = URL.createObjectURL(
          new Blob([asmEmbeddedSource], { type: 'application/javascript' }),
        );
        try {
          await this.tryWorkerUrl(blobUrl, 'asm:embedded-blob', 'asm-embedded');
          console.log('[Stockfish] Engine ready (Stockfish 19 ASM embedded Blob)');
          return;
        } catch (e: any) {
          errors.push(`asm embedded: ${e?.message || e}`);
          try {
            URL.revokeObjectURL(blobUrl);
          } catch {
            /* ignore */
          }
          throw e;
        }
      } else {
        errors.push('asm embedded: empty bundle source');
      }
    } catch (e: any) {
      if (!errors.some((m) => m.startsWith('asm embedded'))) {
        errors.push(`asm embedded: ${e?.message || e}`);
      }
    }

    console.error('[Stockfish] All engine candidates failed:\n - ' + errors.join('\n - '));
    this.setStatus('error');
    this.readyPromise = null;
    this.worker = null;
    throw new Error('Nie udało się załadować Stockfisha 19 (WASM ani ASM). ' + errors.join(' | '));
  }

  async ensureReady(): Promise<void> {
    if (this.status === 'ready') return Promise.resolve();
    if (this.readyPromise) return this.readyPromise;
    this.readyPromise = this.loadWithFallbacks();
    // loadWithFallbacks samo czyści readyPromise przy totalnej porażce.
    // Przy sukcesie readyPromise zostaje (gotowy silnik do ponownego użycia).
    try {
      await this.readyPromise;
    } catch (e) {
      if (this.status !== 'error') {
        this.readyPromise = null;
      }
      throw e;
    }
    return;
  }

  /** Ręczna ponowa próba po błędzie (np. klik w badge "Brak silnika"). */
  async retry(): Promise<void> {
    try {
      this.worker?.terminate();
    } catch {
      /* ignore */
    }
    this.worker = null;
    this.flavor = null;
    this.readyPromise = null;
    this.setStatus('off');
    return this.ensureReady();
  }

  private handleMessage(line: string) {
    const p = this.pending;
    if (!p) return;
    if (line.startsWith('info ') && line.includes(' score ')) {
      const cp = line.match(/score cp (-?\d+)/);
      const mate = line.match(/score mate (-?\d+)/);
      const pv = line.match(/ pv ([a-h1-8qrbn ]+)/);
      if (mate) {
        p.lastMate = parseInt(mate[1], 10);
        p.lastScoreCp = null;
      } else if (cp) {
        p.lastMate = null;
        p.lastScoreCp = parseInt(cp[1], 10);
      }
      if (pv) p.lastPv = pv[1].trim().split(/\s+/).slice(0, 12);
    } else if (line.startsWith('bestmove')) {
      // Spóźniona odpowiedź na przerwane szukanie? Ignoruj (nie zatruwaj nowej partii).
      if (!this.pending || this.pending.searchId !== this.activeSearchId) return;
      const parts = line.split(/\s+/);
      const uci = parts[1];
      const cur = this.pending;
      this.pending = null;
      this.activeSearchId = null;
      if (!uci || uci === '(none)') {
        cur.resolve(null);
        return;
      }
      try {
        const from = sqToIndex(uci.slice(0, 2));
        const to = sqToIndex(uci.slice(2, 4));
        const promotion = uci.length > 4 ? uci[4] : undefined;
        // UCI raportuje ocenę z perspektywy strony do ruchu - konwertujemy na białe (jak na lichess).
        const sign = cur.whiteToMove ? 1 : -1;
        cur.resolve({
          from,
          to,
          promotion,
          scoreCp: cur.lastScoreCp !== null ? sign * cur.lastScoreCp : null,
          mateIn: cur.lastMate !== null ? sign * cur.lastMate : null,
          pvUci: cur.lastPv,
        });
      } catch {
        cur.resolve(null);
      }
    }
  }

  /** Przerywa bieżące szukanie (np. Nowa Gra w trakcie myślenia AI). */
  stop() {
    this.activeSearchId = null;
    try {
      this.worker?.postMessage('stop');
    } catch {
      /* ignore */
    }
    if (this.pending) {
      const p = this.pending;
      this.pending = null;
      p.resolve(null);
    }
  }

  newGame() {
    this.stop();
    try {
      this.worker?.postMessage('ucinewgame');
      this.worker?.postMessage('isready');
    } catch {
      /* ignore */
    }
  }

  async findBestMove(
    fen: string,
    level: number,
    /** Pozostały czas silnika w ms (zegar) - myślenie jest skracane by nie przegrać na czas. */
    timeLeftMs?: number,
    /** Sztywny limit myślenia w ms (np. szybka podpowiedź) - nadpisuje poziom. */
    movetimeOverrideMs?: number,
  ): Promise<EngineMove | null> {
    await this.ensureReady();
    const w = this.worker;
    if (!w) return null;
    const cfg = ENGINE_LEVELS[level] ?? ENGINE_LEVELS[2];
    // Porzuć ewentualne wiszące szukanie
    this.stop();
    const searchId = ++this.searchSeq;
    this.activeSearchId = searchId;
    // Efektywny czas myślenia: override > limit zegarowy > konfig poziomu.
    let movetime = movetimeOverrideMs ?? cfg.movetimeMs;
    if (timeLeftMs !== undefined && timeLeftMs > 0) {
      // Zostaw margines: najwyżej ~1/20 pozostałego czasu, min. 250 ms na ruch.
      movetime = Math.min(movetime, Math.max(250, Math.floor(timeLeftMs / 20) - UCI_MOVE_OVERHEAD_MS));
    }
    // Strona do ruchu z FEN-a (do konwersji oceny na perspektywę białych).
    const whiteToMove = fen.split(/\s+/)[1] !== 'b';
    return new Promise<EngineMove | null>((resolve) => {
      this.pending = {
        resolve,
        searchId,
        whiteToMove,
        lastScoreCp: null,
        lastMate: null,
        lastPv: [],
      };
      try {
        w.postMessage('setoption name UCI_LimitStrength value false');
        w.postMessage(`setoption name Skill Level value ${cfg.skill}`);
        w.postMessage(`position fen ${fen}`);
        // depth to tylko górny limit bezpieczeństwa - wiążący jest movetime.
        w.postMessage(`go depth ${cfg.depth} movetime ${movetime}`);
      } catch {
        this.pending = null;
        resolve(null);
      }
      setTimeout(() => {
        if (this.pending && this.pending.searchId === searchId) {
          try {
            w.postMessage('stop');
          } catch {
            /* ignore */
          }
          // bestmove i tak nadejdzie po stop; asekuracyjnie po 5 s oddaj null
          setTimeout(() => {
            if (this.pending && this.pending.searchId === searchId) {
              this.pending = null;
              resolve(null);
            }
          }, 5000);
        }
      }, movetime + 6000);
    });
  }
}

export const stockfish = new StockfishClient();
