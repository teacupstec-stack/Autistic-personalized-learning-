# Learning during communication

The default screen is the Little Steps learning page: count stars or apples, use picture messages, or choose **Show my gesture**. **For grown-ups** reveals learner selection, memory status, model information and session logs. Speech starts muted. Personal references update automatically after the normal message confirmation; no training dashboard is shown to the learner. Camera activation remains explicit and visible. The grown-up workspace is a UI separation, not authentication.

Run `npm install` and `npm run dev` in `frontend`, then open the printed localhost URL.

1. Enter a pseudonymous learner ID and choose **Load learner**. IDs use separate browser memory.
2. Turn the camera on. The hand tracker and its WASM files are served locally.
3. Choose **Record Gesture (2.0s)** and make an intentional gesture with visible hands.
4. Confirm the suggestion or choose the correct message. Every capture requires confirmation, including confident guesses. Dismissal teaches nothing.
5. The teacher message appears on the same screen. Later captures use the learner's updated prototypes. There are no remote notifications.
6. Reuse the same learner ID and browser to resume learning. Use the delete button to clear that learner's memory.

The encoder weights stay fixed. Online adaptation updates a normalized mean prototype for each intent using the most recent 20 confirmed embeddings. An intent with no personal examples falls back to the bundled synthetic prototype. No separate enrolment session is required, but unfamiliar meanings require confirmed examples. Standalone picture selections and test dialogs do not teach the gesture memory.

Tracking resamples real video landmarks to 32 frames and follows Python's wrist-trajectory and palm-scale normalization. Poor tracking is rejected. Raw video and landmark sequences are not persisted. Only 64-dimensional confirmed embeddings, labels, and timestamps are saved in localStorage. This is browser-local storage, not an encrypted clinical record; clearing browser data removes it.

The base encoder was trained on synthetic trajectories. Real-camera performance and improvement through personalization are unvalidated. Reported softmax scores are not calibrated real-world probabilities. This implementation does not infer arbitrary movements or emotion and retains intentional capture.

Verification: `node test-personalization.mjs` from frontend tests memory isolation, bounded updates, storage errors, deletion, and normalization; `npm run build` checks TypeScript and bundles the app. A physical camera walkthrough is still required.

Hand tracker integration follows Google's official guide: https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js
Vendored WASM files come from @mediapipe/tasks-vision 0.10.32; hand_landmarker_v1.task is the float16 hand landmarker model version 1 from Google's mediapipe-models bucket.
