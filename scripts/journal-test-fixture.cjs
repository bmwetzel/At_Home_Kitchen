'use strict';
// Executes the actual application script with explicit minimal UI stubs.
// This verifies event/data contracts, not browser layout or native form behavior.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = p => {
  if (p.startsWith('data/')) {
    const html=fs.readFileSync(path.join(root,'site/index.html'),'utf8');
    const block=p.includes('variations')?'kitchen-candidates':'kitchen-data';
    const prefix=p.includes('variations')?'window.KITCHEN_CANDIDATES=':'window.KITCHEN_DATA=';
    const match=html.match(new RegExp('<script\\b[^>]*id="'+block+'"[^>]*>([\\s\\S]*?)</script>'));
    if(!match) throw new Error('Missing embedded fixture data: '+block);
    return match[1].trim().slice(prefix.length).replace(/;$/, '');
  }
  return fs.readFileSync(path.join(root,p),'utf8');
};

function fixture({storage=new Map(), hash='#/journal', protocol='file:', responses=[]}={}) {
  const listeners={}, winListeners={}, elements=new Map(), errors=[], requests=[];
  const timers=new Map(); let timerId=0;
  class Element {
    constructor(tag='div',id='') { this.tagName=tag.toUpperCase();this.id=id;this._html='';this.value='';this.hidden=false;this.dataset={};this.attrs={};this.children=[];this.textContent='';this.open=false;this.checked=false;this.disabled=false;this.style={};this.scrollHeight=0;this.elements={};
      const classes=new Set();this.classList={add:(...n)=>n.forEach(x=>classes.add(x)),remove:(...n)=>n.forEach(x=>classes.delete(x)),contains:n=>classes.has(n),toggle(n,force){if(force===undefined)force=!classes.has(n);if(force)classes.add(n);else classes.delete(n);return force;}};
    }
    set innerHTML(html){this._html=String(html);for(const match of this._html.matchAll(/<([a-z][\w-]*)\b[^>]*\bid="([^"]+)"[^>]*>/gi)){if(!elements.has(match[2]))elements.set(match[2],new Element(match[1],match[2]));}}
    get innerHTML(){return this._html;}
    setAttribute(k,v){this.attrs[k]=String(v);if(k==='id')this.id=String(v);}
    getAttribute(k){return k==='id'?this.id:this.attrs[k]??null;}
    append(...nodes){for(const node of nodes){this.children.push(node);if(node.id)elements.set(node.id,node);}}
    appendChild(node){this.append(node);return node;}
    prepend(...nodes){this.children.unshift(...nodes);}
    remove(){elements.delete(this.id);}
    focus(){document.activeElement=this;}
    showModal(){this.open=true;}
    close(){this.open=false;}
    addEventListener(type,fn){(this.listeners??={})[type]??=[];this.listeners[type].push(fn);}
    removeEventListener(){}
    scrollIntoView(){}
    querySelector(s){return query(s);}
    querySelectorAll(){return [];}
    insertAdjacentHTML(_pos,s){this.innerHTML+=s;}
    closest(){return null;}
    click(){}
  }
  for(const id of ['main','site-header','site-footer','toast'])elements.set(id,new Element('div',id));
  const syntheticSelectors=new Map();
  const query=s=>s.startsWith('#')&&/^#[\w-]+$/.test(s)?elements.get(s.slice(1))||null:syntheticSelectors.get(s)||null;
  const document={title:'',hidden:false,body:new Element('body'),activeElement:null,
    getElementById:id=>elements.get(id)||null,createElement:tag=>new Element(tag),
    querySelector:query,querySelectorAll:()=>[],execCommand:()=>false,
    addEventListener:(t,fn)=>(listeners[t]||=[]).push(fn)};
  class FixtureFormData {
    constructor(form){this.values=form&&form.values||{};}
    get(k){let v=this.values[k];return v===undefined?null:Array.isArray(v)?v[0]:v;}
    getAll(k){let v=this.values[k];return v===undefined?[]:Array.isArray(v)?v:[v];}
    has(k){return Object.hasOwn(this.values,k);}
    entries(){return Object.entries(this.values)[Symbol.iterator]();}
    [Symbol.iterator](){return this.entries();}
  }
  const env={document,location:{hash,protocol,hostname:protocol==='file:'?'':'127.0.0.1',href:protocol==='file:'?'file:///Kitchen.html':'http://127.0.0.1:8787/'},
    localStorage:{getItem:k=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},
    console:{log(){},warn(){},error:(...v)=>errors.push(v.map(String).join(' '))},
    setTimeout:(fn,ms)=>{timers.set(++timerId,{fn,ms});return timerId;},clearTimeout:id=>timers.delete(id),setInterval:()=>0,clearInterval(){},
    URL,URLSearchParams,Date,Math,JSON,Intl,AbortController,FormData:FixtureFormData,Blob,TextEncoder,TextDecoder,
    navigator:{clipboard:{writeText:async()=>{}}},confirm:()=>true,scrollTo(){},scrollY:0,print(){},isSecureContext:false,
    addEventListener:(t,fn)=>(winListeners[t]||=[]).push(fn),
    fetch:async(url,opts={})=>{requests.push({url,opts});if(!responses.length)throw new Error('No network response supplied to this offline fixture.');const result=responses.shift();if(result instanceof Error)throw result;return {ok:result.ok!==false,status:result.status||200,json:async()=>result.body??result};},
    KITCHEN_DATA:JSON.parse(read('data/base-recipes.json')),KITCHEN_CANDIDATES:JSON.parse(read('data/recipe-variations.json')),
    KITCHEN_BOOT:{complete(){},restore:e=>errors.push(String(e&&e.stack||e))}
  };
  env.window=env;env.globalThis=env;
  vm.createContext(env);
  vm.runInContext(read('source/personalization-rules.js'),env,{filename:'personalization-rules.js'});
  vm.runInContext(read('source/journal-customizations.js'),env,{filename:'journal-customizations.js'});
  vm.runInContext(read('source/app.js'),env,{filename:'app.js'});
  async function dispatch(type,event){for(const fn of elements.get('main').listeners?.[type]||[])await fn(event);for(const fn of listeners[type]||[])await fn(event);await Promise.resolve();}
  async function click(dataset){const target=new Element('button');target.dataset=dataset;target.closest=s=>s==='[data-k]'&&dataset.k?target:s==='[data-action]'&&dataset.action?target:s==='[data-work]'&&dataset.work?target:null;await dispatch('click',{target,preventDefault(){}});}
  async function submit(id,values){const target=elements.get(id)||new Element('form',id);target.values=values;target.querySelector=s=>syntheticSelectors.get(s)||null;await dispatch('submit',{target,preventDefault(){}});return target;}
  async function navigate(hash){env.location.hash=hash;for(const fn of winListeners.hashchange||[])await fn();}
  async function change(id,{value='',files=[]}={}){const target=elements.get(id)||new Element('input',id);target.value=value;target.files=files;await dispatch('change',{target,preventDefault(){}});await Promise.resolve();}
  return {env,storage,elements,errors,requests,responses,listeners,winListeners,syntheticSelectors,Element,click,submit,navigate,change,
    snapshot:()=>JSON.parse(JSON.stringify(env.KITCHEN_TEST.snapshot())),
    page:()=>elements.get('main').innerHTML,
    dialog:()=>elements.get('kitchen-dialog')||elements.get('personal-dialog')||[...elements.values()].find(e=>e.tagName==='DIALOG')};
}
module.exports={fixture,read,root};
