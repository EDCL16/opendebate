# 公開辯論資訊網

台灣高中辯論賽事的公開查詢與管理平台。前端為純 HTML/JS SPA，後端使用 Supabase（PostgreSQL + Auth + RLS）。

## 功能

### 公開頁面（無需登入）
- **首頁**：近期盃賽時間軸、已收錄賽事卡片、學校排行榜（累積榮譽／參賽場次／總勝場）
- **賽事資料庫**：依年份或關鍵字搜尋，查看完整比賽結果與公開榮譽
- **搜尋**：學校、隊伍、選手姓名全文搜尋
- **資料回報**：透過 Google 表單回報缺漏資料

### 登入後功能（Supabase Auth）
- **我的紀錄**（所有角色）：依姓名比對 player_scores / ballots，顯示個人出賽與裁判紀錄
- **提交裁判單**（記錄員 / 管理員）：手填賽事、場次、選手分數，自動建立 match + ballot，提交後為 pending 狀態
- **管理後台**（管理員）：
  - 待審核裁判單核准／駁回
  - 所有資料表 CRUD（賽事、隊伍、場次、裁判單、選手分數、榮譽、公開戰績、辯題、隊伍別名）
  - FK 欄位以下拉選單＋搜尋操作，特殊欄位以日期選擇器或下拉選單呈現
  - 使用者角色管理

### 角色

| 角色 | 說明 |
|------|------|
| **admin** | 全部資料表 CRUD、審核裁判單、管理使用者角色 |
| **recorder** | 提交裁判單（pending 狀態，需管理員核准） |
| **user** | 查看個人辯論紀錄 |
| 未登入 | 瀏覽公開資料 |

## 技術架構

```
index.html (SPA, hash routing)
├── js/core.js          工具函數 (escapeHtml, formatDate, createStore...)
├── js/interactions.js  事件處理
├── app.js              首頁/賽事/搜尋/回報 渲染
├── js/auth.js          Supabase Auth 登入/登出/session
├── js/dashboard.js     個人紀錄/管理後台/裁判單提交
├── js/supabase-config.js  Supabase URL + anon key
├── js/supabase-loader.js  資料載入 + Auth/Dashboard 初始化
├── styles.css          全站樣式
└── data/public-data.js 靜態資料 fallback
```

## 資料庫 Schema（Supabase PostgreSQL）

```
profiles         ← auth.users (1:1)    使用者個人檔案 + 角色
entities         隊伍/學校名冊 (PK: code)
entity_aliases   隊伍別名 (正規化自 entities.aliases)
competitions     賽事/盃賽
topics           辯題 → competitions
matches          場次 → competitions, entities
ballots          裁判單 → matches, auth.users
player_scores    選手分數 → ballots, matches
honors           榮譽 → competitions, entities
public_records   簡化公開戰績 → competitions, matches, entities
attendance       選手登場紀錄 → matches, competitions, entities
```

### 審核流程

```
記錄員提交裁判單 → ballot (approval_status = 'pending')
  ↓ trigger 算 ballot_winner，但 match 結果不受影響
管理員核准 → UPDATE approval_status = 'approved'
  ↓ trigger 重算 match 結果（只計 approved ballots）
管理員駁回 → UPDATE approval_status = 'rejected'
  ↓ 無影響
```

### 正規化說明

- **1NF**：`entity_aliases` 表取代原本 `entities.aliases` 的 pipe 分隔多值
- **2NF/3NF**：`matches` 和 `ballots` 的聚合欄位（total_aff, match_winner 等）為 trigger 維護的受控反正規化
- **完整性約束**：`player_scores(ballot_id, side, seat_order)` UNIQUE、`attendance(match_id, player_name, side)` UNIQUE、所有 entities FK 加 ON UPDATE CASCADE

### Migrations

| 檔案 | 內容 |
|------|------|
| `001_initial_schema.sql` | 核心表、索引、RLS、trigger (compute_ballot_winner, recompute_match_result) |
| `002_derived_views.sql` | v_public_records, v_attendance 衍生 view |
| `003_auth_profiles_approval.sql` | profiles 表、Auth trigger、ballot 審核欄位、角色制 RLS |
| `004_normalization_fixes.sql` | entity_aliases 表、UNIQUE/NOT NULL/CASCADE 約束 |

## 本機啟動

1. 雙擊 `index.html` 即可瀏覽公開資料（靜態 fallback）
2. 若要連接 Supabase，在 `js/supabase-config.js` 填入你的 Project URL 和 anon key
3. 到 Supabase SQL Editor 依序執行 `001` ~ `004` migration
4. 到 Authentication → Sign In / Providers 啟用 Email
5. 建立第一個使用者後，在 SQL Editor 設定為 admin：
   ```sql
   UPDATE profiles SET role = 'admin' WHERE display_name = '你的名字';
   ```

## 資料匯入工具

- `tools/import.html`：一次性從 public-data.js 匯入 Supabase（需 service_role key）
- `tools/csv-import.html`：CSV 匯入戰績、榮譽、裁判單

## 部署

靜態前端部署到 GitHub Pages / Netlify / Vercel，Supabase 作為後端，不需要額外 server。
