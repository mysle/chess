import ChessTools from '../index.js'
import fs from 'node:fs'
import assert from 'node:assert'
import path from 'node:path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
let test_fen = ['rnbqk2r/ppppppbp/5np1/8/2P5/2N3P1/PP1PPP1P/R1BQKBNR w KQkq']

describe('ABK', function () {
  let abk = new ChessTools.OpeningBooks.ABK()
  before(function (done) {
    abk.on('loaded', () => {
      done()
    })
    abk.load_book(fs.createReadStream(__dirname + '/sample-data/libra8.abk'))
  })
  describe('check loaded', function () {
    it('loaded is true', function () {
      assert.equal(abk.loaded, true)
    })
    it('has entries', function () {
      assert.equal(Object.keys(abk.entries).length, 277)
    })
  })
  describe('check move lookup', function () {
    for (let fen of test_fen) {
      it(fen + ' has data', function () {
        let r = abk.find(fen)
        // console.log(JSON.stringify(r.book_moves,undefined, ' '));
        assert.notEqual(typeof r, 'undefined')
      })
    }
  })
})
