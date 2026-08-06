// Auto-generated module: utils.js

export const id=()=>crypto?.randomUUID?crypto.randomUUID():String(Date.now())+Math.random();
export const esc=s=>String(s??"").replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[m]));
export const clone=o=>JSON.parse(JSON.stringify(o));
export function fmt(d){return d?new Date(d+"T00:00:00").toLocaleDateString("uk-UA"):""}
export function today(){return new Date().toISOString().slice(0,10)}
export function tv(v){let m=String(v||"").trim().match(/^(\d{1,2}):(\d{2})$/);return m?String(m[1]).padStart(2,"0")+":"+m[2]:""}
export function dt(v){v=tv(v);return v?v.replace(/^0/,""):""}
export function addMin(v,n){v=tv(v)||"09:00";let p=v.split(":"),t=(+p[0]*60+ +p[1]+n+1440)%1440;return String(Math.floor(t/60)).padStart(2,"0")+":"+String(t%60).padStart(2,"0")}
export function congressTheme(c){return(c&&String(c.theme||"").trim())||String(c?.name||"").trim()||"Конгресс"}
export function tableHeading(c){let h=congressTheme(c),p=[];if(c?.date)p.push(fmt(c.date));if(c?.place)p.push(c.place);return h+(p.length?" ("+p.join(" · ")+")":"")}
export function isSection(t){let s=String(t.type||"").toLowerCase(),title=String(t.title||"").toLowerCase();return !!t.section||s.includes("раздел")||title.includes("ранкова програма")||title.includes("пополуднева програма")||title.includes("утренняя программа")||title.includes("послеобеденная программа")}
export function hasSpeaker(t){return !!((t.participants||[])[0]||{}).name}
export function noAssignmentNeeded(t){let type=String(t.type||"").trim().toLowerCase(),title=String(t.title||"").trim().toLowerCase();return type==="музика"||title==="музика"}
export function isLetterable(t){return (!isSection(t)||hasSpeaker(t))&&!noAssignmentNeeded(t)}
export function clean(a){let seen={};return(a||[]).map(x=>String(x||"").trim()).filter(x=>{let k=x.toLowerCase();if(!x||seen[k])return false;seen[k]=1;return true}).sort((a,b)=>a.localeCompare(b,"uk"))}
