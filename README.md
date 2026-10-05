# Outside First

One small thing to notice outside. A local open sentence encoder, a pocket card,
and an optional field note that stays in the browser.

Created from scratch on 5 October 2026, after the DEV Hacktoberfest Week 1
challenge opened. The code and activity cards were prepared with OpenAI Codex
agents. Model weights and runtime dependencies retain their own licenses.

## What the app does

Describe what you would like to notice. Select five, ten or fifteen minutes, and
optionally stay in one place. The open-weight MiniLM sentence encoder ranks
twenty original, prewritten observation cards from your words. Time and stationary
preferences are hard eligibility constraints. The model does not invent
activities or directions. A manual card browser remains available if model
preparation fails, clearly labelled as manual selection.

The chosen card has three short steps. Take its pocket card outside, then put the
phone away. On returning, optionally keep a one-line observation in this
browser's local storage. There are no accounts, GPS requests, cloud inference,
remote note storage or notification prompts.

The app suggests observation in a familiar place. It does not assess weather,
routes, accessibility of a real site, species or medical suitability.

## Run locally

Use a current Node.js release and pnpm. Install the exact lockfile dependencies
with installation scripts disabled, prepare the pinned model assets, and copy
the browser runtime:

```sh
pnpm install --frozen-lockfile --ignore-scripts
node model-preflight.mjs --download
node prepare-browser-assets.mjs
node prepare-notices.mjs
node server.mjs
```

Open `http://127.0.0.1:8897/`. The development server binds to localhost and
serves an explicit allowlist of app, model and runtime files. It does not serve
the source repository, receipts, caches or dependency directories.

Click **Prepare local guide** for real inference. This loads the model and
WebAssembly runtime from the same app server. **Keep for offline use** explicitly
caches the app's listed assets. Browser storage can be cleared or evicted.
Offline preparation is a separate operation from model readiness.

## Model and attribution

- [Xenova/all-MiniLM-L6-v2](https://huggingface.co/Xenova/all-MiniLM-L6-v2),
  Apache-2.0, revision `751bff37182d3f1213fa05d7196b954e230abad9`.
- [sentence-transformers/all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2),
  the upstream sentence encoder identified by the export's model card.
- [Transformers.js](https://huggingface.co/docs/transformers.js), exactly 3.8.1,
  using local ONNX WebAssembly in a browser worker.

The unmodified quantized weight file is 22,972,370 bytes. Its SHA-256 is
`afdb6f1a0e45b715d0bb9b11772f032c399babd23bfc31fed1c170afc848bdb1`.
Model source, tokenizer files, original model card and Apache license text are
preserved. See `MODEL-NOTICE.txt` and the original third-party notices for rights
and redistribution details. The model is not public domain. Runtime attribution,
original notices and corresponding source information are in `CREDITS.md` and
`licenses/`.

## Verification and limits

The recorded local Node preflight verified real 384-dimensional finite,
normalized embeddings, three paraphrase rankings and identical results from a
fresh process with remote model access disabled and JavaScript fetch blocked.
Those timings apply to Node CPU, not mobile hardware. Actual browser checks
also verified model loading and bird/cloud preference matches across the full
card set, the pocket card and synthetic field-note persistence. With offline
emulation active and the local app server stopped and independently confirmed
unreachable, a fresh reload and fresh model session successfully matched a new
cloud preference from cached assets. This is an app-server-disconnection test,
not an operating-system airplane-mode test. See `QA.md` for the checked scope.
No field trial or sponsor acceptance is claimed by this source.

This is software preparation. An entry, prize award or earned payment is a
separate event. No prize or earnings are implied by its creation.
