const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const assistant = fs.readFileSync("site/kitchen-assistant-local.js", "utf8");
const bridge = fs.readFileSync("site/kitchen-chatgpt-personal-bridge.js", "utf8");

const recipes = [
  {slug:"lemon-chicken",title:"Lemon chicken rice bowl",category:"Dinners",description:"Chicken with lemon and rice",ingredients:[{key:"chicken"},{key:"rice"}],totalMinutes:35,isDinnerGF:true},
  {slug:"berry-smoothie",title:"Berry banana smoothie",category:"Smoothies & Drinks",description:"Fruit and milk",ingredients:[{key:"berries"},{key:"milk"}],totalMinutes:5}
];
const ingredientLookup = {chicken:{name:"Chicken"},rice:{name:"Brown rice"},berries:{name:"Berries"},milk:{name:"Milk"}};
const appended = [], listeners = {}, formInput = {value:""};
const makeEl = () => ({
  children:[], dataset:{}, style:{}, textContent:"", className:"",
  appendChild(el){this.children.push(el);},
  setAttribute(){},
});
const box=makeEl();
const document = {
  getElementById(id){return id==="assistant-messages"?box:id==="assistant-question"?formInput:null;},
  querySelector(){return null;},
  addEventListener(type,fn){listeners[type]=fn;},
  createElement(){return makeEl();}
};
box.appendChild = el => appended.push(el);
const storage={getItem(){return null;},setItem(){}};
const ctx={window:{KITCHEN_DATA:{meals:recipes,ingredients:ingredientLookup},addEventListener(){}},document,localStorage:storage,MutationObserver:class{},requestAnimationFrame:()=>{},setTimeout:()=>{},location:{hash:""}};
vm.runInNewContext(assistant,ctx,{filename:"kitchen-assistant-local.js"});
assert.equal(typeof listeners.submit,"function");

function query(q){
  formInput.value=q;
  listeners.submit({target:{id:"assistant-form"},preventDefault(){},stopImmediatePropagation(){}});
  const wrap=appended.filter(el=>el.className==="assistant-message assistant").at(-1);
  assert(wrap, "Assistant reply should be rendered");
  return wrap.children.find(el=>typeof el.textContent==="string" && el.textContent.startsWith("This is") || el.textContent.startsWith("I cannot") || el.textContent.startsWith("No matching") || el.textContent.startsWith("Here are"))?.textContent ?? wrap.children[1].textContent;
}
const recipe=query("Suggest a dinner with chicken");
const unrelated=query("Can you explain the orbit of Neptune?");
const smoothie=query("Show a smoothie with berries");
assert.match(recipe,/keyword search|menu matches/i);
assert.match(recipe,/chicken/i);
assert.match(unrelated,/cannot answer|personal ChatGPT/i);
assert.notEqual(recipe,unrelated,"Distinct questions should not receive the same generic reply");
assert.match(smoothie,/berries/i);
assert(bridge.includes("layout.style.setProperty('display','none','important')"),"Legacy in-page form must be hidden");
assert(!bridge.includes("document.getElementById('assistant-question')?.value.trim()||"),"Bridge must not silently use stale legacy question");
assert(bridge.indexOf("clipboard(prompt,") < bridge.indexOf("if(b.id==='kcp-copy-open')window.open("),"Copy must be attempted before focus changes");
console.log("PASS: keyword replies are relevant or explicitly limited; personal ChatGPT handoff is primary and copies before opening.");

