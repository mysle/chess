import fs from 'node:fs'
import assert from 'node:assert'
import path from 'node:path'
import { fileURLToPath } from 'url'
import ECO from '../src/opening-books/eco/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

describe('ECO', function () {
  let eco
  before(function (done) {
    eco = new ECO()
    eco.on('loaded', () => {
      done()
    })
    eco.load_stream(fs.createReadStream(__dirname + '/sample-data/eco.pgn'))
  })
  describe('check loaded', function () {
    it('loaded is true', function () {
      assert.equal(eco.loaded, true)
    })
  })
  describe('test findOpening', function () {
    it('opening 1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. d3 is C55', function () {
      let opening = eco.find('1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. d3')
      assert.equal('C55', opening.eco_code)
    })
  })
})
