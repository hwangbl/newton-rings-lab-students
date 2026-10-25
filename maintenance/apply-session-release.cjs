/* Reproduce the session changes against the previous public release. */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const base = "1f678ad7156120c7d7100eedb74bc65859f34bd0";
const readBase = (name) =>
  execFileSync("git", ["show", base + ":" + name], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
let html = readBase("index.html");
const oldJs = html.match(/src="(application\.[a-f0-9]+\.min\.js)"/)[1];
const oldCss = html.match(/href="(application\.[a-f0-9]+\.min\.css)"/)[1];
let code = readBase(oldJs);
const edits = [];
function replace(before, after) {
  if (code.split(before).length !== 2)
    throw Error("Expected unique patch: " + before.slice(0, 100));
  code = code.replace(before, after);
  edits.push({ before, after });
}
replace(
  'localStorage.getItem("newton-data")',
  'window.NewtonSession.storage.read("newton-data")',
);
replace(
  'localStorage.getItem("newton-progress")',
  'window.NewtonSession.storage.read("newton-progress")',
);
replace(
  'try{localStorage.setItem("newton-data",JSON.stringify({rows:u,origin:m,synthetic:b,options:y,imageMeta:x}))}catch{}',
  'window.NewtonSession.storage.save("newton-data",{rows:u,origin:m,synthetic:b,options:y,imageMeta:x});',
);
replace(
  'try{localStorage.setItem("newton-progress",JSON.stringify(Q))}catch{}',
  'window.NewtonSession.storage.save("newton-progress",Q);',
);
replace(
  'let u=Q(),m="尚未录入"',
  'const dataHistory=window.NewtonSession.createHistory();let u=Q(),m="尚未录入"',
);
replace(
  "function A(n,t,o=!1,l=null){x=l,u=n.map(w=>({...w})),m=t,b=o,c(),T()}",
  `
function syncDataUndo(){I("dataUndo").disabled=dataHistory.size===0}
function clearDataUndo(){dataHistory.clear();syncDataUndo()}
function rememberData(){dataHistory.push({rows:u,origin:m,synthetic:b,imageMeta:x,options:y,symbol:H});syncDataUndo()}
function restoreDataUndo(){const previous=dataHistory.pop();if(!previous)return;y=previous.options;H=previous.symbol;r();A(previous.rows,previous.origin,previous.synthetic,previous.imageMeta,true);R("已撤销删除或清空，原始读数、来源和参数已恢复。")}
function A(n,t,o=!1,l=null,keepUndo=false){if(!keepUndo)clearDataUndo();x=l,u=n.map(w=>({...w})),m=t,b=o,c(),T();syncDataUndo()}`.replace(
    /\n/g,
    "",
  ),
);
replace(
  'e.addEventListener("input",n=>{const t=n.target;',
  'e.addEventListener("input",n=>{clearDataUndo();const t=n.target;',
);
replace(
  'e.addEventListener("change",n=>{n.target.id',
  'e.addEventListener("change",n=>{clearDataUndo();n.target.id',
);
replace(
  'if(t){u.splice(+t.dataset.remove,1),c(),T(),R("已删除该行。");return}',
  'if(t){rememberData();u.splice(+t.dataset.remove,1),c(),T(),R("已删除该行，可点击撤销。");return}',
);
replace(
  'if(o){if(o==="chart-png"',
  'if(o){if(o==="undo"){restoreDataUndo();return}if(o==="chart-png"',
);
replace(
  'else if(o==="export"){',
  'else if(o==="export"||o==="export-backup"){',
);
replace(
  'e.querySelector("[data-action=export]").disabled=u.length===0',
  'e.querySelectorAll("[data-action=export],[data-action=export-backup]").forEach(button=>button.disabled=u.length===0)',
);
replace(
  'else if(o==="clear")A(Q(),"尚未录入"),R("读数已清空，恢复 5–30 环的六行。");',
  'else if(o==="clear")rememberData(),A(Q(),"尚未录入",false,null,true),R("读数已清空，可点击撤销恢复原读数与来源。");',
);
replace(
  'else if(o==="add"){if(u.length',
  'else if(o==="add"){clearDataUndo();if(u.length',
);
replace(
  'else if(o==="training")a(window.newtonTrainingData);',
  'else if(o==="training")a(window.getNewtonTrainingData?.()||window.newtonTrainingData);',
);
replace(
  '<button type="button" class="data-btn" data-action="clear">清空读数</button>',
  '<button type="button" class="data-btn" data-action="clear">清空读数</button><button type="button" class="data-btn" id="dataUndo" data-action="undo" disabled>撤销删除 / 清空</button>',
);
replace(
  '<p class="data-status" id="dataStatus" role="status" aria-live="polite"></p>',
  '<p class="data-status" id="dataStatus" role="status" aria-live="polite"></p><div class="save-row"><p id="dataSaveStatus" class="save-status" role="status"></p><span id="dataSaveTools" hidden><button type="button" class="data-btn" data-retry-storage="newton-data">重试保存</button><button type="button" class="data-btn" data-action="export-backup">导出读数 CSV</button></span></div><p class="data-tip">可撤销本页最近 20 次连续删除或清空；继续编辑、添加或载入数据后撤销记录重置。</p>',
);
replace(
  "let Q={};try{Q=window.NewtonReleaseSupport.restoreProgress",
  "const progressHistory=window.NewtonSession.createHistory(1);let Q={};try{Q=window.NewtonReleaseSupport.restoreProgress",
);
replace(
  'function D(){window.NewtonSession.storage.save("newton-progress",Q);',
  'function D(keepUndo=false){if(!keepUndo)progressHistory.clear();f("undoProgress").disabled=progressHistory.size===0;window.NewtonSession.storage.save("newton-progress",Q);',
);
replace(
  'f("resetProgress").onclick=()=>{Q={},D(),G("已重置学习标记；实验读数仍保留。")}',
  'f("resetProgress").onclick=()=>{progressHistory.push(Q);Q={},D(true),G("已重置学习标记；可撤销重置。实验读数仍保留。")},f("undoProgress").onclick=()=>{const previous=progressHistory.pop();if(previous){Q=previous;D(true);G("已恢复学习标记。")}}',
);
const start = code.indexOf("const u=[30,25,20,15,10,5,5,10,15,20,25,30];");
const end = code.indexOf("I();const c=", start) + "I();".length;
if (start < 0 || end < start) throw Error("Training block not found");
replace(
  code.slice(start, end),
  "const training=window.NewtonSession.initTraining(Y,G);function H(){training.render()}",
);
html = html.replace(
  "<p>学习记录保存在当前浏览器</p>",
  '<p id="progressSaveStatus" class="save-status" role="status">正在读取学习标记…</p><span id="progressSaveTools" hidden><button type="button" class="text-button" data-retry-storage="newton-progress">重试保存学习标记</button></span>',
);
html = html.replace(
  '<button id="resetTraining" class="outline-button">重新开始 ↺</button>',
  '<div class="training-reset"><button id="resetTraining" class="outline-button">重新开始 ↺</button><button id="undoTrainingReset" class="outline-button" disabled>撤销重新开始</button></div>',
);
html = html.replace(
  '<div id="trainingLog" class="training-log"></div>',
  '<div id="trainingLog" class="training-log"></div><div class="save-row"><p id="trainingSaveStatus" class="save-status" role="status"></p><span id="trainingSaveTools" hidden><button type="button" class="outline-button" data-retry-storage="newton-training">重试保存</button><button type="button" class="outline-button" id="exportTraining">导出已读位置 CSV</button></span></div><p class="muted">训练会自动恢复；反向移动造成的失效状态也会保留。撤销重启仅在继续操作前可用。</p>',
);
html = html.replace(
  '<button class="text-button" id="resetProgress">重置学习进度</button>',
  '<div class="progress-reset"><button class="text-button" id="resetProgress">重置学习进度</button><button class="text-button" id="undoProgress" disabled>撤销重置</button></div>',
);
html = html.replace(
  "进度和读数保存在当前浏览器，可导出 CSV 留存。",
  "进度、读数和训练位置会尝试保存在当前浏览器，请留意保存状态；保存失败时可重试或导出 CSV 留存。",
);
const sessionContent = fs
  .readFileSync(path.join(root, "session-support.js"), "utf8")
  .replace(/\r\n/g, "\n");
fs.writeFileSync(path.join(root, "session-support.js"), sessionContent);
const sessionHash = crypto
  .createHash("sha256")
  .update(sessionContent)
  .digest("hex")
  .slice(0, 12);
html = html.replace(
  '<script src="release-support.js"></script>',
  `<script src="release-support.js"></script>\n<script src="session-support.js?v=${sessionHash}"></script>`,
);
const css =
  readBase(oldCss) +
  `\n.save-row{margin:12px 0}.save-status{font-size:12px;line-height:1.65;color:#47755b;overflow-wrap:anywhere}.save-status[data-state="error"]{color:#9b4a24}.save-row span:not([hidden]){display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}.training-reset,.progress-reset{display:flex;flex-wrap:wrap;gap:8px}.training-reset{justify-content:flex-end}.training-reset button:disabled,.progress-reset button:disabled{opacity:.45;cursor:not-allowed}.app-footer{flex-wrap:wrap;gap:12px}.sidebar .save-status{font-size:10px;line-height:1.6}.sidebar [data-retry-storage]{margin-top:4px}@media(max-width:650px){.measurement-lab>.panel-top{flex-wrap:wrap;gap:12px}.training-reset{justify-content:flex-start}}\n`;
function publish(content, extension) {
  content = content.replace(/\r\n/g, "\n");
  const hash = crypto
    .createHash("sha256")
    .update(content)
    .digest("hex")
    .slice(0, 12);
  const name = `application.${hash}.min.${extension}`;
  fs.writeFileSync(path.join(root, name), content);
  return name;
}
const newJs = publish(code, "js"),
  newCss = publish(css, "css");
html = html.replace(oldJs, newJs).replace(oldCss, newCss);
for (const name of fs.readdirSync(root))
  if (
    /^application\.[a-f0-9]+\.min\.(js|css)$/.test(name) &&
    name !== newJs &&
    name !== newCss
  )
    fs.unlinkSync(path.join(root, name));
fs.writeFileSync(path.join(root, "index.html"), html);
fs.writeFileSync(
  path.join(root, "maintenance/session-bundle-changes.md"),
  "# 保存与恢复功能：发布文件修改对照\n\n基线提交：`" +
    base +
    "`。可运行 `node maintenance/apply-session-release.cjs` 复现本轮发布文件；运行前请确保没有其他发布文件修改。\n\n" +
    edits
      .map(
        (edit, i) =>
          `## ${i + 1}\n\n修改前：\n\n\`\`\`js\n${edit.before}\n\`\`\`\n\n修改后：\n\n\`\`\`js\n${edit.after}\n\`\`\`\n`,
      )
      .join("\n"),
);
console.log(newJs, newCss, edits.length + " focused changes");
