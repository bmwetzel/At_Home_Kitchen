/* At-Home Kitchen personalization rules. Pure functions, also testable in Node. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KitchenLogic = api;
})(typeof window !== 'undefined' ? window : globalThis, function() {
  'use strict';
  const SCHEMA = 3;
  const badWords = /\b(seafood|fish|salmon|tuna|shrimp|prawn|anchov(?:y|ies)|cod|trout|sardines?|oyster|mussels?|crab|lobster|scallops?|broccoli|zucchini|courgette|tofu)\b/i;
  const noGFDinner = new Set(['pasta','bread','tortilla','soy','broth','marinara','salsa','oats','granola','crackers']);
  const ignoreFlavors = new Set(['water','salt','pepper','oil','garlic','lemon','lemonSlices','oregano','paprika','cumin','cinnamon','chiliGF','honey']);
  const keysN = ['kcal','protein','carbs','fat','satFat','fiber','sugars','sodium'];
  function day(d=new Date()) { return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'); }
  function validDate(s) { if (typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false; const d=new Date(s+'T12:00:00');return !isNaN(d)&&day(d)===s; }
  function move(s,n) { const d=new Date(s+'T12:00:00');d.setDate(d.getDate()+n);return day(d); }
  function week(s=day(),weekday=0) { const d=new Date(s+'T12:00:00');return move(s,-((d.getDay()-weekday+7)%7)); }
  function nextDue(s=day(),weekday=0) { return move(week(s,weekday),7); }
  function id(prefix='id') { return prefix+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10); }
  function fresh(base) { return {schema:SCHEMA, active:base.slice(), ratings:{}, journal:[], plans:[], reviews:[], history:[], customRecipes:[], madeMeals:[], restaurantOrders:[], rejected:[], checkins:{}, prefs:{autoReview:true, weekday:0, maxChanges:3, hideDisliked:true, avoid:[], nextReview:nextDue(), aiConsent:false, autoAI:false}}; }
  function isRecord(value) { return !!value&&typeof value==='object'&&!Array.isArray(value); }
  function boundedText(value,max,required=false) { return typeof value==='string'&&value.length<=max&&(!required||value.trim().length>0); }
  function textList(value,maxItems=30,maxLength=2000) { return Array.isArray(value)&&value.length<=maxItems&&value.every(s=>boundedText(s,maxLength)); }
  function validRecordId(value,allowEmpty=false) { return allowEmpty&&value===''||typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/.test(value); }
  function validTimestamp(value) { return boundedText(value,40,true)&&Number.isFinite(Date.parse(value)); }
  function safeSourceUrl(value,allowEmpty=false) {
    if(value===''&&allowEmpty)return true;
    if(!boundedText(value,2048,true)||value.trim()!==value||/[\u0000-\u0020\u007f]/.test(value))return false;
    try { const u=new URL(value); return ['https:','http:'].includes(u.protocol)&&!!u.hostname&&!u.username&&!u.password; } catch (_) { return false; }
  }
  function nutritionError(value,allowNull=true) {
    if(value===null&&allowNull)return '';
    if(!isRecord(value)||keysN.some(k=>value[k]!==null&&(!Number.isFinite(value[k])||value[k]<0||value[k]>100000)))return 'Invalid nutrition values.';
    return '';
  }
  function logChoicesError(value,recipe,foods){
    if(!isRecord(value)||value.version!==1||!isRecord(value.replacements)||Object.keys(value.replacements).length>22||!Array.isArray(value.omitted)||value.omitted.length>22||!Array.isArray(value.includedOptional)||value.includedOptional.length>22||!boundedText(value.note,300))return 'Invalid logged ingredient choices.';
    if(!recipe||!Array.isArray(recipe.ingredients))return 'The customized recipe is missing.';
    const ingredientKeys=new Set(recipe.ingredients.map(i=>i.key));
    const special=new Set(['@almond','@oat','@coconut','@lactose-free','@dairy-free','@other','@maple','@sweetener','@gluten-free','@gf-oats']);
    if(Object.entries(value.replacements).some(([key,replacement])=>!ingredientKeys.has(key)||typeof replacement!=='string'||!Object.prototype.hasOwnProperty.call(foods,replacement)&&!special.has(replacement))||value.omitted.some(key=>!ingredientKeys.has(key))||value.includedOptional.some(key=>!recipe.ingredients.some(i=>i.key===key&&i.optional)))return 'Logged choices do not match the recipe ingredients.';
    if(new Set(value.omitted).size!==value.omitted.length||new Set(value.includedOptional).size!==value.includedOptional.length)return 'Duplicate logged ingredient choices.';
    const helper=typeof globalThis!=='undefined'&&globalThis.KitchenJournalCustomizer;
    if(helper&&typeof helper.validate==='function')return helper.validate(value,recipe,foods);
    return '';
  }
  function madeMealError(m,by,cats,foods) {
    if(!isRecord(m)||!validRecordId(m.id)||!validTimestamp(m.createdAt)||!validTimestamp(m.updatedAt)||!boundedText(m.title,200,true)||!boundedText(m.description,6000)||!cats.some(c=>c.name===m.category)||!validRecordId(m.sourceLogId,true)||!['homemade','restaurant'].includes(m.sourceMode)||!boundedText(m.amount,1000)||!(m.batchServings===null||(Number.isFinite(m.batchServings)&&m.batchServings>=1&&m.batchServings<=12))||!['logged','draft','saved'].includes(m.status)||!boundedText(m.recipeSlug,100))return 'Invalid made meal record.';
    if(m.recipeSlug&&(!by[m.recipeSlug]||by[m.recipeSlug].origin!=='made'))return 'A saved made-meal recipe is missing.';
    if(m.status==='saved'&&!m.recipeSlug)return 'A saved made meal needs its confirmed recipe.';
    if(m.status==='draft'&&!m.draft)return 'A made-meal draft is missing.';
    if(m.draft!==null){const d=m.draft;if(!isRecord(d)||recipeError(d.recipe,foods,cats)||!boundedText(d.originalDescription,6000)||!textList(d.assumptions)||!textList(d.questions)||!textList(d.substitutions)||!boundedText(d.nutritionBasis,2000)||d.requiresReview!==true||!validTimestamp(d.createdAt))return 'Invalid made-meal recipe draft.';}
    return '';
  }
  function restaurantAnalysisError(a) {
    if(!isRecord(a)||!boundedText(a.restaurant,200)||!boundedText(a.location,300)||!boundedText(a.originalOrder,6000)||!['ready','needs_menu'].includes(a.status)||!boundedText(a.summary,6000)||!Array.isArray(a.options)||a.options.length>8||!Array.isArray(a.sources)||a.sources.length>20||!textList(a.questions)||!validTimestamp(a.checkedAt)||typeof a.menuVerified!=='boolean')return 'Invalid restaurant comparison.';
    const ids=new Set();
    for(const s of a.sources){if(!isRecord(s)||!validRecordId(s.id)||ids.has(s.id)||!boundedText(s.title,500,true)||!['live_menu','user_provided'].includes(s.kind)||!safeSourceUrl(s.url,s.kind==='user_provided')||!validTimestamp(s.checkedAt))return 'Invalid restaurant menu source.';ids.add(s.id);}
    if(a.menuVerified&&!a.sources.some(s=>s.kind==='live_menu'&&s.url))return 'A verified restaurant menu needs a live source.';
    const optionIds=new Set();
    for(const o of a.options){
      if(!isRecord(o)||!validRecordId(o.id)||optionIds.has(o.id)||!boundedText(o.title,200,true)||!boundedText(o.description,3000)||!boundedText(o.whySimilar,3000)||!boundedText(o.whySuggested,3000)||!textList(o.cautions)||nutritionError(o.nutrition,false)||!['published','unknown'].includes(o.nutritionStatus)||!boundedText(o.nutritionNote,3000)||!Array.isArray(o.sourceIds)||!o.sourceIds.length||o.sourceIds.length>20||o.sourceIds.some(id=>!ids.has(id)))return 'Invalid restaurant menu option.';
      if(o.nutritionStatus==='unknown'&&keysN.some(k=>o.nutrition[k]!==null))return 'Unknown restaurant nutrition must remain unknown.';
      optionIds.add(o.id);
    }
    if(a.status==='ready'&&!a.options.length)return 'A completed restaurant comparison needs a sourced option.';
    return '';
  }
  function restaurantOrderError(r) {
    if(!isRecord(r)||!validRecordId(r.id)||!validTimestamp(r.createdAt)||!validTimestamp(r.updatedAt)||!boundedText(r.restaurant,200,true)||!boundedText(r.location,300)||!boundedText(r.title,200,true)||!boundedText(r.description,6000)||!boundedText(r.amount,1000)||!boundedText(r.modifications,3000)||!['Breakfast','Lunch','Dinner','Snack','Drink'].includes(r.slot)||!validRecordId(r.sourceLogId,true)||!safeSourceUrl(r.menuUrl,true)||!boundedText(r.menuText,30000)||!['','love','like','dislike'].includes(r.feedback))return 'Invalid restaurant order.';
    if(r.analysis!==null)return restaurantAnalysisError(r.analysis);
    return '';
  }
  function recipeError(m,foods,cats) {
    if(!m||typeof m!=='object')return 'Missing recipe.';
    if(typeof m.slug!=='string'||!/^[a-z0-9][a-z0-9-]{2,99}$/.test(m.slug))return 'Invalid recipe ID.';
    if(m.weeklyEligible!==undefined&&typeof m.weeklyEligible!=='boolean')return 'Invalid weekly recipe eligibility.';
    if(typeof m.title!=='string'||m.title.length<3||m.title.length>110)return 'Invalid recipe title.';
    if(!cats.some(c=>c.name===m.category))return 'Unknown meal category.';
    if(!Array.isArray(m.ingredients)||!m.ingredients.length||m.ingredients.length>22)return 'Invalid ingredient list.';
    const seen=new Set();
    for(const i of m.ingredients){if(!i||!Object.prototype.hasOwnProperty.call(foods,i.key)||!Number.isFinite(i.gramsPerServing)||i.gramsPerServing<=0||i.gramsPerServing>1500||seen.has(i.key))return 'Invalid ingredient or amount.';seen.add(i.key);}
    if(!Array.isArray(m.steps)||m.steps.length<3||m.steps.length>15||m.steps.some(s=>typeof s!=='string'||s.length<15||s.length>2000))return 'Recipe needs complete cooking instructions.';
    if(!Array.isArray(m.stepTitles)||m.stepTitles.length!==m.steps.length||m.stepTitles.some(s=>typeof s!=='string'||s.length>110))return 'Invalid step headings.';
    if(!Array.isArray(m.equipment)||!m.equipment.length||m.equipment.length>15||m.equipment.some(s=>typeof s!=='string'||s.length>150))return 'Missing equipment list.';
    if(!Number.isFinite(m.baseServings)||m.baseServings<1||m.baseServings>12||!Number.isInteger(m.baseServings))return 'Invalid servings.';
    if(!Number.isFinite(m.totalMinutes)||m.totalMinutes<1||m.totalMinutes>1500||!Number.isFinite(m.prepMinutes)||m.prepMinutes<1||m.prepMinutes>m.totalMinutes)return 'Invalid cooking time.';
    const words=[m.title,m.description||'',...m.steps].join(' ');
    if(badWords.test(words))return 'Recipe conflicts with an excluded food.';
    if(m.category==='Dinners'&&(m.ingredients.some(i=>noGFDinner.has(i.key))||!m.isDinnerGF))return 'Dinner ingredients must be gluten-free.';
    return '';
  }
  function menuError(ids,by,cats,prefs={avoid:[]}) {
    if(!Array.isArray(ids)||ids.length!==70||new Set(ids).size!==70||ids.some(s=>!by[s]))return 'The active menu must contain 70 distinct known recipes.';
    for(const c of cats)if(ids.filter(s=>by[s].category===c.name).length!==c.count)return c.name+' must contain '+c.count+' recipes.';
    if(ids.filter(s=>by[s].category==='Dinners'&&by[s].isSoup).length>2)return 'Keep at most two soup, stew or chili dinners combined.';
    if(ids.some(s=>by[s].category==='Dinners'&&(!by[s].isDinnerGF||by[s].ingredients.some(i=>noGFDinner.has(i.key)))))return 'Every dinner must use gluten-free ingredients.';
    return '';
  }
  function validateState(p,by,cats,foods) {
    if(!p||p.schema!==SCHEMA)return 'This is not a supported kitchen backup.';
    let err=menuError(p.active,by,cats);if(err)return err;
    if(!p.prefs||typeof p.prefs.autoReview!=='boolean'||typeof p.prefs.hideDisliked!=='boolean'||typeof p.prefs.aiConsent!=='boolean'||typeof p.prefs.autoAI!=='boolean'||!Number.isInteger(p.prefs.weekday)||p.prefs.weekday<0||p.prefs.weekday>6||![2,3,4,5].includes(p.prefs.maxChanges)||!Array.isArray(p.prefs.avoid)||p.prefs.avoid.some(k=>!Object.prototype.hasOwnProperty.call(foods,k))||!validDate(p.prefs.nextReview))return 'Invalid preferences.';
    if(p.prefs.logDefaults!==undefined){
      if(!isRecord(p.prefs.logDefaults)||Object.keys(p.prefs.logDefaults).length>250)return 'Invalid saved recipe choices.';
      for(const [slug,choices] of Object.entries(p.prefs.logDefaults)){const error=logChoicesError(choices,by[slug],foods);if(error)return error;}
    }
    if(!p.ratings||Array.isArray(p.ratings)||typeof p.ratings!=='object')return 'Invalid ratings.';
    for(const [slug,r] of Object.entries(p.ratings))if(!by[slug]||!r||!['love','like','dislike'].includes(r.value)||!Array.isArray(r.ingredients)||r.ingredients.some(k=>!Object.prototype.hasOwnProperty.call(foods,k))||typeof r.reason!=='string'||typeof r.note!=='string'||r.note.length>1000)return 'Invalid meal review.';
    if(!Array.isArray(p.journal)||p.journal.length>10000)return 'Invalid journal.';
    const ids=new Set();
    for(const e of p.journal){
      if(!e||!validRecordId(e.id)||ids.has(e.id)||!validDate(e.date)||!['menu','custom'].includes(e.kind)||typeof e.title!=='string'||e.title.length>200||!['Breakfast','Lunch','Dinner','Snack','Drink'].includes(e.slot))return 'Invalid journal entry.';ids.add(e.id);
      if(e.kind==='menu'&&!by[e.slug])return 'A logged recipe is missing.';
      if(e.customizations!==undefined){if(e.kind!=='menu')return 'Only recipe entries can have ingredient choices.';const error=logChoicesError(e.customizations,by[e.slug],foods);if(error)return error;}
      if(e.nutritionReason!==undefined&&!boundedText(e.nutritionReason,2000))return 'Invalid nutrition estimate note.';
      if(e.servings!==null&&(!Number.isFinite(e.servings)||e.servings<=0||e.servings>12))return 'Invalid logged portion.';
      if(nutritionError(e.nutrition))return 'Invalid nutrition in journal.';
      if(e.sourceType!==undefined&&!['menu','made','custom','homemade','restaurant'].includes(e.sourceType))return 'Invalid food source in journal.';
      if(e.sourceType!==undefined&&((e.kind==='menu'&&!['menu','made'].includes(e.sourceType))||(e.kind==='custom'&&!['custom','homemade','restaurant'].includes(e.sourceType))))return 'Journal food source does not match its entry type.';
      if(e.outsideId!==undefined&&!validRecordId(e.outsideId,true))return 'Invalid outside-menu reference.';
      if(!Array.isArray(e.ingredients)||e.ingredients.some(k=>!Object.prototype.hasOwnProperty.call(foods,k)))return 'Invalid journal ingredient tags.';
    }
    for(const [field,limit,validate,label] of [
      ['madeMeals',500,m=>madeMealError(m,by,cats,foods),'made meals'],
      ['restaurantOrders',1000,restaurantOrderError,'restaurant orders']
    ]) {
      if(p[field]===undefined)continue; // Schema-3 backups from before outside-menu logging remain valid.
      if(!Array.isArray(p[field])||p[field].length>limit)return 'Invalid '+label+' collection.';
      const recordIds=new Set();
      for(const record of p[field]){const recordError=validate(record);if(recordError)return recordError;if(recordIds.has(record.id))return 'Duplicate '+label+' record.';recordIds.add(record.id);}
    }
    if(!Array.isArray(p.plans)||p.plans.some(e=>!e||typeof e.id!=='string'||typeof e.completed!=='boolean'||!by[e.slug]||!validDate(e.date)||!Number.isFinite(e.servings)||e.servings<1||e.servings>12))return 'Invalid planned meal.';
    if(!Array.isArray(p.customRecipes)||p.customRecipes.length>150||p.customRecipes.some(m=>recipeError(m,foods,cats))||new Set(p.customRecipes.map(m=>m.slug)).size!==p.customRecipes.length)return 'Invalid custom recipe.';
    if(!Array.isArray(p.reviews)||p.reviews.length>300||p.reviews.some(r=>!r||typeof r.id!=='string'||!validDate(r.week)||!Array.isArray(r.swaps)||r.swaps.some(s=>!s||!by[s.from]||!by[s.to]||!['pending','approved','skipped','stale'].includes(s.status))))return 'Invalid weekly review.';
    for(const r of p.reviews){
      if(!validDate(r.windowStart)||!validDate(r.windowEnd)||typeof r.summary!=='string'||r.summary.length>3000||!['local','ai'].includes(r.engine)||!r.stats||['entries','days','ratings'].some(k=>!Number.isFinite(r.stats[k])||r.stats[k]<0))return 'Incomplete weekly review.';
      if(!Array.isArray(r.suggestions)||r.suggestions.some(x=>!x||!by[x.slug]||x.category!==by[x.slug].category||typeof x.reason!=='string'))return 'Invalid weekly recipe suggestion.';
      if(!Array.isArray(r.repeats)||r.repeats.some(x=>!x||!by[x.slug]||x.category!==by[x.slug].category))return 'Invalid repeat recommendation.';
      if(r.swaps.some(x=>typeof x.id!=='string'||typeof x.reason!=='string'||typeof x.source!=='string'))return 'Invalid weekly swap details.';
    }
    if(!Array.isArray(p.history)||p.history.some(h=>!h||!by[h.from]||!by[h.to]||typeof h.id!=='string'||typeof h.at!=='string'||!Number.isFinite(Date.parse(h.at))||!validDate(h.week)||!['weekly','manual','restore'].includes(h.kind)))return 'Invalid menu history.';
    if(!Array.isArray(p.rejected)||p.rejected.some(s=>!by[s]))return 'Invalid suggestion preferences.';
    if(!p.checkins||typeof p.checkins!=='object'||Object.entries(p.checkins).some(([d,c])=>!validDate(d)||!c||(c.pain!==null&&(!Number.isFinite(c.pain)||c.pain<0||c.pain>10))||typeof c.note!=='string'||c.note.length>1500))return 'Invalid check-in.';
    return '';
  }
  function rated(p,s) { return p.ratings[s]&&p.ratings[s].value||''; }
  function protectedMeal(p,s,favorites) { return favorites.includes(s)||rated(p,s)==='love'; }
  function available(m,p) { return !!m&&!m.ingredients.some(i=>p.prefs.avoid.includes(i.key))&&rated(p,m.slug)!=='dislike'&&!p.rejected.includes(m.slug); }
  function swapError(p,from,to,by,cats,favorites) {
    if(!p.active.includes(from))return 'The old recipe is no longer in the active menu.';
    if(p.active.includes(to))return 'The new recipe is already in the active menu.';
    if(!by[to]||!by[from]||by[to].category!==by[from].category)return 'Replace a meal only within the same category.';
    if(protectedMeal(p,from,favorites))return 'Favorites and loved meals are protected. Remove that protection yourself first.';
    if(!available(by[to],p))return 'The proposed meal conflicts with your reviews or an ingredient exclusion.';
    const ids=p.active.map(s=>s===from?to:s);return menuError(ids,by,cats,p.prefs);
  }
  function signalProfile(p,by,favorites,today=day()) {
    const weights={};const positive=[];const counts={};
    const add=(m,w)=>{if(!m)return;const ks=m.ingredients.map(i=>i.key).filter(k=>!ignoreFlavors.has(k));ks.forEach(k=>weights[k]=(weights[k]||0)+w/Math.sqrt(ks.length||1));};
    Object.entries(p.ratings).forEach(([slug,r])=>{const m=by[slug];if(!m)return;if(r.value==='love'||r.value==='like'){add(m,r.value==='love'?3:1.5);positive.push({slug,kind:r.value==='love'?'loved':'liked'});}else if(r.value==='dislike'&&r.reason==='ingredient'){(r.ingredients||[]).forEach(k=>weights[k]=(weights[k]||0)-3);}});
    favorites.forEach(s=>{if(!rated(p,s)){add(by[s],.6);positive.push({slug:s,kind:'saved'});}});
    const cutoff=move(today,-27);
    const recent=p.journal.filter(e=>e.date>=cutoff&&e.date<=today);
    const restaurantOrders=p.restaurantOrders||[];
    const restaurantById=new Map(restaurantOrders.map(r=>[r.id,r]));
    const restaurantByLog=new Map(restaurantOrders.filter(r=>r.sourceLogId).map(r=>[r.sourceLogId,r]));
    const restaurantFor=e=>e.sourceType==='restaurant'?(restaurantById.get(e.outsideId)||restaurantByLog.get(e.id)):null;
    recent.forEach(e=>{
      if(e.kind==='menu'&&by[e.slug])counts[e.slug]=(counts[e.slug]||0)+1;
      else if(e.kind==='custom'){
        const ordered=restaurantFor(e);
        // A disliked order is not evidence against every ingredient in it.
        // Do not add a positive consumption signal for that particular order.
        if(!ordered||ordered.feedback!=='dislike')Array.from(new Set(e.ingredients)).forEach(k=>{if(!ignoreFlavors.has(k))weights[k]=(weights[k]||0)+.1;});
      }
    });
    const restaurantWeights={},restaurantPositive=[],seenRestaurant=new Set();
    recent.forEach(e=>{
      const r=restaurantFor(e);
      if(!r||seenRestaurant.has(r.id)||!['like','love'].includes(r.feedback))return;
      const tagged=Array.from(new Set(e.ingredients)).filter(k=>!ignoreFlavors.has(k));
      if(!tagged.length)return; // Never infer ingredients from an order's name.
      seenRestaurant.add(r.id);
      const strength=r.feedback==='love'?.9:.45;
      tagged.forEach(k=>restaurantWeights[k]=Math.min(2,(restaurantWeights[k]||0)+strength/Math.sqrt(tagged.length)));
      restaurantPositive.push({id:r.id,title:r.title,restaurant:r.restaurant,kind:r.feedback==='love'?'loved':'liked',ingredients:tagged});
    });
    Object.entries(restaurantWeights).forEach(([k,w])=>weights[k]=(weights[k]||0)+w);
    Object.entries(counts).forEach(([s,n])=>{if(rated(p,s)!=='dislike')add(by[s],Math.min(n,4)*.18);});
    return {weights,positive,counts,restaurantPositive};
  }
  function score(m,p,by,favorites,profile) {
    if(!available(m,p))return -Infinity;
    const ks=m.ingredients.map(i=>i.key).filter(k=>!ignoreFlavors.has(k));
    let s=ks.reduce((a,k)=>a+(profile.weights[k]||0),0)/Math.sqrt(ks.length||1);
    if(m.vegetarian)s+=.15;
    const rate=rated(p,m.slug);if(rate==='love')s+=2;if(rate==='like')s+=1;
    if(favorites.includes(m.slug))s+=.5;
    const recent=p.journal.filter(e=>e.date>=move(day(),-6)&&by[e.slug]).map(e=>by[e.slug]);
    s-=recent.filter(x=>x.slug===m.slug).length*.2;
    return s;
  }
  function explanation(m,p,by,profile) {
    const ks=new Set(m.ingredients.map(i=>i.key).filter(k=>!ignoreFlavors.has(k)));
    let match=null,best=0;
    profile.positive.forEach(x=>{if(!by[x.slug])return;const shared=by[x.slug].ingredients.filter(i=>ks.has(i.key)).length;if(shared>best){best=shared;match=x;}});
    if(match&&best>=2)return 'Shares ingredients with “'+by[match.slug].title+'”, which you '+match.kind+'. A new option to try, not an assumed preference.';
    const restaurantMatch=(profile.restaurantPositive||[]).map(r=>({record:r,shared:r.ingredients.filter(k=>ks.has(k)).length})).filter(x=>x.shared>=2).sort((a,b)=>b.shared-a.shared)[0];
    if(restaurantMatch){const r=restaurantMatch.record;return 'Shares ingredients you tagged in “'+r.title+'” from '+r.restaurant+', which you '+r.kind+'. This is an optional home recipe to try.';}
    const logged=Object.keys(profile.counts).sort((a,b)=>profile.counts[b]-profile.counts[a]).find(s=>by[s]&&by[s].ingredients.filter(i=>ks.has(i.key)).length>=2);
    if(logged)return 'Similar ingredients to “'+by[logged].title+'”, which appears in your recent journal. Eating a meal is a weak signal, not a positive rating.';
    return 'An exploratory option using ingredients already in your kitchen menu. Rate it after trying it to improve the next review.';
  }
  function weeklyCandidate(m,p) { return m.origin!=='made'||m.weeklyEligible===true||p.active.includes(m.slug); }
  function review(p,all,by,cats,favorites,today=day()) {
    const wk=week(today,p.prefs.weekday);const begin=move(today,-6);const profile=signalProfile(p,by,favorites,today);
    const logs=p.journal.filter(e=>e.date>=begin&&e.date<=today);
    const proposals=[];const used=new Set();const approvedThisWeek=p.history.filter(h=>h.kind==='weekly'&&h.week===wk).length;
    const limit=Math.max(0,p.prefs.maxChanges-approvedThisWeek);
    const affected=p.active.filter(s=>!protectedMeal(p,s,favorites)&&(rated(p,s)==='dislike'||by[s].ingredients.some(i=>p.prefs.avoid.includes(i.key))));
    // Round-robin categories, rather than filling the entire review with dinners.
    const queues=cats.map(c=>affected.filter(s=>by[s].category===c.name));const targets=[];
    while(queues.some(q=>q.length))queues.forEach(q=>{if(q.length)targets.push(q.shift());});
    let tempActive=p.active.slice();
    for(const from of targets){
      if(proposals.length>=limit)break;
      const m=by[from];let options=all.filter(x=>x.category===m.category&&!p.active.includes(x.slug)&&!used.has(x.slug)&&available(x,p)&&weeklyCandidate(x,p));
      const reason=p.ratings[from]&&p.ratings[from].reason;
      options.sort((a,b)=>{
        const rank=x=>score(x,p,by,favorites,profile)-(reason==='effort'?x.prepMinutes/10:0);
        return rank(b)-rank(a)||a.slug.localeCompare(b.slug);
      });
      const to=options.find(x=>!swapError(Object.assign({},p,{active:tempActive}),from,x.slug,by,cats,favorites));
      if(!to)continue;
      used.add(to.slug);tempActive=tempActive.map(s=>s===from?to.slug:s);
      proposals.push({id:id('swap'),from,to:to.slug,status:'pending',source:to.origin==='ai'?'AI recipe':'Local recommendation',reason:(rated(p,from)==='dislike'?'You marked the original meal as disliked. ':'The original uses an ingredient you explicitly excluded. ')+explanation(to,p,by,profile)});
    }
    const suggestions=cats.map(c=>{
      const opts=all.filter(m=>m.category===c.name&&!p.active.includes(m.slug)&&available(m,p)&&weeklyCandidate(m,p));
      opts.sort((a,b)=>score(b,p,by,favorites,profile)-score(a,p,by,favorites,profile)||a.slug.localeCompare(b.slug));
      const m=opts[0];return m?{slug:m.slug,category:c.name,reason:explanation(m,p,by,profile)}:null;
    }).filter(Boolean);
    const repeats=cats.map(c=>{
      const opts=p.active.map(s=>by[s]).filter(m=>m.category===c.name&&available(m,p));
      opts.sort((a,b)=>score(b,p,by,favorites,profile)-score(a,p,by,favorites,profile));
      const m=opts.find(m=>['like','love'].includes(rated(p,m.slug))||favorites.includes(m.slug));return m?{slug:m.slug,category:c.name}:null;
    }).filter(Boolean);
    return {id:id('review'),week:wk,createdAt:new Date().toISOString(),windowStart:begin,windowEnd:today,swaps:proposals,suggestions,repeats,engine:'local',stats:{entries:logs.length,days:new Set(logs.map(e=>e.date)).size,ratings:Object.keys(p.ratings).length,disliked:affected.length,approvedThisWeek},summary:proposals.length?'Review these swaps. Your menu will not change until you approve them.':affected.length?'No eligible replacements right now. Protected meals, category counts and your weekly limit are preserved.':'Nothing needs removing. Untried and unrated meals stay available. New ideas below are optional.'};
  }
  function totals(entries) {
    const sum=Object.fromEntries(keysN.map(k=>[k,0]));const known=Object.fromEntries(keysN.map(k=>[k,0]));
    entries.forEach(e=>{if(e.nutrition)keysN.forEach(k=>{if(Number.isFinite(e.nutrition[k])){sum[k]+=e.nutrition[k];known[k]++;}});});
    return {sum,known,entries:entries.length};
  }
  return {SCHEMA,keysN,day,validDate,move,week,nextDue,id,fresh,safeSourceUrl,nutritionError,logChoicesError,madeMealError,restaurantAnalysisError,restaurantOrderError,weeklyCandidate,recipeError,menuError,validateState,rated,protectedMeal,available,swapError,signalProfile,score,explanation,review,totals};
});
