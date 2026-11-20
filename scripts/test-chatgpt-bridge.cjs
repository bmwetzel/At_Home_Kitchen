'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../site/kitchen-chatgpt-personal-bridge.js'),'utf8');

function fixture({session=new Map(),copy='success',storageBlocked=false}={}){
  const nodes=new Map(),events={},windowEvents={},operations=[];
  const state={focused:null,selected:null};
  class Element{
    constructor(tag='div',id=''){this.tagName=tag;this.id=id;this.value='';this.checked=false;this.textContent='';this.children=[];this.attributes={};this.style={setProperty:(k,v)=>{this.style[k]=v;}};}
    set innerHTML(html){
      this.html=html;this.fields=new Map();
      for(const hit of html.matchAll(/<([a-z]+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)){
        const el=new Element(hit[1],hit[3]);el.parent=this;
        el.checked=/\bchecked(?:\s|>|$)/.test(hit[2]);
        if(el.id==='kcp-task')el.value='general';
        this.fields.set(el.id,el);nodes.set(el.id,el);
      }
    }
    querySelector(selector){return this.fields?.get(selector.slice(1))||null;}
    closest(selector){if(selector==='button')return this.tagName==='button'?this:null;if(selector==='#kitchen-chatgpt-personal')return this.id==='kitchen-chatgpt-personal'?this:this.parent||null;if(selector==='.assistant-layout')return layout;return null;}
    appendChild(el){this.children.push(el);nodes.set(el.id,el);}
    insertAdjacentElement(where,el){nodes.set(el.id,el);}
    setAttribute(k,v){this.attributes[k]=v;}
    focus(){state.focused=this.id;}
    select(){state.selected=this.id;}
  }
  const layout=new Element('div','layout');
  nodes.set('assistant-form',new Element('form','assistant-form'));
  nodes.set('assistant-question',new Element('textarea','assistant-question'));
  nodes.set('main',new Element('main','main'));
  const local={
    'at-home-kitchen:v1':JSON.stringify({favorites:['private-favorite']}),
    'at-home-kitchen:personal:v3':JSON.stringify({
      prefs:{avoid:['private-avoid']},ratings:{},
      journal:[{date:new Date().toISOString().slice(0,10),title:'Private journal meal',slot:'Lunch',servings:1}],
      restaurantOrders:[{restaurant:'Private restaurant',description:'Private order'}]
    })
  };
  const document={getElementById:id=>nodes.get(id)||null,createElement:tag=>new Element(tag),head:new Element('head'),addEventListener:(type,fn)=>{(events[type]??=[]).push(fn);}};
  const window={KITCHEN_DATA:{meals:[{slug:'private-favorite',title:'Private favorite',category:'Lunches'}]},addEventListener:(type,fn)=>{windowEvents[type]=fn;},open:(url,...args)=>{operations.push({type:'open',url,args});return null;}};
  const navigator=copy==='unavailable'?{}:{clipboard:{writeText:text=>{operations.push({type:'copy',text});return copy==='success'?Promise.resolve():Promise.reject(Error('clipboard blocked'));}}};
  const context={window,document,navigator,sessionStorage:{getItem:k=>{if(storageBlocked)throw Error('blocked');return session.get(k)||null;},setItem:(k,v)=>{if(storageBlocked)throw Error('blocked');session.set(k,v);}},localStorage:{getItem:k=>local[k]||null},MutationObserver:class{observe(){}},requestAnimationFrame:fn=>fn(),location:{hash:'#/assistant'}};
  vm.runInNewContext(source,context,{filename:'kitchen-chatgpt-personal-bridge.js'});
  return {nodes,operations,state,session,window,layout,context,
    event(type,id){for(const fn of events[type]||[])fn({target:nodes.get(id),preventDefault(){}});},
    remount(){for(const id of [...nodes.keys()])if(id==='kitchen-chatgpt-personal'||id.startsWith('kcp-'))nodes.delete(id);windowEvents.hashchange();}
  };
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));

(async()=>{
  const app=fixture(),q=app.nodes.get('kcp-question');
  assert.match(app.nodes.get('kitchen-chatgpt-personal').html,/ChatGPT is not connected to this website/);
  assert.equal(app.layout.style.display,'none');
  assert.equal(app.operations.length,0,'Loading the assistant must not send, copy or open anything');
  app.nodes.get('assistant-question').value='This stale hidden question must not be used';
  app.event('click','kcp-copy');await settle();
  assert.equal(app.operations.length,0,'Blank visible questions cannot use stale hidden text');
  assert.match(app.nodes.get('kcp-status').textContent,/Enter a question/);

  const exact='  How can I use these leftovers?\nChicken, rice & peppers.  ';
  q.value=exact;app.event('input','kcp-question');
  const preview=app.nodes.get('kcp-preview').value;
  assert(preview.includes('MY REQUEST:\n'+exact),'The prompt must preserve exact wording and whitespace');
  assert(!/Private favorite|Private journal meal|Private restaurant|private-avoid/.test(preview),'No optional details are shared by default');
  app.nodes.get('kcp-favs').checked=true;app.event('change','kcp-favs');
  assert.match(app.nodes.get('kcp-preview').value,/Private favorite/);
  assert(!app.nodes.get('kcp-preview').value.includes('Private journal meal'));
  app.remount();assert.equal(app.nodes.get('kcp-question').value,exact,'Draft survives route remount');
  const reload=fixture({session:app.session});
  assert.equal(reload.nodes.get('kcp-question').value,exact,'Draft survives page reload in the same tab');
  assert.equal(reload.nodes.get('kcp-favs').checked,true,'Chosen sharing option survives reload');
  assert.equal(reload.nodes.get('kcp-journal').checked,false);

  reload.event('click','kcp-copy-open');await settle();
  assert.deepEqual(reload.operations.map(x=>x.type),['copy','open'],'Copy must start before opening changes focus');
  assert(reload.operations[0].text.includes(exact));
  assert.equal(reload.operations[1].url,'https://chatgpt.com/','Private context must not appear in the URL');
  assert.match(reload.nodes.get('kcp-status').textContent,/Prompt copied/);
  assert.match(reload.nodes.get('kcp-status').textContent,/Nothing has been sent/);
  assert(!reload.nodes.get('kcp-status').textContent.includes('ChatGPT opened'),'Popup opening is not assumed to succeed');

  const task='  Restaurant: Example Cafe\nOrder: chicken wrap, no sauce.  ';
  const count=reload.operations.length;
  assert.equal(reload.window.KitchenChatGPTBridge.prepareTask({task:'restaurant',question:task}),true);
  assert.equal(reload.nodes.get('kcp-question').value,task);
  assert.equal(reload.nodes.get('kcp-task').value,'restaurant');
  assert.equal(reload.context.location.hash,'#/assistant');
  assert.equal(reload.operations.length,count,'Preparing a task cannot copy, open or send automatically');
  assert.equal(fixture({session:reload.session}).nodes.get('kcp-question').value,task);

  const blocked=fixture({copy:'blocked'});
  blocked.window.KitchenChatGPTBridge.prepareTask({task:'general',question:'What can I make?'});
  blocked.event('click','kcp-copy');await settle();
  assert.equal(blocked.state.selected,'kcp-preview');
  assert(!blocked.nodes.get('kcp-status').textContent.includes('Prompt copied'));
  blocked.event('click','kcp-copy-project');await settle();
  assert.equal(blocked.state.selected,'kcp-project-text','Project copy fallback selects Project instructions');
  assert.match(blocked.nodes.get('kcp-project-text').value,/At-Home Kitchen Project instructions/);
  assert.match(blocked.nodes.get('kcp-status').textContent,/Project instructions/);
  assert(!blocked.nodes.get('kcp-status').textContent.includes('instructions copied'));

  const noClipboard=fixture({copy:'unavailable',storageBlocked:true});
  assert.equal(noClipboard.window.KitchenChatGPTBridge.prepareTask({task:'homemade',question:'My homemade meal'}),true);
  noClipboard.event('click','kcp-copy');await settle();
  assert.equal(noClipboard.state.selected,'kcp-preview','Manual copy remains available without clipboard/storage permissions');
  console.log('PASS: honest connection status, exact drafts, opt-in context, task handoff, and clipboard success/failure paths.');
})().catch(error=>{console.error(error);process.exitCode=1;});
