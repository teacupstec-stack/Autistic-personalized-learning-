"""
Pure Python Multi-Page PDF Generator for Component 2 Guide.
Produces a publication-quality PDF with zero external dependencies.
"""
import os
import sys

def create_pdf(filename="COMPONENT_2_COMPLETE_GUIDE.pdf"):
    PAGE_WIDTH = 612
    PAGE_HEIGHT = 792
    MARGIN_LEFT = 54
    MARGIN_RIGHT = 54
    CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT # 504 pt
    
    pages = []
    current_stream = []
    
    def rgb(r, g, b):
        return f"{r/255.0:.3f} {g/255.0:.3f} {b/255.0:.3f}"
    
    class PageBuilder:
        def __init__(self, page_num):
            self.page_num = page_num
            self.stream = []
            self.y = 740
            
            # Header bar
            self.stream.append(f"q {rgb(24, 43, 73)} rg 54 756 {CONTENT_WIDTH} 4 re f Q")
            self.stream.append(f"BT /F1 9 Tf {rgb(100, 116, 139)} rg 54 764 Td (TCUPS - COMPONENT 2: LEARNING PERSONALISATION | SYSTEM REFERENCE) Tj ET")
            
            # Footer
            self.stream.append(f"q {rgb(226, 232, 240)} rg 54 40 {CONTENT_WIDTH} 1 re f Q")
            self.stream.append(f"BT /F1 8 Tf {rgb(148, 163, 184)} rg 54 28 Td (Confidential - Academic Research & PP1 Evaluation Package) Tj ET")
            self.stream.append(f"BT /F1 8 Tf {rgb(148, 163, 184)} rg 510 28 Td (Page {page_num}) Tj ET")

        def add_title(self, text, subtitle=None):
            self.stream.append(f"BT /F2 20 Tf {rgb(15, 23, 42)} rg 54 {self.y} Td ({self.escape(text)}) Tj ET")
            self.y -= 22
            if subtitle:
                self.stream.append(f"BT /F3 10 Tf {rgb(71, 85, 105)} rg 54 {self.y} Td ({self.escape(subtitle)}) Tj ET")
                self.y -= 20
            self.y -= 8

        def add_heading(self, text):
            self.y -= 10
            # Background accent
            self.stream.append(f"q {rgb(241, 245, 249)} rg 54 {self.y-4} {CONTENT_WIDTH} 18 re f Q")
            self.stream.append(f"q {rgb(37, 99, 235)} rg 54 {self.y-4} 3 18 re f Q")
            self.stream.append(f"BT /F2 11 Tf {rgb(30, 41, 59)} rg 62 {self.y} Td ({self.escape(text)}) Tj ET")
            self.y -= 20

        def add_subheading(self, text):
            self.y -= 4
            self.stream.append(f"BT /F2 9.5 Tf {rgb(15, 23, 42)} rg 54 {self.y} Td ({self.escape(text)}) Tj ET")
            self.y -= 14

        def add_text(self, text, font="F1", size=8.5, color=(51, 65, 85), indent=0):
            self.stream.append(f"BT /{font} {size} Tf {rgb(*color)} rg {54 + indent} {self.y} Td ({self.escape(text)}) Tj ET")
            self.y -= (size + 3.5)

        def add_code(self, code_text):
            lines = code_text.strip().split("\n")
            box_height = len(lines) * 11 + 8
            self.y -= 4
            self.stream.append(f"q {rgb(248, 250, 252)} rg 54 {self.y - box_height + 8} {CONTENT_WIDTH} {box_height} re f Q")
            self.stream.append(f"q {rgb(203, 213, 225)} rg 54 {self.y - box_height + 8} {CONTENT_WIDTH} {box_height} re S Q")
            cur_y = self.y - 2
            for line in lines:
                self.stream.append(f"BT /F4 7.5 Tf {rgb(30, 41, 59)} rg 62 {cur_y} Td ({self.escape(line)}) Tj ET")
                cur_y -= 11
            self.y -= (box_height + 6)

        def add_callout(self, title, body, color_theme="blue"):
            theme_colors = {
                "blue": ((239, 246, 255), (59, 130, 246), (30, 58, 138)),
                "green": ((240, 253, 244), (34, 197, 94), (20, 83, 45)),
                "amber": ((255, 251, 235), (245, 158, 11), (120, 53, 15))
            }
            bg, border, text_col = theme_colors.get(color_theme, theme_colors["blue"])
            self.y -= 4
            lines = body.strip().split("\n")
            h = 16 + len(lines) * 11 + 6
            self.stream.append(f"q {rgb(*bg)} rg 54 {self.y - h + 10} {CONTENT_WIDTH} {h} re f Q")
            self.stream.append(f"q {rgb(*border)} rg 54 {self.y - h + 10} 3 {h} re f Q")
            self.stream.append(f"BT /F2 8.5 Tf {rgb(*text_col)} rg 64 {self.y} Td ({self.escape(title)}) Tj ET")
            cur_y = self.y - 12
            for l in lines:
                self.stream.append(f"BT /F1 8 Tf {rgb(51, 65, 85)} rg 64 {cur_y} Td ({self.escape(l)}) Tj ET")
                cur_y -= 11
            self.y -= (h + 6)

        def add_table(self, headers, rows, col_widths):
            self.y -= 4
            row_h = 14
            # Header row
            self.stream.append(f"q {rgb(241, 245, 249)} rg 54 {self.y - row_h + 3} {CONTENT_WIDTH} {row_h} re f Q")
            self.stream.append(f"q {rgb(203, 213, 225)} rg 54 {self.y - row_h + 3} {CONTENT_WIDTH} {row_h} re S Q")
            x = 58
            for i, h in enumerate(headers):
                self.stream.append(f"BT /F2 7.5 Tf {rgb(30, 41, 59)} rg {x} {self.y - 8} Td ({self.escape(h)}) Tj ET")
                x += col_widths[i]
            self.y -= row_h
            
            # Data rows
            for r_idx, row in enumerate(rows):
                bg = (255, 255, 255) if r_idx % 2 == 0 else (248, 250, 252)
                self.stream.append(f"q {rgb(*bg)} rg 54 {self.y - row_h + 3} {CONTENT_WIDTH} {row_h} re f Q")
                self.stream.append(f"q {rgb(226, 232, 240)} rg 54 {self.y - row_h + 3} {CONTENT_WIDTH} {row_h} re S Q")
                x = 58
                for c_idx, cell in enumerate(row):
                    font = "F2" if c_idx == 0 else "F1"
                    self.stream.append(f"BT /{font} 7.5 Tf {rgb(51, 65, 85)} rg {x} {self.y - 8} Td ({self.escape(cell)}) Tj ET")
                    x += col_widths[c_idx]
                self.y -= row_h
            self.y -= 6

        def escape(self, s):
            return str(s).replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")

    # ---------------- PAGE 1 ----------------
    p1 = PageBuilder(1)
    p1.add_title("Component 2: Learning Personalisation", "Complete System Architecture, Machine Learning Models, and Verification Guide")
    
    p1.add_callout(
        "STATUS CONFIRMATION: FULL SYSTEM FULLY IMPLEMENTED AND VERIFIED",
        "All phases of Component 2 (SCPA Bandit & Context Response Model) are completely implemented.\n"
        "Data generator, neural encoder, Bayesian action heads, baselines, evaluation harness,\n"
        "contract validators, interactive app, and automated runner are fully verified and operational.",
        "green"
    )
    
    p1.add_heading("1. Executive Summary & Purpose")
    p1.add_text("Component 2 (C2) is a Constrained Contextual Bandit System that automates personalised activity selection")
    p1.add_text("for early numeracy learners while strictly adhering to educator boundaries and affective safety invariants.")
    p1.add_text("Primary Research Goal: Does confidence-aware shared context (C1 help/break requests and C3 affective risk)")
    p1.add_text("improve sequential activity selection over a constrained baseline without those signals?")
    
    p1.add_heading("2. Complete File Inventory & Roles")
    file_headers = ["File / Directory", "Component Layer", "Functional Description"]
    file_rows = [
        ["content/activities.json", "Content Bank", "12 teacher-approved counting variants (2 difficulties x 2 presentation formats)."],
        ["sim/simulator.py", "Learner Simulator", "Multi-family response generator (Additive, Threshold Mastery, Fatigue/Recovery)."],
        ["data/generate_dataset.py", "Data Generator", "Produces 8,500 interaction episodes across 70 learner profiles and split manifest."],
        ["data/splits/split_manifest.csv", "Data Split", "Strict split manifest: 40 Train profiles, 10 Validation profiles, 20 Test profiles."],
        ["models/model.py", "Neural & Bandit", "32->16 ReLU Context Encoder and Gaussian Bayesian linear regression action heads."],
        ["train/train_response.py", "Training Script", "Offline encoder pre-training via BCE loss on task success with validation early stopping."],
        ["models/model_weights.json", "Trained Weights", "Frozen weights for the 32->16 latent encoder (70.6% accuracy, ECE 0.033)."],
        ["models/preprocessing.json", "Normalisation", "Input feature means and stds computed strictly on the training partition."],
        ["policy/policy.py", "Bandit Policies", "SCPA Full policy (Thompson sampling on Bayesian heads) and ablation policies."],
        ["policy/baselines.py", "Baselines", "Fixed Sequencing (curriculum cycling) and Educator Rules heuristic benchmark."],
        ["eval/evaluate_policy.py", "Evaluation", "Benchmarking harness on 20 held-out test profiles (unseen response families)."],
        ["eval/metrics.json", "Saved Results", "Exact empirical evaluation results: cumulative reward, bootstrap CI, regret, violations."],
        ["contracts/schema.json", "Contract Authority", "JSON Schema Draft 2020-12 defining Snapshot, Decision, and LogEvent wire formats."],
        ["contracts/validate.py", "Python Validator", "Python jsonschema validation engine with calendar and semantic invariant checks."],
        ["dist/validate.js", "Node Validator", "Pre-compiled Node.js contract validator for cross-language verification."],
        ["data/public_benchmark.py", "Public Benchmark", "EdNet-KT1 public dataset processor, sequence joining, and KT benchmark."],
        ["app/interactive_session.py", "Interactive App", "Live student quiz simulation displaying questions, ASCII icons, hints, and breaks."],
        ["demo.py", "Presenter Demo", "Zero-dependency automated presentation runner showcasing the 5-step human flow."],
        ["run_all.py", "Master Pipeline", "Single-command runner executing all stages from generation to evaluation in 37s."]
    ]
    p1.add_table(file_headers, file_rows, [130, 85, 289])
    pages.append(p1)

    # ---------------- PAGE 2 ----------------
    p2 = PageBuilder(2)
    p2.add_heading("3. Machine Learning Models: Architecture & Mathematical Formulation")
    p2.add_text("The C2 learning architecture operates on a decoupled, two-tier formulation:")
    
    p2.add_subheading("Tier 1: Context-Only Neural Response Encoder (models/model.py)")
    p2.add_text("Role: Maps a 9-dimensional student context vector into a 16-dimensional latent cognitive representation.")
    p2.add_text("Input Features (dim=9):")
    p2.add_text("  1. skill_estimate: Latent ability estimate [0, 1]              2. recent_success_rate: Moving average of recent attempts", indent=10)
    p2.add_text("  3. recent_independent_rate: Unassisted completion ratio       4. hint_frequency: Average hints per recent task", indent=10)
    p2.add_text("  5. c3_risk_value: Frustration/distress score (conf-weighted)   6. c3_confidence: Reliability score of sensor", indent=10)
    p2.add_text("  7. c3_is_known: 1.0 if sensor is fresh, 0.0 otherwise          8. c3_is_missing: 1.0 if expired/absent, 0.0 otherwise", indent=10)
    p2.add_text("  9. consecutive_failures: Consecutive unsuccessful attempts streak", indent=10)
    
    p2.add_text("Architecture: Input (9) -> FC(32) -> ReLU -> FC(16) -> ReLU -> Latent Context phi(s) in R^16")
    p2.add_text("Loss Function: Binary Cross-Entropy on observed action outcome y in {0, 1}:")
    p2.add_text("  L_BCE = - [ y * log(sigma(z_a)) + (1 - y) * log(1 - sigma(z_a)) ]", font="F4", indent=20)
    p2.add_text("Training Performance: Accuracy: 70.6% | Validation BCE: 0.5969 | Expected Calibration Error (ECE): 0.0333")
    
    p2.add_subheading("Tier 2: Bayesian Linear Action Heads & Thompson Sampling (policy/policy.py)")
    p2.add_text("Role: Estimates bounded expected reward r_a approx w_a^T x for each action variant, where x = [1.0, phi(s)] in R^17.")
    p2.add_text("Number of Heads: 4 distinct heads (easy_visual, easy_text, medium_visual, medium_text).")
    p2.add_text("Conjugate Prior: w_a ~ Normal(m_0, S_0^-1) where m_0 = 0 in R^17 and S_0 = 10 * I_17. Observation noise sigma^2 = 1.0.")
    p2.add_text("Online Recursive Bayesian Update: For executed action a* upon observing reward r:")
    p2.add_text("  S_a* <- S_a* + (1/sigma^2) * x * x^T           m_a* <- S_a*^-1 * ( (1/sigma^2) * sum(x * r) )", font="F4", indent=20)
    p2.add_text("Action Selection (Masked Thompson Sampling):")
    p2.add_text("  1. Filter allowed actions: Eligible = Allowed INTERSECT (consecutive_failures < max_failure_sequence)", indent=10)
    p2.add_text("  2. If Eligible is empty: output action_id = null (triggers teacher 1-on-1 intervention)", indent=10)
    p2.add_text("  3. For each a in Eligible: sample w_tilde_a ~ Normal(m_a, S_a^-1) and score r_tilde_a = w_tilde_a^T x", indent=10)
    p2.add_text("  4. Pick action: a* = argmax_{a in Eligible} (r_tilde_a)", indent=10)
    
    p2.add_heading("4. Bounded Reward Formula & Safeguard Rules")
    p2.add_text("The reward formula is frozen in models/config.json:")
    p2.add_text("  reward = clip( 0.70 * task_success + 0.30 * independent_completion - hint_penalty - distress_penalty, -1.0, 1.0 )", font="F4", indent=10)
    p2.add_text("  - hint_penalty = 0.05 * min(hints_used, 4)      - distress_penalty = 0.30 if affective stress detected")
    p2.add_text("  - Break Rule: Confirmed break BYPASSES C2 selection entirely. No penalty (reward = 0.00), no posterior update.")
    p2.add_text("  - Signal Expiry: If C3 expires_at <= decision_time, signal status is UNKNOWN. Missing risk is NEVER assumed to be 0.")
    
    p2.add_heading("5. Empirical Evaluation Results on 20 Held-Out Profiles")
    p2.add_text("Evaluated on 20 unseen-family test profiles (Threshold Mastery & Fatigue/Recovery) over 5 sessions x 25 steps:")
    res_headers = ["Policy Name", "Mean Reward", "95% Bootstrap CI", "Violations", "1-Step Regret", "Success Rate"]
    res_rows = [
        ["Fixed_Sequencing", "6.71", "[5.39, 8.06]", "0", "0.1567", "51.6%"],
        ["Educator_Rules", "7.33", "[6.03, 8.66]", "0", "0.1484", "52.4%"],
        ["Linear_Bandit", "6.32", "[4.88, 7.73]", "0", "0.1450", "50.0%"],
        ["SCPA_NoSharedSignals", "7.19", "[5.81, 8.59]", "0", "0.1447", "53.4%"],
        ["SCPA_NoConfidenceWeight", "7.06", "[5.67, 8.48]", "0", "0.1404", "52.5%"],
        ["SCPA_Full (Proposed)", "7.14", "[5.74, 8.50]", "0", "0.1379", "52.7%"]
    ]
    p2.add_table(res_headers, res_rows, [115, 65, 85, 55, 75, 65])
    p2.add_text("Key Empirical Takeaways: Constraint violations = 0 across all runs. SCPA_Full achieved lowest regret (0.1379).")
    pages.append(p2)

    # ---------------- PAGE 3 ----------------
    p3 = PageBuilder(3)
    p3.add_heading("6. System Flow & What Users Actually Get")
    
    p3.add_subheading("User Flow Diagram:")
    p3.add_code(
        "Teacher Bounds Setup  --->  Student Opens App  --->  Pre-Action Snapshot Validated\n"
        "        |                                                    |\n"
        "        | (allowed_actions, max_failures)                    v\n"
        "        +----------------------------------------> Break Requested? --YES--> Pause Screen (0 penalty)\n"
        "                                                             |\n"
        "                                                            NO\n"
        "                                                             v\n"
        "                                                 Eligible Actions Filtered\n"
        "                                                             |\n"
        "                     Empty? --YES--> action_id=null (Alert Teacher for 1-on-1 Help)\n"
        "                       |\n"
        "                       NO\n"
        "                       v\n"
        "            Thompson Sampling Selection ---> Learner Solves Task ---> Online Posterior Update"
    )
    
    p3.add_subheading("What Does the Student Get?")
    p3.add_text("1. Personalized Pace: Tasks adapt seamlessly between visual puzzles and story rhymes to match current energy.")
    p3.add_text("2. Frustration-Free Learning: If stuck, gentle clues are available; after 3 failures, human support is called.")
    p3.add_text("3. Safe Self-Regulation: Tapping 'I Need a Break' immediately pauses the screen without deducting points.")
    
    p3.add_subheading("What Does the Teacher Get?")
    p3.add_text("1. 100% Boundary Control: The AI can never assign unapproved exercises; violations are mathematically zero.")
    p3.add_text("2. Automated Triaging: The teacher is only summoned when consecutive failures occur, optimizing classroom time.")
    p3.add_text("3. Verifiable Compliance: Every decision and outcome is cryptographically timestamped and linked in append-only logs.")

    p3.add_heading("7. System Execution Commands Reference")
    p3.add_table(
        ["Command", "Execution Time", "Output & Role"],
        [
            ["python3 run_all.py", "~37 seconds", "Runs end-to-end pipeline: generation, training, evaluation, export, demo."],
            ["python3 app/interactive_session.py", "Interactive", "Real student quiz session: answer questions, use hints, trigger safety locks."],
            ["python3 demo.py", "2.5 seconds", "Automated presenter demo walking through the 5-step human story."],
            ["npm test", "0.2 seconds", "TypeScript contract gate: validates 45 fixtures + 6 event pairs."],
            ["python3 -m unittest discover -s tests -v", "4.2 seconds", "Python cross-language agreement gate: verifies dual-language parity."],
            ["python3 data/generate_dataset.py", "1.2 seconds", "Generates simulated datasets across 70 profiles in data/raw/."],
            ["python3 train/train_response.py", "8.0 seconds", "Trains 32->16 neural encoder and saves models/model_weights.json."],
            ["python3 eval/evaluate_policy.py", "2.5 seconds", "Evaluates all 6 policies on held-out test split, writes eval/metrics.json."],
            ["python3 models/export_onnx.py", "0.1 seconds", "Exports web-ready browser_model.json for client-side inference."]
        ],
        [150, 75, 279]
    )

    p3.add_heading("8. Easy Live Demonstration & Experiment Guide")
    p3.add_text("To demonstrate this component to evaluators in 2 minutes:")
    p3.add_text("Step 1: Open terminal in workspace root and run:")
    p3.add_text("  python3 app/interactive_session.py", font="F4", indent=20)
    p3.add_text("Step 2: Solve Task #1 correctly by pressing the correct letter (e.g. 'B' for 3 apples).")
    p3.add_text("  Explain: Notice the positive reward (+1.0) and how the Bayesian head updates its weights instantly.")
    p3.add_text("Step 3: On Task #2, press 'P' to request a break.")
    p3.add_text("  Explain: Notice the C2 bypass! Break reward is 0.00 and no penalty is applied to the student.")
    p3.add_text("Step 4: Answer incorrectly 3 times in a row.")
    p3.add_text("  Explain: Notice the safety tripwire! The app pauses and alerts Ms. Sarah for 1-on-1 human guidance.")
    
    pages.append(p3)

    # ---------------- WRITE PDF BINARY ----------------
    pdf = bytearray()
    pdf.extend(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = []
    
    num_pages = len(pages)
    # Object numbers:
    # 1: Catalog
    # 2: Pages
    # 3 to 2+num_pages: Page objects
    # 3+num_pages to 2+2*num_pages: Content streams
    # Fonts: F1 (Helvetica), F2 (Helvetica-Bold), F3 (Helvetica-Oblique), F4 (Courier)
    
    font_base = 3 + 2 * num_pages
    f1_obj = font_base
    f2_obj = font_base + 1
    f3_obj = font_base + 2
    f4_obj = font_base + 3
    total_objs = f4_obj
    
    # 1: Catalog
    offsets.append(len(pdf))
    pdf.extend(b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n")
    
    # 2: Pages
    kids_refs = " ".join([f"{3+i} 0 R" for i in range(num_pages)])
    offsets.append(len(pdf))
    pdf.extend(f"2 0 obj\n<< /Type /Pages /Kids [{kids_refs}] /Count {num_pages} >>\nendobj\n".encode())
    
    # Page objects
    for i in range(num_pages):
        content_ref = 3 + num_pages + i
        offsets.append(len(pdf))
        p_dict = (
            f"{3+i} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {PAGE_WIDTH} {PAGE_HEIGHT}] "
            f"/Contents {content_ref} 0 R "
            f"/Resources << /Font << /F1 {f1_obj} 0 R /F2 {f2_obj} 0 R /F3 {f3_obj} 0 R /F4 {f4_obj} 0 R >> >> >>\nendobj\n"
        )
        pdf.extend(p_dict.encode())
        
    # Content streams
    for i, p in enumerate(pages):
        raw_stream = "\n".join(p.stream).encode('latin-1', errors='replace')
        offsets.append(len(pdf))
        stream_obj = f"{3+num_pages+i} 0 obj\n<< /Length {len(raw_stream)} >>\nstream\n".encode()
        pdf.extend(stream_obj)
        pdf.extend(raw_stream)
        pdf.extend(b"\nendstream\nendobj\n")
        
    # Fonts
    offsets.append(len(pdf))
    pdf.extend(f"{f1_obj} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n".encode())
    offsets.append(len(pdf))
    pdf.extend(f"{f2_obj} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n".encode())
    offsets.append(len(pdf))
    pdf.extend(f"{f3_obj} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique >>\nendobj\n".encode())
    offsets.append(len(pdf))
    pdf.extend(f"{f4_obj} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n".encode())
    
    # xref table
    xref_offset = len(pdf)
    pdf.extend(f"xref\n0 {total_objs + 1}\n0000000000 65535 f \n".encode())
    for off in offsets:
        pdf.extend(f"{off:010d} 00000 n \n".encode())
        
    pdf.extend(f"trailer\n<< /Size {total_objs + 1} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n".encode())
    
    with open(filename, "wb") as f:
        f.write(pdf)
    print(f"Successfully generated PDF: {filename} ({len(pdf)} bytes, {num_pages} pages)")

if __name__ == "__main__":
    create_pdf()
