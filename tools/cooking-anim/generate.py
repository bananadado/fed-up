#!/usr/bin/env python3
"""Generate high-fidelity, looping cooking animations locally with a text-to-video
diffusion model and save them as looping animated WebP banners named for
procedural reference.

Backends (pick with --backend, all run on <=12 GB with sequential CPU offload):
  cogvideox2b  (default)  THUDM/CogVideoX-2b   720x480, reliable on low VRAM
  cogvideox5b             THUDM/CogVideoX-5b   720x480, higher fidelity, needs more VRAM
  ltx                     Lightricks/LTX-Video 768x512, faster, higher res

Pipeline per animation id (see pipeline/manifest.py):
  1. Build a deterministic prompt (pipeline/prompts.py) + per-id seed.
  2. text-to-video -> N frames.
  3. Subsample to the target frame count, resize to the banner width.
  4. Save dist/<id>.webp (animated, looping) + dist/<id>.poster.webp (frame 0,
     used for prefers-reduced-motion).

Output files are the contract with the frontend; run sync_frontend.py afterwards.

Usage examples:
  python generate.py --only chop_onion,fry_tofu,boil_noodles      # smoke test
  python generate.py                                              # everything missing
  python generate.py --force
  python generate.py --backend ltx --gen-width 768 --gen-height 512
  python generate.py --fps 12 --frames 24 --width 640
"""

from __future__ import annotations

import argparse
import hashlib
from pathlib import Path

import torch
from PIL import Image

from pipeline.manifest import build_manifest
from pipeline.prompts import NEGATIVE, build_prompt

ROOT = Path(__file__).parent
DIST = ROOT / "dist"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


def seed_for(anim_id: str) -> int:
    """Stable per-id seed so regenerating one clip is reproducible."""
    return int(hashlib.sha1(anim_id.encode()).hexdigest(), 16) % (2**31)


class Backend:
    """Wraps a diffusers text-to-video pipeline. Returns a list of PIL frames."""

    def __init__(self, name: str, steps: int, guidance: float, gen_frames: int,
                 gen_width: int | None, gen_height: int | None):
        self.name = name
        self.steps = steps
        self.guidance = guidance
        self.gen_frames = gen_frames
        self.gen_width = gen_width
        self.gen_height = gen_height
        self._load()

    def _load(self) -> None:
        if self.name.startswith("cogvideox"):
            from diffusers import CogVideoXPipeline

            model = "THUDM/CogVideoX-5b" if self.name == "cogvideox5b" else "THUDM/CogVideoX-2b"
            dtype = torch.bfloat16 if self.name == "cogvideox5b" else torch.float16
            self.pipe = CogVideoXPipeline.from_pretrained(model, torch_dtype=dtype)
        elif self.name == "ltx":
            from diffusers import LTXPipeline

            self.pipe = LTXPipeline.from_pretrained(
                "Lightricks/LTX-Video", torch_dtype=torch.bfloat16
            )
        else:
            raise ValueError(f"Unknown backend '{self.name}'")

        # Low-VRAM friendly: stream weights from CPU + tile the VAE.
        self.pipe.enable_sequential_cpu_offload()
        #self.pipe.to("cuda")
        if hasattr(self.pipe, "vae"):
            if hasattr(self.pipe.vae, "enable_tiling"):
                self.pipe.vae.enable_tiling()
            if hasattr(self.pipe.vae, "enable_slicing"):
                self.pipe.vae.enable_slicing()

    def render(self, prompt: str, seed: int) -> list[Image.Image]:
        generator = torch.Generator(device="cpu").manual_seed(seed)
        kwargs = dict(
            prompt=prompt,
            negative_prompt=NEGATIVE,
            num_frames=self.gen_frames,
            num_inference_steps=self.steps,
            guidance_scale=self.guidance,
            generator=generator,
        )
        if self.name == "ltx":
            kwargs["width"] = self.gen_width or 768
            kwargs["height"] = self.gen_height or 512
        return self.pipe(**kwargs).frames[0]


def subsample(frames: list[Image.Image], target: int) -> list[Image.Image]:
    if target >= len(frames):
        return frames
    step = len(frames) / target
    return [frames[min(len(frames) - 1, round(i * step))] for i in range(target)]


def resize_banner(frames: list[Image.Image], width: int) -> list[Image.Image]:
    w0, h0 = frames[0].size
    height = max(2, round(width * h0 / w0 / 2) * 2)
    return [f.convert("RGB").resize((width, height), Image.LANCZOS) for f in frames]


def save_webp(frames: list[Image.Image], path: Path, fps: int) -> None:
    duration = int(1000 / fps)
    frames[0].save(
        path,
        format="WEBP",
        save_all=True,
        append_images=frames[1:],
        duration=duration,
        loop=0,
        quality=88,
        method=6,
    )


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--backend", default="cogvideox2b",
                    choices=["cogvideox2b", "cogvideox5b", "ltx"])
    ap.add_argument("--steps", type=int, default=50, help="inference steps (quality)")
    ap.add_argument("--guidance", type=float, default=6.0)
    ap.add_argument("--gen-frames", type=int, default=49, help="frames the model renders")
    ap.add_argument("--gen-width", type=int, default=None, help="LTX render width (÷32)")
    ap.add_argument("--gen-height", type=int, default=None, help="LTX render height (÷32)")
    ap.add_argument("--frames", type=int, default=24, help="frames kept in the final webp")
    ap.add_argument("--fps", type=int, default=12, help="playback fps")
    ap.add_argument("--width", type=int, default=640, help="output banner width px")
    ap.add_argument("--only", default="", help="comma-separated ids to (re)generate")
    ap.add_argument("--force", action="store_true", help="overwrite existing outputs")
    args = ap.parse_args()

    DIST.mkdir(exist_ok=True)
    manifest = build_manifest()
    only = {s.strip() for s in args.only.split(",") if s.strip()}
    if only:
        manifest = [s for s in manifest if s.id in only]
    todo = [s for s in manifest if args.force or not (DIST / f"{s.id}.webp").exists()]

    if not todo:
        print("Nothing to generate (all outputs exist; use --force to redo).")
        return

    print(f"Device={DEVICE} | backend={args.backend} steps={args.steps} "
          f"gen_frames={args.gen_frames} | out={args.width}px {args.frames}f@{args.fps}fps "
          f"| {len(todo)}/{len(manifest)} to generate")
    if DEVICE != "cuda":
        print("WARNING: no CUDA device found — generation will be extremely slow.")

    backend = Backend(args.backend, args.steps, args.guidance,
                      args.gen_frames, args.gen_width, args.gen_height)

    for i, spec in enumerate(todo, 1):
        prompt = build_prompt(spec.action, spec.object)
        print(f"[{i}/{len(todo)}] {spec.id}  ::  {prompt[:80]}...", flush=True)
        frames = backend.render(prompt, seed_for(spec.id))
        frames = resize_banner(subsample(frames, args.frames), args.width)
        save_webp(frames, DIST / f"{spec.id}.webp", args.fps)
        frames[0].save(DIST / f"{spec.id}.poster.webp", format="WEBP", quality=90, method=6)

    print(f"\nDone. Outputs in {DIST}. Next: python sync_frontend.py")


if __name__ == "__main__":
    main()
