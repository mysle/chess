# chess-opening-book-reader

Forked from [chess-tools](https://github.com/johnfontaine/chess-tools), the goal of this project is to provide an easy way to parse opening books of various formats. 

## Installation

```
npm install chess-opening-book-reader
```

## Usage

```js
const buffer = somethingThatReturnsArrayBuffer()
import { OpeningBooks } from 'chess-opening-book-reader'
book = new OpeningBooks.CTG().loadBook(buffer)
book.find(someFen)
```

## Supported Formats:

- CTG - used by products such as Chessbase
- Polyglot - used by a number of open source projects
- ABK - used by products such as Arena
- EPD
- ECO

## References

Note: Sample Files are believed to be in the public domain or licensed under GPL. Sources are provided below.

- Chess Programming Wiki
  - https://chessprogramming.wikispaces.com/

- ABK Format
  - https://chessprogramming.wikispaces.com/ABK

- Polyglot Format
  - Sample File https://github.com/michaeldv/donna_opening_books/raw/master/gm2001.bin

- CTG Format
  - Forum post .. http://rybkaforum.net/cgi-bin/rybkaforum/topic_show.pl?tid=2319

- CTGReader
  - https://github.com/sshivaji/ctgreader/
  - Sample file http://americanfoot.free.fr/echecs/ctg-thematique.htm

- EPD
  - https://www.chessprogramming.org/Extended_Position_Description

- ECO
  - https://www.chessprogramming.org/ECO
  - Sample ftp://ftp.cs.kent.ac.uk/pub/djb/pgn-extract/eco.pgn

- Winboard/ XBoard Protocol
  - https://www.gnu.org/software/xboard/engine-intf.html

- UCI
  - https://chessprogramming.wikispaces.com/UCI
