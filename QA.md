# Verification record

Verified on 5 October 2026 in the Windows desktop environment and Codex in-app
browser. These are development checks, not user studies or an outdoor field
trial. All test preferences and the one saved field note were synthetic.

- Real local Node inference: 384 finite normalized dimensions, three paraphrase
  fixtures, identical embeddings in a fresh process with JavaScript fetch blocked.
- Full-card Node check: all twenty authored cards indexed. Paraphrased bird and
  cloud preferences ranked the intended cards first. A five-minute/stationary
  eligibility pass retained the correct top card in each case.
- Actual browser: the real local model loaded and indexed all twenty cards.
  A preference for wildlife singing matched **Listen for the third voice** with
  five minutes and staying in one place selected. Its pocket card showed the
  exact three authored steps and the put-phone-away instruction.
- Storage: a visibly synthetic note was saved and remained in My field notes
  after a fresh page reload. It was not an account or server record.
- Offline preparation: app, model and runtime cache preparation succeeded.
  The local app server was stopped; an independent HTTP request confirmed it
  was unreachable. With browser tab network emulation also set offline, the app
  reloaded, a fresh model session loaded, and a new cloud preference matched
  **Follow one cloud** within the same five-minute/stationary limits.
- The observed main-tab HTTP responses came from the service worker's cache.
  No external request was observed in those events. Model-worker internal
  requests were not separately attached to the network observer. The app server
  was unavailable during the cold reload and new match.
- Browser network emulation was restored and the local preview server restarted.

The disconnected matching check used frontend cache version1. Subsequent UI
changes moved preparation above the input, removed an unused import map, and
hide a previous mission when preferences, time, place or manual mode change.
The model, runtime, matching worker and source card data were unchanged.
Final version3 browser checks also succeeded: real model loading selected the
fifteen-minute familiar walk; changing to five minutes and staying in one place
hid that stale mission. Manual mode displayed eight eligible short stationary
cards and labelled a selected leaf-palette mission **Chosen by you**. Its pocket
card was visually checked at a 390 x 844 CSS-pixel viewport. The optional elapsed
timer advanced from 00:00 to 01:29 and stopped when requested. The temporary
viewport override was reset. This is a responsive desktop-browser check,
not a physical phone test.

Not established by these checks: operating-system airplane mode, mobile-device
inference speed, exhaustive native-library linkage, outdoor use, accessibility
certification, a submitted entry, sponsor acceptance, an award or payment.
