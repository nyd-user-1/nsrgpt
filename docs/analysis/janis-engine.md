# JANIS as the engine: how JANIS builds a book page (brief 77, step 2)

Source: JANIS 4.1 (Java Web Start build, `Janis.jar` built 2023-07-24, held in `lake/_raw/janis-software/janis/webstart/`),
read as decompiled classes (CFR 0.152; kept in the lake only, `lake/_work/janis/engine/janis-src.tgz`), and the JANIS 4.0
User's Guide rev. 1 (October 2013). Class names below are JANIS's; page numbers are the guide's.

## 1. The program has its own book generator
- `org.nea.janis.book.BarnBook.main`: `<connection label> <output types> <threads> <book> <book options>`, output types
  `PDF`, `XML`, `JNS`; book `OFFICIAL` with `<n|p|d|t|h|a|g>`. This is how NEA makes the JANIS Books.
- `BarnBookXMLPersistence` writes what JANIS Web's book reads: the navigation (`saveNavigation`, the rails) and one XML
  per page (`savePage`, the page's `PlotterState`, integral-data rows and Q-value rows), plus one JNS per page
  (`savePageAsJNS`, the same saved-state format as the 2020 archive and JANIS Web's `saveState.xml`).
- Hidden command-line mode `-barnbookpage <connection> <particle> <nuclide> <MT> [library]` builds one page the same way
  (`CommandLineModeBarnbookPage`, EXFOR not required, no Q-value table).
- Other command-line modes (`CommandLineParser.printUsage`): `-render <jns> [p0|t0] <png|csv|tsv>` (restores a JNS and
  writes the plot or a table), `-table <refs>` (JANIS's Tabler on one node, X values from the data), `-search <conn>
  <endf|exfor|cinda|resonances|decay> <params>`, `-list <refs>`.

## 2. The book's fixed options (`BarnBookOptionsOfficial.setupHardCodedOptions`)
- Libraries, in this order, each with its line colour (all 1.0 px solid): EAF-2010 `#000080`, ENDF/B-VIII.0 `#ff0000`,
  JEFF-3.3 `#ff69ff`, JENDL-4.0u `#32cd32`, JENDL/AN-2005, JENDL/DEU-2020, JENDL/HE-2007, JENDL/PD-2016.1 (all
  `#0a6e1e`), BROND-3.1 `#cc0099`, CENDL-3.2 `#ffa500`, IAEA/PD-2019 `#f57d46`, IRDFF-II `#f57d46`, PADF-2007 `#966432`,
  TENDL-2019 `#4169e1`. The same list is the integral-data list (`setInterLibraries`).
- EXFOR included and required (a page exists only where EXFOR has a set), EXFOR colours by age (`EXFORColorStrategyAge`).
- Reactions: the MT list in `setupHardCodedOptions` (MT 1, 2, 4, 11, 16 … 200, 102–117, 152–200) with JANIS's outgoing
  labels; for charged particles and photons MT 1 and 2 are dropped and MT 4's label is `n`. Page title
  `<nuclide> (<particle>,<outgoing>)`, plus ` or <product> production` where the reaction has a residual
  (`PlotterThread.buildPlotTitle`, `BarnBookItemKey.getReactionProduct`, never for MT 2).
- X variable E, X and Y ranges automatic, Y dimension "Cross section" in barns, 1024 × 768, legend at most 20 EXFOR sets
  (`setNbLegendMax(20)`), plotter settings `barnbookweb` from `org/nea/janis/book/janis_barnbook_settings.properties`.

## 3. Which pages exist (`BarnBookMainThread`)
- One ENDF search over the 14 libraries, MF 3, 6 and 10, the book's MTs and MT 5 (`searchENDF_MF3Or10_MF6MT5`). For
  each (material, MT, library):
  - MF 3 and MF 10 both given: skipped ("MF3 and MF10 !!");
  - MF 3 and an MF 6 MT 5 product: computed `MF3+MF6MT5` = MF 3 + the MT 5 production cross section of the residual,
    summed over ground and first isomer (`buildMF3PlusMF6MT5`, `DataFunctionLinearCombination`);
  - MF 3 only: the MF 3 cross section;
  - MF 10 (MT 18 only) with or without MF 6 MT 5: `MF10+MF6MT5` or MF 10;
  - MF 6 MT 5 only: the residual's `Production cross section` (one state) or `MF6MT5`, the sum over states;
  - MT 2 never takes MF 6 MT 5. The residual is `ENDF_DatabaseIdConverter.determineZAProduct`; states 0 and 1 are
    tried (`retrieveMF6MT5Products`).
- MT 4 where a library has MT 50–91 but no MT 4: computed `Sum(MT50-91)` (`searchENDF_MF3_MT50to91`).
- EXFOR per item (`searchEXFOR_SF3_MT` and `searchEXFOR_SF3_X_SF4`): quantity `CS`/`,SIG`, the projectile, the
  reaction's SF3 codes (`EXFOR_DatabaseIdConverter.MT_to_SF3`), and SF3 = X with SF4 = the residual. A set is kept
  (`isEXFORRetained`) only if: its plot type fits, status is not OUTDT or SPSDD, its reaction is a single component, no
  general modifier FCT, MSC, RAW, REL, A, (A), DAM or BRA, one independent variable, X in energy units. Then
  (`PlotterThread.filterEXFORData`) a set with a partial-reaction SF4 (not a nuclide) or a fission-product yield
  (SF3 = F with SF4) is dropped.
- Items with no EXFOR set are removed (EXFOR required). Pages are the remaining items in `BarnBookItemKey` order:
  datatype, material, reaction.

## 4. How a page is drawn (`PlotterThread.buildPlotterState`)
- EXFOR sets first, sorted by reference year (missing = 1900), then first author. Mark shape: one set `CrossDiag`;
  several sets cycle `PlotMark.getAvailablesShapes()` from the second shape on. Mark size by point count: > 1,000
  points `FilledSquare` 0.2; > 500: 1.0; > 100: 2.0; > 10: 2.5; else 3.0. Error bars off (`setShowXErrors(false)`,
  `setShowYErrors(false)`).
- EXFOR colour by reference year (`EXFORColorStrategyAge`): none `DARK_GRAY`; ≤ 1959 black; ≤ 1969 `#0000b2`; ≤ 1979
  `#4141ff`; ≤ 1984 `#00a000`; ≤ 1989 `#0ac652`; ≤ 1994 `#c2c06c`; ≤ 1999 `#ffb400`; ≤ 2004 `#ff7a00`; later red.
- EXFOR legend `<first author> <year>` (or the accession number where JANIS lacks them); all EXFOR legends empty when
  the page has more than 20 sets.
- Evaluated series after EXFOR, libraries walked from the end of the list to the start (TENDL-2019 first, EAF-2010
  last); legend = the library's name, plus ` *` for a computed sum (`DataFunctionLinearCombination`); a series from
  MF 6 (production) is drawn dashed (stroke 3,2) in the library's colour.
- Axes log-log; X and Y ranges automatic, then X min floored to a power of ten
  (`10^floor(log10(min) + 0.001)`).
- The JANIS Books page (oecd-nea.org/jcms/pl_44624) states the same: full lines for MT cross sections, dashed for MT 5
  production, '*' for JANIS's operations, EXFOR by year and first author, legend dropped over 20 sets.

## 5. The rails (`BarnBookItemNavigator.buildOutline`)
- "By nuclide": element `<Z>-<Sym>` → nuclide `<Z>-<Sym>-<A>[m|n]` (`Nat` for A = 0) → leaf `MT<mt> <label>`
  (`ReactionId.getMTLabel`), in page order. "By MT": MT → element → nuclide. A page's own rail expands only its
  element and nuclide.

## 6. Data
- A library is a JANIS base: H2 1.3.160 (`h2-1.3.160.nea.jar`) indexing the files in a DataPack folder
  (`database/local/LocalBaseId`: `LOCAL:label=…|root=<DataPack>|url=jdbc:h2:<path>|user=janis|password=janis`;
  README_janis.md's Load dialog). janis/data's packages ship the DataPack files only (`.jpk` = JANIS Packed ENDF/EXFOR,
  `.inter.zip` = INTER integrals, `.boxer.zip` = covariances); the index is built by JANIS's importer
  (`org.nea.janis.format.tools.Import`, the Import wizard's engine; formats ENDF, EXFOR, INTER, BOXER, GENDF, NUBASE).
- Values: what JANIS plots is the node's `PlotProducer`; its numbers are JANIS's Tabler (`TablerState` with
  `setUseXValuesFromData(true)`, exported by `ExportTypeCSV`, as `-table` does).
- JANIS's factory settings connect to the NEA remote base only (`basespool.url.1=HTTP:label=NEA|url=http://www.oecd-nea.org/`).
