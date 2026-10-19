# Study Schema Builder: requirements and scenarios

This document states **what the diagrams must achieve and why**, independent of how they're implemented. It's the basis for prioritising and accepting work.

- **Read this first.** [`layout-behaviour-spec.md`](layout-behaviour-spec.md) describes how the current prototype meets these requirements. It's **one reference implementation**, not a requirement in itself: its algorithms, thresholds and visual devices may be replaced if the outcomes below are met.
- **Status:** draft for review with the tech team, October 2026. Items marked **[to confirm]** need a product decision.

---

## 1. The problem

Every clinical trial protocol, clinical study report, publication and slide deck about a study needs a **study design figure**: who enters, how they're assigned, what each group receives, in what order and for how long, and when the key outcomes are measured.

Today these figures are drawn by hand in PowerPoint or Visio. That causes four problems:

1. **Slow and inconsistent.** Every team draws differently, and every protocol amendment means redrawing.
2. **Doesn't fit the destination.** Protocols and reports are portrait Word pages, slides are landscape, and journal figures are narrow. A figure drawn for one rarely fits another without being redrawn or shrunk until it's unreadable.
3. **Missing required content.** Reporting guidelines expect specific elements (e.g. CONSORT: numbers at each stage with reasons for exclusion; SPIRIT/ICH M11: allocation, interventions, period timing). Hand-drawn figures often omit some.
4. **Hard to keep correct.** A figure drawn from the protocol text drifts out of sync with it.

The product generates these figures from the study description, keeps them **legible on the page they're destined for**, and lets authors **edit** them before export.

## 2. Users and where the figures go

| User | Typical figure | Destination and page | What matters most |
| --- | --- | --- | --- |
| Protocol author / medical writer | Trial schema (ICH M11 section 1.2, SPIRIT) | Word protocol: **portrait** A4/Letter; landscape sections are possible but less welcome | Fits one portrait page, legible, matches protocol wording |
| Clinical scientist / study lead | Schema, participant flow | Slides: **16:9 landscape** | Clear at a glance, editable in PowerPoint |
| Publication author | Participant flow (CONSORT, STROBE, PRISMA) | Journal figure, often a **narrow portrait** column | Conventional layout reviewers recognise; numbers and reasons visible |
| RWE epidemiologist | Design diagram (index date, time windows), attrition flow, treatment lines | Protocol (HARPER), report, publication | Timing relative to the index date unambiguous; selection steps auditable |
| Consensus-study lead | Delphi process, participation per round | Protocol, publication (ACCORD) | Rounds, feedback and participation clear |

## 3. Key scenarios and expected outcomes

Each scenario states the context, what the diagram must communicate, what that implies for the representation, and the expected outcome. *Implications* describe the representation the content demands. They aren't a prescribed visual design: other designs are acceptable if they communicate the same things equally clearly.

### S1. Randomised trial schema in a Word protocol (portrait page)

- **Context:** a medical writer places the trial schema in protocol section 1.2. The page is portrait A4 or Letter.
- **Must communicate:**
  1. who enters (population, planned N)
  2. how participants are assigned (randomisation, ratio, stratification factors)
  3. what each arm receives
  4. the order and duration of study periods (screening → treatment → follow-up)
  5. when the primary endpoint is assessed
- **Therefore:**
  - the diagram reads in **one direction that represents time**
  - periods appear as **ordered, labelled groups** with their durations
  - the **assignment point is visibly distinct**
  - **parallel arms appear side by side** at the same point in time, so they read as concurrent
- **Expected outcome:** the whole schema fits one portrait page with legible text. If a horizontal arrangement can't be legible on portrait, the system **rearranges** it (e.g. top-to-bottom) or tells the user. It doesn't shrink the figure below the legibility minimum.

### S2. The same schema on a slide (landscape)

- **Context:** the study lead presents the design on a 16:9 slide.
- **Must communicate:** the same content as S1, quickly.
- **Therefore:** left-to-right reading on one row when it fits legibly. The figure must be **editable in PowerPoint** (real shapes and text, not a picture) so last-minute wording changes don't need a redraw.
- **Expected outcome:** switching the target page from portrait to landscape **re-arranges** the figure to use the page, rather than rotating or shrinking it. The content is unchanged.

### S3. A long study journey (many periods)

- **Context:** an oncology trial with screening, treatment, end of treatment, follow-up, open-label extension and long-term extension (e.g. TITAN).
- **Must communicate:** the full sequence in the right order, which period each step belongs to, and each period's duration.
- **Therefore:**
  - when one line would be too small to read, the sequence **continues on further lines** in reading order rather than shrinking
  - each period stays visibly one group; if a period has to continue on the next line, that's **marked as a continuation**
  - the reader can follow the path from one line to the next without ambiguity
- **Expected outcome:** text stays above the legibility minimum. Order, grouping and continuity are unambiguous. The same schema re-arranges sensibly for portrait and for landscape.

### S4. Participant flow for a randomised trial publication (CONSORT)

- **Context:** a publication or study report needs the CONSORT flow diagram.
- **Must communicate:**
  - numbers at each stage: assessed, excluded with reasons, randomised, allocated, lost to follow-up or discontinued, analysed
  - the progression of **each arm separately** after randomisation
- **Therefore:**
  - the **main path is uninterrupted**
  - exclusions branch off **beside** the stage they leave from, so the main path stays readable
  - the four CONSORT stages (enrolment, allocation, follow-up, analysis) are labelled
  - arms run in parallel
  - the conventional top-to-bottom arrangement must be available, because reviewers expect it
- **Expected outcome:** recognisable as a CONSORT diagram. Counts can be filled in or edited, and placeholders are obvious. It fits a portrait page.

### S5. Cohort selection in a database study (STROBE / RECORD)

- **Context:** an RWE study selects its cohort in many sequential steps from claims or EHR data.
- **Must communicate:** each selection step in order, the number remaining after each step, and the number excluded with the reason. Then the split into exposure groups.
- **Therefore:** a sequential chain with exclusions beside each step. Long chains continue on further lines (as in S3) rather than shrinking.
- **Expected outcome:** every exclusion can be traced to the step it belongs to, and the attrition can be audited against the protocol.

### S6. Longitudinal design diagram (RWE, around an index date)

- **Context:** a HARPER-style protocol or RECORD-PE report needs the design diagram.
- **Must communicate:** the index date (Day 0) and the **timing of each window relative to it**: washout, exclusion and covariate assessment, exposure, follow-up with its end/censoring rule.
- **Therefore:**
  - a shared time reference with Day 0 clearly marked
  - every window shows its day range
  - open-ended follow-up is visibly open-ended
  - **readability of short windows takes priority over proportional scale**; exact day ranges are always printed
- **Expected outcome:** a reader can tell, for any window, when it starts and ends relative to the index date.

### S7. Trials where cohorts change treatment over time

- **Context:** randomised withdrawal, delayed start, stepped-wedge, crossover at progression, extensions.
- **Must communicate:**
  - which group receives what **at which time**
  - where groups split or are re-randomised, with the ratio
  - key milestone times (e.g. response assessment)
  - the overall time span
- **Therefore:**
  - groups shown as **parallel tracks on a real time scale**
  - movements between tracks shown explicitly
  - long uneventful stretches may be **compressed, provided the compression is marked** so the scale isn't misread
- **Expected outcome:** the reader can reconstruct each group's treatment sequence and its timing.

### S8. Treatment patterns (lines of therapy)

- **Context:** an RWE study describes how patients move from first-line to later lines of therapy.
- **Must communicate:** the order of lines, the regimens within each line, the event that moves patients to the next line, and which regimen is the study's focus.
- **Expected outcome:** lines read in order, with transitions visible.

### S9. Expert consensus study (Delphi)

- **Context:** a consensus study protocol or publication (ACCORD).
- **Must communicate:** panel recruitment, the sequence of rounds with feedback between them, optional rounds, the consensus meeting, the consensus definition, and participation per round.
- **Expected outcome:** the process and participation are clear. Optional steps are visibly optional.

### S10. Changing page orientation after editing

- **Context:** a user has edited texts, colours and some positions, then decides the figure must go on a portrait page instead of a slide.
- **Must communicate:** unchanged content.
- **Expected outcome:**
  - texts, colours, shapes and connections are **preserved**
  - the arrangement adapts to the new page
  - the user knows beforehand which actions re-arrange the figure; manual position tweaks that can't be kept are recoverable with **Undo**
  - **no content is ever silently lost**

### S11. The user overrides the automatic choice

- **Context:** the system picks an arrangement, but the author needs a specific one (e.g. horizontal for a slide master, or the conventional vertical CONSORT).
- **Expected outcome:**
  - the user's explicit choice of direction, page orientation or number of rows is **respected and never overridden automatically**
  - if that choice makes text too small, the system **warns** rather than changing it

### S12. A schema grows during drafting

- **Context:** arms, periods or longer labels are added as the protocol matures.
- **Expected outcome:**
  - the figure stays coherent: groups intact, order preserved, consistent spacing and alignment
  - it stays legible by re-arranging (more lines, other orientation) before text falls below the minimum
  - when legibility can't be achieved on the target page, the user is told **how small the text will print** and what would help

## 4. Requirements

Priority: **Must** = needed for the product to be useful; **Should** = expected, can follow; **Could** = valuable later.

| ID | Requirement (outcome) | Priority | Acceptance (observable) | Scenarios |
| --- | --- | --- | --- | --- |
| R1 | **Target page.** The user can choose the target page and orientation: portrait or landscape, A4, Letter or 16:9 slide. | Must | Each option can be selected; the preview and export use it. | S1, S2, S10 |
| R2 | **Re-arrange for the page.** Changing orientation re-arranges the figure to use the page; it doesn't merely scale or rotate it. | Must | A schema that fits landscape on one row produces a different, legible arrangement on portrait. | S1, S2, S10 |
| R3 | **Legibility floor.** Printed text on the target page must not fall below an agreed minimum **[to confirm: 8 pt proposed]**. If unavoidable, the user is warned with the expected print size. | Must | The export dialog shows the printed size; a warning appears below the minimum. | S1–S3, S12 |
| R4 | **One reading direction.** Each figure reads in one consistent direction that represents sequence or time. Arrows don't run backwards except for genuine loops. | Must | No backward arrows in generated layouts of the reference set (§6). | S1–S5 |
| R5 | **Groups stay intact and ordered.** Every node of a period/stage/line stays within its group's visual area. Groups appear in chronological order, labelled with name and duration. | Must | Each node is inside its group area; group order equals period order. | S1, S3, S4 |
| R6 | **Growth by continuation, not shrinking.** When content exceeds the page at legible size, the figure continues on further lines (rows or columns) in reading order. | Must | Long reference schemas produce more than one line with text at or above the minimum. | S3, S5, S12 |
| R7 | **Visible continuation.** A group continuing on the next line is marked as continued. The path between lines is unambiguous: one clear connector, no crossing of content. | Must | The continued group is labelled; the connector enters the next line without crossing boxes. | S3, S5 |
| R8 | **Branches beside the main path.** Side information (exclusions, notes) is placed beside the step it belongs to, without interrupting the main path or overlapping other content. | Must | No overlaps; each exclusion is adjacent to its step. | S4, S5 |
| R9 | **Concurrent items side by side.** Parallel arms/cohorts at the same point in time are aligned side by side. | Must | Arms share a column (horizontal) or row (vertical). | S1, S4 |
| R10 | **User choice wins.** Explicit choices of direction, orientation and number of lines are never overridden automatically. | Must | After an explicit choice, no automatic action changes it. | S11 |
| R11 | **No silent loss of edits.** Texts, colours, shapes and connections survive re-arrangement. Any re-arrangement that resets manual positions is predictable and undoable in one step. | Must | Edit, re-arrange, undo once → identical figure. | S10 |
| R12 | **What you see is what you export.** Word, PowerPoint (editable shapes), PNG and SVG match the screen, on the page orientation chosen. | Must | Visual comparison of screen and exports on the reference set. | S1, S2 |
| R13 | **Required content per diagram type.** Each diagram type contains the elements the applicable guideline expects (e.g. CONSORT stages and counts; SPIRIT/ICH M11 allocation, interventions, period timing; design-diagram windows relative to Day 0). | Must | Guideline checklist passes for the reference set. | S1, S4–S9 |
| R14 | **Sensible automatic default.** Without explicit choices, the system picks the arrangement that's most legible on the natural page for the reading direction (horizontal → landscape, vertical → portrait), preferring fewer lines when legibility is similar. | Should | Defaults on the reference set meet R3 where physically possible. | S1, S2, S12 |
| R15 | **Conventional layouts available.** Recognised conventions (top-to-bottom CONSORT/PRISMA, Day-0 design diagram) are available. | Should | Each convention can be produced. | S4, S6 |
| R16 | **Time scale with marked compression** for time-based diagrams. | Should | Compressed intervals are marked on the axis and explained in a note. | S6, S7 |
| R17 | **Explain automatic changes.** When the system re-arranges for legibility (more lines, other direction), it says what it did. | Should | Info text names lines, orientation and print size. | S11, S12 |
| R18 | **Pin manual positions** so they survive re-arrangement. | Could | Pinned boxes keep their position. | S10 |

The team's summary maps onto this as follows:

| Team's summary | Requirements |
| --- | --- |
| Support for portrait and landscape layouts | R1, R2, R14 |
| Improved wrapping and positioning of nodes within groups | R5–R9 |
| A visually coherent layout that stays readable as schemas grow | R3, R4, R6, R7, R12, R17 |
| *Additionally* | R10, R11 (never surprise the user or lose work) and R13 (guideline content) |

## 5. What is fixed and what is open

**Fixed (business requirements):**
- one page per figure on the chosen target page
- a legibility floor, with a warning when it can't be met
- one consistent reading direction representing time or sequence
- groups intact and chronological, continuations marked
- side information beside, not inside, the main path
- user choices respected
- no silent loss of edits
- faithful, editable exports
- guideline-required content present

**Open (implementation choices for the team):** the reference implementation chose the items below. Each may be replaced if R1–R18 are still met.

| Topic | Prototype's choice | Freedom |
| --- | --- | --- |
| Layout engine | ELK layered with phases as partitions | Any engine or custom algorithm |
| Exact thresholds | Keep one line if ≥ 9 pt; switch only if > 10 % larger; tie zone 7 % | Tune freely; only the legibility floor (R3) is a requirement |
| Maximum lines | 4 | Product decision **[to confirm]** |
| How lines are cut | Scoring (widest line, crossing arrows, phase splits, side boxes, evenness) | Any method meeting R5–R7 |
| Connector between lines | Runs along a lane, enters the next line from outside the group area | Any unambiguous connector (R7) |
| Automatic direction switch | Auto may switch horizontal ↔ vertical when unlocked and clearly more legible | Could instead **suggest** the switch **[to confirm]** |
| Group visuals | Tinted bands, outlines or label chips; "(cont.)" suffix | Any visual meeting R5/R7 |
| Box sizing | Default widths 190/250 px; heights from text | Free |
| Position resets | Re-arrangement recomputes positions; direction change resets manual sizes and arrow attachments | Free, provided R11 holds (undo, no content loss); R18 can remove resets |
| Timeline direction | Horizontal only | Could add vertical **[to confirm]** |

## 6. Reference set for acceptance

Accept work against **real and synthetic studies**, not just templates:

- **Real synopses:** Amivantamab (prospective cohort), Delphi bladder cancer (consensus), secondary RWE comparative effectiveness (retrospective cohort), TITAN (long oncology RCT).
- **Synthetic designs** (built-in templates or test synopses): parallel RCT, crossover, dose escalation + expansion, basket trial, stepped-wedge, randomised withdrawal, RWE new-user cohort, case-control, external control, treatment patterns, diagnostic accuracy, systematic review.

For each, check every page in portrait and landscape against R3–R13. The README gallery shows the prototype's output for most of these.

## 7. Open questions for decision

1. **Legibility floor:** is 8 pt the right minimum for protocols, or should it follow journal requirements (often 6–8 pt at final size)?
2. **Target pages:** is A4, Letter and 16:9 the complete set, or are journal column widths needed?
3. **Automatic direction change:** may the system switch the reading direction itself, or only suggest it?
4. **Manual positions:** is pinning (R18) needed for the first release, or are undo plus predictable resets enough?
5. **Maximum number of lines** before warning instead of wrapping further.
6. **Timelines:** is a vertical (top-to-bottom) timeline needed?
