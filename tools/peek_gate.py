import glob
import json

r2 = json.load(open(sorted(glob.glob("sim/reports/sim02-formal-*-d90.json"))[-1], encoding="utf-8"))
print("sim02 gate_evidence:", r2["gate_evidence"])
r3 = json.load(open(sorted(glob.glob("sim/reports/sim03-formal-*.json"))[-1], encoding="utf-8"))
print("sim03 gate_evidence:", r3["gate_evidence"], "| seeds:", r3["seeds_per_group"], "| groups:", r3["groups_total"])
r4 = json.load(open(sorted(glob.glob("sim/reports/sim04-formal-*.json"))[-1], encoding="utf-8"))
print("sim04 gate_evidence:", r4["gate_evidence"], "| runs:", r4.get("runs_total"))
