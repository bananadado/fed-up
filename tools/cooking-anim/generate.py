#!/usr/bin/env python3
"""Generate looping cooking animations locally with AnimateDiff and save them as
transparent, looping animated WebP files named for procedural reference.

Pipeline per animation id (see pipeline/manifest.py):
  1. Build a deterministic prompt (pipeline/prompts.py) + per-id seed.
  2. AnimateDiff text->short clip (N frames).
  3. Subsample to the target frame count.
  4. rembg -> alpha (cut out the plain background), union-crop, pad square, resize.
  5. Save dist/<id>.webp (animated, looping) + dist/<id>.poster.webp (frame 0,
     used for prefers-reduced-motion).

Output files are the contract with the frontend; run sync_frontend.py afterwards.

Usage examples:
  python generate.py                     # generate everything missing
  python generate.py --force             # regenerate everything
  python generate.py --only chop_onion,fry_tofu
  python generate.py --fps 4 --frames 8 --size 256 --steps 8
  python generate.py --base Lykon/dreamshaper-8 --lightning 8
"""

from __future__ import annotations

import argparse
import hashlib
from pathlib import Path

import torch
from PIL import Image
from diffusers import AnimateDiffPipeline, EulerDiscreteScheduler, MotionAdapter
from huggingface_hub import hf_hub_download
from rembg import new_session, remove
from safetensors.torch import load_file

from pipeline.manifest import build_manifest
from pipeline.prompts import NEGATIVE, build_prompt

ROOT = Path(__file__).parent
DIST = ROOT / "dist"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
DTYPE = torch.float16 if DEVICE == "cuda" else torch.float32


def seed_for(anim_id: str) -> int:
    """Stable per-id seed so regenerating one clip is reproducible."""
    return int(hashlib.sha1(anim_id.encode()).hexdigest(), 16) % (2**31)


def load_pipeline(base_model: str, lightning_steps: int | None) -> AnimateDiffPipeline:
    """Load AnimateDiff. With --lightning N uses ByteDance AnimateDiff-Lightning
    (4/8 step, very fast); otherwise the standard v1.5 motion adapter."""
    if lightning_steps:
        adapter = MotionAdapter().to(DEVICE, DTYPE)
        ckpt = f"animatediff_lightning_{lightning_steps}step_diffusers.safetensors"
        adapter.load_state_dict(
            load_file(hf_hub_download("ByteDance/AnimateDiff-Lightning", ckpt), device=DEVICE)
        )
        pipe = AnimateDiffPipeline.from_pretrained(
            base_model, motion_adapter=adapter, torch_dtype=DTYPE
        ).to(DEVICE)
        pipe.scheduler = EulerDiscreteScheduler.from_config(
            pipe.scheduler.config, timestep_spacing="trailing", beta_schedule="linear"
        )
    else:
        adapter = MotionAdapter.from_pretrained(
            "guoyww/animatediff-motion-adapter-v1-5-3", torch_dtype=DTYPE
        )
        pipe = AnimateDiffPipeline.from_pretrained(
            base_model, motion_adapter=adapter, torch_dtype=DTYPE
        ).to(DEVICE)
        pipe.scheduler = EulerDiscreteScheduler.from_config(
            pipe.scheduler.config, timestep_spacing="linspace", beta_schedule="linear"
        )

    # Keep VRAM modest; safe to leave on for big GPUs too.
    pipe.enable_vae_slicing()
    try:
        pipe.enable_model_cpu_offload()
    except Exception:
        pass
    return pipe


def subsample(frames: list[Image.Image], target: int) -> list[Image.Image]:
    if target >= len(frames):
        return frames
    step = len(frames) / target
    return [frames[min(len(frames) - 1, round(i * step))] for i in range(target)]


def cut_out(frames: list[Image.Image], session, size: int) -> list[Image.Image]:
    """Remove the plain background to alpha, crop to the union bbox across all
    frames (stable framing), pad to square, resize to `size`."""
    rgba = [remove(f.convert("RGBA"), session=session) for f in frames]

    bbox = None
    for img in rgba:
        b = img.getbbox()
        if b is None:
            continue
        bbox = b if bbox is None else (
            min(bbox[0], b[0]), min(bbox[1], b[1]), max(bbox[2], b[2]), max(bbox[3], b[3])
        )
    if bbox is None:
        bbox = (0, 0, rgba[0].width, rgba[0].height)

    out: list[Image.Image] = []
    side = max(bbox[2] - bbox[0], bbox[3] - bbox[1])
    pad = int(side * 0.08)  # small margin
    side += 2 * pad
    for img in rgba:
        cropped = img.crop(bbox)
        canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        canvas.paste(cropped, ((side - cropped.width) // 2, (side - cropped.height) // 2))
        out.append(canvas.resize((size, size), Image.LANCZOS))
    return out


def save_webp(frames: list[Image.Image], path: Path, fps: int) -> None:
    duration = int(1000 / fps)
    frames[0].save(
        path,
        format="WEBP",
        save_all=True,
        append_images=frames[1:],
        duration=duration,
        loop=0,            # loop forever
        quality=80,
        method=6,
        allow_mixed=True,  # keep alpha
    )


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--base", default="Lykon/dreamshaper-8", help="SD1.5 base checkpoint (HF id)")
    ap.add_argument("--lightning", type=int, choices=[1, 2, 4, 8], default=8,
                    help="use AnimateDiff-Lightning with this step count (omit with --no-lightning)")
    ap.add_argument("--no-lightning", action="store_true", help="use standard AnimateDiff (slower, ~25 steps)")
    ap.add_argument("--steps", type=int, default=None, help="override inference steps")
    ap.add_argument("--gen-frames", type=int, default=16, help="frames AnimateDiff generates")
    ap.add_argument("--frames", type=int, default=8, help="frames kept in the final webp")
    ap.add_argument("--fps", type=int, default=4, help="playback fps (3-4 = flipbook feel)")
    ap.add_argument("--size", type=int, default=256, help="output square px")
    ap.add_argument("--guidance", type=float, default=1.8, help="CFG (1.0-2.0 for Lightning, ~7 for standard)")
    ap.add_argument("--only", default="", help="comma-separated ids to (re)generate")
    ap.add_argument("--force", action="store_true", help="overwrite existing outputs")
    args = ap.parse_args()

    DIST.mkdir(exist_ok=True)
    lightning = None if args.no_lightning else args.lightning
    steps = args.steps or (lightning if lightning else 25)
    guidance = args.guidance if lightning else max(args.guidance, 7.0)

    manifest = build_manifest()
    only = {s.strip() for s in args.only.split(",") if s.strip()}
    if only:
        manifest = [s for s in manifest if s.id in only]
    todo = [s for s in manifest if args.force or not (DIST / f"{s.id}.webp").exists()]

    if not todo:
        print("Nothing to generate (all outputs exist; use --force to redo).")
        return

    print(f"Device={DEVICE} dtype={DTYPE} | base={args.base} | "
          f"lightning={lightning} steps={steps} | {len(todo)}/{len(manifest)} to generate")
    pipe = load_pipeline(args.base, lightning)
    bg_session = new_session("u2net")

    for i, spec in enumerate(todo, 1):
        prompt = build_prompt(spec.action, spec.object)
        print(f"[{i}/{len(todo)}] {spec.id}  ::  {prompt[:80]}...")
        generator = torch.Generator(device=DEVICE).manual_seed(seed_for(spec.id))
        result = pipe(
            prompt=prompt,
            negative_prompt=NEGATIVE,
            num_frames=args.gen_frames,
            guidance_scale=guidance,
            num_inference_steps=steps,
            generator=generator,
        )
        frames = subsample(result.frames[0], args.frames)
        frames = cut_out(frames, bg_session, args.size)
        save_webp(frames, DIST / f"{spec.id}.webp", args.fps)
        frames[0].save(DIST / f"{spec.id}.poster.webp", format="WEBP", quality=85, method=6)

    print(f"\nDone. Outputs in {DIST}. Next: python sync_frontend.py")


if __name__ == "__main__":
    main()
