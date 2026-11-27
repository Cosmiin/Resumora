# Progress: tailoring in three screens (steps 2 to 4)

## Task A1: A step can be written straight into the tailored CV — done
session: Shorten the tailoring flow · builder: claude
commit: see the log (base 4fd9ed4) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0
open: none

- `acceptSection` now calls a new `mergeStep` (the part that applies a step's proposals and builds its review state); the order of scoring, saving and notes is unchanged, and the accept, redo and light-section tests pass as they were.
- The layout step's proposals moved into `layoutProposals`, used by the old route and the new one.
- Ruling: a role written again starts from its Base wording (as a redo does), so writing a step twice gives the same CV as writing it once. Skills written twice are not reset; renames are applied over the tailored names.
