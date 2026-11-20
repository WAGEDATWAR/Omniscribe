# pdfjs - vendored source

| Field | Value |
|---|---|
| Library | PDF.js (`pdfjs-dist`) |
| Version | 6.5.438 |
| Licence | Apache-2.0 (`LICENSE`; third-party notices beside the files that need them) |
| Obtained | `npm pack pdfjs-dist@6.5.438` from https://registry.npmjs.org/pdfjs-dist/-/pdfjs-dist-6.5.438.tgz on 2026-11-19 |
| Tarball SHA-256 | `7461aefcd27c4ef0dd76f9ca5760f09466eb6b3f934432670c12132e7b3d6faa` |
| Used by | `src/pdf/view.js` only, loaded lazily (P-14) |
| Decision | `DECISIONS.md` P-14, P-18 |

Files are copied byte for byte from the package. They are marked `-text` in `.gitattributes` so line
endings never change them, and the repository tooling skips this folder.

**Included:** `build/pdf.min.mjs`, `build/pdf.worker.min.mjs`, `standard_fonts/`, `iccs/` and the
WebAssembly decoders in `wasm/` (JBIG2, OpenJPEG, colour management) with their fallbacks and licences.

**Excluded on purpose:** the scripting sandbox (`pdf.sandbox`, `quickjs-eval`), source maps, the web
viewer, the renderer-only build and the CJK character maps (DEF-076).

**Updating:** see `docs/PDF.md` 2. Recompute every hash below and the tarball hash, and run all gates.

## SHA-256 of every vendored file

```text
0d542e0c8804e39aa7f37eb00da5a762149dc682d7829451287e11b938e94594  LICENSE
3a88402882cfa3e7e72c2c9b5149f52f0f88baf1c5b62aa11a41abdbc2072440  build/pdf.min.mjs
1e64c8240e54735ec5913b37acd5134747799cb8c6bb3777c70adbc01232d2aa  build/pdf.worker.min.mjs
73e1ba37d2bad5bab2a964f40a9eed96209666efc067c3322626214bbef234a0  iccs/CGATS001Compat-v2-micro.icc
286e4fd7b447330b2c88e23890e3cd0a9d38cb398d4a59cb247f578ccbda3213  iccs/LICENSE
845c752392b6c914fb989c75a08b7792b88f542d2499042ef2889f8c814a16ed  standard_fonts/FoxitDingbats.pfb
b6c8fe53f134b8b6d4578cd2d544df4cee9624c4efa8d51a560fb40ea296101b  standard_fonts/FoxitFixed.pfb
f1b7159702973f54fc86254ea38bcf3712b2a736eb3a0995751e9f4bb45ad603  standard_fonts/FoxitFixedBold.pfb
8a000945843bd31add06aee63bf9fd41b7578b4f3242a4b7cd46349ad9d24d4d  standard_fonts/FoxitFixedBoldItalic.pfb
5007faf8320fa1fcc08b8894b356ad976f60b992ba29ee5272578bbdebaf3876  standard_fonts/FoxitFixedItalic.pfb
4f57d2b9d884af8f907bf22df6019b52d86cbf6214fdbd02b1ae05472a543f35  standard_fonts/FoxitSerif.pfb
0bdf4b04e964139818d51eda03d566ba999fc3ba2421b1c6c51f9dc969022e80  standard_fonts/FoxitSerifBold.pfb
a406cac82583bf98175cb62c87ed5e95c45fbb34eece63a10b0a13e793cb2e10  standard_fonts/FoxitSerifBoldItalic.pfb
610ae0687198045c4db5d1a6650fd5e92536631706382eb8b72e38df578d0ae9  standard_fonts/FoxitSerifItalic.pfb
47967d055530e7357088a08403115425643ec2cdfd6201ba8af0fbd7116c1539  standard_fonts/FoxitSymbol.pfb
b578cdd2345840ada550bd12519533812320d5f1d21cf4c1c7e1b1b0a31c98b7  standard_fonts/LICENSE_FOXIT
d2c4d5b3e115a519cb58eb691aa64538397e2611f9ebe801392cf9667997e7dc  standard_fonts/LICENSE_LIBERATION
361c61b82d575c5c35fd9157fda8b0194bcfcd0d88ea8521a4fb5dd53d33dddc  standard_fonts/LiberationSans-Bold.ttf
a224075ac17495ad0a3af3bc0a419ac0704a8b3fd1095456201fb9b095fc281d  standard_fonts/LiberationSans-BoldItalic.ttf
832b4406dbef23628800d3aaad21048534ac84d7e3ad955be83b8172ed8ef512  standard_fonts/LiberationSans-Italic.ttf
f8ace1f892b2bd9dc1792ba7f097fa7588f84fed48321480e04de5390828221f  standard_fonts/LiberationSans-Regular.ttf
9e66b7f1b934a28b37f3bc4dac97915de1674271e79a0a88182a18ed9731b4d1  wasm/LICENSE_JBIG2
a6af136f3e15038a666b61f376612a07d9a4e48cb7c01adbf3e33b3f14ab49b6  wasm/LICENSE_OPENJPEG
aad3cce09842e00e9e11ad5e8fef8cc02fbc3a3768fe2f007443b9cee37aaee5  wasm/LICENSE_PDFJS_JBIG2
717fc62da03292dbb4dd0c8280bd4ce7bb8550dcf31d772bc93455fb50313425  wasm/LICENSE_PDFJS_OPENJPEG
508a77d2e7b51d98adeed32648ad124b7b30241a8e70b2e72c99f92d8e5874d1  wasm/LICENSE_PDFJS_QCMS
36d847ae882f6574ebc72f56a4f354e4f104fde4a584373496482e97d52d31bc  wasm/LICENSE_QCMS
466f45c2a61a698152fb5400c27e56ff2ceb73dcb71fde3fc366a502308eaab0  wasm/jbig2.wasm
70150223396487e1ccfef7eac61fc780074ad7fcc9e843b702a8a3bc23107494  wasm/jbig2_nowasm_fallback.js
7ea4b2b04613370ad4e9c1162da750cc88b4b176eac0d0c164b3caff23fc0a46  wasm/openjpeg.wasm
2855f1590e7fd7abbbf204cd13a5c09d30c92fe2c9313fb72b64aa763fe8b4f3  wasm/openjpeg_nowasm_fallback.js
663d86126d5f5fcb1c61490f94353e2a8375660b8c5498ab3ebab5a34b08800e  wasm/qcms_bg.wasm
```
