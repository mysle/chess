import EventEmitter from 'events'

export default class BaseBook extends EventEmitter {
  loadBook(/*arrayBuffer*/) {
    throw new Error('load_book not implemented')
  }
  find(/*fen or pgn*/) {
    throw new Error('find() not implemented')
  }
}
