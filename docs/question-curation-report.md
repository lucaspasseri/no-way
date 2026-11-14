# Question curation audit — 2026-11-14

The checked-in manifest has exactly **200 curated questions** with sequential
curated IDs **1–200**, across ten topic areas. Automated validation and the additional
source/wording/quality pass were completed separately through the shared lifecycle.

## Dataset accounting

| Measure | Count |
| --- | ---: |
| Predefined JSON records analyzed | 5 |
| Existing curated questions retained | 5 |
| Additional predefined records available/promoted | 0 |
| Newly authored candidates accepted after source review | 195 |
| External AI generation API calls | 0 |
| Final generated | 0 |
| Final validated | 0 |
| Final curated | 200 |
| Excluded draft questions | 1 |

The predefined bank really contained only five records; there was no larger hidden
predefined set to promote. The 195 additions were AI-authored during this coding
task, then checked against sources and calculation rules. This was a source-backed
coding-agent review, not an independent human editorial sign-off or a claim that an
external AI provider verified facts.

The retained JSON IDs are `1, 2, 6, 7, 10`; additions use `11–205`. These are permanent
dataset identities (`predefined:<id>`), not production primary keys. Curated IDs are
assigned deterministically in retained-record order followed by accepted additions.
The database allocates its own PKs; imports never renumber historical references.

One proposed chess question asking the initial pawn count was excluded because it
substantially overlapped with the retained question about starting chess pieces.
A guitar question was reworded to remove its answer from the wording. Duplicate
screening initially falsely grouped different planet measurements; token screening
was corrected and the distinct original questions were retained, with regression
coverage. No original curated question was rejected. Rejections are audit notes,
not a fourth lifecycle status.

## Variety

| Topic | Questions |
| --- | ---: |
| science | 30 |
| geography | 21 |
| everyday | 16 |
| technology | 21 |
| history | 22 |
| human-body | 13 |
| nature | 16 |
| culture | 19 |
| sports | 21 |
| mathematics | 21 |

Difficulty counts: easy: 51, hard: 23, medium: 126.
Answers range from 0 to 4.29497e+09, including fractions and large counts.

## Review evidence and limitations

Every curated record includes `review.reviewer`, `review.notes`, `review.sourceUrl`,
`review.verifiedAnswer`, and `review.independentlyVerified`, in addition to an answer
explanation, display source, `validatedAt` and `reviewedAt`. Sources were checked during this task; numerical
conversions, mathematical derivations and rounding were also checked. Original
NASA/JPL sources were reopened before retaining their five values. Math questions
cite the relevant definition/formula and explain the independently calculated value.

These are reference-backed game answers, not measurements made by this project.
NASA distances and diameters use the cited published precision, rather than claiming
an exact instantaneous physical value. Anatomy questions specify standard counts
and exclusions for individual variation. Sports questions distinguish the named rule
set, regulation time, full shot clocks, and metric units. Historical events distinguish
adoption, signing, completion, dedication and opening where those differ.

The duplicate heuristic does not prove absence of semantic duplicates. The curation
pass also reviewed closely related facts and scopes. Some related questions remain
intentionally distinct, such as different planets, skeletal divisions, and unit scales;
future editors should assess repetition when adding more. Difficulty labels are
editorial estimates, without player calibration. Sources can change, disappear, or
contain mistakes; links are not immutable archival snapshots. No future automatic
web re-verification or recurring review process is claimed. Demote a questionable
record before use and review it again. A checked source does not eliminate every
possible factual uncertainty.

The former CIA World Factbook page redirected to a retirement notice, so it was not
used as factual evidence. A blocked periodic-table site was replaced with NIST's
accessible table. No unavailable page was labeled as checked evidence for a fact.

## Checked reference index

Curated IDs below map to full questions and review notes in
[`db/seed/questions.json`](../db/seed/questions.json). This index records the checked
reference, not a claim that every statement elsewhere on that page was verified.

| Reference | Curated IDs |
| --- | --- |
| [NASA/JPL: astronomical unit](https://cneos.jpl.nasa.gov/glossary/au.html) | 1 |
| [NASA: Moon facts](https://science.nasa.gov/moon/facts/) | 2, 21 |
| [NASA: Mars facts](https://science.nasa.gov/mars/facts/) | 3, 11, 12, 196 |
| [NASA: Jupiter facts](https://science.nasa.gov/jupiter/jupiter-facts/) | 4, 13, 14 |
| [NASA: Neptune facts](https://science.nasa.gov/neptune/neptune-facts/) | 5, 19, 20 |
| [NASA: Mercury](https://science.nasa.gov/mercury/facts/) | 6, 7 |
| [NASA: Venus](https://science.nasa.gov/venus/venus-facts/) | 8, 9, 197 |
| [NASA: Earth](https://science.nasa.gov/earth/facts/) | 10 |
| [NASA: Saturn](https://science.nasa.gov/saturn/facts/) | 15, 16 |
| [NASA: Uranus](https://science.nasa.gov/uranus/facts/) | 17, 18 |
| [NIST: SI prefixes](https://www.nist.gov/pml/owm/metric-si-prefixes) | 22, 23, 24, 25, 26 |
| [NIST: length](https://www.nist.gov/pml/owm/si-units-length) | 27, 28 |
| [NIST: time](https://www.nist.gov/pml/owm/si-units-time) | 29, 30, 31 |
| [RFC 791: IPv4](https://www.rfc-editor.org/rfc/rfc791) | 32, 33, 34 |
| [RFC 8200: IPv6](https://www.rfc-editor.org/rfc/rfc8200) | 35, 36 |
| [RFC 4648: base encodings](https://www.rfc-editor.org/rfc/rfc4648) | 37, 38, 39 |
| [NPS: Statue of Liberty](https://www.nps.gov/stli/learn/historyculture/statue-statistics.htm) | 40, 41, 42 |
| [US National Archives: Declaration](https://www.archives.gov/founding-docs/declaration-transcript) | 43 |
| [US National Archives: Constitution](https://www.archives.gov/founding-docs/constitution-transcript) | 44, 45, 46, 47 |
| [NPS: Washington Monument history](https://www.nps.gov/wamo/learn/historyculture/index.htm) | 48 |
| [NOAA GLERL: Great Lakes characteristics](https://apps.glerl.noaa.gov/coastwatch/webdata/statistic/physical.html) | 49, 50, 51 |
| [OpenStax: skeletal divisions](https://openstax.org/books/anatomy-and-physiology-2e/pages/7-1-divisions-of-the-skeletal-system) | 52, 53, 54 |
| [NHGRI: chromosomes](https://www.genome.gov/about-genomics/fact-sheets/Chromosomes-Fact-Sheet) | 55 |
| [NHGRI: introduction to genomics](https://www.genome.gov/About-Genomics/Introduction-to-Genomics) | 56, 57 |
| [San Diego Zoo: arthropods](https://animals.sandiegozoo.org/animals/arthropods) | 58, 59 |
| [San Diego Zoo: spiders](https://animals.sandiegozoo.org/animals/spider) | 60 |
| [Shakespeare Birthplace Trust: poems](https://www.shakespeare.org.uk/explore-shakespeare/shakespedia/shakespeares-poems/) | 61, 62, 63 |
| [NBA: scoring and timing](https://official.nba.com/rule-no-5-scoring-and-timing/) | 64, 65, 66, 67 |
| [IFAB Law 1: field of play](https://www.theifab.com/laws/latest/the-field-of-play/) | 68, 69, 70 |
| [IFAB Law 7: duration](https://www.theifab.com/laws/latest/the-duration-of-the-match/) | 71 |
| [IFAB Law 3: players](https://theifab.com/laws/latest/the-players/) | 72 |
| [FIDE: Laws of Chess effective 2023](https://handbook.fide.com/chapter/e012023) | 73, 74 |
| [ITF: 2024 Rules of Tennis](https://www.itftennis.com/media/7221/2024-rules-of-tennis-english.pdf) | 75, 76, 77 |
| [OpenStax: vertebral column](https://openstax.org/books/anatomy-and-physiology-2e/pages/7-3-the-vertebral-column) | 78, 79, 80 |
| [Shedd Aquarium: giant Pacific octopus](https://www.sheddaquarium.org/animals/octopus) | 81, 82 |
| [San Diego Zoo: giraffe](https://animals.sandiegozoo.org/animals/giraffe) | 83 |
| [Maryland DNR: bees](https://dnr.maryland.gov/wildlife/Pages/habitat/wabees.aspx) | 84, 195 |
| [Yamaha: piano keyboard](https://hub.yamaha.com/pianos/p-acoustic/why-arent-there-more-than-88-keys-on-a-piano/) | 85 |
| [Yamaha: violin strings](https://www.yamaha.com/en/musical_instrument_guide/violin/mechanism/mechanism002.html) | 86 |
| [Disney: Snow White and the Seven Dwarfs](https://movies.disney.com/snow-white-and-the-seven-dwarfs) | 87 |
| [Disney: Toy Story](https://movies.disney.com/toy-story) | 88 |
| [Lucasfilm: A New Hope](https://www.starwars.com/films/star-wars-episode-iv-a-new-hope) | 89 |
| [J.K. Rowling: author FAQs](https://stories.jkrowling.com/faqs/) | 90 |
| [United Nations: membership history](https://www.un.org/en/about-us/growth-in-un-membership) | 91 |
| [United Nations: preparatory years](https://www.un.org/en/about-us/history-of-the-un/preparatory-years) | 92 |
| [NASA: Apollo program](https://www.nasa.gov/learning-resources/for-kids-and-students/what-was-the-apollo-program-grades-5-8/) | 93, 94 |
| [Eiffel Tower operator: construction history](https://www.toureiffel.paris/en/news/history-and-culture/133-years-and-1083-feet) | 95 |
| [Eiffel Tower operator: stairs](https://www.toureiffel.paris/en/faq/spot/how-can-you-walk-eiffel-tower-foot) | 96 |
| [Statistics Canada: 2021 geographical glossary](https://www150.statcan.gc.ca/n1/pub/92-195-x/2021001/geo/prov/prov-eng.htm) | 97, 98 |
| [Statistics Bureau of Japan: map dated April 1, 2025](https://www.stat.go.jp/english/data/handbook/pdf/shjmap_a.pdf) | 99 |
| [Australian Parliamentary Education Office: federation](https://peo.gov.au/understand-our-parliament/your-questions-on-notice/questions/why-does-australia-have-6-separate-states) | 100 |
| [UK Parliament: Magna Carta](https://www.parliament.uk/magnacarta/) | 101 |
| [IOC: Athens 1896](https://www.olympics.com/ioc/news/athens-1896-the-revival-of-the-olympic-games) | 102, 103 |
| [RFC 20: ASCII](https://www.rfc-editor.org/rfc/rfc20) | 104, 105, 199 |
| [RFC 768: UDP](https://www.rfc-editor.org/rfc/rfc768) | 106, 107 |
| [RFC 1035: DNS](https://www.rfc-editor.org/rfc/rfc1035) | 108, 109 |
| [RFC 9562: UUIDs](https://www.rfc-editor.org/rfc/rfc9562) | 110, 111, 190 |
| [OpenStax: geometric formulas](https://openstax.org/books/prealgebra-2e/pages/c-geometric-formulas) | 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 144, 145, 146 |
| [OpenStax: permutations](https://openstax.org/books/contemporary-mathematics/pages/7-2-permutations) | 122, 123, 124, 147, 148 |
| [NIST: defining constants](https://www.nist.gov/si-redefinition/meet-constants) | 125 |
| [NIST: SI temperature scales](https://www.nist.gov/pml/special-publication-330/sp-330-section-2) | 126 |
| [NIST: periodic table](https://www.nist.gov/system/files/documents/2019/07/10/nist_periodictable_june_2019-nocrop.pdf) | 127, 128, 129, 130, 131 |
| [NPS: Grand Canyon FAQ](https://www.nps.gov/grca/faqs.htm) | 132 |
| [NPS: Denali park statistics](https://www.nps.gov/dena/learn/management/statistics.htm) | 133 |
| [Sydney Opera House: roof design](https://www.sydneyoperahouse.com/our-story/the-spherical-solution) | 134, 194 |
| [Panama Canal Authority: history](https://pancanal.com/historia-en-imagenes-canal-de-panama/) | 135 |
| [San Diego Zoo: ostrich](https://animals.sandiegozoo.org/animals/ostrich) | 136 |
| [Mississippi State Extension: ruminant digestion](https://cto.extension.msstate.edu/publications/understanding-the-ruminant-animal-digestive-system) | 137 |
| [OpenStax: heart anatomy](https://openstax.org/books/anatomy-and-physiology-2e/pages/19-1-heart-anatomy) | 138 |
| [NIDCR: adult dentition](https://www.nidcr.nih.gov/research/data-statistics/tooth-loss/adults) | 139 |
| [OpenStax: thoracic cage](https://openstax.org/books/anatomy-and-physiology/pages/7-4-the-thoracic-cage) | 140 |
| [American Red Cross: blood groups](https://www.redcrossblood.org/donate-blood/blood-types.html) | 141 |
| [The Pokémon Company: original Kanto species](https://www.pokemon.com/us/pokemon-tcg/scarlet-violet-151) | 142 |
| [Nintendo: Super Mario Bros. history](https://www.nintendo.com/jp/character/mario/en/history/smb/index.html) | 143 |
| [CERN: birth of the Web](https://home.cern/science/computing/the-birth-of-the-web/) | 149, 150 |
| [Smithsonian: 1903 Wright Flyer](https://www.si.edu/object/nasm_A19610048000) | 151 |
| [NASA: dawn of the Space Age](https://www.nasa.gov/history/dawn-of-the-space-age/) | 152 |
| [Library of Congress: Wright first flight](https://www.loc.gov/collections/wilbur-and-orville-wright-papers/articles-and-essays/collection-highlights/first-flight/) | 153 |
| [FIVB: volleyball basics](https://www.fivb.com/volleyball/the-game/basic-rules/) | 154 |
| [World Athletics: marathon](https://worldathletics.org/disciplines/road-running/marathon) | 155 |
| [World Rugby Law 5: time](https://passport.world.rugby/laws-of-the-game/laws-by-number/5-time/) | 156 |
| [World Rugby Law 3: teams](https://passport.world.rugby/laws-of-the-game/laws-by-number/3-team) | 157 |
| [NFL: football terms](https://operations.nfl.com/rules-officiating/nfl-football-basics/football-terms) | 158 |
| [IOC: Olympic rings](https://www.olympics.com/ioc/olympic-rings) | 159 |
| [European Commission: euro coins](https://economy-finance.ec.europa.eu/euro/euro-coins-and-notes/euro-coins/types-euro-coins_en) | 160 |
| [US Mint: circulating coins](https://www.usmint.gov/learn/coins-and-medals/circulating-coins) | 161 |
| [USPS: ZIP code history](https://news.usps.com/2017/08/22/zip-zip-hooray/) | 162 |
| [NIST: mass calibrations](https://www.nist.gov/system/files/documents/calibrations/sp250-31.pdf) | 163 |
| [National Research Council Canada: leap years](https://cnrc.canada.ca/en/certifications-evaluations-standards/canadas-official-time/what-years-are-leap-years) | 164, 191 |
| [Open University: musical staff](https://www.open.edu/openlearn/history-the-arts/music/an-introduction-music-theory/content-section-2.1) | 165 |
| [Chamber Music Society: Vivaldi](https://www.chambermusicsociety.org/about-the-music/compositions/vivaldi-four-seasons) | 166 |
| [Boston Symphony Orchestra: Beethoven](https://www.bso.org/works/beethoven-the-nine-symphonies) | 167, 185, 186 |
| [Yamaha: acoustic guitar](https://www.yamaha.com/en/musical_instrument_guide/acoustic_guitar/) | 168 |
| [Poetry Foundation: haiku](https://www.poetryfoundation.org/education/glossary/ha%C3%AFku-or-hokku) | 169 |
| [Emaar: Burj Khalifa](https://www.emaar.com/en/other-emaar-businesses/burj-khalifa) | 170 |
| [NOAA: ocean basins](https://www.noaa.gov/education/resource-collections/ocean-coasts) | 171 |
| [NOAA: longitude](https://oceanservice.noaa.gov/facts/longitude.html) | 172 |
| [Royal Museums Greenwich: prime meridian](https://www.rmg.co.uk/stories/time/what-prime-meridian-why-it-greenwich) | 173 |
| [Florida Museum: butterfly FAQ](https://www.floridamuseum.ufl.edu/discover-butterflies/faq/) | 174 |
| [Florida Museum: shark FAQ](https://www.floridamuseum.ufl.edu/discover-fish/sharks/faq/) | 175 |
| [San Diego Zoo: camels](https://animals.sandiegozoo.org/animals/camel) | 176 |
| [Hong Kong Observatory: Gregorian calendar](https://www.hko.gov.hk/en/gts/time/basicterms-leapyear.htm) | 177, 178 |
| [Golden Gate Bridge district: key dates](https://www.goldengate.org/bridge/history-research/moments-events/key-dates/) | 179 |
| [National Portal of India: independence](https://www.india.gov.in/explore-india/facts-of-india/independence-day/) | 180 |
| [Agência Gov: Brazilian independence](https://agenciagov.ebc.com.br/noticias/202609/conheca-a-historia-da-independencia-do-brasil) | 181 |
| [Berlin city government: opening of the Wall](https://www.berlin.de/en/history/8482274-8619314-opening-and-fall-of-the-berlin-wall.en.html) | 182 |
| [OpenStax: upper limb bones](https://openstax.org/books/anatomy-and-physiology-2e/pages/8-2-bones-of-the-upper-limb) | 183 |
| [OpenStax: lower limb bones](https://openstax.org/books/anatomy-and-physiology-2e/pages/8-4-bones-of-the-lower-limb) | 184 |
| [Monterey Bay Aquarium: cephalopods](https://www.montereybayaquarium.org/animals-the-ocean/animals-a-to-z/cephalopods) | 187 |
| [NASA: Sun facts](https://science.nasa.gov/sun/facts/) | 188 |
| [NPS: Statue of Liberty dedication](https://www.nps.gov/stli/learn/statue-of-liberty-facts.htm) | 189 |
| [OpenStax: combinations](https://openstax.org/books/contemporary-mathematics/pages/7-3-combinations) | 192 |
| [NOAA: Pacific Ocean basin](https://oceanservice.noaa.gov/facts/biggestocean.html) | 193 |
| [NBA Rule 7: shot clock](https://official.nba.com/rule-no-7-24-second-clock/) | 198 |
| [Disney: animated features list](https://www.disneystudioshelp.com/resources/Animated%20Features%20List.pdf) | 200 |

## Implementation inventory

* Lifecycle and constants: `db/question-lifecycle.mjs`,
  `src/features/game/question-status.mjs`; existing `db/question-validation.mjs`
  now supports the full topic set and corrects the generic-word duplicate heuristic.
* Persistence and scripts: `db/question-repository.mjs`, `scripts/questions.mjs`,
  `scripts/question-dataset.mjs`, `scripts/export-questions.mjs`, `package.json`.
* Schema and safe imports: `db/schema.sql`, `db/upgrade-question-lifecycle.sql`,
  `db/seed-statements.mjs`, `db/seed.mjs`, `db/export-seed.mjs`.
* Gameplay integration: `src/server/questions.mjs`,
  `src/features/game/validate-questions.mjs`, `src/app/page.js`,
  `src/app/api/questions/route.js`. Request-time boundaries prevent database reads
  during builds. No layout or game-rule changes.
* Dataset and documentation: `db/seed/questions.json`, `README.md`,
  `docs/question-service.md`, `docs/game-interface.md`, this audit.
* Automated checks: lifecycle, repository, validation, SQL export, operator CLI,
  offline dataset CLI, seed operations, server service and database integration tests.

The separate additive schema upgrade conservatively maps legacy approved rows to
validated. The explicit `--promote-validated` SQL option can apply the checked-in
curation evidence only when immutable content matches; default imports refuse status
conflicts. Neither path overwrites content or primary keys. Review the maintenance
window and exact commands in [Question service](question-service.md).

## Verification results

* `npm test`: **85 passed**, zero failures. Includes offline CLI round trips and the
  existing game/challenge/API tests.
* `npm run test:db:local`: **9 passed**, zero failures, on an isolated PostgreSQL 18
  cluster. Confirms 200-row repeat imports, preserved FK history and identity high
  water, atomic conflict failure, all-status SQL, Unicode/quotes/backslashes/nulls,
  explicit reviewed promotion, validation/curation/demotion, duplicate concurrency,
  and idempotent legacy schema upgrade. The initial sandbox prevented binding the
  local port; the same isolated test ran successfully with local-network permission.
* `npm run lint`: passed.
* `npm run build`: passed with an explicit dummy loopback database URL; no database
  queries occurred during prerendering after the request boundaries were added.
* `npm run --silent questions:dataset -- check`: generated **0**, validated **0**,
  curated **200**, contiguous curated IDs.
* Export commands for curated, validated, generated, all, and explicit legacy
  promotion produced reviewable SQL files under the ignored `db/exports/` directory.
* `git diff --check`: passed.

No production connection, deployment, schema application or data import was performed.
No unrelated local database was reset. Browser layout tests and the optional `.env`
database tests were not run; the UI was unchanged and real API/database behavior was
covered in the disposable cluster. Production compatibility still requires the
operator's manual schema inspection and separate schema/data execution described
above. No known implementation test failures remain. Next.js feedback candidates
were reviewed at completion; none qualified for framework reporting.
