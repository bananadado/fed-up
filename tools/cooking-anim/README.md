# Cooking animation pipeline (local AI generation)

Generates short, looping **cooking how-to animations** locally on the GPU box and
emits transparent **animated WebP** files named so the frontend can reference them
**procedurally**. No external runtime services, no per-recipe authoring.

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

# Install torch matched to the server CUDA (example: CUDA 12.1).
pip install torch --index-url https://download.pytorch.org/whl/cu121

# Rest of the deps.
pip install -r requirements.txt
```

Models are pulled automatically from Hugging Face on first run (all public —
no token needed) and cached in `~/.cache/huggingface`:
- base checkpoint `Lykon/dreamshaper-8` (SD1.5, ~2 GB)
- `ByteDance/AnimateDiff-Lightning` motion module (fast, 4/8-step)
- `rembg` `u2net` model (background removal, ~170 MB, cached in `~/.u2net`)

**VRAM:** the default (AnimateDiff-Lightning, SD1.5, 256², 16 gen frames) runs in
~6–8 GB. `enable_model_cpu_offload()` is on by default, so it also works on smaller
cards (slower). For OOM, see Troubleshooting.

---

## 2. Generate + sync

```bash
# Everything missing, then copy into the frontend:
./run.sh

# Tuning via env vars:
FPS=3 FRAMES=6 SIZE=256 ./run.sh

# Only specific ids (fast iteration while dialling in the look):
./run.sh --only chop_onion,fry_tofu,boil_noodles --force
```

`run.sh` does two steps you can also run directly:

```bash
python generate.py            # AnimateDiff -> dist/<id>.webp (+ .poster.webp)
python sync_frontend.py       # copy dist/*.webp -> frontend + write index.ts
```

`generate.py` is **idempotent**: it skips ids whose `.webp` already exists. Use
`--force` to redo, or `--only` to target a subset.

Key `generate.py` flags:

| flag | default | meaning |
| --- | --- | --- |
| `--fps` | `4` | playback fps (3–4 gives the flipbook look) |
| `--frames` | `8` | frames kept in the final webp |
| `--gen-frames` | `16` | frames AnimateDiff renders before subsampling |
| `--size` | `256` | output square px |
| `--lightning` | `8` | AnimateDiff-Lightning step count (`1`,`2`,`4`,`8`) |
| `--no-lightning` | off | use standard AnimateDiff (~25 steps, slower, sometimes smoother) |
| `--steps` | auto | override inference steps |
| `--guidance` | `1.8` | CFG (≈1.8 for Lightning, ≈7 for standard) |
| `--base` | `Lykon/dreamshaper-8` | SD1.5 base checkpoint (swap to restyle) |
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

- **Frame count vs smoothness:** start `--frames 8 --fps 4` (2 s loop). For a snappier
  flipbook use `--frames 6 --fps 3`; for smoother motion `--gen-frames 24 --frames 12 --fps 8`.
- **Consistent art style:** every prompt shares `STYLE` in `prompts.py`. Change it once
  and `--force` regenerate. For a stronger, uniform style add a style **LoRA**
  (`pipe.load_lora_weights(...)`) in `load_pipeline`, or switch `--base` to a flat/cartoon
  SD1.5 checkpoint (e.g. a "flat illustration" or "toon" model on HF).
- **Per-action motion wording** lives in `ACTION_MOTION` (`prompts.py`) — tweak phrasing
  if an action reads wrong (e.g. make "chop" emphasise the knife).
- **Cleaner cut-outs:** prompts force a plain white background so `rembg` keys cleanly.
  If edges are rough, raise `--size`, or try a different rembg model
  (`new_session("isnet-general-use")` in `generate.py`).
- **Reproducibility:** each id has a fixed seed (`seed_for`), so regenerating one clip is
  deterministic. Change the prompt or `STYLE` to get a different result.

### Higher-quality / alternative models
AnimateDiff-Lightning is the fast default. If you want more realistic motion and have
the VRAM, swap the generator in `load_pipeline` for a text-to-video model — e.g.
**LTX-Video** (fast, ~12 GB) or **CogVideoX-2B/5B** via their diffusers pipelines —
then sample/subsample frames the same way before `cut_out`/`save_webp`. The rest of the
pipeline (naming, alpha, webp, sync) is model-agnostic.

---

## 5. Troubleshooting

| symptom | fix |
| --- | --- |
| CUDA out of memory | lower `--size 192`, `--gen-frames 12`; cpu-offload is already on; close other GPU jobs |
| `torch` can't see GPU | install the CUDA-matched torch wheel (step 1), check `nvidia-smi` |
| blank/black frames | raise `--guidance` (Lightning ≈2.0), try `--no-lightning`, or a different `--base` |
| rough/halo edges on cut-out | increase `--size`; try `isnet-general-use` rembg model |
| first run slow | model downloads; subsequent runs hit the HF cache |
| onnxruntime GPU error | `pip install onnxruntime` (CPU) if `onnxruntime-gpu` mismatches CUDA — rembg still works |

---

## Files

| path | purpose |
| --- | --- |
| `pipeline/manifest.py` | which ids to generate (actions + `COMBOS`) — the naming source of truth |
| `pipeline/prompts.py` | prompt templates + shared `STYLE`/`NEGATIVE` |
| `generate.py` | AnimateDiff → frames → alpha → animated WebP in `dist/` |
| `sync_frontend.py` | copy `dist/*.webp` into the frontend + write `generated/index.ts` |
| `run.sh` | generate-missing + sync, one command |
| `requirements.txt` | Python deps (install torch separately) |
| `dist/` | pipeline output (gitignored) |
