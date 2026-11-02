import BaseBook from '../base.js'
import PolyglotEntry from './entry.js'
import { fen_hash } from './tools.js'

class PolyglotParser {
  parse(buffer, entryKeyMap) {
    let entries = []
    for (let index = 16; index < buffer.byteLength; index = index + 16) {
      let b = buffer.slice(index - 16, index)
      const entry = PolyglotEntry.fromBuffer(b)
      if (entryKeyMap[entry._key]) {
        entryKeyMap[entry._key].push(entry)
      } else {
        entryKeyMap[entry._key] = [entry]
      }
      entries.push(entry)
    }
    return entries
  }
}

export default class Polyglot extends BaseBook {
  constructor() {
    super()
    this.loaded = false
    this.entries = []
    this.entryKeyMap = {}
  }

  loadBook(buffer) {
    this.entries = new PolyglotParser().parse(buffer, this.entryKeyMap)
    this.loaded = true
    return this
  }

  find(fen) {
    if (!this.loaded) {
      throw new Error('No book is loaded')
    }
    let hash = this.generate_hash(fen)
    return this.entryKeyMap[hash]
  }

  generate_hash(fen) {
    /**From the polyglot module **/
    return fen_hash(fen)
  }
}
