import json
from collections import Counter, defaultdict

entries_path = "/home/ubuntu/upload/taskin-firebase-time-entries-261.json"
accounts_path = "/home/ubuntu/upload/taskin-firebase-accounts-28.json"
with open(entries_path, encoding="utf-8") as f:
    entries = json.load(f)["entries"]
with open(accounts_path, encoding="utf-8") as f:
    accounts = json.load(f)["accounts"]

by_id = {a.get("id", ""): a for a in accounts}
by_name = defaultdict(list)
for a in accounts:
    for key in (a.get("name", "").strip().lower(), a.get("initials", "").strip().lower()):
        if key:
            by_name[key].append(a)

counts = Counter(e.get("agent", "") for e in entries)
print(f"accounts={len(accounts)} entries={len(entries)}")
print("agent mapping:")
for agent, count in counts.most_common():
    match = by_id.get(agent)
    if match:
        print(f"  {agent}: {count} -> id exact, name={match.get('name','')!r}, email={match.get('email','')!r}, role={match.get('role','')!r}")
    else:
        candidates = by_name.get(agent.lower(), [])
        if len(candidates) == 1:
            a = candidates[0]
            print(f"  {agent}: {count} -> name, id={a.get('id','')}, email={a.get('email','')!r}")
        else:
            print(f"  {agent}: {count} -> UNMATCHED candidates={len(candidates)}")
print("roles:")
for role, count in Counter(a.get("role", "agent") for a in accounts).most_common():
    print(f"  {role!r}: {count}")
print("accounts sample:")
for a in accounts:
    print(f"  {a.get('id','')} | {a.get('name','')} | {a.get('email','')} | {a.get('role','agent')}")
