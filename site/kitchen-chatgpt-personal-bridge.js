/* At-Home Kitchen personal ChatGPT bridge — no API keys or token sharing. */
(() => {
  'use strict';
  const D=window.KITCHEN_DATA;
  if(!D||!Array.isArray(D.meals))return;
  const CFG='at-home-kitchen:personal:v3',SAVE='at-home-kitchen:v1';
  const RULES=[
    'You are my At-Home Kitchen cooking and food-journal assistant.',
    'Never suggest seafood, fish, shellfish, broccoli, zucchini, or tofu.',
    'Dinner ideas must be gluten-free, including sauces, pasta and tortillas when relevant.',
    'There can be no more than two dinner soups, stews or chili options.',
    'Protect loved and favorite meals; untried does not mean disliked.',
    'Keep the main menu at 21 dinners, 14 lunches, 7 full breakfasts, 7 quick breakfasts, 14 snacks and 7 drinks unless I approve a change.',
    'When suggesting a new meal, include measured ingredients, detailed cooking steps, and clearly estimated nutrition.',
    'When researching restaurant alternatives, verify the restaurant menu and date checked; do not invent exact nutrition.',
    'Do not assume a suggested meal was eaten or change my food journal or menu without approval.',
    'Nutrition may support overall health but cannot repair a structural joint deformity.'
  ];
  const PREFILL={
    general:'',
    homemade:'Turn this homemade dish into a reproducible recipe with ingredient amounts, clear cooking steps and estimated nutrients; ask what quantities I actually used: ',
    restaurant:'Find two or three comparable choices on the actual published menu for this restaurant order; identify verified sources and unknown nutrition: ',
    weekly:'Use my chosen ratings and any food-journal data I share to suggest three balanced weekly menu changes. Keep favorites protected and request approval.',
    nutrition:'Explain the nutrition and possible dietary swaps for this meal, separating verified values from estimates: ',
    shopping:'Create a consolidated shopping list with quantities for these selected recipes: '
  };
  const PROJECT=[
    'At-Home Kitchen Project instructions',...RULES,
    'When I describe a homemade dish, ask for unknown amounts before calculating nutrients.',
    'When I share a restaurant order, record what I ate separately from suggested alternatives.',
    'Favor varied, practical, Mediterranean-style eating habits without medical cure claims.',
    'This ChatGPT project is separate from the Kitchen website. Do not pretend to see the website or update its records unless I provide data and have authorized an integration.'
  ].join('\n');
  const get=k=>{try{return JSON.parse(localStorage.getItem(k)||'{}')||{};}catch(_){return {};}};
  function mealName(slug,all){const m=all.find(x=>x.slug===slug);return m?m.title:String(slug);}
  function context(){
    const el=document.getElementById('kitchen-chatgpt-personal');if(!el)return '';
    const val=id=>el.querySelector('#'+id);
    const p=get(CFG),s=get(SAVE),all=D.meals.concat(window.KITCHEN_CANDIDATES||[],Array.isArray(p.customRecipes)?p.customRecipes:[]);
    let task=val('kcp-question').value.trim()||document.getElementById('assistant-question')?.value.trim()||PREFILL[val('kcp-task').value]||'';
    const out=['I am using my personal ChatGPT subscription. This prompt was copied from At-Home Kitchen; you cannot automatically read or update that website.','',...RULES,'','MY REQUEST:',task||'Please help me choose a meal.'];
    if(Array.isArray(p.prefs?.avoid)&&p.prefs.avoid.length)out.push('Additional avoided ingredients: '+p.prefs.avoid.join(', '));
    if(val('kcp-favs').checked){
      const fav=Array.isArray(s.favorites)?s.favorites.slice(0,25):[];
      const ratings=Object.entries(p.ratings||{}).slice(0,30).map(([slug,r])=>mealName(slug,all)+': '+(typeof r==='string'?r:r?.value||'unrated'));
      out.push('','FAVORITES AND RATINGS:',fav.length?fav.map(slug=>mealName(slug,all)).join(', '):'(none saved)',ratings.length?ratings.join('; '):'(none saved)');
    }
    if(val('kcp-journal').checked){
      const cutoff=Date.now()-7*86400000,entries=(Array.isArray(p.journal)?p.journal:[]).filter(x=>x.date&&new Date(x.date+'T12:00:00').getTime()>=cutoff).slice(-35);
      out.push('','FOOD LOG, LAST 7 DAYS (included at my request):',entries.length?entries.map(x=>[x.date,x.slot||'Meal',x.title||'Unknown',x.servings?x.servings+' servings':x.amount||''].join(' | ')).join('\n'):'(none)');
    }
    if(val('kcp-restaurants').checked){
      const entries=Array.isArray(p.restaurantOrders)?p.restaurantOrders.slice(-12):[];
      out.push('','RESTAURANT ORDERS (included at my request):',entries.length?entries.map(x=>(x.restaurant||x.restaurantName||'Restaurant')+': '+(x.title||x.order||x.description||'Order')).join('\n'):'(none)');
    }
    if(val('kcp-menu').checked){
      const active=new Set(Array.isArray(p.active)?p.active:D.meals.map(x=>x.slug));
      out.push('','ACTIVE MENU TITLES:',all.filter(m=>active.has(m.slug)).slice(0,100).map(m=>m.category+': '+m.title).join('\n'));
    }
    out.push('','Answer clearly. For facts about real restaurants, use official menu sources if available. Nutrition estimates are not laboratory measurements.');
    return out.join('\n').slice(0,30000);
  }
  function status(msg,err=false){const x=document.getElementById('kcp-status');if(x){x.textContent=msg;x.style.color=err?'#a3203b':'#236b56';}}
  function preview(){const x=document.getElementById('kcp-preview');if(x)x.value=context();}
  function css(){
    if(document.getElementById('kcp-css'))return;
    const el=document.createElement('style');el.id='kcp-css';
    el.textContent='#kitchen-chatgpt-personal{max-width:1280px;margin:22px auto;background:#f7fbf9;border:1px solid #d5e6de;border-radius:18px;padding:24px;box-shadow:0 4px 18px rgba(0,55,40,.05)}#kitchen-chatgpt-personal h2{font-size:1.35rem;color:#174e40;margin:5px 0 9px}#kitchen-chatgpt-personal p{line-height:1.5}#kitchen-chatgpt-personal .kcp-tag{font-size:.74rem;color:#27715e;font-weight:800;letter-spacing:.08em}#kitchen-chatgpt-personal .kcp-grid{display:grid;grid-template-columns:1fr 1fr;gap:22px}#kitchen-chatgpt-personal label:not(.kcp-opt){display:block;font-size:.86rem;font-weight:700;margin:12px 0 6px}#kitchen-chatgpt-personal select,#kitchen-chatgpt-personal textarea{display:block;width:100%;box-sizing:border-box;border:1px solid #bfd3cb;border-radius:9px;background:#fff;color:#213a31;padding:10px 11px;font:inherit}#kitchen-chatgpt-personal .kcp-opt{display:block;font-size:.83rem;margin:8px 0;font-weight:400}#kitchen-chatgpt-personal .kcp-opt input{margin-right:8px;accent-color:#27715e}#kcp-preview{height:310px;font-size:.8rem;line-height:1.5;resize:vertical}#kitchen-chatgpt-personal .kcp-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:15px}#kitchen-chatgpt-personal .kcp-note{font-size:.81rem;color:#4f6d60}#kitchen-chatgpt-personal details{border-top:1px solid #d5e5df;margin-top:16px;padding-top:13px}#kitchen-chatgpt-personal summary{cursor:pointer;font-weight:750}#kcp-project-text{margin:10px 0;font-size:.8rem;line-height:1.45;resize:vertical}.local-kitchen-toolbox,.hosted-external-actions{display:none!important}@media(max-width:900px){#kitchen-chatgpt-personal .kcp-grid{grid-template-columns:1fr}#kitchen-chatgpt-personal{padding:16px}#kcp-preview{height:170px}}';
    document.head.appendChild(el);
  }
  function mount(){
    const form=document.getElementById('assistant-form');
    if(!form||document.getElementById('kitchen-chatgpt-personal'))return;
    css();
    const p=document.createElement('section');p.id='kitchen-chatgpt-personal';
    p.innerHTML=[
      '<div class="kcp-tag">PERSONAL CHATGPT • NO API KEY</div>',
      '<h2>Ask ChatGPT about your kitchen</h2>',
      '<p class="kcp-note">Use your own ChatGPT plan for real AI answers. The public Kitchen site cannot embed ChatGPT directly; this prepares your question and opens ChatGPT in a separate browser tab.</p>',
      '<div class="kcp-grid"><div>',
      '<label for="kcp-task">Type of question</label>',
      '<select id="kcp-task"><option value="general">Ask anything</option><option value="homemade">Create a homemade recipe</option><option value="restaurant">Compare a restaurant order</option><option value="weekly">Plan a weekly refresh</option><option value="nutrition">Explain nutrition or substitutions</option><option value="shopping">Prepare a shopping list</option></select>',
      '<label for="kcp-question">Your question or meal description</label>',
      '<textarea id="kcp-question" rows="4" maxlength="4000" placeholder="For example: I made chicken, rice, peppers and lemon. Turn that into a recipe."></textarea>',
      '<div class="kcp-note" style="margin-top:12px"><strong>Optional details to copy to ChatGPT</strong></div>',
      '<label class="kcp-opt"><input id="kcp-favs" type="checkbox" checked> Favorites and reviewed meals</label>',
      '<label class="kcp-opt"><input id="kcp-journal" type="checkbox"> Last 7 days of journal entries</label>',
      '<label class="kcp-opt"><input id="kcp-restaurants" type="checkbox"> Recent restaurant orders</label>',
      '<label class="kcp-opt"><input id="kcp-menu" type="checkbox"> Names of meals in my menu</label>',
      '</div><div><label for="kcp-preview">Preview of the exact text to copy</label>',
      '<textarea id="kcp-preview" readonly aria-label="ChatGPT prompt preview"></textarea>',
      '<p class="kcp-note">Nothing is transmitted automatically. You choose the optional details and paste the message into ChatGPT yourself.</p>',
      '</div></div><div class="kcp-actions">',
      '<button id="kcp-copy-open" type="button" class="button">Copy prompt &amp; open ChatGPT ↗</button>',
      '<button id="kcp-copy" type="button" class="button secondary">Copy prompt only</button></div>',
      '<p id="kcp-status" role="status" class="kcp-note">Choose your Kitchen App Project inside ChatGPT, then paste your prepared prompt. Replies stay in ChatGPT until you bring them back.</p>',
      '<details><summary>Keep your Kitchen rules in a ChatGPT Project</summary>',
      '<p class="kcp-note">Open the existing Kitchen App project in ChatGPT, then Project settings → Instructions, and paste these once. Personal ChatGPT accounts can use Projects.</p>',
      '<textarea id="kcp-project-text" rows="7" readonly></textarea>',
      '<button id="kcp-copy-project" type="button" class="button secondary small">Copy Project instructions</button></details>'
    ].join('');
    const layout=form.closest('.assistant-layout');
    if(layout)layout.insertAdjacentElement('afterend',p);else form.insertAdjacentElement('afterend',p);
    p.querySelector('#kcp-project-text').value=PROJECT;
    preview();
  }
  const clipboard=(text,onSuccess)=>{
    const box=document.getElementById('kcp-preview');
    if(navigator.clipboard?.writeText)navigator.clipboard.writeText(text).then(onSuccess).catch(()=>{
      if(box){box.focus();box.select();}
      status('Clipboard blocked. The prompt is selected. Press Ctrl+C (or Cmd+C) to copy it.',true);
    });
    else{
      if(box){box.focus();box.select();}
      status('Copy unavailable. Select the highlighted prompt with Ctrl+C or Cmd+C.',true);
    }
  };
  document.addEventListener('input',e=>{if(e.target?.closest?.('#kitchen-chatgpt-personal')||e.target?.id==='assistant-question')preview();});
  document.addEventListener('change',e=>{
    if(e.target?.id==='kcp-task'){const q=document.getElementById('kcp-question');if(q&&(!q.value||Object.values(PREFILL).includes(q.value)))q.value=PREFILL[e.target.value]||'';}
    if(e.target?.closest?.('#kitchen-chatgpt-personal'))preview();
  });
  document.addEventListener('click',e=>{
    const b=e.target?.closest?.('button');if(!b)return;
    if(b.id==='kcp-copy'||b.id==='kcp-copy-open'){
      e.preventDefault();const t=document.getElementById('kcp-task'),q=document.getElementById('kcp-question');
      if(t?.value==='general'&&!q?.value.trim()&&!document.getElementById('assistant-question')?.value.trim()){
        status('Enter a question or choose a task above.',true);q?.focus();return;
      }
      const prompt=context();preview();
      if(b.id==='kcp-copy-open')window.open('https://chatgpt.com/','_blank','noopener,noreferrer');
      clipboard(prompt,()=>status((b.id==='kcp-copy-open'?'ChatGPT opened; prompt copied.':'Prompt copied.')+' Paste with Ctrl+V or Cmd+V.'));
    }
    if(b.id==='kcp-copy-project'){
      e.preventDefault();clipboard(PROJECT,()=>status('Project instructions copied. Paste into ChatGPT Project settings.'));
    }
  });
  let pending=false;
  const schedule=()=>{if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;mount();});};
  const main=document.getElementById('main');
  if(main)new MutationObserver(schedule).observe(main,{childList:true});
  window.addEventListener('hashchange',schedule);
  schedule();
})();
