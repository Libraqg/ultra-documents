# components — what the parts are, before anything colours them

A component is defined here by its **shape and its job**. What it looks like is
the style's answer, and every entry in `style/` gives its own. That split is the
point: a stat tile is a stat tile in `paper` and in `technical`, and swapping the
style should change how it reads, never what it is.

**This list is open.** What follows is what to reach for when nobody has
said otherwise, not the set of components a doc is allowed to contain. Take one,
adapt it, or write something that is not here at all — see "Writing a component
that is not on this list" below. An agent bringing its own design system is
composing with these defaults, not fighting them.

## Where each decision lives

| Question | Answered by |
|---|---|
| Which component fits this data? | `visuals.md` |
| What is that component, structurally? | this file — or your own, see below |
| What colour, stroke, type, texture? | `style/<name>.md` |
| Which sections does the doc have? | the prompt, or a `structure/` entry |

A style that starts inventing components has crossed into this file's territory,
and a component that hardcodes a hex colour has crossed into the style's.

## Page blocks

**Diagram box** — the scroll wrapper every wide figure sits in, so a phone
scrolls it instead of squashing it.

```html
<div class="diagram-box" data-tdoc-artifact>
  <svg viewBox="…" role="img" aria-label="…">…</svg>
  <p class="cap">One line on what the reader should take from it.</p>
</div>
```

`data-tdoc-artifact` makes the whole block one comment anchor rather than
leaving the reader to comment on fragments of its text.

**Table** — one bordered card, ruled inside, with nothing filled. A hairline
under each row does the work of separating them; a header sits in the muted ink
rather than a tinted band, and numbers are tabular so a column lines up.

```html
<div class="tdoc-table-scroll">
  <table> … </table>
</div>
```

```css
/* The reader styles every cell as a standalone chip, and a chip survives any
   rule that does not name the two properties making it one. Name them. */
.wrap th, .wrap td { background: transparent; border-radius: 0; }
```

The header is a label, so it takes the style's `label-type` register rather
than a smaller, greyer version of the body. Set at body size in the muted ink
it reads as a quieter row instead of a different kind of row; in the label
register it is unmistakable at a glance, whatever its size.

Under it goes a rule in `ink`, heavier than the hairlines between rows. That
separation is structural rather than typographic, which is why it is worth
spending: the register already carries every typographic signal available —
case, tracking, size, face — so making the header bolder or darker competes
with the body text on an axis that is used up. A rule does not. A hairline in
the same weight as the row rules below is not a header rule at all; the eye
reads the header as one more row.

**Square corners.** No radius on the table and none on its cells. A rounded
card competes with the figures around it, and a radius on the cells is worse
than decorative: under `border-collapse: separate` each cell is its own box, so
a rounded one truncates the row rule at both ends and two of those meeting in
the middle read as a break in the line rather than a continuous edge to scan
down.

Filling every cell and spacing them apart has the same effect for a different
reason: the gutters cut the columns, leaving nothing continuous to follow. A
fill is also the worst case for this reader — dark mode is a whole-page invert,
so a filled cell becomes a slab where a hairline only changes colour.

Reset the cell's own shape, not only the parts you are changing. A rule that
sets borders and padding alone comes out filled and rounded anyway, because the
fill and the radius are separate properties and nothing in that rule mentions
them. This is the one part of a table that a document cannot leave unsaid: name
both.

**Tabular is a numeral feature, not a smaller face.** A column of figures lines
up because the figures are tabular, and that costs nothing:

```css
.num { font-variant-numeric: tabular-nums; }
```

Buying the same alignment with a smaller size or a monospaced family costs two
things instead. The column ends up set differently from the ones beside it, so
the type changes size mid-row for no reason the reader can see; and a
monospaced family carries no CJK, so Chinese in that column falls back and
renders as the same typeface at two sizes, one column apart.

The class also has to sit on what it describes. `.num` on a `<td>` holding a
sentence is a claim about that cell that is not true — and if it carries
`white-space: nowrap`, the sentence can never break and the table takes a width
no viewport can give it, pushing the whole page sideways. Put the class on the
numerals (`<span class="num">$1.4B</span>`), not on the cell that contains them.
Never put a class that narrows type or forbids wrapping on a cell of prose.

**Atomic values and prose have different wrapping needs.** Tabular numerals
do not keep a number together with its unit. For a cell that is one value, use
`<td data-tdoc-cell="value"><span class="num">5</span> days</td>`.
Use the same attribute for a price, date, compact status or identifier; do not
mark a paragraph as a value. Keep paragraph cells normally wrappable. Do not
assign one first-column percentage to every table: an ID column and a prose
column have different intrinsic widths.

The provider and CLI preview share a content-based safety floor for native
tables. Each cell reserves its natural unwrapped width up to a 12em prose
reading measure; explicit value cells reserve the complete value. Insufficient
space becomes local scrolling, not one-character columns or reduced type.
This also covers old documents that have no value annotations. It does not
replace reviewing all tables in both content widths, and does not run in a
standalone HTML file opened without the provider. Author card reflows keep
their own layout; the provider does not guess whether a matrix is a record list.

**Scroll wrappers** — `tdoc-table-scroll` for a table, `diagram-box` for a
figure. Both are `overflow-x: auto`.

Use wrapping HTML/CSS for text-heavy panels and HTML captions for explanations.
Keep SVG labels short; split longer labels into lines that fit their nodes.

```css
.diagram-box svg { display: block; width: min(100%, var(--figure-width)); height: auto; }
```

Set `--figure-width` per figure from its content and the selected style’s
typography. Bound `width`, not just `max-width` (the reader supplies its own
responsive maximum); do not enlarge a small figure just to fill the column.
Estimate SVG label size as `font-size × displayed SVG width / viewBox width`,
including cumulative scale from the text and its ancestors; target at least
12px at the smallest intended width. If transforms make this uncertain, use an
unscaled label layer or HTML. Split dense figures, or preserve their spatial
layout with `min-width` and local scrolling. Recheck label/node fit after sizing;
the estimate does not prove rendered fit.

Before finalizing a changed SVG chart, check label size against the
surrounding prose and fix clipping, unintended overlap and small labels
without removing content or changing data.

**Stat tile row** — a few numbers that carry an argument on their own. Three or
four; a fifth is a table. It earns its place from the numbers in it, like any
other component, so it goes where those numbers are the point rather than
standing at the top of every document as a header band.

```html
<div class="tiles">
  <div class="tile"><b>11</b><span>what the number counts</span></div>
</div>
```

**Note** — an aside that qualifies rather than warns. One rule, no fill, no
icon: `<p class="note">`.

**Slide** — one page of a deck. A doc that has them gets the reader's
Present control; nothing else changes about how it reads or takes comments.

```html
<section class="slide" data-tdoc-slide data-tdoc-artifact="Slide 3: the loop">
  <h2>…</h2> …
</section>
```

```css
.slide { container-type:inline-size; aspect-ratio:16/9; overflow:hidden; }
.slide h2 { font-size:max(3.6cqw,24px); } .slide p { font-size:max(1.75cqw,15px); }
```

Keep every slide's content inside its 16:9 box: anything that spills is cut
off. One idea per slide. Design, layouts and narrow-width reflow:
`structure/slides.md`.

## Figure parts

These are the atoms of a drawn figure. Each style says what they look like.

| Part | What it is | Structural rule |
|---|---|---|
| **Container frame** | A rectangle grouping one stage of a figure | No fill of its own; the style decides corner and stroke |
| **Label chip** | The atomic noun of a figure — an input, a state, a stage | Short, uppercase, inside its own small box |
| **Numbered group** | A frame holding several steps, titled in its corner | Title reads `1: Author`, `2: Review` |
| **Description box** | One line explaining a step, inside the group it belongs to | Prose, not a label; keep it to a line |
| **Primary arrow** | The path the reader should follow first | Solid |
| **Secondary arrow** | A loop, a fallback, a return | Dashed — same weight, different dash |
| **Accent fill** | The one thing in the figure that is not greyscale | **One accent per figure.** Two competing accents make neither mean anything |
| **Textured variant** | The accent again, in a second state — live, transformed, stale | A texture over the fill, never instead of it: put the colour inside the `<pattern>` tile |

## Data components

`visuals.md` decides which of these the data calls for. Each is inline SVG,
because the host runs no author JavaScript and an SVG figure is a commentable
artifact — which is the whole point of putting it in an ultra document.

| Component | Reads as | Structural rule |
|---|---|---|
| **Bar** | Quantities compared | One baseline; bars share a zero |
| **Line** | A trend over time | Mark the points; a bare line hides how many readings there are |
| **Scatter** | A tradeoff, X against Y | Both axes drawn, both labelled |
| **Quadrant** | Position on two axes | Cross through the middle; label the axes, not the quadrants |
| **Matrix** | A feature comparison | ✓ / ✗ / ~ — a dash means "not stated", which is not the same as "no" |
| **Stat tiles** | A few key numbers | The number is the element; the label supports it |
| **Timeline** | A sequence of events | One axis, marks in order, the current one distinguished |
| **Flow** | A process with branches | Only when it truly branches. A list of steps is a list |
| **Stacked bar** | Composition of a whole | Segments sum to the whole, and the whole is stated |
| **Radar** | Many attributes, few items | Three or four items maximum before it turns to mud |
| **Gauge** | A magnitude on a scale | The scale's ends are visible, or the reading means nothing |
| **Small multiples** | The same chart repeated | Shared axes across every panel, or they cannot be compared |

## Writing a component that is not on this list

The nine parts and twelve chart types above cover what has come up so far. They
are not a vocabulary limit — a doc that needs a decision ladder, an org chart, a
burndown, a seating plan should have one, and no permission is required.

What a new component has to satisfy is short, and none of it is about taste:

**Name tokens, not colours.** Every `style/` entry declares `ink`, `rule`,
`muted`, `surface`, `accent-fill`, `accent-stroke`, `accent-text` and
`label-type`. A component built from those is dressed correctly by all four
styles — and by any style added later, which has to answer for the same tokens.
A component with a pure-black stroke written into it looks wrong the moment
somebody picks `paper`, where nothing is pure black.

**Be one comment anchor.** A component assembled from `<div>`s is invisible to
the overlay as a unit: readers end up commenting on fragments of its text.
Either use a semantic tag — `<section>`, `<aside>`, `<details>` — or mark it
`data-tdoc-artifact`. That is what makes it something a reader can point at,
which is the reason it is in an ultra document rather than a screenshot.

**Survive a phone.** Use fluid widths, an SVG `viewBox`, and local scrolling
when a figure cannot narrow. Let text containers grow with their content;
never fit required text with clipping, line clamping or a fixed/max height.
An intentionally bounded viewport must scroll to expose all its content.

**Compute nothing in the host.** The same rule as everything else: `:checked`
for state, CSS `@keyframes` for motion, a sandboxed widget island if it truly
needs to calculate.

Meet those four and the component behaves like the ones listed here: it swaps
style, it takes comments, it survives a regeneration. Nothing else is required
of it, and it does not need to be added to this file to be used.

## Two rules that outlive any style

**Draw to the edge of the viewBox.** The viewBox is the frame, not a mat.
Padding baked into it indents the figure against every paragraph on the page —
invisible at desktop width, obvious on a phone. If the leftmost stroke is at
`x=14`, the viewBox starts at 14. Space between a figure and its neighbours is
CSS margin on the wrapper, where it applies to the box and not to the picture.

A set of figures drawn one at a time is the common way this goes wrong: each is
individually reasonable, their ink starts at 6, 14, 20 and 34, and the row reads
as broken. Draw a set on one geometry — same left edge, same right edge.

**Compute only when it earns it.** Author `<script>` runs, isolated in the
sidebar's sandbox, so an interactive chart or calculator works. Still prefer
CSS: a toggle is `:checked` plus sibling selectors; motion is CSS `@keyframes`
with a `prefers-reduced-motion` guard; SVG styling goes in a `<style>`
*inside* the `<svg>`. A static figure survives printing and copying; a
script-drawn one may not.
