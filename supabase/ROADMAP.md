# Supabase 整合路線圖

## Phase 0：建立 Supabase 專案（30 分鐘）

### 你要做的
1. 到 https://supabase.com 註冊，建一個新 project（免費方案夠用）
2. 記下 Region 選離台灣近的（Singapore）
3. 進 Dashboard → SQL Editor
4. 貼上 `supabase/migrations/001_initial_schema.sql` 的內容，按 Run
5. 到 Settings → API，記下：
   - `Project URL`（像 `https://xxxxx.supabase.co`）
   - `anon public key`（前端用，只能讀）
   - `service_role key`（管理用，可寫，不要放前端）

### 完成標準
- 在 Table Editor 能看到所有表
- entities 表可以手動插入一筆測試資料

---

## Phase 1：匯入現有資料 + 公開網站讀 DB（1-2 天）

### 目標
把現在 `public-data.js` 裡的 records、honors、entities 全部匯進 Supabase，
公開網站改成從 Supabase 讀資料（anon key，只讀）。

### 步驟
1. 寫一個一次性的 Python 腳本 `tools/import_to_supabase.py`
   - 讀 `public-data.js` 的 JSON
   - 把 entities 寫入 `entities` 表
   - 把每場 record 寫入 `competitions` + `public_records`
   - 把 honors 寫入 `honors` 表
2. 前端加入 supabase-js（CDN 一行搞定）：
   ```html
   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
   ```
3. 修改 `js/core.js` 的 `createStore`：
   - 先嘗試從 Supabase 讀
   - 失敗時 fallback 到本地 `public-data.js`（離線也能用）
4. 保留現有的 Excel → public-data.js 流程當備份

### 完成標準
- 網站載入時從 Supabase 讀資料
- 離線或 Supabase 掛掉時自動 fallback 到靜態檔
- 不影響現有所有功能

---

## Phase 2：裁判單線上填寫（3-5 天）

### 目標
你朋友 (macrokernel3000) 那邊的計分系統，把 localStorage 改存 Supabase。

### 步驟
1. 前端填完裁判單 → POST 到 Supabase：
   - 先建 competition（如果不存在）
   - 先建 match（如果不存在，用 competition + period + venue 找）
   - 建 ballot + player_scores
2. DB trigger 自動算 ballot_winner 和 match 聚合結果
3. 重複判定：`match_id + judge` 的 unique constraint 會擋住
   - 前端先查有沒有既有 ballot，有的話問使用者要不要覆蓋
4. 裁判單照片上傳 Supabase Storage（一個 bucket `ballot-photos`）

### 前端改動最小路徑
```js
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// 存裁判單
async function saveBallot(data) {
  const { data: ballot, error } = await supabase
    .from('ballots')
    .upsert(data, { onConflict: 'match_id,judge' })
    .select()
    .single()
  return ballot
}

// 讀裁判單
async function getBallots(matchId) {
  const { data } = await supabase
    .from('ballots')
    .select('*, player_scores(*)')
    .eq('match_id', matchId)
  return data
}
```

### 完成標準
- 裁判手機填分 → 資料進 DB
- 多位裁判同時填不衝突
- 公開網站即時看到新結果

---

## Phase 3：多裁判合併 + 循環排名（3-5 天）

### 目標
- 多張 ballot 自動合併成 match 結果（trigger 已處理）
- 循環賽排名計算
- 最佳辯士排名

### 步驟
1. 建一個 Supabase Edge Function `compute-rankings`：
   - 輸入：competition_id
   - 計算：勝場數 → ballotWins → 論點分 → 總分 排序
   - 輸出：寫入一個 `rankings` view 或 materialized view
2. 最佳辯士計算：
   - 同一選手在同一 match 的多張 ballot 先算平均
   - 再跨場平均
   - 篩選條件：至少出場 N 場 match
3. 前端顯示循環賽排名表

### 新增 SQL（到時候再加）
```sql
-- 循環排名 view
create view competition_standings as
select
  competition_id,
  team,
  count(*) filter (where won) as match_wins,
  count(*) as matches_played
from (/* match results per team */) sub
group by competition_id, team
order by match_wins desc;
```

### 完成標準
- 所有 ballot 填完 → 自動算出循環賽排名
- 最佳辯士列表正確（以場次計，不是以裁判單數計）

---

## Phase 4：權限 + 帳號 + 成長曲線（1-2 週）

### 目標
- 不同角色有不同權限
- 選手可以看自己的歷史表現

### 步驟
1. 啟用 Supabase Auth（Email 或 Google 登入）
2. 建 `profiles` 表，連結 auth.users
3. 加角色欄位：admin / organizer / judge / player / viewer
4. 更新 RLS policy：
   - judge 只能寫自己的 ballot
   - player 只能讀自己的 player_scores
   - organizer 可以管理自己的 competition
5. 選手成長曲線：
   - 前端用 player_name 查所有 player_scores
   - 按 match_date 排序，畫折線圖
6. 資料回報改為直接寫 `pending_reports` 表，管理者審核後移到正式表

### 完成標準
- 裁判登入後才能填分
- 選手登入後看到自己的成長曲線
- 管理者可以審核社群回報的資料

---

## 每個 Phase 之間的關係

```
Phase 0 ──→ Phase 1 ──→ Phase 2 ──→ Phase 3 ──→ Phase 4
 建 DB       匯入資料    裁判填分    排名計算    帳號權限
 30min       1-2天       3-5天       3-5天       1-2週
```

- Phase 0-1 你一個人就能做
- Phase 2 需要跟你朋友 (macrokernel3000) 的前端對接
- Phase 3-4 可以慢慢來，Phase 2 上線後系統就已經可用了

---

## 技術選擇

| 項目 | 選擇 | 原因 |
|------|------|------|
| DB | Supabase (PostgreSQL) | 免費、有 Realtime、有 Storage、有 Auth |
| 前端 | 維持現有純 JS | 不需要重寫，加一個 supabase-js CDN 就好 |
| API | 不需要另外寫 | Supabase 自帶 REST API + RLS = 直接前端連 |
| 計算 | DB trigger + Edge Function | 勝負判定用 trigger 即時算，排名用 Edge Function |
| 照片 | Supabase Storage | 免費 1GB，夠用 |
| 部署 | GitHub Pages 不變 | 靜態前端 + Supabase 後端，不需要 server |

---

## 注意事項

1. **anon key 可以放前端**，因為 RLS 會保護寫入。但 service_role key 絕對不能放前端。
2. **離線 fallback**：保留 `public-data.js` 當 fallback，Supabase 讀不到就用本地檔。
3. **不要一次重寫**：每個 Phase 結束都是一個可用的狀態，不要跳 Phase。
4. **資料遷移**：Phase 1 的匯入腳本跑一次就好，之後新資料直接進 DB。
