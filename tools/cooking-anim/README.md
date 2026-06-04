# Cooking animation pipeline (local AI generation)

Generates short, looping **high-fidelity 3D/CGI cooking how-to animations** locally
on the GPU box with a **text-to-video diffusion model**, and emits looping
**animated WebP** banners named so the frontend can reference them **procedurally**.
No external runtime services, no per-recipe authoring.

> Fidelity: this uses real text-to-video models (CogVideoX / LTX-Video), not the
> earlier AnimateDiff-SD1.5 tier. Output is a full-width banner per step.

```
method text ──(frontend classifier)──► {action, object}
                                              │
            this pipeline ──► <action>_<object>.webp  (e.g. chop_onion.webp)
                                              │
            <img src> in the recipe Method list, chosen by id at runtime
```

The frontend already turns every instruction line into `{action, object}` via
[`classifyStep.ts`](../../src/prototype/cookingAnimations/classifyStep.ts). This
pipeline produces a clip for each id, and the frontend resolves most-specific-first:
`chop_onion` → `chop` → `generic`. So you can generate a few or hundreds; anything
missing falls back cleanly.

---

## 0. Naming scheme (the contract)

| id pattern        | example          | when used                                   |
| ----------------- | ---------------- | ------------------------------------------- |
| `<action>_<object>` | `chop_onion.webp`  | food-specific clip (best)                   |
| `<action>`          | `chop.webp`        | fallback for that action, any food          |
| `generic`           | `generic.webp`     | ultimate fallback                           |

- **actions** mirror `CookingActionType`: `boil fry chop pour mix bake season drain microwave assemble serve generic`
- **objects** mirror `FoodGlyphKey`: `onion garlic tomato pepper courgette carrot broccoli potato mushroom spinach veg beans rice noodles couscous oats bread egg tofu chicken fish cheese berries fruit food`

What gets generated is defined in [`pipeline/manifest.py`](pipeline/manifest.py):
every action (guaranteed coverage) **plus** a curated `COMBOS` table of food-specific
clips. Edit `COMBOS` to add/remove specific combos. Prompts live in
[`pipeline/prompts.py`](pipeline/prompts.py) — edit `STYLE` there to restyle the
entire set at once.

Preview the plan without generating:

```bash
python3 pipeline/manifest.py     # prints every id that will be produced
```

---

## 1. One-time setup (on the gru GPU server)

```bash
# Check the GPU + driver/CUDA first — pick the torch build to match.
nvidia-smi

# Get the code onto the box (rsync from your machine or git pull), then:
cd tools/cooking-anim
python3 -m venv .venv && source .venv/bin/activate
pip install --upgrade pip

# Install torch + torchvision matched to the server CUDA (example: CUDA 12.1).
# (torchvision is optional but silences transformers warnings and avoids
#  edge-case image-transform fallbacks.)
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121

# Rest of the deps.
pip install -r requirements.txt
```

Models are pulled automatically from Hugging Face on first run (all public —
no token needed) and cached in `~/.cache/huggingface`. Default backend
`cogvideox2b` downloads `THUDM/CogVideoX-2b` (~12 GB of weights, one-time).

**Backends** (pick with `--backend`):

| backend | model | res | notes |
| --- | --- | --- | --- |
| `cogvideox2b` (default) | THUDM/CogVideoX-2b | 720×480 | reliable on ≤12 GB with offload |
| `cogvideox5b` | THUDM/CogVideoX-5b | 720×480 | higher fidelity, wants ≥16–24 GB |
| `ltx` | Lightricks/LTX-Video | 768×512 | faster, higher res |

**VRAM:** `enable_sequential_cpu_offload()` + VAE tiling are **on by default**, so the
default backend fits well under 12 GB (it streams weights from system RAM). The trade
is speed — expect **minutes per clip** on a small GPU. You said that's fine; run the
smoke test first, then the full set overnight. For OOM, see Troubleshooting.

---

## 2. Generate + sync

```bash
# Smoke test 3 clips first (recommended — confirms the look before the long run):
./run.sh --only chop_onion,fry_tofu,boil_noodles --force

# Everything missing, then copy into the frontend (long; run overnight):
./run.sh

# Tuning via env vars:
FPS=12 FRAMES=24 WIDTH=640 ./run.sh
```

`run.sh` does two steps you can also run directly:

```bash
python generate.py            # text-to-video -> dist/<id>.webp (+ .poster.webp)
python sync_frontend.py       # copy dist/*.webp -> frontend + write index.ts
```

`generate.py` is **idempotent**: it skips ids whose `.webp` already exists. Use
`--force` to redo, or `--only` to target a subset.

Key `generate.py` flags:

| flag | default | meaning |
| --- | --- | --- |
| `--backend` | `cogvideox2b` | `cogvideox2b` / `cogvideox5b` / `ltx` |
| `--steps` | `50` | inference steps (higher = better/slower) |
| `--guidance` | `6.0` | classifier-free guidance |
| `--gen-frames` | `49` | frames the model renders |
| `--gen-width`/`--gen-height` | — | LTX render dims (÷32) |
| `--frames` | `24` | frames kept in the final webp |
| `--fps` | `12` | playback fps |
| `--width` | `640` | output banner width px (height keeps aspect) |
| `--only` / `--force` | — | subset / overwrite |

---

## 3. Review, commit, deploy

```bash
ls src/prototype/cookingAnimations/generated/        # *.webp + index.ts
bun run dev                                           # open a recipe, check the Method list
```

The `.webp` files and the generated `index.ts` are the build inputs — **commit them**
so Vercel bundles them (generation does not run in CI):

```bash
git add src/prototype/cookingAnimations/generated tools/cooking-anim
git commit -m "Add generated cooking animations"
```

Frontend wiring is already done:
[`StepAnimation.tsx`](../../src/prototype/cookingAnimations/StepAnimation.tsx)
reads `generated/index.ts`, resolves the id, and renders `<img>` (poster still when
`prefers-reduced-motion`). Until you generate, the map is empty and steps simply
show no icon — nothing breaks.

---

## 4. Dialling in quality

- **Smoothness vs size:** default `--frames 24 --fps 12` (2 s loop). Smoother =
  `--gen-frames 65 --frames 32 --fps 16` (bigger files); cheaper = `--frames 16 --fps 8`.
- **More fidelity:** raise `--steps` (e.g. 60–80), or switch `--backend cogvideox5b`
  / `--backend ltx` if VRAM allows. Bigger on-screen = `--width 768`.
- **Consistent art style:** every prompt shares `STYLE` in `prompts.py`. Change it once
  and `--force` regenerate. Tweak per-action wording in `ACTION_MOTION` if an action
  reads wrong (e.g. make "chop" emphasise the knife).
- **Reproducibility:** each id has a fixed seed (`seed_for`), so regenerating one clip is
  deterministic. Change the prompt or `STYLE` to get a different result; if one clip comes
  out bad, append something to its prompt (or temporarily tweak `seed_for`) and
  `--only <id> --force`.

### Alternative models
The backends are interchangeable (`--backend`). To plug in another diffusers
text-to-video model (e.g. HunyuanVideo, Wan2.1) add a branch in `Backend._load` and,
if it needs explicit dims, in `Backend.render`. Everything downstream (naming, webp,
sync, frontend) is model-agnostic.

---

## 5. Troubleshooting

| symptom | fix |
| --- | --- |
| CUDA out of memory | lower `--gen-frames 25`; for `ltx` shrink `--gen-width/--gen-height`; offload+tiling already on; close other GPU jobs |
| `torch` can't see GPU | install the CUDA-matched torch wheel (step 1), check `nvidia-smi` |
| very slow | expected with offload on small VRAM — fewer `--gen-frames`/`--steps`, or use a bigger GPU / `--backend ltx` |
| blank/black or warped frames | raise `--steps`, adjust `--guidance` (5–8), tweak the prompt and `--only <id> --force` |
| `sentencepiece`/T5 tokenizer error | `pip install sentencepiece protobuf` (in requirements) |
| first run slow / large download | one-time model download (~12 GB for CogVideoX-2b); later runs hit the HF cache |

---

## Files

| path | purpose |
| --- | --- |
| `pipeline/manifest.py` | which ids to generate (actions + `COMBOS`) — the naming source of truth |
| `pipeline/prompts.py` | prompt templates + shared `STYLE`/`NEGATIVE` |
| `generate.py` | text-to-video → frames → animated WebP banners in `dist/` |
| `sync_frontend.py` | copy `dist/*.webp` into the frontend + write `generated/index.ts` |
| `run.sh` | generate-missing + sync, one command |
| `requirements.txt` | Python deps (install torch separately) |
| `dist/` | pipeline output (gitignored) |
