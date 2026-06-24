(function () {
  "use strict";

  var db = null;
  var escapeHtml = window.DebateCore.escapeHtml;
  var formatDate = window.DebateCore.formatDate;

  // ============================================================
  // Dashboard — 個人紀錄
  // ============================================================

  var dashboardSearchName = "";

  async function renderDashboard() {
    var profile = window.DebateAuth.profile;
    var container = document.getElementById("dashboardContent");
    if (!profile || !container) return;

    var isAdmin = profile.role === "admin";
    var name = dashboardSearchName || profile.display_name;

    // 搜尋框（管理員可查任何人，一般使用者只能看自己）
    var searchHtml = isAdmin
      ? '<div class="dashboard-search"><input id="dashboardNameSearch" type="search" placeholder="輸入選手或裁判姓名查詢…" value="' + escapeHtml(dashboardSearchName) + '" />' +
        '<button class="form-submit" type="button" id="dashboardSearchBtn">查詢</button></div>'
      : '';

    var metaEl = document.getElementById("dashboardMeta");
    metaEl.textContent = name + (name === profile.display_name && profile.initial ? "（" + profile.initial + "）" : "");

    container.innerHTML = searchHtml + '<p class="loading-text">載入中…</p>';

    if (isAdmin) {
      var searchInput = document.getElementById("dashboardNameSearch");
      var searchBtn = document.getElementById("dashboardSearchBtn");
      function doSearch() {
        dashboardSearchName = searchInput.value.trim();
        renderDashboard();
      }
      searchBtn.addEventListener("click", doSearch);
      searchInput.addEventListener("keydown", function (e) { if (e.key === "Enter") doSearch(); });
    }

    if (!name) {
      container.querySelector(".loading-text").innerHTML = '<div class="search-empty"><div><span aria-hidden="true">🔎</span><strong>請輸入姓名查詢</strong></div></div>';
      return;
    }

    try {
      var [scoresRes, ballotsRes] = await Promise.all([
        db.from("player_scores")
          .select("*, ballots(judge, approval_status), matches(match_date, affirmative_team, negative_team, competition_id, competitions(name))")
          .eq("player_name", name),
        db.from("ballots")
          .select("*, matches(match_date, affirmative_team, negative_team, competition_id, competitions(name))")
          .eq("judge", name),
      ]);

      if (scoresRes.error || ballotsRes.error) {
        var qErr = scoresRes.error || ballotsRes.error;
        var loadingEl3 = container.querySelector(".loading-text");
        var errMsg = '<p class="form-error">查詢失敗：' + escapeHtml(translateError(qErr.message)) + '</p>';
        if (loadingEl3) loadingEl3.outerHTML = errMsg;
        return;
      }
      var scores = (scoresRes.data || []).filter(function (s) { return s.ballots && s.ballots.approval_status === "approved"; });
      var judgeBallots = (ballotsRes.data || []).filter(function (b) { return b.approval_status === "approved"; });

      var uniqueMatches = new Set(scores.map(function (s) { return s.match_id; }));

      var statsHtml = '<div class="dashboard-stats">' +
        '<div class="stat-item"><span>出場次數</span><strong>' + uniqueMatches.size + '</strong></div>' +
        '<div class="stat-item"><span>裁判場次</span><strong>' + judgeBallots.length + '</strong></div>' +
        '<div class="stat-item"><span>個人評分紀錄</span><strong>' + scores.length + '</strong></div>' +
        '</div>';

      var playerHtml = "";
      if (scores.length) {
        var sorted = scores.slice().sort(function (a, b) {
          var da = a.matches ? a.matches.match_date || "" : "";
          var db2 = b.matches ? b.matches.match_date || "" : "";
          return db2.localeCompare(da);
        });
        playerHtml = '<section class="result-section"><h2>選手出場紀錄</h2><div class="history-list">' +
          sorted.map(function (s) {
            var m = s.matches || {};
            var comp = m.competitions ? m.competitions.name : "";
            return '<article class="history-item">' +
              '<span class="history-date">' + escapeHtml(formatDate(m.match_date || "")) + '</span>' +
              '<div><strong>' + escapeHtml(m.affirmative_team || "") + ' vs ' + escapeHtml(m.negative_team || "") + '</strong>' +
              '<p>' + escapeHtml(comp) + ' · ' + escapeHtml(s.side === "affirmative" ? "正方" : "反方") +
              ' · 申論 ' + s.speech + ' / 質詢 ' + s.question + ' / 答辯 ' + s.defense + ' = ' + s.total + '</p></div>' +
              '<span class="history-badge">' + escapeHtml(s.side === "affirmative" ? "正方" : "反方") + '</span></article>';
          }).join("") + '</div></section>';
      }

      var judgeHtml = "";
      if (judgeBallots.length) {
        var sortedJ = judgeBallots.slice().sort(function (a, b) {
          var da = a.matches ? a.matches.match_date || "" : "";
          var db2 = b.matches ? b.matches.match_date || "" : "";
          return db2.localeCompare(da);
        });
        judgeHtml = '<section class="result-section"><h2>裁判紀錄</h2><div class="history-list">' +
          sortedJ.map(function (b) {
            var m = b.matches || {};
            var comp = m.competitions ? m.competitions.name : "";
            return '<article class="history-item">' +
              '<span class="history-date">' + escapeHtml(formatDate(m.match_date || "")) + '</span>' +
              '<div><strong>' + escapeHtml(m.affirmative_team || "") + ' vs ' + escapeHtml(m.negative_team || "") + '</strong>' +
              '<p>' + escapeHtml(comp) + ' · 正方 ' + b.total_aff + ' / 反方 ' + b.total_neg + ' · ' + escapeHtml(b.ballot_winner || "") + '</p></div>' +
              '<span class="history-badge">裁判</span></article>';
          }).join("") + '</div></section>';
      }

      var resultHtml = statsHtml + (playerHtml || judgeHtml ? "" : '<div class="search-empty"><div><span aria-hidden="true">📭</span><strong>尚無紀錄</strong><p>以姓名「' + escapeHtml(name) + '」比對資料庫，目前沒有找到相關紀錄。</p></div></div>') + playerHtml + judgeHtml;
      var loadingEl = container.querySelector(".loading-text");
      if (loadingEl) loadingEl.outerHTML = resultHtml;
      else container.innerHTML = searchHtml + resultHtml;

    } catch (err) {
      var loadingEl2 = container.querySelector(".loading-text");
      var errHtml = '<p class="form-error">載入失敗：' + escapeHtml(translateError(err.message)) + '</p>';
      if (loadingEl2) loadingEl2.outerHTML = errHtml;
      else container.innerHTML = searchHtml + errHtml;
    }
  }

  // ============================================================
  // Recorder — 提交裁判單
  // ============================================================

  async function renderRecorder() {
    var container = document.getElementById("recorderContent");
    if (!container) return;
    container.innerHTML = '<p class="loading-text">載入賽事列表…</p>';

    try {
      var compRes = await db.from("competitions").select("id, name").order("start_date", { ascending: false });
      var competitions = compRes.data || [];

      var compListId = "recCompList";
      var compDatalist = '<datalist id="' + compListId + '">' +
        competitions.map(function (c) { return '<option value="' + escapeHtml(c.name) + '"></option>'; }).join("") + '</datalist>';

      container.innerHTML =
        '<form id="recorderForm" class="recorder-form" autocomplete="off">' +
        '<label>賽事<input id="recCompetition" type="text" list="' + compListId + '" required placeholder="輸入或選擇賽事…" /></label>' + compDatalist +
        '<label>比賽日期<input id="recMatchDate" type="date" /></label>' +
        '<div class="rec-scores-grid">' +
        '<label>時段<input id="recPeriod" type="number" min="1" max="8" placeholder="選填" /></label>' +
        '<label>會場<input id="recVenue" type="number" min="1" max="99" placeholder="選填" /></label>' +
        '</div>' +
        '<div class="rec-scores-grid">' +
        '<label>正方隊伍<input id="recAffTeam" type="text" required placeholder="正方隊伍名稱" /></label>' +
        '<label>反方隊伍<input id="recNegTeam" type="text" required placeholder="反方隊伍名稱" /></label>' +
        '</div>' +
        '<label>裁判姓名<input id="recJudge" type="text" required value="' + escapeHtml(window.DebateAuth.profile?.display_name || "") + '" /></label>' +
        '<label>記錄員<input id="recRecorderName" type="text" value="' + escapeHtml(window.DebateAuth.profile?.display_name || "") + '" /></label>' +
        '<div class="rec-scores-grid">' +
        '<label>正方論點分<input id="recArgAff" type="number" step="0.5" min="0" max="20" value="0" required /></label>' +
        '<label>反方論點分<input id="recArgNeg" type="number" step="0.5" min="0" max="20" value="0" required /></label>' +
        '<label>正方結辯分<input id="recCloseAff" type="number" step="0.5" min="0" max="50" value="0" required /></label>' +
        '<label>反方結辯分<input id="recCloseNeg" type="number" step="0.5" min="0" max="50" value="0" required /></label>' +
        '</div>' +
        '<h3>正方選手</h3>' +
        playerInputs("aff") +
        '<h3>反方選手</h3>' +
        playerInputs("neg") +
        '<p id="recError" class="form-error is-hidden"></p>' +
        '<p id="recSuccess" class="form-success is-hidden"></p>' +
        '<button class="form-submit" type="submit">提交裁判單（待審核）</button>' +
        '</form>';

      // 提交：自動找或建立 competition + match
      document.getElementById("recorderForm").addEventListener("submit", async function (e) {
        e.preventDefault();
        var submitBtn = e.target.querySelector('[type="submit"]');
        if (submitBtn.disabled) return;
        submitBtn.disabled = true;
        submitBtn.textContent = "提交中…";
        var errEl = document.getElementById("recError");
        var sucEl = document.getElementById("recSuccess");
        errEl.classList.add("is-hidden");
        sucEl.classList.add("is-hidden");

        var compName = document.getElementById("recCompetition").value.trim();
        var affTeam = document.getElementById("recAffTeam").value.trim();
        var negTeam = document.getElementById("recNegTeam").value.trim();
        if (!compName) { errEl.textContent = "請填寫賽事名稱"; errEl.classList.remove("is-hidden"); return; }
        if (!affTeam || !negTeam) { errEl.textContent = "請填寫正方和反方隊伍"; errEl.classList.remove("is-hidden"); return; }

        var session = await db.auth.getSession();
        var userId = session.data.session?.user?.id;

        // 找或建 competition
        var comp = competitions.find(function (c) { return c.name === compName; });
        var compId;
        if (comp) {
          compId = comp.id;
        } else {
          var compRes = await db.from("competitions").insert({ name: compName }).select("id").single();
          if (compRes.error) { errEl.textContent = "賽事建立失敗：" + translateError(compRes.error.message); errEl.classList.remove("is-hidden"); return; }
          compId = compRes.data.id;
        }

        // 建 match
        var matchData = {
          competition_id: compId,
          match_date: document.getElementById("recMatchDate").value || null,
          period: parseInt(document.getElementById("recPeriod").value) || null,
          venue: parseInt(document.getElementById("recVenue").value) || null,
          affirmative_team: affTeam,
          negative_team: negTeam,
        };
        var matchRes = await db.from("matches").insert(matchData).select("id").single();
        if (matchRes.error) { errEl.textContent = "場次建立失敗：" + translateError(matchRes.error.message); errEl.classList.remove("is-hidden"); return; }
        var matchId = matchRes.data.id;

        // 建 ballot
        var ballotData = {
          match_id: matchId,
          judge: document.getElementById("recJudge").value.trim(),
          recorder: document.getElementById("recRecorderName").value.trim(),
          argument_score_aff: parseFloat(document.getElementById("recArgAff").value) || 0,
          argument_score_neg: parseFloat(document.getElementById("recArgNeg").value) || 0,
          closing_score_aff: parseFloat(document.getElementById("recCloseAff").value) || 0,
          closing_score_neg: parseFloat(document.getElementById("recCloseNeg").value) || 0,
          approval_status: "pending",
          submitted_by: userId,
        };

        var ballotRes = await db.from("ballots").insert(ballotData).select("id").single();
        if (ballotRes.error) { errEl.textContent = "裁判單提交失敗：" + translateError(ballotRes.error.message); errEl.classList.remove("is-hidden"); submitBtn.disabled = false; submitBtn.textContent = "提交裁判單（待審核）"; return; }

        var players = collectPlayers(ballotRes.data.id, matchId);
        if (players.length) {
          var psRes = await db.from("player_scores").insert(players);
          if (psRes.error) { errEl.textContent = "選手分數寫入失敗：" + translateError(psRes.error.message); errEl.classList.remove("is-hidden"); submitBtn.disabled = false; submitBtn.textContent = "提交裁判單（待審核）"; return; }
        }

        sucEl.textContent = "裁判單已提交，等待管理員審核。";
        sucEl.classList.remove("is-hidden");
        e.target.reset();
        submitBtn.disabled = false;
        submitBtn.textContent = "提交裁判單（待審核）";
      });
    } catch (err) {
      container.innerHTML = '<p class="form-error">載入失敗：' + escapeHtml(translateError(err.message)) + '</p>';
    }
  }

  function playerInputs(sideKey) {
    var side = sideKey === "aff" ? "affirmative" : "negative";
    var rows = "";
    for (var i = 1; i <= 3; i++) {
      rows += '<div class="player-grid">' +
        '<input type="text" placeholder="選手 ' + i + ' 姓名" data-player-side="' + side + '" data-player-seat="' + i + '" data-player-field="name" />' +
        '<input type="number" step="0.5" min="0" max="100" value="0" data-player-side="' + side + '" data-player-seat="' + i + '" data-player-field="speech" placeholder="申論" />' +
        '<input type="number" step="0.5" min="0" max="100" value="0" data-player-side="' + side + '" data-player-seat="' + i + '" data-player-field="question" placeholder="質詢" />' +
        '<input type="number" step="0.5" min="0" max="100" value="0" data-player-side="' + side + '" data-player-seat="' + i + '" data-player-field="defense" placeholder="答辯" />' +
        '</div>';
    }
    return rows;
  }

  function collectPlayers(ballotId, matchId) {
    var players = [];
    var inputs = document.querySelectorAll("[data-player-side]");
    var grouped = {};
    inputs.forEach(function (el) {
      var key = el.dataset.playerSide + "-" + el.dataset.playerSeat;
      if (!grouped[key]) grouped[key] = { side: el.dataset.playerSide, seat: parseInt(el.dataset.playerSeat) };
      grouped[key][el.dataset.playerField] = el.dataset.playerField === "name" ? el.value.trim() : parseFloat(el.value) || 0;
    });
    Object.values(grouped).forEach(function (p) {
      if (!p.name) return;
      players.push({
        ballot_id: ballotId,
        match_id: matchId,
        player_name: p.name,
        side: p.side,
        seat_order: p.seat,
        speech: p.speech || 0,
        question: p.question || 0,
        defense: p.defense || 0,
      });
    });
    return players;
  }

  // ============================================================
  // Admin — 管理後台
  // ============================================================

  var ADMIN_TABLES = [
    { key: "pending", label: "待審核" },
    { key: "competitions", label: "賽事", cols: ["name", "start_date", "end_date", "organizer", "is_public", "expected_ballot_count"] },
    { key: "entities", label: "隊伍", cols: ["code", "type", "name"] },
    { key: "matches", label: "場次", cols: ["competition_id", "match_date", "period", "venue", "affirmative_team", "negative_team", "affirmative_entity", "negative_entity", "status"] },
    { key: "ballots", label: "裁判單", cols: ["match_id", "judge", "recorder", "argument_score_aff", "argument_score_neg", "closing_score_aff", "closing_score_neg", "total_aff", "total_neg", "ballot_winner", "approval_status"] },
    { key: "player_scores", label: "選手分數", cols: ["match_id", "ballot_id", "player_name", "side", "seat_order", "speech", "question", "defense", "total"] },
    { key: "honors", label: "榮譽", cols: ["competition_id", "honor_type", "title", "recipient", "entity_code", "note"] },
    { key: "public_records", label: "公開戰績", cols: ["competition_id", "match_date", "affirmative_team", "negative_team", "score_aff", "score_neg", "winner"] },
    { key: "topics", label: "辯題", cols: ["competition_id", "title", "explanation", "sort_order"] },
    { key: "profiles", label: "使用者", cols: ["display_name", "initial", "role"] },
    { key: "entity_aliases", label: "隊伍別名", cols: ["entity_code", "alias"] },
  ];

  // FK 欄位 → 對應的下拉選單資料來源
  var FK_LOOKUPS = {
    competition_id: { table: "competitions", label: "name", value: "id" },
    entity_code: { table: "entities", label: "name", value: "code" },
    affirmative_entity: { table: "entities", label: "name", value: "code" },
    negative_entity: { table: "entities", label: "name", value: "code" },
  };
  var fkCache = {};

  // 欄位中文名稱
  var COL_LABELS = {
    code: "代碼（如 s001）", type: "類別",
    name: "名稱", start_date: "開始日期", end_date: "結束日期", organizer: "主辦單位",
    is_public: "公開", expected_ballot_count: "預期裁判單數（3或5）", aliases: "別名",
    competition_id: "賽事", match_date: "比賽日期", period: "時段", venue: "會場",
    affirmative_team: "正方隊伍", negative_team: "反方隊伍",
    affirmative_entity: "正方學校", negative_entity: "反方學校", status: "狀態",
    match_id: "場次 ID", judge: "裁判", recorder: "記錄員",
    argument_score_aff: "正方論點分", argument_score_neg: "反方論點分",
    closing_score_aff: "正方結辯分", closing_score_neg: "反方結辯分",
    total_aff: "正方總分", total_neg: "反方總分", ballot_winner: "裁判單勝方",
    approval_status: "審核狀態", ballot_id: "裁判單 ID",
    player_name: "選手姓名", side: "持方", seat_order: "座序",
    speech: "申論", question: "質詢", defense: "答辯", total: "總分",
    honor_type: "類型（team/individual）", title: "標題", recipient: "得獎者",
    entity_code: "學校", alias: "別名", note: "備註",
    score_aff: "正方比分", score_neg: "反方比分", winner: "勝方",
    explanation: "說明", sort_order: "排序",
    display_name: "姓名", initial: "字頭", role: "角色",
  };

  function colLabel(col) { return COL_LABELS[col] || col; }

  // 特殊欄位的輸入元件
  var SPECIAL_INPUTS = {
    is_public: { type: "select", options: [["true", "是"], ["false", "否"]], default: "true" },
    expected_ballot_count: { type: "select", options: [["3", "3 張"], ["5", "5 張"]], default: "3" },
    honor_type: { type: "select", options: [["team", "團體"], ["individual", "個人"]] },
    side: { type: "select", options: [["affirmative", "正方"], ["negative", "反方"]] },
    type: { type: "select", options: [["s", "學校"], ["p", "特殊隊伍"], ["u", "大學"]] },
    approval_status: { type: "select", options: [["pending", "待審核"], ["approved", "已核准"], ["rejected", "已駁回"]] },
    role: { type: "select", options: [["admin", "管理員"], ["user", "使用者"], ["recorder", "記錄員"], ["viewer", "瀏覽者"]] },
    start_date: { type: "date" },
    end_date: { type: "date" },
    match_date: { type: "date" },
  };

  function specialInput(col, currentVal, dataAttr) {
    var spec = SPECIAL_INPUTS[col];
    if (!spec) return null;
    if (spec.type === "select") {
      var val = currentVal != null ? String(currentVal) : (spec.default || "");
      return '<select class="admin-cell-input" ' + dataAttr + '>' +
        spec.options.map(function (o) {
          return '<option value="' + escapeHtml(o[0]) + '"' + (val === o[0] ? ' selected' : '') + '>' + escapeHtml(o[1]) + '</option>';
        }).join("") + '</select>';
    }
    if (spec.type === "date") {
      return '<input class="admin-cell-input" type="date" ' + dataAttr + ' value="' + escapeHtml(currentVal || "") + '" />';
    }
    return null;
  }

  var currentAdminTab = "pending";

  async function renderAdmin() {
    var tabsEl = document.getElementById("adminTabs");
    var panelEl = document.getElementById("adminPanel");
    if (!tabsEl || !panelEl) return;

    tabsEl.innerHTML = ADMIN_TABLES.map(function (t) {
      return '<button class="admin-tab' + (t.key === currentAdminTab ? " is-active" : "") + '" type="button" data-admin-tab="' + t.key + '">' + t.label + '</button>';
    }).join("");

    tabsEl.onclick = function (e) {
      var btn = e.target.closest("[data-admin-tab]");
      if (!btn) return;
      currentAdminTab = btn.dataset.adminTab;
      renderAdmin();
    };

    if (currentAdminTab === "pending") {
      await renderPending(panelEl);
    } else if (currentAdminTab === "profiles") {
      await renderProfiles(panelEl);
    } else {
      var table = ADMIN_TABLES.find(function (t) { return t.key === currentAdminTab; });
      if (table) await renderCrudTable(panelEl, table.key, table.cols);
    }
  }

  // --- Pending approval ---
  async function renderPending(panel) {
    panel.innerHTML = '<p class="loading-text">載入待審核裁判單…</p>';
    var res = await db.from("ballots")
      .select("*, matches(match_date, affirmative_team, negative_team, competitions(name)), player_scores(*)")
      .eq("approval_status", "pending")
      .order("created_at", { ascending: false });

    var items = res.data || [];
    if (!items.length) { panel.innerHTML = '<div class="search-empty"><div><span aria-hidden="true">✅</span><strong>沒有待審核的裁判單</strong></div></div>'; return; }

    panel.innerHTML = '<h3>' + items.length + ' 張待審核裁判單</h3>' + items.map(function (b) {
      var m = b.matches || {};
      var comp = m.competitions ? m.competitions.name : "";
      var affPlayers = (b.player_scores || []).filter(function (p) { return p.side === "affirmative"; })
        .sort(function (a, b2) { return a.seat_order - b2.seat_order; });
      var negPlayers = (b.player_scores || []).filter(function (p) { return p.side === "negative"; })
        .sort(function (a, b2) { return a.seat_order - b2.seat_order; });

      function playerRow(p) {
        return '<tr><td>' + escapeHtml(p.player_name) + '</td><td>' + p.speech + '</td><td>' + p.question + '</td><td>' + p.defense + '</td><td><strong>' + p.total + '</strong></td></tr>';
      }

      function playerTable(players, sideLabel) {
        if (!players.length) return '';
        return '<div class="approval-side"><h4>' + sideLabel + '選手</h4>' +
          '<table class="approval-score-table"><thead><tr><th>姓名</th><th>申論</th><th>質詢</th><th>答辯</th><th>小計</th></tr></thead><tbody>' +
          players.map(playerRow).join("") + '</tbody></table></div>';
      }

      return '<div class="approval-card" data-ballot-id="' + b.id + '">' +
        '<div class="approval-header"><strong>' + escapeHtml(comp) + '</strong><span>' + escapeHtml(formatDate(m.match_date || "")) + '</span></div>' +
        '<div class="approval-match">' +
          '<span class="approval-team aff">' + escapeHtml(m.affirmative_team || "") + '</span>' +
          '<span class="approval-vs">vs</span>' +
          '<span class="approval-team neg">' + escapeHtml(m.negative_team || "") + '</span>' +
        '</div>' +
        '<div class="approval-info">' +
          '<div><span class="approval-label">裁判</span>' + escapeHtml(b.judge) + '</div>' +
          (b.recorder ? '<div><span class="approval-label">記錄員</span>' + escapeHtml(b.recorder) + '</div>' : '') +
        '</div>' +
        '<div class="approval-scores">' +
          '<div class="approval-score-block">' +
            '<h4>隊伍分數</h4>' +
            '<table class="approval-score-table"><thead><tr><th></th><th>正方</th><th>反方</th></tr></thead><tbody>' +
            '<tr><td>論點分</td><td>' + b.argument_score_aff + '</td><td>' + b.argument_score_neg + '</td></tr>' +
            '<tr><td>結辯分</td><td>' + b.closing_score_aff + '</td><td>' + b.closing_score_neg + '</td></tr>' +
            '<tr class="score-total"><td>總分</td><td><strong>' + b.total_aff + '</strong></td><td><strong>' + b.total_neg + '</strong></td></tr>' +
            '</tbody></table>' +
            '<div class="approval-winner">' + escapeHtml(b.ballot_winner || "尚未判定") + '</div>' +
          '</div>' +
          playerTable(affPlayers, "正方") +
          playerTable(negPlayers, "反方") +
        '</div>' +
        '<div class="approval-actions">' +
          '<button class="btn-approve" type="button" data-approve="' + b.id + '">核准</button>' +
          '<button class="btn-reject" type="button" data-reject="' + b.id + '">駁回</button>' +
        '</div></div>';
    }).join("");

    panel.addEventListener("click", async function (e) {
      var approveId = e.target.dataset.approve;
      var rejectId = e.target.dataset.reject;
      if (!approveId && !rejectId) return;
      var id = approveId || rejectId;
      var status = approveId ? "approved" : "rejected";
      e.target.disabled = true;
      var res = await db.from("ballots").update({ approval_status: status }).eq("id", id);
      var card = panel.querySelector('[data-ballot-id="' + id + '"]');
      if (res.error) {
        e.target.disabled = false;
        alert(translateError(res.error.message));
        return;
      }
      if (card) {
        card.style.opacity = "0.4";
        var actions = card.querySelector(".approval-actions");
        if (actions) actions.innerHTML = '<p><strong>' + (status === "approved" ? "✅ 已核准" : "❌ 已駁回") + '</strong></p>';
      }
    });
  }

  // --- User management ---
  async function renderProfiles(panel) {
    panel.innerHTML = '<p class="loading-text">載入使用者…</p>';
    var res = await db.from("profiles").select("*").order("created_at", { ascending: false });
    var users = res.data || [];

    panel.innerHTML = '<table class="admin-table"><thead><tr><th>姓名</th><th>字頭</th><th>角色</th><th>操作</th></tr></thead><tbody>' +
      users.map(function (u) {
        return '<tr data-profile-id="' + u.id + '">' +
          '<td>' + escapeHtml(u.display_name) + '</td>' +
          '<td>' + escapeHtml(u.initial || "") + '</td>' +
          '<td><select class="profile-role-select" data-uid="' + u.id + '">' +
          [['admin','管理員'], ['user','使用者'], ['recorder','記錄員']].map(function (r) { return '<option value="' + r[0] + '"' + (u.role === r[0] || (r[0] === 'user' && u.role === 'viewer') ? ' selected' : '') + '>' + r[1] + '</option>'; }).join("") +
          '</select></td>' +
          '<td><button class="btn-save-role" type="button" data-uid="' + u.id + '">儲存</button></td></tr>';
      }).join("") + '</tbody></table>';

    panel.addEventListener("click", async function (e) {
      if (!e.target.dataset.uid || !e.target.classList.contains("btn-save-role")) return;
      var uid = e.target.dataset.uid;
      var sel = panel.querySelector('.profile-role-select[data-uid="' + uid + '"]');
      if (!sel) return;
      e.target.disabled = true;
      e.target.textContent = "…";
      var upRes = await db.from("profiles").update({ role: sel.value }).eq("id", uid);
      if (upRes.error) { e.target.textContent = "失敗"; alert(translateError(upRes.error.message)); e.target.disabled = false; return; }
      e.target.textContent = "已儲存";
      setTimeout(function () { e.target.textContent = "儲存"; e.target.disabled = false; }, 1500);
    });
  }

  function translateError(msg) {
    if (!msg) return "未知錯誤";
    if (msg.indexOf("violates check constraint") >= 0) {
      var match = msg.match(/"([^"]+)"/);
      return "違反欄位限制：" + (match ? match[1] : "") + "，請檢查輸入值是否在允許範圍內";
    }
    if (msg.indexOf("violates foreign key") >= 0) return "關聯錯誤：引用的資料不存在，請確認 ID 是否正確";
    if (msg.indexOf("violates not-null") >= 0) return "必填欄位不能留空";
    if (msg.indexOf("violates unique") >= 0 || msg.indexOf("duplicate key") >= 0) return "資料重複：已有相同的紀錄存在";
    if (msg.indexOf("permission denied") >= 0 || msg.indexOf("row-level security") >= 0) return "權限不足：您沒有執行此操作的權限";
    if (msg.indexOf("Could not find") >= 0 && msg.indexOf("schema cache") >= 0) return "後端 schema 尚未同步，請稍後再試（通常幾秒內自動修復）";
    if (msg.indexOf("JWT") >= 0 || msg.indexOf("token") >= 0) return "登入已過期，請重新登入";
    if (msg.indexOf("timeout") >= 0 || msg.indexOf("Timeout") >= 0) return "請求逾時，請稍後再試";
    if (msg.indexOf("network") >= 0 || msg.indexOf("Network") >= 0 || msg.indexOf("fetch") >= 0) return "網路錯誤，請檢查網路連線";
    if (msg.indexOf("invalid input syntax") >= 0) return "輸入格式錯誤：請確認數值、日期等欄位格式正確";
    if (msg.indexOf("value too long") >= 0) return "輸入內容太長，請縮短後再試";
    if (msg.indexOf("null value in column") >= 0) {
      var colMatch = msg.match(/column "([^"]+)"/);
      return "欄位「" + (colMatch ? colMatch[1] : "") + "」不能為空";
    }
    if (msg.indexOf("update or delete on table") >= 0) return "無法刪除：此筆資料仍被其他紀錄引用";
    return msg;
  }

  // --- Generic CRUD table ---
  async function loadFkOptions(cols) {
    var needed = cols.filter(function (c) { return FK_LOOKUPS[c] && !fkCache[c]; });
    if (!needed.length) return;
    var fetches = needed.map(function (c) {
      var lk = FK_LOOKUPS[c];
      return db.from(lk.table).select(lk.value + ", " + lk.label).order(lk.label).then(function (res) {
        fkCache[c] = (res.data || []).map(function (r) { return { value: r[lk.value], label: r[lk.label] }; });
      });
    });
    await Promise.all(fetches);
  }

  var _fkListId = 0;
  function fkSelect(col, currentVal, dataAttr) {
    var opts = fkCache[col];
    if (!opts) return '<input class="admin-cell-input" type="text" ' + dataAttr + ' value="' + escapeHtml(currentVal) + '" />';
    var listId = "fklist_" + (++_fkListId);
    var displayVal = currentVal ? fkDisplayName(col, currentVal) : "";
    var html = '<input class="admin-cell-input" type="text" list="' + listId + '" ' + dataAttr + ' data-fk-col="' + col + '" value="' + escapeHtml(displayVal) + '" placeholder="輸入或選擇…" />';
    html += '<datalist id="' + listId + '">';
    opts.forEach(function (o) {
      html += '<option value="' + escapeHtml(o.label) + '" data-fk-val="' + escapeHtml(o.value) + '"></option>';
    });
    html += '</datalist>';
    return html;
  }

  function resolveFkValue(col, inputVal) {
    var opts = fkCache[col];
    if (!opts || !inputVal) return inputVal || null;
    var match = opts.find(function (o) { return o.label === inputVal; });
    return match ? match.value : inputVal;
  }

  function fkDisplayName(col, val) {
    if (!fkCache[col] || !val) return val == null ? "" : String(val);
    var found = fkCache[col].find(function (o) { return String(o.value) === String(val); });
    return found ? found.label : String(val);
  }

  var TABLE_SORT = {
    topics: "sort_order",
    entities: "name",
    player_scores: "player_name",
    entity_aliases: "entity_code",
  };

  async function renderCrudTable(panel, tableName, cols) {
    panel.innerHTML = '<p class="loading-text">載入中…</p>';
    await loadFkOptions(cols);
    var sortCol = TABLE_SORT[tableName] || "created_at";
    var ascending = !!TABLE_SORT[tableName];
    var res = await db.from(tableName).select("*").order(sortCol, { ascending: ascending }).limit(500);
    var allRows = res.data || [];
    var readonlyCols = ["total", "total_aff", "total_neg", "ballot_winner", "status"];

    var pkCol = tableName === "entities" ? "code" : tableName === "entity_aliases" ? "entity_code" : "id";

    function rowPk(row) { return row[pkCol] || row.id; }

    function buildTable(rows) {
      return '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>' +
        cols.map(function (c) { return '<th>' + escapeHtml(colLabel(c)) + '</th>'; }).join("") +
        '<th>操作</th></tr></thead><tbody>' +
        rows.map(function (row) {
          return '<tr data-row-id="' + escapeHtml(String(rowPk(row))) + '">' +
            cols.map(function (c) {
              var val = row[c] == null ? "" : String(row[c]);
              if (readonlyCols.indexOf(c) >= 0) return '<td>' + escapeHtml(val) + '</td>';
              var sp = specialInput(c, row[c], 'data-col="' + c + '"');
              if (sp) return '<td>' + sp + '</td>';
              if (FK_LOOKUPS[c]) return '<td>' + fkSelect(c, val, 'data-col="' + c + '"') + '</td>';
              return '<td><input class="admin-cell-input" type="text" data-col="' + c + '" value="' + escapeHtml(val) + '" /></td>';
            }).join("") +
            '<td class="admin-actions"><button class="btn-save-row" type="button" data-save-row="' + escapeHtml(String(rowPk(row))) + '">儲存</button>' +
            '<button class="btn-delete-row" type="button" data-delete-row="' + escapeHtml(String(rowPk(row))) + '">刪除</button></td></tr>';
        }).join("") + '</tbody></table></div>';
    }

    // Add new row form
    var addHtml = '<div class="admin-add-section"><h3>新增一筆</h3><div class="admin-add-form">' +
      cols.filter(function (c) { return readonlyCols.indexOf(c) < 0; }).map(function (c) {
        var sp = specialInput(c, null, 'data-new-col="' + c + '"');
        if (sp) return '<label>' + escapeHtml(colLabel(c)) + sp + '</label>';
        if (FK_LOOKUPS[c]) return '<label>' + escapeHtml(colLabel(c)) + fkSelect(c, '', 'data-new-col="' + c + '"') + '</label>';
        return '<label>' + escapeHtml(colLabel(c)) + '<input type="text" data-new-col="' + c + '" /></label>';
      }).join("") +
      '<button class="form-submit btn-add-row" type="button">新增</button>' +
      '<p id="addRowMsg" class="form-error is-hidden"></p></div></div>';

    // Search bar
    var searchHtml = '<div class="admin-search"><input id="adminSearchInput" type="search" placeholder="搜尋此表（任意欄位）…" autocomplete="off" />' +
      '<span id="adminSearchMeta">' + allRows.length + ' 筆資料</span></div>';

    panel.innerHTML = addHtml + searchHtml + buildTable(allRows);

    // Search filter
    var searchInput = document.getElementById("adminSearchInput");
    var searchMeta = document.getElementById("adminSearchMeta");
    var searchTimer;
    searchInput.addEventListener("input", function () {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(doSearch, 200);
    });
    function doSearch() {
      var needle = searchInput.value.trim().toLowerCase();
      var filtered = needle ? allRows.filter(function (row) {
        return cols.some(function (c) {
          if (row[c] == null) return false;
          var text = FK_LOOKUPS[c] ? fkDisplayName(c, row[c]) : String(row[c]);
          return text.toLowerCase().indexOf(needle) >= 0;
        });
      }) : allRows;
      searchMeta.textContent = filtered.length + ' / ' + allRows.length + ' 筆';
      var tableWrap = panel.querySelector(".admin-table-wrap");
      if (tableWrap) tableWrap.outerHTML = buildTable(filtered);
    }

    // Save / Delete / Add
    panel.addEventListener("click", async function (e) {
      if (e.target.dataset.saveRow) {
        var rowId = e.target.dataset.saveRow;
        var tr = panel.querySelector('tr[data-row-id="' + rowId + '"]');
        var updates = {};
        tr.querySelectorAll(".admin-cell-input").forEach(function (inp) {
          var col = inp.dataset.col;
          if (inp.dataset.fkCol) {
            updates[col] = resolveFkValue(inp.dataset.fkCol, inp.value);
          } else {
            updates[col] = inp.value || null;
          }
        });
        e.target.textContent = "…";
        var upRes = await db.from(tableName).update(updates).eq(pkCol, rowId);
        if (upRes.error) {
          e.target.textContent = "失敗";
          alert(translateError(upRes.error.message));
        } else {
          e.target.textContent = "已存";
        }
        setTimeout(function () { e.target.textContent = "儲存"; }, 1500);
      }
      if (e.target.dataset.deleteRow) {
        if (!confirm("確定要刪除這筆資料？此操作無法復原。")) return;
        var delId = e.target.dataset.deleteRow;
        e.target.textContent = "…";
        var delQuery = db.from(tableName).delete().eq(pkCol, delId);
        if (tableName === "entity_aliases") {
          var delTrEl = panel.querySelector('tr[data-row-id="' + delId + '"]');
          var delAlias = delTrEl ? delTrEl.querySelector('[data-col="alias"]') : null;
          if (delAlias) delQuery = delQuery.eq("alias", delAlias.value);
        }
        var delRes = await delQuery;
        if (delRes.error) {
          alert(translateError(delRes.error.message));
          e.target.textContent = "刪除";
        } else {
          var delTr = panel.querySelector('tr[data-row-id="' + delId + '"]');
          if (delTr) delTr.remove();
          allRows = allRows.filter(function (r) { return String(rowPk(r)) !== delId; });
          searchMeta.textContent = allRows.length + ' 筆資料';
        }
      }
      if (e.target.classList.contains("btn-add-row")) {
        var newData = {};
        var fkError = "";
        panel.querySelectorAll("[data-new-col]").forEach(function (inp) {
          if (!inp.value.trim()) return;
          var col = inp.dataset.newCol;
          if (inp.dataset.fkCol) {
            var resolved = resolveFkValue(inp.dataset.fkCol, inp.value.trim());
            if (resolved === inp.value.trim() && fkCache[inp.dataset.fkCol]) {
              var lk = FK_LOOKUPS[inp.dataset.fkCol];
              fkError = "「" + colLabel(col) + "」找不到「" + inp.value.trim() + "」，請先到「" + (lk.table === "competitions" ? "賽事" : "隊伍") + "」分頁新增後再回來選擇";
            }
            newData[col] = resolved;
          } else {
            newData[col] = inp.value.trim();
          }
        });
        var msg = document.getElementById("addRowMsg");
        if (fkError) {
          msg.textContent = fkError;
          msg.style.color = "";
          msg.classList.remove("is-hidden");
          return;
        }
        var insRes = await db.from(tableName).insert(newData);
        if (insRes.error) {
          msg.textContent = translateError(insRes.error.message);
          msg.style.color = "";
          msg.classList.remove("is-hidden");
        } else {
          msg.textContent = "新增成功！";
          msg.style.color = "var(--green)";
          msg.classList.remove("is-hidden");
          setTimeout(function () { renderCrudTable(panel, tableName, cols); }, 800);
        }
      }
    });
  }

  // ============================================================
  // Init
  // ============================================================

  window.DebateDashboard = {
    init: function (supabaseClient) { db = supabaseClient; },
    renderDashboard: renderDashboard,
    renderAdmin: renderAdmin,
    renderRecorder: renderRecorder,
  };
})();
