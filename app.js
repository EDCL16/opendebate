const { escapeHtml, formatDate, countBy, unique, normalize, groupByDate, createStore } = window.DebateCore;
const store = createStore(window.DEBATE_PUBLIC_DATA);
let records = store.records;
let honors = store.honors;
let topics = store.topics;
let events = [];
let selectedEntityId = "";

const els = {
  homeBrand: document.querySelector("#homeBrand"),
  navButtons: document.querySelectorAll("[data-view]"),
  views: document.querySelectorAll("[data-view-panel]"),
  statsBand: document.querySelector("#statsBand"),
  eventTimeline: document.querySelector("#eventTimeline"),
  recentEvents: document.querySelector("#recentEvents"),
  schoolLeaderboard: document.querySelector("#schoolLeaderboard"),
  gamesLeaderboard: document.querySelector("#gamesLeaderboard"),
  winsLeaderboard: document.querySelector("#winsLeaderboard"),
  eventSearch: document.querySelector("#eventSearch"),
  eventYear: document.querySelector("#eventYear"),
  eventFinderMeta: document.querySelector("#eventFinderMeta"),
  eventFinderResults: document.querySelector("#eventFinderResults"),
  eventDetail: document.querySelector("#eventDetail"),
  globalSearch: document.querySelector("#globalSearch"),
  clearSearch: document.querySelector("#clearSearch"),
  searchMeta: document.querySelector("#searchMeta"),
  searchResults: document.querySelector("#searchResults"),
  reportFormLink: document.querySelector("#reportFormLink"),
};

function eventSummaries() {
  const names = unique([...records.map((item) => item.competitionName), ...honors.map((item) => item.competitionName), ...topics.map((item) => item.competitionName)]);
  return names.map((name) => {
    const eventRecords = records.filter((item) => item.competitionName === name);
    const eventHonors = honors.filter((item) => item.competitionName === name);
    const dates = unique([...eventRecords.map((item) => item.matchDate), ...eventHonors.map((item) => item.matchDate)]).sort();
    const eventTopics = topics.filter((item) => item.competitionName === name);
    return { name, records: eventRecords, honors: eventHonors, topics: eventTopics, dates, latestDate: dates.at(-1) || "" };
  }).sort((a, b) => b.latestDate.localeCompare(a.latestDate) || a.name.localeCompare(b.name, "zh-Hant"));
}



function showView(name) {
  const target = ["home", "events", "search", "reports"].includes(name) ? name : "home";
  els.views.forEach((view) => view.classList.toggle("is-hidden", view.dataset.viewPanel !== target));
  els.navButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.view === target));
  if (location.hash !== `#${target}`) history.replaceState(null, "", `#${target}`);
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (target === "search") requestAnimationFrame(() => els.globalSearch.focus());
}

function renderStats() {
  const schools = unique(records.flatMap((item) => [item.teamIds?.affirmative || item.teams?.affirmative, item.teamIds?.negative || item.teams?.negative]));
  const players = unique(honors.filter((item) => item.honorType === "player").map((item) => item.recipient));
  const values = [
    ["📣 已收錄賽事", events.length],
    ["⚔️ 公開戰果", records.length],
    ["🏫 參賽學校／隊伍", schools.length],
    ["🏆 公開榮譽", honors.length + (players.length ? 0 : 0)],
  ];
  els.statsBand.innerHTML = values.map(([label, value]) => `<div class="stat-item"><span>${label}</span><strong>${value}</strong></div>`).join("");
}

function renderRecentEvents() {
  els.recentEvents.innerHTML = events.map((event) => {
    const topicPreview = event.topics.slice(0, 2).map((item) => `<p class="event-card-topic"><span>辯題：</span>${escapeHtml(item.topic)}</p>`).join("");
    return `
      <button class="event-card" type="button" data-event-name="${escapeHtml(event.name)}">
        <span class="event-date">${escapeHtml(formatDate(event.latestDate))}</span>
        <div class="event-card-body">
          <h3>${escapeHtml(event.name)}</h3>
          ${topicPreview ? `<div class="event-card-topics">${topicPreview}</div>` : ""}
        </div>
        <span class="event-card-meta"><span>${event.records.length} 場戰果</span><span>${event.honors.length} 筆榮譽</span></span>
      </button>`;
  }).join("");
}

function honorSubject(honor) {
  return honor.honorType === "player" ? honor.recipient : honor.recipient || honor.team;
}

function eventChampion(event) {
  const champion = event.honors.find((honor) => honor.honorName?.trim() === "冠軍");
  return champion ? honorSubject(champion) : "尚未收錄冠軍";
}

function renderTimeline() {
  const timelineEvents = [...events].sort((a, b) => (b.latestDate || "").localeCompare(a.latestDate || ""));
  els.eventTimeline.innerHTML = timelineEvents.map((event, index) => `
    <button class="timeline-node" type="button" data-event-name="${escapeHtml(event.name)}" aria-label="${escapeHtml(`${event.name}，${formatDate(event.latestDate)}，冠軍 ${eventChampion(event)}`)}">
      <span class="timeline-date">${escapeHtml(formatDate(event.latestDate))}</span>
      <span class="timeline-dot" aria-hidden="true">${index === 0 ? "★" : ""}</span>
      <span class="timeline-name">${escapeHtml(event.name)}</span>
      <span class="timeline-tooltip" role="tooltip"><small>冠軍</small><strong>${escapeHtml(eventChampion(event))}</strong><em>點擊查看完整賽果</em></span>
    </button>`).join("");
}

function renderLeaderboards() {
  const schoolIds = new Set(store.entities.filter((entity) => entity.type === "s").map((entity) => entity.code));
  const schoolAwards = countBy(honors, (honor) => schoolIds.has(honor.teamId) ? honor.teamId : "").slice(0, 10);
  const schoolGames = countBy(records.flatMap((record) => Object.values(record.teamIds || {}).filter((id) => schoolIds.has(id))), (id) => id).slice(0, 10);
  const winIds = records.map((record) => {
    const winnerId = store.entityForName(record.winner)?.code;
    if (schoolIds.has(winnerId)) return winnerId;
    if (record.winner) return "";
    const affirmative = Number(record.scores?.affirmative) || 0;
    const negative = Number(record.scores?.negative) || 0;
    if (affirmative === negative) return "";
    const scoreWinner = affirmative > negative ? record.teamIds?.affirmative : record.teamIds?.negative;
    return schoolIds.has(scoreWinner) ? scoreWinner : "";
  });
  const schoolWins = countBy(winIds, (id) => id).slice(0, 10);
  const rows = (items, label, unit) => items.map(([id, count]) => `<li><div><strong>${escapeHtml(store.entityName(id, id))}</strong><span>${label}</span></div><span class="rank-count">${count} ${unit}</span></li>`).join("");
  els.schoolLeaderboard.innerHTML = rows(schoolAwards, "公開團體與選手榮譽", "項");
  els.gamesLeaderboard.innerHTML = rows(schoolGames, "已收錄公開賽果", "場");
  els.winsLeaderboard.innerHTML = rows(schoolWins, "已收錄勝場", "勝");
}

function renderEventOptions() {
  const years = unique(events.map((event) => event.latestDate.slice(0, 4))).sort((a, b) => b.localeCompare(a));
  els.eventYear.innerHTML = '<option value="">全部年份</option>' + years.map((year) => `<option value="${year}">${year} 年</option>`).join("");
  renderEventFinder();
}

function renderEventFinder() {
  const needle = normalize(els.eventSearch.value);
  const year = els.eventYear.value;
  const filtered = events.filter((event) => {
    const matchesYear = !year || event.latestDate.startsWith(year);
    const topicText = event.topics.flatMap((item) => [item.topic, item.explanation]).join(" ");
    return matchesYear && (!needle || normalize(`${event.name} ${topicText}`).includes(needle));
  });
  els.eventFinderMeta.textContent = `找到 ${filtered.length} 個賽事`;
  els.eventFinderResults.innerHTML = filtered.length ? filtered.map((event) => `
    <button class="event-result-card" type="button" data-event-name="${escapeHtml(event.name)}">
      <span class="event-result-year">${escapeHtml(event.latestDate.slice(0, 4) || "年份未載明")}</span>
      <strong>${escapeHtml(event.name)}</strong>
      <small>${event.records.length} 場 · ${event.honors.length} 項榮譽${event.topics.length ? ` · ${event.topics.length} 筆辯題` : ""}</small>
    </button>`).join("") : '<div class="event-finder-empty">沒有符合的賽事，請縮短關鍵字或切換年份。</div>';
}

function renderEvent(name) {
  const event = events.find((item) => item.name === name);
  if (!event) return;
  const grouped = groupByDate([...event.records].sort((a, b) => (b.matchDate || "").localeCompare(a.matchDate || "") || Number(a.period) - Number(b.period) || Number(a.venue) - Number(b.venue)));
  const matchDays = Object.entries(grouped).map(([date, matches]) => `
    <section class="match-day">
      <h3 class="match-day-title"><span aria-hidden="true">📅</span>${escapeHtml(formatDate(date))}</h3>
      <div class="match-list">${matches.map((match) => {
        const a = Number(match.scores?.affirmative) || 0;
        const n = Number(match.scores?.negative) || 0;
        return `<div class="match-row">
          <span class="match-place">時段 ${escapeHtml(match.period || "-")}<br>會場 ${escapeHtml(match.venue || "-")}</span>
          <span class="team-name">${escapeHtml(match.teams?.affirmative)}</span>
          <span class="match-score"><span class="${a > n ? "winner-score" : ""}">${a}</span><span>:</span><span class="${n > a ? "winner-score" : ""}">${n}</span></span>
          <span class="team-name negative">${escapeHtml(match.teams?.negative)}</span>
          <span class="match-note">${escapeHtml(match.note || "公開賽果")}</span>
        </div>`;
      }).join("")}</div>
    </section>`).join("");
  const eventHonors = [...event.honors].sort((a, b) => (b.matchDate || "").localeCompare(a.matchDate || ""));
  const topicSection = event.topics.length ? `<section class="event-topics"><div class="subheading-row"><h3 class="subheading">💡 比賽辯題</h3><span>${event.topics.length} 題</span></div>${event.topics.map((item, index) => `<article class="topic-card"><span>辯題 ${index + 1}</span><strong>${escapeHtml(item.topic)}</strong></article>`).join("")}</section>` : "";
  els.eventDetail.innerHTML = `
    <div class="event-summary">
      <div><h2>${escapeHtml(event.name)}</h2><p>${event.dates.map(formatDate).join("、")}</p></div>
      <div class="event-summary-count"><span class="count-chip">${event.records.length} 場比賽</span><span class="count-chip">${event.honors.length} 筆榮譽</span></div>
    </div>
    ${topicSection}
    <div class="event-content-grid">
      <div><h3 class="subheading">比賽結果</h3>${matchDays || '<div class="search-empty"><p>尚無公開戰果</p></div>'}</div>
      <aside class="event-honors"><h3 class="subheading">🏆 公開榮譽</h3>${eventHonors.length ? eventHonors.map((honor) => `<div class="event-honor"><span>${escapeHtml(honor.honorName)}</span><strong>${escapeHtml(honorSubject(honor))}</strong>${honor.team ? `<small>${escapeHtml(honor.team)}</small>` : ""}</div>`).join("") : "<p>尚無公開榮譽。</p>"}</aside>
    </div>`;
}

function setupReportLinks() {
  const config = window.DEBATE_SITE_CONFIG?.reports || {};
  if (config.formUrl) {
    els.reportFormLink.href = config.formUrl;
    return;
  }
  els.reportFormLink.removeAttribute("target");
  els.reportFormLink.removeAttribute("href");
  els.reportFormLink.classList.add("is-disabled");
  els.reportFormLink.textContent = "表單準備中";
  els.reportFormLink.setAttribute("aria-disabled", "true");
}

function renderSearch(query) {
  const needle = normalize(query);
  if (!needle) {
    els.searchMeta.textContent = "";
    els.searchResults.innerHTML = '<div class="search-empty"><div><span aria-hidden="true">🗂️</span><strong>從一個名字開始</strong><p>學校、隊伍或選手姓名都可以搜尋。</p></div></div>';
    return;
  }

  const allPlayers = unique(honors.filter((item) => item.honorType === "player").map((item) => item.recipient));
  const matchedEntities = store.entities.filter((entity) => [entity.code, entity.name, ...(entity.aliases || "").split("|")].some((name) => normalize(name).includes(needle)));
  const matchedPlayers = allPlayers.filter((name) => normalize(name).includes(needle));
  const entityIdSet = new Set(matchedEntities.map((entity) => entity.code));
  const playerSet = new Set(matchedPlayers);
  const matchedRecords = records.filter((item) => entityIdSet.has(item.teamIds?.affirmative) || entityIdSet.has(item.teamIds?.negative)).sort((a, b) => (b.matchDate || "").localeCompare(a.matchDate || ""));
  const matchedHonors = honors.filter((item) => entityIdSet.has(item.teamId) || playerSet.has(item.recipient)).sort((a, b) => (b.matchDate || "").localeCompare(a.matchDate || ""));
  const resultCount = matchedEntities.length + matchedPlayers.length;
  els.searchMeta.textContent = resultCount ? `找到 ${matchedEntities.length} 個學校／隊伍、${matchedPlayers.length} 位選手` : `沒有找到「${query}」`;
  if (!entityIdSet.has(selectedEntityId)) selectedEntityId = "";

  const entitySection = resultCount ? `<section class="result-section"><h2>符合名稱</h2><div class="entity-grid">
    ${matchedEntities.map((entity) => {
      const games = records.filter((item) => item.teamIds?.affirmative === entity.code || item.teamIds?.negative === entity.code).length;
      const awards = honors.filter((item) => item.teamId === entity.code).length;
      const aliases = (entity.aliases || "").split("|").filter(Boolean);
      return `<button class="entity-card${selectedEntityId === entity.code ? " is-selected" : ""}" type="button" data-entity-id="${escapeHtml(entity.code)}"><h3>🏫 ${escapeHtml(entity.name)}</h3><p>${games} 場公開賽果 · ${awards} 筆相關榮譽</p><small>${escapeHtml(entity.code)}${aliases.length ? ` · 別名：${aliases.map(escapeHtml).join("、")}` : ""}</small></button>`;
    }).join("")}
    ${matchedPlayers.map((name) => {
      const personHonors = honors.filter((item) => item.recipient === name);
      return `<article class="entity-card player"><h3><span class="player-icon" aria-hidden="true">🎤</span>${escapeHtml(name)}</h3><p>${escapeHtml(unique(personHonors.map((item) => item.team)).join("、") || "所屬學校未載明")} · ${personHonors.length} 筆榮譽</p></article>`;
    }).join("")}
  </div></section>` : "";

  const selectedEntity = store.entityById.get(selectedEntityId);
  const entityDetail = selectedEntity ? renderEntityDetail(selectedEntity) : "";

  const histories = [
    ...matchedRecords.map((item) => ({ date: item.matchDate, title: `${item.teams?.affirmative} ${item.scores?.affirmative}：${item.scores?.negative} ${item.teams?.negative}`, meta: item.competitionName, badge: item.note || "比賽" })),
    ...matchedHonors.map((item) => ({ date: item.matchDate, title: `${item.honorName}｜${honorSubject(item)}`, meta: `${item.competitionName}${item.team ? ` · ${item.team}` : ""}`, badge: "榮譽" })),
  ].sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 30);

  const historySection = histories.length ? `<section class="result-section"><h2>最近紀錄</h2><div class="history-list">${histories.map((item) => `<article class="history-item"><span class="history-date">${escapeHtml(formatDate(item.date))}</span><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.meta)}</p></div><span class="history-badge">${escapeHtml(item.badge)}</span></article>`).join("")}</div></section>` : "";
  els.searchResults.innerHTML = entitySection + entityDetail + (selectedEntity ? "" : historySection) || '<div class="search-empty"><div><span aria-hidden="true">🤔</span><strong>目前沒有相符資料</strong><p>可以縮短關鍵字再試一次。</p></div></div>';
}

function renderEntityDetail(entity) {
  const entityRecords = records.filter((item) => item.teamIds?.affirmative === entity.code || item.teamIds?.negative === entity.code)
    .sort((a, b) => (b.matchDate || "").localeCompare(a.matchDate || "") || Number(b.period) - Number(a.period));
  const entityHonors = honors.filter((item) => item.teamId === entity.code).sort((a, b) => (b.matchDate || "").localeCompare(a.matchDate || ""));
  function matchResult(match) {
    const side = match.teamIds?.affirmative === entity.code ? "affirmative" : "negative";
    const other = side === "affirmative" ? "negative" : "affirmative";
    const winnerId = store.entityForName(match.winner)?.code;
    if (winnerId) return winnerId === entity.code ? "勝" : "敗";
    const ownScore = Number(match.scores?.[side]) || 0;
    const otherScore = Number(match.scores?.[other]) || 0;
    return ownScore > otherScore ? "勝" : ownScore < otherScore ? "敗" : "平";
  }
  const wins = entityRecords.filter((match) => matchResult(match) === "勝").length;
  const matchRows = entityRecords.map((match) => {
    const result = matchResult(match);
    return `<article class="entity-match"><span class="history-date">${escapeHtml(formatDate(match.matchDate))}</span><div><strong>${escapeHtml(match.teams?.affirmative)} ${match.scores?.affirmative ?? 0}：${match.scores?.negative ?? 0} ${escapeHtml(match.teams?.negative)}</strong><p>${escapeHtml(match.competitionName)} · 時段 ${escapeHtml(match.period || "-")} · 會場 ${escapeHtml(match.venue || "-")}</p></div><span class="result-badge result-${result === "勝" ? "win" : result === "敗" ? "loss" : "draw"}">${result}</span></article>`;
  }).join("");
  const honorRows = entityHonors.map((honor) => `<article class="entity-honor-row"><span>${escapeHtml(formatDate(honor.matchDate))}</span><div><strong>${escapeHtml(honor.honorName)}｜${escapeHtml(honorSubject(honor))}</strong><p>${escapeHtml(honor.competitionName)}</p></div></article>`).join("");
  return `<section id="entityDetail" class="result-section entity-detail"><div class="entity-detail-heading"><div><p class="kicker">${escapeHtml(entity.code)}</p><h2>${escapeHtml(entity.name)}的完整紀錄</h2></div><div><strong>${entityRecords.length}</strong> 場 · <strong>${wins}</strong> 勝 · <strong>${entityHonors.length}</strong> 項榮譽</div></div><h3>所有戰績</h3><div class="history-list">${matchRows || "<p>尚無公開戰績。</p>"}</div><h3>相關榮譽</h3><div class="entity-honor-list">${honorRows || "<p>尚無相關榮譽。</p>"}</div></section>`;
}

function selectEntity(entityId) {
  selectedEntityId = entityId;
  renderSearch(els.globalSearch.value.trim());
  requestAnimationFrame(() => document.querySelector("#entityDetail")?.scrollIntoView({ behavior: "smooth", block: "start" }));
}

window.DebateInteractions.setupInteractions({ els, showView, renderEvent, renderSearch, renderEventFinder, selectEntity });


function renderAll() {
  if (!records.length && !honors.length) {
    document.querySelector("main").innerHTML = `
      <section class="data-error page-shell">
        <span aria-hidden="true">📂</span>
        <h1>公開資料尚未載入</h1>
        <p>請確認 <code>data/public-data.js</code> 已上傳，並重新整理頁面。若剛更新 GitHub Pages，請稍候一分鐘後再試。</p>
      </section>`;
    return;
  }
  renderStats();
  renderTimeline();
  renderRecentEvents();
  renderLeaderboards();
  renderEventOptions();
  setupReportLinks();
  const initialQuery = new URLSearchParams(location.search).get("q") || "";
  els.globalSearch.value = initialQuery;
  renderSearch(initialQuery);
  showView(initialQuery ? "search" : (["events", "search", "reports"].includes(location.hash.slice(1)) ? location.hash.slice(1) : "home"));
}

events = eventSummaries();
renderAll();

// ponytail: Supabase loader 載入成功後會呼叫這個重新渲染
window.debateRerender = function () {
  const freshStore = createStore(window.DEBATE_PUBLIC_DATA);
  Object.assign(store, freshStore);
  records = freshStore.records;
  honors = freshStore.honors;
  topics = freshStore.topics;
  events = eventSummaries();
  renderAll();
};
