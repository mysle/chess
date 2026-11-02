import { Chess } from 'chess.js'

export default class CTGEntry {
  constructor() {
    this.eco_code = ''
    this.variation = ''
    this.name = ''
    this.pgn = ''
  }

  toChess() {
    let pgn_short = this.pgn.slice(0, Math.max(0, this.pgn.length - 2))
    let chess = new Chess()
    chess.load_pgn(pgn_short)
    return chess
  }

  get fen() {
    return this.toChess().fen()
  }
}
