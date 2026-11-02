import Utils from '../src/utils.js'
import assert from 'assert'

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -'
const END_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq -'
let FLIP_TESTS = [
  ['8/8/8/8/8/nk2b3/8/K7 b - -', 'k7/8/NK2B3/8/8/8/8/8 w - -'],
  [
    'rnbqk2r/pppp1ppp/5n2/2b1p3/2B1P3/2N5/PPPP1PPP/R1BQK1NR b KQkq -',
    'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq -',
  ],
]
describe('Utils', function () {
  describe('check_flip_board', function () {
    it('flip basic board', function () {
      let flip = Utils.flip_board(START_FEN)
      assert.equal(flip, END_FEN)
    })
    it('flip_test_boards', function () {
      for (const FLIP_TEST of FLIP_TESTS) {
        assert.equal(FLIP_TEST[1], Utils.flip_board(FLIP_TEST[0]))
      }
    })
  })
})
