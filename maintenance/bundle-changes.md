# 发布文件修复对照

原始开发工程不在此仓库。本文件仅列出公开 JavaScript 发布产物的修改点，便于审阅和同步回开发工程。

## 1

修改前：
```js
G=e=>e!==""&&e!==null&&e!==void 0&&Number.isFinite(Number(e))
```

修改后：
```js
G=window.NewtonReleaseSupport.isNumeric
```

## 2

修改前：
```js
function Y(e){const u=[];let m=[],b="",p=!1;const x=String(e).replace(/^\uFEFF/,"");for(let r=0;r<x.length;r++){const c=x[r];c==='"'?p&&x[r+1]==='"'?(b+='"',r++):p=!p:!p&&(c===","||c==="	"||c===";")?(m.push(b.trim()),b=""):!p&&(c===`
`||c==="\r")?(c==="\r"&&x[r+1]===`
`&&r++,m.push(b.trim()),m.some(T=>T!=="")&&u.push(m),m=[],b=""):b+=c}if(p)throw Error("CSV 引号未闭合。");if(m.push(b.trim()),m.some(r=>r!=="")&&u.push(m),!u.length)throw Error("CSV 没有数据。");const y=u[0].map(r=>r.toLowerCase().replace(/\s/g,""));let P=[["k","环级次","级次","环数"],["xl","xl_mm","x_l","左","左/mm","左读数"],["xr","xr_mm","x_r","右","右/mm","右读数"]].map(r=>y.findIndex(c=>r.includes(c)));const I=P.every(r=>r>=0);if(!I)if(u[0].slice(0,3).every(G))P=[0,1,2];else throw Error("表头请使用 k,xL_mm,xR_mm，或直接填写三列数字。");const R=u.slice(I?1:0);if(R.length<1||R.length>120)throw Error("请导入 1–120 行读数。");return R.map((r,c)=>{const T=P.map(A=>r[A]);if(T.some(A=>!G(A)))throw Error(`CSV 第 ${c+(I?2:1)} 行包含空值或非数字。`);if(!Number.isInteger(+T[0])||+T[0]<0)throw Error(`CSV 第 ${c+(I?2:1)} 行级次不是非负整数。`);if(+T[1]==+T[2])throw Error(`CSV 第 ${c+(I?2:1)} 行直径为 0。`);return{k:+T[0],xL:+T[1],xR:+T[2]}})}
```

修改后：
```js
function Y(e){return window.NewtonReleaseSupport.parseCsv(e)}
```

## 3

修改前：
```js
JSON.parse(localStorage.getItem("newton-data")||"null")
```

修改后：
```js
window.NewtonReleaseSupport.restoreData(localStorage.getItem("newton-data"))
```

## 4

修改前：
```js
JSON.parse(localStorage.getItem("newton-progress")||"{}")
```

修改后：
```js
window.NewtonReleaseSupport.restoreProgress(localStorage.getItem("newton-progress"))
```

## 5

修改前：
```js
const o=Y(await t.text());A(o,"CSV 导入 · 来源由使用者确认"),
```

修改后：
```js
const o=Y(await t.text());o.metadata?(y={...y,...o.metadata.options},r(),A(o,o.metadata.origin,o.metadata.synthetic,o.metadata.imageMeta)):A(o,"CSV 导入 · 来源由使用者确认"),
```

## 6

修改前：
```js
`\uFEFFk,xL_mm,xR_mm,D_mm,D2_mm2
`+u.map((w,i)=>[w.k,w.xL,w.xR,Number.isFinite(p.rows[i].d)?p.rows[i].d:"",Number.isFinite(p.rows[i].y)?p.rows[i].y:""].join(",")).join(`
`)
```

修改后：
```js
window.NewtonReleaseSupport.exportCsv(u,p,y,x,b)
```

## 7

修改前：
```js
function b(){return{prominence:Math.max(.2,Number(g("imgProminence").value)||3),minDistance:Math.max(2,Number(g("imgDistance").value)||8)/e.scale,smoothing:Math.max(.3,Number(g("imgSmoothing").value)||1.3)/e.scale,minRadius:Math.max(1,Number(g("imgMinRadius").value)||12)/e.scale,baseline:Math.max(15,(Number(g("imgDistance").value)||8)*2.2)/e.scale}}
```

修改后：
```js
function b(){ const read=(id,fallback,min,max)=>window.NewtonReleaseSupport.boundedInput(g(id),fallback,min,max); const distance=read("imgDistance",8,2,100); return {prominence:read("imgProminence",3,.2,100),minDistance:distance/e.scale, smoothing:read("imgSmoothing",1.3,.3,10)/e.scale, minRadius:read("imgMinRadius",12,1,Math.max(1,Math.min(e.originalW,e.originalH)/2))/e.scale, baseline:Math.max(15,distance*2.2)/e.scale};}
```

## 8

修改前：
```js
async function R(r,c){const T=new Image;T.onload=async()=>{const A=T.naturalWidth,a=T.naturalHeight;if(A<32||a<32){u("图片太小，至少需要 32 × 32 像素。",!0);return}const n=Math.min(1,1200/Math.max(A,a)),t=Math.round(A*n),o=Math.round(a*n),l=document.createElement("canvas");l.width=t,l.height=o;const w=l.getContext("2d",{willReadFrequently:!0});w.drawImage(T,0,0,t,o),e.plane=E(w.getImageData(0,0,t,o).data,t,o),e.source=T,e.originalW=A,e.originalH=a,e.scale=A/t,e.cx=t/2,e.cy=o/2,e.name=c,e.rows=[],e.profile=null,g("imgScale").value="",g("imgPlaceholder").hidden=!0,M.hidden=!1,g("imgFileInfo").textContent=`${c} · ${A} × ${a} px${n<1?" · 已降采样分析":""}`,g("imgDetect").disabled=g("imgAuto").disabled=g("imgAdd").disabled=!1,p(),await I(),r.startsWith("blob:")&&URL.revokeObjectURL(r)},T.onerror=()=>{u("图片无法读取；请选择有效 PNG、JPEG 或 WebP。",!0),r.startsWith("blob:")&&URL.revokeObjectURL(r)},T.src=r}
```

修改后：
```js
function R(r,c){ const request=(e.loadId||0)+1;e.loadId=request; const T=new Image; const release=()=>{if(r.startsWith("blob:"))URL.revokeObjectURL(r)}; T.onload=async()=>{try{  if(request!==e.loadId)return;  const A=T.naturalWidth,a=T.naturalHeight;  if(A<32||a<32){u("图片太小，至少需要 32 × 32 像素。",true);return}  const n=Math.min(1,1200/Math.max(A,a)),t=Math.max(2,Math.round(A*n)),o=Math.max(2,Math.round(a*n));  const l=document.createElement("canvas");l.width=t;l.height=o;  const w=l.getContext("2d",{willReadFrequently:true});w.drawImage(T,0,0,t,o);  const plane=E(w.getImageData(0,0,t,o).data,t,o);  Object.assign(e,{plane,source:T,originalW:A,originalH:a,scale:A/t,cx:t/2,cy:o/2,name:c,rows:[],profile:null,manual:false});  g("imgScale").value="";g("imgPlaceholder").hidden=true;M.hidden=false;  g("imgFileInfo").textContent=`${c} · ${A} × ${a} px${n<1?" · 已降采样分析":""}`;  g("imgDetect").disabled=g("imgAuto").disabled=g("imgAdd").disabled=false;  H();await I(); }catch(error){if(request===e.loadId)u("图片处理失败，请缩小图片后重试。",true)}finally{release()}}; T.onerror=()=>{if(request===e.loadId)u("图片无法读取；请选择有效 PNG、JPEG 或 WebP。",true);release()}; T.src=r;}
```

## 9

修改前：
```js
const c=r.target.files[0];if(c){
```

修改后：
```js
const c=r.target.files[0];r.target.value="";if(c){
```

## 10 — 旧 CSV 的来源提示

修改前：

```js
R(`已导入 ${o.length} 行。请检查级次、单位和标尺方向。`)
```

修改后：

```js
R(`已导入 ${o.length} 行。请检查级次、单位和标尺方向。${o.metadata?"":"此文件未包含来源信息；若是影像等效坐标，请回到图像分析重新送入，勿直接套用显微镜不确定度。"}`)
```

## CSS — 移动端滚动容器

为隐藏表头的绝对定位建立正确的包含块，避免撑宽整个页面：

```css
.data-app .data-tablewrap { position: relative; }
```
