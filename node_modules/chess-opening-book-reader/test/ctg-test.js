import CTG from '../src/opening-books/ctg/index.js'
import fs from 'node:fs'
import assert from 'node:assert'
import path from 'node:path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const test_fen = [
  'rnbqkbnr/pppp1ppp/8/4p3/8/8/PPPPPPPP/RNBQKBNR w KQkq',
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq',
  'rnbqkbnr/ppp1pppp/8/3p4/8/8/PPPPPPPP/RNBQKBNR w KQkq',
  'rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq',
]
describe('CTG', function () {
  let ctg = new CTG()
  before(function (done) {
    ctg.on('loaded', () => {
      done()
    })
    ctg.load_book(fs.createReadStream(__dirname + '/sample-data/simple.ctg'))
  })
  describe('check loaded', function () {
    it('loaded is true', function () {
      assert.equal(ctg.loaded, true)
    })
    it('has entries', function () {
      assert.equal(Object.keys(ctg.entries.b).length, 4)
    })
  })
  describe('check move lookup', function () {
    for (let fen of test_fen) {
      it(fen + ' has data', function () {
        let r = ctg.find(fen)
        // console.log(JSON.stringify(r.book_moves,undefined, ' '));
        assert.notEqual(typeof r, 'undefined')
      })
    }
  })
})
