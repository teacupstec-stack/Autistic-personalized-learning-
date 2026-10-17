# verify_all.ps1
# ==============================================================================
# Component 3 (PBEF) — Safe PowerShell Verification Script
# Executes each pipeline step sequentially and halts immediately if any check fails.
# ==============================================================================

$ErrorActionPreference = "Stop"

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "  PBEF Component 3: Participation Forecasting — Verification Suite" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan

# Step 1: Python Pipeline Unit Tests
Write-Host "`n[Step 1/6] Running Python unit tests..." -ForegroundColor Yellow
& .venv\Scripts\python.exe tests/test_pipeline.py
if ($LASTEXITCODE -ne 0) { throw "Python unit tests failed!" }
Write-Host "  -> Python tests passed." -ForegroundColor Green

# Step 2: Client-Side Event Logger Tests
Write-Host "`n[Step 2/6] Running client logger tests and type-checking..." -ForegroundColor Yellow
Set-Location app
& npm test
if ($LASTEXITCODE -ne 0) { Set-Location ..; throw "Client tests failed!" }

& npm run type-check
if ($LASTEXITCODE -ne 0) { Set-Location ..; throw "Type checking failed!" }
Set-Location ..
Write-Host "  -> Client tests and type-checking passed." -ForegroundColor Green

# Step 3: Dataset Window Extraction (t >= 60s, Zero-Leakage)
Write-Host "`n[Step 3/6] Building temporal windows..." -ForegroundColor Yellow
& .venv\Scripts\python.exe src/features/build_windows.py --aligned_dir data/synthetic --output_dir data/synthetic
if ($LASTEXITCODE -ne 0) { throw "Window building failed!" }
Write-Host "  -> Windows built successfully." -ForegroundColor Green

# Step 4: Run 7-Model Benchmark & Event-Level Evaluator
Write-Host "`n[Step 4/6] Executing 7-model head-to-head benchmark & event evaluation..." -ForegroundColor Yellow
& .venv\Scripts\python.exe src/models/run_benchmark_comparison.py
if ($LASTEXITCODE -ne 0) { throw "Benchmark execution failed!" }
Write-Host "  -> Benchmark completed successfully." -ForegroundColor Green

# Step 5: Export ONNX & Multi-Case Parity Check
Write-Host "`n[Step 5/6] Exporting ONNX model and verifying numerical parity..." -ForegroundColor Yellow
& .venv\Scripts\python.exe src/models/export_onnx.py
if ($LASTEXITCODE -ne 0) { throw "ONNX export or numerical parity failed!" }
Write-Host "  -> ONNX export and parity check passed." -ForegroundColor Green

# Step 6: Master Audit Assertions
Write-Host "`n[Step 6/6] Running partition and metric audit assertions..." -ForegroundColor Yellow
& .venv\Scripts\python.exe -c "
import json, numpy as np, pandas as pd
bench = json.load(open('results/metrics/benchmark_comparison.json'))
event = json.load(open('results/metrics/event_metrics.json'))
man = pd.read_csv('data/synthetic/window_manifest.csv')
assert len(bench) == 7, f'Expected 7 models, got {len(bench)}'
assert event['total_true_onset_episodes'] == 3, f'Expected 3 true onsets, got {event[\"total_true_onset_episodes\"]}'
assert event['true_positives_matched'] == 3, f'Expected 3 matched alerts, got {event[\"true_positives_matched\"]}'
assert man['cutoff_time_ms'].min() >= 60000, 'Temporal leakage detected: window < 60s!'
print('All master audit assertions verified!')
"
if ($LASTEXITCODE -ne 0) { throw "Audit assertions failed!" }
Write-Host "  -> Master audit assertions verified." -ForegroundColor Green

Write-Host "`n=================================================================" -ForegroundColor Cyan
Write-Host "  ALL VERIFICATION CHECKS PASSED (EXIT CODE 0)!" -ForegroundColor Green
Write-Host "  Pipeline is fully verified, leak-free, and PP1-ready." -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Cyan
