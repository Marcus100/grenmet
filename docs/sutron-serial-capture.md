# Topic: How the weather station talks to the PC (Sutron serial capture)

Started: 2026-08-15
Learner level: complete beginner — "all of it is a black box"
Goal: understand what today's serial capture revealed and why each conclusion follows.

## Lesson plan

| # | Lesson | Status |
|---|--------|--------|
| 1 | A serial port is a wire that carries letters, one at a time | done |
| 2 | Baud rate — how fast the letters go, and why both ends must agree | done |
| 3 | The conversation — you send a command, it sends an answer | done |
| 4 | The prompt — how you know it finished talking | done |
| 5 | Reading one line of station data | done |
| 6 | Quality flags — what `G` and `B` mean, and the BATTERY finding | done |
| 7 | Comparing 2020 with today — the four missing sensors | done |
| 8 | Why finding the terminator matters for the rewrite | done |

## Log

**2026-08-15 — all 8 lessons completed in one session.**

Learner started as complete beginner ("all of it is a black box") and answered
every check question correctly, several times reasoning from the right direction
independently:

- Lesson 1: correctly identified the spaces as formatting/alignment.
- Lesson 2: picked both correct reasons for the 5s timeout and avoided the
  distractor (baud rate does not change mid-transmission).
- Lesson 3: guessed echo served as command verification — right benefit, and
  accepted the terminal-echo mechanism readily.
- Lesson 4: got "everything was completed" — the proof-by-ordering idea landed.
- Lesson 5/6: worked out G=Good, B=Bad unprompted; then independently reasoned
  that the battery must be physically fine because the station was still
  transmitting. That is the exact distinction the flag encodes.
- Lesson 7: correctly reduced `G` to "the sensor is working", not "the value is
  sensible".

Pattern to note for future sessions: runs every hands-on command reliably, but
often pastes output without answering the check question. A short direct re-ask
(or AskUserQuestion with options) gets a correct answer every time. Not a
comprehension problem — just needs the question put plainly a second time.

**2026-08-15 (later) — first porting work done alongside teaching.**

Implemented read-until-prompt in `transport.py`, test-first. Concepts covered
in passing: writing tests before code and why; what a failing test means after
a deliberate change (is the test wrong, or the change?); and — the big one —
measuring instead of assuming.

The teachable moment: the first implementation (chunked reads, checking for the
prompt in an accumulated buffer) was **wrong**, and all its tests passed. Only
instrumenting a real simulated station exposed it: `read(n)` waits for exactly
n bytes or the timeout, so chunking just relocated the same 5s wait. Fixed by
using pyserial's `read_until`. Result: 10.16s -> 0.22s per poll, verified.

Worth reusing as an example: green tests proved the logic was self-consistent,
not that the design was right. The measurement was what caught it.

Possible follow-on topics: what a systemd timer is and why it replaces cron;
what "parsing" means in general; why the `.asc` file format looks the way it
does; what a database index is and why the history DB is 36 MB.
