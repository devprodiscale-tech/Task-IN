import json
from collections import Counter
from datetime import datetime

path = "/home/ubuntu/upload/taskin-firebase-time-entries-261.json"
with open(path, encoding="utf-8") as f:
    data = json.load(f)
entries = data.get("entries", [])
print(f"count={len(entries)} declared={data.get('count')}")
print("agents:")
for agent, count in Counter(e.get("agent", "") for e in entries).most_common():
    print(f"  {agent!r}: {count}")
print("sources:")
for source, count in Counter(e.get("source", "") for e in entries).most_common():
    print(f"  {source!r}: {count}")
missing_start = sum(not e.get("startTime") for e in entries)
invalid_start = 0
for e in entries:
    value = e.get("startTime")
    if value:
        try:
            datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            invalid_start += 1
print(f"missing_startTime={missing_start}")
print(f"invalid_startTime={invalid_start}")
print(f"duplicate_ids={len(entries) - len({e.get('id') for e in entries})}")
print(f"negative_durations={sum(int(e.get('durationSec', 0) or 0) < 0 for e in entries)}")
