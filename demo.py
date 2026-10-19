"""
Interactive Presentation Demo for C2 Component
Run with: python3 demo.py

Demonstrates:
1. Teacher bounds setup (Approved vs Allowed actions, Max Failure limit)
2. Normal student activity selection and execution
3. Student requesting a break (C2 bypassed, no penalty)
4. Affective risk signal check (Fresh vs Expired C3)
5. Safety tripwire: 3 consecutive failures trigger teacher intervention
"""
import time
import sys

# Terminal formatting
BOLD = "\033[1m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
RED = "\033[91m"
MAGENTA = "\033[95m"
RESET = "\033[0m"

def print_header(title):
    print("\n" + "=" * 65)
    print(f"{BOLD}{CYAN}  {title}{RESET}")
    print("=" * 65)

def print_step(step_num, title):
    print(f"\n{BOLD}{YELLOW}[Step {step_num}] {title}{RESET}")
    time.sleep(0.4)

def run_demo():
    print_header("C2 COMPONENT LIVE DEMONSTRATION")
    print(f"{BOLD}Simulated Classroom Scenario: Student 'Alex' and Teacher 'Ms. Sarah'{RESET}")
    print("This demo shows how C2 safely guides activity selection.\n")
    time.sleep(0.6)

    # 1. Teacher Setup
    print_step("1", "Teacher Sets Educational Boundaries")
    print(f"  {BOLD}Teacher limits configured:{RESET}")
    print(f"   • Approved Activities:  ['Math-Easy-Visual', 'Math-Easy-Text', 'Math-Medium-Visual', 'Math-Medium-Text']")
    print(f"   • Today's Allowed List: ['Math-Easy-Visual', 'Math-Easy-Text']")
    print(f"   • Safety Failure Limit: 3 consecutive failures")
    print(f"  {GREEN}✔ Invariant verified: Allowed actions ⊆ Approved actions{RESET}")
    time.sleep(0.6)

    # 2. Activity Selection
    print_step("2", "Student Opens App & First Activity Selected")
    print(f"  {CYAN}Current State:{RESET} Skill = 0.50 | Recent Results: None | Help Requests: None")
    print(f"  {MAGENTA}→ C2 Algorithm:{RESET} Masked Thompson Sampling selects from allowed actions...")
    time.sleep(0.5)
    print(f"  {GREEN}✔ Selected Activity:{RESET} {BOLD}'Math-Easy-Visual'{RESET}")
    print(f"  {BOLD}Student action:{RESET} Alex completes the visual puzzle successfully with 0 hints.")
    print(f"  {GREEN}✔ Logged OutcomeEvent:{RESET} Success=True, Independence=True → Posterior updated (+0.82 reward).")
    time.sleep(0.6)

    # 3. Student Takes a Break
    print_step("3", "Student Requests a Break ('I Need a Break')")
    print(f"  {YELLOW}Student action:{RESET} Alex taps {BOLD}'I need a break'{RESET}.")
    print(f"  {BOLD}Evaluating Snapshot:{RESET} Confirmed break detected in student requests.")
    time.sleep(0.5)
    print(f"  {CYAN}⚡ C2 Break Policy Triggered:{RESET}")
    print(f"   • Selection is {BOLD}BYPASSED{RESET} immediately.")
    print(f"   • Break is {BOLD}NOT{RESET} a failure (Penalty = 0.00).")
    print(f"   • No decision event created, no score penalty, no bandit posterior update.")
    print(f"  {GREEN}✔ Screen displays relaxing pause animation for Alex.{RESET}")
    time.sleep(0.6)

    # 4. Checking Affective Risk
    print_step("4", "Alex Returns: Checking C3 Affective Risk Signal")
    print(f"  {CYAN}Signal check at decision time (14:30:00 UTC):{RESET}")
    print(f"   • Case A: Signal observed at 14:28:00, expires at 14:32:00 → {GREEN}KNOWN (Fresh){RESET}")
    print(f"     Policy uses fresh risk (0.60) weighted by confidence (0.85) to favor gentle format.")
    print(f"   • Case B: If signal had expired at 14:29:00 → {YELLOW}UNKNOWN (Null){RESET}")
    print(f"     {BOLD}Safety Rule:{RESET} System never assumes 0 risk when data is missing or expired!")
    time.sleep(0.6)

    # 5. Safety Tripwire
    print_step("5", "Safety Tripwire: Student Struggles 3 Times in a Row")
    print(f"  {RED}Simulated event:{RESET} Alex attempts a challenging concept and fails 3 consecutive times.")
    print(f"  {BOLD}Consecutive failure count:{RESET} 3 / 3 (Limit Reached)")
    time.sleep(0.5)
    print(f"  {RED}⚡ Teacher Safety Rule Enforced:{RESET}")
    print(f"   • System removes failing activities from eligibility.")
    print(f"   • Eligible actions remaining: [] (EMPTY)")
    print(f"   • Policy outputs: {BOLD}action_id = null{RESET}")
    print(f"   • App displays: {YELLOW}'Great effort! Let's pause and check in with your teacher.'{RESET}")
    print(f"   • {GREEN}Teacher Dashboard Alert Sent:{RESET} 'Ms. Sarah, Alex needs 1-on-1 assistance.'")
    time.sleep(0.6)

    # Summary
    print_header("DEMONSTRATION SUMMARY")
    print(f" {GREEN}✔{RESET} {BOLD}Safety Rules Protected:{RESET} Teacher limits never bypassed.")
    print(f" {GREEN}✔{RESET} {BOLD}Student Wellbeing Respected:{RESET} Breaks are never penalized.")
    print(f" {GREEN}✔{RESET} {BOLD}Human in the Loop:{RESET} Automatic escalation when student is stuck.")
    print("=" * 65 + "\n")

if __name__ == '__main__':
    run_demo()
