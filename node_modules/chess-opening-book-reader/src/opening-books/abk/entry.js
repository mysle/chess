import utils from '../../utils.js'

const files = utils.board.FILES
import { Chess } from 'chess.js'
function decode_move(pos) {
  let file_number = pos % 8
  let rank = Number.parseInt(pos / 8) + 1
  return files[file_number] + '' + rank
}

// eslint-disable-next-line no-unused-vars
function decode_promotion(promotion) {
  if (!promotion) {
    return ''
  }
  switch (promotion) {
    case 1:
      return 'r'
    case 2:
      return 'n'
    case 3:
      return 'b'
    case 4:
      return 'q'
    default:
      return false
  }
}

class ABKEntry {
  // Everything is little endian because reasons
  // c byte alignment applies so the structure is 28
  // struct BOOK {
  //     unsigned char move_from; //1 byte
  //     unsigned char move_to; // 1 byte
  //     unsigned char move_promo; //1 byte
  //     unsigned char priority; //1 byte
  //     unsigned int games; //4 bytes
  //     unsigned int won_games; // 4 bytes
  //     unsigned int lost_games; //4 bytes
  //     unsigned int hz; //4 bytes
  //     int first_child; //4 bytes
  //     int next_sibling; //4 bytes
  //   } *book;
  static fromBuffer(buffer, address /*, parent*/) {
    let entry = new ABKEntry()
    let view = new DataView(buffer)
    entry.address = address
    entry.move_from = decode_move(view.getInt8(0))
    entry.move_to = decode_move(view.getInt8(1))
    entry.move_promo = view.getInt8(2)
    entry.priority = view.getInt8(3)
    entry.games = view.getUint32(4, true)
    entry.won_games = view.getUint32(8, true)
    entry.lost_games = view.getUint32(12, true)
    entry.ply_count = view.getUint32(16, true)
    entry.first_child = view.getInt32(20, true)
    entry.next_sibling = view.getInt32(24, true)

    if (entry.first_child < 900 && entry.first_child !== -1) {
      throw new Error('Invalid ABK File (invalid first child)')
    }

    return entry
  }
  constructor() {
    this.children = []
    this.path = []
  }
  toChess() {
    let chess = new Chess(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    )
    for (let p of this.path) {
      chess.move(p.current_move_raw, { sloppy: true })
    }
    chess.move(this.current_move_raw, { sloppy: true })
    return chess
  }
  get current_move() {
    let history = this.toChess().history()
    return history[history.length - 1]
  }
  get current_move_raw() {
    let move = this.move_from + '' + this.move_to
    // let move = { from: p.move_from, to: p.move_to, sloppy : true }
    // if (p.move_promo) {
    //     move.flags = 'p';
    //     move.peice = p.move_promo;
    // }
    if (this.move_promo) {
      move += this.move_promo
    }
    return move
  }
  get fen() {
    if (!this._fen) {
      this._fen = this.toChess().fen()
    }
    return this._fen
  }
  get book_moves() {
    return this.children
  }
  toPGN() {
    return this.toChess().pgn()
  }
}
export default ABKEntry
