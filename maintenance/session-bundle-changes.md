# 保存与恢复功能：发布文件修改对照

基线提交：`1f678ad7156120c7d7100eedb74bc65859f34bd0`。可运行 `node maintenance/apply-session-release.cjs` 复现本轮发布文件；运行前请确保没有其他发布文件修改。

## 1

修改前：

```js
localStorage.getItem("newton-data")
```

修改后：

```js
window.NewtonSession.storage.read("newton-data")
```

## 2

修改前：

```js
localStorage.getItem("newton-progress")
```

修改后：

```js
window.NewtonSession.storage.read("newton-progress")
```

## 3

修改前：

```js
try{localStorage.setItem("newton-data",JSON.stringify({rows:u,origin:m,synthetic:b,options:y,imageMeta:x}))}catch{}
```

修改后：

```js
window.NewtonSession.storage.save("newton-data",{rows:u,origin:m,synthetic:b,options:y,imageMeta:x});
```

## 4

修改前：

```js
try{localStorage.setItem("newton-progress",JSON.stringify(Q))}catch{}
```

修改后：

```js
window.NewtonSession.storage.save("newton-progress",Q);
```

## 5

修改前：

```js
let u=Q(),m="尚未录入"
```

修改后：

```js
const dataHistory=window.NewtonSession.createHistory();let u=Q(),m="尚未录入"
```

## 6

修改前：

```js
function A(n,t,o=!1,l=null){x=l,u=n.map(w=>({...w})),m=t,b=o,c(),T()}
```

修改后：

```js
function syncDataUndo(){I("dataUndo").disabled=dataHistory.size===0}function clearDataUndo(){dataHistory.clear();syncDataUndo()}function rememberData(){dataHistory.push({rows:u,origin:m,synthetic:b,imageMeta:x,options:y,symbol:H});syncDataUndo()}function restoreDataUndo(){const previous=dataHistory.pop();if(!previous)return;y=previous.options;H=previous.symbol;r();A(previous.rows,previous.origin,previous.synthetic,previous.imageMeta,true);R("已撤销删除或清空，原始读数、来源和参数已恢复。")}function A(n,t,o=!1,l=null,keepUndo=false){if(!keepUndo)clearDataUndo();x=l,u=n.map(w=>({...w})),m=t,b=o,c(),T();syncDataUndo()}
```

## 7

修改前：

```js
e.addEventListener("input",n=>{const t=n.target;
```

修改后：

```js
e.addEventListener("input",n=>{clearDataUndo();const t=n.target;
```

## 8

修改前：

```js
e.addEventListener("change",n=>{n.target.id
```

修改后：

```js
e.addEventListener("change",n=>{clearDataUndo();n.target.id
```

## 9

修改前：

```js
if(t){u.splice(+t.dataset.remove,1),c(),T(),R("已删除该行。");return}
```

修改后：

```js
if(t){rememberData();u.splice(+t.dataset.remove,1),c(),T(),R("已删除该行，可点击撤销。");return}
```

## 10

修改前：

```js
if(o){if(o==="chart-png"
```

修改后：

```js
if(o){if(o==="undo"){restoreDataUndo();return}if(o==="chart-png"
```

## 11

修改前：

```js
else if(o==="export"){
```

修改后：

```js
else if(o==="export"||o==="export-backup"){
```

## 12

修改前：

```js
e.querySelector("[data-action=export]").disabled=u.length===0
```

修改后：

```js
e.querySelectorAll("[data-action=export],[data-action=export-backup]").forEach(button=>button.disabled=u.length===0)
```

## 13

修改前：

```js
else if(o==="clear")A(Q(),"尚未录入"),R("读数已清空，恢复 5–30 环的六行。");
```

修改后：

```js
else if(o==="clear")rememberData(),A(Q(),"尚未录入",false,null,true),R("读数已清空，可点击撤销恢复原读数与来源。");
```

## 14

修改前：

```js
else if(o==="add"){if(u.length
```

修改后：

```js
else if(o==="add"){clearDataUndo();if(u.length
```

## 15

修改前：

```js
else if(o==="training")a(window.newtonTrainingData);
```

修改后：

```js
else if(o==="training")a(window.getNewtonTrainingData?.()||window.newtonTrainingData);
```

## 16

修改前：

```js
<button type="button" class="data-btn" data-action="clear">清空读数</button>
```

修改后：

```js
<button type="button" class="data-btn" data-action="clear">清空读数</button><button type="button" class="data-btn" id="dataUndo" data-action="undo" disabled>撤销删除 / 清空</button>
```

## 17

修改前：

```js
<p class="data-status" id="dataStatus" role="status" aria-live="polite"></p>
```

修改后：

```js
<p class="data-status" id="dataStatus" role="status" aria-live="polite"></p><div class="save-row"><p id="dataSaveStatus" class="save-status" role="status"></p><span id="dataSaveTools" hidden><button type="button" class="data-btn" data-retry-storage="newton-data">重试保存</button><button type="button" class="data-btn" data-action="export-backup">导出读数 CSV</button></span></div><p class="data-tip">可撤销本页最近 20 次连续删除或清空；继续编辑、添加或载入数据后撤销记录重置。</p>
```

## 18

修改前：

```js
let Q={};try{Q=window.NewtonReleaseSupport.restoreProgress
```

修改后：

```js
const progressHistory=window.NewtonSession.createHistory(1);let Q={};try{Q=window.NewtonReleaseSupport.restoreProgress
```

## 19

修改前：

```js
function D(){window.NewtonSession.storage.save("newton-progress",Q);
```

修改后：

```js
function D(keepUndo=false){if(!keepUndo)progressHistory.clear();f("undoProgress").disabled=progressHistory.size===0;window.NewtonSession.storage.save("newton-progress",Q);
```

## 20

修改前：

```js
f("resetProgress").onclick=()=>{Q={},D(),G("已重置学习标记；实验读数仍保留。")}
```

修改后：

```js
f("resetProgress").onclick=()=>{progressHistory.push(Q);Q={},D(true),G("已重置学习标记；可撤销重置。实验读数仍保留。")},f("undoProgress").onclick=()=>{const previous=progressHistory.pop();if(previous){Q=previous;D(true);G("已恢复学习标记。")}}
```

## 21

修改前：

```js
const u=[30,25,20,15,10,5,5,10,15,20,25,30];let m=[],b=!1,p=13;const x=a=>21+(a<6?-1:1)*Math.sqrt(u[a]*3e3*5893e-7);let y=1;function H(){const a=f("measureCanvas"),n=+f("measurePosition").value;Y(a,3e3,589.3,0,{extent:16/y,offset:21-n,cross:!0}),f("measureReading").textContent=n.toFixed(3),f("measureZoomValue").textContent=y.toFixed(2)+"× · 短边视场 "+(16/y).toFixed(2)+" mm"}function P(a){y=nt(a,.5,8),H()}f("measureZoomIn").onclick=()=>P(y*1.25),f("measureZoomOut").onclick=()=>P(y/1.25),f("measureZoomReset").onclick=()=>P(1),f("measureCanvas").addEventListener("wheel",a=>{a.preventDefault(),P(y*Math.exp(-a.deltaY*.001))},{passive:!1});function I(){const a=m.length;f("measureTarget").textContent=a<12?(a<6?"左侧":"右侧")+" · 第 "+u[a]+" 暗环":"测量完成",f("trainingCount").textContent=`已记录 ${a} / 12`,f("recordReading").disabled=a===12||b,f("showHint").disabled=a===12||b,f("sendToData").disabled=a!==12||b,f("trainingLog").innerHTML=m.map((n,t)=>`<span>${t<6?"左":"右"} ${u[t]}：${n.toFixed(3)}</span>`).join("")}function R(a,n=!1){f("measureFeedback").textContent=a,f("measureFeedback").className="feedback "+(n?"error":"success")}function r(a){a=nt(a,13,29),m.length&&a<p-5e-4&&(b=!0,R("检测到反向移动：本组读数失效，请点击“重新开始”消除空程影响。",!0),I()),f("measurePosition").value=a,p=a,H()}f("measurePosition").oninput=a=>r(+a.target.value),f("moveBack").onclick=()=>r(+f("measurePosition").value-.01),f("moveNext").onclick=()=>r(+f("measurePosition").value+.01),f("showHint").onclick=()=>{const a=x(m.length);if(a<p-5e-4&&m.length){R("已越过目标环；不能反转找回，请重新开始本组。",!0);return}r(+a.toFixed(3)),R("已定位目标暗纹切线。观察叉丝位置后点击“记录当前读数”。")},f("recordReading").onclick=()=>{const a=+f("measurePosition").value,n=x(m.length);if(Math.abs(a-n)>.018){R("当前叉丝尚未对准目标暗纹切线，请缓慢移动或查看定位提示。",!0);return}m.push(a),I(),R(m.length===12?"12 个位置已记录。可以送入数据处理，核对直径与 R。":"读数已记录。沿相同方向移动到下一目标环。")},f("resetTraining").onclick=()=>{m=[],b=!1,p=13,f("measurePosition").value=13,I(),H(),R("已重启。从左外侧进入第 30 环，保持单向移动。")},f("sendToData").onclick=()=>{window.newtonTrainingData=[5,10,15,20,25,30].map(a=>({k:a,xL:m[u.slice(0,6).indexOf(a)],xR:m[6+u.slice(6).indexOf(a)]})),window.loadTrainingData?.(window.newtonTrainingData),location.hash="data",G("已送入 6 组模拟读数，已明确标注为训练数据。")},I();
```

修改后：

```js
const training=window.NewtonSession.initTraining(Y,G);function H(){training.render()}
```
