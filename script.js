// ══════════════════════════════════════════════════════════════
// CONSTANTS & MASTER DATA
// ══════════════════════════════════════════════════════════════
const STORAGE_KEY   = 'medcoreData_v2';   // data utama (BOR, ALOS, finance, dll)
const DB_KEY        = 'medcore_visits';   // data khusus readmission

const MONTHS      = ['Oktober','November','Desember','Januari','Februari','Maret'];
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
    1:{score:4.1,respondents:312}, 2:{score:3.8,respondents:289},
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

// ── Baseline clinical KPI data ─────────────────────────────────
const BASE_READMISSION_RATE = {1:5.8, 2:5.5, 3:5.2, 4:5.0, 5:5.1, 6:5.2};
const BASE_RA_WARD = {
    'ICU / Intensif':7.9, 'Bangsal Mawar (VIP)':3.5, 'Bangsal Melati (Kelas 1)':4.3,
    'Bangsal Anggrek (Kelas 2)':6.0, 'Bangsal Dahlia (Kelas 3)':6.0, 'Perinatologi / Neonatus':3.1
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
        const rows = data.filter(d => (d.serviceType === p || d.doctorPoli === p) && d.registrationTime && d.callTime);
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

// Store computed wait data globally so home page can reuse it
let _svcWaitData = null;

function renderHomeWaitChart() {
    const labels = _svcWaitData ? _svcWaitData.poliFilter : POLI_LIST;
    const vals   = _svcWaitData ? _svcWaitData.waitVals   : POLI_LIST.map(p => BASE_WAIT[p] || 0);
    makeOrUpdate('h-waitChart',{type:'bar',data:{labels,datasets:[{label:'Menit',data:vals,backgroundColor:'#4F7EF7',borderRadius:5}]},options:{...baseOpts(),indexAxis:'y',scales:{x:{grid:{display:false}},y:{grid:{display:false}}}}});
}


// ── Home staff chart — synced with HR page ratio data ─────────
function renderHomeStaffChart() {
    const HR_POLI = ['Poli Gigi','Poli Anak','Poli Kandungan','Poli Dalam','Poli Mata'];
    const BASE_RATIO = { 'Poli Gigi':7.0,'Poli Anak':9.5,'Poli Kandungan':17.5,'Poli Dalam':8.4,'Poli Mata':9.5 };
    const labels = ['Gigi','Anak','Kandungan','Dalam','Mata'];
    // Use live HR data if available, else baseline ratio
    const ratioData = _hrRatioData
        ? _hrRatioData
        : HR_POLI.map(p => BASE_RATIO[p]);
    makeOrUpdate('h-staffChart', {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Pasien per Dokter',
                data: ratioData,
                backgroundColor: ratioData.map(v => v > 10 ? '#F76B4F' : v > 7 ? '#FBBF24' : '#A78BF5'),
                borderRadius: 5
            }]
        },
        options: {
            ...baseOpts(),
            scales: {
                y: { beginAtZero: true, grid: { color: '#F0EDE8' } },
                x: { grid: { display: false } }
            }
        }
    });
}

function renderHomePage() {
    const baseTotal = MONTH_NUMS.reduce((s,m)=>{const b=BASE_FINANCE[m];return s+b.rj+b.ri+b.fa+b.ll;},0);
    const homeRev = document.getElementById('home-revenue');
    if (homeRev) { homeRev.textContent = fmtM(baseTotal); document.getElementById('home-revenue-sub').innerHTML = 'Per Maret 2026'; }
    const homeBor = document.getElementById('home-bor');
    if (homeBor) { homeBor.textContent = BASE_BOR_TREND[6]+'%'; document.getElementById('home-bor-sub').textContent = 'Kapasitas Maret 2026'; }
    const homeSat = document.getElementById('home-satisfaction');
    if (homeSat) { homeSat.textContent = '4,5/5'; document.getElementById('home-satisfaction-sub').textContent = 'Berdasarkan survei pasien'; }

    const baseUnit = MONTH_NUMS.reduce((acc,m)=>{const b=BASE_FINANCE[m];acc.rj+=b.rj;acc.ri+=b.ri;acc.fa+=b.fa;acc.ll+=b.ll;return acc;},{rj:0,ri:0,fa:0,ll:0});
    makeOrUpdate('h-financeChart',{type:'doughnut',data:{labels:['Rawat Jalan','Rawat Inap','Farmasi','Loket & Lain'],datasets:[{data:[baseUnit.rj,baseUnit.ri,baseUnit.fa,baseUnit.ll],backgroundColor:palette,borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{boxWidth:10,padding:14}}}}});
    renderHomeWaitChart();

    // Staff chart — synced with HR page via renderHomeStaffChart()
    renderHomeStaffChart();

    makeOrUpdate('h-patientChart',{type:'line',data:{labels:MONTHS,datasets:[{data:MONTH_NUMS.map(m=>BASE_NEW_PATIENTS[m]),borderColor:'#34C98F',backgroundColor:'rgba(52,201,143,0.12)',fill:true,tension:0.4,pointBackgroundColor:'#34C98F',pointRadius:4}]},options:{...baseOpts(),scales:{y:{beginAtZero:true,grid:{color:'#F0EDE8'}},x:{grid:{display:false}}}}});
}

// ══════════════════════════════════════════════════════════════
// SERVICE PAGE
// ══════════════════════════════════════════════════════════════
function renderServicePage() {
    renderServicePageWithData(null); // render with localStorage/baseline first
    fetchWaitFromMongo();
}

async function fetchWaitFromMongo() {
    try {
        const res = await fetch('http://localhost:3000/data', { credentials: 'include' });
        if (!res.ok) throw new Error('Server error');
        const mongoData = await res.json();
        const local = getData();
        const merged = mongoData.length > 0 ? mongoData : local;
        renderServicePageWithData(merged);
    } catch (err) {
        console.warn('Service: Could not fetch from MongoDB, using localStorage:', err.message);
        renderServicePageWithData(getData());
    }
}

function computeWaitData(inputData, month, poliFilter) {
    // Compute live wait times from inputData
    let data = inputData || [];
    if (month !== 'all') data = data.filter(d => getMonth(d.visitDate) == month);
    const liveWait = {};
    POLI_LIST.forEach(p => {
        const rows = data.filter(d => (d.serviceType === p || d.doctorPoli === p) && d.registrationTime && d.callTime);
        if (rows.length) {
            const avg = rows.reduce((sum, d) => {
                const [rh,rm] = d.registrationTime.split(':').map(Number);
                const [ch,cm] = d.callTime.split(':').map(Number);
                return sum + Math.max(0, (ch*60+cm)-(rh*60+rm));
            }, 0) / rows.length;
            liveWait[p] = Math.round(avg);
        }
    });
    // Merge: live overrides baseline for polis with real data
    const merged = {};
    poliFilter.forEach(p => {
        merged[p] = { val: liveWait[p] !== undefined ? liveWait[p] : BASE_WAIT[p], isLive: liveWait[p] !== undefined };
    });
    return merged;
}

function renderServicePageWithData(inputData) {
    const month = document.getElementById('svc-filter-month')?.value||'all';
    const poli  = document.getElementById('svc-filter-poli')?.value||'all';
    const badge = document.getElementById('svc-data-badge');

    const dispMonths    = month==='all' ? MONTH_NUMS : [parseInt(month)];
    const filteredMonths = dispMonths.map(m=>MONTHS[m-1]);
    const satScores      = dispMonths.map(m=>BASE_SATISFACTION[m].score);
    makeOrUpdate('s-satisfactionChart',{type:'line',data:{labels:filteredMonths,datasets:[{data:satScores,borderColor:'#A78BF5',backgroundColor:'rgba(167,139,245,0.12)',fill:true,tension:0.4,pointBackgroundColor:'#A78BF5',pointRadius:5}]},options:{...baseOpts(),scales:{y:{min:3.5,max:5,grid:{color:'#F0EDE8'}},x:{grid:{display:false}}}}});

    const patVals = dispMonths.map(m=>BASE_NEW_PATIENTS[m]);
    makeOrUpdate('s-newPatientChart',{type:'line',data:{labels:filteredMonths,datasets:[{data:patVals,borderColor:'#34C98F',backgroundColor:'rgba(52,201,143,0.12)',fill:true,tension:0.4,pointBackgroundColor:'#34C98F',pointRadius:5}]},options:{...baseOpts(),scales:{y:{beginAtZero:true,grid:{color:'#F0EDE8'}},x:{grid:{display:false}}}}});

    const poliFilter = poli==='all' ? POLI_LIST : (POLI_LIST.includes(poli)?[poli]:POLI_LIST);

    // Use MongoDB/live data if available, else baseline
    const allData = inputData !== null ? inputData : getData();
    const waitMap = computeWaitData(allData, month, poliFilter);
    const hasLive = poliFilter.some(p => waitMap[p].isLive);
    if (badge) badge.textContent = hasLive ? '● Live + Baseline' : '● Baseline';

    const waitVals   = poliFilter.map(p => waitMap[p].val);
    const waitColors = waitVals.map(v=>v>30?'#F76B4F':v===30?'#FBBF24':'#34C98F');
    makeOrUpdate('s-waitChart',{type:'bar',data:{labels:poliFilter,datasets:[{label:'Waktu Tunggu (Menit)',data:waitVals,backgroundColor:waitColors,borderRadius:5},{label:'Target (30 menit)',data:poliFilter.map(()=>30),type:'line',borderColor:'#F76B4F',borderDash:[6,4],borderWidth:2,pointRadius:0,fill:false}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:true,position:'bottom',labels:{boxWidth:10,padding:14}}},scales:{y:{beginAtZero:true,grid:{color:'#F0EDE8'}},x:{grid:{display:false}}}}});

    // Also sync home wait chart
    _svcWaitData = { poliFilter, waitVals };
    renderHomeWaitChart();

    const satTbody = document.getElementById('svc-satisfaction-tbody');
    if (satTbody) satTbody.innerHTML = dispMonths.map(m=>{
        const base=BASE_SATISFACTION[m],pct=Math.round((base.score/5)*100);
        const status=base.score>=4.4?'Sangat Baik':base.score>=4.0?'Baik':'Perlu Perbaikan';
        const sc=base.score>=4.0?'background:#ECFDF5;color:#059669':'background:#FEF2F2;color:#DC2626';
        return `<tr><td>${MONTHS[m-1]}</td><td>${base.respondents}</td><td>${base.score.toFixed(1)}</td><td><span class="td-pill" style="${sc}">${status}</span></td></tr>`;
    }).join('');

    const waitTbody = document.getElementById('svc-wait-tbody');
    if (waitTbody) waitTbody.innerHTML = poliFilter.map((p,i)=>{
        const val=waitVals[i];
        const isLive = waitMap[p].isLive;
        // const srcBadge = isLive ? '<span class="ds-badge ds-live">● MongoDB</span>' : '<span class="ds-badge ds-static">Baseline</span>';
        const status=val>30?'<span class="td-pill" style="background:#FEF2F2;color:#DC2626">Melebihi Target</span>':val===30?'<span class="td-pill" style="background:#FFFBEB;color:#D97706">Batas Target</span>':'<span class="td-pill" style="background:#ECFDF5;color:#059669">Tercapai</span>';
        return `<tr><td>${p}</td><td>${val} menit</td><td>${status}</td></tr>`;
    }).join('');

    const avgSat=(satScores.reduce((a,b)=>a+b,0)/satScores.length).toFixed(1);
    const maxWaitVal=Math.max(...waitVals);
    const maxWaitPoli=poliFilter[waitVals.indexOf(maxWaitVal)];
    const insightEl=document.getElementById('svc-insight-text');
    if (insightEl) insightEl.innerHTML=`Rata-rata kepuasan pasien periode yang ditampilkan berada di angka <strong style="color:#fff">${avgSat}/5</strong> (data baseline Jan–Jun 2025). Waktu tunggu tertinggi tercatat di <strong style="color:#fff">${maxWaitPoli}</strong> dengan rata-rata <strong style="color:#fff">${maxWaitVal} menit</strong>${maxWaitVal>30?' — melebihi target &lt;30 menit yang perlu segera ditangani':' — masih dalam batas target'}.`;
}

// ══════════════════════════════════════════════════════════════
// FINANCE PAGE
// ══════════════════════════════════════════════════════════════
function renderFinancePage() {
    const month=document.getElementById('fin-filter-month')?.value||'all';
    const unit =document.getElementById('fin-filter-unit')?.value||'all';
    const badge=document.getElementById('fin-data-badge');
    if (badge) badge.textContent='● Baseline';

    const dispMonths=month==='all'?MONTH_NUMS:[parseInt(month)];
    const totals={rj:0,ri:0,fa:0,ll:0};
    dispMonths.forEach(m=>{const b=BASE_FINANCE[m];totals.rj+=b.rj;totals.ri+=b.ri;totals.fa+=b.fa;totals.ll+=b.ll;});

    const pieData=unit==='all'?[totals.rj,totals.ri,totals.fa,totals.ll]:[unit==='Rawat Jalan'?totals.rj:0,unit==='Rawat Inap'?totals.ri:0,unit==='Farmasi'?totals.fa:0,unit==='Loket & Lain'?totals.ll:0];
    makeOrUpdate('f-pieChart',{type:'doughnut',data:{labels:FIN_UNITS,datasets:[{data:pieData,backgroundColor:palette,borderWidth:0,hoverOffset:6}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{boxWidth:10,padding:16}}}}});

    const revVals=dispMonths.map(m=>{const b=BASE_FINANCE[m];return Math.round(b.rj+b.ri+b.fa+b.ll);});
    const minRev=Math.min(...revVals);
    makeOrUpdate('f-revenueChart',{type:'bar',data:{labels:dispMonths.map(m=>MONTHS[m-1]),datasets:[{label:'Total (Juta Rp)',data:revVals,backgroundColor:revVals.map(v=>v===minRev?'#F76B4F':'#4F7EF7'),borderRadius:5}]},options:{...baseOpts(),scales:{y:{beginAtZero:false,min:Math.max(0,minRev-100),grid:{color:'#F0EDE8'}},x:{grid:{display:false}}}}});

    const distKeys=[{key:'rj',label:'Rawat Jalan',target:FIN_TARGETS.rj},{key:'ri',label:'Rawat Inap',target:FIN_TARGETS.ri},{key:'fa',label:'Farmasi',target:FIN_TARGETS.fa},{key:'ll',label:'Loket & Lain',target:FIN_TARGETS.ll}];
    const grandTotal=Object.values(totals).reduce((a,b)=>a+b,0);
    const distRows=distKeys.filter(d=>unit==='all'||d.label===unit).map(d=>{
        const amt=totals[d.key],pct=grandTotal>0?Math.round(amt/grandTotal*100):0;
        const tgt=d.target*dispMonths.length,ach=tgt>0?Math.round(amt/tgt*100):0;
        return `<tr><td>${d.label}</td><td>Rp ${Math.round(amt)}</td><td>Rp ${tgt}</td><td>${ach}%</td><td><span class="td-pill" style="${ach>=100?'background:#ECFDF5;color:#059669':'background:#FEF2F2;color:#DC2626'}">${ach>=100?'Tercapai':'Belum Tercapai'}</span></td></tr>`;
    });
    distRows.push(`<tr style="font-weight:600"><td>Total</td><td>Rp ${Math.round(grandTotal)}</td><td>—</td><td>—</td><td>—</td></tr>`);
    const distTbody=document.getElementById('fin-dist-tbody');
    if (distTbody) distTbody.innerHTML=distRows.join('');

    const monthlyTbody=document.getElementById('fin-monthly-tbody');
    if (monthlyTbody) monthlyTbody.innerHTML=dispMonths.map(m=>{
        const b=BASE_FINANCE[m],tot=b.rj+b.ri+b.fa+b.ll;
        return `<tr><td>${MONTHS[m-1]}</td><td>${b.rj}</td><td>${b.ri}</td><td>${b.fa}</td><td>${b.ll}</td><td><strong>${Math.round(tot)}</strong></td></tr>`;
    }).join('');

    const totalRev=dispMonths.reduce((s,m)=>{const b=BASE_FINANCE[m];return s+b.rj+b.ri+b.fa+b.ll;},0);
    const finInsight=document.getElementById('fin-insight-text');
    if (finInsight) finInsight.innerHTML=`Total pendapatan periode yang ditampilkan mencapai <strong style="color:#fff">Rp ${Math.round(totalRev)} Juta</strong> (data baseline Jan–Jun 2025). Unit Rawat Inap tetap menjadi kontributor terbesar dengan <strong style="color:#fff">Rp ${Math.round(totals.ri)} Juta</strong>. Layanan Loket &amp; Lain masih di bawah target dan perlu perhatian pada kuartal berikutnya.`;
}

// ══════════════════════════════════════════════════════════════
// ============================================================
// HR PAGE  - data dari section Input Data (STORAGE_KEY)
// ============================================================
function renderHRPage() {
    renderHRPageWithData(null); // start with localStorage while MongoDB loads
    fetchHRFromMongo();
}

async function fetchHRFromMongo() {
    try {
        const res = await fetch('http://localhost:3000/data', { credentials: 'include' });
        if (!res.ok) throw new Error('Server error');
        const mongoData = await res.json();
        // Merge with localStorage (localStorage may have records not yet in mongo)
        const local = getData();
        const merged = mongoData.length > 0 ? mongoData : local;
        renderHRPageWithData(merged);
    } catch (err) {
        console.warn('HR: Could not fetch from MongoDB, using localStorage:', err.message);
        renderHRPageWithData(getData());
    }
}

// Store computed ratio globally so home page can reuse it
let _hrRatioData = null;
let _hrPoliList  = null;

function renderHRPageWithData(inputData) {
    if (!inputData) inputData = getData();

    const HR_POLI = ['Poli Gigi','Poli Anak','Poli Kandungan','Poli Dalam','Poli Mata'];

    // Count unique doctor names per poli (case-insensitive trim)
    const doctorPerPoli = {};
    HR_POLI.forEach(p => doctorPerPoli[p] = new Set());
    inputData.forEach(d => {
        if (d.doctorName && d.doctorPoli && HR_POLI.includes(d.doctorPoli)) {
            doctorPerPoli[d.doctorPoli].add(d.doctorName.trim().toLowerCase());
        }
    });

    // Count patients per poli from serviceType
    const pasienPerPoli = {};
    HR_POLI.forEach(p => pasienPerPoli[p] = 0);
    inputData.forEach(d => {
        if (d.doctorPoli && HR_POLI.includes(d.doctorPoli)) pasienPerPoli[d.doctorPoli]++;
    });

    // Baseline fallbacks
    const BASE_DOKTER = { 'Poli Gigi':3,'Poli Anak':4,'Poli Kandungan':2,'Poli Dalam':5,'Poli Mata':2};
    const BASE_PASIEN = { 'Poli Gigi':21,'Poli Anak':38,'Poli Kandungan':35,'Poli Dalam':42,'Poli Mata':19};

    const dokterData = HR_POLI.map(p => doctorPerPoli[p].size > 0 ? doctorPerPoli[p].size : BASE_DOKTER[p]);
    const pasienData = HR_POLI.map(p => pasienPerPoli[p] > 0 ? pasienPerPoli[p] : BASE_PASIEN[p]);
    const ratioData  = HR_POLI.map((p, i) => dokterData[i] > 0 ? +(pasienData[i] / dokterData[i]).toFixed(1) : 0);

    // Store globally for home page sync
    _hrRatioData = ratioData;
    _hrPoliList  = HR_POLI;

    // ── Chart: Pasien per Dokter (ratio bar) ──────────────────────
    makeOrUpdate('hr-staffPatientChart', {
        type: 'bar',
        data: {
            labels: HR_POLI,
            datasets: [{
                label: 'Pasien per Dokter',
                data: ratioData,
                backgroundColor: ratioData.map(v => v > 10 ? '#F76B4F' : v > 7 ? '#FBBF24' : '#34C98F'),
                borderRadius: 5
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y} pasien/dokter` } }
            },
            scales: {
                x: { grid: { display: false } },
                y: { beginAtZero: true, grid: { color: '#F0EDE8' },
                     title: { display: true, text: 'Pasien per Dokter' } }
            }
        }
    });

    // ── Table ─────────────────────────────────────────────────────
    const hrTbody = document.getElementById('hr-table-tbody');
    if (hrTbody) {
        const totalPasien = pasienData.reduce((a, b) => a + b, 0);
        hrTbody.innerHTML = HR_POLI.map((poli, i) => {
            const dok = dokterData[i];
            const pas = pasienData[i];
            const ratio = ratioData[i];
            const pct = totalPasien > 0 ? Math.round((pas / totalPasien) * 100) : 0;
            const isLive = doctorPerPoli[poli].size > 0 || pasienPerPoli[poli] > 0;
            const src = isLive
                ? '<span class="ds-badge ds-live">● MongoDB</span>'
                : '<span class="ds-badge ds-static">Baseline</span>';
            const ratioColor = ratio > 10 ? 'color:#DC2626;font-weight:600'
                             : ratio > 7  ? 'color:#D97706;font-weight:600'
                             : 'color:#059669';
            return `<tr>
                <td><strong>${poli}</strong></td>
                <td>${dok}</td>
                <td>${pas}</td>
                
                <td style="${ratioColor}">${ratio} pasien/dokter</td>
            </tr>`;
        }).join('');
    }

    // Re-render home chart to stay in sync
    renderHomeStaffChart();
}

// EFFICIENCY PAGE
// ══════════════════════════════════════════════════════════════
function renderEfficiencyPage() {
    const month=document.getElementById('eff-filter-month')?.value||'all';
    const ward =document.getElementById('eff-filter-ward')?.value||'all';
    const badge=document.getElementById('eff-data-badge');
    if (badge) badge.textContent='● Baseline';

    const dispWards=ward==='all'?WARD_LIST:[ward];
    const borData=dispWards.map(w=>BASE_BOR_WARD[w]);
    const alosData=dispWards.map(w=>BASE_ALOS_WARD_MAP[w]);
    const avgBOR=Math.round(borData.reduce((a,b)=>a+b,0)/borData.length);
    const avgALOS=+(alosData.reduce((a,b)=>a+b,0)/alosData.length).toFixed(1);
    const toi=+(((TOTAL_CAPACITY*(100-avgBOR)/100)/Math.max(1,TOTAL_CAPACITY))*avgALOS).toFixed(1);

    const borEl=document.getElementById('eff-bor');
    if (borEl) { borEl.textContent=avgBOR+'%'; document.getElementById('eff-bor-sub').innerHTML=avgBOR>=75&&avgBOR<=85?'<span class="kpi-badge badge-up">Ideal</span> Rentang 75–85%':avgBOR>85?'<span class="kpi-badge badge-down">Kritis</span> Di atas 85%':'<span class="kpi-badge badge-warn">Rendah</span> Di bawah 75%'; }
    const alosEl=document.getElementById('eff-alos');
    if (alosEl) { alosEl.textContent=avgALOS+' hari'; document.getElementById('eff-alos-sub').innerHTML=avgALOS<=4?'<span class="kpi-badge badge-up">Tercapai</span> Target &lt;4 hari':'<span class="kpi-badge badge-warn">Target &lt;4 hari</span>'; }
    const patEl=document.getElementById('eff-patients');
    if (patEl) { patEl.textContent='127'; document.getElementById('eff-patients-sub').textContent='Untuk seluruh bangsal'; }
    const toiEl=document.getElementById('eff-toi');
    if (toiEl) toiEl.textContent=toi+' hari';

    const dispLabels=month==='all'?MONTHS:[MONTHS[parseInt(month)-1]];
    const dispBorTrend=month==='all'?MONTH_NUMS.map(m=>BASE_BOR_TREND[m]):[BASE_BOR_TREND[parseInt(month)]];
    const dispAlosTrend=month==='all'?MONTH_NUMS.map(m=>BASE_ALOS_TREND[m]):[BASE_ALOS_TREND[parseInt(month)]];

    makeOrUpdate('e-borTrendChart',{type:'line',data:{labels:dispLabels,datasets:[{label:'BOR (%)',data:dispBorTrend,borderColor:'#34C98F',backgroundColor:'rgba(52,201,143,0.12)',fill:true,tension:0.4,pointBackgroundColor:'#34C98F',pointRadius:5},{label:'Target Min 75%',data:dispLabels.map(()=>75),borderColor:'#FBBF24',borderDash:[5,4],borderWidth:1.5,pointRadius:0,fill:false},{label:'Target Max 85%',data:dispLabels.map(()=>85),borderColor:'#F76B4F',borderDash:[5,4],borderWidth:1.5,pointRadius:0,fill:false}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:true,position:'bottom',labels:{boxWidth:10,padding:14}}},scales:{y:{min:55,max:99,grid:{color:'#F0EDE8'},ticks:{callback:v=>v+'%'}},x:{grid:{display:false}}}}});
    makeOrUpdate('e-borWardChart',{type:'bar',data:{labels:dispWards.map(w=>w.replace(/ \(Kelas \d\)/,'').replace(' (VIP)','')),datasets:[{label:'BOR (%)',data:borData,backgroundColor:borData.map(v=>v>85?'#F76B4F':v>=75?'#34C98F':'#FBBF24'),borderRadius:5},{label:'Target Min 75%',data:dispWards.map(()=>75),type:'line',borderColor:'#FBBF24',borderDash:[5,4],borderWidth:2,pointRadius:0,fill:false},{label:'Target Min 75%',data:dispWards.map(()=>85),type:'line',borderColor:'#F76B4F',borderDash:[5,4],borderWidth:2,pointRadius:0,fill:false}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:true,position:'bottom',labels:{boxWidth:10,padding:14}}},scales:{y:{min:55,max:100,grid:{color:'#F0EDE8'}},x:{grid:{display:false}}}}});
    makeOrUpdate('e-alosTrendChart',{type:'line',data:{labels:dispLabels,datasets:[{label:'ALOS (hari)',data:dispAlosTrend,borderColor:'#4F7EF7',backgroundColor:'rgba(79,126,247,0.12)',fill:true,tension:0.4,pointBackgroundColor:'#4F7EF7',pointRadius:5},{label:'Target <4 hari',data:dispLabels.map(()=>4),borderColor:'#F76B4F',borderDash:[5,4],borderWidth:1.5,pointRadius:0,fill:false}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:true,position:'bottom',labels:{boxWidth:10,padding:14}}},scales:{y:{min:2,max:7,grid:{color:'#F0EDE8'}},x:{grid:{display:false}}}}});
    makeOrUpdate('e-alosWardChart',{type:'bar',data:{labels:dispWards.map(w=>w.split(' ').slice(0,2).join(' ')),datasets:[{label:'ALOS (hari)',data:alosData,backgroundColor:alosData.map(v=>v>4?'#F76B4F':v>3.5?'#FBBF24':'#34C98F'),borderRadius:5},{label:'Target 4 hari',data:dispWards.map(()=>4),type:'line',borderColor:'#4F7EF7',borderDash:[5,4],borderWidth:2,pointRadius:0,fill:false}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:true,position:'bottom',labels:{boxWidth:10,padding:14}}},scales:{y:{beginAtZero:true,max:8,grid:{color:'#F0EDE8'}},x:{grid:{display:false}}}}});

    const borTbody=document.getElementById('eff-bor-tbody');
    if (borTbody) borTbody.innerHTML=dispWards.map((w,i)=>{
        const cap=BED_CAPACITY[w],bor=borData[i],terisi=Math.round(bor/100*cap);
        const status=bor>85?'<span class="td-pill" style="background:#FEF2F2;color:#DC2626">Kritis</span>':bor>=75?'<span class="td-pill" style="background:#ECFDF5;color:#059669">Ideal</span>':'<span class="td-pill" style="background:#FFFBEB;color:#D97706">Di Bawah Target</span>';
        return `<tr><td>${w}</td><td>${cap}</td><td>${terisi}</td><td>${bor}%</td><td>${status}</td></tr>`;
    }).join('');
    const alosTbody=document.getElementById('eff-alos-tbody');
    if (alosTbody) alosTbody.innerHTML=dispWards.map((w,i)=>{
        const alos=alosData[i];
        const status=alos>4?'<span class="td-pill" style="background:#FEF2F2;color:#DC2626">Melebihi Target</span>':alos>3.5?'<span class="td-pill" style="background:#FFFBEB;color:#D97706">Hampir Tercapai</span>':'<span class="td-pill" style="background:#ECFDF5;color:#059669">Tercapai</span>';
        return `<tr><td>${w}</td><td>${alos}</td><td>${status}</td></tr>`;
    }).join('');

    const critWards=dispWards.filter((w,i)=>borData[i]>85);
    const highALOS=dispWards.filter((w,i)=>alosData[i]>4);
    const effInsight=document.getElementById('eff-insight-text');
    if (effInsight) effInsight.innerHTML=`Rata-rata BOR periode ini <strong style="color:#fff">${avgBOR}%</strong>${avgBOR>=75&&avgBOR<=85?' — berada dalam rentang ideal 75–85%':avgBOR>85?' — melampaui batas atas, perlu antisipasi kapasitas':' — di bawah target minimum 75%'}.${critWards.length>0?` <strong style="color:#fff">${critWards.join(', ')}</strong> mencatat utilisasi kritis di atas 85%.`:''} ALOS rata-rata <strong style="color:#fff">${avgALOS} hari</strong>${highALOS.length>0?`; bangsal <strong style="color:#fff">${highALOS.join(', ')}</strong> melebihi target &lt;4 hari`:' — seluruh bangsal dalam target'}. TOI estimasi <strong style="color:#fff">${toi} hari</strong>.`;
}

// ══════════════════════════════════════════════════════════════
// ============================================================
// READMISSION PAGE  - data dari section Input Data
// ============================================================
function getVisitsFromInput() {
    return getData()
        .filter(d => d.patientId && (d.visitDate || d.admissionDate))
        .map(d => ({
            patientId:   d.patientId,
            patientName: d.patientName || '-',
            visitDate:   d.visitDate || d.admissionDate,
            poli:        d.serviceType || d.ward || '-',
            diagnosis:   d.financeNote || ''
        }));
}
function isReadmission(visits, patientId, visitDate, excludeIndex = -1) {
    const current = new Date(visitDate);
    return visits.some((v, i) => {
        if (i === excludeIndex || v.patientId !== patientId) return false;
        const diff = (current - new Date(v.visitDate)) / 86400000;
        return diff > 0 && diff <= 30;
    });
}
function recalcStatus(visits) {
    return visits.map((v, i) => ({
        ...v,
        status: isReadmission(visits, v.patientId, v.visitDate, i)
            ? 'readmit'
            : visits.filter((x, j) => j < i && x.patientId === v.patientId).length > 0
                ? 'followup' : 'new'
    }));
}
function renderKPI(visits) {
    // KPI cards are pre-filled with baseline dummy numbers in HTML,
    // but if live data exists, overlay the readmission figures only.
    const total = visits.length, readmits = visits.filter(v => v.status === 'readmit').length;
    if (total > 0) {
        const rate = ((readmits / total) * 100).toFixed(1);
        const rc = document.getElementById('ra-rate')?.closest('.kpi-card');
        if (rc) rc.className = 'kpi-card ' + (rate > 5 ? 'red' : 'green');
    }
    // else: leave the baseline HTML values in place
}
function renderRaTable(visits) {
    const tbody = document.getElementById('ra-tableBody');
    if (!tbody) return;
    if (!visits.length) {
        tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">hospital</div>Belum ada data kunjungan. Tambahkan melalui section Input Data.</div></td></tr>';
        return;
    }
    const sm = { readmit:{label:'Readmission',cls:'badge-readmit'}, new:{label:'Pasien Baru',cls:'badge-new'}, followup:{label:'Kontrol',cls:'badge-followup'} };
    tbody.innerHTML = [...visits].reverse().map(v => {
        const s = sm[v.status];
        const d = new Date(v.visitDate).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'});
        return `<tr><td><code style="font-size:12px">${v.patientId}</code></td><td>${v.patientName}</td><td>${d}</td><td>${v.poli}</td><td>${v.diagnosis||'-'}</td><td><span class="td-pill ${s.cls}">${s.label}</span></td></tr>`;
    }).join('');
}
function renderRaChart(visits) {
    const counts = {};
    visits.filter(v => v.status === 'readmit').forEach(v => { const key = v.visitDate.slice(0,7); counts[key] = (counts[key]||0)+1; });
    const months = [], now = new Date();
    for (let i=5;i>=0;i--) { const d=new Date(now.getFullYear(),now.getMonth()-i,1); months.push(d.toISOString().slice(0,7)); }
    const labels = months.map(m => { const [y,mo]=m.split('-'); return new Date(y,mo-1).toLocaleDateString('id-ID',{month:'short',year:'2-digit'}); });
    const data = months.map(m => counts[m]||0);
    makeOrUpdate('ra-trendChart',{type:'bar',data:{labels,datasets:[{label:'Readmission',data,backgroundColor:data.map(v=>v===0?'#E8E6E0':'#F76B4F'),borderRadius:6}]},options:{...baseOpts(),scales:{y:{beginAtZero:true,ticks:{stepSize:1},grid:{color:'#F0EDE8'}},x:{grid:{display:false}}}}});
}
function renderReadmissionPage() {
    const visits = recalcStatus(getVisitsFromInput());
    renderKPI(visits);
    renderRaTable(visits);
    renderRaBaselineCharts();   // always render baseline charts
    renderRaLiveTrendOverlay(visits); // overlay live bars if data exists
}

function renderRaBaselineCharts() {
    // Chart 1: Readmission Rate trend — baseline line + target line
    makeOrUpdate('ra-trendChart', {
        type: 'line',
        data: {
            labels: MONTHS,
            datasets: [
                {
                    label: 'Readmission Rate (%)',
                    data: MONTH_NUMS.map(m => BASE_READMISSION_RATE[m]),
                    borderColor: '#F76B4F',
                    backgroundColor: 'rgba(247,107,79,0.12)',
                    fill: true, tension: 0.4,
                    pointBackgroundColor: '#F76B4F', pointRadius: 5
                },
                {
                    label: 'Target (<5%)',
                    data: MONTH_NUMS.map(() => 5),
                    borderColor: '#34C98F',
                    borderDash: [6, 4], borderWidth: 2,
                    pointRadius: 0, fill: false, tension: 0
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 10, padding: 14 } } },
            scales: { y: { beginAtZero: true, max: 10, grid: { color: '#F0EDE8' } }, x: { grid: { display: false } } }
        }
    });

    // Chart 2: Readmission per bangsal — baseline horizontal bar
    const wardLabels = Object.keys(BASE_RA_WARD);
    const wardData   = wardLabels.map(w => BASE_RA_WARD[w]);
    makeOrUpdate('ra-wardChart', {
        type: 'bar',
        data: {
            labels: wardLabels.map(w => w.replace('Bangsal ', '').replace(' / Neonatus', '')),
            datasets: [{
                label: 'Readmission Rate (%)',
                data: wardData,
                backgroundColor: wardData.map(v => v > 5 ? '#F76B4F' : '#34C98F'),
                borderRadius: 5
            }]
        },
        options: {
            ...baseOpts(),
            indexAxis: 'y',
            scales: { x: { beginAtZero: true, max: 12, grid: { color: '#F0EDE8' } }, y: { grid: { display: false } } }
        }
    });
}

function renderRaLiveTrendOverlay(visits) {
    // If live input data exists, add a live bar dataset on top of the trend chart
    if (!visits.length) return;
    const liveCounts = {};
    visits.filter(v => v.status === 'readmit').forEach(v => {
        const m = getMonth(v.visitDate);
        if (m) liveCounts[m] = (liveCounts[m] || 0) + 1;
    });
    const liveData = MONTH_NUMS.map(m => liveCounts[m] || null);
    const hasAny = liveData.some(v => v !== null);
    if (!hasAny) return;
    // Add a third dataset for live bars — update existing chart
    const ch = charts['ra-trendChart'];
    if (ch && ch.data.datasets.length < 3) {
        ch.data.datasets.push({
            label: 'Live (input data)',
            data: liveData,
            type: 'bar',
            backgroundColor: 'rgba(79,126,247,0.5)',
            borderRadius: 4,
            yAxisID: 'y'
        });
        ch.update();
    }
}

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
    tb.innerHTML=h.map((d,i)=>`<tr><td>${i+1}</td><td><strong>${d.patientName||'\u2014'}</strong></td><td style="color:var(--muted);font-size:12px">${d.patientId||'\u2014'}</td><td>${d.ward||'\u2014'}</td><td>${d.admissionDate||'\u2014'}</td><td>${d.dischargeDate||'\u2014'}</td><td>${d.lengthOfStay?d.lengthOfStay+' hr':'\u2014'}</td><td>${d.doctorPoli||'\u2014'}</td><td>${d.waitTime?d.waitTime+' mnt':'\u2014'}</td><td>${d.satisfactionScore?d.satisfactionScore+'/5':'\u2014'}</td><td>${d.doctorName||'\u2014'}</td><td><button class="btn-edit" onclick="editEntry(${i})">Edit</button><button class="btn-delete" onclick="deleteEntry(${i})">Hapus</button></td></tr>`).join('');
}

function editEntry(idx){
    const d=getData()[idx];if(!d)return;editingIndex=idx;
    ['patientName','patientId','ward','admissionDate','dischargeDate','lengthOfStay','visitDate','registrationTime','callTime','waitTime','satisfactionScore','financeDate','financeType','financeUnit','financeAmount','doctorName','doctorPoli'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=d[id]||'';});
    const fv=document.getElementById('isFirstVisit');if(fv)fv.checked=!!d.isFirstVisit;
    document.getElementById('editBanner')?.classList.add('show');
    document.getElementById('saveIndicator')?.classList.remove('show');
    const btn=document.getElementById('submitBtn');
    if(btn)btn.innerHTML='<svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Perbarui Data';
    window.scrollTo({top:0,behavior:'smooth'});
}
async function deleteEntry(idx){
    if(!confirm('Hapus data ini?'))return;
    const h=getData();
    const mongoId=h[idx]?._id;  // grab MongoDB _id before splicing
    h.splice(idx,1);saveAll(h);
    if(editingIndex===idx){editingIndex=null;resetForm();}

    // Delete from MongoDB if record has a MongoDB _id
    if(mongoId){
        try{
            await fetch(`http://localhost:3000/delete/${mongoId}`,{method:'DELETE'});
            console.log('MongoDB delete success');
        }catch(err){
            console.warn('MongoDB delete failed (local delete still applied):',err.message);
        }
    }

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
                  'visitDate','registrationTime','callTime','waitTime','satisfactionScore',
                  'financeDate','financeType','financeUnit','financeAmount',
                  'doctorName','doctorPoli'];
  const data = Object.fromEntries(fields.map(id => {
    const el = document.getElementById(id);
    return [id, el ? (el.value.trim ? el.value.trim() : el.value) : ''];
  }));
  data.isFirstVisit = document.getElementById('isFirstVisit').checked;
  data.createdAt = new Date().toISOString();

  // Save to localStorage (existing behaviour)
  const h = getData();
  const existingMongoId = editingIndex !== null ? h[editingIndex]?._id : null;
  if (editingIndex!==null) { h[editingIndex]=data; editingIndex=null; } else { h.push(data); }
  saveAll(h);

  // Send to MongoDB via Express server
  try {
    if (existingMongoId) {
      // UPDATE existing record in MongoDB
      const res = await fetch(`http://localhost:3000/update/${existingMongoId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Server error');
      console.log('MongoDB update success:', existingMongoId);
    } else {
    // INSERT new record in MongoDB
    const res = await fetch('http://localhost:3000/insert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Server error');

    // Save the returned _id back into the localStorage record
    const latest = getData();
    latest[latest.length - 1]._id = result.id;
    saveAll(latest);

    console.log('MongoDB insert success:', result.id);
    }
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
    renderHRPage(); // keep HR (and home staff chart) in sync after new data
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
// ============================================================
// SIDEBAR TOGGLE
// ============================================================
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const main    = document.querySelector('.main');
    const isCollapsed = sidebar.classList.toggle('collapsed');
    main.classList.toggle('sidebar-collapsed', isCollapsed);
    localStorage.setItem('sidebarCollapsed', isCollapsed);
}

function initSidebar() {
    const collapsed = localStorage.getItem('sidebarCollapsed') === 'true';
    if (collapsed) {
        document.getElementById('sidebar')?.classList.add('collapsed');
        document.querySelector('.main')?.classList.add('sidebar-collapsed');
    }
}

// ============================================================
// AUTH
// ============================================================
let isAdmin = false;

function showDashboard() {
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('dashboardApp').style.display = 'flex';
    const homeBtn = document.querySelector('#dashboardApp .nav-item');
    if (homeBtn) showPage('home', homeBtn);
}

function showLoginPage() {
    document.getElementById('dashboardApp').style.display = 'none';
    document.getElementById('loginPage').style.display = 'flex';
}

async function submitLogin() {
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    const errEl = document.getElementById('loginError');
    try {
        const res = await fetch('http://localhost:3000/login', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            credentials: 'include', body: JSON.stringify({ username, password })
        });
        if (res.ok) {
            errEl.style.display = 'none';
            isAdmin = true;
            showDashboard();
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
    isAdmin = false;
    showLoginPage();
}

async function checkSession() {
    try {
        const res = await fetch('http://localhost:3000/me', { credentials: 'include' });
        const data = await res.json();
        if (data.isAdmin) { isAdmin = true; showDashboard(); }
        else { showLoginPage(); }
    } catch {
        showLoginPage();
    }
}

// -- INIT --
initSidebar();
renderHomePage();
renderServicePage();
renderFinancePage();
renderEfficiencyPage();
renderHistory();
checkSession();
