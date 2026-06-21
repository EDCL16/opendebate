-- ============================================================
-- OpenDebate Supabase Schema
-- Phase 0: 完整資料模型
-- ============================================================

-- 學校/隊伍/大學 統一名冊
create table entities (
  code text primary key,            -- s001, p001, u001
  type text not null check (type in ('s','p','u')),  -- s=學校, p=特殊隊伍, u=大學
  name text not null,
  aliases text default '',          -- 用 | 分隔的別名
  created_at timestamptz default now()
);

-- 盃賽
create table competitions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  start_date date,
  end_date date,
  organizer text,
  is_public boolean default true,
  expected_ballot_count int default 3 check (expected_ballot_count in (3, 5)),
  created_at timestamptz default now()
);

-- 辯題
create table topics (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid references competitions(id) on delete cascade,
  title text not null,
  explanation text,
  sort_order int default 0
);

-- 場次 (Match = 一場比賽)
create table matches (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid references competitions(id) on delete cascade,
  match_date date,
  period int check (period between 1 and 8),
  venue int check (venue between 1 and 99),
  affirmative_team text not null,
  negative_team text not null,
  affirmative_entity text references entities(code),
  negative_entity text references entities(code),
  -- 聚合結果 (由 ballot 計算而來)
  ballot_wins_aff int default 0,
  ballot_wins_neg int default 0,
  ballot_wins_draw int default 0,
  match_winner text check (match_winner in ('正方勝','反方勝','平手','尚未判定')),
  total_score_aff numeric(6,1) default 0,
  total_score_neg numeric(6,1) default 0,
  status text default 'draft' check (status in ('draft','incomplete','complete')),
  created_at timestamptz default now()
);

-- 裁判單 (Ballot = 一位裁判對一場的評分)
create table ballots (
  id uuid primary key default gen_random_uuid(),
  match_id uuid references matches(id) on delete cascade,
  judge text not null,
  recorder text,
  -- 隊伍分數
  argument_score_aff numeric(5,1) default 0 check (argument_score_aff between 0 and 20),
  argument_score_neg numeric(5,1) default 0 check (argument_score_neg between 0 and 20),
  closing_score_aff numeric(5,1) default 0 check (closing_score_aff between 0 and 50),
  closing_score_neg numeric(5,1) default 0 check (closing_score_neg between 0 and 50),
  -- 計算結果
  total_aff numeric(6,1) default 0,
  total_neg numeric(6,1) default 0,
  ballot_winner text check (ballot_winner in ('正方勝','反方勝','平手','尚未判定')),
  -- 評分單照片
  photo_path text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  -- 防止同一裁判對同一場重複填單
  unique (match_id, judge)
);

-- 選手個人分數 (每張裁判單 × 每位選手)
create table player_scores (
  id uuid primary key default gen_random_uuid(),
  ballot_id uuid references ballots(id) on delete cascade,
  match_id uuid references matches(id) on delete cascade,
  player_name text not null,
  side text not null check (side in ('affirmative','negative')),
  seat_order int not null check (seat_order between 1 and 3),
  speech numeric(5,1) default 0 check (speech between 0 and 100),
  question numeric(5,1) default 0 check (question between 0 and 100),
  defense numeric(5,1) default 0 check (defense between 0 and 100),
  total numeric(5,1) generated always as (speech + question + defense) stored,
  note text
);

-- 榮譽 (團體/個人)
create table honors (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid references competitions(id) on delete cascade,
  honor_type text not null check (honor_type in ('team','individual')),
  title text not null,          -- 冠軍、最佳辯士...
  recipient text not null,      -- 隊伍名或個人姓名
  entity_code text references entities(code),
  school text,
  note text,
  created_at timestamptz default now()
);

-- 公開戰績 (簡化紀錄，不需要完整裁判單也能收錄)
-- ponytail: 這張表讓「只有比分沒有裁判單」的歷史資料也能進系統
create table public_records (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid references competitions(id) on delete cascade,
  match_id uuid references matches(id),  -- 可為 null，表示沒有對應的完整場次
  match_date date,
  affirmative_team text not null,
  negative_team text not null,
  affirmative_entity text references entities(code),
  negative_entity text references entities(code),
  score_aff numeric(6,1),
  score_neg numeric(6,1),
  winner text,
  source text,                  -- 資料來源備註
  created_at timestamptz default now()
);

-- 選手登場紀錄
create table attendance (
  id uuid primary key default gen_random_uuid(),
  match_id uuid references matches(id) on delete cascade,
  competition_id uuid references competitions(id) on delete cascade,
  player_name text not null,
  side text not null check (side in ('affirmative','negative')),
  entity_code text references entities(code),
  created_at timestamptz default now()
);

-- ============================================================
-- Indexes
-- ============================================================

create index idx_matches_competition on matches(competition_id);
create index idx_matches_date on matches(match_date);
create index idx_ballots_match on ballots(match_id);
create index idx_player_scores_ballot on player_scores(ballot_id);
create index idx_player_scores_match on player_scores(match_id);
create index idx_player_scores_name on player_scores(player_name);
create index idx_honors_competition on honors(competition_id);
create index idx_public_records_competition on public_records(competition_id);
create index idx_attendance_player on attendance(player_name);

-- ============================================================
-- RLS (Row Level Security) - Phase 0 先全開讀取
-- ============================================================

alter table entities enable row level security;
alter table competitions enable row level security;
alter table topics enable row level security;
alter table matches enable row level security;
alter table ballots enable row level security;
alter table player_scores enable row level security;
alter table honors enable row level security;
alter table public_records enable row level security;
alter table attendance enable row level security;

-- 所有人可讀公開資料
create policy "公開讀取" on entities for select using (true);
create policy "公開讀取" on competitions for select using (is_public = true);
create policy "公開讀取" on topics for select using (true);
create policy "公開讀取" on matches for select using (true);
create policy "公開讀取" on ballots for select using (true);
create policy "公開讀取" on player_scores for select using (true);
create policy "公開讀取" on honors for select using (true);
create policy "公開讀取" on public_records for select using (true);
create policy "公開讀取" on attendance for select using (true);

-- 管理者可寫入 (用 service_role key 或之後加 auth)
-- Phase 4 再細分裁判/主辦方/選手權限
create policy "管理者寫入" on entities for all using (auth.role() = 'service_role');
create policy "管理者寫入" on competitions for all using (auth.role() = 'service_role');
create policy "管理者寫入" on topics for all using (auth.role() = 'service_role');
create policy "管理者寫入" on matches for all using (auth.role() = 'service_role');
create policy "管理者寫入" on ballots for all using (auth.role() = 'service_role');
create policy "管理者寫入" on player_scores for all using (auth.role() = 'service_role');
create policy "管理者寫入" on honors for all using (auth.role() = 'service_role');
create policy "管理者寫入" on public_records for all using (auth.role() = 'service_role');
create policy "管理者寫入" on attendance for all using (auth.role() = 'service_role');

-- ============================================================
-- Helper function: 重算 ballot winner
-- ============================================================

create or replace function compute_ballot_winner()
returns trigger as $$
begin
  -- 重算總分
  new.total_aff := (
    select coalesce(sum(total), 0) from player_scores
    where ballot_id = new.id and side = 'affirmative'
  ) + new.argument_score_aff + new.closing_score_aff;

  new.total_neg := (
    select coalesce(sum(total), 0) from player_scores
    where ballot_id = new.id and side = 'negative'
  ) + new.argument_score_neg + new.closing_score_neg;

  -- 判定勝負
  if new.total_aff = 0 and new.total_neg = 0 then
    new.ballot_winner := '尚未判定';
  elsif new.total_aff > new.total_neg then
    new.ballot_winner := '正方勝';
  elsif new.total_neg > new.total_aff then
    new.ballot_winner := '反方勝';
  elsif new.argument_score_aff > new.argument_score_neg then
    new.ballot_winner := '正方勝';
  elsif new.argument_score_neg > new.argument_score_aff then
    new.ballot_winner := '反方勝';
  else
    new.ballot_winner := '平手';
  end if;

  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

create trigger trg_ballot_winner
  before insert or update on ballots
  for each row execute function compute_ballot_winner();

-- ============================================================
-- Helper function: 重算 match 聚合結果
-- ============================================================

create or replace function recompute_match_result()
returns trigger as $$
declare
  m_id uuid;
  aff_wins int;
  neg_wins int;
  draw_wins int;
begin
  m_id := coalesce(new.match_id, old.match_id);

  select
    count(*) filter (where ballot_winner = '正方勝'),
    count(*) filter (where ballot_winner = '反方勝'),
    count(*) filter (where ballot_winner = '平手')
  into aff_wins, neg_wins, draw_wins
  from ballots where match_id = m_id;

  update matches set
    ballot_wins_aff = aff_wins,
    ballot_wins_neg = neg_wins,
    ballot_wins_draw = draw_wins,
    total_score_aff = (select coalesce(sum(total_aff), 0) from ballots where match_id = m_id),
    total_score_neg = (select coalesce(sum(total_neg), 0) from ballots where match_id = m_id),
    match_winner = case
      when aff_wins > neg_wins then '正方勝'
      when neg_wins > aff_wins then '反方勝'
      when aff_wins = 0 and neg_wins = 0 then '尚未判定'
      else '平手'
    end,
    status = case
      when (aff_wins + neg_wins + draw_wins) >= (
        select expected_ballot_count from competitions c
        join matches mm on mm.competition_id = c.id
        where mm.id = m_id
      ) then 'complete'
      when (aff_wins + neg_wins + draw_wins) > 0 then 'incomplete'
      else 'draft'
    end
  where id = m_id;

  return new;
end;
$$ language plpgsql;

create trigger trg_match_result
  after insert or update or delete on ballots
  for each row execute function recompute_match_result();
