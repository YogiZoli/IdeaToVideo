# The scene catalog and how scenes are planned (DECISIONS 130)

Why this exists: every video looked like the same slide deck, and scenes often
did not match what was said, because the planner only had 14 of the 234
HyperFrames registry components. Now the app ships all 234, knows what each one
is for, and plans in two steps.

## 1. All 234 components, pinned

- `library/components.json` lists all 234 components at the pinned commit
  (`9a27b9f`). `scripts/fetch-library.mjs` downloads them at build time,
  checks every file against `library/library.lock.json` (SHA256), and stops
  the build on any mismatch.
- The licence check: a component with no licence of its own is under the
  registry's Apache-2.0. One with another licence (`kinetic-center-build`,
  MIT) and every font file a component carries must be listed in
  `components.json` "licenses", or the build stops. `THIRD-PARTY-NOTICES.md`
  names them (`scripts/notices.mjs`).
- Nothing is ever deleted. A component that does not work is "off" in the
  catalog, with the reason.

## 2. The catalog file

`library/catalog.json` (shipped as `library/CATALOG.json`) has one entry per
component:

| field | what it says |
|---|---|
| status | `on` or `off`, and `off`: the reason |
| role | opening, statement (key sentence), emphasis (highlight), proof, list, diagram, quote, transition, closing |
| shows | what the viewer sees |
| fitsWhen | the kind of sentence it fits |
| needs | text, number, image, recording |
| strong, weak | what it does well, where it fails |
| example | a sentence it fits well |
| tests | the result per test topic |

It is written from the component's own files and from its test renders, not
from guesses: `scripts/catalog/notes.json` holds the text, written while
looking at each component's file and its contact sheets;
`scripts/catalog/build-catalog.mjs` joins it with the test results.

The planner only uses a component that is `on`, is not a transition, and needs
nothing the app cannot give it (an image or a screen recording it cannot put
into a registry component).

## 3. How every component was tested

`scripts/catalog/test-components.mjs` builds each component as a one-scene
video with the app's own assembler, for two test topics with two looks:

- groceries: "saving money on groceries", the coral look (light),
- sleep: "sleeping better", the broadside look (dark).

Each one goes through `hyperframes lint`, `hyperframes check`, three stills
(just in, the middle, just before the end) and a draft render. The contact
sheets put the two topics side by side, so they show whether a component
follows the words and the Brand.

A component is off when it fails any test in either topic, when its finished
frame is empty, when it draws the same picture for both topics, or when its
stills show its own fixed content or its own colours instead of the topic and
the Brand. The check judges each scene once it has landed, the same moment the
app's build gate judges it.

Result (2026-10-28): 25 of 234 on. Off: 72 paste-in recipes (not mountable
scenes), 48 failing the check in their finished state, 1 failing lint, 19
with an empty finished frame or the same picture for both topics, 69 showing
their own fixed content, placeholders or their own colours and fonts. To test
again after a registry update:

```text
node scripts/catalog/test-components.mjs --work <folder> --jobs 4
node scripts/catalog/build-catalog.mjs --results <folder>/results.json
```

## 4. Planning in two steps

1. Step one: the AI reads the whole catalog (every `on` component, every
   field) and the sentences. It decides where the scenes are and gives every
   scene its 3 to 5 best candidates, best first.
2. Step two: the AI reads the full code of those candidates (markup, style,
   script and variables), picks the one that fits the meaning of the
   sentence best, fills in its variables from the sentence's words, and says
   in one line why. Long videos go in parts, so each call stays readable.

Every answer is checked (coverage, lengths, variables, on-screen words,
variety) and repaired up to twice. The scene table shows the reason under
each scene, and the swap list offers the planner's other candidates first.

## 5. Variety

- Never the same component twice in a row (a hard rule since DECISIONS 130).
- One component at most `max(2, scenes / 12)` times in one video.
- Across the channel: `<identity>/scene-history.json` keeps the components of
  the last videos; the catalog tells the planner how often each was used
  lately, and it ranks the less used one first when two fit equally.

## 6. The picture check after the build

After the build and the engine's own checks, the AI looks at two frames of
every scene (past the middle, and just before the end), as the render engine
draws them, and judges: does the picture fit what is said, and does it read
well. A scene that fails is swapped for its next candidate, filled from that
candidate's code, rebuilt, and only that part is drawn and judged again (at
most two rounds). Then the video renders once. The report is shown on the
Preview tab and kept in `review/visual-check.json`.

## 7. The price comes first

Planning, a swap, a change asked for and the picture check are paid AI calls.
Each shows its price before it runs, from `runner/providers/prices.mjs`
(USD per million tokens; Gemini prices are from third-party price pages and
are marked as a guess). Autopilot asks too, before the plan and before the
picture check.

## 8. The look

The look always comes from the Identity's Brand. Block packs (hand-made scene
types, such as the ZG archetypes) are no longer planned; a scene table that
already uses them still builds, always in the Brand's colours and font.
