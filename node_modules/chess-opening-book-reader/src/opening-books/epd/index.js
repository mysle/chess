import { key_from_fen } from '../../utils.js'
import BaseBook from '../base.js'
import EPDEntry from './entry.js'

class EPDParser {
  parse(buffer) {
    let data = new TextDecoder().decode(buffer)
    let lines = data.split(/\n/m)
    if (!lines?.length) {
      throw new Error('Invalid EPD file')
    }

    const entries = this.processLines(lines)
    if (!entries?.length) {
      throw new Error('Invalid EPD file')
    }

    return entries
  }

  processLines(lines) {
    let entries = []
    let length = lines.length
    for (let index = 0; index < length; index++) {
      let line = lines.shift()
      if (line) {
        let entry = EPDEntry.fromLine(line)
        entries.push(entry)
      }
    }
    return entries
  }
}

export default class EPD extends BaseBook {
  constructor() {
    super()
    this.loaded = false
    this.entries = []
  }

  loadBook(buffer) {
    this.entries = new EPDParser().parse(buffer)
    this.loaded = true
    return this
  }

  find(fen) {
    if (!this.loaded) {
      throw new Error('EPD not loaded')
    }
    let match_key = key_from_fen(fen)
    let entries = []
    for (let entry of this.entries) {
      if (key_from_fen(entry.fen) == match_key) {
        entries.push(entry)
      }
    }
    return entries
  }
}
