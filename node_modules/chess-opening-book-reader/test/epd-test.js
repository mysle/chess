import fs from 'node:fs'
import assert from 'node:assert'
import path from 'node:path'
import { fileURLToPath } from 'url'
import EPD from '../src/opening-books/epd/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
let test_fen = ['3r1rk1/1p3pnp/p3pBp1/1qPpP3/1P1P2R1/P2Q3R/6PP/6K1 w - - ']

describe('EPD', function () {
  let epd = new EPD()
  before(function (done) {
    epd.on('loaded', () => {
      done()
    })
    epd.load_stream(
      fs.createReadStream(__dirname + '/sample-data/epd-test.epd'),
    )
  })
  describe('check loaded', function () {
    it('loaded is true', function () {
      assert.equal(epd.loaded, true)
    })
    it('has entries', function () {
      assert.ok(Object.keys(epd.entries).length > 0)
    })
  })
  describe('check move lookup', function () {
    for (let fen of test_fen) {
      it(fen + ' has data', function () {
        let r = epd.find(fen)
        // console.log(JSON.stringify(r.book_moves,undefined, ' '));
        assert.notEqual(typeof r, 'undefined')
      })
    }
  })
})
