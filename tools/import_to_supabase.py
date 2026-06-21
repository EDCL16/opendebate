"""
一次性匯入腳本：把現有 public-data.js 的資料寫入 Supabase。
Phase 1 使用，跑一次就好。

使用方式：
  pip install supabase
  set SUPABASE_URL=https://unutdrsamjzhipastoki.supabase.co
  set SUPABASE_SERVICE_KEY=你的service_role_key
  python tools/import_to_supabase.py
"""

import json
import os
import re
import sys

try:
    from supabase import create_client
except ImportError:
    print("請先安裝 supabase: pip install supabase")
    sys.exit(1)

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("請設定環境變數：")
    print("  set SUPABASE_URL=https://unutdrsamjzhipastoki.supabase.co")
    print("  set SUPABASE_SERVICE_KEY=你的service_role_key（在 Supabase Dashboard → Settings → API）")
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


def load_public_data():
    path = os.path.join(os.path.dirname(__file__), "..", "data", "public-data.js")
    with open(path, encoding="utf-8") as f:
        text = f.read()
    match = re.search(r"=\s*(\{.*\})\s*;?\s*$", text, re.DOTALL)
    if not match:
        print("無法解析 public-data.js")
        sys.exit(1)
    return json.loads(match.group(1))


def import_entities(data):
    entities = data.get("entities", [])
    if not entities:
        return
    rows = [
        {"code": e["code"], "type": e["type"], "name": e["name"], "aliases": e.get("aliases", "")}
        for e in entities
    ]
    for i in range(0, len(rows), 500):
        batch = rows[i : i + 500]
        supabase.table("entities").upsert(batch).execute()
    print(f"  entities: {len(rows)} 筆")


def import_competitions_and_records(data):
    records = data.get("records", [])
    topics = data.get("topics", [])
    if not records:
        print("  沒有 records")
        return

    # 1. 收集盃賽名稱，建 competitions
    comp_names = sorted(set(r["competitionName"] for r in records if r.get("competitionName")))
    comp_map = {}

    for name in comp_names:
        # 找該盃賽最早和最晚日期
        dates = [r["matchDate"] for r in records if r.get("competitionName") == name and r.get("matchDate")]
        start = min(dates) if dates else None
        end = max(dates) if dates else None

        row = {"name": name, "start_date": start, "end_date": end, "is_public": True}
        result = supabase.table("competitions").insert(row).execute()
        if result.data:
            comp_map[name] = result.data[0]["id"]

    print(f"  competitions: {len(comp_map)} 筆")

    # 2. 寫入 topics
    topic_rows = []
    for i, t in enumerate(topics):
        comp_id = comp_map.get(t.get("competitionName"))
        if comp_id:
            topic_rows.append({
                "competition_id": comp_id,
                "title": t.get("topic", ""),
                "explanation": t.get("explanation", ""),
                "sort_order": i,
            })
    if topic_rows:
        for i in range(0, len(topic_rows), 500):
            supabase.table("topics").insert(topic_rows[i : i + 500]).execute()
        print(f"  topics: {len(topic_rows)} 筆")

    # 3. 寫入 public_records
    pr_rows = []
    for r in records:
        comp_id = comp_map.get(r.get("competitionName"))
        teams = r.get("teams", {})
        scores = r.get("scores", {})
        team_ids = r.get("teamIds", {})

        pr_rows.append({
            "competition_id": comp_id,
            "match_date": r.get("matchDate"),
            "affirmative_team": teams.get("affirmative", ""),
            "negative_team": teams.get("negative", ""),
            "affirmative_entity": team_ids.get("affirmative"),
            "negative_entity": team_ids.get("negative"),
            "score_aff": scores.get("affirmative"),
            "score_neg": scores.get("negative"),
            "winner": r.get("winner", ""),
            "source": "public-data.js 匯入",
        })

    for i in range(0, len(pr_rows), 500):
        batch = pr_rows[i : i + 500]
        supabase.table("public_records").insert(batch).execute()
    print(f"  public_records: {len(pr_rows)} 筆")


def import_honors(data, comp_map=None):
    honors = data.get("honors", [])
    if not honors:
        return

    # 需要 comp_map，重新查一次
    if not comp_map:
        result = supabase.table("competitions").select("id, name").execute()
        comp_map = {r["name"]: r["id"] for r in result.data}

    rows = []
    for h in honors:
        comp_id = comp_map.get(h.get("competitionName"))
        rows.append({
            "competition_id": comp_id,
            "honor_type": h.get("honorType", "team"),
            "title": h.get("honorName", ""),
            "recipient": h.get("recipient", ""),
            "entity_code": h.get("teamId"),
            "school": h.get("team") or None,
            "note": h.get("note") or None,
        })

    for i in range(0, len(rows), 500):
        batch = rows[i : i + 500]
        supabase.table("honors").insert(batch).execute()
    print(f"  honors: {len(rows)} 筆")


if __name__ == "__main__":
    print("載入 public-data.js...")
    data = load_public_data()
    print(f"  schema version: {data.get('schemaVersion')}")
    print(f"  entities: {len(data.get('entities', []))} 筆")
    print(f"  records: {len(data.get('records', []))} 筆")
    print(f"  honors: {len(data.get('honors', []))} 筆")
    print(f"  topics: {len(data.get('topics', []))} 筆")
    print()

    print("匯入 entities...")
    import_entities(data)
    print()

    print("匯入 competitions + records + topics...")
    import_competitions_and_records(data)
    print()

    print("匯入 honors...")
    import_honors(data)
    print()

    print("全部完成！去 Supabase Table Editor 確認資料。")
