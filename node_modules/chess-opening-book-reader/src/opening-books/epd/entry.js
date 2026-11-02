import { Chess } from 'chess.js'

/*
See https://chessprogramming.wikispaces.com/Extended+Position+Description
*/
function getIntValue(value) {
  return Number.parseInt(value.trim())
}
function getMoves(value) {
  let moves = []
  let vs = value.split(' ')
  for (let v of vs) {
    if (v) {
      if (v === 'O-O-O' || v === 'O-O' || /[1-8a-hknp-rx]+[!+?]*/i.test(v)) {
        if (/[^!+1-8?BKNP-Ra-hknp-rx]/.test(v)) {
          //this is not a move skip it.
        } else {
          moves.push(v)
        }
      } else {
        console.log('Unknown value for move', v)
      }
    }
  }
  return moves
}

function getText(value) {
  let output = value.trim()
  output = output.replace(/"/g, '')
  return output
}
function getTrue() {
  return true
}

const OPCODES = {
  acn: getIntValue,
  acs: getIntValue,
  am: getMoves, //avoid moves
  bm: getMoves, //best moves,
  ce: getIntValue,
  dm: getIntValue,
  draw_accept: getTrue,
  draw_offer: getTrue,
  draw_reject: getTrue,
  eco: getText,
  fmvn: getIntValue,
  hmvc: getIntValue,
  nic: getText,
  noop: getText,
  pm: getMoves,
  pv: getText,
  rc: getIntValue,
  resign: getTrue,
  sm: getMoves,
  tcgs: getIntValue,
  tcri: getText,
  v0: getText,
  v1: getText,
  v2: getText,
  v3: getText,
  v4: getText,
  v5: getText,
  v6: getText,
  v7: getText,
  v8: getText,
  v9: getText,
}

class EPDEntry {
  static fromLine(line) {
    let position = new EPDEntry()
    let elements = line.split(';')
    let fen_elements = elements[0].split(' ')
    let fen = fen_elements.slice(0, 4).join(' ')
    position.fen = fen + ' 0 1'
    elements[0] = fen_elements.slice(4).join(' ')

    // eslint-disable-next-line unicorn/better-regex
    if (!/(\/?[pnbrqkPNBRQK1-8]+){1,8}/.test(fen)) {
      throw new Error('Invalid EPD file (fen invalid)')
    }

    for (let element of elements) {
      let em = element.trim().match(/(\w+)\s+(.+)/)
      if (!em?.length) continue

      let command = em[1]
      let value = em[2]
      if (command === 'id') {
        position.id = getText(value)
      } else if (/c\d/.test(command)) {
        let number_ = Number.parseInt(command.slice(1, command.length))
        position.comments[number_] = getText(value)
      } else if (OPCODES[command]) {
        position.operations[command] = OPCODES[command](value)
      } else {
        throw new Error('Invalid command: ' + command)
      }
    }
    return position
  }
  constructor() {
    this.fen = ''
    this.id = ''
    this.operations = {}
    this.comments = []
  }
  toChess() {
    let chess = new Chess()
    if (!chess.load(this.fen)) {
      throw new Error('Unable to load fen: ' + this.fen)
    }
    return chess
  }
  get best_move() {
    return this.operations.bm
  }
}
export default EPDEntry
