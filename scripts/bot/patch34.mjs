const {execSync} = require('child_process');
const TOKEN = process.env.GH_TOKEN;
const API = 'https://api.github.com/repos/programmingWTF/nuaa-map';

async function ghAPI(path) {
  const res = await fetch(path.startsWith('http')?path:API+path, {
    headers: {Authorization:'Bearer '+TOKEN, Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}
  });
  return res.json();
}

async function setLabels(num, labels) {
  await fetch(API+'/issues/'+num+'/labels', {
    method:'PUT',
    headers: {Authorization:'Bearer '+TOKEN, Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},
    body: JSON.stringify({labels})
  });
}

const VALID = ['规模：XS','规模：S','规模：M','规模：L','规模：XL','优先级：P0','优先级：P1','优先级：P2','优先级：P3','段位：未定级','段位：倔强青铜','段位：秩序白银','段位：荣耀黄金','段位：永恒钻石','段位：至尊星耀','段位：最强王者','类型：Bug','类型：功能请求','类型：文档','类型：设计优化','类型：问题咨询','小组：①手绘地图','小组：②交互功能','小组：③平台搭建','小组：④数据采集','小组：⑤AI智能体','小组：⑥坐标标注','状态：需要更多信息','状态：等待确认','状态：已确认','状态：进行中','状态：等待审核','状态：准备合并','no-stale','重复'];

const SYSTEM_PROMPT = '你是NUAAMap项目的AI维护助手。分析以下Issue/PR，返回JSON：{"type":"issue或pull_request","summary":"一句话中文总结","rank":"段位名","rank_reason":"为什么","pros":["优点"],"cons":["建议"],"labels":["标签"]}。段位：未定级/倔强青铜/秩序白银/荣耀黄金/永恒钻石/至尊星耀/最强王者。标签：规模：XS/S/M/L/XL、优先级：P0/P1/P2/P3、段位：XXX、类型：Bug/功能请求/文档/设计优化/问题咨询、小组：①手绘地图/②交互功能/③平台搭建/④数据采集/⑤AI智能体/⑥坐标标注、状态：需要更多信息/等待确认/已确认/进行中/等待审核/准备合并';

async function analyze(item) {
  const isPR = !!item.pull_request;
  const ctx = ['类型:'+(isPR?'PR':'Issue'),'编号:#'+item.number,'标题:'+(item.title||''),'作者:@'+(item.user?.login||'?'),'内容:'+(item.body||'').slice(0,3000)];
  if(isPR) ctx.push('分支:'+(item.head?.ref||'?')+'->'+(item.base?.ref||'?'),'文件:'+(item.changed_files||'?')+' +'+(item.additions||'?')+' -'+(item.deletions||'?'));

  const reqBody = JSON.stringify({model:'qwen3.8-max',messages:[{role:'system',content:SYSTEM_PROMPT},{role:'user',content:ctx.join('

---

')}],temperature:0.3,max_tokens:1500});
  const escaped = reqBody.replace(/'/g, "'\''");
  const cmd = 'curl -s --connect-timeout 15 --max-time 60 --proxy socks5h://127.0.0.1:1080 -H "Authorization: Bearer '+process.env.DEEPSEEK_KEY+'" -H "Content-Type: application/json" -d ''+escaped+''' https://token.nuaa.edu.cn/v1/chat/completions';
  
  const stdout = execSync(cmd, {encoding:'utf-8', timeout:65000, stdio:['pipe','pipe','pipe']});
  const data = JSON.parse(stdout);
  const content = data.choices?.[0]?.message?.content||'';
  const m = content.match(/{[sS]*}/);
  return m ? JSON.parse(m[0]) : null;
}

async function main() {
  for (const num of [3,4]) {
    console.log('Processing #'+num);
    const item = await ghAPI('/issues/'+num);
    const result = await analyze(item);
    if (!result) { console.log('  FAIL'); continue; }
    console.log('  '+result.summary+' | '+result.rank);
    const labels = (result.labels||[]).filter(l => VALID.includes(l));
    if (labels.length) { await setLabels(num, labels); console.log('  '+labels.join(', ')); }
  }
  console.log('DONE');
}
main();
