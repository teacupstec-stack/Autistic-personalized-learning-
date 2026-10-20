# PUSG-Fusion: Component 1 Architecture & Project Structure

## Research Context
PUSG-Fusion is Component 1 of a responsive learning-support web application for autistic learners.
It supports intentional communication via two complementary modalities:
1. Direct picture symbol selection (known meaning, zero-latency direct communication, 100% priority).
2. Individually enrolled gestures (user-specific gesture recognition with prototype matching and fusion).

The name "PUSG-Fusion" describes a proposed research approach; novelty or effectiveness is not claimed as established.

## Project Structure Overview

```text
├── frontend/               # React (TypeScript) responsive web app with Vite
│   ├── src/
│   │   ├── components/     # UI components: CountingActivity, SymbolButtons, CameraPanel, TeacherArea, ClarificationScreen, EventLog
│   │   ├── types/          # Shared TypeScript interfaces (messages, symbols, gestures, events, models)
│   │   ├── context/        # Session, Activity & Model Context
│   │   ├── services/       # Local storage, export utilities, audio feedback
│   │   ├── App.tsx         # Main Component 1 application layout
│   │   ├── main.tsx        # Entry point
│   │   └── index.css       # Design system & accessible styling
│   ├── package.json
│   └── vite.config.ts
├── data/
│   ├── schemas/            # JSON Schema definitions for recording, samples, and manifests
│   ├── d1_raw/             # Local D1 dataset recordings (kept out of Git)
│   ├── processed/          # Preprocessed tensors and split manifests (kept out of Git)
│   └── README.md
├── preprocessing/          # Python preprocessing: landmark extraction, resampling, normalization
├── training/               # PyTorch training: models, baseline encoders, fusion architectures, loss functions
├── evaluation/             # Metrics calculation: per-class F1, confusion matrix, coverage-error, calibration, latency
├── export/                 # ONNX export routines, metadata embedding, parity test runners
├── tests/                  # Unit and integration test suite (Python pytest & frontend tests)
├── docs/                   # Documentation, data dictionary, ethics and collection protocol
└── .gitignore              # Ignores large datasets, virtualenvs, local builds, and binary model checkpoints
```

## Five Core Communication Messages
1. **Help**: Requests caregiver or teacher assistance.
2. **Break**: Indicates the learner needs a pause/rest (takes immediate priority).
3. **Finished**: Indicates the learner has completed the activity or wants to end.
4. **Yes**: Affirmative response during activities or clarification.
5. **No**: Negative / refusal response (honored unconditionally).

## Core Ethical & Engineering Safeguards
- **Privacy First**: Local-only processing. Camera frames and participant data are not uploaded to remote servers.
- **Explicit Gesture Capture**: Ordinary movements are not interpreted as requests; capture requires intentional start/stop activation.
- **Symbol Priority**: Direct symbol selection is always accessible and overrides ambiguous gesture predictions.
- **Break & Refusal Guarantee**: "Break" and "No" requests are honored without requiring machine-learning approval.
- **Calibrated Clarification**: Low-confidence or conflicting inputs trigger an accessible clarification screen rather than risky guesses.
