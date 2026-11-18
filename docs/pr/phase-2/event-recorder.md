# PR #9: Event recorder with debounced fills and parameter detection

Branch: `phase-2/event-recorder` into `main`. Closes #9.

## Summary
Recorder that attaches to a browser context and turns click, fill (debounced), select, check, Enter and submit into workflow steps with {{param}} detection; refuses password/payment fields before the value leaves the page.

## How it was tested
tests/recorder.test.ts (11 cases) records all 20 golden flows; password and cc fields refused; check.sh green.

## Numbers produced
none
