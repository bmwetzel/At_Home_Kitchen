/* Ingredient-based journal choices. Pure functions; no storage or network access. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.KitchenJournalCustomizer=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const keysN=['kcal','protein','carbs','fat','satFat','fiber','sugars','sodium'];
  const pairs={pasta:'pastaGF',pastaGF:'pasta',bread:'breadGF',breadGF:'bread',tortilla:'tortillaGF',tortillaGF:'tortilla',marinara:'marinaraGF',marinaraGF:'marinara',salsa:'salsaGF',salsaGF:'salsa',broth:'brothGF',brothGF:'broth',soy:'soyGF',soyGF:'soy'};
  const labels={milk:'Milk',soyMilk:'Milk',yogurt:'Yogurt',cottage:'Cottage cheese',cheese:'Cheese',pasta:'Pasta',pastaGF:'Pasta',bread:'Bread',breadGF:'Bread',tortilla:'Tortillas',tortillaGF:'Tortillas',marinara:'Marinara sauce',marinaraGF:'Marinara sauce',salsa:'Salsa',salsaGF:'Salsa',broth:'Broth',brothGF:'Broth',soy:'Soy sauce / tamari',soyGF:'Soy sauce / tamari',oats:'Oats',granola:'Granola',crackers:'Crackers',honey:'Sweetener',hummus:'Hummus',avocado:'Avocado',walnuts:'Walnuts',almonds:'Almonds',chia:'Chia seeds',flax:'Ground flaxseed',pb:'Peanut butter',chocolate:'Chocolate',chiliGF:'Chili powder'};
  const toppings=new Set(['hummus','avocado','walnuts','almonds','chia','flax','pb','chocolate']);
  const record=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
  const name=(foods,key)=>foods[key]&&foods[key].name||key;
  const known=(foods,key,label)=>({value:key,label:label||name(foods,key),foodKey:key});
  const unknown=(value,label)=>({value,label,foodKey:null});
  function controls(recipe,foods){
    if(!recipe||!Array.isArray(recipe.ingredients))return [];
    return recipe.ingredients.flatMap(i=>{
      const key=i.key;
      if(!foods[key])return [];
      let kind='',options=[];
      if(key==='milk'||key==='soyMilk'){
        kind='milk';
        options=['milk','soyMilk'].filter(k=>foods[k]).map(k=>known(foods,k));
        options.push(unknown('@almond','Unsweetened almond milk — brand varies'),unknown('@oat','Oat milk — brand varies'),unknown('@coconut','Coconut beverage — brand varies'),unknown('@lactose-free','Lactose-free dairy milk — brand varies'));
      }else if(['yogurt','cottage','cheese'].includes(key)){
        kind='dairy';options=[known(foods,key),unknown('@dairy-free',key==='yogurt'?'Dairy-free yogurt — brand varies':key==='cottage'?'Dairy-free cottage cheese alternative — brand varies':'Dairy-free cheese — brand varies')];
      }else if(pairs[key]){
        kind='gluten';options=[known(foods,key)];if(foods[pairs[key]])options.push(known(foods,pairs[key]));
      }else if(key==='oats'){
        kind='gluten';options=[known(foods,key),{value:'@gf-oats',label:'Certified gluten-free rolled oats',foodKey:'oats'}];
      }else if(key==='granola'||key==='crackers'){
        kind='gluten';options=[known(foods,key),unknown('@gluten-free','Gluten-free '+key+' — brand varies')];
      }else if(key==='chiliGF'){
        kind='gluten';options=[known(foods,key)];
      }else if(key==='honey'){
        kind='sweetener';options=[known(foods,key),unknown('@maple','Maple syrup — amount / product differs'),unknown('@sweetener','Another sweetener — amount / product differs')];
      }else if(toppings.has(key)||i.optional){
        kind='topping';options=[known(foods,key)];
      }else return [];
      options.push(unknown('@other','A different product or amount — nutrition unknown'));
      if(!i.optional)options.push({value:'omit',label:'Not used',foodKey:null});
      return [{key,label:labels[key]||name(foods,key),kind,optional:i.optional===true,options}];
    });
  }
  function normalize(recipe,raw,foods,legacy={}){
    const usable=record(raw)&&raw.version===1;
    const result={version:1,replacements:{},omitted:[],includedOptional:[],note:usable&&typeof raw.note==='string'?raw.note.slice(0,300):''};
    const replacements=usable&&record(raw.replacements)?raw.replacements:{};
    const omitted=usable&&Array.isArray(raw.omitted)?raw.omitted:[];
    const included=usable&&Array.isArray(raw.includedOptional)?raw.includedOptional:[];
    for(const c of controls(recipe,foods)){
      let value=Object.prototype.hasOwnProperty.call(replacements,c.key)?replacements[c.key]:c.key;
      if(!usable&&c.key==='milk'&&legacy.milk==='soyMilk')value='soyMilk';
      if(!c.options.some(o=>o.value===value))value=c.key;
      if(c.optional){
        if(usable?included.includes(c.key):c.key==='honey'&&legacy.honey===true)result.includedOptional.push(c.key);
      }else if(omitted.includes(c.key)||value==='omit')result.omitted.push(c.key);
      if(value!==c.key&&value!=='omit')result.replacements[c.key]=value;
    }
    return result;
  }
  function fromForm(recipe,fd,foods){
    if(fd.get('log-custom-version')!=='1')return normalize(recipe,null,foods,{milk:fd.get('milk'),honey:fd.has('honey')});
    const raw={version:1,replacements:{},omitted:[],includedOptional:[],note:String(fd.get('log-custom-note')||'').trim().slice(0,300)};
    for(const c of controls(recipe,foods)){
      const value=fd.get('log-choice-'+c.key)||c.key;
      if(c.optional&&fd.has('log-include-'+c.key))raw.includedOptional.push(c.key);
      if(value==='omit')raw.omitted.push(c.key);
      else if(value!==c.key)raw.replacements[c.key]=value;
    }
    return normalize(recipe,raw,foods);
  }
  function resolve(recipe,raw,foods){
    const choices=normalize(recipe,raw,foods),list=controls(recipe,foods),by=new Map(list.map(c=>[c.key,c]));
    const ingredients=[],unrecognized=[];
    if(!recipe||!Array.isArray(recipe.ingredients))return {ingredients,unknown:unrecognized,choices};
    for(const i of recipe.ingredients){
      if(i.optional&&!choices.includedOptional.includes(i.key)||choices.omitted.includes(i.key))continue;
      const selected=choices.replacements[i.key]||i.key,c=by.get(i.key),option=c&&c.options.find(o=>o.value===selected);
      const key=option?option.foodKey:i.key;
      if(!key||!foods[key]){unrecognized.push({key:i.key,label:option?option.label:name(foods,i.key)});continue;}
      ingredients.push({...i,key});
    }
    return {ingredients,unknown:unrecognized,choices};
  }
  function estimate(recipe,raw,servings,foods){
    const resolved=resolve(recipe,raw,foods),result={nutrition:null,reason:'',ingredients:[...new Set(resolved.ingredients.map(i=>i.key))],choices:resolved.choices};
    if(servings===null||servings===undefined||servings===''||!Number.isFinite(Number(servings))||Number(servings)<=0){result.reason='Add a known portion to calculate nutrition. You can also save the entry without an estimate.';return result;}
    if(resolved.unknown.length){result.reason='Nutrition unavailable: '+resolved.unknown.map(i=>i.label).join('; ')+'. The original recipe estimate is not used for this entry.';return result;}
    const n=Object.fromEntries(keysN.map(k=>[k,0]));
    if(recipe&&recipe.index!==69){
      for(const i of resolved.ingredients){
        if(!Number.isFinite(i.gramsPerServing)||keysN.some(k=>!Number.isFinite(foods[i.key].per100g&&foods[i.key].per100g[k]))){result.reason='Nutrition unavailable for one or more ingredients.';return result;}
        for(const k of keysN)n[k]+=foods[i.key].per100g[k]*i.gramsPerServing/100*Number(servings);
      }
    }
    result.nutrition=Object.fromEntries(keysN.map(k=>[k,Math.round(n[k]*100)/100]));
    return result;
  }
  function summary(recipe,raw,foods){
    const choices=normalize(recipe,raw,foods);
    return controls(recipe,foods).map(c=>{
      if(c.optional&&!choices.includedOptional.includes(c.key)||choices.omitted.includes(c.key))return c.label+': not used';
      const option=c.options.find(o=>o.value===(choices.replacements[c.key]||c.key));
      return c.label+': '+(option?option.label:name(foods,c.key));
    });
  }
  function validate(raw,recipe,foods){
    if(!record(raw)||raw.version!==1||!record(raw.replacements)||!Array.isArray(raw.omitted)||!Array.isArray(raw.includedOptional)||typeof raw.note!=='string'||raw.note.length>300)return 'Invalid recipe customization.';
    const list=controls(recipe,foods),by=new Map(list.map(c=>[c.key,c]));
    if(Object.entries(raw.replacements).some(([key,value])=>!by.has(key)||!by.get(key).options.some(o=>o.value===value&&o.value!=='omit'))||raw.omitted.some(key=>!by.has(key)||by.get(key).optional)||raw.includedOptional.some(key=>!by.has(key)||!by.get(key).optional))return 'Recipe customizations do not match its ingredients.';
    if(new Set(raw.omitted).size!==raw.omitted.length||new Set(raw.includedOptional).size!==raw.includedOptional.length)return 'Duplicate recipe customization.';
    return '';
  }
  return {keysN,controls,normalize,fromForm,resolve,estimate,summary,validate};
});
