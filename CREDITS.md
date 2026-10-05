# Third-party credits and sources

The original Outside First app code, SVG artwork and authored cards use the
project's MIT license. Third-party model and runtime assets retain their own
licenses. They are preserved unmodified.

| Component | Source/version | Preserved notice |
| --- | --- | --- |
| Transformers.js | 3.8.1 | `licenses/transformers-Apache-2.0.txt` |
| Jinja in prebuilt JS bundle | 0.5.3 | `licenses/jinja-MIT.txt` |
| ONNX Runtime | commit `89f8206ba4f1c22c39e0297fb55272e8ce8cd7d0` | `licenses/onnxruntime-MIT.txt`, `licenses/onnxruntime-ThirdPartyNotices.txt` |
| MiniLM ONNX q8 export | Xenova revision `751bff37182d3f1213fa05d7196b954e230abad9` | `MODEL-NOTICE.txt`, model README, `models/LICENSE-Apache-2.0.txt` |
| Emscripten runtime/system libraries | 4.0.4 inferred from pinned ONNX CI | `licenses/emscripten-LICENSE.txt`, AUTHORS, musl COPYRIGHT, and LLVM library license companions |
| Webpack bundle runtime | 5.97.1 inferred from Transformers source lock | `licenses/webpack-MIT.txt` |

The full ONNX upstream notices cover native third-party code and
TensorFlow.js-derived helpers; their existing headers remain in the shipped
bundle. The broader upstream notice list covers several ONNX targets. Its
inclusion does not imply every listed component is linked into this WASM.

For any included Eigen code covered by MPL-2.0, the full license text is in the
upstream ONNX notices. Its pinned corresponding source is available at
[Eigen revision 1d8b82b](https://gitlab.com/libeigen/eigen/-/archive/1d8b82b0740839c0de7f1242a3585e3390ff5f33/eigen-1d8b82b0740839c0de7f1242a3585e3390ff5f33.zip).
Pinned ONNX source is available at
[Microsoft ONNX Runtime](https://github.com/microsoft/onnxruntime/tree/89f8206ba4f1c22c39e0297fb55272e8ce8cd7d0).
No native code or model weight modifications were made in this project.

`notice-sources.json` records original notice URLs, sizes and hashes.
`model-provenance.json` records pinned model asset URLs, sizes and hashes.
The bundled Jinja source version differs from the installed Node dependency
0.5.10; their original MIT license texts were independently matched.

The UI, original cards, source code and draft writing were created with OpenAI
Codex agents. Tests used synthetic preferences and a synthetic field note.
They do not represent outdoor use, model training or user studies.
