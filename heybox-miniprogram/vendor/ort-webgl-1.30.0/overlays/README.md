# DEV-only runtime flavors

`patched/` is the production source patch (`sync` readback). A flavor is an extra **source overlay** on top of
it, used only to build DEV comparison bundles. Flavors never touch a built/minified bundle and never reach
`dist/`; every overlay file must replace a file that `patched/` already contains, which
`scripts/build-ort-vendor.mjs` enforces.

| flavor | effect | files | purpose |
| --- | --- | --- | --- |
| `sync` (default) | `Tensor.data` synchronous materialization, gather channel-1 decode, no instrumentation | – | production bundle `src/vision/vendor-webgl.js` |
| `async-readback` | `await tensor.getData()` per graph output, one GPU fence per output | `lib/onnxjs/execution-plan.ts` | DEV-only read-back baseline |
| `filter-decoder` | upstream `filter((_v,i)=>i%4===0).subarray(0,dataSize)` channel-1 decode | `lib/onnxjs/backends/webgl/texture-data-encoder.ts` | DEV-only single-variable decode baseline (b-filter) |
| `profile` | prototype wrappers for both `decode`s, `TextureManager.readTexture`, `ProgramManager.build`, `GlslPreprocessor.preprocess`; exports `__helaDevDiagnostics` with calls/inclusive/self sync wall | `entry/webgl-only.entry.ts` | DEV-only profiling (b-profile) |

Flavors compose with `+`, so the read-back, the decoder and the profiler can be varied independently, e.g.
`--flavor filter-decoder+profile` builds the filter/profile bundle used as `filter-profile` in the DEV page.
A later overlay wins for the same file; every overlay path must belong to `patched/` or be the authored entry.

Build:

```bash
node scripts/build-ort-vendor.mjs                                              # sync -> src/vision/vendor-webgl.js
node scripts/build-ort-vendor.mjs --flavor async-readback --out /tmp/async.js        # DEV read-back baseline
node scripts/build-ort-vendor.mjs --flavor filter-decoder --out /tmp/filter.js      # DEV decode baseline
node scripts/build-ort-vendor.mjs --flavor profile --out /tmp/profile.js            # DEV instrumented
node scripts/build-ort-vendor.mjs --flavor filter-decoder+profile --out /tmp/fp.js  # composed
```

The bundle banner records the lifecycle patch hash and `readback=<sync|async> decode=<gather|filter> profile=<bool>`, and `runtime-provenance.json`
in `dist/` records the production readback mode so a shipped bundle can never silently be the async flavor.
