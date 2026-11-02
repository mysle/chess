import EventEmitter from 'events'
import CTGEntry from './entry.js'
import BaseBook from '../base.js'

function extract_value(text) {
  let match = text.match(/"(.+)"/)
  return match ? match[1] : ''
}

class ECOParser extends EventEmitter {
  constructor() {
    super()
    this.in_comment = false
    this.in_pgn = false
    this.in_record = false
    this.comment = ''
    this.current_record = false
  }

  parse(buffer) {
    let data = new TextDecoder().decode(buffer)
    let lines = data.split(/\n/m)
    this.processLines(lines)
    this.emit('finish')
  }

  processLines(lines) {
    let length = lines.length
    for (let index = 0; index < length; index++) {
      let line = lines.shift()
      if (line.startsWith('{')) {
        this.in_comment = true
      }
      if (line.startsWith('}')) {
        this.emit('has_comment', this.comment)
        this.in_comment = false
      }
      if (this.in_comment && line !== '{') {
        this.comment = this.comment + line + '\n'
      }
      if (line.startsWith('[ECO')) {
        if (this.current_record) {
          this.current_record.pgn = this.current_record.pgn.trim()
          this.emit('data', this.current_record)
        }
        this.current_record = new CTGEntry()
        this.current_record.eco_code = extract_value(line)
      } else if (line.startsWith('[Opening')) {
        this.current_record.name = extract_value(line)
      } else if (line.startsWith('[Variation')) {
        this.current_record.variation = extract_value(line)
      } else if (line.startsWith('1.')) {
        this.in_pgn = true
        this.current_record.pgn = line
      } else if (this.in_pgn && line) {
        this.current_record.pgn = this.current_record.pgn + ' ' + line
      } else if (this.in_pgn && !line) {
        this.in_pgn = false
      }
    }
  }
}

export default class Eco extends BaseBook {
  constructor() {
    super()
    this.loaded = false
    this.comment = ''
    this.entries = []
  }
  loadBook(buffer) {
    const parser = new ECOParser()
    parser.on('finish', () => {
      this.loaded = true
      this.emit('loaded')
    })
    parser.on('data', (entry) => {
      this.entries.push(entry)
    })
    parser.parse(buffer)
  }
  find(pgn) {
    if (!this.loaded) {
      throw new Error('wait for loaded event')
    }
    let best_match
    for (let record of this.entries) {
      let r_pgn = record.pgn.slice(0, Math.max(0, record.pgn.indexOf('*')))
      if (pgn.includes(r_pgn)) {
        best_match =
          best_match && record.pgn.length > best_match.pgn.length
            ? record
            : record
      }
    }
    return best_match
  }
}
