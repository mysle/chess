// Tłumaczenie angielskich nazw otwarć z bazy Lichess na język polski.
// Silnik składa nazwy z rodzin, rzeczowników, przymiotników i nazw własnych,
// uwzględniając rodzaj gramatyczny, przypadki (dopełniacz) i szyk polski.

type Gender = 'm' | 'f' | 'n' | 'pl';

// ---------------------------------------------------------------------------
// Rodziny otwarć (największy priorytet przy tłumaczeniu nazwy)
// ---------------------------------------------------------------------------
const PL_FAMILIES: Record<string, string> = {
  "Ruy Lopez": "Partia Hiszpańska",
  "Sicilian Defense": "Obrona Sycylijska",
  "French Defense": "Obrona Francuska",
  "Caro-Kann Defense": "Obrona Caro-Kann",
  "Caro-Kann": "Obrona Caro-Kann",
  "King's Indian Defense": "Obrona Królewsko-Indyjska",
  "Scotch Game": "Partia Szkocka",
  "Queen's Gambit Declined": "Gambit Hetmański Odrzucony",
  "Queen's Gambit Accepted": "Gambit Hetmański Przyjęty",
  "Queen's Gambit": "Gambit Hetmański",
  "English Opening": "Debiut Angielski",
  "King's Gambit Accepted": "Gambit Królewski Przyjęty",
  "King's Gambit Declined": "Gambit Królewski Odrzucony",
  "King's Gambit": "Gambit Królewski",
  "Slav Defense": "Obrona Słowiańska",
  "Semi-Slav Defense": "Obrona Półsłowiańska",
  "Italian Game": "Partia Włoska",
  "Dutch Defense": "Obrona Holenderska",
  "Benoni Defense": "Obrona Benoni",
  "Four Knights Game": "Partia Czterech Skoczków",
  "Three Knights Opening": "Debiut Trzech Skoczków",
  "Vienna Game": "Partia Wiedeńska",
  "Nimzo-Indian Defense": "Obrona Nimzoindyjska",
  "Grünfeld Defense": "Obrona Grünfelda",
  "Bishop's Opening": "Debiut Gońca",
  "Scandinavian Defense": "Obrona Skandynawska",
  "Alekhine Defense": "Obrona Alechina",
  "Pirc Defense": "Obrona Pirca",
  "Ponziani Opening": "Debiut Ponzianiego",
  "Philidor Defense": "Obrona Philidora",
  "Modern Defense": "Obrona Nowoczesna",
  "Nimzowitsch Defense": "Obrona Nimzowitscha",
  "Trompowsky Attack": "Atak Trompowskiego",
  "Nimzo-Larsen Attack": "Atak Nimzo-Larsena",
  "Petrov's Defense": "Obrona Rosyjska (Petrowa)",
  "Latvian Gambit": "Gambit Łotewski",
  "Elephant Gambit": "Gambit Słonia",
  "Queen's Indian Defense": "Obrona Hetmańsko-Indyjska",
  "Bogo-Indian Defense": "Obrona Bogo-Indyjska",
  "Réti Opening": "Debiut Rétiego",
  "Tarrasch Defense": "Obrona Tarrascha",
  "Van Geet Opening": "Atak Van Geeta",
  "Grob Opening": "Debiut Groba",
  "Polish Opening": "Otwarcie Polskie",
  "Polish Defense": "Obrona Polska",
  "Bird Opening": "Debiut Birda",
  "Catalan Opening": "Partia Katalońska",
  "Center Game": "Partia Centralna",
  "Danish Gambit": "Gambit Duński",
  "Owen Defense": "Obrona Owena",
  "St. George Defense": "Obrona św. Jerzego",
  "Benko Gambit": "Gambit Benko (Wołżański)",
  "King's Indian Attack": "Atak Królewsko-Indyjski",
  "Zukertort Opening": "Debiut Zukertorta",
  "Zukertort Defense": "Obrona Zukertorta",
  "King's Pawn Game": "Otwarcie Pionem Królewskim",
  "King's Pawn Opening": "Otwarcie Pionem Królewskim",
  "Queen's Pawn Game": "Otwarcie Pionem Hetmańskim",
  "Queen's Pawn": "Otwarcie Pionem Hetmańskim",
  "Indian Defense": "Obrona Indyjska",
  "Indian Game": "Partia Indyjska",
  "Opening Game": "Otwarcie",
  "Open Game": "Partia Otwarta",
  "Closed Game": "Partia Zamknięta",
  "Semi-Open Game": "Partia Półotwarta",
  "Semi-Closed Game": "Partia Półzamknięta",
  "Hungarian Opening": "Otwarcie Węgierskie",
  "Saragossa Opening": "Debiut Saragossy",
  "Mieses Opening": "Debiut Miesesa",
  "Anderssen's Opening": "Debiut Anderssena",
  "Ware Opening": "Debiut Ware'a",
  "Ware Defense": "Obrona Ware'a",
  "Sodium Attack": "Atak Sodowy",
  "Clemenz Opening": "Debiut Clemenza",
  "Barnes Opening": "Otwarcie Barnesa",
  "Barnes Defense": "Obrona Barnesa",
  "Amar Opening": "Debiut Amara",
  "Kádas Opening": "Otwarcie Kádasa",
  "Van't Kruijs Opening": "Otwarcie Van't Kruijsa",
  "English Defense": "Obrona Angielska",
  "Budapest Gambit": "Gambit Budapeszteński",
  "Blackmar-Diemer Gambit": "Gambit Blackmara-Diemera",
  "Blackmar-Diemer Gambit Accepted": "Gambit Blackmara-Diemera Przyjęty",
  "Blackmar-Diemer Gambit Declined": "Gambit Blackmara-Diemera Odrzucony",
  "Albin Countergambit": "Kontrgambit Albina",
  "King's Knight Opening": "Otwarcie Skoczka Królewskiego",
  "Queen's Knight Opening": "Otwarcie Skoczka Hetmańskiego",
  "King's Bishop's Opening": "Otwarcie Gońca Królewskiego",
  "Queen's Bishop's Opening": "Otwarcie Gońca Hetmańskiego",
  "Bishop's Gambit": "Gambit Gońca",
  "Evans Gambit": "Gambit Evansa",
  "Two Knights Defense": "Obrona Dwóch Skoczków",
  "Giuoco Piano": "Partia Włoska (Giuoco Piano)",
  "Giuoco Pianissimo": "Partia Włoska, Pianissimo",
  "Neo-Grünfeld Defense": "Obrona Neogrünfeldzka",
  "Old Indian Defense": "Obrona Staroindyjska",
  "Rat Defense": "Obrona Szczura",
  "Englund Gambit": "Gambit Englunda",
  "Englund Gambit Accepted": "Gambit Englunda Przyjęty",
  "Englund Gambit Declined": "Gambit Englunda Odrzucony",
  "Benko Gambit Accepted": "Gambit Benko Przyjęty",
  "Benko Gambit Declined": "Gambit Benko Odrzucony",
  "Latvian Gambit Accepted": "Gambit Łotewski Przyjęty",
  "Danish Gambit Accepted": "Gambit Duński Przyjęty",
  "Danish Gambit Declined": "Gambit Duński Odrzucony",
  "Center Game Accepted": "Partia Centralna Przyjęta",
  "Semi-Slav Defense Accepted": "Obrona Półsłowiańska Przyjęta",
  "Blumenfeld Countergambit": "Kontrgambit Blumenfelda",
  "Blumenfeld Countergambit Accepted": "Kontrgambit Blumenfelda Przyjęty",
  "Richter-Veresov Attack": "Atak Richtera-Weresowa",
  "Rubinstein Opening": "Otwarcie Rubinsteina",
  "Torre Attack": "Atak Torrego",
  "Lion Defense": "Obrona Lwa",
  "Pterodactyl Defense": "Obrona Pterodaktyla",
  "Borg Defense": "Obrona Borga",
  "Mikenas Defense": "Obrona Mikenasa",
  "London System": "System Londyński",
  "Colle System": "System Collego",
  "Rapport-Jobava System": "System Rapporta-Jobavy",
  "Portuguese Opening": "Otwarcie Portugalskie",
  "Marienbad System": "System Marienbadzki",
  "Yusupov-Rubinstein System": "System Jusupowa-Rubinsteina",
  "Amazon Attack": "Atak Amazonki",
  "Horwitz Defense": "Obrona Horwitza",
  "Kangaroo Defense": "Obrona Kangura",
  "Slav Indian": "Obrona Słowiańsko-Indyjska",
  "Pseudo Queen's Indian Defense": "Pseudo-Obrona Hetmańsko-Indyjska",
  "Mexican Defense": "Obrona Meksykańska",
  "Carr Defense": "Obrona Carra",
  "Goldsmith Defense": "Obrona Goldsmitha",
  "Hippopotamus Defense": "Obrona Hipopotama",
  "Amsterdam Attack": "Atak Amsterdamski",
  "Creepy Crawly Formation": "Formacja Creepy Crawly",
  "Global Opening": "Otwarcie Globalne",
  "Lasker Simul Special": "Specjalna Symultana Laskera",
  "Valencia Opening": "Otwarcie Walenckie",
  "Australian Defense": "Obrona Australijska",
  "Montevideo Defense": "Obrona Montevideo",
  "Zaire Defense": "Obrona Zairu",
  "Robatsch Defense": "Obrona Robatscha",
  "Wade Defense": "Obrona Wade'a",
  "Basque Opening": "Otwarcie Baskijskie",
  "Canard Opening": "Otwarcie Kaczki (Canard)",
  "Paleface Attack": "Atak Bladolicego",
  "Döry Defense": "Obrona Döry'ego",
  "East Indian Defense": "Obrona Wschodnioindyjska",
  "Queen's Indian Accelerated": "Przyspieszona Obrona Hetmańsko-Indyjska",
  "Vulture Defense": "Obrona Sępa",
  "Duras Gambit": "Gambit Durasa",
  "Fried Fox Defense": "Obrona Smażonego Lisa",
  "Lemming Defense": "Obrona Lemminga",
  "Czech Defense": "Obrona Czeska",
  "Bongcloud Attack": "Atak Bongcloud",
  "Gunderam Defense": "Obrona Gunderama",
  "Dresden Opening": "Otwarcie Drezdeńskie",
  "Irish Gambit": "Gambit Irlandzki",
  "English Orangutan": "Otwarcie Orangutana",
  "Formation": "Formacja",
  "Vienna Gambit": "Gambit Wiedeński",
  "Queen's Indian Defense, with e3": "Obrona Hetmańsko-Indyjska z e3",
  "Queen's Indian Defense, with e3, Bb4+ Line": "Obrona Hetmańsko-Indyjska z e3, Linia Bb4+",
  "London System, with Be2": "System Londyński z Be2",
  "London System, with Bd3": "System Londyński z Bd3",
  "King's Indian Attack, with Bf5": "Atak Królewsko-Indyjski z Bf5",
  "King's Indian Attack, with e6": "Atak Królewsko-Indyjski z e6",
  "Rapport-Jobava System, with e6": "System Rapporta-Jobavy z e6",
  "Polish Opening, with d5": "Otwarcie Polskie z d5",
  "Vienna Gambit, with Max Lange Defense": "Gambit Wiedeński, z Obroną Maxa Langego",
  "Queen's Pawn, Mengarini Attack": "Otwarcie Pionem Hetmańskim, Atak Mengariniego"
};

// ---------------------------------------------------------------------------
// Słowniki pomocnicze
// ---------------------------------------------------------------------------
const HEAD_WORDS: Record<string, { pl: string; g: Gender }> = {
  defense: { pl: 'obrona', g: 'f' },
  defence: { pl: 'obrona', g: 'f' },
  variation: { pl: 'wariant', g: 'm' },
  variations: { pl: 'warianty', g: 'pl' },
  attack: { pl: 'atak', g: 'm' },
  gambit: { pl: 'gambit', g: 'm' },
  game: { pl: 'partia', g: 'f' },
  opening: { pl: 'otwarcie', g: 'n' },
  system: { pl: 'system', g: 'm' },
  formation: { pl: 'formacja', g: 'f' },
  line: { pl: 'linia', g: 'f' },
  counterattack: { pl: 'kontratak', g: 'm' },
  countergambit: { pl: 'kontrgambit', g: 'm' },
  'counter-gambit': { pl: 'kontrgambit', g: 'm' },
  trap: { pl: 'pułapka', g: 'f' },
  setup: { pl: 'ustawienie', g: 'n' },
  bind: { pl: 'związanie', g: 'n' },
  endgame: { pl: 'końcówka', g: 'f' },
  structure: { pl: 'struktura', g: 'f' },
  hybrid: { pl: 'hybryda', g: 'f' }
};

const ADJECTIVES: Record<string, string> = {
  classical: 'klasyczny',
  modern: 'nowoczesny',
  normal: 'normalny',
  main: 'główny',
  symmetrical: 'symetryczny',
  closed: 'zamknięty',
  open: 'otwarty',
  advanced: 'zaawansowany',
  advance: 'wysunięty',
  exchange: 'wymienny',
  accepted: 'przyjęty',
  declined: 'odrzucony',
  orthodox: 'ortodoksyjny',
  reversed: 'odwrócony',
  delayed: 'opóźniony',
  'ultra-delayed': 'ultraopóźniony',
  accelerated: 'przyspieszony',
  improved: 'ulepszony',
  sharp: 'ostry',
  quiet: 'cichy',
  traditional: 'tradycyjny',
  positional: 'pozycyjny',
  central: 'centralny',
  old: 'stary',
  new: 'nowy',
  early: 'wczesny',
  late: 'późny',
  defensive: 'obronny',
  active: 'aktywny',
  passive: 'pasywny',
  solid: 'solidny',
  aggressive: 'agresywny',
  favorable: 'korzystny',
  equal: 'równy',
  wild: 'dziki',
  rare: 'rzadki',
  unusual: 'niezwykły',
  'double-edged': 'dwusieczny',
  'semi-open': 'półotwarty',
  'semi-closed': 'półzamknięty',
  'semi-classical': 'półklasyczny',
  'neo-modern': 'neonowoczesny',
  double: 'podwójny',
  poisoned: 'zatruty',
  wing: 'skrzydłowy',
  // miejsca i przymiotniki narodowe
  berlin: 'berliński',
  moscow: 'moskiewski',
  leningrad: 'leningradzki',
  petersburg: 'petersburski',
  'st. petersburg': 'petersburski',
  'st petersburg': 'petersburski',
  london: 'londyński',
  paris: 'paryski',
  vienna: 'wiedeński',
  venice: 'wenecki',
  dresden: 'drezdeński',
  amsterdam: 'amsterdamski',
  carlsbad: 'karlsbarski',
  meran: 'merański',
  barmen: 'barmeński',
  zurich: 'zuryski',
  riga: 'ryski',
  krakow: 'krakowski',
  budapest: 'budapeszteński',
  sicilian: 'sycylijski',
  french: 'francuski',
  dutch: 'holenderski',
  english: 'angielski',
  spanish: 'hiszpański',
  italian: 'włoski',
  russian: 'rosyjski',
  scotch: 'szkocki',
  czech: 'czeski',
  polish: 'polski',
  hungarian: 'węgierski',
  austrian: 'austriacki',
  scandinavian: 'skandynawski',
  norwegian: 'norweski',
  swiss: 'szwajcarski',
  baltic: 'bałtycki',
  portuguese: 'portugalski',
  mexican: 'meksykański',
  australian: 'australijski',
  basque: 'baskijski',
  irish: 'irlandzki',
  indian: 'indyjski',
  yugoslav: 'jugosłowiański',
  catalan: 'kataloński',
  armenian: 'ormiański',
  georgian: 'gruziński',
  greek: 'grecki',
  turkish: 'turecki',
  german: 'niemiecki',
  belgian: 'belgijski',
  danish: 'duński',
  finnish: 'fiński',
  swedish: 'szwedzki',
  icelandic: 'islandzki',
  welsh: 'walijski',
  scottish: 'szkocki',
  brazilian: 'brazylijski',
  argentine: 'argentyński',
  american: 'amerykański',
  'new york': 'nowojorski',
  manhattan: 'manhattański',
  brooklyn: 'brookliński',
  philadelphia: 'filadelfijski',
  hastings: 'hastingski',
  'san sebastian': 'sansebastiański',
  // nazwy złożone
  "king's indian": 'królewsko-indyjski',
  "queen's indian": 'hetmańsko-indyjski',
  "king's english": 'królewsko-angielski',
  'anglo-slav': 'anglosłowiański',
  'anglo-indian': 'angloindyjski',
  'anglo-grünfeld': 'anglogrünfeldzki',
  'anglo-dutch': 'anglo-holenderski',
  'anglo-scandinavian': 'angloskandynawski',
  'semi-tarrasch': 'półtarraschowy',
  'pseudo-tarrasch': 'pseudotarraschowy',
  'semi-slav': 'półsłowiański',
  'semi-averbakh': 'póławierbachowy',
  'neo-grünfeld': 'neogrünfeldzki',
  'neo-catalan': 'neokataloński',
  'old indian': 'staroindyjski',
  'east indian': 'wschodnioindyjski',
  'anti-berlin': 'antyberliński',
  'anti-benoni': 'antybenoniowy',
  'anti-grünfeld': 'antygruenfeldzki',
  'anti-sveshnikov': 'antyświesznikowowski',
  'anti-noteboom': 'antynoteboomowy',
  'anti-philidor': 'antyfilidorowy',
  'anti-sicilian': 'antysycylijski',
  'anti-caro-kann': 'antykarokann',
  'anti-french': 'antifrancuski',
  'anti-dutch': 'antyholenderski',
  slav: 'słowiański',
  deferred: 'odroczony',
  argentinian: 'argentyński',
  novosibirsk: 'nowosybirski',
  stockholm: 'sztokholmski',
  birmingham: 'birminghamski',
  'benoni-indian': 'benonijsko-indyjski',
  'franco-sicilian': 'francusko-sycylijski',
  small: 'mały',
  full: 'pełny',
  compromised: 'skompromitowany'
};

const NOUNS: Record<string, { nom: string; gen: string; g: Gender }> = {
  pawn: { nom: 'pion', gen: 'piona', g: 'm' },
  pawns: { nom: 'piony', gen: 'pionów', g: 'pl' },
  knight: { nom: 'skoczek', gen: 'skoczka', g: 'm' },
  knights: { nom: 'skoczki', gen: 'skoczków', g: 'pl' },
  bishop: { nom: 'goniec', gen: 'gońca', g: 'm' },
  bishops: { nom: 'gońce', gen: 'gońców', g: 'pl' },
  rook: { nom: 'wieża', gen: 'wieży', g: 'f' },
  rooks: { nom: 'wieże', gen: 'wież', g: 'pl' },
  queen: { nom: 'hetman', gen: 'hetmana', g: 'm' },
  king: { nom: 'król', gen: 'króla', g: 'm' },
  dragon: { nom: 'smok', gen: 'smoka', g: 'm' },
  fianchetto: { nom: 'fianchetto', gen: 'fianchetta', g: 'n' },
  hedgehog: { nom: 'jeż', gen: 'jeża', g: 'm' },
  lion: { nom: 'lew', gen: 'lwa', g: 'm' },
  elephant: { nom: 'słoń', gen: 'słonia', g: 'm' },
  rat: { nom: 'szczur', gen: 'szczura', g: 'm' },
  vulture: { nom: 'sęp', gen: 'sępa', g: 'm' },
  kangaroo: { nom: 'kangur', gen: 'kangura', g: 'm' },
  hippopotamus: { nom: 'hipopotam', gen: 'hipopotama', g: 'm' },
  stonewall: { nom: 'Stonewall', gen: 'Stonewalla', g: 'm' },
  bind: { nom: 'związanie', gen: 'związania', g: 'n' },
  trap: { nom: 'pułapka', gen: 'pułapki', g: 'f' },
  benoni: { nom: 'Benoni', gen: 'Benoni', g: 'n' },
  snake: { nom: 'wąż', gen: 'węża', g: 'm' },
  orangutan: { nom: 'orangutan', gen: 'orangutana', g: 'm' },
  fox: { nom: 'lis', gen: 'lisa', g: 'm' },
  monkey: { nom: 'małpa', gen: 'małpy', g: 'f' },
  bird: { nom: 'ptak', gen: 'ptaka', g: 'm' },
  bear: { nom: 'niedźwiedź', gen: 'niedźwiedzia', g: 'm' },
  wolf: { nom: 'wilk', gen: 'wilka', g: 'm' },
  bull: { nom: 'byk', gen: 'byka', g: 'm' },
  invitation: { nom: 'zaproszenie', gen: 'zaproszenia', g: 'n' },
  center: { nom: 'centrum', gen: 'centrum', g: 'n' },
  centre: { nom: 'centrum', gen: 'centrum', g: 'n' },
  offer: { nom: 'oferta', gen: 'oferty', g: 'f' },
  snail: { nom: 'ślimak', gen: 'ślimaka', g: 'm' },
  hawk: { nom: 'jastrząb', gen: 'jastrzębia', g: 'm' },
  cormorant: { nom: 'kormoran', gen: 'kormorana', g: 'm' },
  squirrel: { nom: 'wiewiórka', gen: 'wiewiórki', g: 'f' },
  mosquito: { nom: 'komar', gen: 'komara', g: 'm' },
  gibbon: { nom: 'gibon', gen: 'gibona', g: 'm' },
  corkscrew: { nom: 'korkociąg', gen: 'korkociągu', g: 'm' },
  return: { nom: 'zwrot', gen: 'zwrotu', g: 'm' },
  kingside: { nom: 'skrzydło królewskie', gen: 'skrzydła królewskiego', g: 'n' },
  queenside: { nom: 'skrzydło hetmańskie', gen: 'skrzydła hetmańskiego', g: 'n' },
  walrus: { nom: 'mors', gen: 'morsa', g: 'm' },
  potato: { nom: 'ziemniak', gen: 'ziemniaka', g: 'm' },
  whale: { nom: 'wieloryb', gen: 'wieloryba', g: 'm' },
  goblin: { nom: 'goblin', gen: 'goblina', g: 'm' },
  pterodactyl: { nom: 'pterodaktyl', gen: 'pterodaktyla', g: 'm' },
  pteranodon: { nom: 'pteranodon', gen: 'pteranodona', g: 'm' }
};

const NUMBERS: Record<string, { nom: string; gen: string }> = {
  one: { nom: 'jeden', gen: 'jednego' },
  two: { nom: 'dwa', gen: 'dwóch' },
  three: { nom: 'trzy', gen: 'trzech' },
  four: { nom: 'cztery', gen: 'czterech' },
  five: { nom: 'pięć', gen: 'pięciu' },
  six: { nom: 'sześć', gen: 'sześciu' },
  seven: { nom: 'siedem', gen: 'siedmiu' },
  eight: { nom: 'osiem', gen: 'ośmiu' },
  nine: { nom: 'dziewięć', gen: 'dziewięciu' },
  ten: { nom: 'dziesięć', gen: 'dziesięciu' }
};

// Dopełniacze nazwisk i nazw własnych (klucze małymi literami).
const NAME_GEN: Record<string, string> = {
  'adams': 'Adamsa', 'agincourt': 'Agincourt', 'alapin': 'Alapina', 'albin': 'Albina',
  'alekhine': 'Alechina', 'allgaier': 'Allgaiera',
  'anderssen': 'Anderssena', 'anhanguera': 'Anhanguery', 'averbakh': 'Awierbacha',
  'bardeleben': 'Bardelebena', 'barmen': 'Barmena', 'basman': 'Basmana',
  'bastrikov': 'Bastrikowa', 'berger': 'Bergera', 'bernstein': 'Bernsteina',
  'bird': 'Birda', 'blackburne': 'Blackburne\'a', 'boden': 'Bodena',
  'bogoljubow': 'Bogolubowa', 'boleslavsky': 'Bolesławskiego', 'botvinnik': 'Botwinnika',
  'brentano': 'Brentano', 'breyer': 'Breyera', 'brinckmann': 'Brinckmanna',
  'bronstein': 'Bronsteina', 'bücker': 'Bückera', 'byrne': 'Byrne\'a',
  'capablanca': 'Capablanki', 'charousek': 'Charouska', 'chigorin': 'Czigorina',
  'cochrane': 'Cochrane\'a', 'cozio': 'Cozia', 'cunningham': 'Cunninghama',
  'czerniak': 'Czerniaka', 'damiano': 'Damiano', 'döry': 'Döry\'ego',
  'dubois': 'Dubois', 'duras': 'Durasa', 'euwe': 'Euwego', 'evans': 'Evansa',
  'fajarowicz': 'Fajarowicza', 'falkbeer': 'Falkbeera', 'fischer': 'Fischera',
  'flohr': 'Flohra', 'from': 'Froma', 'gedult': 'Gedulta', 'geller': 'Gellera',
  'gibbins': 'Gibbinsa', 'gligoric': 'Gligoricia', 'göring': 'Göringa',
  'greco': 'Greco', 'grünfeld': 'Grünfelda', 'guimard': 'Guimarda',
  'gunderam': 'Gunderama', 'gunsberg': 'Gunsberga', 'gurevich': 'Gurewicza',
  'gurgenidze': 'Gurgenidze', 'haberditz': 'Haberditza', 'hamppe': 'Hamppe',
  'hanham': 'Hanhama', 'harrwitz': 'Harrwitza', 'hector': 'Hectora',
  'henneberger': 'Hennebergera', 'hergert': 'Hergerta', 'hermet': 'Hermeta',
  'hiva': 'Hivy', 'horwitz': 'Horwitza', 'ilyin': 'Iljina', 'jaenisch': 'Jaenischa',
  'janowski': 'Janowskiego', 'kadas': 'Kádasa', 'kádas': 'Kádasa',
  'kan': 'Kana', 'karpov': 'Karpowa', 'kasparov': 'Kasparowa',
  'keene': 'Keene\'a', 'kennedy': 'Kennedy\'ego', 'keres': 'Keresa',
  'kieseritzky': 'Kieseritzky\'ego', 'kmoch': 'Kmocha', 'korchnoi': 'Korcznoja',
  'krause': 'Krausego', 'krejcik': 'Krejcika', 'kupreichik': 'Kuprejczyka',
  'labahn': 'Labahna', 'lange': 'Langego', 'larsen': 'Larsena',
  'lasker': 'Laskera', 'lemberger': 'Lembergera', 'leonhardt': 'Leonhardta',
  'levenfish': 'Levenfisha', 'lolli': 'Lolliego', 'lutikov': 'Lutikowa',
  'macleod': 'MacLeoda', 'mackenzie': 'Mackenziego', 'maróczy': 'Maróczego', 'marshall': 'Marshalla',
  'max': 'Maxa', 'mayet': 'Mayeta', 'mccutcheon': 'McCutcheona',
  'mcdonnell': 'McDonnella', 'meran': 'Meranu', 'mieses': 'Miesesa',
  'mikenas': 'Mikienasa', 'milner': 'Milnera', 'mindeno': 'Mindena',
  'morphy': 'Morphy\'ego', 'muzio': 'Muzio', 'myers': 'Myersa',
  'najdorf': 'Najdorfa', 'nimzowitsch': 'Nimzowitscha', 'noa': 'Noi',
  'noteboom': 'Notebooma', 'nyezhmetdinov': 'Nieżmetdinowa',
  'o\'kelly': 'O\'Kelly\'ego', 'opocensky': 'Opocenskiego',
  'pachman': 'Pachmana', 'panno': 'Panno', 'panteldakis': 'Panteldakisa',
  'paulsen': 'Paulsena', 'pelikan': 'Pelikana', 'petrosian': 'Petrosiana',
  'philidor': 'Philidora', 'pillsbury': 'Pillsbury\'ego', 'pirc': 'Pirca',
  'polerio': 'Poleria', 'polugaevsky': 'Polugajewskiego', 'ponziani': 'Ponzianiego',
  'prins': 'Prinsa', 'ragozin': 'Ragozina', 'rauzer': 'Rauzera',
  'reshevsky': 'Reshevsky\'ego', 'réti': 'Rétiego', 'rhamphorhynchus': 'Rhamphorhynchus',
  'richter': 'Richtera', 'romanisin': 'Romaniszyna',
  'romanishin': 'Romaniszyna', 'rosentreter': 'Rosentretera', 'rossolimo': 'Rossolimo',
  'rubinstein': 'Rubinsteina', 'salvio': 'Salvia', 'sämisch': 'Sämischa',
  'schallopp': 'Schalloppa', 'scheveningen': 'Scheveningen', 'schlechter': 'Schlechtera',
  'schliemann': 'Schliemanna', 'simagin': 'Simagina', 'smith': 'Smitha',
  'smyslov': 'Smysłowa', 'sokolsky': 'Sokolskiego', 'sozin': 'Sozina',
  'spassky': 'Spasskiego', 'spielmann': 'Spielmanna', 'staunton': 'Stauntona',
  'steiner': 'Steinera', 'steinitz': 'Steinitza', 'stoltz': 'Stolza',
  'svenonius': 'Svenoniusa', 'sveshnikov': 'Swiesznikowa', 'taimanov': 'Taimanowa',
  'tal': 'Tala', 'tarrasch': 'Tarrascha', 'tartakower': 'Tartakowera',
  'teichmann': 'Teichmanna', 'torre': 'Torrego', 'traxler': 'Traxlera',
  'trifunovic': 'Trifunovicia', 'urusov': 'Urusowa', 'vitolins': 'Vitolinsa',
  'wade': 'Wade\'a', 'weidenhagen': 'Weidenhagena', 'wiel': 'Wiela',
  'winawer': 'Winawera', 'worrall': 'Worralla', 'yates': 'Yatesa',
  'zaitsev': 'Zajcewa', 'zilbermints': 'Zilbermintsa', 'zukertort': 'Zukertorta',
  'carls': 'Carlsa', 'keoni': 'Keoni', 'columpio': 'Columpio',
  'mbembe': 'Mbembe', 'mokele': 'Mokele',
  'pteranodon': 'Pteranodona', 'pterodactyl': 'Pterodaktyla'
};

// Ręczne tłumaczenia całych segmentów, tam gdzie dosłowny składnik byłby niezgrabny.
const PHRASES: Record<string, string> = {
  'classical variation': 'wariant klasyczny',
  'exchange variation': 'wariant wymienny',
  'fianchetto variation': 'wariant fianchetta',
  'symmetrical variation': 'wariant symetryczny',
  'advance variation': 'wariant wysunięty',
  "king's english variation": 'wariant królewsko-angielski',
  'normal variation': 'wariant normalny',
  'two knights defense': 'obrona dwóch skoczków',
  'modern variation': 'wariant nowoczesny',
  'dragon variation': 'wariant smoka',
  'morphy defense': 'obrona Morphy\'ego',
  'orthodox defense': 'obrona ortodoksyjna',
  'main line': 'główna linia',
  'modern main line': 'nowoczesna linia główna',
  'modern exchange variation': 'nowoczesny wariant wymienny',
  'ultra-delayed exchange variation': 'ultraopóźniony wariant wymienny',
  'reversed closed sicilian': 'odwrócona sycylijska zamknięta',
  'neo-catalan declined': 'neo-kataloński wariant odrzucony',
  'old benoni': 'stare Benoni',
  'giuoco piano': 'Giuoco Piano',
  'giuoco pianissimo': 'Giuoco Pianissimo',
  'sicilian': 'sycylijska',
  'french': 'francuska',
  'dutch': 'holenderska',
  'english': 'angielska',
  'italian': 'włoska',
  'russian': 'rosyjska',
  'spanish': 'hiszpańska',
  'central': 'centralna',
  'eastern': 'wschodnia',
  'western': 'zachodnia',
  'austrian': 'austriacka',
  'catalan': 'katalońska',
  'scandinavian': 'skandynawska',
  'indian': 'indyjska',
  'hungarian': 'węgierska',
  'polish': 'polska',
  'czech': 'czeska',
  'yugoslav': 'jugosłowiańska',
  'dragon': 'wariant smoka',
  'fianchetto': 'wariant fianchetta',
  'stonewall': 'wariant Stonewalla',
  'hedgehog': 'wariant jeża',
  'maróczy bind': 'związanie Maróczego',
  'poisoned pawn variation': 'wariant zatrutego piona',
  "king's indian attack": 'atak królewsko-indyjski',
  'london system': 'system londyński',
  'colle system': 'system Collego',
  'torre attack': 'atak Torrego',
  'vienna gambit': 'gambit wiedeński',
  'evans gambit': 'gambit Evansa',
  'smith-morra gambit': 'gambit Smitha-Morry',
  'richter-rauzer variation': 'wariant Richtera-Rauzera',
  'nyezhmetdinov-rossolimo attack': 'atak Nieżmetdinowa-Rossolimo',
  'lasker-pelikan variation': 'wariant Laskera-Pelikana',
  'kasparov-petrosian variation': 'wariant Kasparowa-Petrosiana',
  'alekhine-chatard attack': 'atak Alechina-Chatarda',
  'max lange attack': 'atak Maxa Langego',
  'anti-berlin variation': 'wariant antyberliński',
  'semi-tarrasch defense': 'obrona półtarraschowa',
  'semi-slav defense': 'obrona półsłowiańska',
  'neo-grünfeld defense': 'obrona neogrünfeldzka',
  'anglo-slav variation': 'wariant anglosłowiański',
  'anglo-indian defense': 'obrona angloindyjska',
  'cambridge springs defense': 'obrona Cambridge Springs',
  'st. george defense': 'obrona św. Jerzego',
  "king's pawn line": 'linia królewskiego piona',
  'double fianchetto': 'podwójne fianchetto',
  'double muzio gambit': 'podwójny gambit Muzio',
  'wing gambit': 'gambit skrzydłowy',
  'four pawns attack': 'atak czterech pionów',
  'three knights variation': 'wariant trzech skoczków',
  'four knights variation': 'wariant czterech skoczków',
  'open defense': 'obrona otwarta',
  'closed defense': 'obrona zamknięta',
  'open game': 'partia otwarta',
  'closed game': 'partia zamknięta',
  'two pawns attack': 'atak dwóch pionów',
  'three pawns attack': 'atak trzech pionów',
  'early b3': 'wczesne b3',
  'early b4': 'wczesne b4',
  'early d4': 'wczesne d4',
  'early e4': 'wczesne e4',
  'early g3': 'wczesne g3',
  'early h4': 'wczesne h4',
  'fingerslip variation': 'wariant Fingerslip',
  'wayward queen attack': 'atak zbłąkanej hetman',
  '150 attack': 'atak 150',
  "l'hermet variation": 'wariant l\'Hermeta',
  "fool's mate": 'mat głupca',
  'spike lee gambit': 'gambit Spike\'a Lee',
  'myers spike attack': 'atak Spike\'a Myersa',
  "beginner's trap": 'pułapka początkującego',
  'sicilian invitation': 'sycylijskie zaproszenie',
  'pirc invitation': 'zaproszenie Pirca',
  'slav invitation': 'zaproszenie słowiańskie',
  'reversed rat': 'odwrócona obrona szczura',
  'reversed brooklyn': 'odwrócona obrona brooklińska',
  'reversed french': 'odwrócona obrona francuska',
  'reversed brooklyn defense': 'odwrócona obrona brooklińska',
  'reversed modern defense': 'odwrócona obrona nowoczesna',
  'reversed norwegian defense': 'odwrócona obrona norweska',
  'the squirrel': 'wiewiórka',
  'endgame offer': 'oferta końcówki',
  'king march line': 'linia marszu króla',
  'center holding variation': 'wariant utrzymania centrum',
  'centre holding variation': 'wariant utrzymania centrum',
  'accelerated move order': 'przyspieszona kolejność ruchów',
  'move order': 'kolejność ruchów',
  'kingside move order': 'kolejność ruchów na skrzydle królewskim',
  'queenside move order': 'kolejność ruchów na skrzydle hetmańskim',
  'pawn return variation': 'wariant zwrotu piona',
  'semi-benoni': 'pół-Benoni',
  'rio de janeiro variation': 'wariant Rio de Janeiro',
  'benoni-indian defense': 'obrona benonijsko-indyjska',
  'benoni-staunton gambit': 'gambit Benoni-Stauntona',
  "lion's cave": 'jaskinia lwa',
  'lion claw gambit': 'gambit lwiego pazura',
  'aged gibbon gambit': 'gambit starego gibona',
  'corkscrew gambit': 'gambit korkociągu',
  'mosquito gambit': 'gambit komara',
  'nescafe frappe attack': 'atak Nescafé Frappé',
  'snail variation': 'wariant ślimaka',
  'hawk variation': 'wariant jastrzębia',
  'cormorant gambit': 'gambit kormorana',
  'coffee house attack': 'atak kawiarniany',
  'queen\'s gambit invitation': 'zaproszenie do gambitu hetmańskiego',
  'bird invitation': 'zaproszenie Birda',
  'anti-qxd4 move order': 'kolejność ruchów anty-Qxd4',
  'anti-qxd4 move order accepted': 'kolejność ruchów anty-Qxd4 przyjęta',
  'kingside fianchetto': 'fianchetto skrzydła królewskiego',
  'queenside fianchetto variation': 'wariant fianchetta skrzydła hetmańskiego',
  'queenside fianchetto': 'fianchetto skrzydła hetmańskiego',
  'kingside variation': 'wariant skrzydła królewskiego',
  'queenside defense': 'obrona skrzydła hetmańskiego',
  'the walrus': 'mors',
  'the potato': 'ziemniak',
  'the whale': 'wieloryb',
  'the goblin': 'goblin',
  'anti-fried liver defense': 'obrona anty-Fried-Liver',
  'anti-veresov': 'anty-Weresowa',
  'anti-colle': 'anty-Collego',
  'anti-cambridge springs variation': 'wariant anty-Cambridge Springs',
  'anti-nimzo-indian': 'anty-Nimzo-Indyjska',
  'sea-cadet mate': 'mat kadeta morskiego',
  'scorpion-grob gambit': 'gambit Scorpion-Groba',
  'bradford attack variation': 'wariant ataku Bradforda',
  'compromised defense': 'obrona skompromitowana',
  'full line': 'pełna linia',
  'traditional colle': 'tradycyjny system Collego',
  "king's knight's gambit": 'gambit królewskiego skoczka',
  "queen's knight's gambit": 'gambit hetmańskiego skoczka'
};

// ---------------------------------------------------------------------------
// Pomocnicze funkcje gramatyczne
// ---------------------------------------------------------------------------
function normalize(word: string): string {
  return word.toLowerCase().replace(/’/g, "'");
}

function agree(adj: string, g: Gender): string {
  const iEnd = /i$/.test(adj);
  if (g === 'pl') return iEnd ? adj + 'e' : adj.replace(/y$/, 'e');
  if (g === 'f') return iEnd ? adj.slice(0, -1) + 'a' : adj.replace(/y$/, 'a');
  if (g === 'n') return iEnd ? adj + 'e' : adj.replace(/y$/, 'e');
  return adj;
}

function genAgree(adj: string, g: Gender): string {
  const iEnd = /i$/.test(adj);
  if (g === 'f') return iEnd ? adj.slice(0, -1) + 'iej' : adj.replace(/y$/, 'ej');
  if (g === 'pl') return iEnd ? adj.slice(0, -1) + 'ich' : adj.replace(/y$/, 'ych');
  return iEnd ? adj.slice(0, -1) + 'iego' : adj.replace(/y$/, 'ego');
}

function heuristicGen(name: string): string {
  if (/a$/i.test(name)) return name.slice(0, -1) + 'i';
  if (/e$/i.test(name)) return name + 'go';
  if (/y$/i.test(name)) return name + "'ego";
  if (/i$/i.test(name)) return name + 'ego';
  if (/o$/i.test(name)) return name;
  if (/ov$/i.test(name)) return name.slice(0, -2) + 'owa';
  if (/ev$/i.test(name)) return name.slice(0, -2) + 'ewa';
  if (/sky$/i.test(name)) return name.slice(0, -3) + 'skiego';
  if (/ski$/i.test(name)) return name.slice(0, -1) + 'ego';
  return name + 'a';
}

function genderOfPolishName(name: string): Gender {
  const first = name.split(' ')[0].toLowerCase();
  if (['partia', 'obrona', 'formacja', 'linia', 'pułapka', 'końcówka', 'struktura', 'hybryda', 'gra'].includes(first)) return 'f';
  if (['otwarcie', 'związanie', 'ustawienie'].includes(first)) return 'n';
  if (first === 'warianty') return 'pl';
  return 'm';
}

function isCapitalized(word: string): boolean {
  return /^[A-ZÀ-Þ]/.test(word);
}

// ---------------------------------------------------------------------------
// Tokeny
// ---------------------------------------------------------------------------
interface Token {
  raw: string;
  key: string;
  kind: 'adj' | 'noun' | 'name' | 'num' | 'raw';
  adj?: string;
  noun?: { nom: string; gen: string; g: Gender };
  gen?: string;
  num?: { nom: string; gen: string };
}

function classify(raw: string, key: string): Token {
  if (ADJECTIVES[key]) return { raw, key, kind: 'adj', adj: ADJECTIVES[key] };
  if (NUMBERS[key]) return { raw, key, kind: 'num', num: NUMBERS[key] };
  if (NOUNS[key]) return { raw, key, kind: 'noun', noun: NOUNS[key] };

  // King's / Queen's -> przymiotnik; Bishop's / Knight's / Rook's -> dopełniacz rzeczownika.
  const poss = key.match(/^(.+)'s$/);
  if (poss) {
    const base = poss[1];
    if (base === 'king') return { raw, key, kind: 'adj', adj: 'królewski' };
    if (base === 'queen') return { raw, key, kind: 'adj', adj: 'hetmański' };
    if (base === 'bishop') return { raw, key, kind: 'noun', noun: { nom: 'goniec', gen: 'gońca', g: 'm' } };
    if (base === 'knight') return { raw, key, kind: 'noun', noun: { nom: 'skoczek', gen: 'skoczka', g: 'm' } };
    if (base === 'rook') return { raw, key, kind: 'noun', noun: { nom: 'wieża', gen: 'wieży', g: 'f' } };
    const gen = NAME_GEN[base] ?? heuristicGen(base);
    return { raw, key, kind: 'name', gen };
  }

  if (NAME_GEN[key]) return { raw, key, kind: 'name', gen: NAME_GEN[key] };

  // Złożenia z prefiksem, np. Anti-Berlin, Semi-Tarrasch.
  const pref = key.match(/^(anti|semi|neo|ultra|anglo|pseudo|pre|post|counter)-(.+)$/);
  if (pref) {
    const inner = classify(pref[2], pref[2]);
    const map: Record<string, string> = {
      anti: 'anty', semi: 'pół', neo: 'neo', ultra: 'ultra', anglo: 'anglo',
      pseudo: 'pseudo', pre: 'pre', post: 'post', counter: 'kontr'
    };
    if (inner.kind === 'adj') return { raw, key, kind: 'adj', adj: map[pref[1]] + inner.adj! };
    if (inner.kind === 'name') return { raw, key, kind: 'name', gen: map[pref[1]] + '-' + inner.gen! };
    if (inner.kind === 'noun') return { raw, key, kind: 'name', gen: map[pref[1]] + '-' + inner.noun!.gen };
    const base = pref[2].charAt(0).toUpperCase() + pref[2].slice(1);
    return { raw, key, kind: 'name', gen: map[pref[1]] + '-' + (NAME_GEN[pref[2]] ?? heuristicGen(base)) };
  }

  // Złożenia z myślnikiem z nazwisk, np. Richter-Rauzer.
  if (key.includes('-')) {
    const parts = key.split('-');
    if (parts.every((p) => NAME_GEN[p] || ADJECTIVES[p] || NOUNS[p])) {
      if (parts.every((p) => ADJECTIVES[p])) {
        return { raw, key, kind: 'adj', adj: parts.map((p) => ADJECTIVES[p]).join('-') };
      }
      const gen = parts.map((p) => NAME_GEN[p] ?? (ADJECTIVES[p] ? ADJECTIVES[p] : heuristicGen(p))).join('-');
      return { raw, key, kind: 'name', gen };
    }
  }

  if (/^\d+$/.test(key)) return { raw, key, kind: 'num', num: { nom: raw, gen: raw } };
  if (isCapitalized(raw)) return { raw, key, kind: 'name', gen: heuristicGen(raw) };
  return { raw, key, kind: 'raw' };
}

function tokenize(segment: string): Token[] {
  const words = segment.split(/\s+/).filter(Boolean);
  const out: Token[] = [];
  let i = 0;
  while (i < words.length) {
    let matched = false;
    for (let n = Math.min(3, words.length - i); n >= 2; n--) {
      const raw = words.slice(i, i + n).join(' ');
      const key = normalize(raw);
      if (ADJECTIVES[key] || NAME_GEN[key] || NOUNS[key] || NUMBERS[key]) {
        out.push(classify(raw, key));
        i += n;
        matched = true;
        break;
      }
    }
    if (!matched) {
      out.push(classify(words[i], normalize(words[i])));
      i++;
    }
  }
  return out;
}

function nominalPhrase(tokens: Token[], target: 'nom' | 'gen'): string {
  let anchorIdx = -1;
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i];
    if (t.kind === 'noun' || t.kind === 'name' || (t.kind === 'raw' && isCapitalized(t.raw))) {
      anchorIdx = i;
      break;
    }
  }
  if (anchorIdx === -1) {
    return tokens.map((t) => (t.kind === 'adj' ? agree(t.adj!, 'm') : t.raw)).join(' ');
  }

  const anchor = tokens[anchorIdx];
  let g: Gender = 'm';
  let anchorText = anchor.raw;
  if (anchor.kind === 'noun') {
    g = anchor.noun!.g;
    anchorText = target === 'gen' ? anchor.noun!.gen : anchor.noun!.nom;
  } else {
    anchorText = target === 'gen' ? (anchor.gen ?? heuristicGen(anchor.raw)) : anchor.raw;
  }

  const parts: string[] = [];
  for (let i = 0; i < anchorIdx; i++) {
    const t = tokens[i];
    if (t.kind === 'adj') parts.push(target === 'gen' ? genAgree(t.adj!, g) : agree(t.adj!, g));
    else if (t.kind === 'num') parts.push(target === 'gen' ? t.num!.gen : t.num!.nom);
    else if (t.kind === 'name') parts.push(target === 'gen' ? (t.gen ?? heuristicGen(t.raw)) : t.raw);
    else if (t.kind === 'noun') parts.push(target === 'gen' ? t.noun!.gen : t.noun!.nom);
    else parts.push(t.raw);
  }
  parts.push(anchorText);
  for (let i = anchorIdx + 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.kind === 'adj') parts.push(target === 'gen' ? genAgree(t.adj!, g) : agree(t.adj!, g));
    else if (t.kind === 'name') parts.push(target === 'gen' ? (t.gen ?? heuristicGen(t.raw)) : t.raw);
    else parts.push(t.raw);
  }
  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Tłumaczenie segmentu nazwy (po dwukropku lub przecinku)
// ---------------------------------------------------------------------------
function translateSegment(segment: string, familyGender: Gender): string {
  const trimmed = segment.replace(/\s+/g, ' ').trim();
  if (!trimmed) return '';

  const low = normalize(trimmed);
  if (PHRASES[low] !== undefined) return PHRASES[low];

  if (/^with\b/i.test(trimmed)) return 'z ' + trimmed.replace(/^with\s*/i, '');
  if (/^without\b/i.test(trimmed)) return 'bez ' + trimmed.replace(/^without\s*/i, '');

  const tokens = tokenize(trimmed);

  let headIdx = -1;
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (HEAD_WORDS[tokens[i].key]) {
      headIdx = i;
      break;
    }
  }

  if (headIdx === -1) {
    if (tokens.length === 1) {
      const t = tokens[0];
      if (t.kind === 'adj') return agree(t.adj!, familyGender);
      if (t.kind === 'name') return t.gen ?? heuristicGen(t.raw);
      if (t.kind === 'noun') return t.noun!.nom;
      return t.raw;
    }
    if (tokens.every((t) => t.kind === 'adj')) {
      return tokens.map((t) => agree(t.adj!, familyGender)).join(' ');
    }
    return nominalPhrase(tokens, 'nom');
  }

  const head = HEAD_WORDS[tokens[headIdx].key];
  const before = tokens.slice(0, headIdx);
  const after = tokens.slice(headIdx + 1);

  const adjectives: string[] = [];
  const nominal: Token[] = [];
  for (const t of before) {
    if (nominal.length === 0 && t.kind === 'adj') adjectives.push(t.adj!);
    else if (nominal.length === 0 && t.kind === 'raw' && !isCapitalized(t.raw)) adjectives.push(t.raw);
    else nominal.push(t);
  }
  // Przymiotniki stojące bezpośrednio przed rzeczownikiem opisują ten rzeczownik,
  // a nie słowo nagłówkowe (np. Small Center Defense -> obrona małego centrum).
  if (nominal.length > 0 && nominal[0].kind === 'noun' && adjectives.length > 0 && !isCapitalized(adjectives[0])) {
    const moved: Token[] = adjectives.map((a) => ({ raw: a, key: a, kind: 'adj' as const, adj: a }));
    nominal.unshift(...moved);
    adjectives.length = 0;
  }

  let result: string;
  if (nominal.length > 0) {
    const adjText = adjectives.length
      ? adjectives.map((a) => agree(a, head.g)).join(' ') + ' '
      : '';
    result = adjText + head.pl + ' ' + nominalPhrase(nominal, 'gen');
  } else {
    result = head.pl + (adjectives.length ? ' ' + adjectives.map((a) => agree(a, head.g)).join(' ') : '');
  }

  for (const t of after) {
    if (t.kind === 'adj') result += ' ' + agree(t.adj!, head.g);
    else if (t.kind === 'name') result += ' ' + (t.gen ?? heuristicGen(t.raw));
    else result += ' ' + t.raw;
  }

  return result.replace(/\s+/g, ' ').trim();
}

export function localizeOpeningName(name: string): string {
  const colon = name.indexOf(':');
  let family = (colon === -1 ? name : name.slice(0, colon)).trim();
  let rest = colon === -1 ? '' : name.slice(colon + 1).trim();

  let familyPl = PL_FAMILIES[family];
  if (!familyPl) {
    const comma = family.indexOf(',');
    if (comma !== -1) {
      const head = family.slice(0, comma).trim();
      const tail = family.slice(comma + 1).trim();
      if (PL_FAMILIES[head]) {
        familyPl = PL_FAMILIES[head];
        rest = tail + (rest ? ', ' + rest : '');
      }
    }
  }
  if (!familyPl) familyPl = translateSegment(family, 'f');

  const familyGender = genderOfPolishName(familyPl);
  const parts = rest.split(',').map((s) => s.trim()).filter(Boolean);
  const translated = parts.map((p) => translateSegment(p, familyGender));
  return [familyPl, ...translated].join(', ');
}
