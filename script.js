// ══════════════════════════════════════════════════════════════
// CONSTANTS & MASTER DATA
// ══════════════════════════════════════════════════════════════
const STORAGE_KEY   = 'medcoreData_v2';   // data utama (BOR, ALOS, finance, dll)
const DB_KEY        = 'medcore_visits';   // data khusus readmission

const MONTHS      = ['Januari','Februari','Maret','April','Mei','Juni'];
const MONTH_NUMS  = [1,2,3,4,5,6];
const POLI_LIST   = ['Poli Gigi','Poli Anak','Poli Kandungan','Poli Dalam','Poli Mata'];
const WARD_LIST   = ['ICU / Intensif','Bangsal Mawar (VIP)','Bangsal Melati (Kelas 1)',
                     'Bangsal Anggrek (Kelas 2)','Bangsal Dahlia (Kelas 3)','Perinatologi / Neonatus'];
const FIN_UNITS   = ['Rawat Jalan','Rawat Inap','Farmasi','Loket & Lain'];

const BED_CAPACITY = {
    'ICU / Intensif':10,'Bangsal Mawar (VIP)':20,'Bangsal Melati (Kelas 1)':30,
    'Bangsal Anggrek (Kelas 2)':40,'Bangsal Dahlia (Kelas 3)':50,'Perinatologi / Neonatus':14
};
const TOTAL_CAPACITY = Object.values(BED_CAPACITY).reduce((a,b)=>a+b,0);

const BASE_SATISFACTION = {
    1:{score:4.1,respondents:312}, 2:{score:4.0,respondents:289},
    3:{score:4.2,respondents:401}, 4:{score:4.3,respondents:375},
    5:{score:4.4,respondents:450}, 6:{score:4.5,respondents:520}
};
const BASE_NEW_PATIENTS  = {1:400,2:300,3:550,4:450,5:600,6:700};
const BASE_WAIT = {
    'Poli Gigi':15,'Poli Anak':25,'Poli Kandungan':45,'Poli Dalam':30,'Poli Mata':20
};
const BASE_FINANCE = {
    1:{rj:280,ri:350,fa:190,ll:120}, 2:{rj:220,ri:310,fa:165,ll:100},
    3:{rj:310,ri:390,fa:210,ll:130}, 4:{rj:320,ri:400,fa:225,ll:140},
    5:{rj:335,ri:415,fa:248,ll:152}, 6:{rj:350,ri:432,fa:264,ll:154}
};
const FIN_TARGETS     = {rj:320,ri:400,fa:250,ll:180};
const BASE_BOR_TREND  = {1:70,2:65,3:74,4:76,5:75,6:78};
const BASE_ALOS_TREND = {1:4.8,2:5.2,3:4.5,4:4.4,5:4.3,6:4.3};
const BASE_BOR_WARD   = {
    'ICU / Intensif':92,'Bangsal Mawar (VIP)':85,'Bangsal Melati (Kelas 1)':80,
    'Bangsal Anggrek (Kelas 2)':75,'Bangsal Dahlia (Kelas 3)':72,'Perinatologi / Neonatus':79
};
const BASE_ALOS_WARD_MAP = {
    'ICU / Intensif':5.8,'Bangsal Mawar (VIP)':4.1,'Bangsal Melati (Kelas 1)':3.8,
    'Bangsal Anggrek (Kelas 2)':4.2,'Bangsal Dahlia (Kelas 3)':3.9,'Perinatologi / Neonatus':4.5
};

// ══════════════════════════════════════════════════════════════
// CHART DEFAULTS
// ══════════════════════════════════════════════════════════════
Chart.defaults.font.family = "'DM Sans', sans-serif";
Chart.defaults.color = '#8A909E';

const palette = ['#4F7EF7','#34C98F','#F76B4F','#A78BF5','#FBBF24'];

const baseOpts = (extra = {}) => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, ...(extra.plugins || {}) },
    ...extra
});

const charts = {};
function makeOrUpdate(id, config) {
    const el = document.getElementById(id);
    if (!el) return;
    if (charts[id]) {
        charts[id].data = config.data;
        if (config.options) charts[id].options = config.options;
        charts[id].update();
    } else {
        charts[id] = new Chart(el, config);
    }
}

// ══════════════════════════════════════════════════════════════
// MAIN DB HELPERS
// ══════════════════════════════════════════════════════════════
function getData()    { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
function saveAll(arr) { localStorage.setItem(STORAGE_KEY, JSON.stringify(arr)); }
function getMonth(ds) { return ds ? new Date(ds).getMonth() + 1 : null; }

function liveWaitPerPoli(month) {
    let data = getData();
    if (month !== 'all') data = data.filter(d => getMonth(d.visitDate) == month);
    const result = {};
    POLI_LIST.forEach(p => {
        const rows = data.filter(d => d.serviceType === p && d.registrationTime && d.callTime);
        if (rows.length) {
            const avg = rows.reduce((sum, d) => {
                const [rh,rm] = d.registrationTime.split(':').map(Number);
                const [ch,cm] = d.callTime.split(':').map(Number);
                return sum + Math.max(0, (ch*60+cm)-(rh*60+rm));
            }, 0) / rows.length;
            result[p] = Math.round(avg);
        }
    });
    return result;
}

function liveSatisfactionPerMonth() {
    const data = getData().filter(d => d.satisfactionScore);
    const byMonth = {};
    MONTH_NUMS.forEach(m => {
        const rows = data.filter(d => getMonth(d.visitDate)==m || getMonth(d.admissionDate)==m);
        if (rows.length) byMonth[m] = {
            score: +(rows.reduce((s,d)=>s+parseFloat(d.satisfactionScore||0),0)/rows.length).toFixed(2),
            respondents: rows.length
        };
    });
    return byMonth;
}

function liveNewPatientsPerMonth() {
    const data = getData().filter(d => d.isFirstVisit);
    const byMonth = {};
    MONTH_NUMS.forEach(m => {
        byMonth[m] = data.filter(d => getMonth(d.visitDate)==m || getMonth(d.admissionDate)==m).length;
    });
    return byMonth;
}

function liveFinancePerMonth() {
    const data = getData().filter(d => d.financeAmount && d.financeType==='Pemasukan' && d.financeDate);
    const byMonth = {};
    MONTH_NUMS.forEach(m => {
        byMonth[m] = {rj:0,ri:0,fa:0,ll:0};
        data.filter(d => getMonth(d.financeDate)==m).forEach(d => {
            const amt = parseFloat(d.financeAmount)/1000000;
            if      (d.financeUnit==='Rawat Jalan')  byMonth[m].rj += amt;
            else if (d.financeUnit==='Rawat Inap')   byMonth[m].ri += amt;
            else if (d.financeUnit==='Farmasi')      byMonth[m].fa += amt;
            else if (d.financeUnit==='Loket & Lain') byMonth[m].ll += amt;
        });
    });
    return byMonth;
}

function liveBORPerWard(month) {
    let data = getData().filter(d => d.admissionDate);
    if (month !== 'all') data = data.filter(d => getMonth(d.admissionDate)==month || getMonth(d.dischargeDate)==month);
    const result = {};
    WARD_LIST.forEach(w => {
        const active = data.filter(d => d.ward===w).length;
        if (active > 0) result[w] = {active, cap:BED_CAPACITY[w]};
    });
    return result;
}

function liveALOSPerWard(month) {
    let data = getData().filter(d => d.ward && d.lengthOfStay);
    if (month !== 'all') data = data.filter(d => getMonth(d.dischargeDate)==month);
    const result = {};
    WARD_LIST.forEach(w => {
        const rows = data.filter(d => d.ward===w);
        if (rows.length) result[w] = {
            alos: +(rows.reduce((s,d)=>s+parseFloat(d.lengthOfStay),0)/rows.length).toFixed(1),
            count: rows.length
        };
    });
    return result;
}

function mergedBORTrend() {
    const live = {};
    MONTH_NUMS.forEach(m => {
        const data = getData().filter(d => d.admissionDate && (getMonth(d.admissionDate)==m || getMonth(d.dischargeDate)==m));
        if (data.length) live[m] = Math.min(99, Math.round((data.length/TOTAL_CAPACITY)*100));
    });
    return MONTH_NUMS.map(m => {
        const lv = live[m];
        return lv !== undefined ? +((BASE_BOR_TREND[m]*0.5 + lv*0.5)).toFixed(1) : BASE_BOR_TREND[m];
    });
}

function mergedALOSTrend() {
    const live = {};
    MONTH_NUMS.forEach(m => {
        const data = getData().filter(d => d.lengthOfStay && getMonth(d.dischargeDate)==m);
        if (data.length) live[m] = +(data.reduce((s,d)=>s+parseFloat(d.lengthOfStay),0)/data.length).toFixed(1);
    });
    return MONTH_NUMS.map(m => {
        const lv = live[m];
        return lv !== undefined ? +((BASE_ALOS_TREND[m]+lv)/2).toFixed(1) : BASE_ALOS_TREND[m];
    });
}

function fmtM(val) { return val>=1000 ? 'Rp '+(val/1000).toFixed(1)+' M' : 'Rp '+Math.round(val)+' Jt'; }

// ══════════════════════════════════════════════════════════════
// HOME PAGE
// ══════════════════════════════════════════════════════════════
function renderHomePage() {
    const data = getData();
    const liveFinMonth = liveFinancePerMonth();
    let totalLiveRev = 0;
    MONTH_NUMS.forEach(m => { totalLiveRev += liveFinMonth[m].rj+liveFinMonth[m].ri+liveFinMonth[m].fa+liveFinMonth[m].ll; });
    const baseTotal = MONTH_NUMS.reduce((s,m)=>{const b=BASE_FINANCE[m];return s+b.rj+b.ri+b.fa+b.ll;},0);
    const homeRev = document.getElementById('home-revenue');
    if (homeRev) { homeRev.textContent = fmtM(baseTotal+totalLiveRev); document.getElementById('home-revenue-sub').innerHTML = '<span class="kpi-badge badge-up">Kumulatif</span> Jan\u2013Jun 2025'; }

    const liveActive = data.filter(d=>d.admissionDate).length;
    const borVal = liveActive>0 ? Math.min(99,Math.round((liveActive/TOTAL_CAPACITY*100+BASE_BOR_TREND[6])/2)) : BASE_BOR_TREND[6];
    const homeBor = document.getElementById('home-bor');
    if (homeBor) { homeBor.textContent = borVal+'%'; document.getElementById('home-bor-sub').textContent = 'Kapasitas Rawat Inap Jun 2025'; }

    const satData = data.filter(d=>d.satisfactionScore);
    const homeSat = document.getElementById('home-satisfaction');
    if (homeSat) {
        if (satData.length) {
            const avg = (satData.reduce((s,d)=>s+parseFloat(d.satisfactionScore),0)/satData.length).toFixed(1);
            homeSat.textContent = ((parseFloat(avg)+4.5)/2).toFixed(1)+'/5';
            document.getElementById('home-satisfaction-sub').textContent = 'Gabungan baseline + '+satData.length+' input';
        } else {
            homeSat.textContent = '4,5/5';
            document.getElementById('home-satisfaction-sub').textContent = 'Berdasarkan data baseline';
        }
    }

    const liveUnit = {rj:0,ri:0,fa:0,ll:0};
    MONTH_NUMS.forEach(m => Object.keys(liveUnit).forEach(k => liveUnit[k]+=liveFinMonth[m][k]));
    const baseUnit = MONTH_NUMS.reduce((acc,m)=>{const b=BASE_FINANCE[m];acc.rj+=b.rj;acc.ri+=b.ri;acc.fa+=b.fa;acc.ll+=b.ll;return acc;},{rj:0,ri:0,fa:0,ll:0});
    makeOrUpdate('h-financeChart',{type:'doughnut',data:{labels:['Rawat Jalan','Rawat Inap','Farmasi','Loket & Lain'],datasets:[{data:[baseUnit.rj+liveUnit.rj,baseUnit.ri+liveUnit.ri,baseUnit.fa+liveUnit.fa,baseUnit.ll+liveUnit.ll],backgroundColor:palette,borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{boxWidth:10,padding:14}}}}});

    const liveWait = liveWaitPerPoli('all');
    const waitVals = POLI_LIST.map(p=>{const bw=BASE_WAIT[p]||0,lw=liveWait[p];return lw!==undefined?Math.round((bw+lw)/2):bw;});
    makeOrUpdate('h-waitChart',{type:'bar',data:{labels:['Poli Gigi','Poli Anak','Kandungan','Poli Dalam','Poli Mata'],datasets:[{label:'Menit',data:waitVals,backgroundColor:'#4F7EF7',borderRadius:5}]},options:{...baseOpts(),indexAxis:'y',scales:{x:{grid:{display:false}},y:{grid:{display:false}}}}});
    makeOrUpdate('h-staffChart',{type:'bar',data:{labels:['Gigi','Anak','Kandungan','Dalam'],datasets:[{label:'Pasien/Dokter',data:[4,8,6,10],backgroundColor:'#A78BF5',borderRadius:5}]},options:{...baseOpts(),scales:{y:{beginAtZero:true,grid:{color:'#F0EDE8'}},x:{grid:{display:false}}}}});

    const livePat = liveNewPatientsPerMonth();
    makeOrUpdate('h-patientChart',{type:'line',data:{labels:MONTHS,datasets:[{data:MONTH_NUMS.map(m=>BASE_NEW_PATIENTS[m]+(livePat[m]||0)),borderColor:'#34C98F',backgroundColor:'rgba(52,201,143,0.12)',fill:true,tension:0.4,pointBackgroundColor:'#34C98F',pointRadius:4}]},options:{...baseOpts(),scales:{y:{beginAtZero:true,grid:{color:'#F0EDE8'}},x:{grid:{display:false}}}}});
}

// ══════════════════════════════════════════════════════════════
// SERVICE PAGE
// ══════════════════════════════════════════════════════════════
function renderServicePage() {
    const month = document.getElementById('svc-filter-month')?.value||'all';
    const poli  = document.getElementById('svc-filter-poli')?.value||'all';
    const liveData = getData();
    const badge = document.getElementById('svc-data-badge');
    if (badge) badge.textContent = liveData.length>0 ? '● Live + Baseline' : '● Baseline saja';

    const liveSat = liveSatisfactionPerMonth();
    const satScores = MONTH_NUMS.map(m=>{const base=BASE_SATISFACTION[m].score,lv=liveSat[m];return lv?+((base+lv.score)/2).toFixed(2):base;});
    const filteredMonths    = month==='all' ? MONTHS : [MONTHS[parseInt(month)-1]];
    const filteredSatScores = month==='all' ? satScores : [satScores[parseInt(month)-1]];

    makeOrUpdate('s-satisfactionChart',{type:'line',data:{labels:filteredMonths,datasets:[{data:filteredSatScores,borderColor:'#A78BF5',backgroundColor:'rgba(167,139,245,0.12)',fill:true,tension:0.4,pointBackgroundColor:'#A78BF5',pointRadius:5}]},options:{...baseOpts(),scales:{y:{min:3.5,max:5,grid:{color:'#F0EDE8'}},x:{grid:{display:false}}}}});

    const livePat = liveNewPatientsPerMonth();
    const patVals = month==='all' ? MONTH_NUMS.map(m=>BASE_NEW_PATIENTS[m]+(livePat[m]||0)) : [BASE_NEW_PATIENTS[parseInt(month)]+(livePat[parseInt(month)]||0)];
    makeOrUpdate('s-newPatientChart',{type:'line',data:{labels:filteredMonths,datasets:[{data:patVals,borderColor:'#34C98F',backgroundColor:'rgba(52,201,143,0.12)',fill:true,tension:0.4,pointBackgroundColor:'#34C98F',pointRadius:5}]},options:{...baseOpts(),scales:{y:{beginAtZero:true,grid:{color:'#F0EDE8'}},x:{grid:{display:false}}}}});

    const liveWait   = liveWaitPerPoli(month);
    const poliFilter = poli==='all' ? POLI_LIST : (POLI_LIST.includes(poli)?[poli]:POLI_LIST);
    const waitVals   = poliFilter.map(p=>{const bw=BASE_WAIT[p]||0,lw=liveWait[p];return lw!==undefined?Math.round((bw+lw)/2):bw;});
    const waitColors = waitVals.map(v=>v>30?'#F76B4F':v===30?'#FBBF24':'#34C98F');
    makeOrUpdate('s-waitChart',{type:'bar',data:{labels:poliFilter,datasets:[{label:'Waktu Tunggu (Menit)',data:waitVals,backgroundColor:waitColors,borderRadius:5},{label:'Target (30 menit)',data:poliFilter.map(()=>30),type:'line',borderColor:'#F76B4F',borderDash:[6,4],borderWidth:2,pointRadius:0,fill:false}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:true,position:'bottom',labels:{boxWidth:10,padding:14}}},scales:{y:{beginAtZero:true,grid:{color:'#F0EDE8'}},x:{grid:{display:false}}}}});

    const dispMonths = month==='all' ? MONTH_NUMS : [parseInt(month)];
    const satTbody = document.getElementById('svc-satisfaction-tbody');
    if (satTbody) satTbody.innerHTML = dispMonths.map(m=>{
        const base=BASE_SATISFACTION[m],lv=liveSat[m];
        const score=lv?+((base.score+lv.score)/2).toFixed(2):base.score;
        const respondents=base.respondents+(lv?lv.respondents:0);
        const pct=Math.round((score/5)*100);
        const src=lv?'<span class="ds-badge ds-live">● Live</span>':'<span class="ds-badge ds-static">Baseline</span>';
        const status=score>=4.4?'Sangat Baik':score>=4.0?'Baik':'Perlu Perbaikan';
        const sc=score>=4.0?'background:#ECFDF5;color:#059669':'background:#FEF2F2;color:#DC2626';
        return `<tr><td>${MONTHS[m-1]}</td><td>${respondents}</td><td>${score.toFixed(1)}</td><td>${pct}%</td><td>${src}</td><td><span class="td-pill" style="${sc}">${status}</span></td></tr>`;
    }).join('');

    const waitTbody = document.getElementById('svc-wait-tbody');
    if (waitTbody) waitTbody.innerHTML = poliFilter.map(p=>{
        const bw=BASE_WAIT[p]||0,lw=liveWait[p],val=lw!==undefined?Math.round((bw+lw)/2):bw;
        const src=lw!==undefined?'<span class="ds-badge ds-live">● Live</span>':'<span class="ds-badge ds-static">Baseline</span>';
        const status=val>30?'<span class="td-pill" style="background:#FEF2F2;color:#DC2626">Melebihi Target</span>':val===30?'<span class="td-pill" style="background:#FFFBEB;color:#D97706">Batas Target</span>':'<span class="td-pill" style="background:#ECFDF5;color:#059669">Tercapai</span>';
        return `<tr><td>${p}</td><td>${val} menit</td><td>${src}</td><td>${status}</td></tr>`;
    }).join('');

    const avgSat=(satScores.reduce((a,b)=>a+b,0)/satScores.length).toFixed(1);
    const maxWaitPoli=poliFilter.reduce((max,p)=>waitVals[poliFilter.indexOf(p)]>waitVals[poliFilter.indexOf(max)]?p:max,poliFilter[0]);
    const maxWaitVal=Math.max(...waitVals);
    const livePts=liveData.filter(d=>d.satisfactionScore).length;
    const insightEl=document.getElementById('svc-insight-text');
    if (insightEl) insightEl.innerHTML=`Rata-rata kepuasan pasien periode yang ditampilkan berada di angka <strong style="color:#fff">${avgSat}/5</strong>${livePts>0?`, mencakup <strong style="color:#fff">${livePts} input live</strong> dari sistem`:' (data baseline)'}. Waktu tunggu tertinggi tercatat di <strong style="color:#fff">${maxWaitPoli}</strong> dengan rata-rata <strong style="color:#fff">${maxWaitVal} menit</strong>${maxWaitVal>30?' \u2014 melebihi target &lt;30 menit yang perlu segera ditangani':' \u2014 masih dalam batas target'}.`;
}

// ══════════════════════════════════════════════════════════════
// FINANCE PAGE
// ══════════════════════════════════════════════════════════════
function renderFinancePage() {
    const month=document.getElementById('fin-filter-month')?.value||'all';
    const unit =document.getElementById('fin-filter-unit')?.value||'all';
    const liveData=getData();
    const badge=document.getElementById('fin-data-badge');
    if (badge) badge.textContent=liveData.length>0?'● Live + Baseline':'● Baseline saja';

    const liveFin=liveFinancePerMonth();
    const dispMonths=month==='all'?MONTH_NUMS:[parseInt(month)];
    const merged=MONTH_NUMS.map(m=>{const b=BASE_FINANCE[m],l=liveFin[m];return{rj:b.rj+l.rj,ri:b.ri+l.ri,fa:b.fa+l.fa,ll:b.ll+l.ll};});
    const totals={rj:0,ri:0,fa:0,ll:0};
    dispMonths.forEach(m=>{const v=merged[m-1];totals.rj+=v.rj;totals.ri+=v.ri;totals.fa+=v.fa;totals.ll+=v.ll;});

    const pieData=unit==='all'?[totals.rj,totals.ri,totals.fa,totals.ll]:[unit==='Rawat Jalan'?totals.rj:0,unit==='Rawat Inap'?totals.ri:0,unit==='Farmasi'?totals.fa:0,unit==='Loket & Lain'?totals.ll:0];
    makeOrUpdate('f-pieChart',{type:'doughnut',data:{labels:FIN_UNITS,datasets:[{data:pieData,backgroundColor:palette,borderWidth:0,hoverOffset:6}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{boxWidth:10,padding:16}}}}});

    const revVals=dispMonths.map(m=>{const v=merged[m-1];return Math.round(v.rj+v.ri+v.fa+v.ll);});
    const revColors=revVals.map((v,i)=>i===0&&revVals[0]===Math.min(...revVals)?'#F76B4F':'#4F7EF7');
    makeOrUpdate('f-revenueChart',{type:'bar',data:{labels:dispMonths.map(m=>MONTHS[m-1]),datasets:[{label:'Total (Juta Rp)',data:revVals,backgroundColor:revColors,borderRadius:5}]},options:{...baseOpts(),scales:{y:{beginAtZero:false,min:Math.max(0,Math.min(...revVals)-100),grid:{color:'#F0EDE8'}},x:{grid:{display:false}}}}});

    const distKeys=[{key:'rj',label:'Rawat Jalan',target:FIN_TARGETS.rj},{key:'ri',label:'Rawat Inap',target:FIN_TARGETS.ri},{key:'fa',label:'Farmasi',target:FIN_TARGETS.fa},{key:'ll',label:'Loket & Lain',target:FIN_TARGETS.ll}];
    const grandTotal=Object.values(totals).reduce((a,b)=>a+b,0);
    const distRows=distKeys.filter(d=>unit==='all'||d.label===unit).map(d=>{
        const amt=totals[d.key],pct=grandTotal>0?Math.round(amt/grandTotal*100):0;
        const tgt=d.target*dispMonths.length,ach=tgt>0?Math.round(amt/tgt*100):0;
        return `<tr><td>${d.label}</td><td>Rp ${Math.round(amt)}</td><td>${pct}%</td><td>Rp ${tgt}</td><td>${ach}%</td><td><span class="td-pill" style="${ach>=100?'background:#ECFDF5;color:#059669':'background:#FEF2F2;color:#DC2626'}">${ach>=100?'Tercapai':'Belum Tercapai'}</span></td></tr>`;
    });
    distRows.push(`<tr style="font-weight:600"><td>Total</td><td>Rp ${Math.round(grandTotal)}</td><td>100%</td><td>\u2014</td><td>\u2014</td><td><span class="td-pill" style="background:#ECFDF5;color:#059669">Lihat Detail</span></td></tr>`);
    const distTbody=document.getElementById('fin-dist-tbody');
    if (distTbody) distTbody.innerHTML=distRows.join('');

    const monthlyRows=dispMonths.map(m=>{
        const b=BASE_FINANCE[m],l=liveFin[m];
        const hasLiveM=(l.rj+l.ri+l.fa+l.ll)>0;
        const rj=b.rj+l.rj,ri=b.ri+l.ri,fa=b.fa+l.fa,ll=b.ll+l.ll,tot=rj+ri+fa+ll;
        const src=hasLiveM?'<span class="ds-badge ds-live">● Live</span>':'<span class="ds-badge ds-static">Baseline</span>';
        return `<tr><td>${MONTHS[m-1]}</td><td>${Math.round(rj)}</td><td>${Math.round(ri)}</td><td>${Math.round(fa)}</td><td>${Math.round(ll)}</td><td><strong>${Math.round(tot)}</strong></td><td>${src}</td></tr>`;
    });
    const monthlyTbody=document.getElementById('fin-monthly-tbody');
    if (monthlyTbody) monthlyTbody.innerHTML=monthlyRows.join('');

    const totalRev=dispMonths.reduce((s,m)=>s+merged[m-1].rj+merged[m-1].ri+merged[m-1].fa+merged[m-1].ll,0);
    const liveContrib=dispMonths.reduce((s,m)=>s+liveFin[m].rj+liveFin[m].ri+liveFin[m].fa+liveFin[m].ll,0);
    const finInsight=document.getElementById('fin-insight-text');
    if (finInsight) finInsight.innerHTML=`Total pendapatan periode yang ditampilkan mencapai <strong style="color:#fff">Rp ${Math.round(totalRev)} Juta</strong>${liveContrib>0?`, termasuk kontribusi data live sebesar <strong style="color:#fff">Rp ${Math.round(liveContrib)} Juta</strong>`:''}. Unit Rawat Inap tetap menjadi kontributor terbesar${totals.ri>0?` dengan <strong style="color:#fff">Rp ${Math.round(totals.ri)} Juta</strong>`:''}. Layanan Loket &amp; Lain masih di bawah target dan perlu perhatian pada kuartal berikutnya.`;
}

// ══════════════════════════════════════════════════════════════
// HR PAGE
// ══════════════════════════════════════════════════════════════
function renderHRPage() {
    makeOrUpdate('hr-staffPatientChart', {
        type: 'bar',
        data: {
            labels: [
                'Dr. Andi (Poli Dalam)',
                'Dr. Sari (Poli Anak)',
                'Dr. Budi (Poli Gigi)',
                'Dr. Dewi (Poli Kandungan)',
                'Dr. Rina (Poli Mata)',
                'Ns. Hendra (IGD)',
                'Ns. Lina (Rawat Inap)',
                'Ns. Tono (Rawat Inap)'
            ],
            datasets: [{
                label: 'Jumlah Pasien',
                data: [42, 38, 21, 35, 19, 55, 48, 44],
                backgroundColor: [
                    '#4F7EF7','#34C98F','#34C98F','#F76B4F',
                    '#34C98F','#F76B4F','#A78BF5','#A78BF5'
                ],
                borderRadius: 6
            }]
        },
        options: {
            ...baseOpts(),
            indexAxis: 'y',
            scales: {
                x: {
                    beginAtZero: true,
                    grid: { color: '#F0EDE8' },
                    title: { display: true, text: 'Jumlah Pasien' }
                },
                y: { grid: { display: false } }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => ` ${ctx.parsed.x} pasien`
                    }
                }
            }
        }
    });
}

// ══════════════════════════════════════════════════════════════
// EFFICIENCY PAGE
// ══════════════════════════════════════════════════════════════
function renderEfficiencyPage() {
    const month=document.getElementById('eff-filter-month')?.value||'all';
    const ward =document.getElementById('eff-filter-ward')?.value||'all';
    const liveData=getData();
    const badge=document.getElementById('eff-data-badge');
    if (badge) badge.textContent=liveData.length>0?'● Live + Baseline':'● Baseline saja';

    const liveWards=liveBORPerWard(month),liveALOS=liveALOSPerWard(month);
    const dispWards=ward==='all'?WARD_LIST:[ward];
    const borData=dispWards.map(w=>{const base=BASE_BOR_WARD[w],lv=liveWards[w];return lv?Math.round((base+Math.min(99,Math.round(lv.active/lv.cap*100)))/2):base;});
    const alosData=dispWards.map(w=>{const base=BASE_ALOS_WARD_MAP[w],lv=liveALOS[w];return lv?+((base+lv.alos)/2).toFixed(1):base;});
    const avgBOR=Math.round(borData.reduce((a,b)=>a+b,0)/borData.length);
    const avgALOS=+(alosData.reduce((a,b)=>a+b,0)/alosData.length).toFixed(1);
    const livePatients=liveData.filter(d=>d.admissionDate&&(ward==='all'||d.ward===ward)).length;
    const toi=+(((TOTAL_CAPACITY*(100-avgBOR)/100)/Math.max(1,TOTAL_CAPACITY))*avgALOS).toFixed(1);

    const borEl=document.getElementById('eff-bor');
    if (borEl) { borEl.textContent=avgBOR+'%'; document.getElementById('eff-bor-sub').innerHTML=avgBOR>=75&&avgBOR<=85?'<span class="kpi-badge badge-up">Ideal</span> Rentang 75\u201385%':avgBOR>85?'<span class="kpi-badge badge-down">Kritis</span> Di atas 85%':'<span class="kpi-badge badge-warn">Rendah</span> Di bawah 75%'; }
    const alosEl=document.getElementById('eff-alos');
    if (alosEl) { alosEl.textContent=avgALOS+' hari'; document.getElementById('eff-alos-sub').innerHTML=avgALOS<=4?'<span class="kpi-badge badge-up">Tercapai</span> Target &lt;4 hari':'<span class="kpi-badge badge-warn">Target &lt;4 hari</span>'; }
    const patEl=document.getElementById('eff-patients');
    if (patEl) { patEl.textContent=livePatients>0?livePatients+' live':'Data baseline'; document.getElementById('eff-patients-sub').textContent=livePatients>0?'Pasien tercatat dari input':'Belum ada input live'; }
    const toiEl=document.getElementById('eff-toi');
    if (toiEl) toiEl.textContent=toi+' hari';

    const borTrend=mergedBORTrend();
    const dispBorTrend=month==='all'?borTrend:[borTrend[parseInt(month)-1]];
    const dispLabels=month==='all'?MONTHS:[MONTHS[parseInt(month)-1]];
    makeOrUpdate('e-borTrendChart',{type:'line',data:{labels:dispLabels,datasets:[{label:'BOR (%)',data:dispBorTrend,borderColor:'#34C98F',backgroundColor:'rgba(52,201,143,0.12)',fill:true,tension:0.4,pointBackgroundColor:'#34C98F',pointRadius:5},{label:'Target Min 75%',data:dispLabels.map(()=>75),borderColor:'#FBBF24',borderDash:[5,4],borderWidth:1.5,pointRadius:0,fill:false},{label:'Target Max 85%',data:dispLabels.map(()=>85),borderColor:'#F76B4F',borderDash:[5,4],borderWidth:1.5,pointRadius:0,fill:false}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:true,position:'bottom',labels:{boxWidth:10,padding:14}}},scales:{y:{min:55,max:99,grid:{color:'#F0EDE8'},ticks:{callback:v=>v+'%'}},x:{grid:{display:false}}}}});
    makeOrUpdate('e-borWardChart',{type:'bar',data:{labels:dispWards.map(w=>w.replace(/ \(Kelas \d\)/,'').replace(' (VIP)','')),datasets:[{label:'BOR (%)',data:borData,backgroundColor:borData.map(v=>v>85?'#F76B4F':v>=75?'#34C98F':'#FBBF24'),borderRadius:5}]},options:{...baseOpts(),scales:{y:{min:55,max:100,grid:{color:'#F0EDE8'},ticks:{callback:v=>v+'%'}},x:{grid:{display:false}}}}});

    const alosTrend=mergedALOSTrend();
    const dispAlosTrend=month==='all'?alosTrend:[alosTrend[parseInt(month)-1]];
    makeOrUpdate('e-alosTrendChart',{type:'line',data:{labels:dispLabels,datasets:[{label:'ALOS (hari)',data:dispAlosTrend,borderColor:'#4F7EF7',backgroundColor:'rgba(79,126,247,0.12)',fill:true,tension:0.4,pointBackgroundColor:'#4F7EF7',pointRadius:5},{label:'Target <4 hari',data:dispLabels.map(()=>4),borderColor:'#F76B4F',borderDash:[5,4],borderWidth:1.5,pointRadius:0,fill:false}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:true,position:'bottom',labels:{boxWidth:10,padding:14}}},scales:{y:{min:2,max:7,grid:{color:'#F0EDE8'}},x:{grid:{display:false}}}}});
    makeOrUpdate('e-alosWardChart',{type:'bar',data:{labels:dispWards.map(w=>w.split(' ').slice(0,2).join(' ')),datasets:[{label:'ALOS (hari)',data:alosData,backgroundColor:alosData.map(v=>v>4?'#F76B4F':v>3.5?'#FBBF24':'#34C98F'),borderRadius:5},{label:'Target 4 hari',data:dispWards.map(()=>4),type:'line',borderColor:'#4F7EF7',borderDash:[5,4],borderWidth:2,pointRadius:0,fill:false}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:true,position:'bottom',labels:{boxWidth:10,padding:14}}},scales:{y:{beginAtZero:true,max:8,grid:{color:'#F0EDE8'}},x:{grid:{display:false}}}}});

    const borTbody=document.getElementById('eff-bor-tbody');
    if (borTbody) borTbody.innerHTML=dispWards.map((w,i)=>{
        const cap=BED_CAPACITY[w],bor=borData[i],terisi=Math.round(bor/100*cap),lv=liveWards[w];
        const src=lv?'<span class="ds-badge ds-live">● Live</span>':'<span class="ds-badge ds-static">Baseline</span>';
        const status=bor>85?'<span class="td-pill" style="background:#FEF2F2;color:#DC2626">Kritis</span>':bor>=75?'<span class="td-pill" style="background:#ECFDF5;color:#059669">Ideal</span>':'<span class="td-pill" style="background:#FFFBEB;color:#D97706">Di Bawah Target</span>';
        return `<tr><td>${w}</td><td>${cap}</td><td>${terisi}</td><td>${bor}%</td><td>${src}</td><td>${status}</td></tr>`;
    }).join('');
    const alosTbody=document.getElementById('eff-alos-tbody');
    if (alosTbody) alosTbody.innerHTML=dispWards.map((w,i)=>{
        const alos=alosData[i],lv=liveALOS[w];
        const src=lv?'<span class="ds-badge ds-live">● Live</span>':'<span class="ds-badge ds-static">Baseline</span>';
        const status=alos>4?'<span class="td-pill" style="background:#FEF2F2;color:#DC2626">Melebihi Target</span>':alos>3.5?'<span class="td-pill" style="background:#FFFBEB;color:#D97706">Hampir Tercapai</span>':'<span class="td-pill" style="background:#ECFDF5;color:#059669">Tercapai</span>';
        return `<tr><td>${w}</td><td>${alos}</td><td>${lv?lv.count:'\u2014'}</td><td>${src}</td><td>${status}</td></tr>`;
    }).join('');

    const critWards=dispWards.filter((w,i)=>borData[i]>85);
    const highALOS=dispWards.filter((w,i)=>alosData[i]>4);
    const effInsight=document.getElementById('eff-insight-text');
    if (effInsight) effInsight.innerHTML=`Rata-rata BOR periode ini <strong style="color:#fff">${avgBOR}%</strong>${avgBOR>=75&&avgBOR<=85?' \u2014 berada dalam rentang ideal 75\u201385%':avgBOR>85?' \u2014 melampaui batas atas, perlu antisipasi kapasitas':' \u2014 di bawah target minimum 75%'}.${critWards.length>0?` <strong style="color:#fff">${critWards.join(', ')}</strong> mencatat utilisasi kritis di atas 85%.`:''} ALOS rata-rata <strong style="color:#fff">${avgALOS} hari</strong>${highALOS.length>0?`; bangsal <strong style="color:#fff">${highALOS.join(', ')}</strong> melebihi target &lt;4 hari`:' \u2014 seluruh bangsal dalam target'}. TOI estimasi <strong style="color:#fff">${toi} hari</strong>.`;
}

// ══════════════════════════════════════════════════════════════
// READMISSION PAGE  (DB_KEY — storage terpisah)
// ══════════════════════════════════════════════════════════════
function raLoad() { try{return JSON.parse(localStorage.getItem(DB_KEY))||[];}catch{return [];} }
function raSave(data) { localStorage.setItem(DB_KEY,JSON.stringify(data)); }

function isReadmission(visits,patientId,visitDate,excludeIndex=-1) {
    const current=new Date(visitDate);
    return visits.some((v,i)=>{
        if (i===excludeIndex||v.patientId!==patientId) return false;
        const diff=(current-new Date(v.visitDate))/86400000;
        return diff>0&&diff<=30;
    });
}

function recalcStatus(visits) {
    return visits.map((v,i)=>({...v,status:isReadmission(visits,v.patientId,v.visitDate,i)?'readmit':visits.filter((x,j)=>j<i&&x.patientId===v.patientId).length>0?'followup':'new'}));
}

function renderKPI(visits) {
    const total=visits.length,readmits=visits.filter(v=>v.status==='readmit').length;
    const rate=total>0?((readmits/total)*100).toFixed(1):0;
    document.getElementById('ra-totalVisits').textContent=total;
    document.getElementById('ra-readmitCount').textContent=readmits;
    document.getElementById('ra-rate').textContent=rate+'%';
    const rc=document.getElementById('ra-rate')?.closest('.kpi-card');
    if (rc) rc.className='kpi-card '+(rate>5?'red':'green');
}

function renderRaTable(visits) {
    const tbody=document.getElementById('ra-tableBody');
    if (!tbody) return;
    if (!visits.length){tbody.innerHTML=`<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">🏥</div>Belum ada data kunjungan. Tambahkan melalui form di atas.</div></td></tr>`;return;}
    const sm={readmit:{label:'Readmission',cls:'badge-readmit'},new:{label:'Pasien Baru',cls:'badge-new'},followup:{label:'Kontrol',cls:'badge-followup'}};
    tbody.innerHTML=[...visits].reverse().map((v,ri)=>{
        const idx=visits.length-1-ri,s=sm[v.status];
        const d=new Date(v.visitDate).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'});
        return `<tr><td><code style="font-size:12px">${v.patientId}</code></td><td>${v.patientName}</td><td>${d}</td><td>${v.poli}</td><td>${v.diagnosis||'\u2014'}</td><td><span class="td-pill ${s.cls}">${s.label}</span></td><td><button class="btn btn-danger" onclick="deleteVisit(${idx})">Hapus</button></td></tr>`;
    }).join('');
}

function renderRaChart(visits) {
    const counts={};
    visits.filter(v=>v.status==='readmit').forEach(v=>{const key=v.visitDate.slice(0,7);counts[key]=(counts[key]||0)+1;});
    const months=[],now=new Date();
    for (let i=5;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);months.push(d.toISOString().slice(0,7));}
    const labels=months.map(m=>{const[y,mo]=m.split('-');return new Date(y,mo-1).toLocaleDateString('id-ID',{month:'short',year:'2-digit'});});
    const data=months.map(m=>counts[m]||0);
    makeOrUpdate('ra-trendChart',{type:'bar',data:{labels,datasets:[{label:'Readmission',data,backgroundColor:data.map(v=>v===0?'#E8E6E0':'#F76B4F'),borderRadius:6}]},options:{...baseOpts(),scales:{y:{beginAtZero:true,ticks:{stepSize:1},grid:{color:'#F0EDE8'}},x:{grid:{display:false}}}}});
}

function renderReadmissionPage() {
    const visits=raLoad();
    renderKPI(visits);
    renderRaTable(visits);
    renderRaChart(visits);
}

function addVisit() {
    const patientId=document.getElementById('ra-patientId')?.value.trim();
    const patientName=document.getElementById('ra-patientName')?.value.trim();
    const visitDate=document.getElementById('ra-visitDate')?.value;
    const poli=document.getElementById('ra-poli')?.value;
    const diagnosis=document.getElementById('ra-diagnosis')?.value.trim();
    if (!patientId||!patientName||!visitDate||!poli){showToast('⚠️ Lengkapi semua field wajib terlebih dahulu.');return;}
    let visits=raLoad();
    visits.push({patientId,patientName,visitDate,poli,diagnosis,status:'new'});
    visits=recalcStatus(visits);
    raSave(visits);
    ['ra-patientId','ra-patientName','ra-poli','ra-diagnosis'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
    const rd=document.getElementById('ra-visitDate');if(rd)rd.valueAsDate=new Date();
    showToast(visits[visits.length-1].status==='readmit'?'🔴 Kunjungan ditambahkan — terdeteksi READMISSION dalam 30 hari!':'✅ Kunjungan berhasil ditambahkan.');
    renderReadmissionPage();
}

function deleteVisit(index) {
    let visits=raLoad();visits.splice(index,1);visits=recalcStatus(visits);raSave(visits);renderReadmissionPage();showToast('🗑️ Data kunjungan dihapus.');
}

function clearAllVisits() {
    if (!confirm('Hapus semua data kunjungan? Tindakan ini tidak bisa dibatalkan.')) return;
    raSave([]);renderReadmissionPage();showToast('🗑️ Semua data berhasil dihapus.');
}

// ══════════════════════════════════════════════════════════════
// INPUT FORM LOGIC
// ══════════════════════════════════════════════════════════════
let editingIndex=null;

function calcLOS(){
    const a=document.getElementById('admissionDate')?.value,d=document.getElementById('dischargeDate')?.value;
    if (a&&d){const diff=(new Date(d)-new Date(a))/86400000;document.getElementById('lengthOfStay').value=diff>=0?diff.toFixed(1):'';}
    else if(document.getElementById('lengthOfStay'))document.getElementById('lengthOfStay').value='';
}
function calcWait(){
    const r=document.getElementById('registrationTime')?.value,c=document.getElementById('callTime')?.value;
    if (r&&c){const[rh,rm]=r.split(':').map(Number),[ch,cm]=c.split(':').map(Number),diff=(ch*60+cm)-(rh*60+rm);document.getElementById('waitTime').value=diff>=0?diff:'';}
    else if(document.getElementById('waitTime'))document.getElementById('waitTime').value='';
}

function renderHistory() {
    const h=getData(),tb=document.getElementById('historyTableBody');
    if (!tb) return;
    if (!h.length){tb.innerHTML='<tr><td colspan="12" class="history-empty">Belum ada data tersimpan.</td></tr>';return;}
    tb.innerHTML=h.map((d,i)=>`<tr><td>${i+1}</td><td><strong>${d.patientName||'\u2014'}</strong></td><td style="color:var(--muted);font-size:12px">${d.patientId||'\u2014'}</td><td>${d.ward||'\u2014'}</td><td>${d.serviceType||'\u2014'}</td><td>${d.admissionDate||'\u2014'}</td><td>${d.dischargeDate||'\u2014'}</td><td>${d.lengthOfStay?d.lengthOfStay+' hr':'\u2014'}</td><td>${d.waitTime?d.waitTime+' mnt':'\u2014'}</td><td>${d.satisfactionScore?d.satisfactionScore+'/5':'\u2014'}</td><td>${d.financeType?`<span class="td-pill" style="background:${d.financeType==='Pemasukan'?'#ECFDF5':'#FEF2F2'};color:${d.financeType==='Pemasukan'?'#059669':'#DC2626'}">${d.financeType}</span>`:'\u2014'}</td><td><button class="btn-edit" onclick="editEntry(${i})">Edit</button><button class="btn-delete" onclick="deleteEntry(${i})">Hapus</button></td></tr>`).join('');
}

function editEntry(idx){
    const d=getData()[idx];if(!d)return;editingIndex=idx;
    ['patientName','patientId','ward','admissionDate','dischargeDate','lengthOfStay','serviceType','visitDate','registrationTime','callTime','waitTime','satisfactionScore','financeDate','financeType','financeUnit','financeAmount','financeNote'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=d[id]||'';});
    const fv=document.getElementById('isFirstVisit');if(fv)fv.checked=!!d.isFirstVisit;
    document.getElementById('editBanner')?.classList.add('show');
    document.getElementById('saveIndicator')?.classList.remove('show');
    const btn=document.getElementById('submitBtn');
    if(btn)btn.innerHTML='<svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Perbarui Data';
    window.scrollTo({top:0,behavior:'smooth'});
}
function deleteEntry(idx){
    if(!confirm('Hapus data ini?'))return;
    const h=getData();h.splice(idx,1);saveAll(h);
    if(editingIndex===idx){editingIndex=null;resetForm();}
    renderHistory();refreshAllPages();
}
function clearAll(){
    if(!confirm('Hapus semua data histori? Ini tidak dapat dibatalkan.'))return;
    saveAll([]);editingIndex=null;resetForm();renderHistory();refreshAllPages();
}
function resetForm(){
    document.getElementById('healthForm')?.reset();
    ['lengthOfStay','waitTime'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
    document.getElementById('editBanner')?.classList.remove('show');
    const btn=document.getElementById('submitBtn');
    if(btn)btn.innerHTML='<svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h11a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/></svg> Simpan Data';
}
async function handleSubmit(e){
  e.preventDefault();
  const fields = ['patientName','patientId','ward','admissionDate','dischargeDate','lengthOfStay',
                  'serviceType','visitDate','registrationTime','callTime','waitTime','satisfactionScore',
                  'financeDate','financeType','financeUnit','financeAmount','financeNote'];
  const data = Object.fromEntries(fields.map(id => {
    const el = document.getElementById(id);
    return [id, el ? (el.value.trim ? el.value.trim() : el.value) : ''];
  }));
  data.isFirstVisit = document.getElementById('isFirstVisit').checked;
  data.createdAt = new Date().toISOString();

  // Save to localStorage (existing behaviour)
  const h = getData();
  if (editingIndex!==null) { h[editingIndex]=data; editingIndex=null; } else { h.push(data); }
  saveAll(h);

  // Send to MongoDB via Express server
  try {
    const res = await fetch('http://localhost:3000/insert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Server error');
    console.log('MongoDB insert success:', result.id);
  } catch (err) {
    console.error('MongoDB error:', err.message);
    alert('⚠️ Data tersimpan lokal, tapi gagal kirim ke server:\n' + err.message);
  }

  resetForm();
  document.getElementById('saveIndicator').classList.add('show');
  setTimeout(()=>document.getElementById('saveIndicator').classList.remove('show'),3000);
  renderHistory();
  refreshAllPages();
}

// ══════════════════════════════════════════════════════════════
// TOAST
// ══════════════════════════════════════════════════════════════
function showToast(msg){
    let toast=document.getElementById('medcore-toast');
    if(!toast){toast=document.createElement('div');toast.id='medcore-toast';toast.className='toast';document.body.appendChild(toast);}
    toast.textContent=msg;toast.classList.add('show');clearTimeout(toast._t);
    toast._t=setTimeout(()=>toast.classList.remove('show'),3000);
}

// ══════════════════════════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════════════════════════
function showPage(id,btn){
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
    document.getElementById('page-'+id).classList.add('active');
    btn.classList.add('active');
    if      (id==='home')        renderHomePage();
    else if (id==='service')     renderServicePage();
    else if (id==='finance')     renderFinancePage();
    else if (id==='efficiency')  renderEfficiencyPage();
    else if (id==='readmission') renderReadmissionPage();
    else if (id==='hr')          renderHRPage();
}

function refreshAllPages(){
    renderHomePage();renderServicePage();renderFinancePage();renderEfficiencyPage();
}

// ══════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════
// document.addEventListener('DOMContentLoaded',()=>{
//     document.getElementById('admissionDate')?.addEventListener('change',calcLOS);
//     document.getElementById('dischargeDate')?.addEventListener('change',calcLOS);
//     document.getElementById('registrationTime')?.addEventListener('change',calcWait);
//     document.getElementById('callTime')?.addEventListener('change',calcWait);
//     const raDate=document.getElementById('ra-visitDate');
//     if(raDate)raDate.valueAsDate=new Date();
//     renderHomePage();
//     renderServicePage();
//     renderFinancePage();
//     renderEfficiencyPage();
//     renderReadmissionPage();
//     renderHRPage();
//     renderHistory();
// });

// ══════════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════════
let isAdmin = false;

function setAdminUI(admin) {
  isAdmin = admin;

  document.querySelectorAll('.nav-item.admin-only').forEach(btn => {
    if (admin) {
      btn.classList.add('admin-visible');
      btn.style.display = '';        // clear any leftover inline style
    } else {
      btn.classList.remove('admin-visible');
      btn.style.display = 'none';
    }
  });

  document.getElementById('loginBtn').style.display = admin ? 'none' : '';
  document.getElementById('logoutBtn').style.display = admin ? '' : 'none';

  if (!admin) {
    const restrictedPages = ['page-service','page-finance','page-hr','page-readmission','page-efficiency','page-input'];
    const onRestricted = restrictedPages.some(id => {
      const el = document.getElementById(id);
      return el && el.classList.contains('active');
    });
    if (onRestricted) {
      showPage('home', document.querySelector('.nav-item'));
    }
  }
}

function showLoginOverlay() {
  document.getElementById('loginOverlay').style.display = 'flex';
}

async function submitLogin() {
  const username = document.getElementById('loginUsername').value;
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  try {
    const res = await fetch('http://localhost:3000/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password })
    });
    if (res.ok) {
      document.getElementById('loginOverlay').style.display = 'none';
      errEl.style.display = 'none';
      setAdminUI(true);
    } else {
      errEl.style.display = 'block';
    }
  } catch (err) {
    errEl.textContent = 'Tidak dapat terhubung ke server.';
    errEl.style.display = 'block';
  }
}

async function doLogout() {
  await fetch('http://localhost:3000/logout', { method: 'POST', credentials: 'include' });
  setAdminUI(false);
}

// Check session on page load
async function checkSession() {
  try {
    const res = await fetch('http://localhost:3000/me', { credentials: 'include' });
    const data = await res.json();
    setAdminUI(data.isAdmin);
  } catch {
    setAdminUI(false);
  }
}

// ── INIT ──────────────────────────────────────────────────────
renderHomePage();
renderServicePage();
renderFinancePage();
renderEfficiencyPage();
renderHistory();
syncFromMongoDB();
setInterval(syncFromMongoDB, 30000);
checkSession();   // ← check if already logged in on page load
