"""
Real Interactive Student Activity Session for C2 Component.
Run with: python3 app/interactive_session.py

Features:
- Real counting activities from content/activities.json
- Visual ASCII icons (apples, stars, fish, balloons) vs Text story rhymes
- Real student answer validation (correct vs incorrect)
- Real hint assistance system
- Real break bypass (0 penalty)
- Real teacher safety tripwire (locks after 3 consecutive failures)
"""
import copy
import json
import random
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from policy.policy import SCPABanditPolicy

CYAN = "\033[96m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
BOLD = "\033[1m"
MAGENTA = "\033[95m"
RESET = "\033[0m"

# Emoji/ASCII visual helpers
ICONS = {
    "apple": "🍎",
    "star": "⭐",
    "bird": "🐦",
    "fish": "🐟",
    "balloon": "🎈",
    "frog": "🐸",
    "bee": "🐝",
    "cookie": "🍪",
    "puppy": "🐶",
    "sun": "☀️",
    "shoe": "👟",
    "kitten": "🐱"
}

def get_visual_render(activity: dict) -> str:
    count = activity.get("item_count", 3)
    title = activity.get("title", "").lower()
    icon = "🔵"
    for k, v in ICONS.items():
        if k in title:
            icon = v
            break
    return "  " + (" " + icon + " ") * count

def main():
    print("\n" + "=" * 70)
    print(f"{BOLD}{CYAN}  C2 LIVE STUDENT LEARNING EXPERIENCE{RESET}")
    print("=" * 70)
    print("You are playing the role of the Student 'Alex'.")
    print("The C2 AI Policy selects the best activity variant.")
    print("You actually answer questions, ask for hints, or take breaks.\n")

    # Load activities
    with open(ROOT / "content/activities.json") as f:
        all_activities = json.load(f)

    policy = SCPABanditPolicy()
    
    # Teacher boundaries
    teacher_limits = {
        "approved_actions": ["easy_visual", "easy_text", "medium_visual", "medium_text"],
        "allowed_actions": ["easy_visual", "easy_text", "medium_visual", "medium_text"],
        "max_failure_sequence": 3
    }
    
    recent_results = []
    consecutive_failures = 0
    step = 1

    while True:
        print("\n" + "=" * 70)
        print(f"{BOLD}TASK #{step}{RESET}")
        print("=" * 70)

        # 1. Eligibility Check
        if consecutive_failures >= teacher_limits["max_failure_sequence"]:
            eligible_actions = []
        else:
            eligible_actions = copy.deepcopy(teacher_limits["allowed_actions"])

        # Safety Tripwire Check
        if not eligible_actions:
            print(f"\n{RED}⚡ SAFETY TRIPWIRE ACTIVATED!{RESET}")
            print(f"  {BOLD}Consecutive Failures:{RESET} {consecutive_failures} / {teacher_limits['max_failure_sequence']}")
            print(f"  {YELLOW}The system has removed all activities from eligibility.{RESET}")
            print(f"  {CYAN}Screen displays:{RESET} 'Great effort Alex! Let's pause and check in with your teacher.'")
            print(f"  {GREEN}Teacher Dashboard Alert Sent:{RESET} 'Ms. Sarah, Alex needs 1-on-1 human guidance.'")
            print("=" * 70)
            choice = input(f"\n{BOLD}Teacher override: Press [R] to reset student state or [Q] to quit: {RESET}").strip().lower()
            if choice == "r":
                consecutive_failures = 0
                recent_results = []
                print(f"{GREEN}✔ Teacher has assisted. Safety limits reset.{RESET}\n")
                continue
            else:
                break

        # 2. Build Snapshot
        dec_time = time.strftime('%Y-%m-%dT%H:%M:%S.000Z', time.gmtime())
        snapshot = {
            "snapshot_id": f"snap_live_{step}",
            "decision_time": dec_time,
            "skill_estimate": 0.50,
            "recent_results": recent_results[-5:],
            "hint_history": [],
            "confirmed_requests": [],
            "c3_risk": {
                "value": min(0.9, 0.2 + 0.25 * consecutive_failures),
                "confidence": 0.85,
                "observed_at": dec_time,
                "expires_at": time.strftime('%Y-%m-%dT%H:%M:%S.000Z', time.gmtime(time.time() + 180))
            },
            "teacher_limits": teacher_limits
        }

        # 3. Model Decision
        selected_variant = policy.select_action(snapshot, eligible_actions)
        print(f"  {MAGENTA}→ C2 Policy Evaluated Context:{RESET} Selected Variant = {BOLD}'{selected_variant}'{RESET}")
        
        # Pick matching activity from content bank
        matching = [a for a in all_activities if a.get("variant_code") == selected_variant]
        activity = random.choice(matching) if matching else all_activities[0]

        # 4. Display Activity to Student
        print(f"\n  {BOLD}{CYAN}Activity: {activity['title']}{RESET}")
        print(f"  Difficulty: {activity['difficulty'].upper()} | Format: {activity['presentation'].upper()}")
        print(f"  Description: {activity['description']}")

        if activity['presentation'] == 'visual':
            print("\n" + get_visual_render(activity) + "\n")

        print(f"  {BOLD}Question: {activity['prompt_text']}{RESET}")
        
        letters = ["A", "B", "C"]
        options = activity["options"]
        opt_map = {}
        for l, opt in zip(letters, options):
            opt_map[l.lower()] = opt
            print(f"    [{l}] {opt}")

        print(f"    [H] 💡 Ask for a Hint")
        print(f"    [P] ⏸️  I Need a Break")
        print(f"    [Q] Exit")

        # 5. Student Interaction Loop
        hints_used = 0
        while True:
            choice = input(f"\n  {BOLD}Your choice (A, B, C, H, P, Q): {RESET}").strip().lower()

            if choice == "p":
                print(f"\n  {CYAN}⚡ BREAK REQUEST DETECTED!{RESET}")
                print(f"  {BOLD}Break Policy Enforced:{RESET}")
                print(f"   • Selection is {BOLD}BYPASSED{RESET} immediately.")
                print(f"   • Break is {BOLD}NOT{RESET} a failure penalty (Reward = 0.00).")
                print(f"   • No bandit parameters are modified.")
                print(f"  {GREEN}✔ Screen displays relaxing break animation.{RESET}")
                input(f"\n  {BOLD}Press [Enter] when ready to resume learning...{RESET}")
                print(f"  {GREEN}Resumed learning session.{RESET}")
                break

            elif choice == "h":
                hints_used += 1
                count = activity.get("item_count", 3)
                print(f"\n  {YELLOW}💡 HINT #{hints_used}:{RESET} Count them slowly out loud: 1, 2, ... up to {count}!")
                continue

            elif choice in opt_map:
                user_answer = opt_map[choice]
                correct = (user_answer == activity["correct_answer"])

                if correct:
                    print(f"\n  {GREEN}✔ CORRECT! {user_answer} is the right answer! 🎉{RESET}")
                    consecutive_failures = 0
                    independent = (hints_used == 0)
                    hint_pen = 0.05 * min(hints_used, 4)
                    reward = round(0.70 * 1.0 + (0.30 if independent else 0.0) - hint_pen, 2)
                    policy.update(snapshot, selected_variant, reward)
                    recent_results.append({"decision_id": f"d_{step}", "outcome_time": dec_time, "success": True, "independent": independent})
                    print(f"  {CYAN}Model Feedback:{RESET} Outcome=Success, Independent={independent} → Posterior Reward = {reward}")
                else:
                    consecutive_failures += 1
                    print(f"\n  {RED}✖ NOT QUITE. You chose {user_answer}, but the answer was {activity['correct_answer']}.{RESET}")
                    reward = -0.30
                    policy.update(snapshot, selected_variant, reward)
                    recent_results.append({"decision_id": f"d_{step}", "outcome_time": dec_time, "success": False, "independent": False})
                    print(f"  {YELLOW}Consecutive Failure Count:{RESET} {consecutive_failures} / {teacher_limits['max_failure_sequence']}")

                step += 1
                break

            elif choice == "q":
                print("\nExiting session. Thank you!\n")
                return

            else:
                print(f"  {RED}Invalid key. Please press A, B, C, H, P, or Q.{RESET}")

if __name__ == "__main__":
    main()
