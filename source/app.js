/* At-Home Kitchen. Dependency-free, local-first web application.
 * Menu source and nutrition assumptions are documented in data/metadata.json.
 * Optional AI calls only through the explicit-consent local server. No analytics.
 */
'use strict';
(() => {
    try {
        const D = window.KITCHEN_DATA;
        if (!D || !Array.isArray(D.meals)) {
            if (window.KITCHEN_BOOT)
                window.KITCHEN_BOOT.restore('Menu data unavailable');
            return;
        }
        const foods = D.ingredients, cats = D.categories;
        const L = window.KitchenLogic;
        const J = window.KitchenJournalCustomizer;
        const PERSONAL_KEY = 'at-home-kitchen:personal:v3';
        const rawPersonal = readPersonalRaw();
        const builtins = D.meals.concat(window.KITCHEN_CANDIDATES || []);
        const persistedCustom = rawPersonal && Array.isArray(rawPersonal.customRecipes)
          ? rawPersonal.customRecipes.slice(0,150).filter(m => !L.recipeError(m, foods, cats) && !builtins.some(x => x.slug===m.slug)) : [];
        const meals = builtins.concat(persistedCustom);
        // Hydrate photos from the embedded bank before rendering; no downloads needed.
        meals.forEach(m => {
            const image = document.getElementById('asset-' + m.slug);
            if (image)
                m.image = image.getAttribute('href') || image.getAttribute('xlink:href');
            else m.image = illustrationImage(m);
        });
        const bySlug = Object.create(null);
        meals.forEach(m => { bySlug[m.slug] = m; });
        const KEY = 'at-home-kitchen:v1';
        const main = document.getElementById('main');
        const iconPaths = {
            leaf: '<path d="M5 16C5 6 12 3 21 3c0 10-4 16-13 16M4 21 16 9"/>',
            search: '<circle cx="10.8" cy="10.8" r="7.2"/><path d="m16 16 5 5"/>',
            arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
            back: '<path d="M20 12H5m6-6-6 6 6 6"/>',
            chevron: '<path d="m9 5 7 7-7 7"/>',
            heart: '<path d="M20.8 4.6a5.3 5.3 0 0 0-7.5 0L12 6l-1.3-1.4a5.3 5.3 0 0 0-7.5 7.5L12 21l8.8-8.9a5.3 5.3 0 0 0 0-7.5Z"/>',
            clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
            bag: '<path d="M5 7h14l1 14H4L5 7Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/>',
            book: '<path d="M12 5c-3-2-6-2-10-1v16c4-1 7-1 10 1 3-2 6-2 10-1V4c-4-1-7-1-10 1Zm0 0v16"/>',
            pill: '<path d="m9 4-5 5a6 6 0 0 0 8.5 8.5l5-5A6 6 0 0 0 9 4Z"/><path d="m7 7 8.5 8.5"/>',
            plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
            x: '<path d="m6 6 12 12M18 6 6 18"/>',
            check: '<path d="m4 12 5 5L20 6"/>',
            print: '<path d="M6 8V3h12v5M6 17H3V9h18v8h-3M6 14h12v7H6z"/><path d="M17 11h1"/>',
            share: '<path d="M12 16V3m-4 4 4-4 4 4M5 11v10h14V11"/>',
            download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
            external: '<path d="M14 3h7v7M21 3 11 13M11 3H3v18h18v-8"/>',
            info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
            shield: '<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6l8-4Z"/><path d="m8 12 3 3 5-6"/>',
            grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
            trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
            copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
            plate: '<circle cx="13" cy="12" r="7"/><path d="M2 3v7m3-7v7m-3-3h3M3.5 10v11M22 3v18"/>'
        };
        const icon = (name, cls = '') => `<svg class="icon ${cls}" aria-hidden="true" viewBox="0 0 24 24">${iconPaths[name] || iconPaths.leaf}</svg>`;
        const esc = value => String(value !== null && value !== void 0 ? value : '').replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
        let storageAvailable = true;
        function loadStore() {
            try {
                const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
                const favorites = Array.isArray(raw.favorites) ? raw.favorites.filter(s => bySlug[s]) : [];
                const shopping = {};
                if (raw.shopping && typeof raw.shopping === 'object')
                    Object.entries(raw.shopping).forEach(([slug, value]) => {
                        if (bySlug[slug] && value && Number.isFinite(value.servings) && value.servings >= 1 && value.servings <= 12)
                            shopping[slug] = { servings: Math.round(value.servings), milk: value.milk === 'soyMilk' ? 'soyMilk' : 'milk', honey: value.honey === true };
                    });
                return { favorites, shopping, checked: raw.checked && typeof raw.checked === 'object' ? raw.checked : {} };
            }
            catch (_) {
                storageAvailable = false;
                return { favorites: [], shopping: {}, checked: {} };
            }
        }
        let store = loadStore();
        let personalLoadWarning = '';
        let P = initializePersonal(rawPersonal);
        try { localStorage.setItem('kitchen-storage-probe','1'); localStorage.removeItem('kitchen-storage-probe'); } catch (_) { storageAvailable=false; }
        let filters = { q: '', vegetarian: false, quick: false, sort: 'menu' };
        let recipeOpts = {};
        let checks = {};
        let completedSteps = {};
        let currentRoute = 'menu';
        let toastTimer;
        function saveStore() {
            try {
                localStorage.setItem(KEY, JSON.stringify(store));
                return true;
            }
            catch (_) {
                storageAvailable = false;
                return false;
            }
        }
        function toast(message) {
            const el = document.getElementById('toast');
            clearTimeout(toastTimer);
            el.textContent = message;
            el.classList.add('show');
            toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
        }
        const links = {
            vitaminD: ['NIH · Vitamin D', 'https://ods.od.nih.gov/factsheets/VitaminD-Consumer/'],
            calcium: ['NIH · Calcium', 'https://ods.od.nih.gov/factsheets/Calcium-Consumer/'],
            b12: ['NIH · Vitamin B12', 'https://ods.od.nih.gov/factsheets/VitaminB12-Consumer/'],
            magnesium: ['NIH · Magnesium', 'https://ods.od.nih.gov/factsheets/Magnesium-Consumer/'],
            omega: ['NIH · Omega-3 fatty acids', 'https://ods.od.nih.gov/factsheets/Omega3FattyAcids-Consumer/'],
            arthritis: ['NCCIH · Osteoarthritis: In Depth', 'https://www.nccih.nih.gov/health/osteoarthritis-in-depth'],
            turmeric: ['NCCIH · Turmeric safety', 'https://www.nccih.nih.gov/health/turmeric'],
            safety: ['FoodSafety.gov · Cooking temperatures', 'https://www.foodsafety.gov/food-safety-charts/safe-minimum-internal-temperatures'],
            storage: ['CDC · Preventing food poisoning', 'https://www.cdc.gov/food-safety/prevention/index.html'],
            usda: ['USDA · FoodData Central', 'https://fdc.nal.usda.gov/']
        };
        const sourceLink = (id, label) => `<a class="inline-source" href="${links[id][1]}" target="_blank" rel="noopener noreferrer">${esc(label || links[id][0])}${icon('external')}</a>`;
        function optionsFor(m) {
            if (!recipeOpts[m.slug])
                recipeOpts[m.slug] = { servings: m.baseServings, unit: 'metric', milk: 'milk', honey: false };
            return recipeOpts[m.slug];
        }
        function resolvedIngredients(m, opts = {}) {
            return m.ingredients.filter(i => !i.optional || opts.honey).map(i => (Object.assign(Object.assign({}, i), { key: i.key === 'milk' && opts.milk === 'soyMilk' ? 'soyMilk' : i.key })));
        }
        function nutrition(m, opts = {}) {
            const result = { kcal: 0, protein: 0, carbs: 0, fat: 0, satFat: 0, fiber: 0, sugars: 0, sodium: 0 };
            if (m.index === 69)
                return result;
            resolvedIngredients(m, opts).forEach(i => Object.keys(result).forEach(k => { result[k] += foods[i.key].per100g[k] * i.gramsPerServing / 100; }));
            return result;
        }
        function rounded(n, increment = 1) { return Math.round(n / increment) * increment; }
        function grams(n) { return n < 1 ? Number(n.toFixed(2)).toString() : n < 10 ? Number(n.toFixed(1)).toString() : Math.round(n).toLocaleString(); }
        function niceNum(v) {
            // Show an honest approximate household measure, not false precision.
            if (v >= 10)
                return String(Math.round(v));
            if (v < .125)
                return Number(v.toFixed(2)).toString();
            const q = Math.round(v * 4) / 4, whole = Math.floor(q), frac = q - whole;
            const chars = { .25: '¼', .5: '½', .75: '¾' };
            return (whole ? whole : '') + (chars[frac] || (!whole ? '0' : ''));
        }
        function quantity(key, g, unit = 'metric') {
            const f = foods[key];
            const unitLabel = f.unit;
            const v = g / f.gramsPerUnit;
            const plural = unitLabel === 'large egg' ? 'large eggs' : unitLabel === 'slice' ? 'slices' : unitLabel === 'small tortilla' ? 'small tortillas' : unitLabel === 'medium tortilla' ? 'medium tortillas' : unitLabel === 'clove' ? 'cloves' : unitLabel === 'cup' ? 'cups' : unitLabel === 'lemon' ? 'lemons' : unitLabel;
            if (unit === 'us')
                return `about ${niceNum(v)} ${Math.abs(v - 1) < .12 ? unitLabel : plural} <small>(${grams(g)} g)</small>`;
            if (['egg', 'tortilla', 'tortillaGF', 'bread', 'breadGF'].includes(key))
                return `${niceNum(v)} ${Math.abs(v - 1) < .12 ? unitLabel : plural} <small>(${grams(g)} g)</small>`;
            return `${grams(g)} ${key === 'water' ? 'mL' : 'g'}`;
        }
        const timeLabel = m => m.displayTime || `${m.totalMinutes} min`;
        const catSlug = category => { var _a; return ((_a = cats.find(c => c.name === category)) === null || _a === void 0 ? void 0 : _a.slug) || 'all'; };
        function saved(slug) { return store.favorites.includes(slug); }
        function favoriteButton(m, large = false) {
            return `<button class="${large ? 'button secondary' : 'favorite'}" data-action="favorite" data-slug="${m.slug}" aria-pressed="${saved(m.slug)}" aria-label="${saved(m.slug) ? 'Unsave' : 'Save'} ${esc(m.title)}">${icon('heart')}${large ? `<span>${saved(m.slug) ? 'Saved' : 'Save recipe'}</span>` : ''}</button>`;
        }
        function renderHeader(active = 'menu') {
            const items = [['menu', 'Menu', 'grid', 0], ['journal', 'Journal', 'book', 0], ['made', 'Made Meals', 'plate', 0], ['restaurants', 'Restaurants', 'plate', 0], ['weekly', 'Weekly', 'leaf', pendingCount()], ['saved', 'Favorites', 'heart', store.favorites.length], ['shopping', 'Shopping', 'bag', Object.keys(store.shopping).length], ['vitamins', 'Vitamins', 'pill', 0], ['assistant', 'Assistant', 'book', 0], ['settings', 'Settings', 'shield', 0]];
            document.getElementById('site-header').innerHTML = `<div class="container header-inner"><a class="brand" href="#/menu" aria-label="At-Home Kitchen home"><span class="brand-mark">${icon('leaf')}</span>At-Home Kitchen</a><nav class="navigation" aria-label="Main navigation">${items.map(([route, label, ic, count]) => `<a href="#/${route}" class="nav-link ${active === route ? 'active' : ''}" ${active === route ? 'aria-current="page"' : ''}>${icon(ic)}<span>${label}</span>${count ? `<span class="bubble" aria-label="${count} items">${count}</span>` : ''}</a>`).join('')}</nav></div>`;
        }
        function renderFooter() {
            document.getElementById('site-footer').className = 'site-footer';
            document.getElementById('site-footer').innerHTML = `<div class="container"><div class="footer-top"><a class="brand footer-brand" href="#/menu">${icon('leaf')}At-Home Kitchen</a><div class="footer-links"><a href="#/settings">Data &amp; settings</a><a href="#/about">About this menu</a><a href="#/about/nutrition">Nutrition &amp; sources</a><a href="#/vitamins">Vitamin guidance</a></div></div><div class="footer-bottom"><p>Built around your reviewed home menu. Images are illustrative. Nutrition estimates and vitamin guidance are educational, not a treatment plan.</p><span>Local-first · No account needed</span></div></div>`;
        }
        function mealCard(m) {
            const n = nutrition(m);
            return `<article class="meal-card">${favoriteButton(m)}<a class="card-image-link" href="#/meal/${m.slug}" tabindex="-1" aria-hidden="true"><img decoding="async" class="card-image" src="${m.image}" alt="" loading="lazy" width="360" height="296"></a><div class="card-body"><div class="card-kicker"><span>${esc(m.proteinType === 'Vegetarian' ? 'Plant-forward' : m.proteinType)}</span>${m.isDinnerGF ? '<span>GF ingredients</span>' : ''}</div><h3 class="card-title"><a href="#/meal/${m.slug}">${esc(m.title)}</a></h3><p class="card-description">${esc(m.description)}</p><div class="card-bottom"><span>${icon('clock')}${timeLabel(m)}</span><span><strong>${m.index === 69 ? '0–5' : rounded(n.kcal, 5)}</strong> kcal est.</span><a class="recipe-link" href="#/meal/${m.slug}" aria-label="View recipe: ${esc(m.title)}">Recipe ${icon('arrow')}</a></div><div class="card-personal-actions"><button data-k="log" data-slug="${m.slug}">${icon('plus')}Log meal</button><button data-k="review-meal" data-slug="${m.slug}">Review</button>${smallStatus(m.slug)}</div></div></article>`;
        }
        function hero() {
            const m = activeMeals()[0] || meals[0];
            return `<section class="hero"><div class="container hero-inner"><div class="hero-copy"><div class="eyebrow">Your everyday menu</div><h1>Good food.<br><em>More your kind.</em></h1><p>A kitchen that gets to know you. Cook something good, keep a food journal, and shape your next menu one meal at a time.</p><div class="hero-actions"><a class="button" href="#menu-browse" data-action="browse">Explore the menu ${icon('arrow')}</a><a class="text-link" href="#/vitamins">Food-first vitamin guide</a></div><div class="hero-meta"><span><strong>70</strong> options</span><span><strong>6</strong> categories</span><span><strong>1</strong> home kitchen</span></div></div><div class="hero-visual"><a class="featured-photo" href="#/meal/${m.slug}" tabindex="-1" aria-hidden="true"><img decoding="async" src="${m.image}" alt="" width="360" height="296"></a><a class="featured-caption" href="#/meal/${m.slug}"><div><span class="micro">From your dinner menu</span><h3>${esc(m.title)}</h3></div><span class="circle-link">${icon('arrow')}</span></a></div></div></section>`;
        }
        function renderMenu(category = 'all') {
            var _a;
            currentRoute = 'menu';
            renderHeader('menu');
            const count = ((_a = cats.find(c => c.slug === category)) === null || _a === void 0 ? void 0 : _a.count) || P.active.length;
            document.title = 'Your Menu · At-Home Kitchen';
            main.innerHTML = `${hero()}<div class="container menu-shell">${menuNotice()}<section class="menu-tools" id="menu-browse" aria-labelledby="menu-title"><div class="toolbar-top"><h2 id="menu-title">What sounds good?</h2><label class="search">${icon('search')}<span class="visually-hidden">Search meals or ingredients</span><input id="meal-search" type="search" placeholder="Search meals or ingredients…" value="${esc(filters.q)}" autocomplete="off"><button class="search-clear" data-action="clear-search" aria-label="Clear search">${icon('x')}</button></label></div><nav class="category-tabs" aria-label="Meal categories"><a href="#/menu" class="chip ${category === 'all' ? 'active' : ''}" ${category === 'all' ? 'aria-current="true"' : ''}>All meals <b>70</b></a>${cats.map(c => `<a href="#/menu/${c.slug}" class="chip ${category === c.slug ? 'active' : ''}" ${category === c.slug ? 'aria-current="true"' : ''}>${esc(c.name)} <b>${c.count}</b></a>`).join('')}</nav><div class="filter-row"><div class="filter-buttons"><button class="filter-button" data-action="filter" data-filter="vegetarian" aria-pressed="${filters.vegetarian}">${icon('leaf')}Vegetarian</button><button class="filter-button" data-action="filter" data-filter="quick" aria-pressed="${filters.quick}">${icon('clock')}Ready in 30 min</button><button class="filter-button" data-k="toggle-hide" aria-pressed="${P.prefs.hideDisliked}">Hide disliked</button><button class="filter-button" data-action="reset-filters">Reset filters</button></div><label class="sort-control">Sort by <select id="sort-select"><option value="menu">Menu order</option><option value="time">Time</option><option value="protein">Protein estimate</option><option value="name">Name</option></select></label></div><p class="result-line" id="result-count" aria-live="polite">${count} options</p></section><div id="meal-results" data-category="${esc(category)}"></div><div class="health-strip"><div><h3>Nutrition with perspective.</h3><p>A menu to support everyday eating—not a promise to repair a joint. See how the recipe estimates and vitamin guidance were put together.</p></div><a class="button secondary" href="#/about">Read the approach ${icon('arrow')}</a></div></div>`;
            document.getElementById('sort-select').value = filters.sort;
            renderResults(category);
        }
        function renderResults(category) {
            var _a;
            const root = document.getElementById('meal-results');
            if (!root)
                return;
            category = category || root.dataset.category;
            const cat = (_a = cats.find(c => c.slug === category)) === null || _a === void 0 ? void 0 : _a.name;
            const tokens = filters.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
            let result = activeMeals().filter(m => (!P.prefs.hideDisliked || rating(m.slug)!=='dislike') && (!cat || m.category === cat) && (!filters.vegetarian || m.vegetarian) && (!filters.quick || (m.totalMinutes <= 30 && ![45, 49].includes(m.index))) && tokens.every(t => (m.title + ' ' + m.sourceIngredients + ' ' + m.category).toLowerCase().includes(t)));
            const sorter = { menu: (a, b) => P.active.indexOf(a.slug) - P.active.indexOf(b.slug), time: (a, b) => (a.totalMinutes + ([45, 49].includes(a.index) ? 360 : 0)) - (b.totalMinutes + ([45, 49].includes(b.index) ? 360 : 0)), protein: (a, b) => nutrition(b).protein - nutrition(a).protein, name: (a, b) => a.title.localeCompare(b.title) }[filters.sort];
            result.sort(sorter);
            document.getElementById('result-count').textContent = `${result.length} ${result.length === 1 ? 'option' : 'options'}${cat ? ' in ' + cat.toLowerCase() : ''}${filters.q ? ' matching “' + filters.q + '”' : ''} · Nutrition shown is estimated per serving.${P.prefs.hideDisliked ? ' Disliked meals are hidden; active category counts stay unchanged.' : ''}`;
            if (!result.length) {
                root.innerHTML = `<div class="empty">${icon('search')}<h2>No dishes found.</h2><p>Try a different ingredient or clear your filters to return to the menu.</p><button class="button secondary" data-action="reset-filters">Clear filters</button></div>`;
                return;
            }
            root.innerHTML = cats.map(c => { const group = result.filter(m => m.category === c.name); if (!group.length)
                return ''; return `<section class="meal-group" aria-labelledby="group-${c.slug}"><div class="section-heading"><h2 id="group-${c.slug}">${esc(c.name)}</h2><span>${group.length} ${group.length === 1 ? 'option' : 'options'}</span></div><div class="meal-grid">${group.map(mealCard).join('')}</div></section>`; }).join('');
        }
        function renderSaved() { renderCollection('favorites'); }
        function safetyFor(m) {
            const keys = new Set(m.ingredients.map(i => i.key));
            const msgs = [];
            if (keys.has('chicken') || keys.has('turkey'))
                msgs.push('Cook chicken and ground turkey to 165°F / 74°C, checked with a food thermometer.');
            if (keys.has('beef'))
                msgs.push('Cook ground beef to 160°F / 71°C.');
            if (keys.has('egg') && !keys.has('chicken') && !keys.has('turkey'))
                msgs.push('Cook eggs until whites and yolks are firm; egg mixtures should reach 160°F / 71°C.');
            return msgs.length ? `<div class="notice"><strong>Food safety</strong><p>${msgs.join(' ')} Times are guides; temperature determines doneness.</p>${sourceLink('safety')}</div>` : '';
        }
        function ingredientsHTML(m, o) {
            return resolvedIngredients(m, o).map((i, index) => {
                const f = foods[i.key];
                const id = `ing-${m.slug}-${i.key}`;
                const g = i.gramsPerServing * o.servings;
                return `<li><label class="check-row"><input type="checkbox" data-action="ingredient-check" data-id="${id}" ${checks[id] ? 'checked' : ''}><span class="ingredient-copy"><strong>${quantity(i.key, g, o.unit)}</strong><span>${esc(f.name)}${i.optional ? ' (optional)' : ''}</span></span></label></li>`;
            }).join('');
        }
        function nutritionHTML(m, o) {
            const n = nutrition(m, o);
            const rows = [['kcal', 'Energy', 'kcal', 5], ['protein', 'Protein', 'g', 1], ['carbs', 'Carbohydrate', 'g', 1], ['fat', 'Total fat', 'g', 1], ['satFat', 'Saturated fat', 'g', .1], ['fiber', 'Fiber', 'g', 1], ['sugars', 'Total sugars', 'g', 1], ['sodium', 'Sodium', 'mg', 10]];
            return `<div class="nutrition-grid">${rows.map(([k, label, u, r]) => `<div class="nutrition-box"><small>${label}</small><strong>${m.index === 69 ? (k === 'kcal' ? '0–5' : '~0') : Number(rounded(n[k], r).toFixed(1))}<em>${u}</em></strong></div>`).join('')}</div><p class="small-note" style="margin-top:16px">${m.index === 69 ? 'Infusion estimate assumes the lemon and cucumber slices are not eaten.' : `Per serving${m.ingredients.some(i => i.key === 'milk') ? ', with ' + (o.milk === 'soyMilk' ? 'unsweetened soy milk' : '1% fortified dairy milk') : ''}${m.ingredients.some(i => i.optional) ? (o.honey ? ', including optional honey' : ', excluding optional honey') : ''}.`} Changing batch size scales ingredients; one serving’s estimate stays the same.</p>`;
        }

        function prepGuideHTML(m) {
            const equipment = (m.equipment || []).map(x => `<li>${esc(x)}</li>`).join('');
            const hasEgg = m.ingredients.some(i => i.key === 'egg');
            return `<div class="recipe-setup"><h3>Before you start</h3><p class="equipment-caption">Equipment</p><ul class="equipment-list">${equipment}</ul><p class="small-note">Use the amounts in Ingredients for your selected servings. Meat weights are raw; rice, quinoa and pasta weights are dry; beans and lentils are cooked and drained. Water for boiling or steaming is a cooking aid, not an extra portion of an ingredient.</p><details class="method-basics"><summary>Batch size, timing &amp; measuring</summary><p>Start with thawed meat. For larger batches, use larger pans or cook in batches; do not simply multiply the cooking time. The stated times are estimates for the default batch. At higher elevations, grains and eggs can take longer; follow texture and temperature checks.</p>${hasEgg ? '<p>For a partial egg, beat a whole egg first and weigh the amount needed; one large egg without shell is about 50 g. Refrigerate unused beaten egg promptly.</p>' : ''}<p>Follow packaged-food cooking directions where specified. Added oil, toppings or substitutions beyond the ingredient list change the nutrition estimate.</p></details></div>`;
        }
        function cookingTipHTML(m) {
            return m.methodTip ? `<aside class="cooking-tip"><strong>Helpful tip</strong><p>${esc(m.methodTip)}</p></aside>` : '';
        }
        function renderMeal(slug, keepScroll = false) {
            const m = bySlug[slug];
            if (!m) {
                renderNotFound();
                return;
            }
            currentRoute = 'meal';
            renderHeader('menu');
            document.title = m.title + ' · At-Home Kitchen';
            const o = optionsFor(m);
            const hasMilk = m.ingredients.some(i => i.key === 'milk'), hasHoney = m.ingredients.some(i => i.optional);
            const allergens = new Set(resolvedIngredients(m, o).reduce((all, i) => all.concat(foods[i.key].allergens), []));
            const note = `${esc(m.timingNote || m.recipeNote)}`;
            main.innerHTML = `<div class="container"><header class="page-top"><div class="breadcrumb"><a href="#/menu">Menu</a>${icon('chevron')}<a href="#/menu/${catSlug(m.category)}">${esc(m.category)}</a>${icon('chevron')}<span>Recipe</span></div><div class="recipe-topline"><h1>${esc(m.title)}</h1>${favoriteButton(m, true)}</div></header><div class="recipe-hero"><figure class="recipe-figure"><img decoding="async" src="${m.image}" alt="${esc(m.title)} — illustrative food image" width="360" height="296"><figcaption>${esc(m.photoNote)}</figcaption></figure><div class="recipe-summary"><div class="tags"><span class="tag">${esc(m.category)}</span>${m.isDinnerGF ? '<span class="tag">Gluten-free ingredients</span>' : ''}${m.vegetarian ? '<span class="tag muted">Vegetarian</span>' : ''}${m.isSoup ? '<span class="tag muted">Soup / chili</span>' : ''}</div><p class="recipe-description">${esc(m.description)}</p><div class="recipe-stats"><div class="recipe-stat"><small>Prep</small><strong>${m.prepMinutes} min</strong></div><div class="recipe-stat"><small>Total, approx.</small><strong>${timeLabel(m)}</strong></div><div class="recipe-stat"><small>Batch</small><strong id="batch-label">${o.servings} servings</strong></div></div>${note ? `<p class="small-note">${note}</p>` : ''}<p class="small-note">${m.origin ? (m.origin==='made'?'This recipe was created from your meal description and reviewed by you.':m.origin==='ai'?'This is an AI-created menu idea.':'This is an additional menu variation.')+' Portions and methods have not been kitchen-tested.' : 'Meal and ingredient choices come from your reviewed menu. The portions and method were developed for this site and have not been kitchen-tested.'}</p><div class="page-actions"><button class="button secondary" data-action="print">${icon('print')}Print recipe</button><button class="button secondary" data-action="copy-link" data-slug="${m.slug}">${icon('share')}Copy recipe link</button></div></div></div><div class="recipe-body"><section class="panel" aria-labelledby="ingredients-title"><h2 id="ingredients-title">Ingredients</h2><p class="section-subtitle">Amounts for the whole batch. Check items off as you prep.</p><div class="portion-controls"><span class="portion-label">Servings</span><div class="stepper"><button data-action="servings" data-delta="-1" data-slug="${m.slug}" aria-label="Decrease servings" ${o.servings <= 1 ? 'disabled' : ''}>${icon('minus')}</button><output id="serving-count" aria-live="polite">${o.servings}</output><button data-action="servings" data-delta="1" data-slug="${m.slug}" aria-label="Increase servings" ${o.servings >= 12 ? 'disabled' : ''}>${icon('plus')}</button></div><div class="unit-switch" role="group" aria-label="Measurement units"><button data-action="unit" data-unit="metric" data-slug="${m.slug}" class="${o.unit === 'metric' ? 'active' : ''}" aria-pressed="${o.unit === 'metric'}">Metric</button><button data-action="unit" data-unit="us" data-slug="${m.slug}" class="${o.unit === 'us' ? 'active' : ''}" aria-pressed="${o.unit === 'us'}">U.S.</button></div></div>${hasMilk || hasHoney ? `<div class="options-row">${hasMilk ? `<label>Milk choice <select data-action="milk" data-slug="${m.slug}" aria-label="Milk choice"><option value="milk" ${o.milk === 'milk' ? 'selected' : ''}>Low-fat fortified dairy milk (1%)</option><option value="soyMilk" ${o.milk === 'soyMilk' ? 'selected' : ''}>Unsweetened fortified soy milk</option></select></label>` : ''}${hasHoney ? `<label class="toggle-label"><input type="checkbox" data-action="honey" data-slug="${m.slug}" ${o.honey ? 'checked' : ''}> Include optional honey in the recipe and estimate</label>` : ''}</div>` : ''}<ul class="ingredient-list" id="ingredient-list">${ingredientsHTML(m, o)}</ul><div class="allergen-line"><strong>Listed allergens:</strong> <span id="allergen-list">${allergens.size ? esc([...allergens].sort().join(', ')) : 'None identified in the basic ingredients'}</span>. Check every packaged product; this is not a complete allergen or cross-contact assessment.</div>${m.isDinnerGF ? '<div class="notice" style="margin-bottom:18px">Use labeled gluten-free pasta, bread, tortillas, sauces and broth. Check seasonings and prevent cross-contact when medically necessary.</div>' : ''}<button class="button" style="width:100%" data-action="add-shopping" data-slug="${m.slug}">${icon('bag')}<span id="shopping-button-text">${store.shopping[m.slug] ? 'Update shopping list' : 'Add ingredients to list'}</span></button><p class="small-note" style="margin:12px 0 0">Weights are raw for meat and dry for grains and pasta. Beans and lentils are cooked and drained. Household measures are approximate.</p></section><section class="panel method-panel" aria-labelledby="method-title"><h2 id="method-title">Step-by-step recipe</h2><p class="section-subtitle">${m.steps.length} clear steps · Tap a number to mark it complete.</p>${prepGuideHTML(m)}<ol class="method-list">${m.steps.map((step, i) => { const id = `${m.slug}-${i}`; return `<li class="${completedSteps[id] ? 'done' : ''}"><button class="step-check" data-action="step" data-id="${id}" aria-pressed="${!!completedSteps[id]}" aria-label="Mark step ${i + 1} ${completedSteps[id] ? 'incomplete' : 'complete'}">${completedSteps[id] ? icon('check') : i + 1}</button><div class="step-copy"><h3 class="method-step-title">${esc((m.stepTitles || [])[i] || "Step " + (i + 1))}</h3><p>${esc(step)}</p></div></li>`; }).join('')}</ol>${cookingTipHTML(m)}${safetyFor(m)}<details><summary>Make-ahead &amp; storage safety</summary><p>Refrigerate perishable ingredients and cooked food within 2 hours (1 hour above 90°F / 32°C). Keep the refrigerator at 40°F / 4°C or colder. Cool cooked rice and other hot foods promptly in shallow containers; do not leave them on the counter to cool for hours.</p><p>Follow product storage instructions. Reheat leftovers to 165°F / 74°C. Do not wash raw poultry; prevent contact between raw meat and ready-to-eat ingredients.</p>${sourceLink('storage')} ${sourceLink('safety')}<p>Use refrigerated cooked leftovers within 3–4 days, or freeze for longer storage. Follow shorter product-specific storage directions when applicable.</p><a class="inline-source" href="https://ask.fsis.usda.gov/article/How-do-I-handle-leftovers-safely" target="_blank" rel="noopener noreferrer">USDA FSIS · Leftover storage</a></details></section></div><section class="panel nutrition-section" aria-labelledby="nutrition-title"><div class="nutrition-heading"><div><h2 id="nutrition-title">Estimated nutrition</h2><p>Per serving · A planning estimate, not a verified Nutrition Facts label.</p></div><a class="text-link" href="#/about/nutrition">How it’s calculated ${icon('external')}</a></div><div id="nutrition-values">${nutritionHTML(m, o)}</div><details><summary>Ingredients and calculation assumptions</summary><p>These estimates use an editable, manually assembled table of typical generic-food values—not a verified USDA database import. Actual brands, cooking losses, added oil and portions change the results. Sodium is especially variable. Do not use these numbers for insulin dosing or a medical diet without professional verification.</p><div class="table-scroll"><table class="source-table"><thead><tr><th>Ingredient</th><th>Weight / serving</th><th>Reference kcal / 100 g</th></tr></thead><tbody id="nutrition-ingredient-table">${nutritionRows(m, o)}</tbody></table></div><p>All listed oil is included. No additional salt is assumed. Optional honey is excluded unless selected. Compare packaged foods with their actual labels.</p></details></section><section class="related"><div class="section-heading"><h2>More from ${esc(m.category.toLowerCase())}</h2><a class="text-link" href="#/menu/${catSlug(m.category)}">View category ${icon('arrow')}</a></div><div class="meal-grid">${activeMeals().filter(x => x.category === m.category && x.slug !== m.slug && rating(x.slug)!=='dislike').slice(0, 3).map(mealCard).join('')}</div></section></div>`;
            document.querySelector('.recipe-hero').insertAdjacentHTML('afterend', ratedPanel(m));
            const recipeBody = document.querySelector('.recipe-body');
            recipeBody.firstElementChild.classList.add('ingredient-panel');
            recipeBody.append(document.querySelector('.nutrition-section'));
            if (!keepScroll)
                window.scrollTo(0, 0);
        }
        function nutritionRows(m, o) { return resolvedIngredients(m, o).map(i => `<tr><td>${esc(foods[i.key].name)}</td><td>${grams(i.gramsPerServing)} g</td><td>${foods[i.key].per100g.kcal}</td></tr>`).join(''); }
        function refreshRecipe(slug, focusSelector) {
            var _a;
            const y = window.scrollY;
            renderMeal(slug, true);
            window.scrollTo(0, y);
            if (focusSelector)
                (_a = document.querySelector(focusSelector)) === null || _a === void 0 ? void 0 : _a.focus({ preventScroll: true });
        }
        function vitaminCard(symbol, title, badge, target, targetNote, why, foodsText, action, caution, source) {
            return `<article class="vitamin-card"><div class="vitamin-top"><span class="vitamin-symbol">${symbol}</span><div><h3>${title}</h3><span class="tag">${badge}</span></div></div><div class="daily-target"><strong>${target}</strong><span>${targetNote}</span></div><dl><dt>Why it matters</dt><dd>${why}</dd><dt>From your kitchen</dt><dd>${foodsText}</dd><dt>What to consider</dt><dd>${action}</dd><dt>Keep in mind</dt><dd>${caution}</dd></dl>${sourceLink(source)}</article>`;
        }
        function renderVitamins() {
            currentRoute = 'vitamins';
            renderHeader('vitamins');
            document.title = 'Vitamins & Supplements · At-Home Kitchen';
            main.innerHTML = `<div class="container"><header class="content-head"><div class="eyebrow">A food-first guide</div><h1>Vitamins, with perspective.</h1><p class="lead">Meet your needs. Fill a real gap. Know what the evidence does—and doesn’t—say before adding a supplement.</p><span class="badge-text">${icon('book')} Sources reviewed November 17, 2026</span></header><section class="vitamin-intro"><h2>Start with the menu,<br>not a supplement stack.</h2><div><p>The first recommendation is adequate nutrition—not routine pills for elbow pain. A supplement may help meet a specific nutrient need, but this guide does not prescribe one or claim that it can repair cartilage, correct fishtail deformity or delay surgery. Osteoarthritis supplement research remains uncertain and is not evidence of benefit for your particular elbow.</p><p style="margin-top:12px">${sourceLink('arthritis')}</p></div></section><div class="notice caution"><strong>Daily totals are not supplement doses.</strong> The amounts below are general adult intake targets from food plus supplements, not instructions to take that amount in a pill. Your clinician or registered dietitian can assess your diet, medications and any reason to test for deficiency. Pregnancy, kidney disease and other medical conditions can change the advice.</div><section class="vitamin-grid" aria-label="Vitamins and minerals to consider">${vitaminCard('D', 'Vitamin D', 'Consider only for an intake gap or deficiency', '600 IU · 15 mcg / day', 'Daily total for adults 19–70', 'Supports calcium absorption, bones and muscle function.', 'Fortified dairy or soy milk and eggs. Check fortification on the actual label.', 'Discuss a supplement when your intake is low or a clinician identifies deficiency. Treatment doses and testing depend on your circumstances.', 'The adult upper limit is 4,000 IU / day from all sources unless medically supervised; it is not a target. Extra vitamin D is not an established fishtail-pain treatment.', 'vitaminD')}${vitaminCard('Ca', 'Calcium', 'Food first; supplement a confirmed shortfall', '1,000 mg / day', 'Daily total for adults 19–50', 'Needed for bones, muscle contraction and nerve signaling.', 'Yogurt, milk, cottage cheese and calcium-fortified soy milk. Amounts vary by product.', 'Review intake before adding a supplement. A clinician can help determine whether there is a gap rather than automatically adding a full daily allowance.', 'The upper limit at ages 19–50 is 2,500 mg / day from all sources, not a target. Supplements can interact with medications; discuss them first with kidney disease or stone history.', 'calcium')}${vitaminCard('B₁₂', 'Vitamin B12', 'Useful when intake or absorption is inadequate', '2.4 mcg / day', 'Daily total for most adults; pregnancy needs differ', 'Supports normal blood cells, nerves and DNA production.', 'Eggs, dairy, meat and poultry. Fortified soy milk can contribute if B12 is listed.', 'A supplement is more relevant with a vegan diet, certain absorption disorders or medicines such as metformin and long-term acid suppressants. Your current menu contains several B12 sources.', 'Deficiency treatment is different from meeting daily needs. More B12 has not been established as a treatment for mechanical elbow pain.', 'b12')}${vitaminCard('Mg', 'Magnesium', 'Usually aim to meet needs through food', '310–420 mg / day', 'Adult range: women 310–320 mg; men 400–420 mg', 'Supports normal muscle and nerve function and bone health.', 'Beans, lentils, nuts, seeds, oats and spinach already feature in your menu.', 'Consider a supplement only for a specific need after checking diet and medicines. It is not a routine recommendation for elbow pain.', 'The adult limit from supplements and medicines is 350 mg / day, excluding food. Excess can cause diarrhea; kidney disease increases risk. Some antibiotics and other medicines interact.', 'magnesium')}</section><section class="text-section"><h2>What about omega-3s?</h2><div class="panel"><span class="tag">A fat—not a vitamin</span><p style="margin-top:16px">Walnuts, chia and flaxseed provide ALA. Adult adequate intakes are 1.6 g/day for men and 1.1 g/day for women; conversion to EPA and DHA is limited. Algae oil is a seafood-free source of longer-chain omega-3s, but it is optional—not an established treatment for your elbow. There is no set general EPA/DHA daily requirement or proven fishtail-pain dose.</p><p>Discuss supplements with your clinician or pharmacist, particularly if you use blood thinners or are preparing for surgery. This menu does not require fish-oil products.</p>${sourceLink('omega')}</div></section><section class="text-section"><h2>Not routine recommendations.</h2><div class="two-up"><article class="panel"><h3>Turmeric / curcumin capsules</h3><p>Research has limitations, and benefit is not established for your elbow condition. Some concentrated, high-absorption products have been linked to liver injury. Cooking with a spice is different from taking a concentrated extract.</p>${sourceLink('turmeric')}</article><article class="panel"><h3>Glucosamine, chondroitin &amp; “joint repair” blends</h3><p>Research has not established a reliable, meaningful benefit for osteoarthritis symptoms or joint structure. Do not treat cartilage-regrowth claims as established fact or assume that combining products makes them work better.</p>${sourceLink('arthritis')}</article></div></section><section class="panel" style="margin-bottom:40px"><h2>Bring these questions to your clinician.</h2><details open><summary>Am I actually missing a nutrient?</summary><p>Review your usual intake, medication list and medical history before buying anything. Testing should have a clinical reason; this site cannot diagnose a deficiency from your menu.</p></details><details><summary>Could a supplement interfere with medication or surgery?</summary><p>Bring the exact product label and dose, including every multivitamin, powder and herbal blend you take. Ask your pharmacist about interactions and tell your surgeon before procedures. Avoid stacking products that repeat the same nutrients.</p></details><details><summary>How will we know whether anything helps?</summary><p>Discuss a clear goal with your clinician—such as correcting an identified deficiency. Continue your elbow care; worsening locking, reduced movement or new neurological symptoms should not be managed by adding more supplements.</p></details><p class="small-note" style="margin-top:20px">This is educational guidance, not a personalized prescription. You do not need to buy a supplement to use this menu.</p></section></div>`;
        }
        function renderAbout(section) {
            currentRoute = 'about';
            renderHeader('');
            document.title = 'Approach & Sources · At-Home Kitchen';
            main.innerHTML = `<div class="container"><header class="content-head"><div class="eyebrow">Behind the menu</div><h1>A thoughtful menu.<br>Transparent assumptions.</h1><p class="lead">Built from the latest nutrition-reviewed version of your home menu, with the additions needed to turn an ingredient list into a working recipe collection.</p></header><div class="info-columns"><section class="panel"><h2>Your menu, preserved.</h2><p>The collection includes 21 dinners, 14 lunches, 7 full breakfasts, 7 quick breakfasts, 14 snacks and 7 smoothies or drinks. Dinner ingredients are gluten-free; other meal types are not required to be. Dinners include only two soup/chili options.</p><div class="preference-list">${D.metadata.preferences.excluded.map(x => `<span class="tag">No ${esc(x.toLowerCase())}</span>`).join('')}</div><p style="margin-top:18px">These are food preferences, not claims that excluding these foods treats inflammation. Gluten-free dinner choices are not a treatment for fishtail deformity.</p></section><section class="panel"><h2>What came from where?</h2><p><strong>From your document:</strong> meal names, categories, ingredient choices and illustrative food images from <em>At_Home_Food_Menu_Nutrition_Reviewed.docx</em>.</p><p><strong>Developed for this website:</strong> portions, detailed cooking steps, equipment lists, cooking tips, timing, descriptions, ingredient measurement defaults and nutritional estimates. All 70 methods were expanded for this edition. These recipes have not been kitchen-tested.</p><p>The listed milk alternative is supported. The calculation defaults to skinless chicken breast, 93% lean turkey, 90% lean beef, reduced-fat cheddar and 1% fortified dairy milk unless soy milk is selected.</p></section></div><section class="text-section" id="nutrition-method"><h2>How the nutrition estimates work</h2><p>${esc(D.metadata.nutritionMethod)}</p><div class="notice"><strong>The calculation:</strong> ingredient grams × approximate nutrients per 100 g ÷ 100. Sum the ingredients for one serving. Scaling the number of servings changes the batch amounts, not the composition of one serving.</div><p style="margin-top:20px">No full daily-value panel, micronutrient adequacy assessment or medical dosing advice is implied. Totals are rounded to avoid false precision. Calories may not match 4/4/9 arithmetic exactly because the generic reference values include fiber effects and rounding. Use actual labels and professional review for celiac disease, allergies, kidney diets, diabetes or other clinical requirements.</p><p>${sourceLink('usda', 'Independent reference for checking food composition: USDA FoodData Central')}</p><details><summary>See the editable reference table</summary><p>These are manually assembled approximate values—not independently validated database records. The website package includes the original menu extraction, all recipes and this reference table as readable JSON files.</p><div class="table-scroll"><table class="source-table"><thead><tr><th>Ingredient</th><th>kcal / 100 g</th><th>Protein / 100 g</th></tr></thead><tbody>${Object.values(foods).map(f => `<tr><td>${esc(f.name)}</td><td>${f.per100g.kcal}</td><td>${f.per100g.protein} g</td></tr>`).join('')}</tbody></table></div></details></section><section class="text-section"><h2>The goal: support nutrition, not promise a cure.</h2><p>The menu emphasizes plant foods, varied protein sources and practical meals. It is not a prescribed anti-inflammatory treatment or a promise of less pain. Nutritional support does not correct joint shape or remove loose fragments. Continue the rehabilitation and pain-management plan agreed with your orthopedic clinician.</p><p>Supplements do not substitute for that care. Even in osteoarthritis, supplement benefits remain uncertain; those findings should not be presented as proof that a product treats fishtail-deformity pain. ${sourceLink('arthritis')}</p></section><section class="text-section"><h2>Evidence &amp; reference reading</h2><p>Health guidance and food-safety sources reviewed November 17, 2026. The USDA link is provided for independent checking; the recipe estimates were not imported or verified against a live USDA database.</p><ul class="sources-list">${Object.entries(links).map(([k, [title, url]]) => `<li><a href="${url}" target="_blank" rel="noopener noreferrer">${esc(title)}<small>${k === 'usda' ? 'Independent nutrition reference, not the source of a verified recipe analysis' : k === 'safety' || k === 'storage' ? 'Cooking and storage safety' : 'Vitamin, mineral or supplement guidance'}</small></a>${icon('external')}</li>`).join('')}</ul></section><section class="panel" style="margin:35px 0 45px"><h2>Your data stays with you.</h2><p class="small-note">The site has no accounts, advertising, trackers or external data calls. Favorites and shopping selections are stored in this browser’s local storage. They do not sync across devices. Clearing browser data removes them. If local storage is unavailable, the site still works but cannot preserve selections after the session.</p><p class="small-note">External reference links open only when you choose to follow them. Sharing a recipe link does not share your saved meals or shopping list. A file link works only on your device; public sharing requires hosting the website.</p></section></div>`;
            if (section === 'nutrition')
                setTimeout(() => { var _a; return (_a = document.getElementById('nutrition-method')) === null || _a === void 0 ? void 0 : _a.scrollIntoView(); }, 30);
        }
        function shoppingTotals() {
            const totals = {};
            Object.entries(store.shopping).forEach(([slug, o]) => { const m = bySlug[slug]; if (!m)
                return; resolvedIngredients(m, o).forEach(i => { if (i.key === 'water')
                return; totals[i.key] = (totals[i.key] || 0) + i.gramsPerServing * o.servings; }); });
            return totals;
        }
        function shoppingText() {
            const totals = shoppingTotals();
            let text = 'AT-HOME KITCHEN — SHOPPING LIST\n\n';
            const grouped = {};
            Object.entries(totals).forEach(([k, g]) => { var _a; const group = foods[k].group; ((_a = grouped[group]) !== null && _a !== void 0 ? _a : (grouped[group] = [])).push([k, g]); });
            Object.entries(grouped).forEach(([group, items]) => { text += group.toUpperCase() + '\n'; items.forEach(([k, g]) => { text += `${store.checked[k] ? '[x]' : '[ ]'} ${foods[k].name} — ${grams(g)} g\n`; }); text += '\n'; });
            text += 'RECIPES\n';
            Object.entries(store.shopping).forEach(([slug, o]) => text += `${bySlug[slug].title}: ${o.servings} servings${o.milk === 'soyMilk' ? ', soy milk' : ''}${o.honey ? ', including optional honey' : ''}\n`);
            text += '\nWeights are recipe amounts, not package sizes. Produce is edible weight; beans/lentils are cooked and drained. Buy enough for trimming and draining. Water is not listed. Check pantry staples before buying.\n';
            return text;
        }
        function renderShopping() {
            currentRoute = 'shopping';
            renderHeader('shopping');
            document.title = 'Shopping List · At-Home Kitchen';
            const selected = Object.entries(store.shopping);
            const totals = shoppingTotals();
            const totalKeys = Object.keys(totals);
            const done = totalKeys.filter(k => store.checked[k]).length;
            const groups = ['Protein & dairy', 'Vegetables & fruit', 'Frozen', 'Grains & bread', 'Beans, nuts & seeds', 'Pantry & sauces', 'Seasonings'];
            main.innerHTML = `<div class="container"><header class="content-head"><div class="eyebrow">From menu to kitchen</div><h1>Your shopping list.</h1><p class="lead">Ingredients combined across your selected recipes, with amounts matched to your servings.</p>${selected.length ? `<div class="page-actions"><button class="button" data-action="download-shopping">${icon('download')}Download list</button><button class="button secondary" data-action="copy-shopping">${icon('copy')}Copy list</button><button class="button secondary" data-action="print">${icon('print')}Print</button><button class="button secondary" data-action="clear-shopping">Clear list</button></div>` : ''}</header>${selected.length ? `<div class="shopping-layout"><aside class="shopping-recipes"><h2>${selected.length} selected ${selected.length === 1 ? 'recipe' : 'recipes'}</h2>${selected.map(([slug, o]) => `<div class="shopping-meal"><div><a href="#/meal/${slug}">${esc(bySlug[slug].title)}</a><small>${o.servings} servings${o.milk === 'soyMilk' ? ' · Soy milk' : ''}${o.honey ? ' · With optional honey' : ''}</small></div><button class="icon-button" data-action="remove-shopping" data-slug="${slug}" aria-label="Remove ${esc(bySlug[slug].title)}">${icon('x')}</button></div>`).join('')}<p class="selection-note" style="margin-top:20px">Open a recipe to change servings, then select “Update shopping list.” Repeated ingredients are combined only when they use the same product type.</p><a class="button secondary small" href="#/menu">Add another recipe ${icon('plus')}</a></aside><div><p class="shopping-progress" id="shopping-progress" aria-live="polite">${done} of ${totalKeys.length} ingredients checked</p><div class="notice" style="margin-bottom:22px">Amounts are recipe weights, not package sizes. Produce is edible weight; beans and lentils are drained weight. Buy enough for trimming and draining. Gluten-free and regular products stay separate. Tap water is omitted.</div>${groups.map(group => { const items = Object.entries(totals).filter(([k]) => foods[k].group === group); if (!items.length)
                return ''; return `<section class="shopping-group"><h2>${group}</h2>${items.sort((a, b) => foods[a[0]].name.localeCompare(foods[b[0]].name)).map(([k, g]) => `<label class="check-row"><input type="checkbox" data-action="shop-check" data-key="${k}" ${store.checked[k] ? 'checked' : ''}><span>${esc(foods[k].name)}</span><strong>${grams(g)} g</strong></label>`).join('')}</section>`; }).join('')}</div></div>` : `<div class="empty">${icon('bag')}<h2>Let’s fill your basket.</h2><p>Open a recipe, choose your servings and add its ingredients. We’ll combine the list for you.</p><a class="button" href="#/menu">Browse the menu ${icon('arrow')}</a></div>`}<p class="privacy-note">${storageAvailable ? 'Your list is saved only in this browser. Download a copy before clearing browser data.' : 'Persistent storage is blocked. Download your shopping list to keep a copy.'}</p></div>`;
        }
        function renderNotFound() { currentRoute = 'not-found'; renderHeader(); document.title = 'Page not found · At-Home Kitchen'; main.innerHTML = `<div class="container"><div class="empty"><h1>This page isn’t on the menu.</h1><p>The recipe link may be incomplete or out of date.</p><a class="button" href="#/menu">Back to the menu ${icon('arrow')}</a></div></div>`; }
        function route() {
            const hash = location.hash.replace(/^#\/?/, '');
            if (hash === 'main') {
                main.focus();
                return;
            }
            const [page = 'menu', arg] = hash.split('/');
            if (!hash || page === 'menu') {
                const cat = arg && cats.some(c => c.slug === arg) ? arg : 'all';
                renderMenu(cat);
                if (arg)
                    setTimeout(() => { var _a; return (_a = document.getElementById('menu-browse')) === null || _a === void 0 ? void 0 : _a.scrollIntoView({ behavior: 'instant' }); }, 0);
                else
                    window.scrollTo(0, 0);
            }
            else if (page === 'meal') {
                renderMeal(arg);
            }
            else if (page === 'vitamins') {
                renderVitamins();
                window.scrollTo(0, 0);
            }
            else if (page === 'saved') {
                renderCollection(['favorites','liked','disliked','archive'].includes(arg)?arg:'favorites');
                window.scrollTo(0, 0);
            }
            else if (page === 'journal') { renderJournal(); window.scrollTo(0,0); }
            else if (page === 'made') { renderMadeMeals(arg); window.scrollTo(0,0); }
            else if (page === 'restaurants' || page === 'restaurant') { renderRestaurants(arg); window.scrollTo(0,0); }
            else if (page === 'weekly') { renderWeekly(); window.scrollTo(0,0); }
            else if (page === 'settings') { renderSettings(); window.scrollTo(0,0); }
            else if (page === 'assistant') { renderAssistant(); window.scrollTo(0,0); }
            else if (page === 'plan') { renderPlan(); window.scrollTo(0,0); }
            else if (page === 'shopping') {
                renderShopping();
                window.scrollTo(0, 0);
            }
            else if (page === 'about') {
                renderAbout(arg);
                if (!arg)
                    window.scrollTo(0, 0);
            }
            else {
                renderNotFound();
                window.scrollTo(0, 0);
            }
            // Announce new pages without stealing focus during input updates.
            main.focus({ preventScroll: true });
        }
        async function copyText(text) {
            try {
                if (navigator.clipboard && window.isSecureContext) {
                    await navigator.clipboard.writeText(text);
                    return true;
                }
            }
            catch (_) { }
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            document.body.append(ta);
            ta.select();
            let ok = false;
            try {
                ok = document.execCommand('copy');
            }
            catch (_) { }
            ta.remove();
            return ok;
        }
        function download(text, filename, type = 'text/plain') {
            const blob = new Blob([text], { type });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.append(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 2000);
        }
        function updateFavoriteButtons(slug) {
            document.querySelectorAll(`[data-action="favorite"][data-slug="${slug}"]`).forEach(btn => {
                const on = saved(slug);
                btn.setAttribute('aria-pressed', String(on));
                btn.setAttribute('aria-label', `${on ? 'Unsave' : 'Save'} ${bySlug[slug].title}`);
                const label = btn.querySelector('span');
                if (label)
                    label.textContent = on ? 'Saved' : 'Save recipe';
            });
        }
/* Journal, feedback, weekly review and local data controls.
   Inserted inside the original application closure so existing recipes stay intact. */
function readPersonalRaw() {
  try { return JSON.parse(localStorage.getItem('at-home-kitchen:personal:v3')||'null'); }
  catch (_) { return null; }
}
function illustrationImage(m) {
  const label = m.category==='Smoothies & Drinks'?'A new drink idea':'A new kitchen idea';
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="720" height="592" viewBox="0 0 720 592"><rect width="720" height="592" fill="#edf0e5"/><circle cx="360" cy="260" r="134" fill="#faf9f4" stroke="#cbd4c2" stroke-width="3"/><circle cx="360" cy="260" r="91" fill="none" stroke="#869a7d" stroke-width="3"/><path d="M352 297c-30-64 1-102 65-111 9 64-15 105-65 111zm-20 20 63-92" fill="#d3dfc8" stroke="#456650" stroke-width="4" stroke-linejoin="round"/><text x="360" y="465" text-anchor="middle" font-family="Georgia,serif" font-size="32" fill="#294b3e">${label}</text><text x="360" y="502" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#657066">Recipe idea · no food photograph</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}
function initializePersonal(raw) {
  const fresh=L.fresh(D.meals.map(m=>m.slug));
  if(!raw)return ensureFoodCollections(fresh);
  ensureFoodCollections(raw);
  const err=L.validateState(raw,bySlug,cats,foods);
  if(err){personalLoadWarning='A saved personalization file could not be read. The original menu is available. Restore a valid backup in Settings.';return ensureFoodCollections(fresh);}
  return raw;
}
function activeMeals() { return P.active.map(s=>bySlug[s]).filter(Boolean); }
function rating(slug) { return L.rated(P,slug); }
function protectedSlug(slug) { return L.protectedMeal(P,slug,store.favorites); }
function savePersonal() {
  try { localStorage.setItem(PERSONAL_KEY,JSON.stringify(P));return true; }
  catch(_){storageAvailable=false;return false;}
}
function storageWarning() {
  return `${personalLoadWarning?`<div class="notice caution" role="status">${esc(personalLoadWarning)}</div>`:''}${!storageAvailable?'<div class="notice caution" role="status"><strong>Session-only mode.</strong> Browser storage is unavailable. Export a backup in Settings before closing this page.</div>':''}`;
}
function setPage(page,title,body) {
  currentRoute=page;renderHeader(page==='archive'?'saved':page);document.title=title+' · At-Home Kitchen';
  main.innerHTML=`<div class="container personal-page">${storageWarning()}${body}</div>`;
}
function pageHead(kicker,title,description,actions='') {
  return `<header class="personal-head"><div><div class="eyebrow">${esc(kicker)}</div><h1>${esc(title)}</h1><p class="lead">${esc(description)}</p></div>${actions?`<div class="head-actions">${actions}</div>`:''}</header>`;
}
function prettyDate(s,short=false) { return new Date(s+'T12:00:00').toLocaleDateString(undefined,short?{month:'short',day:'numeric'}:{weekday:'long',month:'long',day:'numeric',year:'numeric'}); }
function smallStatus(slug) {
  const v=rating(slug);return v?`<span class="rating-label ${v}">${{love:'Loved',like:'Liked',dislike:'Disliked'}[v]}</span>`:'';
}
function ratedPanel(m) {
  const r=P.ratings[m.slug];const active=P.active.includes(m.slug);
  return `<section class="feedback-panel" aria-label="Your meal feedback"><div class="feedback-top"><div><span class="micro">Make this kitchen yours</span><h2>How was this meal?</h2><p>${r?`Your review: <strong>${{love:'Loved',like:'Liked',dislike:'Disliked'}[r.value]}</strong>${r.reason?' · '+esc(reasonName(r.reason)):''}.`:'Not rated yet. Logging a meal does not automatically mean you liked it.'} ${protectedSlug(m.slug)?'Protected from automatic replacement.':''}</p></div><div class="feedback-actions"><button class="button" data-k="log" data-slug="${m.slug}">${icon('plus')}Log this meal</button><button class="button secondary" data-k="plan" data-slug="${m.slug}">Make it again</button></div></div><div class="rating-controls" role="group" aria-label="Rate this recipe">${[['love','Love it'],['like','Like it'],['dislike','Dislike']].map(([v,label])=>`<button class="rating-button ${v}" data-k="rate" data-slug="${m.slug}" data-value="${v}" aria-pressed="${rating(m.slug)===v}">${v==='love'?icon('heart'):v==='like'?icon('check'):icon('x')}${label}</button>`).join('')}<button class="text-button" data-k="review-meal" data-slug="${m.slug}">${r?'Edit review / reason':'Add a reason'}</button>${r?`<button class="text-button" data-k="clear-rating" data-slug="${m.slug}">Clear rating</button>`:''}</div>${!active?`<div class="new-recipe-note"><span>${P.history.some(h=>h.from===m.slug)?'Archived recipe. Your cooking instructions and history are still here.':'This idea is not in your active menu yet.'}</span><button class="button secondary small" data-k="manual-swap" data-slug="${m.slug}">${P.history.some(h=>h.from===m.slug)?'Restore to menu':'Choose a meal to replace'}</button></div>`:''}</section>`;
}
const REASONS={taste:'Taste',texture:'Texture',effort:'Too much work',ingredient:'One ingredient',repeat:'Do not want it again',other:'Other'};
function reasonName(r){return REASONS[r]||r;}
function setRating(slug,value,reason='',ingredients=[],note='') {
  if(!bySlug[slug])return false;
  if(value==='dislike'&&saved(slug)){
    if(!window.confirm('This recipe is a favorite. Remove it from favorites and mark it disliked?'))return false;
    store.favorites=store.favorites.filter(s=>s!==slug);saveStore();
  }
  P.ratings[slug]={value,reason,ingredients:ingredients.filter(k=>foods[k]),note:note.slice(0,1000),updatedAt:new Date().toISOString()};
  if(value==='love'&&!saved(slug)){store.favorites.push(slug);saveStore();}
  savePersonal();return true;
}
function toggleFavorite(slug){
  if(!bySlug[slug])return;
  const was=saved(slug);
  if(!was&&rating(slug)==='dislike'){
    if(!window.confirm('Clear this meal’s dislike rating and add it to your favorites?'))return;
    delete P.ratings[slug];savePersonal();
  }
  store.favorites=was?store.favorites.filter(s=>s!==slug):store.favorites.concat(slug);saveStore();
  refreshCurrent();toast(was?'Removed from favorites. A Loved rating still protects this meal.':'Saved to favorites and protected from weekly replacement.');
}
function refreshCurrent() {const y=window.scrollY;route();window.scrollTo(0,y);}
let lastDialogFocus=null;
function openDialog(title,content) {
  closeDialog();lastDialogFocus=document.activeElement;
  const d=document.createElement('dialog');d.id='kitchen-dialog';d.className='kitchen-dialog';d.setAttribute('aria-labelledby','dialog-title');
  d.innerHTML=`<div class="dialog-head"><h2 id="dialog-title">${esc(title)}</h2><button class="icon-button" data-k="close-dialog" aria-label="Close dialog">${icon('x')}</button></div><div class="dialog-content">${content}</div>`;
  document.body.append(d);
  if(typeof d.showModal==='function')d.showModal();else {d.setAttribute('open','');d.setAttribute('role','dialog');d.setAttribute('aria-modal','true');d.classList.add('legacy-dialog');}
  d.addEventListener('cancel',e=>{e.preventDefault();closeDialog();});
  d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog();}});
  const first=d.querySelector('input:not([type=hidden]),select,button');if(first)first.focus();
}
function closeDialog(){const d=document.getElementById('kitchen-dialog');if(d){if(typeof d.close==='function')d.close();d.remove();if(lastDialogFocus&&lastDialogFocus.isConnected)lastDialogFocus.focus({preventScroll:true});}}
function formError(form,msg){let el=form.querySelector('.form-error');if(!el){el=document.createElement('p');el.className='form-error';el.setAttribute('role','alert');form.prepend(el);}el.textContent=msg;el.scrollIntoView({block:'nearest'});}
function reviewMealDialog(slug,value){
  const m=bySlug[slug];if(!m)return;const r=P.ratings[slug]||{};
  const val=value||r.value||'like';
  openDialog('Review '+m.title,`<form id="review-meal-form"><input type="hidden" name="slug" value="${slug}"><label class="field">Your rating<select name="value">${[['love','Love it — save to favorites'],['like','Like it'],['dislike','Dislike']].map(([v,l])=>`<option value="${v}" ${v===val?'selected':''}>${l}</option>`).join('')}</select></label><label class="field">Reason (optional)<select name="reason"><option value="">No specific reason</option>${Object.entries(REASONS).map(([k,l])=>`<option value="${k}" ${r.reason===k?'selected':''}>${l}</option>`).join('')}</select></label><fieldset class="ingredient-tags"><legend>Which ingredients? (optional)</legend><p class="small-note">These explain this review. They do not create a global food restriction.</p>${m.ingredients.filter(i=>!['salt','water'].includes(i.key)).map(i=>`<label><input name="ingredient" type="checkbox" value="${i.key}" ${(r.ingredients||[]).includes(i.key)?'checked':''}>${esc(foods[i.key].name)}</label>`).join('')}</fieldset><label class="field">A note for yourself (optional)<textarea name="note" maxlength="1000" rows="3" placeholder="What would you change?">${esc(r.note||'')}</textarea></label><p class="small-note">A dislike applies to this meal, not every dish with the same protein or ingredient.</p><div class="dialog-actions"><button class="button" type="submit">Save review</button><button class="button secondary" type="button" data-k="close-dialog">Cancel</button></div></form>`);
}
let journalDate=L.day();
function slotFor(m){return m.category==='Dinners'?'Dinner':m.category==='Lunches'?'Lunch':m.category.includes('Breakfast')?'Breakfast':m.category==='Snacks'?'Snack':'Drink';}
let logChoiceDrafts=new Map();
function initialLogChoices(m,entry=null){
  if(!m)return null;
  if(entry)return J.normalize(m,entry.customizations,foods,entry);
  const remembered=P.prefs.logDefaults&&P.prefs.logDefaults[m.slug];
  return J.normalize(m,remembered,foods,optionsFor(m));
}
function logCustomizationHTML(m,raw){
  if(!m)return '';
  const controls=J.controls(m,foods),choices=J.normalize(m,raw,foods);
  if(!controls.length)return '';
  return `<section class="log-customizations" aria-labelledby="log-customizations-title"><div class="log-customizations-heading"><div><h3 id="log-customizations-title">How you made it</h3><p>Choices for this recipe’s ingredients.</p></div><button type="button" class="text-button" data-k="log-reset-choices">Use recipe defaults</button></div><div class="log-choice-grid">${controls.map(c=>{
    const value=choices.omitted.includes(c.key)?'omit':choices.replacements[c.key]||c.key;
    return `<div class="log-choice-field">${c.optional?`<label class="checkbox-field log-optional-choice"><input type="checkbox" name="log-include-${c.key}" data-log-custom="include" ${choices.includedOptional.includes(c.key)?'checked':''}>Include ${esc(foods[c.key].name.toLowerCase())}</label>`:''}<label class="field" for="log-choice-${c.key}">${esc(c.label)}${c.optional?' choice':''}<select id="log-choice-${c.key}" name="log-choice-${c.key}" data-log-custom="choice" data-ingredient="${c.key}">${c.options.map(o=>`<option value="${esc(o.value)}" ${o.value===value?'selected':''}>${esc(o.label)}${o.value===c.key?' (recipe)':''}</option>`).join('')}</select></label></div>`;
  }).join('')}</div>${m.category==='Dinners'&&controls.some(c=>c.kind==='gluten')?'<p class="small-note">The dinner recipe uses gluten-free ingredients. Record the product you actually ate here; the menu recipe stays the same.</p>':''}<p class="small-note">Estimates use the listed recipe quantities and available ingredient profiles. A different product or amount is recorded with nutrition unavailable.</p><label class="field">Product note (optional)<input name="log-custom-note" maxlength="300" value="${esc(choices.note)}" placeholder="Brand or product details"><span class="small-note">This note does not change ingredient quantities.</span></label><label class="checkbox-field log-remember"><input type="checkbox" name="log-remember">Remember these choices for this recipe</label></section>`;
}
function logNutritionPreviewHTML(m,choices,servings){
  if(!m)return '';
  const result=J.estimate(m,choices,servings,foods),n=result.nutrition;
  if(!n)return `<div class="log-estimate log-estimate-unknown"><h3>Nutrition estimate unavailable</h3><p>${esc(result.reason)}</p><span class="small-note">Your food entry and choices can still be saved.</span></div>`;
  return `<div class="log-estimate"><div><h3>For the amount you ate</h3><p>${esc(servings)} recipe serving${Number(servings)===1?'':'s'} · estimated</p></div><div class="log-estimate-values">${[['kcal','Calories','kcal'],['protein','Protein','g'],['carbs','Carbs','g'],['fat','Fat','g']].map(([k,label,unit])=>`<div><span>${label}</span><strong>${Math.round(n[k])}<small>${unit}</small></strong></div>`).join('')}</div><p class="small-note">Updates with your portion and ingredient choices. Actual brands and preparation can change these figures.</p></div>`;
}
function updateLogNutritionPreview(){
  const f=document.getElementById('log-form'),preview=document.getElementById('log-nutrition-preview');
  if(!f||!preview)return;
  const fd=new FormData(f),m=bySlug[fd.get('slug')];
  preview.innerHTML=m?logNutritionPreviewHTML(m,J.fromForm(m,fd,foods),fd.get('servings')):'';
}
function refreshLogCustomizations(reset=false){
  const f=document.getElementById('log-form'),area=document.getElementById('log-customization-area');
  if(!f||!area)return;
  const fd=new FormData(f),previous=bySlug[area.getAttribute('data-recipe')];
  if(previous&&!reset)logChoiceDrafts.set(previous.slug,J.fromForm(previous,fd,foods));
  const m=bySlug[fd.get('slug')];
  let choices=null;
  if(m){choices=reset?J.normalize(m,null,foods):logChoiceDrafts.get(m.slug)||initialLogChoices(m);logChoiceDrafts.set(m.slug,choices);}
  area.setAttribute('data-recipe',m?m.slug:'');
  area.innerHTML=logCustomizationHTML(m,choices);
  updateLogNutritionPreview();
}
function journalCustomizationHTML(entry,m){
  if(!m||entry.kind!=='menu'||!entry.customizations)return '';
  const labels=J.summary(m,entry.customizations,foods);
  return `${labels.length?`<ul class="journal-choice-list" aria-label="Ingredients used">${labels.map(label=>`<li>${esc(label)}</li>`).join('')}</ul>`:''}${entry.customizations.note?`<p class="small-note">Product note: ${esc(entry.customizations.note)}</p>`:''}${entry.nutritionReason?`<p class="small-note journal-estimate-note">${esc(entry.nutritionReason)}</p>`:''}`;
}
function logDialog(slug='',entryId='',planId='',outsideType='') {
  const entry=P.journal.find(e=>e.id===entryId), m=bySlug[slug||(entry&&entry.slug)];
  const kind=outsideType?'custom':entry?entry.kind:'menu', selected=m?m.slug:'';
  const sourceType=outsideType||entry&&entry.sourceType||(kind==='custom'?'custom':'homemade');
  const record=entry&&entry.outsideId?(P.madeMeals.find(r=>r.id===entry.outsideId)||P.restaurantOrders.find(r=>r.id===entry.outsideId)):null;
  const choices=initialLogChoices(m,entry), selectedSlot=entry?entry.slot:m?slotFor(m):'Dinner';
  logChoiceDrafts=new Map();if(m)logChoiceDrafts.set(m.slug,choices);
  openDialog(entry?'Edit food entry':'What did you eat?',`<form id="log-form">
    <input type="hidden" name="id" value="${esc(entryId)}"><input type="hidden" name="planId" value="${esc(planId)}"><input type="hidden" name="kind" id="log-kind" value="${kind}">
    <div class="food-log-tabs" role="group" aria-label="Where is this meal from?"><button type="button" data-work="log-tab" data-value="menu" class="${kind==='menu'?'selected':''}" aria-pressed="${kind==='menu'}">${icon('book')}Menu meals<span>Saved recipes from your kitchen</span></button><button type="button" data-work="log-tab" data-value="custom" class="${kind==='custom'?'selected':''}" aria-pressed="${kind==='custom'}">${icon('plus')}Outside the menu<span>Something you made or ordered</span></button></div>
    <div class="form-two"><label class="field">Date<input name="date" type="date" value="${esc(entry?entry.date:journalDate)}" max="${L.day()}" min="2000-01-01" required></label><label class="field">Meal<select name="slot" id="food-log-slot">${['Breakfast','Lunch','Dinner','Snack','Drink'].map(x=>`<option ${selectedSlot===x?'selected':''}>${x}</option>`).join('')}</select></label></div>
    <div id="menu-log-fields" ${kind==='custom'?'hidden':''}><label class="field">Recipe<select name="slug" id="log-slug"><option value="">Choose a recipe…</option>${cats.map(c=>`<optgroup label="${esc(c.name)}">${meals.filter(x=>x.category===c.name&&(P.active.includes(x.slug)||x.slug===selected||x.origin==='made'||P.history.some(h=>h.from===x.slug))).map(x=>`<option value="${x.slug}" ${x.slug===selected?'selected':''}>${esc(x.title)}${x.origin==='made'?' · Made Meals':P.active.includes(x.slug)?'':' · archived'}</option>`).join('')}</optgroup>`).join('')}</select></label><label class="field">Servings eaten (optional)<input name="servings" type="number" min="0.25" max="12" step="0.25" value="${entry?(entry.servings===null?'':entry.servings):'1'}" placeholder="Leave blank when unsure"></label><p class="small-note">Use the recipe’s serving size. Leave the amount blank to log without a nutrition estimate.</p><input type="hidden" name="log-custom-version" value="1"><div id="log-customization-area" data-recipe="${esc(selected)}">${logCustomizationHTML(m,choices)}</div><div id="log-nutrition-preview" aria-live="polite" aria-atomic="true">${m?logNutritionPreviewHTML(m,choices,entry?entry.servings:1):''}</div></div>
    <div id="custom-log-fields" ${kind==='menu'?'hidden':''}>
      <label class="field">Outside-the-menu meal<select name="sourceType" id="outside-kind"><option value="homemade" ${sourceType==='homemade'?'selected':''}>Homemade meal</option><option value="restaurant" ${sourceType==='restaurant'?'selected':''}>Restaurant meal</option>${sourceType==='custom'?'<option value="custom" selected>Other · existing journal entry</option>':''}</select></label>
      <div id="restaurant-log-fields" ${sourceType==='restaurant'?'':'hidden'}><div class="form-two"><label class="field">Restaurant<input name="restaurant" maxlength="180" value="${esc(record&&record.restaurant||'')}" placeholder="Restaurant or café name"></label><label class="field">Location (optional)<input name="location" maxlength="200" value="${esc(record&&record.location||'')}" placeholder="City, branch or neighborhood"></label></div><label class="field">Customizations (optional)<input name="modifications" maxlength="1000" value="${esc(record&&record.modifications||'')}" placeholder="Dressing on the side, extra chicken, half the fries…"></label></div>
      <label class="field">Meal name<input name="title" maxlength="200" value="${esc(entry&&entry.kind==='custom'?entry.title:'')}" placeholder="For example: lemon chicken rice bowl"></label>
      <label class="field">Describe what you ate<textarea name="description" rows="4" maxlength="6000" placeholder="Ingredients or menu item, how it was cooked, sauces, sides, drinks, and any quantities you know.">${esc(record&&record.description||'')}</textarea></label>
      <div class="form-two"><label class="field">Amount you ate (optional)<input name="amount" maxlength="120" value="${esc(entry&&entry.amount||'')}" placeholder="1 bowl, half the dish, 2 slices…"></label><label class="field">Recipe category<select name="category" id="outside-category">${cats.map(c=>`<option ${c.name===(record&&record.category||categoryForSlot(selectedSlot))?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label></div>
      <div id="homemade-log-fields" ${sourceType==='restaurant'?'hidden':''}><label class="field">Servings the whole recipe made (optional)<input name="batchServings" type="number" min="1" max="12" step="1" value="${record&&record.batchServings||''}" placeholder="For example: 4; leave blank if unsure"></label></div>
      <p class="food-context-note" id="outside-explainer">${sourceType==='restaurant'?'Your original order is saved in Restaurants. Find similar options there when you want a menu comparison.':'Your description is saved in Made Meals. You can ask the assistant to turn it into a recipe, then review the ingredients and estimates.'}</p>
      <details class="journal-optional"><summary>Ingredient tags &amp; nutrition (optional)</summary><p class="small-note">Enter known values for the amount actually eaten. Unknown values stay blank; creating a recipe later does not automatically change this entry.</p><label class="field">Ingredient tags<select name="tags" multiple size="4">${Object.entries(foods).filter(([k])=>!['water','salt'].includes(k)).map(([k,f])=>`<option value="${k}" ${entry&&entry.ingredients.includes(k)?'selected':''}>${esc(f.name)}</option>`).join('')}</select></label><div class="form-two">${[['kcal','Calories (kcal)'],['protein','Protein (g)'],['carbs','Carbohydrate (g)'],['fat','Fat (g)'],['fiber','Fiber (g)'],['sodium','Sodium (mg)']].map(([k,label])=>`<label class="field">${label}<input name="n-${k}" type="number" min="0" max="100000" step="any" value="${entry&&entry.kind==='custom'&&entry.nutrition&&Number.isFinite(entry.nutrition[k])?entry.nutrition[k]:''}"></label>`).join('')}</div></details>
    </div>
    <label class="field">Personal note (optional)<textarea name="note" maxlength="1000" rows="2" placeholder="Saved locally; not included in the AI description">${esc(entry&&entry.note||'')}</textarea></label><div id="log-rate-field" ${kind==='custom'?'hidden':''}><label class="field">Quick rating (optional)<select name="rating"><option value="">Keep the current rating</option><option value="love">Love it — favorite</option><option value="like">Like it</option><option value="dislike">Dislike</option></select></label></div>
    <div class="dialog-actions"><button class="button" type="submit">${entry?'Save changes':'Add to journal'}</button><button class="button secondary" type="button" data-k="close-dialog">Cancel</button></div></form>`);
}
function journalCard(e){
  const m=bySlug[e.slug],outsideHref=e.sourceType==='homemade'&&P.madeMeals.some(r=>r.id===e.outsideId)?'#/made/'+e.outsideId:e.sourceType==='restaurant'&&P.restaurantOrders.some(r=>r.id===e.outsideId)?'#/restaurant/'+e.outsideId:'';
  return `<article class="journal-entry"><div class="journal-entry-icon">${icon(e.slot==='Drink'?'pill':'plate')}</div><div class="journal-entry-copy"><span class="food-entry-source">${sourceLabel(e)}</span><h3>${m?`<a href="#/meal/${m.slug}">${esc(e.title)}</a>`:outsideHref?`<a href="${esc(outsideHref)}">${esc(e.title)}</a>`:esc(e.title)}</h3><p>${e.kind==='menu'?(e.servings===null?'Amount not specified':esc(e.servings)+' recipe serving'+(e.servings===1?'':'s')):esc(e.amount||'Amount not specified')} ${e.nutrition&&Number.isFinite(e.nutrition.kcal)?' · '+Math.round(e.nutrition.kcal)+' kcal '+(e.kind==='menu'||e.nutritionSource==='reviewed_recipe_estimate'?'est.':'entered'):' · Nutrition unknown'}</p>${journalCustomizationHTML(e,m)}${e.note?`<p class="entry-note">${esc(e.note)}</p>`:''}${m?smallStatus(m.slug):''}${outsideHref?`<a class="food-entry-link" href="${esc(outsideHref)}">${e.sourceType==='homemade'?'Open Made Meal':'Order & similar options'} ${icon('arrow')}</a>`:''}</div><div class="entry-actions">${m?`<button class="text-button" data-k="review-meal" data-slug="${m.slug}">Rate</button>`:''}<button class="text-button" data-k="edit-log" data-id="${e.id}">Edit</button><button class="icon-button" data-k="delete-log" data-id="${e.id}" aria-label="Delete ${esc(e.title)}">${icon('trash')}</button></div></article>`;
}
function renderJournal(){
  const entries=P.journal.filter(e=>e.date===journalDate);const t=L.totals(entries);const c=P.checkins[journalDate]||{};
  const plans=P.plans.filter(p=>p.date===journalDate&&!p.completed);
  const weekDays=Array.from({length:7},(_,i)=>L.move(journalDate,i-6));
  setPage('journal','Food Journal',pageHead('A little attention, every day','Your food journal.','Log what you ate, whether it came from this menu or somewhere else.',`<button class="button" data-k="log">${icon('plus')}Log food or drink</button>`)+foodNavigation('journal')+`<div class="food-journal-entry-points"><button data-k="log"><span>${icon('book')}Menu meals</span><small>Log a recipe you already have</small></button><div><span>${icon('plus')}Outside the menu</span><div><button class="text-button" data-work="new-outside" data-type="homemade">Homemade meal ${icon('arrow')}</button><button class="text-button" data-work="new-outside" data-type="restaurant">Restaurant meal ${icon('arrow')}</button></div></div></div><div class="journal-layout"><div class="journal-primary"><div class="date-toolbar"><button class="icon-button" data-k="journal-day" data-delta="-1" aria-label="Previous day">${icon('back')}</button><label class="date-label">Your day<input id="journal-date" type="date" value="${journalDate}" max="${L.day()}" min="2000-01-01"></label><button class="icon-button" data-k="journal-day" data-delta="1" aria-label="Next day" ${journalDate>=L.day()?'disabled':''}>${icon('arrow')}</button><button class="text-button" data-k="journal-today">Today</button></div><div class="week-strip">${weekDays.map(d=>`<button data-k="journal-select" data-date="${d}" class="${d===journalDate?'selected':''}" aria-label="${esc(prettyDate(d))}"><span>${new Date(d+'T12:00:00').toLocaleDateString(undefined,{weekday:'short'})}</span><strong>${Number(d.slice(-2))}</strong><i class="${P.journal.some(e=>e.date===d)?'has-entry':''}"></i></button>`).join('')}</div>${plans.length?`<section class="plan-today"><div class="section-heading"><h2>Planned for this day</h2><a href="#/plan">All plans</a></div>${plans.map(planCard).join('')}</section>`:''}<div class="daily-log">${['Breakfast','Lunch','Dinner','Snack','Drink'].map(slot=>{const rows=entries.filter(e=>e.slot===slot);return `<section class="journal-slot"><div class="slot-heading"><h2>${slot==='Snack'?'Snacks':slot==='Drink'?'Drinks':slot}</h2><span>${rows.length} ${rows.length===1?'entry':'entries'}</span></div>${rows.length?rows.map(journalCard).join(''):`<p class="empty-slot">Nothing logged here. This is a journal, not a required meal schedule.</p>`}</section>`;}).join('')}</div></div><aside class="journal-side"><section class="summary-panel"><span class="micro">${esc(prettyDate(journalDate,true))}</span><h2>What’s recorded</h2><strong class="daily-energy">${t.known.kcal?Math.round(t.sum.kcal).toLocaleString():'—'}<small>kcal ${t.known.kcal?'recorded / estimated':'not available'}</small></strong><div class="macro-rows">${[['protein','Protein','g'],['carbs','Carbohydrate','g'],['fat','Fat','g'],['fiber','Fiber','g']].map(([k,label,u])=>`<div><span>${label}</span><strong>${t.known[k]?Math.round(t.sum[k])+u:'—'}</strong><small>${t.known[k]} of ${entries.length} entries</small></div>`).join('')}</div><p class="small-note">Known entries only, not a complete daily intake assessment. Missing portions and unknown foods are not counted as zero. No calorie target is assigned.</p></section><section class="summary-panel"><h3>Optional comfort note</h3><p class="small-note">For your own records. This does not establish food–pain causes and is never sent to the AI service.</p><form id="checkin-form"><label class="field">Elbow discomfort, 0–10<select name="pain"><option value="">Not recorded</option>${Array.from({length:11},(_,i)=>`<option value="${i}" ${c.pain===i?'selected':''}>${i}${i===0?' — none':i===10?' — worst':''}</option>`).join('')}</select></label><label class="field">Activity or other context<textarea name="note" maxlength="1500" rows="3" placeholder="Golf, sleep, unusual activity…">${esc(c.note||'')}</textarea></label><button class="button secondary small" type="submit">Save note</button></form></section><a class="button secondary" href="#/plan">${icon('clock')}Planned meals</a></aside></div>`);
}
function planCard(p){const m=bySlug[p.slug];if(!m)return '';return `<article class="planned-card"><div><span class="micro">${esc(prettyDate(p.date,true))}</span><h3><a href="#/meal/${p.slug}">${esc(m.title)}</a></h3><p>${p.servings} planned serving${p.servings===1?'':'s'}</p></div><div class="entry-actions">${p.completed?'<span class="rating-label like">Logged</span>':`<button class="button secondary small" data-k="eat-plan" data-id="${p.id}" ${p.date>L.day()?'disabled':''}>I ate this</button><button class="icon-button" data-k="delete-plan" data-id="${p.id}" aria-label="Remove planned ${esc(m.title)}">${icon('x')}</button>`}</div></article>`;}
function renderPlan(){const plans=P.plans.slice().sort((a,b)=>a.date.localeCompare(b.date));setPage('plan','Planned Meals',pageHead('Make it again','A little planning.','A place for meals you want to cook. Planning never counts a meal as eaten.',`<a class="button" href="#/saved">Choose a favorite ${icon('heart')}</a>`)+`<div class="plan-list">${plans.length?plans.map(planCard).join(''):'<div class="empty"><h2>Nothing planned yet.</h2><p>Open a recipe and choose “Make it again.”</p><a class="button" href="#/menu">Browse recipes</a></div>'}</div><p class="small-note">Shopping quantities are one chosen batch per recipe. Planning the same recipe again updates its shopping batch; it does not automatically add another batch.</p>`);}
function planDialog(slug){const m=bySlug[slug];if(!m)return;openDialog('Make it again',`<form id="plan-form"><input type="hidden" name="slug" value="${slug}"><h3>${esc(m.title)}</h3><div class="form-two"><label class="field">Planned date<input name="date" type="date" min="${L.day()}" value="${L.day()}" required></label><label class="field">Servings to cook<input name="servings" type="number" min="1" max="12" step="1" value="${optionsFor(m).servings}" required></label></div><label class="checkbox-field"><input name="shopping" type="checkbox" checked>Add ingredients to my shopping list</label><p class="small-note">Uses your current milk and optional-honey choices. For an existing shopping recipe, this updates the batch size rather than adding duplicate ingredients.</p><div class="dialog-actions"><button class="button" type="submit">Save plan</button><button class="button secondary" type="button" data-k="close-dialog">Cancel</button></div></form>`);}
function renderCollection(tab='favorites'){
  const archived=new Set(P.history.map(h=>h.from).filter(s=>!P.active.includes(s)));
  let selected=tab==='liked'?meals.filter(m=>['like','love'].includes(rating(m.slug))):tab==='disliked'?meals.filter(m=>rating(m.slug)==='dislike'):tab==='archive'?meals.filter(m=>archived.has(m.slug)):meals.filter(m=>saved(m.slug));
  const titles={favorites:'Keep the good ones.',liked:'Meals you enjoyed.',disliked:'Not for you.',archive:'Nothing is lost.'};
  setPage('saved','Your Collection',pageHead('Your personal collection',titles[tab]||titles.favorites,tab==='archive'?'Previous meals stay here with their recipes, ratings and journal history.':tab==='disliked'?'Disliked meals are excluded from recommendations. Change your review any time.':'Saved favorites are protected from weekly replacements. A bookmark is separate from a taste rating.',`<a class="button secondary" href="#/plan">Planned meals ${icon('clock')}</a>`)+`<nav class="collection-tabs" aria-label="Collection type">${[['favorites','Favorites'],['liked','Liked'],['disliked','Disliked'],['archive','Archive']].map(([k,l])=>`<a href="#/saved/${k}" class="chip ${tab===k?'active':''}" ${tab===k?'aria-current="page"':''}>${l}</a>`).join('')}</nav>${selected.length?`<div class="meal-grid">${selected.map(mealCard).join('')}</div>`:`<div class="empty"><h2>${tab==='archive'?'No archived recipes yet.':'Your collection starts with a meal.'}</h2><p>${tab==='archive'?'Approved swaps move the previous recipe here. Nothing is permanently deleted.':'Save or review a recipe to find it here later.'}</p><a class="button" href="#/menu">Browse the menu</a></div>`}<p class="privacy-note">${selected.length} recipes · Stored in this browser. Export a backup in Settings to move devices or files.</p>`);
}
function pendingCount(){return P.reviews.reduce((n,r)=>n+r.swaps.filter(s=>s.status==='pending').length,0);}
function menuNotice(){return `<div class="personal-menu-strip"><div>${icon('book')}<span><strong>Your kitchen learns from feedback.</strong> Log a meal, save a favorite, or review your next menu changes.</span></div><div><a class="button secondary small" href="#/journal">Food journal</a><a class="button secondary small" href="#/weekly">Weekly review${pendingCount()?' · '+pendingCount()+' pending':''}</a></div></div>${storageWarning()}`;}
function selectedReview(){return P.reviews[P.reviews.length-1]||null;}
function runLocalReview(manual=false){
  const wk=L.week(L.day(),P.prefs.weekday);const existing=P.reviews.find(r=>r.week===wk);
  if(existing&&!manual)return existing;
  if(existing&&existing.swaps.some(s=>s.status==='pending')&&manual&&!window.confirm('Replace the current pending suggestions with a fresh preview? Approved swaps and your history will remain.'))return existing;
  if(existing)existing.swaps.forEach(s=>{if(s.status==='pending')s.status='stale';});
  // Superseded pending proposals are retained in history, but cannot be approved.
  P.reviews.forEach(r=>r.swaps.forEach(s=>{if(s.status==='pending')s.status='stale';}));
  const r=L.review(P,meals,bySlug,cats,store.favorites);P.reviews.push(r);P.reviews=P.reviews.slice(-250);P.prefs.nextReview=L.nextDue(L.day(),P.prefs.weekday);savePersonal();return r;
}
let checkingWeek=false;
function checkWeekly(){
  if(checkingWeek||!P.prefs.autoReview||P.prefs.nextReview>L.day())return;
  checkingWeek=true;
  try{runLocalReview(false);P.prefs.nextReview=L.nextDue(L.day(),P.prefs.weekday);savePersonal();renderHeader(currentRoute);if(currentRoute==='weekly')renderWeekly();toast('Your weekly menu review is ready. No meals changed.');if(P.prefs.autoAI&&P.prefs.aiConsent&&backendHere())askAI(true);}
  finally{checkingWeek=false;}
}
function reviewSwapCard(r,s){const from=bySlug[s.from],to=bySlug[s.to];if(!from||!to)return '';const error=s.status==='pending'?L.swapError(P,s.from,s.to,bySlug,cats,store.favorites):'';return `<article class="swap-card"><div class="swap-card-top"><span class="tag">${esc(from.category)}</span><span class="status-text ${s.status}">${esc(s.status==='pending'?'Awaiting approval':s.status==='stale'?'Superseded':s.status)}</span></div><div class="swap-meals"><div class="swap-old"><span class="micro">Archive</span><h3><a href="#/meal/${from.slug}">${esc(from.title)}</a></h3>${smallStatus(from.slug)}</div><span class="swap-arrow">${icon('arrow')}</span><div><span class="micro">Add to your menu</span><h3><a href="#/meal/${to.slug}">${esc(to.title)}</a></h3><p>${timeLabel(to)} · ${to.origin==='ai'?'AI-created recipe':'Recipe variation'}</p></div></div><p class="swap-reason">${esc(s.reason)}</p>${error?`<p class="inline-warning">${esc(error)}</p>`:''}<div class="swap-actions"><a class="text-link" href="#/meal/${to.slug}">Read full recipe ${icon('arrow')}</a>${s.status==='pending'?`<button class="button small" data-k="approve-swap" data-review="${r.id}" data-id="${s.id}" ${error?'disabled':''}>Approve swap</button><button class="text-button" data-k="skip-swap" data-review="${r.id}" data-id="${s.id}">Keep original</button>`:''}</div></article>`;}
function renderWeekly(){
  const r=selectedReview();const stats=r?r.stats:{entries:0,days:0,ratings:Object.keys(P.ratings).length};const dayname=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][P.prefs.weekday];
  setPage('weekly','Weekly Menu Review',pageHead('A menu that grows with you','Keep what works.<br>'.replace('<br>',''), 'A small weekly refresh, guided by what you eat and what you actually enjoy.',`<button class="button" data-k="run-review">${icon('leaf')}${r?'Update review':'Create first review'}</button><a class="button secondary" href="#/settings">Review settings</a>`)+`<div class="review-overview"><div class="review-intro"><span class="micro">${r?'Latest review · '+esc(prettyDate(r.windowEnd,true)):'Ready when you are'}</span><h2>${r?'Your weekly check-in.':'Let’s learn your tastes.'}</h2><p>${r?esc(r.summary):'Start with your journal and a few ratings. Untried meals will not be removed, and your favorites are always protected.'}</p><div class="review-stat-row"><div><strong>${stats.entries}</strong><span>entries in review</span></div><div><strong>${stats.days}</strong><span>days logged</span></div><div><strong>${stats.ratings}</strong><span>meal ratings saved</span></div></div></div><aside class="review-rules"><h3>Your guardrails</h3><p>${icon('shield')}Favorites and Loved meals stay.</p><p>${icon('grid')}70 active meals · category sizes stay fixed.</p><p>${icon('check')}Changes need your approval.</p><p>${icon('clock')}${P.prefs.autoReview?dayname+' checks · next '+esc(prettyDate(P.prefs.nextReview,true)):'Automatic reviews paused.'}</p><small>Checks run while the app is open, or on your next visit. A downloaded file cannot run with the browser closed.</small></aside></div><div class="engine-note"><div><strong>${r&&r.engine==='ai'?'AI-assisted review':'Local preference-based review'}</strong><p>${r&&r.engine==='ai'?'Includes new recipes returned by the connected AI service. Review ingredients, instructions and estimates before approval.':'The built-in recommender uses your feedback and 24 additional recipe variations. It is not a live AI model.'}</p></div><button class="button secondary small" data-k="ai-review">${icon('plus')}Ask ChatGPT for new recipe ideas</button></div>${aiLastMessage?`<div class="notice ${aiLastError?'caution':''}" role="status">${esc(aiLastMessage)}</div>`:''}<section class="review-section"><div class="section-heading"><h2>Suggested changes</h2><span>Up to ${P.prefs.maxChanges} approved weekly swaps</span></div>${r&&r.swaps.length?`<div class="swaps-grid">${r.swaps.map(s=>reviewSwapCard(r,s)).join('')}</div>`:`<div class="review-empty"><h3>${r?'No replacements needed.':'No changes queued.'}</h3><p>${r?'You do not need to dislike a meal to discover something new. The ideas below can be previewed; adding one requires you to choose a meal to replace.':'Rate meals and create a review when you are ready. There is no minimum logging streak or pressure to change your menu.'}</p></div>`}</section>${r&&r.repeats&&r.repeats.length?`<section class="review-section"><div class="section-heading"><h2>Make a favorite again</h2></div><div class="repeat-grid">${r.repeats.filter(x=>bySlug[x.slug]&&rating(x.slug)!=='dislike').map(x=>`<article class="repeat-card"><span class="micro">${esc(x.category)}</span><h3><a href="#/meal/${x.slug}">${esc(bySlug[x.slug].title)}</a></h3><button class="button secondary small" data-k="plan" data-slug="${x.slug}">Make it again</button></article>`).join('')}</div></section>`:''}${r&&r.suggestions&&r.suggestions.length?`<section class="review-section"><div class="section-heading"><h2>Something new to try</h2><span>Ideas across your meal categories</span></div><div class="idea-grid">${r.suggestions.filter(x=>bySlug[x.slug]&&!P.active.includes(x.slug)&&L.available(bySlug[x.slug],P)).map(x=>{const m=bySlug[x.slug];return `<article class="idea-card"><span class="micro">${esc(x.category)}</span><h3><a href="#/meal/${m.slug}">${esc(m.title)}</a></h3><p>${esc(x.reason)}</p><div class="idea-actions"><a class="text-link" href="#/meal/${m.slug}">Read recipe</a><button class="button secondary small" data-k="manual-swap" data-slug="${m.slug}">Choose a swap</button><button class="text-button" data-k="reject-idea" data-slug="${m.slug}">Not interested</button></div></article>`;}).join('')}</div></section>`:''}<section class="review-section"><div class="section-heading"><h2>Menu history</h2><a class="text-link" href="#/saved/archive">Open archive ${icon('arrow')}</a></div>${P.history.length?`<div class="history-list">${P.history.slice(-10).reverse().map(h=>`<div class="history-item"><div><strong>${esc(bySlug[h.from].title)}</strong> → <strong>${esc(bySlug[h.to].title)}</strong><p>${esc(prettyDate((h.at||'').slice(0,10)||L.day(),true))} · ${h.kind==='restore'?'Restored':h.kind==='weekly'?'Approved weekly change':'Your chosen swap'}</p></div><a class="text-link" href="#/meal/${h.from}">View archived recipe</a></div>`).join('')}</div>`:'<p class="muted">Your approved changes will appear here. Nothing has been removed.</p>'}</section><div class="notice">This feature personalizes food choices, not medical treatment. It does not infer food–pain causes or claim to repair fishtail deformity.</div>`);
}
function applySwap(from,to,kind='manual',reviewId='',swapId=''){
  const err=L.swapError(P,from,to,bySlug,cats,store.favorites);if(err){toast(err);return false;}
  const wk=L.week(L.day(),P.prefs.weekday);
  if(kind==='weekly'&&P.history.filter(h=>h.kind==='weekly'&&h.week===wk).length>=P.prefs.maxChanges){toast('Your weekly change limit has been reached.');return false;}
  P.active=P.active.map(s=>s===from?to:s);
  P.history.push({id:L.id('history'),from,to,kind,week:wk,at:new Date().toISOString(),reviewId});
  P.reviews.forEach(r=>r.swaps.forEach(s=>{if(s.status==='pending'&&(s.from===from||s.to===to))s.status=r.id===reviewId&&s.id===swapId?'approved':'stale';}));
  savePersonal();return true;
}
function swapDialog(to){const m=bySlug[to];if(!m)return;const archived=P.history.some(h=>h.from===to);const options=P.active.filter(s=>bySlug[s].category===m.category&&!protectedSlug(s));
  openDialog(archived?'Restore an archived meal':'Choose your menu swap',`<form id="swap-form"><input type="hidden" name="to" value="${to}"><input type="hidden" name="restore" value="${archived?'1':'0'}"><p>Add <strong>${esc(m.title)}</strong> to ${esc(m.category.toLowerCase())}.</p><label class="field">Which meal should it replace?<select name="from" required><option value="">Choose a meal…</option>${options.map(s=>`<option value="${s}">${esc(bySlug[s].title)}${rating(s)==='dislike'?' — disliked':''}</option>`).join('')}</select></label>${!options.length?'<div class="notice">All meals in this category are protected. Remove a favorite or Loved rating yourself before replacing one.</div>':''}${rating(to)==='dislike'?'<label class="checkbox-field"><input name="clearDislike" type="checkbox" required>Clear this recipe’s dislike rating and restore it</label>':''}${P.rejected.includes(to)?'<label class="checkbox-field"><input name="clearRejection" type="checkbox" required>Allow this previously rejected suggestion again</label>':''}<p class="small-note">The selected meal moves to the archive. Its recipe and journal history remain available. Category counts stay the same. This is your manual choice, not an automatic removal.</p><div class="dialog-actions"><button class="button" type="submit" ${!options.length?'disabled':''}>${archived?'Restore meal':'Confirm swap'}</button><button class="button secondary" type="button" data-k="close-dialog">Cancel</button></div></form>`);
}
let aiLastMessage='',aiLastError=false,aiBusy=false;
function backendHere(){return location.protocol!=='file:'&&['127.0.0.1','localhost','[::1]'].includes(location.hostname);}
function renderSettings(){
  const countCustom=P.customRecipes.length;
  setPage('settings','Settings & Data',pageHead('You stay in control','Your kitchen settings.','Manage the weekly rhythm, protect your preferences, and keep a copy of your data.')+`<div class="settings-grid"><section class="settings-panel"><h2>Weekly refresh</h2><form id="settings-form"><label class="checkbox-field"><input name="auto" type="checkbox" ${P.prefs.autoReview?'checked':''}>Prepare a weekly review automatically</label><div class="form-two"><label class="field">Review day<select name="weekday">${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((d,i)=>`<option value="${i}" ${P.prefs.weekday===i?'selected':''}>${d}</option>`).join('')}</select></label><label class="field">Maximum weekly swaps<select name="maxChanges">${[2,3,4,5].map(i=>`<option ${P.prefs.maxChanges===i?'selected':''}>${i}</option>`).join('')}</select></label></div><p class="small-note">A review may propose fewer or no changes. It never removes untried recipes just because you have not chosen them. Automatic checks need the app open; missed checks run on the next visit.</p><label class="checkbox-field"><input name="hideDisliked" type="checkbox" ${P.prefs.hideDisliked?'checked':''}>Hide disliked meals when browsing the menu</label><button class="button" type="submit">Save settings</button></form></section><section class="settings-panel"><h2>Food preferences</h2><div class="rule-chips"><span>No seafood</span><span>No broccoli</span><span>No zucchini</span><span>No tofu</span><span>Gluten-free dinners</span><span>At most 2 soup / stew / chili dinners</span></div><p class="small-note">These established rules stay in force. Extra exclusions below are explicit choices, never inferred from one dislike.</p><form id="avoid-form"><label class="field">Additional ingredient exclusions<select name="avoid" multiple size="6">${Object.entries(foods).filter(([k])=>!['water','salt','pepper','oil'].includes(k)).map(([k,f])=>`<option value="${k}" ${P.prefs.avoid.includes(k)?'selected':''}>${esc(f.name)}</option>`).join('')}</select></label><p class="small-note">Desktop: hold Ctrl / Command to select multiple; click an option again with that key to remove it. Existing meals are not silently deleted. Reviews will suggest swaps for conflicts. This is a preference filter, not a complete allergy-safety system.</p><button class="button secondary" type="submit">Save exclusions</button><button class="text-button" type="button" data-k="clear-avoid">Clear extra exclusions</button></form></section><section class="settings-panel"><h2>ChatGPT Plan Connection</h2><span class="tag">Personal ChatGPT</span><p>${backendHere()?'Connect your ChatGPT subscription to power Kitchen Assistant and new AI recipe ideas. Eligible usage counts toward your ChatGPT plan, not an API-key balance. Extra High reasoning is requested when supported by the selected model.':'This website does not currently have an authorized connection to your ChatGPT plan. Signing in to ChatGPT in another tab does not connect it here.'}</p><div class="notice"><strong>${backendHere()?'Local Kitchen server detected':'ChatGPT not connected to this website'}</strong><p>${backendHere()?'Choose Continue with ChatGPT and approve ChatGPT plan usage. The sign-in tokens stay on this computer.':'In-app AI answers require an approved hosted integration and a secure connection for each person. You can prepare questions for your personal ChatGPT conversation in the Assistant tab. No API-key billing is enabled.'}</p></div>${backendHere()?`<a class="button" href="/auth/start">Continue with ChatGPT</a> <button class="button secondary small" data-k="check-ai">Check connection</button> <button class="text-button" data-k="disconnect-plan">Disconnect</button><label class="field" style="margin-top:12px">Available AI model<select id="plan-model-select"><option value="">Check connection to load models</option></select></label><button class="button secondary small" data-k="load-plan-models">Load eligible models</button> <button class="button secondary small" data-k="save-plan-model">Use selected model</button>`:`<span class="small-note">Questions are only copied when you choose. Paste and send them in ChatGPT; responses remain there.</span>`}<div id="ai-status" class="small-note" role="status"></div><label class="checkbox-field"><input id="ai-consent" type="checkbox" ${P.prefs.aiConsent?'checked':''}>Allow the assistant to use my limited food preference summary</label><label class="checkbox-field"><input id="auto-ai" type="checkbox" ${P.prefs.autoAI?'checked':''} ${!backendHere()||!P.prefs.aiConsent?'disabled':''}>Also request AI ideas during my weekly review when the app is open</label><p class="small-note">Only recipe names, ingredient keys, rating codes, category preferences, meal counts and rated restaurant dish names are shared when you consent. Free-text journal notes, pain logs and exact journal dates are not sent. The model runs at Extra High (xhigh) where supported. If your plan allowance is exhausted, this app does not switch to paid API billing. To avoid using ChatGPT credits after reaching your plan limit, disable app credit use in ChatGPT Settings → Usage.</p><a class="text-link" href="#/assistant">Open Kitchen Assistant ${icon('arrow')}</a></section><section class="settings-panel"><h2>Your data</h2><p>${P.journal.length} journal entries · ${P.madeMeals.length} Made Meals · ${P.restaurantOrders.length} restaurant orders · ${Object.keys(P.ratings).length} reviews · ${store.favorites.length} favorites · ${P.history.length} menu swaps${countCustom?' · '+countCustom+' AI recipes':''}</p><p>Everything is saved in this browser, not an account. Another device, browser, or local-file address may not share that storage. Export before switching files or clearing browser data. App records are not encrypted by this app; anyone using this browser profile may be able to read them.</p><div class="settings-actions"><button class="button" data-k="export">${icon('download')}Export backup</button><label class="button secondary import-label">Import backup<input id="backup-file" type="file" accept="application/json,.json"></label><button class="button secondary" data-k="export-journal">Export food journal CSV</button></div><p class="small-note">Backups include personal notes and discomfort check-ins. Store them privately. Import replaces this browser’s current journal, preferences, favorites and menu after confirmation.</p><p class="small-note">${P.rejected.length} new suggestions dismissed.</p><button class="text-button" data-k="clear-rejected">Make dismissed suggestions eligible again</button><details><summary>Remove personal data</summary><p>This restores the original 70-meal menu and clears journal entries, ratings, favorites, shopping and plans from this browser.</p><button class="button danger" data-k="reset-personal">Erase my kitchen data</button></details></section></div>`);
}

const assistantChat=[];
let assistantBusy=false;
function renderAssistant(){
  setPage('assistant','Kitchen Assistant',pageHead(backendHere()?'Your subscription-powered cooking helper':'Questions, with your kitchen context','Kitchen Assistant',backendHere()?'Ask about the menu, substitutions, shopping, and ways to plan meals. Live answers use your authorized ChatGPT plan only.':'Prepare a question with the meal details you choose to include.')+`
    <div class="assistant-layout"><section class="settings-panel assistant-main"><div class="assistant-status">${backendHere()?'Open Settings to connect your ChatGPT plan if needed.':'ChatGPT is not connected to this website. You can prepare a question below; replies currently stay in ChatGPT.'}</div>
    <div id="assistant-messages" class="assistant-messages" aria-live="polite">${assistantChat.length?assistantChat.map(m=>`<div class="assistant-message ${m.role}"><strong>${m.role==='user'?'You':'Kitchen Assistant'}</strong><p>${esc(m.text).replace(/\n/g,'<br>')}</p></div>`).join(''):'<p class="muted">Try “What should I make with chicken and spinach?” or “Suggest a new gluten-free dinner based on my favorites.”</p>'}</div>
    <form id="assistant-form"><label class="field">Ask a question<textarea id="assistant-question" rows="3" maxlength="1200" placeholder="Ask about a meal, substitution, or shopping..." required></textarea></label><button class="button" type="submit" ${assistantBusy?'disabled':''}>${assistantBusy?'Thinking with Extra High…':'Ask Kitchen Assistant'}</button></form><div class="small-note" id="assistant-response-status" role="status">Uses your ChatGPT plan allowance after sign-in. Does not automatically edit saved meals.</div>
    </section><aside class="settings-panel assistant-side"><h2>Quick starts</h2><div class="assistant-suggestions"><a class="button secondary small" href="#/made">Create a recipe from your meal</a><a class="button secondary small" href="#/restaurants">Compare restaurant options</a><button class="button secondary small" data-k="agent-prompt" data-prompt="Suggest three seafood-free lunch ideas using my favorite ingredients.">Suggest lunches</button><button class="button secondary small" data-k="agent-prompt" data-prompt="Help me cook a quick gluten-free dinner with chicken, rice and vegetables.">Quick dinner</button><button class="button secondary small" data-k="agent-prompt" data-prompt="Help me replace an ingredient in a recipe I disliked.">Swap an ingredient</button></div><p class="small-note">Rules stay in place: no seafood, broccoli, zucchini or tofu; gluten-free dinners; no more than two soup/stew/chili dinners. Food does not repair fishtail deformity.</p><a class="text-link" href="#/weekly">Weekly menu review ${icon('arrow')}</a><a class="text-link" href="#/settings">ChatGPT connection settings ${icon('arrow')}</a></aside></div>`);
}
async function loadPlanModels(){
  const el=document.getElementById('ai-status');if(el)el.textContent='Loading account models…';
  try{
    const r=await fetch('/api/models',{credentials:'same-origin',cache:'no-store'});const data=await r.json();if(!r.ok)throw new Error(data.error||'Could not load models.');
    const select=document.getElementById('plan-model-select');if(select){select.innerHTML=data.models.map(x=>`<option value="${esc(x.slug)}" ${x.slug===data.selected?'selected':''}>${esc(x.name)}</option>`).join('');}
    if(el)el.textContent='Models are specific to your ChatGPT plan. Extra High (xhigh) is requested for compatible models.';
  }catch(e){if(el)el.textContent=String(e.message||e);}
}
async function askKitchenQuestion(question){
  if(assistantBusy)return;
  if(!backendHere()){toast('Open the subscription package in your local browser to use ChatGPT.');return;}
  assistantChat.push({role:'user',text:question});assistantBusy=true;renderAssistant();
  const status=document.getElementById('assistant-response-status');if(status)status.textContent='Checking your plan connection…';
  try{
    const auth=await checkAI();const r=await fetch('/api/assistant',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Kitchen-CSRF':auth.csrf},body:JSON.stringify({question,profile:P.prefs.aiConsent?aiPayload():{}})});
    const data=await r.json();if(!r.ok)throw new Error(data.error||'ChatGPT request failed.');
    assistantChat.push({role:'assistant',text:data.answer||'No answer returned.'});
  }catch(e){assistantChat.push({role:'assistant',text:'Unable to complete the request: '+String(e.message||e)});}
  finally{assistantBusy=false;assistantChat.splice(0,Math.max(0,assistantChat.length-24));if(currentRoute==='assistant')renderAssistant();}
}
document.addEventListener('submit',async e=>{
  if(e.target.id!=='assistant-form')return;
  e.preventDefault();const q=(document.getElementById('assistant-question')?.value||'').trim();if(q)await askKitchenQuestion(q);
});
function aiPayload(){
  const counts=L.signalProfile(P,bySlug,store.favorites).counts;
  return {outsideSignals:P.restaurantOrders.filter(r=>['love','like','dislike'].includes(r.feedback)).slice(-50).map(r=>({kind:'restaurant',title:r.title,category:categoryForSlot(r.slot),value:r.feedback,ingredientKeys:[...new Set(P.journal.filter(e=>e.outsideId===r.id||e.id===r.sourceLogId).flatMap(e=>e.ingredients||[]))].filter(k=>foods[k]).slice(0,40)})),ratings:Object.entries(P.ratings).slice(-150).map(([s,r])=>({slug:s,title:bySlug[s].title,category:bySlug[s].category,value:r.value,reason:r.reason,ingredientKeys:r.ingredients,recipeIngredientKeys:bySlug[s].ingredients.map(i=>i.key)})),favorites:store.favorites.slice(-100).map(s=>({slug:s,title:bySlug[s].title})),recentMeals:Object.entries(counts).map(([s,count])=>({title:bySlug[s].title,category:bySlug[s].category,ingredientKeys:bySlug[s].ingredients.map(i=>i.key),count})),avoid:P.prefs.avoid,activeTitles:P.active.map(s=>bySlug[s].title),targetCategories:cats.map(c=>c.name),maxRecipes:Math.min(5,P.prefs.maxChanges)};
}
async function checkAI(){
  if(!backendHere())throw new Error('Your ChatGPT plan is not connected in this standalone HTML. Open the included subscription server, then connect in Settings.');
  const r=await fetch('/api/status',{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw new Error('This host is not running the included kitchen AI server.');const data=await r.json();if(!data.configured)throw new Error(data.message||'ChatGPT plan is not connected. Open Settings to sign in.');return data;
}
async function askAI(automatic=false){
  if(aiBusy)return;if(P.customRecipes.length>=150){toast('Your saved AI recipe collection is full (150). Existing recipes and restaurant lookups still work.');return;}if(!P.prefs.aiConsent){toast('Enable AI preference-sharing consent in Settings first.');location.hash='#/settings';return;}
  if(!automatic&&!window.confirm('Use your ChatGPT plan allowance to generate recipe ideas from limited preferences? This does not use separately billed API credits. No menu changes happen without approval.'))return;
  aiBusy=true;aiLastError=false;aiLastMessage='Requesting new recipe ideas. Your current menu will not change.';if(!automatic||currentRoute==='weekly')renderWeekly();else toast(aiLastMessage);
  let timer;
  try{
    const status=await checkAI();const controller=new AbortController();timer=setTimeout(()=>controller.abort(),120000);
    const res=await fetch('/api/recipes',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Kitchen-CSRF':status.csrf},body:JSON.stringify(aiPayload()),signal:controller.signal});
    const data=await res.json();if(!res.ok)throw new Error(data.error||'The AI request failed.');if(!Array.isArray(data.recipes)||!data.recipes.length)throw new Error('ChatGPT returned no usable recipes.');
    const accepted=[];
    data.recipes.slice(0,Math.max(0,150-P.customRecipes.length)).forEach(m=>{if(L.recipeError(m,foods,cats)||bySlug[m.slug]||meals.some(x=>x.title.toLowerCase()===m.title.toLowerCase())||m.ingredients.some(i=>P.prefs.avoid.includes(i.key)))return;m.origin='ai';m.image=illustrationImage(m);m.photoNote='AI-created recipe idea. This graphic is not a photograph of the dish.';bySlug[m.slug]=m;meals.push(m);const serial=JSON.parse(JSON.stringify(m));serial.image='illustration';P.customRecipes.push(serial);accepted.push(m);});
    if(!accepted.length)throw new Error('No returned recipes passed the ingredient, category and duplication checks. Your menu is unchanged.');
    // Keep prior approvals and history, supersede only pending suggestions.
    P.reviews.forEach(r=>r.swaps.forEach(s=>{if(s.status==='pending')s.status='stale';}));
    const r=L.review(P,meals,bySlug,cats,store.favorites);r.engine='ai';r.aiRecipeSlugs=accepted.map(m=>m.slug);
    r.suggestions=accepted.map(m=>({slug:m.slug,category:m.category,reason:'New AI-created recipe using your preference summary. It has not been kitchen-tested; preview before adding.'})).concat(r.suggestions.filter(s=>!accepted.some(m=>m.category===s.category)));
    P.reviews.push(r);P.reviews=P.reviews.slice(-250);P.prefs.nextReview=L.nextDue(L.day(),P.prefs.weekday);savePersonal();aiLastMessage=accepted.length+' new AI recipe ideas are ready. Nothing has changed in your active menu.';
  }catch(e){aiLastError=true;aiLastMessage=e.name==='AbortError'?'The ChatGPT plan request timed out. Your menu is unchanged. Local reviews still work.':String(e.message||e);}
  finally{clearTimeout(timer);aiBusy=false;if(currentRoute==='weekly')renderWeekly();else toast(aiLastMessage);}
}
function exportBackup(){const payload={application:'At-Home Kitchen',version:3,exportedAt:new Date().toISOString(),personal:P,baseStore:store};download(JSON.stringify(payload,null,2),'At-Home-Kitchen-Backup-'+L.day()+'.json','application/json');toast('Backup exported. Keep it somewhere private.');}
async function importBackup(file){
  if(!file)return;if(file.size>50000000){toast('Backup is too large. Limit: 50 MB.');return;}
  try{
    const raw=JSON.parse(await file.text());if(raw.application!=='At-Home Kitchen'||raw.version!==3)throw new Error('Unsupported backup file.');
    const incoming=ensureFoodCollections(raw.personal);const candidateMap=Object.create(null);builtins.forEach(m=>candidateMap[m.slug]=m);const incomingSlugs=new Set();
    if(!incoming||!Array.isArray(incoming.customRecipes)||incoming.customRecipes.length>150)throw new Error('Invalid recipe data.');
    for(const m of incoming.customRecipes){if(incomingSlugs.has(m.slug))throw new Error('Duplicate custom recipe ID.');incomingSlugs.add(m.slug);const err=L.recipeError(m,foods,cats);if(err)throw new Error(err);if((D.meals.concat(window.KITCHEN_CANDIDATES||[])).some(x=>x.slug===m.slug))throw new Error('A custom recipe conflicts with a built-in recipe.');candidateMap[m.slug]=m;}
    const err=L.validateState(incoming,candidateMap,cats,foods);if(err)throw new Error(err);
    const bs=raw.baseStore;if(!bs||!Array.isArray(bs.favorites)||bs.favorites.some(s=>!candidateMap[s])||!bs.shopping||typeof bs.shopping!=='object')throw new Error('Invalid favorites or shopping data.');
    for(const [s,o] of Object.entries(bs.shopping))if(!candidateMap[s]||!o||!Number.isInteger(o.servings)||o.servings<1||o.servings>12)throw new Error('Invalid shopping quantities.');
    if(!window.confirm('Replace this browser’s kitchen data with the selected backup? Export your current data first if you need to keep it.'))return;
    // Validate first, then replace. No arbitrary HTML or remote photos are imported.
    foodBusy.forEach(job=>job.controller.abort());foodMessages.clear();
    meals.splice(0,meals.length,...builtins);Object.keys(bySlug).forEach(k=>delete bySlug[k]);builtins.forEach(m=>bySlug[m.slug]=m);
    incoming.customRecipes.forEach(m=>{m.image=illustrationImage(m);meals.push(m);bySlug[m.slug]=m;});
    P=incoming;store={favorites:[...new Set(bs.favorites)],shopping:bs.shopping,checked:bs.checked||{}};
    P.customRecipes=P.customRecipes.map(m=>Object.assign({},m,{image:'illustration'}));savePersonal();saveStore();personalLoadWarning='';renderSettings();toast('Kitchen backup restored.');
  }catch(e){toast('Import stopped: '+String(e.message||e));}
}
function csvCell(x){let t=String(x===null||x===undefined?'':x);if(/^[=+@-]/.test(t))t="'"+t;return '"'+t.replace(/"/g,'""')+'"';}
function exportJournal(){const header=['Date','Meal','Food','Amount','Calories (known only)','Protein g (known only)','Source','Note'];const rows=P.journal.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(e=>[e.date,e.slot,e.title,e.kind==='menu'?(e.servings===null?'Unknown':e.servings+' recipe servings'):e.amount||'',e.nutrition&&e.nutrition.kcal,e.nutrition&&e.nutrition.protein,e.kind==='menu'?'Recipe estimate':e.nutritionSource==='reviewed_recipe_estimate'?'Reviewed recipe estimate':sourceLabel(e)+' / user entry',e.note||'']);download([header,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n'),'At-Home-Kitchen-Journal-'+L.day()+'.csv','text/csv;charset=utf-8');}

/* Made meals and restaurant records retain the original food log independently. */
function ensureFoodCollections(p) {
  if(p&&typeof p==='object'){if(p.madeMeals===undefined)p.madeMeals=[];if(p.restaurantOrders===undefined)p.restaurantOrders=[];}return p;
}
function categoryForSlot(slot){return {Breakfast:'Full Breakfasts',Lunch:'Lunches',Dinner:'Dinners',Snack:'Snacks',Drink:'Smoothies & Drinks'}[slot]||'Dinners';}
function sourceLabel(e){return e.sourceType==='made'?'Made Meals':e.sourceType==='homemade'?'Homemade':e.sourceType==='restaurant'?'Restaurant':e.kind==='menu'?'Menu recipe':'Outside the menu';}
function safeFoodUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch(_){return '';}}
function foodLink(url,label){const safe=safeFoodUrl(url);return safe?`<a class="inline-source" href="${esc(safe)}" target="_blank" rel="noopener noreferrer">${esc(label)} ${icon('external')}</a>`:`<span>${esc(label)}</span>`;}
function sourceDate(value){const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleString(undefined,{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}):'Date unavailable';}
function foodNavigation(active){return `<nav class="food-subnav" aria-label="Food workspace"><a href="#/journal" class="${active==='journal'?'active':''}">Food journal</a><a href="#/made" class="${active==='made'?'active':''}">Made Meals <span>${P.madeMeals.length}</span></a><a href="#/restaurants" class="${active==='restaurants'?'active':''}">Restaurants <span>${P.restaurantOrders.length}</span></a></nav>`;}
function foodEmpty(type){return `<section class="food-empty"><span class="food-empty-icon">${icon(type==='made'?'plate':'book')}</span><div><span class="micro">${type==='made'?'Your own creations':'Your usual order, with more options'}</span><h2>${type==='made'?'Keep the meals you make.':'Start with a meal you ordered.'}</h2><p>${type==='made'?'Describe a homemade meal in your journal. The assistant can turn that description into measured ingredients, a detailed recipe and nutrition estimates for you to review.':'Log a restaurant, location and order. You can then compare similar dishes using its menu, with sources and clear nutrition labels.'}</p><button class="button" data-work="new-outside" data-type="${type==='made'?'homemade':'restaurant'}">${icon('plus')}${type==='made'?'Log a homemade meal':'Log a restaurant meal'}</button></div></section>`;}
let foodBusy=new Map(),foodMessages=new Map();
function foodStatus(id){const pending=foodBusy.get(id),message=foodMessages.get(id);return pending?`<div class="food-request-status" role="status"><span class="food-pulse"></span><div><strong>${pending.type==='made'?'Building your recipe draft…':'Checking the menu…'}</strong><p>Extra High reasoning can take a few minutes. Your saved meal stays available.</p></div><button class="text-button" data-work="cancel-ai" data-id="${esc(id)}">Cancel</button></div>`:message?`<div class="notice ${message.error?'caution':''}" role="status">${esc(message.text)}${message.error?'<p><a href="#/settings">Check your ChatGPT connection</a></p>':''}</div>`:'';}
function foodNutrition(n,kind='Estimated per serving'){return `<div class="food-nutrition"><p class="micro">${esc(kind)}</p><div class="food-macro-grid">${[['kcal','Calories','kcal'],['protein','Protein','g'],['carbs','Carbs','g'],['fat','Fat','g'],['fiber','Fiber','g'],['sodium','Sodium','mg']].map(([k,l,u])=>`<div><span>${l}</span><strong>${n&&Number.isFinite(n[k])?Math.round(n[k]).toLocaleString():'—'}<small>${n&&Number.isFinite(n[k])?u:''}</small></strong></div>`).join('')}</div></div>`;}
function renderMadeMeals(id) {
  const record=id&&P.madeMeals.find(r=>r.id===id);
  if(id&&!record){renderNotFound();return;}
  if(record){renderMadeDetail(record);return;}
  const ready=P.madeMeals.filter(r=>r.status==='saved').length;
  setPage('made','Made Meals',pageHead('From your own kitchen','Made by you. Kept for next time.','Turn meals you describe into recipes you can review, save and cook again.',`<button class="button" data-work="new-outside" data-type="homemade">${icon('plus')}Log a homemade meal</button>`)+foodNavigation('made')+`<div class="food-section-intro"><p><strong>${ready}</strong> saved recipes · <strong>${P.madeMeals.length-ready}</strong> descriptions or drafts</p><span>Your original 70-meal menu stays intact.</span></div>`+(P.madeMeals.length?`<div class="food-record-grid">${P.madeMeals.slice().reverse().map(r=>{const m=bySlug[r.recipeSlug],n=m?nutrition(m):null;return `<article class="food-record-card"><div class="food-record-top"><span class="food-record-emblem">${icon('plate')}</span><span class="food-status-tag ${r.status}">${r.status==='saved'?'Saved recipe':r.status==='draft'?'Review your draft':'Description saved'}</span></div><p class="micro">${esc(r.category)}${r.sourceMode==='restaurant'?' · Restaurant inspired':''}</p><h2><a href="#/made/${esc(r.id)}">${esc(m?m.title:r.title)}</a></h2><p class="food-description">${esc(r.description)}</p>${m?`<div class="food-card-meta"><span>${icon('clock')}${timeLabel(m)}</span><span>${Math.round(n.kcal)} kcal est.</span></div>`:'<p class="small-note">Nutrition stays unknown until you review a recipe and its portions.</p>'}<div class="food-card-actions"><a class="button ${m?'secondary':''} small" href="#/made/${esc(r.id)}">${m?'Open meal':r.status==='draft'?'Review draft':'Create recipe'} ${icon('arrow')}</a>${m?`<button class="text-button" data-k="log" data-slug="${m.slug}">Log again</button>`:''}</div></article>`;}).join('')}</div>`:foodEmpty('made')));
}
function renderMadeDetail(r) {
  const m=bySlug[r.recipeSlug],draft=r.draft,busy=foodBusy.has(r.id);
  let content='';
  if(draft)content=madeDraftForm(r);
  else if(m)content=`<section class="panel food-saved-summary"><span class="food-status-tag saved">Saved in Made Meals</span><h2>${esc(m.title)}</h2><p>${esc(m.description)}</p>${foodNutrition(nutrition(m))}<div class="food-card-actions"><a class="button" href="#/meal/${m.slug}">Ingredients &amp; step-by-step recipe ${icon('arrow')}</a><button class="button secondary" data-k="log" data-slug="${m.slug}">${icon('plus')}Log again</button></div><div class="food-saved-tools">${favoriteButton(m,true)}<button class="button secondary" data-work="made-shopping" data-slug="${m.slug}">${icon('bag')}Add ingredients to shopping</button><button class="text-button" data-k="review-meal" data-slug="${m.slug}">Rate this meal</button><button class="text-button" data-k="manual-swap" data-slug="${m.slug}">Add to menu with a swap</button></div><label class="checkbox-field"><input type="checkbox" data-work="weekly-eligible" data-slug="${m.slug}" ${m.weeklyEligible?'checked':''}>Include this meal as an option in weekly reviews</label><p class="small-note">Your favorites stay protected. Adding a meal to the menu always replaces one from the same category after you approve.</p></section>`;
  else content=`<section class="food-empty food-draft-empty"><span class="food-empty-icon">${icon('book')}</span><div><h2>A recipe starts with your description.</h2><p>The assistant proposes ingredient amounts and cooking steps. You can correct them before saving. It does not know the exact amounts you ate unless you tell it.</p><p class="small-note">Your original food entry is already saved. You can leave and return whenever you like.</p></div></section>`;
  setPage('made',r.title,pageHead('Made Meals',m?m.title:r.title,'Your original description and your reusable recipe stay connected.',`<a class="button secondary" href="#/made">${icon('back')}All Made Meals</a>`)+foodNavigation('made')+foodStatus(r.id)+`<div class="food-detail-layout"><div class="food-detail-main">${content}</div><aside class="food-detail-side"><section class="settings-panel"><h2>Your description</h2><form id="made-description-form"><input type="hidden" name="id" value="${esc(r.id)}"><label class="field">Meal name<input name="title" maxlength="200" required value="${esc(r.title)}"></label><label class="field">What did you make?<textarea name="description" rows="7" minlength="10" maxlength="6000" required>${esc(r.description)}</textarea></label><div class="form-two"><label class="field">Category<select name="category">${cats.map(c=>`<option ${c.name===r.category?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label><label class="field">Batch servings<input name="batchServings" type="number" min="1" max="12" step="1" value="${r.batchServings||''}" placeholder="Unknown"></label></div><button class="button secondary small" type="submit" ${busy?'disabled':''}>Save description</button></form><p class="small-note">${backendHere()?'The AI receives this description, category, servings and your ingredient exclusions.':'Prepare a question using this saved description, category and servings. Review it before copying anything to ChatGPT.'} Personal journal notes and discomfort entries are not included.</p><button class="button food-full-width" data-work="generate-made" data-id="${esc(r.id)}" ${busy?'disabled':''}>${icon('leaf')}${backendHere()?(m||draft?'Create a revised draft':'Create recipe with assistant'):'Prepare recipe question'}</button>${!backendHere()?'<p class="small-note">ChatGPT is not connected here. The button prepares your question in the Assistant tab; it does not generate a recipe or send your description.</p>':'<p class="small-note">Uses your connected ChatGPT plan with Extra High reasoning.</p>'}${r.sourceLogId&&P.journal.some(e=>e.id===r.sourceLogId&&e.outsideId===r.id)?`<button class="text-button" data-work="open-source-log" data-id="${r.sourceLogId}">View original journal entry</button>`:''}</section></aside></div>`);
}
function madeDraftForm(r){
  const d=r.draft,m=d.recipe,linked=P.journal.find(e=>e.id===r.sourceLogId&&e.kind==='custom'&&e.sourceType==='homemade'&&e.outsideId===r.id);
  return `<section class="panel food-draft-panel"><span class="food-status-tag draft">Draft · review before saving</span><h2>Make this recipe yours.</h2><p>Check the proposed amounts and cooking method. These are planning estimates, not a reconstruction of the exact meal you ate.</p>${[['assumptions','Proposed assumptions'],['substitutions','Changes from your description'],['questions','Details to check']].map(([key,label])=>(d[key]||[]).length?`<div class="food-review-note"><h3>${label}</h3><ul>${d[key].map(s=>`<li>${esc(s)}</li>`).join('')}</ul></div>`:'').join('')}<form id="made-review-form"><input type="hidden" name="id" value="${esc(r.id)}"><label class="field">Recipe title<input name="title" maxlength="110" minlength="3" required value="${esc(m.title)}"></label><div class="food-recipe-summary"><span>${esc(m.category)}</span><span>${m.baseServings} servings per batch</span><span>${m.totalMinutes} minutes, approx.</span></div><h3>Ingredients</h3><p class="small-note">Editable weights below are <strong>per serving</strong>. The saved recipe will also show the whole-batch amounts. Use the description to request a different ingredient or batch size, then create a revised draft.</p><div class="food-ingredient-review">${m.ingredients.map((i,index)=>`<label><span>${esc(foods[i.key].name)}${i.optional?' (optional)':''}</span><span class="food-weight"><input name="grams-${index}" type="number" min="0.01" max="1500" step="any" required value="${i.gramsPerServing}" aria-label="${esc(foods[i.key].name)} grams per serving">g</span></label>`).join('')}</div><div id="made-draft-nutrition">${foodNutrition(nutrition(m))}</div><p class="small-note">${esc(d.nutritionBasis)} Optional honey is excluded from these estimates unless selected when you cook or log the recipe.</p><h3>Step-by-step method</h3><p class="small-note">Read each step and correct any details that do not match how you want to make this dish. If you change an ingredient amount above, update any matching quantities in the method too.</p><div class="food-step-editors">${m.steps.map((step,i)=>`<label class="field"><span><b>${i+1}</b>${esc(m.stepTitles[i])}</span><textarea name="step-${i}" rows="3" minlength="15" maxlength="2000" required>${esc(step)}</textarea></label>`).join('')}</div><label class="checkbox-field food-confirm"><input name="confirmed" type="checkbox" required>I reviewed the ingredient amounts, assumptions, substitutions and cooking steps.</label><label class="checkbox-field"><input name="weeklyEligible" type="checkbox">Make this recipe available for weekly menu suggestions</label>${linked&&r.sourceMode==='homemade'?`<details class="food-log-estimate"><summary>Optionally add this estimate to the original food log</summary><p class="small-note">Do this only if this recipe matches what you actually ate. Your original food name, description and amount are preserved. Existing entered nutrition will be replaced only if you select this box.</p><label class="checkbox-field"><input name="applyEstimate" type="checkbox">Use this recipe estimate for that journal entry</label><label class="field">Recipe servings you actually ate<input name="eatenServings" type="number" min="0.25" max="12" step="0.25" placeholder="Required only if applying the estimate"></label></details>`:''}<div class="dialog-actions"><button class="button" type="submit">${icon('check')}Save to Made Meals</button><button class="text-button" type="button" data-work="discard-draft" data-id="${r.id}">Discard draft</button></div></form></section>`;
}
function renderRestaurants(id){
  const r=id&&P.restaurantOrders.find(x=>x.id===id);if(id&&!r){renderNotFound();return;}
  if(r){renderRestaurantDetail(r);return;}
  setPage('restaurants','Restaurants',pageHead('Eating out, thoughtfully','Keep your order. Find your options.','Save restaurant meals and compare similar dishes when you want something different.',`<button class="button" data-work="new-outside" data-type="restaurant">${icon('plus')}Log a restaurant meal</button>`)+foodNavigation('restaurants')+(P.restaurantOrders.length?`<div class="food-record-grid">${P.restaurantOrders.slice().reverse().map(x=>`<article class="food-record-card restaurant-card"><div class="food-record-top"><span class="food-record-emblem">${icon('book')}</span><span class="food-status-tag ${x.analysis&&x.analysis.status==='ready'?'saved':''}">${x.analysis&&x.analysis.status==='ready'?'Options ready':'Order saved'}</span></div><p class="micro">${esc(x.restaurant)}${x.location?' · '+esc(x.location):''}</p><h2><a href="#/restaurant/${x.id}">${esc(x.title)}</a></h2><p class="food-description">${esc(x.description)}</p>${x.feedback?`<span class="rating-label ${x.feedback}">${{love:'Loved this order',like:'Liked this order',dislike:'Would not order again'}[x.feedback]}</span>`:''}<div class="food-card-actions"><a class="button secondary small" href="#/restaurant/${x.id}">Order &amp; similar options ${icon('arrow')}</a></div></article>`).join('')}</div>`:foodEmpty('restaurants')));
}
function renderRestaurantDetail(r){
  const busy=foodBusy.has(r.id),a=r.analysis;
  setPage('restaurants',r.restaurant,pageHead('Restaurants',r.restaurant,r.location||'Your saved order and sourced alternatives.',`<a class="button secondary" href="#/restaurants">${icon('back')}All restaurants</a>`)+foodNavigation('restaurants')+foodStatus(r.id)+`<div class="food-detail-layout"><div class="food-detail-main"><section class="panel food-original-order"><span class="micro">What you actually ordered</span><h2>${esc(r.title)}</h2><p class="food-order-description">${esc(r.description)}</p><div class="food-order-facts"><span><strong>Amount</strong>${esc(r.amount||'Not specified')}</span><span><strong>Customizations</strong>${esc(r.modifications||'None recorded')}</span></div><div class="rating-controls" role="group" aria-label="Rate this restaurant order">${[['love','Love it'],['like','Like it'],['dislike','Dislike']].map(([v,l])=>`<button class="rating-button ${v}" data-work="restaurant-rate" data-id="${r.id}" data-value="${v}" aria-pressed="${r.feedback===v}">${l}</button>`).join('')}<button class="text-button" data-work="restaurant-rate" data-id="${r.id}" data-value="">Clear</button></div><div class="food-saved-tools"><button class="button secondary small" data-work="restaurant-relog" data-id="${r.id}">${icon('plus')}Log this order again</button><button class="button secondary small" data-work="make-at-home" data-id="${r.id}">Make this at home</button>${r.sourceLogId&&P.journal.some(e=>e.id===r.sourceLogId&&e.outsideId===r.id)?`<button class="text-button" data-work="open-source-log" data-id="${r.sourceLogId}">Original food log</button>`:''}</div><p class="small-note">Suggestions below never replace this order in your journal. Feedback is about this meal, not every food or ingredient at the restaurant.</p></section><section class="food-restaurant-options"><div class="section-heading"><h2>Similar options to consider</h2>${a?`<span class="small-note">Checked ${esc(sourceDate(a.checkedAt))}</span>`:''}</div>${a?restaurantAnalysisHTML(a):`<div class="food-empty compact"><div><h3>Start with the restaurant’s menu.</h3><p>The assistant compares similar dishes and explains the trade-offs. It uses published nutrition when available, and leaves unknown figures blank.</p><button class="button" data-work="analyze-restaurant" data-id="${r.id}" ${busy?'disabled':''}>${backendHere()?'Find similar options':'Prepare menu comparison'} ${icon('arrow')}</button></div></div>`}</section></div><aside class="food-detail-side"><section class="settings-panel"><h2>Menu &amp; order details</h2><form id="restaurant-details-form"><input type="hidden" name="id" value="${r.id}"><label class="field">Restaurant<input name="restaurant" maxlength="180" value="${esc(r.restaurant)}" required></label><label class="field">Location / branch<input name="location" maxlength="200" value="${esc(r.location)}" placeholder="City or branch"></label><label class="field">Meal name<input name="title" maxlength="200" value="${esc(r.title)}" required></label><label class="field">Your order<textarea name="description" rows="4" maxlength="6000" required>${esc(r.description)}</textarea></label><label class="field">Customizations<input name="modifications" maxlength="1000" value="${esc(r.modifications)}"></label><label class="field">Amount<input name="amount" maxlength="120" value="${esc(r.amount)}"></label><label class="field">Meal<select name="slot">${['Breakfast','Lunch','Dinner','Snack','Drink'].map(x=>`<option ${r.slot===x?'selected':''}>${x}</option>`).join('')}</select></label><label class="field">Official menu link (optional)<input name="menuUrl" type="url" maxlength="2000" value="${esc(r.menuUrl)}" placeholder="https://restaurant.example/menu"></label><label class="field">Paste menu or nutrition text (optional)<textarea name="menuText" maxlength="30000" rows="6" placeholder="If the online menu is unavailable, paste its dishes, ingredients and any published nutrition here.">${esc(r.menuText)}</textarea></label><button class="button secondary small" type="submit" ${busy?'disabled':''}>Save details</button></form><p class="small-note">Save changes first. ${backendHere()?'Only this order, restaurant details, menu text and food preferences are sent to the assistant.':'The button prepares your order and menu details for review in the Assistant tab. Nothing is sent automatically; replies currently stay in ChatGPT.'}</p><button class="button food-full-width" data-work="analyze-restaurant" data-id="${r.id}" ${busy?'disabled':''}>${backendHere()?(a?'Check menu again':'Find similar options'):'Prepare menu comparison'}</button><p class="small-note">The assistant considers similarity, vegetables, fiber, protein, sodium and saturated fat when evidence is available. A lower calorie count alone does not decide the recommendation.</p></section></aside></div>`);
}
function restaurantAnalysisHTML(a){
  return `<div class="food-analysis-summary"><span class="food-status-tag ${a.status==='ready'?'saved':''}">${a.menuVerified?'Live menu sources':a.status==='ready'?'Based on supplied menu':'Menu needed'}</span><p>${esc(a.summary)}</p>${a.questions&&a.questions.length?`<ul>${a.questions.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}${a.status==='needs_menu'?'<p>Add an official menu link or paste the menu in the panel, save it, then select <strong>Find similar options</strong>.</p>':''}</div>${(a.options||[]).map(o=>`<article class="food-option-card"><h3>${esc(o.title)}</h3><p>${esc(o.description)}</p><dl><div><dt>Similar to your order</dt><dd>${esc(o.whySimilar)}</dd></div><div><dt>Why consider it</dt><dd>${esc(o.whySuggested)}</dd></div></dl>${foodNutrition(o.nutrition,o.nutritionStatus==='published'?'Menu-reported · check source and serving':'Nutrition not published / verified')}<p class="small-note">${esc(o.nutritionNote)}</p>${o.cautions.length?`<ul class="food-option-cautions">${o.cautions.map(c=>`<li>${esc(c)}</li>`).join('')}</ul>`:''}<div class="food-source-links">${o.sourceIds.map(id=>a.sources.find(s=>s.id===id)).filter(Boolean).map(s=>foodLink(s.url,s.title)).join('')}</div></article>`).join('')}${a.sources&&a.sources.length?`<section class="food-source-panel"><h3>Menu sources</h3>${a.sources.map(s=>`<div>${foodLink(s.url,s.title)}<small>${s.kind==='live_menu'?'Retrieved online':'Provided by you'} · ${esc(sourceDate(s.checkedAt))}</small></div>`).join('')}<p class="small-note">Availability and portions can vary by branch. Confirm ingredients and gluten-free preparation with the restaurant.</p></section>`:''}`;
}
async function foodRequest(endpoint,payload,id,type){
  if(foodBusy.has(id))return null;
  if(!backendHere())throw new Error('AI is available in the local Kitchen app after connecting ChatGPT in Settings. Your saved meal is still available offline.');
  const controller=new AbortController();foodBusy.set(id,{controller,type});foodMessages.delete(id);refreshFoodPage(id);
  const timer=setTimeout(()=>controller.abort(),240000);
  try{
    const statusResponse=await fetch('/api/status',{credentials:'same-origin',cache:'no-store',signal:controller.signal});
    if(!statusResponse.ok)throw new Error('The Kitchen AI server is not responding. Reopen the Kitchen launcher.');
    const auth=await statusResponse.json();if(!auth.configured)throw new Error(auth.message||'Connect your ChatGPT plan in Settings to use the assistant.');
    const response=await fetch(endpoint,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Kitchen-CSRF':auth.csrf},body:JSON.stringify(payload),signal:controller.signal});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'The assistant could not complete this request. Your meal is saved.');return data;
  }catch(e){if(e.name==='AbortError')throw new Error('Request stopped or timed out. Your original meal is saved; you can try again.');throw e;}
  finally{clearTimeout(timer);foodBusy.delete(id);}
}
function refreshFoodPage(id){if(currentRoute==='made'&&location.hash.endsWith('/'+id))renderMadeMeals(id);else if(currentRoute==='restaurants'&&location.hash.endsWith('/'+id))renderRestaurants(id);}
async function generateMade(id){
  const r=P.madeMeals.find(x=>x.id===id);if(!r||foodBusy.has(id))return;
  if(!backendHere()){
    const question=['Meal name: '+r.title,'What I made:',r.description,'Category: '+r.category,'Whole recipe servings: '+(r.batchServings||'Unknown — ask me before estimating'),'', 'Help turn this description into a reproducible recipe. Ask about missing quantities, give detailed cooking steps, and label nutrition as estimated. Do not assume a new draft exactly matches the food I already logged.'].join('\n');
    if(window.KitchenChatGPTBridge?.prepareTask({task:'homemade',question}))return;
    foodMessages.set(id,{error:true,text:'ChatGPT is not connected here. Your description is saved. Open Assistant to prepare a question for your personal ChatGPT conversation.'});refreshFoodPage(id);return;
  }
  if(P.customRecipes.length>=150){foodMessages.set(id,{error:true,text:'The saved AI recipe limit is 150. Existing recipes and food logs still work; export a backup before managing your collection.'});refreshFoodPage(id);return;}
  const before=r.updatedAt;
  try{
    const data=await foodRequest('/api/made-meal',{description:r.description,title:r.title,category:r.category,servings:r.batchServings||undefined,sourceMode:r.sourceMode,avoid:P.prefs.avoid},id,'made');
    if(!data)return;const d=data.draft;if(!d||L.recipeError(d.recipe,foods,cats))throw new Error('The draft did not contain a complete recipe that matches your food preferences. Please add more detail and try again.');
    if(r.updatedAt!==before)throw new Error('Your description changed while the draft was being made. Create a new draft from the saved description.');
    const next=Object.assign({},r,{draft:d,status:'draft',updatedAt:new Date().toISOString()});
    const validation=L.madeMealError?L.madeMealError(next,bySlug,cats,foods):'';if(validation)throw new Error('The returned draft could not be safely saved: '+validation);
    Object.assign(r,next);savePersonal();foodMessages.set(id,{text:'Draft ready. Review the proposed quantities and steps before saving.'});
  }catch(e){foodMessages.set(id,{error:true,text:String(e.message||e)});}
  refreshFoodPage(id);
}
async function analyzeRestaurant(id){
  const r=P.restaurantOrders.find(x=>x.id===id);if(!r||foodBusy.has(id))return;const before=r.updatedAt;
  if(!backendHere()){
    const question=['Restaurant: '+r.restaurant,'Branch or location: '+(r.location||'Not specified'),'Meal name: '+r.title,'What I ordered:',r.description,'Customizations: '+(r.modifications||'None recorded'),'Amount eaten: '+(r.amount||'Unknown'),'Meal category: '+categoryForSlot(r.slot),r.menuUrl?'Official menu link: '+r.menuUrl:'',r.menuText?'Menu or nutrition text I provided:\n'+r.menuText:'','Compare two or three similar choices using the actual menu and explain the trade-offs. Cite menu sources, distinguish published nutrition from estimates, and leave unavailable values unknown. Keep my original order separate from suggestions.'].filter(Boolean).join('\n');
    if(window.KitchenChatGPTBridge?.prepareTask({task:'restaurant',question}))return;
    foodMessages.set(id,{error:true,text:'ChatGPT is not connected here. Your order is saved. Open Assistant to prepare a question for your personal ChatGPT conversation.'});refreshFoodPage(id);return;
  }
  try{
    const data=await foodRequest('/api/restaurant-options',{restaurant:r.restaurant,location:r.location,order:r.description,modifications:r.modifications,amount:r.amount,category:categoryForSlot(r.slot),menuUrl:r.menuUrl,menuText:r.menuText,preferences:{avoid:P.prefs.avoid}},id,'restaurant');
    if(!data)return;const a=data.analysis;const error=L.restaurantAnalysisError?L.restaurantAnalysisError(a):!a?'No restaurant analysis returned.':'';if(error)throw new Error('The menu comparison could not be safely saved: '+error);
    if(r.updatedAt!==before)throw new Error('Your restaurant details changed during the lookup. Check the menu again using the saved details.');
    r.analysis=a;r.updatedAt=new Date().toISOString();savePersonal();foodMessages.set(id,{text:a.status==='ready'?'Menu comparison saved. Your original food log is unchanged.':'More menu information is needed. Add a link or paste the menu below.'});
  }catch(e){foodMessages.set(id,{error:true,text:String(e.message||e)});}
  refreshFoodPage(id);
}
function saveOutsideRecord(entry,fd,previous){
  const type=String(fd.get('sourceType')||'homemade');entry.sourceType=type;
  if(type==='custom')return '';
  const description=String(fd.get('description')||'').trim(),category=String(fd.get('category')||categoryForSlot(entry.slot));
  if(description.length<(type==='homemade'?10:3))return 'Add a little more detail about the ingredients or your restaurant order.';
  if(!cats.some(c=>c.name===category))return 'Choose a recipe category.';
  const now=new Date().toISOString();
  if(type==='homemade'){
    const batch=fd.get('batchServings')===''?null:Number(fd.get('batchServings'));if(batch!==null&&(!Number.isInteger(batch)||batch<1||batch>12))return 'Use 1–12 batch servings, or leave that field blank.';
    let record=previous&&previous.sourceType==='homemade'&&P.madeMeals.find(r=>r.id===previous.outsideId);
    if(!record&&P.madeMeals.length>=500)return 'Your Made Meals collection is full (500 records). Export a backup before managing it.';
    if(!record){record={id:L.id('made'),createdAt:now,sourceMode:'homemade',status:'logged',recipeSlug:'',draft:null};P.madeMeals.push(record);}
    if(record.description!==description||record.category!==category||record.batchServings!==batch){record.draft=null;record.status=record.recipeSlug?'saved':'logged';}
    Object.assign(record,{title:entry.title,description,category,sourceLogId:entry.id,amount:entry.amount,batchServings:batch,updatedAt:now});entry.outsideId=record.id;
  }else if(type==='restaurant'){
    const restaurant=String(fd.get('restaurant')||'').trim();if(!restaurant)return 'Enter the restaurant name.';
    let record=previous&&previous.sourceType==='restaurant'&&P.restaurantOrders.find(r=>r.id===previous.outsideId);
    if(!record&&P.restaurantOrders.length>=1000)return 'Your Restaurants collection is full (1,000 orders). Export a backup before managing it.';
    if(!record){record={id:L.id('restaurant'),createdAt:now,menuUrl:'',menuText:'',feedback:'',analysis:null};P.restaurantOrders.push(record);}
    const location=String(fd.get('location')||'').trim(),modifications=String(fd.get('modifications')||'').trim();
    if(record.description!==description||record.restaurant!==restaurant||record.location!==location||record.modifications!==modifications||record.amount!==entry.amount||record.slot!==entry.slot)record.analysis=null;
    Object.assign(record,{restaurant,location,title:entry.title,description,amount:entry.amount,modifications,slot:entry.slot,sourceLogId:entry.id,updatedAt:now});entry.outsideId=record.id;
  }else return 'Choose Homemade meal or Restaurant meal.';
  return '';
}
document.addEventListener('click',async e=>{
  const el=e.target.closest('[data-work]');if(!el)return;const action=el.dataset.work,id=el.dataset.id;
  if(action==='log-tab'){
    const kind=el.dataset.value;document.getElementById('log-kind').value=kind;
    document.getElementById('menu-log-fields').hidden=kind!=='menu';document.getElementById('custom-log-fields').hidden=kind==='menu';document.getElementById('log-rate-field').hidden=kind!=='menu';
    document.querySelectorAll('[data-work="log-tab"]').forEach(b=>{b.classList.toggle('selected',b.dataset.value===kind);b.setAttribute('aria-pressed',String(b.dataset.value===kind));});return;
  }
  if(action==='new-outside'){logDialog('','','',el.dataset.type);return;}
  if(action==='generate-made'){await generateMade(id);return;}
  if(action==='analyze-restaurant'){await analyzeRestaurant(id);return;}
  if(action==='cancel-ai'){foodBusy.get(id)?.controller.abort();return;}
  if(action==='discard-draft'){const r=P.madeMeals.find(x=>x.id===id);if(r){r.draft=null;r.status=r.recipeSlug?'saved':'logged';r.updatedAt=new Date().toISOString();savePersonal();foodMessages.delete(id);renderMadeMeals(id);}return;}
  if(action==='made-shopping'){const m=bySlug[el.dataset.slug];if(m){store.shopping[m.slug]={servings:m.baseServings,milk:'milk',honey:false};saveStore();toast('Recipe batch ingredients added to Shopping.');renderHeader('made');}return;}
  if(action==='open-source-log'){const entry=P.journal.find(x=>x.id===id);if(entry){journalDate=entry.date;location.hash='#/journal';renderJournal();}return;}
  if(action==='restaurant-rate'){const r=P.restaurantOrders.find(x=>x.id===id);if(r&&['','love','like','dislike'].includes(el.dataset.value)){r.feedback=el.dataset.value;savePersonal();renderRestaurantDetail(r);toast('Order feedback saved.');}return;}
  if(action==='restaurant-relog'){
    const r=P.restaurantOrders.find(x=>x.id===id);if(!r)return;
    logDialog('','','','restaurant');const f=document.getElementById('log-form');for(const key of ['title','description','restaurant','location','amount','modifications','slot'])f.elements[key].value=r[key]||'';f.elements.category.value=categoryForSlot(r.slot);return;
  }
  if(action==='make-at-home'){
    const r=P.restaurantOrders.find(x=>x.id===id);if(!r)return;if(P.madeMeals.length>=500){toast('Your Made Meals collection is full.');return;}
    const now=new Date().toISOString(),m={id:L.id('made'),createdAt:now,updatedAt:now,title:r.title+' · home version',description:`Make a home-cooked version inspired by this order at ${r.restaurant}: ${r.description}${r.modifications?' Customizations: '+r.modifications:''}. This is a new recipe, not the restaurant’s verified recipe.`,category:categoryForSlot(r.slot),sourceLogId:'',sourceMode:'restaurant',amount:'',batchServings:null,status:'logged',recipeSlug:'',draft:null};
    m.title=m.title.slice(0,200);m.description=m.description.slice(0,6000);P.madeMeals.push(m);savePersonal();location.hash='#/made/'+m.id;toast('Home-version description saved. Create and review its recipe in Made Meals.');return;
  }
});
document.addEventListener('change',e=>{
  const el=e.target;
  if(el.id==='outside-kind'){const type=el.value;document.getElementById('restaurant-log-fields').hidden=type!=='restaurant';document.getElementById('homemade-log-fields').hidden=type==='restaurant';document.getElementById('outside-explainer').textContent=type==='restaurant'?'Your original order is saved in Restaurants. Find similar options there when you want a menu comparison.':type==='custom'?'This existing journal entry stays outside the menu. Choose Homemade or Restaurant to give it its own saved page.':'Your description is saved in Made Meals. Create and review its recipe there when you are ready.';}
  if(el.id==='food-log-slot'){const category=document.getElementById('outside-category');if(category)category.value=categoryForSlot(el.value);}
  if(el.dataset.work==='weekly-eligible'){const m=bySlug[el.dataset.slug],serial=P.customRecipes.find(x=>x.slug===el.dataset.slug);if(m&&serial){m.weeklyEligible=el.checked;serial.weeklyEligible=el.checked;savePersonal();toast(el.checked?'Available as an option in weekly reviews.':'Removed from future weekly suggestions. Existing menu entries are unchanged.');}}
});
document.addEventListener('input',e=>{
  const form=e.target.closest('#made-review-form');if(!form||!e.target.name.startsWith('grams-'))return;
  const r=P.madeMeals.find(x=>x.id===form.elements.id.value);if(!r||!r.draft)return;
  const m=JSON.parse(JSON.stringify(r.draft.recipe));m.ingredients.forEach((i,j)=>{const n=Number(form.elements['grams-'+j].value);i.gramsPerServing=Number.isFinite(n)&&n>0&&n<=1500?n:0;});
  document.getElementById('made-draft-nutrition').innerHTML=foodNutrition(nutrition(m));
});
document.addEventListener('submit',e=>{
  const f=e.target;if(!['made-description-form','made-review-form','restaurant-details-form'].includes(f.id))return;e.preventDefault();const fd=new FormData(f),id=String(fd.get('id')||'');
  if(f.id==='made-description-form'){
    const r=P.madeMeals.find(x=>x.id===id);if(!r||foodBusy.has(id))return;const title=String(fd.get('title')||'').trim(),description=String(fd.get('description')||'').trim(),category=String(fd.get('category')||''),batch=fd.get('batchServings')===''?null:Number(fd.get('batchServings'));
    if(!title||title.length>200||description.length<10||description.length>6000||!cats.some(c=>c.name===category)||batch!==null&&(!Number.isInteger(batch)||batch<1||batch>12)){formError(f,'Provide a meal name, a description of at least 10 characters, a category and optional 1–12 batch servings.');return;}
    Object.assign(r,{title,description,category,batchServings:batch,draft:null,status:r.recipeSlug?'saved':'logged',updatedAt:new Date().toISOString()});savePersonal();foodMessages.delete(id);renderMadeMeals(id);toast('Description saved. Your original journal entry is unchanged.');return;
  }
  if(f.id==='made-review-form'){
    const r=P.madeMeals.find(x=>x.id===id);if(!r||!r.draft)return;if(!fd.has('confirmed')){formError(f,'Review the proposed quantities and method, then check the confirmation box.');return;}if(P.customRecipes.length>=150){formError(f,'Your saved AI recipe collection is full (150). Export a backup before managing it.');return;}
    const m=JSON.parse(JSON.stringify(r.draft.recipe));m.slug=L.id('made');m.origin='made';m.weeklyEligible=fd.has('weeklyEligible');m.title=String(fd.get('title')||'').trim();m.ingredients.forEach((i,j)=>{i.gramsPerServing=Number(fd.get('grams-'+j));});m.steps=m.steps.map((s,j)=>String(fd.get('step-'+j)||'').trim());
    const error=L.recipeError(m,foods,cats);if(error){formError(f,error);return;}
    const apply=fd.has('applyEstimate'),eaten=Number(fd.get('eatenServings')),entry=P.journal.find(x=>x.id===r.sourceLogId&&x.kind==='custom'&&x.sourceType==='homemade'&&x.outsideId===r.id);
    if(apply&&(r.sourceMode!=='homemade'||!entry||!Number.isFinite(eaten)||eaten<.25||eaten>12)){formError(f,'Enter 0.25–12 recipe servings actually eaten before applying the estimate.');return;}
    m.image=illustrationImage(m);m.photoNote='Created from your meal description. This graphic is not a food photograph.';m.nutritionDefault=nutrition(m);bySlug[m.slug]=m;meals.push(m);P.customRecipes.push(Object.assign({},m,{image:'illustration'}));r.recipeSlug=m.slug;r.status='saved';r.draft=null;r.updatedAt=new Date().toISOString();
    if(apply){entry.nutrition=Object.fromEntries(L.keysN.map(k=>[k,Math.round(m.nutritionDefault[k]*eaten*100)/100]));entry.ingredients=m.ingredients.map(i=>i.key);entry.nutritionSource='reviewed_recipe_estimate';entry.updatedAt=new Date().toISOString();}
    savePersonal();foodMessages.set(id,{text:'Recipe saved. '+(apply?'Your confirmed estimate was added to the linked journal entry.':'Your original food log is unchanged.')});renderMadeMeals(id);return;
  }
  if(f.id==='restaurant-details-form'){
    const r=P.restaurantOrders.find(x=>x.id===id);if(!r||foodBusy.has(id))return;const next={...r};for(const key of ['restaurant','location','title','description','modifications','amount','slot','menuUrl','menuText'])next[key]=String(fd.get(key)||'').trim();
    if(next.menuUrl&&!safeFoodUrl(next.menuUrl)){formError(f,'Use a public HTTPS menu link, or leave it blank and paste the menu text.');return;}
    next.analysis=null;next.updatedAt=new Date().toISOString();const error=L.restaurantOrderError?L.restaurantOrderError(next):!next.restaurant||!next.title||!next.description?'Enter the restaurant, meal name and order.':'';if(error){formError(f,error);return;}
    Object.assign(r,next);savePersonal();foodMessages.delete(id);renderRestaurantDetail(r);toast('Restaurant details saved. The original journal entry is unchanged.');return;
  }
});

/* Personalization event handlers. All user-facing changes are explicit. */
document.addEventListener('click',async e=>{
  const el=e.target.closest('[data-k]');if(!el)return;
  const k=el.dataset.k,s=el.dataset.slug;
  if(k==='close-dialog'){closeDialog();return;}
  if(k==='log'){logDialog(s||'');return;}
  if(k==='log-reset-choices'){refreshLogCustomizations(true);toast('Recipe defaults restored for this entry. Select Remember to use them next time.');return;}
  if(k==='edit-log'){logDialog('',el.dataset.id);return;}
  if(k==='delete-log'){
    const ent=P.journal.find(x=>x.id===el.dataset.id);if(ent&&window.confirm('Remove this entry from your food journal?')){P.journal=P.journal.filter(x=>x.id!==ent.id);P.plans.forEach(p=>{if(p.entryId===ent.id){p.completed=false;delete p.entryId;}});savePersonal();renderJournal();toast('Food entry removed.');}return;
  }
  if(k==='journal-day'){const d=L.move(journalDate,Number(el.dataset.delta));if(d<=L.day()&&d>='2000-01-01'){journalDate=d;renderJournal();}return;}
  if(k==='journal-today'){journalDate=L.day();renderJournal();return;}
  if(k==='journal-select'){journalDate=el.dataset.date;renderJournal();return;}
  if(k==='rate'){
    if(el.dataset.value==='dislike'){reviewMealDialog(s,'dislike');return;}
    if(setRating(s,el.dataset.value)){refreshCurrent();toast(el.dataset.value==='love'?'Loved and saved to favorites.':'Meal marked liked.');}return;
  }
  if(k==='review-meal'){reviewMealDialog(s);return;}
  if(k==='clear-rating'){delete P.ratings[s];savePersonal();refreshCurrent();toast('Rating cleared. Favorites are separate.');return;}
  if(k==='toggle-hide'){P.prefs.hideDisliked=!P.prefs.hideDisliked;savePersonal();el.setAttribute('aria-pressed',String(P.prefs.hideDisliked));renderResults();return;}
  if(k==='plan'){planDialog(s);return;}
  if(k==='delete-plan'){P.plans=P.plans.filter(p=>p.id!==el.dataset.id);savePersonal();refreshCurrent();toast('Plan removed. Shopping items remain until you change them.');return;}
  if(k==='eat-plan'){
    const p=P.plans.find(p=>p.id===el.dataset.id);if(!p||p.completed||p.date>L.day())return;
    journalDate=p.date;logDialog(p.slug,'',p.id);const form=document.getElementById('log-form');form.elements.servings.value='1';toast('Confirm how many servings you actually ate.');return;
  }
  if(k==='run-review'){runLocalReview(true);renderWeekly();return;}
  if(k==='approve-swap'){
    const r=P.reviews.find(x=>x.id===el.dataset.review);const swap=r&&r.swaps.find(x=>x.id===el.dataset.id);if(!swap||swap.status!=='pending'){toast('That suggestion is no longer pending.');return;}
    if(applySwap(swap.from,swap.to,'weekly',r.id,swap.id)){renderWeekly();toast('Swap approved. The previous meal is in your archive.');}else renderWeekly();return;
  }
  if(k==='skip-swap'){
    const r=P.reviews.find(x=>x.id===el.dataset.review),swap=r&&r.swaps.find(x=>x.id===el.dataset.id);if(swap&&swap.status==='pending'){swap.status='skipped';savePersonal();renderWeekly();toast('Original meal kept. This is not a dislike of the new idea.');}return;
  }
  if(k==='manual-swap'){swapDialog(s);return;}
  if(k==='reject-idea'){
    if(!P.rejected.includes(s))P.rejected.push(s);savePersonal();renderWeekly();toast('Suggestion hidden. This does not create an ingredient restriction.');return;
  }
  if(k==='clear-avoid'){P.prefs.avoid=[];savePersonal();renderSettings();toast('Additional exclusions cleared. Your established food rules remain.');return;}
  if(k==='ai-review'){await askAI();return;}
  if(k==='clear-rejected'){P.rejected=[];savePersonal();renderSettings();toast('Dismissed ideas may be suggested again.');return;}

  if(k==='agent-prompt'){const q=el.dataset.prompt||'';if(currentRoute!=='assistant')location.hash='#/assistant';if(q)await askKitchenQuestion(q);return;}
  if(k==='load-plan-models'){await loadPlanModels();return;}
  if(k==='save-plan-model'){
    try{const status=await checkAI();const model=document.getElementById('plan-model-select')?.value;
      const r=await fetch('/api/model',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Kitchen-CSRF':status.csrf},body:JSON.stringify({model})});const data=await r.json();if(!r.ok)throw new Error(data.error||'Model selection failed.');
      document.getElementById('ai-status').textContent='Selected '+data.model+' with Extra High reasoning (where supported).';
    }catch(e){const text=document.getElementById('ai-status');if(text)text.textContent=String(e.message||e);}return;
  }
  if(k==='disconnect-plan'){
    if(!window.confirm('Disconnect the ChatGPT plan from this computer? Your saved recipes and food journal will remain.'))return;
    try{const r=await fetch('/api/status');const auth=await r.json();const out=await fetch('/auth/logout',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Kitchen-CSRF':auth.csrf},body:'{}'});const response=await out.json();if(!out.ok)throw new Error(response.error||'Sign-out failed.');toast(response.message||'Disconnected.');renderSettings();}catch(e){toast(String(e.message||e));}return;
  }
  if(k==='check-ai'){
    const status=document.getElementById('ai-status');if(status)status.textContent='Checking the local connection…';
    try{const res=await checkAI();if(status)status.textContent='Connected to ChatGPT plan: '+(res.account||'your account')+'. Extra High reasoning requested. No API-key billing.';await loadPlanModels();}catch(err){if(status)status.textContent=err.message;}return;
  }
  if(k==='export'){exportBackup();return;}
  if(k==='export-journal'){exportJournal();return;}
  if(k==='reset-personal'){
    if(window.confirm('Erase all journal entries, notes, ratings, favorites, shopping and plans in this browser? Export a backup first.')){
      foodBusy.forEach(job=>job.controller.abort());foodMessages.clear();meals.splice(0,meals.length,...builtins);Object.keys(bySlug).forEach(k=>delete bySlug[k]);builtins.forEach(m=>bySlug[m.slug]=m);P=ensureFoodCollections(L.fresh(D.meals.map(m=>m.slug)));store={favorites:[],shopping:{},checked:{}};savePersonal();saveStore();personalLoadWarning='';location.hash='#/menu';route();toast('Personal data cleared; the original menu is restored.');
    }return;
  }
});
document.addEventListener('change',e=>{
  const el=e.target;
  if(el.id==='journal-date'&&L.validDate(el.value)&&el.value<=L.day()&&el.value>='2000-01-01'){journalDate=el.value;renderJournal();}
  if(el.id==='log-kind'){
    document.getElementById('menu-log-fields').hidden=el.value!=='menu';document.getElementById('custom-log-fields').hidden=el.value==='menu';document.getElementById('log-rate-field').hidden=el.value!=='menu';
  }
  if(el.id==='log-slug'){
    const m=bySlug[el.value];if(m){
      document.getElementById('log-form').elements.slot.value=slotFor(m);
      const outsideCategory=document.getElementById('outside-category');
      if(outsideCategory)outsideCategory.value=m.category;
    }
    refreshLogCustomizations();
  }
  if(el.getAttribute('data-log-custom')){
    const f=document.getElementById('log-form');
    if(f&&el.getAttribute('data-log-custom')==='choice'){
      const include=f.elements['log-include-'+el.getAttribute('data-ingredient')];if(include)include.checked=true;
    }
    updateLogNutritionPreview();
  }
  if(el.id==='backup-file')importBackup(el.files[0]);
  if(el.id==='ai-consent'){P.prefs.aiConsent=el.checked;if(!el.checked)P.prefs.autoAI=false;savePersonal();renderSettings();toast(el.checked?'Preference sharing allowed. Automatic AI remains a separate choice.':'Preference sharing and automatic AI disabled. You can still explicitly request help with a meal.');}
  if(el.id==='auto-ai'){
    if(el.checked&&!window.confirm('Allow a limited preference summary to be sent to the AI provider automatically on your weekly review day while this app is open? Uses ChatGPT plan allowance; no separately billed API-key fallback. You still approve all menu changes.')){el.checked=false;return;}
    P.prefs.autoAI=el.checked&&P.prefs.aiConsent;savePersonal();toast(P.prefs.autoAI?'Weekly AI previews enabled while the app is open.':'Automatic AI previews disabled.');
  }
});
document.addEventListener('input',e=>{
  const f=document.getElementById('log-form');
  if(f&&e.target.form===f&&e.target.name==='servings')updateLogNutritionPreview();
});
document.addEventListener('submit',e=>{
  const f=e.target;const formId=f.getAttribute('id');const forms=['log-form','review-meal-form','plan-form','checkin-form','settings-form','avoid-form','swap-form'];if(!forms.includes(formId))return;e.preventDefault();
  const fd=new FormData(f);
  if(formId==='review-meal-form'){
    const s=fd.get('slug'),v=fd.get('value');if(!['love','like','dislike'].includes(v))return;
    if(setRating(s,v,String(fd.get('reason')||''),fd.getAll('ingredient'),String(fd.get('note')||''))){closeDialog();refreshCurrent();toast('Meal review saved.');}return;
  }
  if(formId==='log-form'){
    const date=String(fd.get('date'));if(!L.validDate(date)||date>L.day()||date<'2000-01-01'){formError(f,'Choose today or a past date. Use Make it again for future meals.');return;}
    const kind=fd.get('kind'),s=String(fd.get('slug')||''),m=bySlug[s];const slot=String(fd.get('slot'));
    let amount='',servings=null,n=null,title='',tags=[],customized=null;
    if(kind==='menu'){
      if(!m){formError(f,'Choose a recipe to log.');return;}
      const rawPortion=fd.get('servings');
      if(rawPortion!==null&&String(rawPortion).trim()!==''){servings=Number(rawPortion);if(!Number.isFinite(servings)||servings<0.25||servings>12){formError(f,'Enter a portion between 0.25 and 12 servings, or leave it blank.');return;}}
      title=m.title;customized=J.estimate(m,J.fromForm(m,fd,foods),servings,foods);tags=customized.ingredients;n=customized.nutrition;
      const v=fd.get('rating');if(v&&!setRating(s,v))return;
    }else{
      title=String(fd.get('title')||'').trim();if(!title){formError(f,'Give this food or drink a name.');return;}title=title.slice(0,200);amount=String(fd.get('amount')||'').slice(0,120);tags=fd.getAll('tags').filter(k=>foods[k]);
      n=Object.fromEntries(L.keysN.map(k=>[k,null]));let has=false;
      for(const k of ['kcal','protein','carbs','fat','fiber','sodium']){const raw=fd.get('n-'+k);if(raw!==null&&String(raw).trim()!==''){const val=Number(raw);if(!Number.isFinite(val)||val<0||val>100000){formError(f,'Use non-negative nutrition values, or leave unknown values blank.');return;}n[k]=val;has=true;}}
      if(!has)n=null;
    }
    const entryId=String(fd.get('id')||'');const entry={id:entryId||L.id('entry'),date,slot,kind:kind==='menu'?'menu':'custom',slug:kind==='menu'?s:'',title,servings,amount,nutrition:n,ingredients:tags,milk:fd.get('milk')==='soyMilk'?'soyMilk':'milk',honey:fd.has('honey'),note:String(fd.get('note')||'').slice(0,1000),updatedAt:new Date().toISOString()};
    const i=P.journal.findIndex(e=>e.id===entryId),previous=i>=0?P.journal[i]:null;
    if(i<0&&P.journal.length>=10000){formError(f,'The journal has reached 10,000 entries. Export a backup before managing your history.');return;}
    if(entry.kind==='custom'){
      const outsideError=saveOutsideRecord(entry,fd,previous);if(outsideError){formError(f,outsideError);return;}
      const sameEstimate=previous&&previous.nutritionSource==='reviewed_recipe_estimate'&&previous.nutrition&&n&&['kcal','protein','carbs','fat','fiber','sodium'].every(k=>previous.nutrition[k]===n[k]);
      if(sameEstimate){n.satFat=previous.nutrition.satFat;n.sugars=previous.nutrition.sugars;}
      entry.nutritionSource=n?(sameEstimate?'reviewed_recipe_estimate':'user_entered'):'';
    }else{
      entry.sourceType=m.origin==='made'?'made':'menu';
      entry.customizations=customized.choices;entry.nutritionReason=customized.reason;
      entry.milk=customized.choices.replacements.milk==='soyMilk'?'soyMilk':'milk';entry.honey=customized.choices.includedOptional.includes('honey');
      if(fd.has('log-remember')&&J.controls(m,foods).length){
        if(!P.prefs.logDefaults||typeof P.prefs.logDefaults!=='object')P.prefs.logDefaults={};
        P.prefs.logDefaults[m.slug]=JSON.parse(JSON.stringify(customized.choices));
      }
    }
    if(i>=0)P.journal[i]=entry;else P.journal.push(entry);
    const plan=P.plans.find(p=>p.id===fd.get('planId'));if(plan){plan.completed=true;plan.entryId=entry.id;}
    savePersonal();journalDate=date;closeDialog();if(location.hash==='#/journal')renderJournal();else location.hash='#/journal';toast(i>=0?'Food entry updated.':'Added to your food journal.');return;
  }
  if(formId==='plan-form'){
    const m=bySlug[fd.get('slug')],date=String(fd.get('date')),servings=Number(fd.get('servings'));if(!m||!L.validDate(date)||date<L.day()||!Number.isInteger(servings)||servings<1||servings>12){formError(f,'Choose a future or current date and 1–12 servings.');return;}
    const o=optionsFor(m);P.plans.push({id:L.id('plan'),slug:m.slug,date,servings,milk:o.milk,honey:o.honey,completed:false});
    if(fd.has('shopping')){store.shopping[m.slug]={servings,milk:o.milk,honey:o.honey};saveStore();}savePersonal();closeDialog();location.hash='#/plan';renderPlan();toast('Meal planned'+(fd.has('shopping')?' and shopping batch updated.':'.'));return;
  }
  if(formId==='checkin-form'){
    const v=fd.get('pain');P.checkins[journalDate]={pain:v===''?null:Number(v),note:String(fd.get('note')||'').slice(0,1500)};savePersonal();toast('Comfort note saved locally.');return;
  }
  if(formId==='settings-form'){
    const weekday=Number(fd.get('weekday')),max=Number(fd.get('maxChanges'));if(!Number.isInteger(weekday)||weekday<0||weekday>6||![2,3,4,5].includes(max))return;
    if(weekday!==P.prefs.weekday)P.prefs.nextReview=L.nextDue(L.day(),weekday);
    P.prefs.autoReview=fd.has('auto');P.prefs.weekday=weekday;P.prefs.maxChanges=max;P.prefs.hideDisliked=fd.has('hideDisliked');savePersonal();renderSettings();toast('Weekly review settings saved.');return;
  }
  if(formId==='avoid-form'){P.prefs.avoid=fd.getAll('avoid').filter(k=>foods[k]);savePersonal();toast('Exclusions saved. Existing meals stay until you approve a change.');return;}
  if(formId==='swap-form'){
    const to=String(fd.get('to')),from=String(fd.get('from'));if(!from||!to){formError(f,'Choose a meal to replace.');return;}
    const oldRating=P.ratings[to];const rejected=P.rejected.slice();
    if(fd.has('clearDislike'))delete P.ratings[to];if(fd.has('clearRejection'))P.rejected=P.rejected.filter(s=>s!==to);
    const err=L.swapError(P,from,to,bySlug,cats,store.favorites);if(err){if(oldRating)P.ratings[to]=oldRating;P.rejected=rejected;formError(f,err);return;}
    if(applySwap(from,to,fd.get('restore')==='1'?'restore':'manual')){closeDialog();location.hash='#/weekly';renderWeekly();toast('Menu updated. Previous recipe saved in the archive.');}return;
  }
});
document.addEventListener('keydown',e=>{
  const d=document.getElementById('kitchen-dialog');if(!d)return;
  if(e.key==='Escape'){e.preventDefault();closeDialog();return;}
  if(e.key==='Tab'){
    const list=[...d.querySelectorAll('button:not(:disabled),input:not([type=hidden]),select,textarea,a[href]')].filter(el=>el.offsetParent!==null);
    if(!list.length)return;const first=list[0],last=list[list.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  }
});
window.addEventListener('pageshow',()=>checkWeekly());
document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkWeekly();});
setInterval(()=>{if(!document.hidden)checkWeekly();},60000);

        main.addEventListener('input', e => {
            if (e.target.id === 'meal-search') {
                filters.q = e.target.value;
                renderResults();
            }
        });
        main.addEventListener('change', e => {
            const el = e.target;
            if (el.id === 'sort-select') {
                filters.sort = el.value;
                renderResults();
                return;
            }
            const action = el.dataset.action, slug = el.dataset.slug;
            if (action === 'ingredient-check') {
                checks[el.dataset.id] = el.checked;
            }
            if (action === 'shop-check') {
                store.checked[el.dataset.key] = el.checked;
                saveStore();
                const keys = Object.keys(shoppingTotals());
                document.getElementById('shopping-progress').textContent = `${keys.filter(k => store.checked[k]).length} of ${keys.length} ingredients checked`;
            }
            if (action === 'milk') {
                optionsFor(bySlug[slug]).milk = el.value === 'soyMilk' ? 'soyMilk' : 'milk';
                refreshRecipe(slug, `[data-action="milk"]`);
            }
            if (action === 'honey') {
                optionsFor(bySlug[slug]).honey = el.checked;
                refreshRecipe(slug, `[data-action="honey"]`);
            }
        });
        main.addEventListener('click', async (e) => {
            const el = e.target.closest('[data-action]');
            if (!el)
                return;
            const action = el.dataset.action, slug = el.dataset.slug;
            if (action === 'browse') {
                e.preventDefault();
                document.getElementById('menu-browse').scrollIntoView({ behavior: 'smooth' });
                return;
            }
            if (action === 'favorite') { toggleFavorite(slug); return; }
            if (action === 'filter') {
                filters[el.dataset.filter] = !filters[el.dataset.filter];
                el.setAttribute('aria-pressed', String(filters[el.dataset.filter]));
                renderResults();
                return;
            }
            if (action === 'reset-filters') {
                filters = { q: '', vegetarian: false, quick: false, sort: 'menu' };
                document.getElementById('meal-search').value = '';
                document.getElementById('sort-select').value = 'menu';
                document.querySelectorAll('[data-action="filter"]').forEach(b => b.setAttribute('aria-pressed', 'false'));
                renderResults();
                return;
            }
            if (action === 'clear-search') {
                filters.q = '';
                const input = document.getElementById('meal-search');
                input.value = '';
                renderResults();
                input.focus();
                return;
            }
            if (action === 'servings') {
                const o = optionsFor(bySlug[slug]);
                o.servings = Math.max(1, Math.min(12, o.servings + Number(el.dataset.delta)));
                refreshRecipe(slug, `[data-action="servings"][data-delta="${el.dataset.delta}"]`);
                return;
            }
            if (action === 'unit') {
                optionsFor(bySlug[slug]).unit = el.dataset.unit === 'us' ? 'us' : 'metric';
                refreshRecipe(slug, `[data-action="unit"][data-unit="${el.dataset.unit}"]`);
                return;
            }
            if (action === 'step') {
                const id = el.dataset.id;
                completedSteps[id] = !completedSteps[id];
                el.setAttribute('aria-pressed', String(completedSteps[id]));
                el.setAttribute('aria-label', `Mark step ${Number(id.split('-').slice(-1)[0]) + 1} ${completedSteps[id] ? 'incomplete' : 'complete'}`);
                el.innerHTML = completedSteps[id] ? icon('check') : Number(id.split('-').slice(-1)[0]) + 1;
                el.parentElement.classList.toggle('done', completedSteps[id]);
                return;
            }
            if (action === 'add-shopping') {
                const o = optionsFor(bySlug[slug]);
                store.shopping[slug] = { servings: o.servings, milk: o.milk, honey: o.honey };
                saveStore();
                renderHeader('menu');
                document.getElementById('shopping-button-text').textContent = 'Update shopping list';
                toast(`Shopping list updated for ${o.servings} servings.`);
                return;
            }
            if (action === 'remove-shopping') {
                delete store.shopping[slug];
                saveStore();
                renderShopping();
                toast('Recipe removed from shopping list.');
                return;
            }
            if (action === 'clear-shopping') {
                if (window.confirm('Clear all selected recipes and checked ingredients from your shopping list?')) {
                    store.shopping = {};
                    store.checked = {};
                    saveStore();
                    renderShopping();
                    toast('Shopping list cleared.');
                }
                return;
            }
            if (action === 'download-shopping') {
                download(shoppingText(), 'At-Home-Kitchen-Shopping-List.txt');
                return;
            }
            if (action === 'copy-shopping') {
                toast(await copyText(shoppingText()) ? 'Shopping list copied.' : 'Clipboard unavailable. Use Download list instead.');
                return;
            }
            if (action === 'copy-link') {
                if (location.protocol === 'file:') {
                    toast('This is a local file. Host the site to share recipe links with others.');
                    return;
                }
                toast(await copyText(location.href) ? 'Recipe link copied.' : 'Clipboard unavailable. Copy the address from your browser.');
                return;
            }
            if (action === 'print') {
                window.print();
            }
        });
        window.addEventListener('hashchange', route);
        renderFooter();
        route();
        // Read-only hooks facilitate automated verification without changing user state.
        window.KITCHEN_TEST = { mealCount: D.meals.length, categories: cats, nutrition, shoppingTotals,
          snapshot: () => JSON.parse(JSON.stringify({personal:P,store,storageAvailable,activeCounts:cats.map(c=>({category:c.name,count:activeMeals().filter(m=>m.category===c.name).length})),recipeCount:meals.length})),
          validate: () => L.validateState(P,bySlug,cats,foods), recipeError: m => L.recipeError(m,foods,cats) };
        setTimeout(checkWeekly, 100);
        if (window.KITCHEN_BOOT)
            window.KITCHEN_BOOT.complete();
    }
    catch (error) {
        if (window.KITCHEN_BOOT)
            window.KITCHEN_BOOT.restore(error);
        else if (window.console)
            console.error(error);
    }
})();
