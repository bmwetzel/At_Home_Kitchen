'use strict';
// Regression checks exercise the real customization core and the real app event
// handlers. The app fixture uses small DOM stubs; it is not a visual browser test.
const assert=require('node:assert/strict');
const {fixture,read}=require('./journal-test-fixture.cjs');
const J=require('../source/journal-customizations.js');
const L=require('../source/personalization-rules.js');
const D=JSON.parse(read('data/base-recipes.json'));
const candidates=JSON.parse(read('data/recipe-variations.json'));
const foods=D.ingredients, recipes=D.meals.concat(candidates);
const by=Object.fromEntries(recipes.map(m=>[m.slug,m]));
const copy=x=>JSON.parse(JSON.stringify(x));
const recipe=slug=>{assert(by[slug],'Fixture recipe exists: '+slug);return by[slug];};
const milkMeal=recipe('baked-berry-oatmeal');
const plainMeal=recipe('lemon-garlic-chicken-plate');
const noodleMeal=recipe('cold-peanut-chicken-noodles');
const controls=m=>J.controls(m,foods);
const keys=m=>controls(m).map(c=>c.key);
const choice=(replacements={},includedOptional=[],omitted=[],note='')=>({version:1,replacements,includedOptional,omitted,note});
function form(values){return {get:k=>Object.hasOwn(values,k)?values[k]:null,has:k=>Object.hasOwn(values,k),getAll:k=>Object.hasOwn(values,k)?[].concat(values[k]):[]};}
function expected(m,{replacements={},includedOptional=[],omitted=[]}={},servings=1){
 const result=Object.fromEntries(L.keysN.map(k=>[k,0]));
 for(const i of m.ingredients){
   if(omitted.includes(i.key)||(i.optional&&!includedOptional.includes(i.key)))continue;
   const key=replacements[i.key]||i.key;
   for(const k of L.keysN)result[k]+=foods[key].per100g[k]*i.gramsPerServing/100*servings;
 }
 return Object.fromEntries(L.keysN.map(k=>[k,Math.round(result[k]*100)/100]));
}
function nearNutrition(actual,wanted){for(const k of L.keysN)assert.ok(Math.abs(actual[k]-wanted[k])<=0.011,`${k}: ${actual[k]} versus ${wanted[k]}`);}
function clean(f){assert.deepEqual(f.errors,[]);assert.equal(f.env.KITCHEN_TEST.validate(),'');}
function menuFields(f,m=milkMeal,extra={}){return {kind:'menu',date:f.env.KitchenLogic.day(),slot:m.category==='Dinners'?'Dinner':m.category==='Lunches'?'Lunch':'Breakfast',slug:m.slug,servings:'1',note:'', 'log-custom-version':'1',...extra};}
function outsideFields(f,type,extra={}){return {kind:'custom',sourceType:type,date:f.env.KitchenLogic.day(),slot:'Dinner',title:'Chicken rice bowl',description:'Chicken, rice and peppers cooked for two people.',amount:'One bowl',category:'Dinners',restaurant:type==='restaurant'?'Example Café':'',location:'Denver',modifications:'Sauce on the side',batchServings:'2',note:'Private note',...extra};}
let passed=0;
const jobs=[];
function test(name,fn){jobs.push({name,fn});}

test('all 94 current recipes derive controls only from their own ingredients',()=>{
 assert.equal(D.meals.length,70);assert.equal(candidates.length,24);
 for(const m of recipes){
   const ingredients=new Set(m.ingredients.map(i=>i.key));
   for(const c of controls(m))assert.ok(ingredients.has(c.key),m.slug+' has unrelated '+c.key+' control');
   assert.equal(new Set(keys(m)).size,keys(m).length,m.slug+' duplicates a control');
   if(!ingredients.has('milk')&&!ingredients.has('soyMilk'))assert(!keys(m).some(k=>k==='milk'||k==='soyMilk'),m.slug);
 }
});
test('plain chicken dinner has no milk, dairy, gluten or optional customization controls',()=>{
 assert.deepEqual(keys(plainMeal),[]);
});
test('default nutrition preserves all menu estimates and ingredients are not mutated',()=>{
 const before=copy(recipes);
 for(const m of recipes){
   const e=J.estimate(m,choice(),1,foods);
   assert(e.nutrition,m.slug);
   if(m.index===69){for(const key of L.keysN)assert.equal(e.nutrition[key],0);}
   else nearNutrition(e.nutrition,expected(m));
 }
 assert.deepEqual(recipes,before);
});
test('milk, yogurt, bread, tortillas, pasta and soy options appear on relevant foods',()=>{
 for(const key of ['milk','yogurt','bread','tortilla','pasta','soy','soyGF']){
   const m=recipes.find(m=>m.ingredients.some(i=>i.key===key));assert(m,key);
   assert(keys(m).includes(key),m.slug+' should expose '+key);
 }
 assert(keys(noodleMeal).includes('pasta'));assert(keys(noodleMeal).includes('soy'));
 assert(!keys(noodleMeal).includes('milk'));assert(!keys(noodleMeal).includes('bread'));
});
test('legacy milk and optional honey restore only to matching ingredients',()=>{
 const adapted=J.normalize(milkMeal,null,foods,{milk:'soyMilk',honey:true});
 assert.equal(adapted.replacements.milk,'soyMilk');assert(adapted.includedOptional.includes('honey'));
 const unrelated=J.normalize(plainMeal,null,foods,{milk:'soyMilk',honey:true});
 assert.deepEqual(unrelated.replacements,{});assert.deepEqual(unrelated.includedOptional,[]);
});
test('known milk replacement and portions use actual ingredient profiles',()=>{
 const c=choice({milk:'soyMilk'},['honey']);
 const e=J.estimate(milkMeal,c,1.5,foods);
 assert(e.nutrition);nearNutrition(e.nutrition,expected(milkMeal,c,1.5));
 assert(e.ingredients.includes('soyMilk'));assert(!e.ingredients.includes('milk'));assert(e.ingredients.includes('honey'));
});
test('gluten-free pasta and sauce log independently with recalculated nutrients',()=>{
 const c=choice({pasta:'pastaGF',soy:'soyGF'}),e=J.estimate(noodleMeal,c,.75,foods);
 nearNutrition(e.nutrition,expected(noodleMeal,c,.75));
 assert(e.ingredients.includes('pastaGF'));assert(e.ingredients.includes('soyGF'));assert(!e.ingredients.includes('pasta'));
 const onlyPasta=J.estimate(noodleMeal,choice({pasta:'pastaGF'}),1,foods);
 assert(onlyPasta.ingredients.includes('soy'));
});
test('unknown milk brands never retain the original complete estimate',()=>{
 for(const value of ['@almond','@oat','@other']){
   const c=choice({milk:value});const e=J.estimate(milkMeal,c,1,foods);
   assert.equal(e.nutrition,null,value);assert.match(e.reason,/unknown|unavailable|label|estimate|nutrition/i);
 }
});
test('missing portion remains unknown instead of zero calories',()=>{
 const e=J.estimate(milkMeal,choice(),null,foods);assert.equal(e.nutrition,null);
 const totals=L.totals([{nutrition:e.nutrition}]);assert.equal(totals.known.kcal,0);
});
test('independent optional toppings cannot accidentally follow the honey switch',()=>{
 const m={...copy(milkMeal),ingredients:[...copy(milkMeal.ingredients),{key:'walnuts',gramsPerServing:12,optional:true}]};
 assert(foods.walnuts,'Known walnuts profile');
 const c=choice({},['walnuts']),e=J.estimate(m,c,1,foods);
 assert(e.ingredients.includes('walnuts'));assert(!e.ingredients.includes('honey'));
 nearNutrition(e.nutrition,expected(m,c));
 const withBoth=J.estimate(m,choice({},['walnuts','honey']),1,foods);assert(withBoth.nutrition.kcal>e.nutrition.kcal);
});
test('omitting a real topping removes just that ingredient and its nutrient contribution',()=>{
 const m=recipe('berry-banana-yogurt-smoothie'),c=choice({},[],['chia']);
 const e=J.estimate(m,c,1,foods);assert(!e.ingredients.includes('chia'));assert(e.ingredients.includes('milk'));
 nearNutrition(e.nutrition,expected(m,c));
});
test('tampered or stale unrelated choices are discarded before resolving ingredients',()=>{
 const c=J.normalize(plainMeal,choice({milk:'soyMilk',chicken:'soyMilk'},['honey'],['rice']),foods);
 assert.deepEqual(c.replacements,{});assert.deepEqual(c.includedOptional,[]);assert.deepEqual(c.omitted,[]);
 const e=J.estimate(plainMeal,c,1,foods);nearNutrition(e.nutrition,expected(plainMeal));
});
test('form decoding retains only controls for the selected recipe',()=>{
 const fd=form({'log-custom-version':'1','log-choice-milk':'soyMilk','log-include-honey':'on','log-choice-pasta':'pastaGF','log-custom-note':'Brand recorded separately'});
 const c=J.fromForm(milkMeal,fd,foods);assert.equal(c.replacements.milk,'soyMilk');assert.equal(c.replacements.pasta,undefined);assert(c.includedOptional.includes('honey'));assert.equal(c.note,'Brand recorded separately');
});
test('dinner logs can record actual changes without altering gluten-free menu definitions',()=>{
 const m=recipes.find(m=>m.category==='Dinners'&&m.ingredients.some(i=>i.key==='pastaGF'));
 const original=copy(m),e=J.estimate(m,choice({pastaGF:'pasta'}),1,foods);
 assert(e.ingredients.includes('pasta'));assert.deepEqual(m,original);
 assert.equal(L.menuError(D.meals.map(m=>m.slug),by,D.categories),'');
});

test('logging saves selected ingredients, changed nutrition and per-recipe defaults',async()=>{
 const f=fixture();clean(f);
 await f.submit('log-form',menuFields(f,milkMeal,{'log-choice-milk':'soyMilk','log-include-honey':'on','log-remember':'on',servings:'1.5'}));clean(f);
 const p=f.snapshot().personal,e=p.journal[0];assert.equal(p.journal.length,1);assert.equal(e.servings,1.5);assert(e.ingredients.includes('soyMilk'));assert(!e.ingredients.includes('milk'));
 nearNutrition(e.nutrition,expected(milkMeal,choice({milk:'soyMilk'},['honey']),1.5));
 assert.equal(p.prefs.logDefaults[milkMeal.slug].replacements.milk,'soyMilk');
 const reloaded=fixture({storage:f.storage});clean(reloaded);
 assert.deepEqual(reloaded.snapshot().personal.journal,p.journal);
 assert.deepEqual(reloaded.snapshot().personal.prefs.logDefaults,p.prefs.logDefaults);
});
test('editing a journal entry restores its own choices after defaults change',async()=>{
 const f=fixture();await f.submit('log-form',menuFields(f,milkMeal,{'log-choice-milk':'soyMilk','log-include-honey':'on','log-remember':'on'}));
 const original=f.snapshot().personal.journal[0];
 await f.submit('log-form',menuFields(f,milkMeal,{'log-choice-milk':'milk','log-remember':'on'}));clean(f);
 assert.deepEqual(f.snapshot().personal.journal[0],original);
 await f.click({k:'edit-log',id:original.id});
 const html=f.dialog().innerHTML;assert.match(html,/(value="soyMilk"[^>]*selected|selected[^>]*value="soyMilk")/);
 assert.match(html,/name="log-include-honey"[^>]*checked/);
 await f.submit('log-form',menuFields(f,milkMeal,{id:original.id,'log-choice-milk':'soyMilk','log-include-honey':'on',servings:'0.5'}));clean(f);
 assert.equal(f.snapshot().personal.journal.length,2);nearNutrition(f.snapshot().personal.journal[0].nutrition,expected(milkMeal,choice({milk:'soyMilk'},['honey']),.5));
});
test('unknown substitutions and blank amounts persist as unknown nutrition',async()=>{
 const f=fixture();await f.submit('log-form',menuFields(f,milkMeal,{'log-choice-milk':'@almond'}));
 await f.submit('log-form',menuFields(f,plainMeal,{servings:''}));clean(f);
 assert(f.snapshot().personal.journal.every(e=>e.nutrition===null));
 const reload=fixture({storage:f.storage});clean(reload);assert(reload.snapshot().personal.journal.every(e=>e.nutrition===null));
});
test('unrelated meal hides customization controls and preserves original nutrition',async()=>{
 const f=fixture();await f.click({k:'log',slug:plainMeal.slug});const html=f.dialog().innerHTML;
 assert(!/name="log-choice-milk"/.test(html));assert(!/name="log-include-honey"/.test(html));
 await f.submit('log-form',menuFields(f,plainMeal,{'log-choice-milk':'soyMilk','log-include-honey':'on'}));clean(f);
 nearNutrition(f.snapshot().personal.journal[0].nutrition,expected(plainMeal));
});
test('changing the selected recipe removes unrelated controls and restores its own draft choices',async()=>{
 const f=fixture();await f.click({k:'log',slug:milkMeal.slug});
 const form=f.elements.get('log-form'),area=f.elements.get('log-customization-area');
 form.elements.slot={value:'Breakfast'};
 // Supply the form state a native browser maintains; event handlers and draft
 // storage are the actual production functions, not reimplemented in the fixture.
 form.values=menuFields(f,milkMeal,{'log-choice-milk':'soyMilk','log-include-honey':'on'});
 area.setAttribute('data-recipe',milkMeal.slug);
 form.values.slug=plainMeal.slug;await f.change('log-slug',{value:plainMeal.slug});
 assert.equal(form.elements.slot.value,'Dinner');assert.equal(area.innerHTML,'');
 form.values.slug=milkMeal.slug;await f.change('log-slug',{value:milkMeal.slug});
 assert.equal(form.elements.slot.value,'Breakfast');
 assert.match(area.innerHTML,/(value="soyMilk"[^>]*selected|selected[^>]*value="soyMilk")/);
 assert.match(area.innerHTML,/name="log-include-honey"[^>]*checked/);
 clean(f);
});
test('old schema-3 entries reload without rewritten historical nutrients',async()=>{
 const f=fixture(),p=f.snapshot().personal;delete p.prefs.logDefaults;
 const historical={id:'historical-log',date:L.day(),slot:'Breakfast',kind:'menu',slug:milkMeal.slug,title:milkMeal.title,servings:1,amount:'',nutrition:expected(milkMeal,choice({milk:'soyMilk'},['honey'])),ingredients:milkMeal.ingredients.map(i=>i.key),milk:'soyMilk',honey:true,note:'Original note'};
 p.journal=[historical];f.storage.set('at-home-kitchen:personal:v3',JSON.stringify(p));
 const reloaded=fixture({storage:f.storage});clean(reloaded);assert.deepEqual(reloaded.snapshot().personal.journal[0],historical);
 await reloaded.click({k:'edit-log',id:historical.id});assert.match(reloaded.dialog().innerHTML,/(value="soyMilk"[^>]*selected|selected[^>]*value="soyMilk")/);
});
test('homemade and restaurant records remain distinct and never create pretend AI answers',async()=>{
 const f=fixture();await f.submit('log-form',outsideFields(f,'homemade'));
 await f.submit('log-form',outsideFields(f,'restaurant',{'n-kcal':'620','n-protein':'34'}));clean(f);
 const p=f.snapshot().personal;assert.equal(p.madeMeals.length,1);assert.equal(p.restaurantOrders.length,1);assert.equal(p.journal.length,2);
 assert.equal(p.journal[0].nutrition,null);assert.equal(p.journal[1].nutrition.kcal,620);assert.equal(p.journal[1].nutrition.sodium,null);
 assert.equal(p.madeMeals[0].draft,null);assert.equal(p.restaurantOrders[0].analysis,null);assert.equal(f.requests.length,0);
 assert.equal(p.journal[0].outsideId,p.madeMeals[0].id);assert.equal(p.journal[1].outsideId,p.restaurantOrders[0].id);
});
test('hosted homemade action prepares the exact saved description without a request or fabricated draft',async()=>{
 const f=fixture({protocol:'https:'});f.env.location.hostname='at-home-kitchen-web.onrender.com';
 const prepared=[];f.env.KitchenChatGPTBridge={prepareTask:task=>{prepared.push(copy(task));return true;}};
 const description='I roasted 300 g chicken with 1 cup cooked rice and diced red peppers for two people.';
 await f.submit('log-form',outsideFields(f,'homemade',{description}));clean(f);
 const before=f.snapshot().personal,record=before.madeMeals[0];
 await f.click({work:'generate-made',id:record.id});clean(f);
 assert.equal(prepared.length,1);assert.equal(prepared[0].task,'homemade');
 assert(prepared[0].question.includes(description));assert(prepared[0].question.includes(record.title));
 assert(prepared[0].question.includes('Whole recipe servings: 2'));
 assert(!prepared[0].question.includes('Private note'));
 assert.equal(f.requests.length,0);assert.deepEqual(f.snapshot().personal,before);
 assert.equal(f.snapshot().personal.madeMeals[0].draft,null);
});
test('hosted restaurant action prepares saved order and menu without a request or fabricated comparison',async()=>{
 const f=fixture({protocol:'https:'});f.env.location.hostname='at-home-kitchen-web.onrender.com';
 const prepared=[];f.env.KitchenChatGPTBridge={prepareTask:task=>{prepared.push(copy(task));return true;}};
 const description='A grilled chicken bowl, brown rice, peppers, black beans and salsa.';
 await f.submit('log-form',outsideFields(f,'restaurant',{description}));clean(f);
 const record=f.snapshot().personal.restaurantOrders[0];
 const menuUrl='https://restaurant.example/menu',menuText='Chicken bowl: chicken, brown rice, peppers and black beans. Salsa available on the side.';
 await f.submit('restaurant-details-form',{id:record.id,restaurant:record.restaurant,location:record.location,title:record.title,description:record.description,modifications:record.modifications,amount:record.amount,slot:record.slot,menuUrl,menuText});clean(f);
 const before=f.snapshot().personal;
 await f.click({work:'analyze-restaurant',id:record.id});clean(f);
 assert.equal(prepared.length,1);assert.equal(prepared[0].task,'restaurant');
 for(const value of [description,record.restaurant,record.location,record.modifications,record.amount,menuUrl,menuText])assert(prepared[0].question.includes(value),value);
 assert(!prepared[0].question.includes('Private note'));
 assert.equal(f.requests.length,0);assert.deepEqual(f.snapshot().personal,before);
 assert.equal(f.snapshot().personal.restaurantOrders[0].analysis,null);
});
test('backup import restores customization defaults and original journal records',async()=>{
 const f=fixture();await f.submit('log-form',menuFields(f,milkMeal,{'log-choice-milk':'soyMilk','log-remember':'on'}));clean(f);
 const snapshot=f.snapshot(),payload=JSON.stringify({application:'At-Home Kitchen',version:3,personal:snapshot.personal,baseStore:snapshot.store});
 const restored=fixture();await restored.change('backup-file',{files:[{size:Buffer.byteLength(payload),text:async()=>payload}]});clean(restored);
 assert.deepEqual(restored.snapshot().personal.journal,snapshot.personal.journal);assert.deepEqual(restored.snapshot().personal.prefs.logDefaults,snapshot.personal.prefs.logDefaults);
});
test('malformed customization data fails backup validation without replacing records',async()=>{
 const f=fixture();await f.submit('log-form',menuFields(f,milkMeal,{'log-choice-milk':'soyMilk','log-remember':'on'}));clean(f);
 const initial=f.snapshot(),bad=copy(initial.personal);bad.prefs.logDefaults[milkMeal.slug].replacements.milk={malformed:true};
 assert.notEqual(L.validateState(bad,by,D.categories,foods),'');
 const payload=JSON.stringify({application:'At-Home Kitchen',version:3,personal:bad,baseStore:initial.store});
 await f.change('backup-file',{files:[{size:Buffer.byteLength(payload),text:async()=>payload}]});clean(f);
 assert.deepEqual(f.snapshot().personal,initial.personal);
});

(async()=>{for(const {name,fn} of jobs){try{await fn();passed++;console.log('PASS '+name);}catch(error){console.error('FAIL '+name);throw error;}}console.log(JSON.stringify({passed,failed:0,recipesChecked:recipes.length,scope:'core calculations and actual app event/state contracts; browser layout tested separately'}));})().catch(error=>{console.error(error);process.exitCode=1;});
