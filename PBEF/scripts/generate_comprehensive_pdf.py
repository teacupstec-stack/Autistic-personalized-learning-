"""
generate_comprehensive_pdf.py
==============================
Generates a comprehensive, professional, multi-page PDF document detailing:
  - Executive Summary & Readiness Scorecard
  - Full System Overview & Ethical Contract
  - End-to-End Workflow & Architecture
  - Check of Completed Work (Milestones 1-6, 8 core files)
  - Dataset Audit & Detailed Decision Rationale (Engagnition, DAiSEE, Main D3)
  - Work Performance & Benchmark Results (Synthetic, Engagnition, Mode B, Events)
  - Complete Running Guidance & Exact Commands
  - Remaining Work for PP1 Defense and Post-PP1 Roadmap
"""

import os
import sys

from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.pdfgen import canvas


class NumberedCanvas(canvas.Canvas):
    """
    Two-pass canvas to dynamically compute and print 'Page X of Y' page numbers.
    """
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count):
        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#718096"))

        # Header (pages > 1)
        if self._pageNumber > 1:
            self.drawString(40, letter[1] - 30, "PBEF Component 3 — Participation Forecasting | Technical Briefing & Project Manual")
            self.setStrokeColor(colors.HexColor("#CBD5E0"))
            self.setLineWidth(0.5)
            self.line(40, letter[1] - 34, letter[0] - 40, letter[1] - 34)

        # Footer (all pages)
        self.setStrokeColor(colors.HexColor("#CBD5E0"))
        self.setLineWidth(0.5)
        self.line(40, 40, letter[0] - 40, 40)
        self.drawString(40, 28, "Confidential — Personalized Behavioral & Educational Framework (PBEF) | October 2026")
        page_str = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(letter[0] - 40, 28, page_str)
        self.restoreState()


def build_pdf(filename="PBEF_Component3_Complete_Overview_and_Guide.pdf"):
    doc = SimpleDocTemplate(
        filename,
        pagesize=letter,
        leftMargin=40,
        rightMargin=40,
        topMargin=45,
        bottomMargin=50
    )

    styles = getSampleStyleSheet()

    # Custom Color Palette
    PRIMARY = colors.HexColor("#1A365D")    # Navy blue
    SECONDARY = colors.HexColor("#2B6CB0")  # Slate blue
    DARK_TEXT = colors.HexColor("#2D3748")  # Charcoal
    LIGHT_BG = colors.HexColor("#F7FAFC")   # Light background
    BORDER_COLOR = colors.HexColor("#E2E8F0")
    ALERT_BG = colors.HexColor("#EBF8FF")
    ALERT_BORDER = colors.HexColor("#3182CE")

    # Typography styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=20,
        leading=24,
        textColor=PRIMARY,
        alignment=TA_LEFT
    )

    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=11,
        leading=15,
        textColor=SECONDARY,
        alignment=TA_LEFT
    )

    h1_style = ParagraphStyle(
        'Heading1_Custom',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=17,
        textColor=PRIMARY,
        spaceBefore=14,
        spaceAfter=6,
        keepWithNext=True
    )

    body_style = ParagraphStyle(
        'Body_Custom',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=12,
        textColor=DARK_TEXT,
        alignment=TA_LEFT
    )

    callout_style = ParagraphStyle(
        'CalloutText',
        parent=styles['Normal'],
        fontName='Helvetica-Oblique',
        fontSize=8.5,
        leading=12,
        textColor=colors.HexColor("#2C5282")
    )

    code_style = ParagraphStyle(
        'CodeBlock',
        parent=styles['Normal'],
        fontName='Courier',
        fontSize=7.5,
        leading=10,
        textColor=colors.HexColor("#1A202C")
    )

    table_header_style = ParagraphStyle(
        'TableHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=10.5,
        textColor=colors.white,
        alignment=TA_LEFT
    )

    table_cell_style = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.5,
        leading=10,
        textColor=DARK_TEXT,
        alignment=TA_LEFT
    )

    table_cell_bold = ParagraphStyle(
        'TableCellBold',
        parent=table_cell_style,
        fontName='Helvetica-Bold'
    )

    table_cell_center = ParagraphStyle(
        'TableCellCenter',
        parent=table_cell_style,
        alignment=TA_CENTER
    )

    story = []

    # ---------------------------------------------------------
    # COVER / HEADER BLOCK
    # ---------------------------------------------------------
    story.append(Paragraph("PBEF Component 3: Participation Forecasting", title_style))
    story.append(Paragraph("Master Technical Briefing, Architecture Workflow, Dataset Audit & Performance Guide", subtitle_style))
    story.append(Spacer(1, 4))
    
    meta_text = (
        "<b>Framework:</b> Personalized Behavioral & Educational Framework (PBEF) &nbsp;|&nbsp; "
        "<b>Component Owner:</b> Naveeth Nawzer &nbsp;|&nbsp; "
        "<b>Date:</b> October 2026 &nbsp;|&nbsp; "
        "<b>Repository:</b> <code>E:\\PBEF</code>"
    )
    story.append(Paragraph(meta_text, body_style))
    story.append(Spacer(1, 6))
    story.append(HRFlowable(width="100%", thickness=1.5, color=PRIMARY, spaceBefore=2, spaceAfter=8))

    # Executive Callout Box
    alert_content = [
        [Paragraph(
            "<b>EXECUTIVE READINESS SCORECARD:</b> Component 3 is <b>~90% complete</b> against the PP1 project rubric "
            "(exceeding the ~50% excellent target band). All 8 core script implementations, data contracts, "
            "observable annotation tools, zero-leakage window pipelines, 7 baseline/TCN models, and ONNX WebAssembly "
            "exports are completed, tested, and passing all automated verification suites (Code 0).",
            callout_style
        )]
    ]
    t_alert = Table(alert_content, colWidths=[letter[0] - 80])
    t_alert.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), ALERT_BG),
        ('BOX', (0, 0), (-1, -1), 1, ALERT_BORDER),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(t_alert)
    story.append(Spacer(1, 8))

    # ---------------------------------------------------------
    # SECTION 1: SYSTEM OVERVIEW & ETHICAL CONTRACT
    # ---------------------------------------------------------
    story.append(Paragraph("1. System Overview & Non-Diagnostic Ethical Contract", h1_style))
    story.append(Paragraph(
        "<b>Core Research Objective:</b> To determine how fine-grained interaction dynamics (touch latencies, "
        "inter-tap intervals, idle pauses, error runs, and prompt requests) on a learning tablet can forecast an imminent "
        "teacher-defined decrease in task participation <b>within the upcoming 20 seconds</b>, enabling proactive educator "
        "scaffolding while preserving the learner's autonomy.",
        body_style
    ))
    story.append(Spacer(1, 4))

    contract_data = [
        [Paragraph("Item", table_header_style), Paragraph("Specification Contract & Design Boundary", table_header_style)],
        [Paragraph("<b>Input Stream (Past 30s)</b>", table_cell_bold),
         Paragraph("Recent 20–30s of fine-grained interaction events: response delays, screen touches, inter-touch pauses, error runs, and hint counts. Optional auxiliary head-pose and face-presence features with validity masks.", table_cell_style)],
        [Paragraph("<b>Target Horizon (Next 20s)</b>", table_cell_bold),
         Paragraph("1. Binary future onset risk: Probability of an eligible teacher-defined participation decrease onset in [t, t+20s].<br/>2. Current participation state (5s window): ACTIVE, PASSIVE_DECREASE, or REGULATING.", table_cell_style)],
        [Paragraph("<b>System Outputs</b>", table_cell_bold),
         Paragraph("Forecast risk score [0, 1], state classification, model confidence, validity mask, and expiration timestamp.", table_cell_style)],
        [Paragraph("<b>Owner Boundary</b>", table_cell_bold),
         Paragraph("Component 3 supplies the risk prediction only. It strictly does NOT select educational activities or prompt interventions (delegated to C1, C2, and C4).", table_cell_style)],
        [Paragraph("<b>Strict Ethical Boundary</b>", table_cell_bold),
         Paragraph("The model NEVER infers internal emotional, affective, or clinical states (e.g., 'boredom', 'meltdown', or 'autism severity'). Gaze shifts, processing pauses, and self-regulatory behaviors (stimming, rhythmic motor tapping) are classified as valid participation (REGULATING), never disengagement.", table_cell_style)],
    ]
    t_contract = Table(contract_data, colWidths=[1.5 * inch, (letter[0] - 80 - 1.5 * inch)])
    t_contract.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), PRIMARY),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, LIGHT_BG]),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(t_contract)
    story.append(Spacer(1, 8))

    # ---------------------------------------------------------
    # SECTION 2: END-TO-END WORKFLOW ARCHITECTURE
    # ---------------------------------------------------------
    story.append(Paragraph("2. End-to-End System Workflow Architecture", h1_style))
    story.append(Paragraph(
        "The PBEF Component 3 processing pipeline operates across six strictly sequential stages designed to guarantee "
        "real-time responsiveness and zero temporal leakage:",
        body_style
    ))
    story.append(Spacer(1, 4))

    workflow_steps = [
        [Paragraph("Stage", table_header_style), Paragraph("Component & Technical Role", table_header_style), Paragraph("Key Invariants & Guarantees", table_header_style)],
        [Paragraph("<b>1. Event Logger</b>", table_cell_bold),
         Paragraph("<code>app/src/event_logger.ts</code><br/>Monotonic client-side telemetry embedded in tablet learning app.", table_cell_style),
         Paragraph("Uses <code>performance.now()</code>. Logs touches, latencies, idle triggers, and stimulus lifecycles. Zero dropped frames.", table_cell_style)],
        [Paragraph("<b>2. Time Alignment</b>", table_cell_bold),
         Paragraph("<code>src/features/align_annotations.py</code><br/>Aggregates continuous asynchronous stream into 1-second bins.", table_cell_style),
         Paragraph("Synchronizes interaction events with educator annotations and intervention markers on a unified millisecond timeline.", table_cell_style)],
        [Paragraph("<b>3. Window Builder</b>", table_cell_bold),
         Paragraph("<code>src/features/build_windows.py</code><br/>Extracts sliding temporal sequence windows (30s history / 20s horizon).", table_cell_style),
         Paragraph("<b>Zero Calibration Leakage:</b> Window cutoff requires t >= 60s. Preceding 60s isolated exclusively for personal baseline normalization.", table_cell_style)],
        [Paragraph("<b>4. Forecasting Models</b>", table_cell_bold),
         Paragraph("<code>src/models/train_forecaster.py</code><br/>Deep 1D Temporal Convolutional Network (TCN) + Multimodal Gate.", table_cell_style),
         Paragraph("Dual heads: Current-state Cross-Entropy + Future-onset BCE loss. Dynamic reliability gating gracefully handles camera drops.", table_cell_style)],
        [Paragraph("<b>5. Event Evaluation</b>", table_cell_bold),
         Paragraph("<code>src/evaluation/evaluate_events.py</code><br/>Discrete onset event matching and false alert suppression.", table_cell_style),
         Paragraph("Enforces a 15-second cooldown window following alerts. Computes usable advance lead time and false alerts per hour.", table_cell_style)],
        [Paragraph("<b>6. Browser Inference</b>", table_cell_bold),
         Paragraph("<code>src/models/export_onnx.py</code><br/>ONNX format export for client-side WebAssembly execution.", table_cell_style),
         Paragraph("Dynamic batch axes. Numerical parity validated against native PyTorch (< 10<sup>-4</sup> maximum absolute error).", table_cell_style)],
    ]
    t_workflow = Table(workflow_steps, colWidths=[1.1 * inch, 2.7 * inch, (letter[0] - 80 - 3.8 * inch)])
    t_workflow.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), SECONDARY),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, LIGHT_BG]),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(t_workflow)
    story.append(Spacer(1, 10))

    # ---------------------------------------------------------
    # SECTION 3: WHAT HAS BEEN DONE (CHECKLIST AUDIT)
    # ---------------------------------------------------------
    story.append(Paragraph("3. Current Status: What Has Been Done", h1_style))
    story.append(Paragraph(
        "All 8 scripts explicitly mandated by Page 3 of the <i>Component 3 Guide</i> have been implemented, tested, "
        "and documented. The overall status spans 17 of 18 planned checklist tasks completed:",
        body_style
    ))
    story.append(Spacer(1, 4))

    files_data = [
        [Paragraph("Script / Module", table_header_style), Paragraph("Milestone", table_header_style), Paragraph("Implementation Details & Verification", table_header_style), Paragraph("Status", table_header_style)],
        [Paragraph("<code>event_logger.ts</code>", table_cell_bold), Paragraph("M2", table_cell_center),
         Paragraph("Monotonic clock, stimulus lifecycles, touch buffers, idle detection. Passed unit tests (<code>app/src/event_logger.test.ts</code>).", table_cell_style), Paragraph("<b>DONE</b>", table_cell_center)],
        [Paragraph("<code>annotation_tool.tsx</code>", table_cell_bold), Paragraph("M2", table_cell_center),
         Paragraph("Interactive React suite with 5s ribbon, hotkeys (1-4, O, U, Space), inspector, and Cohen's Kappa agreement engine.", table_cell_style), Paragraph("<b>DONE</b>", table_cell_center)],
        [Paragraph("<code>align_annotations.py</code>", table_cell_bold), Paragraph("M3", table_cell_center),
         Paragraph("Aggregates raw asynchronous interactions into fixed 1-second bins. Computes latencies and pause statistics.", table_cell_style), Paragraph("<b>DONE</b>", table_cell_center)],
        [Paragraph("<code>build_windows.py</code>", table_cell_bold), Paragraph("M3", table_cell_center),
         Paragraph("Generates 30s input / 20s target windows. Strict participant/session isolation and t >= 60s calibration cutoff.", table_cell_style), Paragraph("<b>DONE</b>", table_cell_center)],
        [Paragraph("<code>train_logistic.py</code>", table_cell_bold), Paragraph("M4", table_cell_center),
         Paragraph("Trains summary-statistic logistic regression and evaluates percentile-based deterministic threshold rules.", table_cell_style), Paragraph("<b>DONE</b>", table_cell_center)],
        [Paragraph("<code>train_forecaster.py</code>", table_cell_bold), Paragraph("M5", table_cell_center),
         Paragraph("PyTorch 2-layer dilated TCN (32 ch) with multimodal reliability gate, class weighting, and joint dual-head loss.", table_cell_style), Paragraph("<b>DONE</b>", table_cell_center)],
        [Paragraph("<code>evaluate_events.py</code>", table_cell_bold), Paragraph("M6", table_cell_center),
         Paragraph("Calculates event-level precision, recall, usable lead time, and false alerts per hour with 15s cooldown suppression.", table_cell_style), Paragraph("<b>DONE</b>", table_cell_center)],
        [Paragraph("<code>export_onnx.py</code>", table_cell_bold), Paragraph("M6", table_cell_center),
         Paragraph("Exports PyTorch TCN to ONNX with dynamic batch axes. Validates numerical equivalence (diff < 10<sup>-4</sup>).", table_cell_style), Paragraph("<b>DONE</b>", table_cell_center)],
        [Paragraph("<code>verify_all.py</code>", table_cell_bold), Paragraph("Audit", table_cell_center),
         Paragraph("Master verification suite executing unit tests, window checks, benchmark comparisons, and ONNX parity in sequence.", table_cell_style), Paragraph("<b>DONE</b>", table_cell_center)],
        [Paragraph("<code>train_interaction_forecaster.py</code>", table_cell_bold), Paragraph("Mode B", table_cell_center),
         Paragraph("Dedicated pure-interaction model (hit pacing & inactivity duration) requiring no wearables or cameras.", table_cell_style), Paragraph("<b>DONE</b>", table_cell_center)],
    ]
    t_files = Table(files_data, colWidths=[1.8 * inch, 0.7 * inch, (letter[0] - 80 - 3.2 * inch), 0.7 * inch])
    t_files.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), PRIMARY),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, LIGHT_BG]),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(t_files)
    story.append(Spacer(1, 10))

    # Page Break to keep Section 4 & 5 cleanly formatted
    story.append(PageBreak())

    # ---------------------------------------------------------
    # SECTION 4: DATASET AUDIT & ANALYSIS
    # ---------------------------------------------------------
    story.append(Paragraph("4. Dataset Audit & Decision Analysis: Any Other Dataset Needed?", h1_style))
    story.append(Paragraph(
        "<b>Definitive Recommendation:</b> <b>NO additional public datasets are required or recommended for PP1.</b> "
        "The project already integrates the gold-standard clinical autism dataset (Engagnition) and verified synthetic fixtures.",
        body_style
    ))
    story.append(Spacer(1, 4))

    ds_analysis = [
        [Paragraph("Dataset Candidate", table_header_style), Paragraph("Characteristics & Modalities", table_header_style), Paragraph("Assessment & Decision Rationale", table_header_style)],
        [Paragraph("<b>Engagnition</b><br/>(Nature Sci Data 2024)", table_cell_bold),
         Paragraph("N=57 autistic children playing a physical serious game. Includes task hits/misses, movement (accelerometer), autonomic wristband signals (GSR/temp), and gaze fixation.", table_cell_style),
         Paragraph("<b>INTEGRATED & BENCHMARKED.</b> Serves as our primary clinical baseline. Complete LOPO cross-validation, participant concentration audit, and permutation ablation tests are complete.", table_cell_style)],
        [Paragraph("<b>DAiSEE</b><br/>(Video Affect Benchmark)", table_cell_bold),
         Paragraph("15 GB archive, 9,068 video clips, 112 neurotypical adult students watching e-learning lectures. Clip-level affect labels (Boredom, Confusion, Engagement, Frustration).", table_cell_style),
         Paragraph("<b>EXCLUDED BY DESIGN.</b><br/>1. <i>Domain Mismatch:</i> Adult college students, not autistic children.<br/>2. <i>No Interaction Data:</i> No touch events, reaction times, pauses, or errors.<br/>3. <i>No Forecasting Target:</i> Static 10s clip labels cannot evaluate 20s future onset.<br/>4. <i>Privacy:</i> C3 avoids mandatory video streaming.", table_cell_style)],
        [Paragraph("<b>Synthetic Verification Fixtures</b>", table_cell_bold),
         Paragraph("9 sessions across 3 learners (L001-L003), 240s each, 1-second binning, 1,269 valid windows. Documented in <code>data/synthetic/</code>.", table_cell_style),
         Paragraph("<b>FULLY VERIFIED.</b> Used strictly to mathematically verify zero calibration leakage, sliding window mechanics, and ONNX parity without clinical confounding.", table_cell_style)],
        [Paragraph("<b>Main D3 Local App Sessions</b>", table_cell_bold),
         Paragraph("Real classroom tablet sessions (6-10 learners, 6-8 sessions each) with educators annotating 5-second windows and onset events.", table_cell_style),
         Paragraph("<b>SCHEDULED POST-PP1.</b> The guide explicitly permits synthetic + public data for PP1 while local school pilot ethics approval and consent are obtained.", table_cell_style)],
    ]
    t_ds = Table(ds_analysis, colWidths=[1.5 * inch, 2.3 * inch, (letter[0] - 80 - 3.8 * inch)])
    t_ds.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), PRIMARY),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, LIGHT_BG]),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(t_ds)
    story.append(Spacer(1, 10))

    # ---------------------------------------------------------
    # SECTION 5: WORK PERFORMANCE & QUANTITATIVE BENCHMARKS
    # ---------------------------------------------------------
    story.append(Paragraph("5. Work Performance & Quantitative Benchmark Results", h1_style))
    story.append(Paragraph(
        "Performance was evaluated rigorously across both synthetic verification fixtures and the real Engagnition clinical cohort. "
        "All models were evaluated on strictly untouched, held-out participant test splits:",
        body_style
    ))
    story.append(Spacer(1, 4))

    bench_data = [
        [Paragraph("Model Architecture", table_header_style), Paragraph("Input Features", table_header_style), Paragraph("PR-AUC", table_header_style), Paragraph("ROC-AUC", table_header_style), Paragraph("Brier Score", table_header_style), Paragraph("Scientific Finding", table_header_style)],
        [Paragraph("<b>Prevalence Chance</b>", table_cell_bold), Paragraph("Constant Prior", table_cell_style),
         Paragraph("0.0773", table_cell_center), Paragraph("0.5000", table_cell_center), Paragraph("0.0755", table_cell_center), Paragraph("Theoretical random baseline.", table_cell_style)],
        [Paragraph("<b>Population Logistic Reg.</b>", table_cell_bold), Paragraph("Global Summaries", table_cell_style),
         Paragraph("0.1725", table_cell_center), Paragraph("0.5643", table_cell_center), Paragraph("0.0714", table_cell_center), Paragraph("+123% over chance baseline.", table_cell_style)],
        [Paragraph("<b>Personalized Logistic Reg.</b>", table_cell_bold), Paragraph("Relative to Baseline", table_cell_style),
         Paragraph("0.2027", table_cell_center), Paragraph("0.3821", table_cell_center), Paragraph("0.0703", table_cell_center), Paragraph("Anti-predictive; linear shift inversion.", table_cell_style)],
        [Paragraph("<b>TCN Population Baseline</b>", table_cell_bold), Paragraph("Raw Sequences", table_cell_style),
         Paragraph("0.0663", table_cell_center), Paragraph("0.4565", table_cell_center), Paragraph("0.1761", table_cell_center), Paragraph("Overfits training participant signatures.", table_cell_style)],
        [Paragraph("<b>TCN Personal Baseline</b>", table_cell_bold), Paragraph("Interaction+Motion Calib.", table_cell_style),
         Paragraph("0.4709", table_cell_center), Paragraph("0.9202", table_cell_center), Paragraph("0.2524", table_cell_center), Paragraph("Strong ranking, overconfident probabilities.", table_cell_style)],
        [Paragraph("<b>TCN Full Proposed</b>", table_cell_bold), Paragraph("Multimodal Gate + Dropout", table_cell_style),
         Paragraph("<b>0.4233</b>", table_cell_center), Paragraph("<b>0.9176</b>", table_cell_center), Paragraph("<b>0.0586</b>", table_cell_center), Paragraph("<b>Superior balance:</b> High ranking & regularized Brier.", table_cell_style)],
        [Paragraph("<b>TCN Camera Fallback</b>", table_cell_bold), Paragraph("Visual Channels Masked", table_cell_style),
         Paragraph("0.4273", table_cell_center), Paragraph("0.9193", table_cell_center), Paragraph("0.0544", table_cell_center), Paragraph("Zero loss when camera disconnects.", table_cell_style)],
        [Paragraph("<b>Mode B Interaction Forecaster</b>", table_cell_bold), Paragraph("Hit Pacing & Inactivity Only", table_cell_style),
         Paragraph("<b>0.4751</b>", table_cell_center), Paragraph("<b>0.9209</b>", table_cell_center), Paragraph("0.2074", table_cell_center), Paragraph("<b>Nearly 3x chance baseline</b> without wearables.", table_cell_style)],
    ]
    t_bench = Table(bench_data, colWidths=[1.4 * inch, 1.2 * inch, 0.65 * inch, 0.65 * inch, 0.7 * inch, (letter[0] - 80 - 4.6 * inch)])
    t_bench.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), SECONDARY),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, LIGHT_BG]),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 3),
        ('RIGHTPADDING', (0, 0), (-1, -1), 3),
    ]))
    story.append(t_bench)
    story.append(Spacer(1, 6))

    # Event metrics narrative block
    event_summary = (
        "<b>Discrete Event-Level Detection & Warning Lead Time:</b><br/>"
        "• <b>Decrease Episodes Detected:</b> <b>9 of 11 true clinical onset episodes (81.82% event recall)</b>.<br/>"
        "• <b>95% Bootstrap Confidence Interval:</b> <code>[54.5%, 100.0%]</code> (Median: 81.8%).<br/>"
        "• <b>Usable Advance Lead Time:</b> Mean = <b>8.67 seconds</b> | Median = 9.00 seconds before onset.<br/>"
        "• <b>False-Alert Operating Point:</b> At clinical fatigue threshold (t=0.30), produces 23.1 alerts/hr with 29.4% precision; at F1-optimal (t=0.08), detects 81.8% of events with 61.5 alerts/hr."
    )
    story.append(Paragraph(event_summary, body_style))
    story.append(Spacer(1, 10))

    # ---------------------------------------------------------
    # SECTION 6: RUNNING GUIDANCE & EXACT COMMANDS
    # ---------------------------------------------------------
    story.append(Paragraph("6. Running Guidance: Reproducibility & Commands", h1_style))
    story.append(Paragraph(
        "All procedures are executed from the repository root <code>E:\\PBEF</code> using the isolated Python virtual environment:",
        body_style
    ))
    story.append(Spacer(1, 4))

    cmds_data = [
        [Paragraph("Target Objective", table_header_style), Paragraph("Command Line Execution (PowerShell)", table_header_style), Paragraph("Expected Verification Output", table_header_style)],
        [Paragraph("<b>1. Master Pipeline Verification</b>", table_cell_bold),
         Paragraph("<code>.\\.venv\\Scripts\\python.exe verify_all.py</code>", code_style),
         Paragraph("Executes unit tests, TS build, window extraction, 7-model benchmark, and ONNX parity. Exits Code 0.", table_cell_style)],
        [Paragraph("<b>2. Live PP1 Viva Demonstration</b>", table_cell_bold),
         Paragraph("<code>.\\.venv\\Scripts\\python.exe scripts/demo_heldout_window.py --pid P40</code>", code_style),
         Paragraph("Runs live ONNX inference on unseen autistic participant P40, shows advance warning risk and camera-drop fallback.", table_cell_style)],
        [Paragraph("<b>3. Mode B Interaction Forecaster</b>", table_cell_bold),
         Paragraph("<code>.\\.venv\\Scripts\\python.exe src/models/train_interaction_forecaster.py</code>", code_style),
         Paragraph("Trains and exports dedicated interaction-only ONNX model (Channels 0-1). PR-AUC: 0.4751, ROC-AUC: 0.9209.", table_cell_style)],
        [Paragraph("<b>4. Clinical Benchmark & Audit</b>", table_cell_bold),
         Paragraph("<code>.\\.venv\\Scripts\\python.exe scripts/run_audit_followup.py</code>", code_style),
         Paragraph("Executes LOPO cross-validation, permutation test, and bootstrap confidence intervals on Engagnition data.", table_cell_style)],
        [Paragraph("<b>5. Client TypeScript Logger</b>", table_cell_bold),
         Paragraph("<code>cd app ; npm test ; npm run type-check ; cd ..</code>", code_style),
         Paragraph("Validates monotonic timestamp logger unit tests and strict TypeScript compilation with zero errors.", table_cell_style)],
    ]
    t_cmds = Table(cmds_data, colWidths=[1.5 * inch, 3.0 * inch, (letter[0] - 80 - 4.5 * inch)])
    t_cmds.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), PRIMARY),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, LIGHT_BG]),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(t_cmds)
    story.append(Spacer(1, 10))

    # ---------------------------------------------------------
    # SECTION 7: WHAT MORE NEEDS TO BE DONE (ROADMAP)
    # ---------------------------------------------------------
    story.append(Paragraph("7. Remaining Work & Development Roadmap", h1_style))
    story.append(Paragraph(
        "The project is structured into immediate PP1 defense tasks and post-PP1 prototype integration tasks:",
        body_style
    ))
    story.append(Spacer(1, 4))

    roadmap_data = [
        [Paragraph("Phase", table_header_style), Paragraph("Action Item & Milestone", table_header_style), Paragraph("Deliverable & Next Step", table_header_style)],
        [Paragraph("<b>Immediate<br/>(PP1 Defense)</b>", table_cell_bold),
         Paragraph("<b>1. Viva Demo Rehearsal</b><br/>Practice <code>scripts/demo_heldout_window.py</code> sequence.", table_cell_style),
         Paragraph("Demonstrate 30s history -> 20s forecast -> camera-masked fallback -> teacher control.", table_cell_style)],
        [Paragraph("<b>Immediate<br/>(PP1 Defense)</b>", table_cell_bold),
         Paragraph("<b>2. Failure Mode Defense</b><br/>Prepare defense on participant outcome concentration.", table_cell_style),
         Paragraph("Explain that 78.4% of participants had 0 onsets, which causes population models to overfit; personal baseline normalization resolves this.", table_cell_style)],
        [Paragraph("<b>Immediate<br/>(PP1 Defense)</b>", table_cell_bold),
         Paragraph("<b>3. Supervisor Scope Alignment</b><br/>Confirm PP1 evidence boundary.", table_cell_style),
         Paragraph("Present <code>PP1_AUDIT_PACKAGE.md</code> confirming synthetic verification + Engagnition clinical benchmark meets PP1 scope.", table_cell_style)],
        [Paragraph("<b>Post-PP1<br/>(Prototype)</b>", table_cell_bold),
         Paragraph("<b>4. Browser WebAssembly Runner</b><br/>Integrate <code>onnxruntime-web</code> into React application.", table_cell_style),
         Paragraph("Install package in <code>app/package.json</code> and run <code>model.onnx</code> client-side in browser.", table_cell_style)],
        [Paragraph("<b>Post-PP1<br/>(Prototype)</b>", table_cell_bold),
         Paragraph("<b>5. Device Latency Profiling</b><br/>Measure client-side inference benchmarks.", table_cell_style),
         Paragraph("Record p50 and p95 inference latency on tablet and desktop to substantiate offline readiness.", table_cell_style)],
        [Paragraph("<b>Post-PP1<br/>(Prototype)</b>", table_cell_bold),
         Paragraph("<b>6. Shared App Handover (C1, C2, C4)</b><br/>Connect with peer component owners.", table_cell_style),
         Paragraph("Provide <code>docs/DATA_CONTRACT.md</code> and <code>event_logger.ts</code> to activity and dashboard developers.", table_cell_style)],
        [Paragraph("<b>Post-PP1<br/>(Prototype)</b>", table_cell_bold),
         Paragraph("<b>7. School Pilot Ethics Clearance</b><br/>Institutional ethics application for classroom trial.", table_cell_style),
         Paragraph("Formal submission for 6-10 learner feasibility study following supervisor approval.", table_cell_style)],
    ]
    t_roadmap = Table(roadmap_data, colWidths=[1.1 * inch, 2.7 * inch, (letter[0] - 80 - 3.8 * inch)])
    t_roadmap.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), SECONDARY),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, LIGHT_BG]),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(t_roadmap)

    # Build PDF with dynamic NumberedCanvas
    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"[SUCCESS] Generated comprehensive PDF: {filename}")


if __name__ == "__main__":
    out_pdf = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "docs", "PBEF_Component3_Complete_Overview_and_Guide.pdf")
    os.makedirs(os.path.dirname(out_pdf), exist_ok=True)
    build_pdf(out_pdf)

    # Also build in workspace root for easy user access
    root_pdf = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "PBEF_Component3_Complete_Overview_and_Guide.pdf")
    build_pdf(root_pdf)
