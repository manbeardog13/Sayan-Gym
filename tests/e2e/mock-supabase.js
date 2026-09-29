/* Fake window.supabase for screenshot harness. Replaces the UMD bundle entirely.
   window.__SG_MOCK = { signedOut: bool } may be set by an init script before load. */
(function () {
  const OPT = window.__SG_MOCK || {};
  const UID = "00000000-0000-4000-8000-000000000001";
  const now = Date.now();
  const day = 86400e3;
  const iso = (ms) => new Date(ms).toISOString();
  const dateOnly = (ms) => iso(ms).slice(0, 10);
  const user = { id: UID, email: "alex@example.test", user_metadata: { full_name: "Alex" }, app_metadata: {} };
  const session = OPT.signedOut ? null : { access_token: "fake", refresh_token: "fake", expires_at: Math.floor(now / 1000) + 3600, user };

  const exercises = [
    ["ex-squat", "Čučanj", "Back squat", "legs", true],
    ["ex-legpress", "Nožna preša", "Leg press", "legs", true],
    ["ex-beltsq", "Belt squat", "Belt squat", "legs", true],
    ["ex-dead", "Mrtvo dizanje", "Deadlift", "back", true],
    ["ex-row", "Veslanje Hammer", "Hammer Strength row", "back", true],
    ["ex-pull", "Zgibovi", "Pull-up", "back", true],
    ["ex-bench", "Potisak s klupe", "Bench press", "chest", true],
    ["ex-incline", "Kosi potisak bučicama", "Incline DB press", "chest", true],
    ["ex-ohp", "Potisak iznad glave", "Overhead press", "shoulders", true],
    ["ex-lat", "Odručenje", "Lateral raise", "shoulders", false],
    ["ex-rdl", "Rumunjsko mrtvo", "Romanian deadlift", "hamstrings", true],
    ["ex-hip", "Hip thrust", "Hip thrust", "glutes", true],
    ["ex-curl", "Pregib bučicama", "Dumbbell curl", "arms", false],
    ["ex-push", "Triceps sajla", "Cable pushdown", "arms", false],
  ].map(([id, name_hr, name_en, muscle_group, is_compound]) => ({ id, name_hr, name_en, muscle_group, is_compound }));
  const exById = Object.fromEntries(exercises.map((e) => [e.id, e]));

  const plans = [
    { id: "p1", code: "day", kind: "day", sort: 1, name_hr: "Dnevna karta", name_en: "Day pass", description_hr: "Jedan ulaz, cijeli dan", description_en: "One entry, all day", price_eur: 18, is_published: true },
    { id: "p2", code: "towel", kind: "addon", sort: 2, name_hr: "Ručnik", name_en: "Towel", description_hr: "Uz dnevnu kartu", description_en: "With a day pass", price_eur: 3, is_published: true },
    { id: "p3", code: "month", kind: "multi", sort: 3, name_hr: "Mjesečna članarina", name_en: "Monthly membership", description_hr: "Neograničeni ulazi 30 dana", description_en: "Unlimited entries for 30 days", price_eur: null, is_published: true },
    { id: "p4", code: "ten", kind: "multi", sort: 4, name_hr: "10 ulazaka", name_en: "10-entry card", description_hr: "Vrijedi 3 mjeseca", description_en: "Valid for 3 months", price_eur: null, is_published: true },
    { id: "p5", code: "pt", kind: "pt", sort: 5, name_hr: "Personalni trening", name_en: "Personal training", description_hr: "S trenerom", description_en: "With a coach", price_eur: null, is_published: false },
  ];

  const workouts = [0, 2, 4, 7, 9, 11, 14, 16, 18, 21].map((d, i) => ({ id: "w" + i, user_id: UID, performed_on: dateOnly(now - (d + 1) * day), workout_sets: [{ count: 12 + (i % 5) * 2 }] }));
  const setsFor = (exId, base) => workouts.slice().reverse().map((w, i) => ({
    exercise_id: exId, load_kg: base + i * 2.5, reps: 5 + (i % 3), rpe: 8, workout_id: w.id,
    workouts: { performed_on: w.performed_on, user_id: UID },
  }));
  const workoutSets = [...setsFor("ex-squat", 120), ...setsFor("ex-bench", 85), ...setsFor("ex-dead", 150), ...setsFor("ex-ohp", 52.5)];

  const profiles = [
    { id: UID, display_name: "Alex", role: "admin", goal: "strength", experience: "intermediate", locale: null, avatar_url: null },
    { id: "u2", display_name: "Mara Horvat", role: "admin", goal: "strength", experience: "advanced" },
    { id: "u3", display_name: "Ivana Kovač", role: "coach", goal: "hypertrophy", experience: "advanced" },
    { id: "u4", display_name: "Marko Perić", role: "member" },
    { id: "u5", display_name: "Ana Babić", role: "member" },
    { id: "u6", display_name: "Luka Radić", role: "member" },
  ];
  let TRIP = ""; try { TRIP = localStorage.getItem("mock_trip") || ""; } catch (e) {}
  try { const mr = localStorage.getItem("mock_role"); if (mr && profiles[0]) profiles[0].role = mr; } catch (e) {}
  if (profiles[0]) profiles[0].locale = (localStorage.getItem("sg_lang") || "en");

  const T = {
    profiles,
    exercises,
    membership_plans: plans,
    memberships: [{ id: "m1", user_id: UID, plan_id: "p3", status: "active", pass_code: "k7q2m9xz", starts_at: iso(now - 10 * day), ends_at: iso(now + 20 * day), membership_plans: { name_hr: plans[2].name_hr, name_en: plans[2].name_en } },
      { id: "m4", user_id: "u4", plan_id: "p3", status: "active", pass_code: "aa11bb22", starts_at: iso(now - 27 * day), ends_at: iso(now + 3 * day), membership_plans: { name_hr: plans[2].name_hr, name_en: plans[2].name_en } },
      { id: "m6", user_id: "u6", plan_id: "p1", status: "active", pass_code: "cc33dd44", starts_at: iso(now - 3 * day), ends_at: iso(now - 2 * day), membership_plans: { name_hr: plans[0].name_hr, name_en: plans[0].name_en } }],
    workouts,
    workout_sets: workoutSets,
    body_metrics: [0, 7, 14, 21].map((d, i) => ({ id: "bm" + i, user_id: UID, measured_on: dateOnly(now - d * day), weight_kg: 84.2 + i * 0.4, bodyfat_pct: 16.1 + i * 0.2 })),
    consents: [{ id: "c1", user_id: UID, purpose: "health", text_version: "v1-2026-09", withdrawn_at: null }],
    check_ins: [
      { id: "ci1", user_id: "u4", checked_in_at: iso(now - 25 * 60e3), checked_out_at: null },
      { id: "ci2", user_id: "u5", checked_in_at: iso(now - 50 * 60e3), checked_out_at: null },
      { id: "ci3", user_id: "u6", checked_in_at: iso(now - 95 * 60e3), checked_out_at: null },
      ...(TRIP === "none" ? [] : [1, 2, 4].map((d) => ({ id: "cm" + d, user_id: UID, checked_in_at: iso(now - d * day), checked_out_at: iso(now - d * day + 80 * 60e3) }))),
    ],
    gym_facts: [
      { id: 1, topic: "day_pass", questions: "Koliko košta dnevna karta?\nHow much is a day pass?", content_hr: "Dnevna karta je 18 €, ručnik 3 €.", content_en: "A day pass is €18, towel €3." },
      { id: 2, topic: "hours", questions: "Radno vrijeme?", content_hr: "Pon–sub 06–22, ned 06–20.", content_en: "Mon–Sat 06–22, Sun 06–20." },
      { id: 3, topic: "parking", questions: "", content_hr: "Besplatan parking ispred teretane.", content_en: "Free parking in front of the gym." },
    ],
    motivation: [
      { id: 1, text_hr: "Snaga se gradi, ne poklanja.", text_en: "Strength is built, not given." },
      { id: 2, text_hr: "Još jedna serija.", text_en: "One more set." },
      { id: 3, text_hr: "Disciplina pobjeđuje motivaciju.", text_en: "Discipline beats motivation." },
      { id: 4, text_hr: "Težina ne laže.", text_en: "The iron never lies." },
      { id: 5, text_hr: "Probij svoj limit.", text_en: "Break your limit." },
    ],
    site_settings: [{ key: "payment_url", value: null },
      { key: "review_url", value: TRIP === "off" || TRIP === "none" ? null : "https://g.page/r/CSaiyanTest/review" },
      { key: "auto_quests", value: "on" },
      { key: "return_offer", value: TRIP === "off" || TRIP === "none" ? null : "10% off your next day pass" }, { key: "hashtag_sets", value: JSON.stringify([{ name: "Gym", tags: "#saiyangym #dubrovnik #gym" }, { name: "Lift", tags: "#powerlifting #deadlift #squat" }]) }],
    idea_threads: [
      { id: "it1", kind: "idea", title: "Tjedni izazov na početnoj", status: "drafting", category: "feature", brief: { goal: "Weekly challenge card on the dashboard", acceptance: ["shows the challenge", "tracks completion"] }, pr_url: null, result_note: null, updated_at: iso(now - 3600e3), archived_at: null },
      { id: "it2", kind: "bug", title: "QR se ne vidi u tamnoj temi", status: "queued", category: "style", brief: { goal: "Fix QR contrast" }, pr_url: null, result_note: null, updated_at: iso(now - 5 * 3600e3), archived_at: null },
      { id: "it3", kind: "news", title: "Nove Hammer Strength sprave", status: "in_progress", category: "content", brief: null, pr_url: null, result_note: null, updated_at: iso(now - day), archived_at: null },
      { id: "it4", kind: "post", title: "Cjenik na engleskom", status: "shipped", category: "content", brief: null, pr_url: "https://github.com/example/pr/12", result_note: "Objavljeno na stranici.", updated_at: iso(now - 3 * day), archived_at: null },
      { id: "it5", kind: "idea", title: "Izvoz podataka članova", status: "needs_toni", category: "data", brief: null, pr_url: null, result_note: null, updated_at: iso(now - 4 * day), archived_at: null },
      { id: "it6", kind: "idea", title: "Glazba u aplikaciji", status: "rejected", category: "feature", brief: null, pr_url: null, result_note: "Izvan opsega.", updated_at: iso(now - 6 * day), archived_at: null },
    ],
    idea_messages: [
      { id: 1, thread_id: "it1", role: "user", content: "Želim tjedni izazov na početnoj stranici aplikacije." },
      { id: 2, thread_id: "it1", role: "assistant", content: "Super ideja! Tko postavlja izazov — ti ručno svaki tjedan ili automatski iz popisa?" },
      { id: 3, thread_id: "it1", role: "user", content: "Ja ručno, u postavkama." },
      { id: 4, thread_id: "it1", role: "assistant", content: "Razumijem. Opis je spreman — pogledaj ga ispod i pošalji Claudeu kad budeš zadovoljan." },
    ],
    idea_autonomy: [
      { category: "content", auto_ship: true }, { category: "style", auto_ship: true },
      { category: "feature", auto_ship: false }, { category: "data", auto_ship: false },
    ],
    news: [],
    pr_bells: [{ id: 11, first_name: "Luka", load_kg: 140, reps: 3, created_at: iso(now - day), exercises: { name_hr: "Čučanj", name_en: "Back squat" }, pr_kudos: [{ count: 4 }] }, { id: 12, first_name: "Ana", load_kg: 60, reps: 5, created_at: iso(now - 2 * day), exercises: { name_hr: "Bench press", name_en: "Bench press" }, pr_kudos: [{ count: 1 }] }],
    pr_kudos: [{ bell_id: 12, user_id: UID }],
    club_lifts: OPT.noClub ? [] : [{ user_id: UID, squat_kg: 150, bench_kg: 105, deadlift_kg: 185, total_kg: 440, verified_at: iso(now - 3 * day) }, { user_id: "u4", squat_kg: 120, bench_kg: 80, deadlift_kg: 150, total_kg: 350, verified_at: iso(now - 9 * day) }],
    seasons: [{ id: "s1", name: "Jesenska sezona", starts_on: dateOnly(now - 12 * day), ends_on: dateOnly(now + 36 * day), season_teams: [{ name: "Lava" }, { name: "Čelik" }, { name: "Grom" }] }],
    quests: [{ id: "q1", kind: "days", target: 8, title_hr: "8 dana treninga", title_en: "8 training days" }, { id: "q2", kind: "sets", target: 40, exercise_id: "ex-squat", title_hr: "40 serija: Čučanj", title_en: "40 sets: Back squat" }],
    push_subscriptions: [],
    staff_touches: [],
    posts: [
      { id: "post1", title: "Nove Hammer Strength sprave", caption: "Stigle su nove Hammer Strength sprave za leđa i noge. Dođi ih isprobati! #saiyangym #dubrovnik #hammerstrength", images: ["post1/0.jpg", "post1/1.jpg"], aspect: "4:5", channels: ["members", "instagram"], status: "published", pinned: true, ig_permalink: "https://www.instagram.com/p/example/", error: null, published_at: iso(now - day), updated_at: iso(now - day) },
      { id: "post2", title: "Radno vrijeme za blagdane", caption: "Na blagdane radimo 08–14. #saiyangym", images: ["post2/0.jpg"], aspect: "1:1", channels: ["members"], status: "published", pinned: false, ig_permalink: null, error: null, published_at: iso(now - 5 * day), updated_at: iso(now - 5 * day) },
      { id: "post3", title: "Izazov mjeseca", caption: "Tko digne najviše u belt squatu ovaj mjesec? #izazov", images: [], aspect: "4:5", channels: ["members", "instagram"], status: "draft", pinned: false, ig_permalink: null, error: null, published_at: null, updated_at: iso(now - 2 * 3600e3) },
      { id: "post4", title: "Instagram test", caption: "Test objava", images: ["post4/0.jpg"], aspect: "1.91:1", channels: ["instagram"], status: "failed", pinned: false, ig_permalink: null, error: "Instagram token expired", published_at: null, updated_at: iso(now - 3 * day) },
    ],
  };

  const RPC = {
    my_power_level: [{ level: 27, tier: "SURGE", xp: 3120, next_tier: "OVERDRIVE", next_tier_xp: 5000, total_volume_kg: 184500, training_days: 46, prs: 11, week_streak: 5, tokens_left: 1, comebacks: 2, consistent_weeks: 9 }],
    my_onboarding: [{ days_in: 12, checkins: 2, workouts: 3, coach_intro: false, show: true }],
    greet_today: [{ user_id: "m1", display_name: "Marko Perić", reason: "new_7d", detail: null, priority: 1 }, { user_id: "m2", display_name: "Ana Babić", reason: "drifting", detail: "11", priority: 1 }, { user_id: "m3", display_name: "Luka Radić", reason: "pr", detail: "Back squat", priority: 4 }, { user_id: "m4", display_name: "Iva Horvat", reason: "new_member", detail: null, priority: 2 }],
    my_next_targets: [
      { exercise_id: "ex-squat", name_hr: "Čučanj", name_en: "Back squat", suggest_load: 145, suggest_reps: 5, advice: "add_load", e1rm: 166.3, e1rm_trend: 3.2, last_date: dateOnly(now - day), last_load: 142.5, last_reps: 5 },
      { exercise_id: "ex-bench", name_hr: "Potisak s klupe", name_en: "Bench press", suggest_load: 107.5, suggest_reps: 6, advice: "add_rep", e1rm: 125.4, e1rm_trend: 1.1, last_date: dateOnly(now - 3 * day), last_load: 107.5, last_reps: 5 },
      { exercise_id: "ex-dead", name_hr: "Mrtvo dizanje", name_en: "Deadlift", suggest_load: 172.5, suggest_reps: 5, advice: "hold", e1rm: 201.2, e1rm_trend: -0.8, last_date: dateOnly(now - 5 * day), last_load: 172.5, last_reps: 5 },
      { exercise_id: "ex-ohp", name_hr: "Potisak iznad glave", name_en: "Overhead press", suggest_load: 75, suggest_reps: 5, advice: "add_load", e1rm: 86.0, e1rm_trend: null, last_date: dateOnly(now - 3 * day), last_load: 72.5, last_reps: 5 },
    ],
    my_recovery: [
      { muscle_group: "legs", recovery_pct: 42 }, { muscle_group: "back", recovery_pct: 68 }, { muscle_group: "chest", recovery_pct: 100 },
      { muscle_group: "shoulders", recovery_pct: 85 }, { muscle_group: "hamstrings", recovery_pct: 55 }, { muscle_group: "glutes", recovery_pct: 74 }, { muscle_group: "arms", recovery_pct: 100 },
    ],
    churn_radar: [
      { user_id: "u4", display_name: "Marko Perić", risk: "high", risk_score: 82, never_visited: false, days_since_visit: 19, visits_4w: 1, visits_prev_4w: 9 },
      { user_id: "u5", display_name: "Ana Babić", risk: "medium", risk_score: 54, never_visited: false, days_since_visit: 9, visits_4w: 4, visits_prev_4w: 8 },
      { user_id: "u6", display_name: "Luka Radić", risk: "medium", risk_score: 47, never_visited: true, days_since_visit: 12, visits_4w: 0, visits_prev_4w: 0 },
      { user_id: "u3", display_name: "Ivana Kovač", risk: "low", risk_score: 12, never_visited: false, days_since_visit: 2, visits_4w: 11, visits_prev_4w: 10 },
    ],
    current_occupancy: 14,
    occupancy_heatmap: Array.from({ length: 7 * 16 }, (_, i) => ({ dow: Math.floor(i / 16), hour: 6 + (i % 16), avg: Math.round(4 + 12 * Math.abs(Math.sin(i / 5))) })),
    admin_exists: true,
    is_owner: true,
    instagram_status: [{ connected: true, username: "saiyan_gym_fitt", expires_at: iso(now + 40 * day) }],
    claim_first_admin: true,
    open_season: OPT.noSeason ? [] : [{ id: "s1", name: "Jesenska sezona", starts_on: dateOnly(now - 12 * day), ends_on: dateOnly(now + 36 * day), teams: 3, joined: !OPT.notJoined }],
    season_standings: OPT.noSeason ? [] : [
      { season_id: "s1", season_name: "Jesenska sezona", starts_on: dateOnly(now - 12 * day), ends_on: dateOnly(now + 36 * day), team_id: "t2", team_name: "Čelik", color: 1, members: 5, points: 410, avg_points: 82 },
      { season_id: "s1", season_name: "Jesenska sezona", starts_on: dateOnly(now - 12 * day), ends_on: dateOnly(now + 36 * day), team_id: "t1", team_name: "Lava", color: 0, members: 6, points: 420, avg_points: 70 },
      { season_id: "s1", season_name: "Jesenska sezona", starts_on: dateOnly(now - 12 * day), ends_on: dateOnly(now + 36 * day), team_id: "t3", team_name: "Grom", color: 2, members: 4, points: 220, avg_points: 55 }],
    my_season: OPT.noSeason || OPT.notJoined ? [] : [
      { team_id: "t1", team_name: "Lava", color: 0, first_name: "Alex", points: 90, is_me: true },
      { team_id: "t1", team_name: "Lava", color: 0, first_name: "Marko", points: 80, is_me: false },
      { team_id: "t1", team_name: "Lava", color: 0, first_name: "Ana", points: 70, is_me: false }],
    my_quests: [{ id: "q1", kind: "days", target: 8, title_hr: "8 dana treninga", title_en: "8 training days", progress: 5, done: false },
      { id: "q2", kind: "strong_weeks", target: 3, title_hr: "3 tjedna s 2+ treninga", title_en: "3 weeks with 2+ sessions", progress: 3, done: true }],
    club_board: [{ tier: 400, first_name: "Alex", total_kg: 440, verified_at: iso(now - 3 * day) }, { tier: 300, first_name: null, total_kg: null, verified_at: iso(now - 9 * day) },
      { tier: 300, first_name: "Luka", total_kg: 355, verified_at: iso(now - 20 * day) }],
    best_times: OPT.noBest ? [] : Array.from({ length: 7 }, (_, d) => Array.from({ length: d === 6 ? 14 : 16 }, (_, h) => ({ dow: d + 1, hour: 6 + h,
      level: [0, 0, 1, 1, 0, 0, 1, 1, 0, 1, 1, 2, 2, 2, 1, 0][h] ?? 0 })).filter((x) => !(x.hour === 6 && d > 4))).flat(),
    current_season_id: "s1", join_season: "t1", save_push_subscription: null,
  };
  RPC.tv_board = { occupancy: 7, standings: RPC.season_standings, club: RPC.club_board,
    bells: [{ first_name: "Luka", load_kg: 140, reps: 3, name_hr: "Čučanj", name_en: "Back squat", kudos: 4 }, { first_name: "Ana", load_kg: 60, reps: 5, name_hr: "Bench press", name_en: "Bench press", kudos: 1 },
      { first_name: "Marko", load_kg: 190, reps: 1, name_hr: "Mrtvo dizanje", name_en: "Deadlift", kudos: 7 }],
    quests: RPC.my_quests.map(({ title_hr, title_en, target, kind }) => ({ title_hr, title_en, target, kind })),
    post: { title: "Nove Hammer Strength sprave", image: "post1/0.jpg", published_at: iso(now - day) },
    best: RPC.best_times.filter((b) => b.dow === ((new Date().getDay() + 6) % 7) + 1).map(({ hour, level }) => ({ hour, level })) };

  const clone = (x) => JSON.parse(JSON.stringify(x));
  const log = (...a) => { if (OPT.verbose) console.log("[mock]", ...a); };
  window.__SG_MOCK_CALLS = [];

  function builder(table) {
    const q = { table, filters: [], op: "select", single: null, limitN: null, orderBy: [], payload: null };
    const colOk = (row, c) => !c.includes(".") && Object.prototype.hasOwnProperty.call(row, c);
    const pass = (row) => q.filters.every(([k, c, v]) => {
      if (!colOk(row, c)) return true;
      const x = row[c];
      switch (k) {
        case "eq": return x == v;
        case "neq": return x != v;
        case "in": return v.includes(x);
        case "is": return v === null ? x == null : x === v;
        case "gt": return x > v; case "gte": return x >= v;
        case "lt": return x < v; case "lte": return x <= v;
        case "cs": return Array.isArray(x) && [].concat(v).every((y) => x.includes(y));
        case "ilike": case "like": { const re = new RegExp("^" + String(v).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".") + "$", k === "ilike" ? "i" : ""); return re.test(String(x ?? "")); }
        default: return true;
      }
    });
    const exec = () => {
      if (!navigator.onLine) return { data: null, error: { message: "TypeError: Failed to fetch", details: "", hint: "", code: "" } };
      window.__SG_MOCK_CALLS.push({ table, op: q.op, filters: q.filters.map((f) => f.slice(0, 2).join(":")), payload: q.payload });
      if (q.op !== "select") {
        let data = q.payload ? (Array.isArray(q.payload) ? q.payload : [q.payload]).map((r, i) => ({ id: table + "-new-" + i, ...r })) : [];
        if (q.single) data = data[0] || null;
        return { data, error: null, status: 200 };
      }
      let rows = T[table] ? clone(T[table]) : [];
      rows = rows.filter(pass);
      for (const [col, asc] of q.orderBy.slice().reverse()) {
        if (col.includes(".")) continue;
        rows.sort((a, b) => { const x = a[col], y = b[col]; if (x == y) return 0; if (x == null) return -1; if (y == null) return 1; return (x < y ? -1 : 1) * (asc ? 1 : -1); });
      }
      if (q.range) rows = rows.slice(q.range[0], q.range[1] + 1);
      if (q.limitN != null) rows = rows.slice(0, q.limitN);
      if (q.single === "single") return rows.length ? { data: rows[0], error: null } : { data: null, error: { message: "No rows", code: "PGRST116" } };
      if (q.single === "maybe") return { data: rows[0] || null, error: null };
      return { data: rows, error: null, count: rows.length, status: 200 };
    };
    const api = {
      select(cols, opts) { if (q.op === "select") q.op = "select"; q.cols = cols; return api; },
      insert(p) { q.op = "insert"; q.payload = p; return api; },
      update(p) { q.op = "update"; q.payload = p; return api; },
      upsert(p) { q.op = "upsert"; q.payload = p; return api; },
      delete() { q.op = "delete"; return api; },
      order(col, o = {}) { q.orderBy.push([col, o.ascending !== false]); return api; },
      limit(n) { q.limitN = n; return api; },
      range(a, b) { q.range = [a, b]; return api; },
      single() { q.single = "single"; return api; },
      maybeSingle() { q.single = "maybe"; return api; },
      match(obj) { Object.entries(obj).forEach(([c, v]) => q.filters.push(["eq", c, v])); return api; },
      not() { return api; }, or() { return api; }, filter() { return api; }, contains(c, v) { q.filters.push(["cs", c, v]); return api; }, textSearch() { return api; },
      abortSignal() { return api; }, returns() { return api; }, throwOnError() { return api; },
      then(res, rej) { return Promise.resolve().then(exec).then(res, rej); },
      catch(rej) { return Promise.resolve().then(exec).catch(rej); },
      finally(f) { return Promise.resolve().then(exec).finally(f); },
    };
    for (const k of ["eq", "neq", "in", "is", "gt", "gte", "lt", "lte", "ilike", "like"]) api[k] = (c, v) => { q.filters.push([k, c, v]); return api; };
    return api;
  }

  const listeners = [];
  const client = {
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      getUser: async () => ({ data: { user: session ? user : null }, error: null }),
      onAuthStateChange(cb) { listeners.push(cb); setTimeout(() => cb(session ? "INITIAL_SESSION" : "INITIAL_SESSION", session), 0); return { data: { subscription: { unsubscribe() {} } } }; },
      signOut: async () => ({ error: null }),
      signInWithOtp: async () => ({ data: {}, error: null }),
      signInWithOAuth: async () => ({ data: {}, error: null }),
      exchangeCodeForSession: async () => ({ data: { session }, error: null }),
    },
    from: (t) => builder(t),
    rpc(name, args) {
      (window.__SG_MOCK_CALLS = window.__SG_MOCK_CALLS || []).push({ rpc: name, args });
      if (name === "give_pass") return Promise.resolve({ data: [{ membership_id: "mX", ends_at: iso(now + (args.p_days + (args.p_user === "u4" ? 3 : 0)) * day), extended: args.p_user === "u4" && args.p_plan === "p3" }], error: null });
      if (name === "cancel_pass") return Promise.resolve({ data: null, error: null });
      if (name === "add_default_quests") return Promise.resolve({ data: 2, error: null });
      if (name === "my_return_code") return Promise.resolve({ data: [{ code: "BACK-1A2B3C", redeemed_at: TRIP === "used" ? iso(now - day) : null }], error: null });
      if (name === "redeem_return_code") return Promise.resolve(args.p_code === "BACK-1A2B3C" ? { data: [{ display_name: "Marko Perić", already_used: false, used_at: iso(now) }], error: null }
        : args.p_code === "BACK-AAAAAA" ? { data: [{ display_name: "Ana Babić", already_used: true, used_at: iso(now - 3 * day) }], error: null } : { data: null, error: { message: "not found" } });
      const has = Object.prototype.hasOwnProperty.call(RPC, name);
      const r = has ? { data: clone(RPC[name]), error: null } : { data: null, error: { message: "mock: unknown rpc " + name } };
      if (!has) console.warn("[mock] unknown rpc", name);
      const p = Promise.resolve(r);
      const thenable = { then: (a, b) => p.then(a, b), catch: (b) => p.catch(b), single: () => thenable, maybeSingle: () => thenable };
      return thenable;
    },
    storage: {
      from: (bucket) => ({
        list: async () => ({ data: [], error: null }),
        getPublicUrl: (name) => ({ data: { publicUrl: bucket === "posts" || !/\.(webp|png|jpe?g)$/.test(name) || /\//.test(name) ? "assets/" + ["hero", "log", "squat", "checkin"][[...String(name)].reduce((a, c) => a + c.charCodeAt(0), 0) % 4] + ".webp" : "assets/" + name } }),
        upload: async (path) => ({ data: { path }, error: null }),
        remove: async () => ({ data: [], error: null }),
        createSignedUrl: async (p) => ({ data: { signedUrl: "assets/" + p }, error: null }),
      }),
    },
    functions: {
      invoke: async (name, { body } = {}) => {
        if (name === "concierge") return { data: { answer: "A day pass is €18 and a towel €3. We're open Mon–Sat 06–22, Sun 06–20." }, error: null };
        if (name === "push") return { data: body?.action === "key" ? { key: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM" } : { ok: true }, error: null };
        if (name === "idea-agent") return { data: { thread_id: body?.thread_id || "it1", reply: "Got it — who should see this, members or only staff?", ready: false }, error: null };
        return { data: { ok: true }, error: null };
      },
    },
    channel: () => ({ on() { return this; }, subscribe() { return this; }, unsubscribe() {} }),
    removeChannel() {},
  };
  window.supabase = { createClient: () => client };
})();
