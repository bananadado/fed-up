# Plan: Procedural 3D & Logic-Driven Cooking Tutorials

## Objective
Replace static video links with a **Procedural 3D Tutorial System**. The system will dynamically assemble pre-generated 3D animations and UI overlays at runtime to guide the user through recipe steps, providing a high-fidelity, interactive experience that handles "failure recovery" by procedurally skipping to compatible states.

## Scope
- **3D Engine**: Integration of `react-three-fiber` / `three.js` for rendering pre-generated 3D action clips.
- **Procedural Logic**: A state machine that interprets recipe data into a sequence of 3D "Action Primitives."
- **Data Model**: A transition from "Video URLs" to "Action Flows" containing 3D IDs and parameter overrides.

## Implementation Approach

### 1. Data Model: The "Action Flow"
Recipes will no longer contain `video_url`. They will define a `procedural_flow` consisting of `Action` objects:
- **`Action` Schema**:
  - `action_id`: (e.g., `pour_liquid`, `whisk_batter`, `sear_protein`). This maps to a pre-generated 3D animation.
  - `target_object`: The ID of the 3D object (e.g., "Bowl_01") being interacted with.
  - `parameters`: Runtime overrides (e.g., `rotation: [45, 0]`, `speed: 0.8`, `color_tint: [1, 0.5, 0.5]`).
  - `fallback_id`: The ID of the next compatible action if the current one is marked "unrealistic" or "failed."

### 2. The Procedural 3D Sequencer
Instead of a video player, the app will use a **3D Scene Controller**:
- **Asset Library**: A collection of pre-generated `.glb` models with baked animations for core cooking actions.
- **Runtime Assembly**: When a step starts, the engine loads the correct 3D animation clip, applies the `parameters` (scale, rotation, speed), and "anchors" it to the recipe's specific 3D objects.
- **Hybrid UI Overlay**: High-contrast 2D UI (Framer Motion) will overlay the 3D scene to provide clear text cues (e.g., "Add 50g flour") and real-time progress bars.

### 3. Dynamic Recovery & Interaction
- **Stateful Progress**: The engine tracks "completion percentage." If a user stalls, the 3D animation can loop or pulse to provide visual feedback.
- **Procedural Skipping**: If a user indicates a "failure" (e.g., "I don't have a whisk"), the engine evaluates the `fallback_id` and procedurally transitions the 3D scene to the next viable step.

## Technical Tasks
- [ ] **Schema Update**: Update `src/prototype/types.ts` to replace `tutorial` with `procedural_flow`.
- [ ] **3D Asset Pipeline**: Define the set of "Action Primitives" (3D models + baked animations) to be pre-generated.
- [ ] **3D Scene Component**: Build a `ThreeScene` wrapper in `src/prototype/components/` using `react-three-fiber`.
- [ ] **State Machine**: Develop `useTutorialEngine.ts` to manage the transition between 3D animations and UI overlays.
- [ ] **Data Migration**: Re-seed `src/prototype/data.ts` with `procedural_flow` logic instead of video links.
- [ ] **Accessibility Audit**: Ensure 3D scene labels and 2D overlays meet high-contrast requirements.

## Success Metrics
- **Zero Video Dependency**: No external video assets are required; all visuals are rendered via 3D primitives.
- **Runtime Flexibility**: The UI/3D scene can be scaled, rotated, or skipped based on live user data.
- **Seamless Recovery**: Users can move from "failed" steps to "compatible" steps without breaking the tutorial flow.
