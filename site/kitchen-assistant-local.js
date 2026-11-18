/* At-Home Kitchen browser-local assistant: no account credentials or API charges. */
(function () {
  "use strict";
  var D = window.KITCHEN_DATA;
  if (!D || !Array.isArray(D.meals)) return;
  var F = "at-home-kitchen:v1", P = "at-home-kitchen:personal:v3";
  var convo = [];
  function read(k) { try { return JSON.parse(localStorage.getItem(k) || "{}") || {}; } catch (e) { return {}; } }
  function menu() {
    var p = read(P);
    return D.meals.concat(window.KITCHEN_CANDIDATES || [], Array.isArray(p.customRecipes) ? p.customRecipes : []);
  }
  function title(m) { return String(m.title || ""); }
  function words(q) {
    var ignore = new Set("what should can please you for with without the from some meal meals recipes recipe make cook dinner lunch breakfast today suggest show find favorite favorites using based on want have eat quick food".split(" "));
    return Array.from(new Set((q.toLowerCase().match(/[a-z]{3,}/g) || []).filter(x => !ignore.has(x))));
  }
  function cat(q) {
    if (/smoothie|drink|shake|juice/i.test(q)) return "Smoothies & Drinks";
    if (/quick breakfast|fast breakfast/i.test(q)) return "Quick Breakfasts";
    if (/breakfast|morning/i.test(q)) return "Full Breakfasts";
    if (/lunch/i.test(q)) return "Lunches";
    if (/dinner|supper/i.test(q)) return "Dinners";
    if (/snack/i.test(q)) return "Snacks";
    return "";
  }
  function ingr(m) { return (m.ingredients || []).map(i => D.ingredients[i.key] && D.ingredients[i.key].name || i.key).join(" ").toLowerCase(); }
  function suggest(q) {
    var p = read(P), f = read(F), fav = new Set(f.favorites || []), c = cat(q), t = words(q);
    var active = new Set(p.active || D.meals.map(m => m.slug));
    var bad = /\b(seafood|fish|shrimp|salmon|tuna|broccoli|zucchini|tofu)\b/i;
    var avoid = p.prefs && Array.isArray(p.prefs.avoid) ? p.prefs.avoid : [];
    var limit = /\b(?:under|within|less than)\s*(\d{1,3})\s*(?:min|minutes)\b/i.exec(q);
    var ranked = menu().filter(m => {
      if (!m || !active.has(m.slug) || bad.test(title(m) + " " + ingr(m))) return false;
      if (c && m.category !== c) return false;
      if (p.ratings && p.ratings[m.slug] && p.ratings[m.slug].value === "dislike") return false;
      if ((m.ingredients || []).some(i => avoid.includes(i.key))) return false;
      if (m.category === "Dinners" && !m.isDinnerGF && m.origin !== "made") return false;
      if (limit && (m.totalMinutes || 999) > Number(limit[1])) return false;
      return true;
    }).map(m => {
      var n = title(m).toLowerCase(), d = String(m.description || "").toLowerCase(), g = ingr(m), hit = 0;
      t.forEach(w => { if (n.includes(w)) hit += 5; else if (g.includes(w)) hit += 4; else if (d.includes(w)) hit += 2; });
      return { m: m, hit: hit, score: hit + (fav.has(m.slug) ? 4 : 0) + (p.ratings && p.ratings[m.slug] && p.ratings[m.slug].value === "love" ? 3 : 0) };
    }).sort((a, b) => b.score - a.score || (a.m.totalMinutes || 90) - (b.m.totalMinutes || 90));
    if (ranked.some(x => x.hit)) ranked = ranked.filter(x => x.hit > 0);
    return ranked.slice(0, 3).map(x => x.m);
  }
  function respond(q) {
    var p = read(P), f = read(F), all = menu(), text = q.toLowerCase();
    if (/(today.*(eat|ate|log)|(?:eat|ate|log).*(today)|food journal summary)/.test(text)) {
      var now = new Date(), date = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
      var rows = (p.journal || []).filter(e => e.date === date);
      var known = rows.filter(e => e.nutrition && Number.isFinite(e.nutrition.kcal));
      return { message: rows.length ? "Today you recorded:\n" + rows.map(e => e.slot + ": " + e.title).join("\n") + "\nEstimated calories for " + known.length + " entries with known values: " + (known.length ? Math.round(known.reduce((s, e) => s + e.nutrition.kcal, 0)) + " kcal" : "unknown") + ". Missing data is not zero." : "Nothing logged today. Use Journal to record a menu meal or an outside-the-menu order.", link: "#/journal" };
    }
    if (/favorites|favourites|favorite meals|meals i love|loved meals/.test(text)) {
      var liked = (f.favorites || []).map(s => all.find(m => m.slug === s)).filter(Boolean).slice(0, 4);
      return { message: liked.length ? "Here are the recipes you saved. Select one to cook or log it again." : "No favorites yet. Open a recipe and save it, or choose Save favorite on a suggestion.", items: liked };
    }
    if (/shopping|grocery/.test(text) && !/add/.test(text)) {
      return { message: "Your shopping list combines ingredients for recipes you select. You can add one of the suggestions below.", link: "#/shopping", items: suggest(q) };
    }
    if (/weekly|review.*menu|replace.*meal/.test(text)) return { message: "Weekly Review uses your entries and ratings to propose changes. Favorites stay protected and every replacement needs approval. This is a local preference review, not live AI.", link: "#/weekly" };
    if (/restaurant|takeout|order(ed)?/.test(text)) return { message: "You can record your restaurant order here. This local helper cannot fetch live menus or verify nutrition. Add a menu link or pasted menu text for later review.", link: "#/restaurants" };
    if (/homemade|made meals|create new recipe|made a meal/.test(text)) return { message: "Record the ingredients you used in Made Meals. Generating a completely new AI recipe requires a separate approved live model connection; the current site will keep your description without inventing quantities.", link: "#/made" };
    if (/vitamin|supplement|calcium|magnesium/.test(text)) return { message: "The Vitamins guide explains dietary requirements and supplement cautions. Supplements have not been shown to repair the elbow deformity.", link: "#/vitamins" };
    if (/log .*food|record .*meal/.test(text)) return { message: "Choose a recipe below to open its logging form, or record homemade and restaurant foods under Outside the menu.", link: "#/journal", items: suggest(q) };
    var results = suggest(q);
    return { message: results.length ? "Here are matching recipes from your saved menu. Choose one to read the full instructions, log what you ate, or add ingredients to shopping. These are existing recipes, not newly generated AI meals." : "No matching recipe found within your saved restrictions. Try a different ingredient or time limit.", items: results };
  }
  function addMessage(role, text, items, link) {
    var box = document.getElementById("assistant-messages"); if (!box) return;
    if (!box.dataset.local) { box.textContent = ""; box.dataset.local = "yes"; }
    var wrap = document.createElement("div"); wrap.className = "assistant-message " + role;
    var label = document.createElement("strong"); label.textContent = role === "user" ? "You" : "Kitchen Helper · local"; wrap.appendChild(label);
    var para = document.createElement("p"); para.textContent = text; para.style.whiteSpace = "pre-line"; wrap.appendChild(para);
    (items || []).forEach(m => {
      var card = document.createElement("div"); card.className = "hosted-recipe-choice";
      var name = document.createElement("strong"); name.textContent = m.title; card.appendChild(name);
      var info = document.createElement("small"); info.textContent = " · " + m.category + " · " + m.totalMinutes + " minutes"; card.appendChild(info);
      var bar = document.createElement("div"); bar.className = "hosted-recipe-actions";
      [["open","View recipe"],["log","Log meal"],["favorite","Save favorite"],["shopping","Add shopping"]].forEach(pair => {
        var b = document.createElement("button"); b.type = "button"; b.className = "button secondary small"; b.dataset.hostedAction = pair[0]; b.dataset.slug = m.slug; b.textContent = pair[1]; bar.appendChild(b);
      });
      card.appendChild(bar); wrap.appendChild(card);
    });
    if (link) { var a = document.createElement("a"); a.className = "button secondary small"; a.href = link; a.textContent = "Open " + link.slice(2); wrap.appendChild(a); }
    box.appendChild(wrap); box.scrollTop = box.scrollHeight;
  }
  function ask(q) { if (!q.trim()) return; addMessage("user", q); var a = respond(q); addMessage("assistant", a.message, a.items, a.link); }
  function syncUI() {
    var status = document.querySelector(".assistant-status");
    if (status && !status.dataset.hosted) { status.textContent = "Hosted Kitchen Helper · runs inside your browser. Recipe search, meal suggestions, and journal summaries work here without an API key. Live ChatGPT is not connected to this public website."; status.dataset.hosted = "yes"; }
    var sub = document.getElementById("assistant-response-status");
    if (sub && !sub.dataset.hosted) { sub.textContent = "Local helper. No ChatGPT subscription or API credits are used; nothing is transmitted to a model."; sub.dataset.hosted = "yes"; }
    var form = document.getElementById("assistant-form");
    if (form && !form.dataset.hosted) {
      form.dataset.hosted = "yes";
      var b = form.querySelector('button[type="submit"]'); if (b) { b.disabled = false; b.textContent = "Ask Kitchen Helper"; }
      var row = document.createElement("div"); row.className = "hosted-external-actions";
      var copy = document.createElement("button"); copy.id = "hosted-copy-question"; copy.type = "button"; copy.className = "button secondary small"; copy.textContent = "Copy for ChatGPT"; row.appendChild(copy);
      var go = document.createElement("a"); go.href = "https://chatgpt.com/"; go.target = "_blank"; go.rel = "noopener noreferrer"; go.className = "button secondary small"; go.textContent = "Open ChatGPT ↗"; row.appendChild(go);
      form.appendChild(row);
    }
    var settings = document.querySelector(".settings-grid");
    if (settings && !settings.dataset.hosted) {
      var panels = Array.from(settings.querySelectorAll(".settings-panel"));
      var c = panels.find(x => (x.querySelector("h2") || {}).textContent === "ChatGPT Plan Connection");
      if (c) { var notice = document.createElement("div"); notice.className = "notice"; notice.textContent = "Public website: Your ChatGPT plan is not connected here. Hosted subscription use requires separate authorization for this app. The browser-local helper works without signing in."; c.prepend(notice); }
      settings.dataset.hosted = "yes";
    }
    var review = document.querySelector('[data-k="ai-review"]'); if (review) review.textContent = "Ask Kitchen Helper";
  }
  document.addEventListener("submit", function(e) {
    if (e.target.id !== "assistant-form") return;
    e.preventDefault(); e.stopImmediatePropagation();
    var t = document.getElementById("assistant-question"); if (t && t.value.trim()) { ask(t.value.trim()); t.value = ""; }
  }, true);
  document.addEventListener("click", function(e) {
    var el = e.target.closest && e.target.closest("[data-hosted-action], [data-k=agent-prompt], [data-k=ai-review], #hosted-copy-question");
    if (!el) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (el.id === "hosted-copy-question") {
      var q = (document.getElementById("assistant-question") || {}).value || "";
      if (q && navigator.clipboard) navigator.clipboard.writeText(q).then(() => addMessage("assistant", "Question copied. You can paste it into ChatGPT in another tab. No private journal data was included.")).catch(() => addMessage("assistant", "Copy is unavailable. Select the question and copy it manually."));
      return;
    }
    if (el.dataset.k === "ai-review") { location.hash = "#/assistant"; setTimeout(() => ask("Help me with my weekly menu review"), 80); return; }
    if (el.dataset.k === "agent-prompt") { var q = el.dataset.prompt || ""; location.hash = "#/assistant"; if (q) setTimeout(() => ask(q), 80); return; }
    var slug = el.dataset.slug, act = el.dataset.hostedAction;
    if (act === "open") { location.hash = "#/meal/" + encodeURIComponent(slug); return; }
    if (act === "log") {
      location.hash = "#/meal/" + encodeURIComponent(slug);
      setTimeout(() => { var b = document.querySelector('[data-k="log"][data-slug="' + slug + '"]'); if (b) b.click(); }, 120);
      return;
    }
    if (act === "favorite" || act === "shopping") {
      try {
        var s = read(F);
        if (act === "favorite") { s.favorites = Array.isArray(s.favorites) ? s.favorites : []; if (!s.favorites.includes(slug)) s.favorites.push(slug); }
        else { s.shopping = s.shopping || {}; s.shopping[slug] = { servings: 1, milk: "milk", honey: false }; }
        localStorage.setItem(F, JSON.stringify(s));
        addMessage("assistant", act === "favorite" ? "Favorite saved. Refresh the menu to see the change." : "Ingredients added. Opening your shopping list.");
        if (act === "shopping") { location.hash = "#/shopping"; location.reload(); }
      } catch (err) { addMessage("assistant", "Browser storage is disabled, so the change could not be saved."); }
    }
  }, true);
  var main = document.getElementById("main");
  if (main) { var observer = new MutationObserver(() => requestAnimationFrame(syncUI)); observer.observe(main, { childList: true }); }
  window.addEventListener("hashchange", () => setTimeout(syncUI, 0));
  syncUI();
})();
