// ponytail: 從 Supabase 載入資料，成功就覆蓋靜態檔資料並重新渲染
// 失敗就沉默，頁面已經用 public-data.js 渲染過了
(async function () {
  const config = window.SUPABASE_CONFIG;
  if (!config || !config.url || !config.anonKey) return;
  if (typeof supabase === "undefined" || !supabase.createClient) return;

  const db = supabase.createClient(config.url, config.anonKey);

  try {
    const [entitiesRes, aliasesRes, recordsRes, honorsRes, topicsRes, competitionsRes] = await Promise.all([
      db.from("entities").select("*"),
      db.from("entity_aliases").select("*"),
      db.from("public_records").select("*, competitions(name)"),
      db.from("honors").select("*, competitions(name), entities(name)"),
      db.from("topics").select("*, competitions(name)"),
      db.from("competitions").select("*"),
    ]);

    if (entitiesRes.error || recordsRes.error || honorsRes.error) {
      console.warn("Supabase 載入失敗，使用靜態資料", entitiesRes.error || recordsRes.error || honorsRes.error);
      return;
    }

    // 從 entity_aliases 表組合別名（正規化後不再讀 entities.aliases）
    var aliasMap = {};
    (aliasesRes.data || []).forEach(function (a) {
      if (!aliasMap[a.entity_code]) aliasMap[a.entity_code] = [];
      aliasMap[a.entity_code].push(a.alias);
    });

    const entities = (entitiesRes.data || []).map(function (e) {
      return { code: e.code, type: e.type, name: e.name, aliases: (aliasMap[e.code] || []).join("|") };
    });

    const records = (recordsRes.data || []).map(function (r) {
      var compName = r.competitions ? r.competitions.name : "";
      return {
        competitionName: compName,
        matchDate: r.match_date || "",
        period: null,
        venue: null,
        teams: { affirmative: r.affirmative_team, negative: r.negative_team },
        scores: { affirmative: r.score_aff, negative: r.score_neg },
        winner: r.winner || "",
        note: "",
        players: { affirmative: [], negative: [] },
        teamIds: { affirmative: r.affirmative_entity, negative: r.negative_entity },
        id: r.id,
      };
    });

    var honors = (honorsRes.data || []).map(function (h) {
      var compName = h.competitions ? h.competitions.name : "";
      var entityName = h.entities ? h.entities.name : "";
      return {
        competitionName: compName,
        matchDate: "",
        honorName: h.title,
        recipient: h.recipient,
        team: entityName || "",
        honorType: h.honor_type || "team",
        note: h.note || "",
        teamId: h.entity_code || "",
        id: h.id,
      };
    });

    var topics = (topicsRes.data || []).map(function (t) {
      var compName = t.competitions ? t.competitions.name : "";
      return { competitionName: compName, topic: t.title, explanation: t.explanation || "" };
    });

    window.DEBATE_PUBLIC_DATA = {
      schemaVersion: 4,
      generatedAt: new Date().toISOString(),
      sources: ["supabase"],
      entities: entities,
      records: records,
      honors: honors,
      attendance: [],
      topics: topics,
    };

    // 等 app.js 準備好再渲染
    function tryRerender() {
      if (typeof window.debateRerender === "function") {
        window.debateRerender();
      } else {
        setTimeout(tryRerender, 50);
      }
    }
    tryRerender();

    console.log("Supabase 資料載入完成：" + records.length + " 筆戰績、" + honors.length + " 筆榮譽");
  } catch (err) {
    console.warn("Supabase 載入失敗，使用靜態資料", err);
  }

  // 初始化 Auth 和 Dashboard 模組
  if (typeof window.DebateAuth !== "undefined") {
    window.DebateAuth.init(db);
  }
  if (typeof window.DebateDashboard !== "undefined") {
    window.DebateDashboard.init(db);
  }
}());
