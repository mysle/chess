//see https://chessprogramming.wikispaces.com/ABK
//http://www.talkchess.com/forum/viewtopic.php?topic_view=threads&p=184321&t=20661
import { key_from_fen } from '../../utils.js'

const ENTRY_SIZE = 28 //bytes
const START_ADDRESS = ENTRY_SIZE * 900

import ABKEntry from './entry.js'
import BaseBook from '../base.js'

class ABKParser {
  constructor() {
    this.data = undefined
    this.start = 900 * ENTRY_SIZE
    this.entry_num = 0
    this.current_depth = 0
    this.current_address = 900
    this.read_to_start = false
    this.received_bytes = 0
    this.can_read = true
    this.current_path = []
  }

  parse(buffer) {
    const entries = []
    this.received_bytes += buffer.byteLength
    if (this.received_bytes > this.start + ENTRY_SIZE) {
      this.read_to_start = true
    }

    if (!this.read_to_start) {
      throw new Error('Invalid ABK file (file too small)')
    }

    while (this.can_read) {
      entries.push(this.read_record(buffer))
    }

    return entries
  }

  read_record(buffer) {
    let offset = ENTRY_SIZE * this.entry_num
    let record = buffer.slice(
      START_ADDRESS + offset,
      START_ADDRESS + ENTRY_SIZE + offset,
    )
    let entry = ABKEntry.fromBuffer(record, this.entry_num + 900)
    if (this.current_path.length > 0) {
      this.current_path[this.current_path.length - 1].children.push(entry)
      for (let p of this.current_path) {
        entry.path.push(p)
      }
      if (entry.first_child > -1) {
        this.current_path.push(entry)
      } else if (entry.first_child === -1 && entry.next_sibling === -1) {
        let remove = 0
        for (let p of this.current_path) {
          if (p.next_sibling === -1) {
            remove++
          }
        }
        this.current_path = this.current_path.slice(
          0,
          this.current_path.length - remove,
        )
      }
    } else {
      this.current_path = [entry]
    }
    this.entry_num++
    entry.entry_num = this.entry_num
    this.can_read =
      buffer.byteLength > START_ADDRESS + ENTRY_SIZE + offset + ENTRY_SIZE
    return entry
  }
}

class ABK extends BaseBook {
  constructor() {
    super()
    this.loaded = false
    this.entries = {}
  }

  loadBook(buffer) {
    this.entries = new ABKParser().parse(buffer)
    this.loaded = true
    return this
  }

  find(fen) {
    let key = key_from_fen(fen)
    return this.entries[key]
  }
}

export default ABK
