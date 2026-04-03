const POINTS = 30;
const labels = Array.from({length:POINTS},(_,i)=>{const d=new Date(Date.now()-(POINTS-1-i)*2000);return d.toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit',second:'2-digit'});});

// mock data for now
let uvData = Array.from({length:POINTS},()=>+(7+Math.random()*3).toFixed(2));
let tempData = Array.from({length:POINTS},()=>+(30+Math.random()*4).toFixed(1));
let humData = Array.from({length:POINTS},()=>+(72+Math.random()*10).toFixed(0));

let signalQuality = 4;
let pollRate = 2000;
let firebaseUptimeSec = null;
const DASHBOARD_TIP_KEY = 'dashboardTipDismissed';

function initializePersistentTipAlert(){
  const tipAlert = document.getElementById('dashboardTipAlert');
  if(!tipAlert) return;

  try{
    if(localStorage.getItem(DASHBOARD_TIP_KEY) === '1'){
      tipAlert.classList.remove('show');
      tipAlert.classList.add('d-none');
      return;
    }

    tipAlert.addEventListener('closed.bs.alert', ()=>{
      localStorage.setItem(DASHBOARD_TIP_KEY, '1');
    });
  }catch(_err){
    // Continue without persistence when storage access is blocked.
  }
}

function getUVLabel(uv){
  if(uv >= 11) return 'Extreme';
  if(uv >= 8) return 'Very High';
  if(uv >= 6) return 'High';
  if(uv >= 3) return 'Moderate';
  return 'Low';
}

function getHumidityLabel(hum){
  if(hum >= 85) return 'Very High';
  if(hum >= 70) return 'High';
  if(hum >= 50) return 'Moderate';
  if(hum >= 30) return 'Low';
  return 'Very Low';
}

function getFeelsLikeC(tempC, hum){
  // Heat index approximation in C for warm/humid conditions.
  if(tempC < 27) return tempC;
  const tF = tempC * 9 / 5 + 32;
  const rh = hum;
  const hiF = -42.379 + 2.04901523 * tF + 10.14333127 * rh
    - 0.22475541 * tF * rh - 0.00683783 * tF * tF
    - 0.05481717 * rh * rh + 0.00122874 * tF * tF * rh
    + 0.00085282 * tF * rh * rh - 0.00000199 * tF * tF * rh * rh;
  return (hiF - 32) * 5 / 9;
}

function updateHeroSubtexts(uv, temp, hum){
  const uvSub = document.getElementById('h-uv-sub');
  const tempSub = document.getElementById('h-temp-sub');
  const humSub = document.getElementById('h-hum-sub');
  const feelsLike = getFeelsLikeC(temp, hum);

  if(uvSub) uvSub.textContent = getUVLabel(uv);
  if(tempSub) tempSub.textContent = 'Feels like ' + Math.round(feelsLike) + '°C';
  if(humSub) humSub.textContent = getHumidityLabel(hum);
}

// firebase real-time listener
function initializeFirebaseListener(){
  if(typeof USE_FIREBASE === 'undefined' || !USE_FIREBASE) return;
  if(!sensorRef) return;
  
  sensorRef.on('value', (snapshot) => {
    const data = snapshot.val();
    if(data){
      const newUV = data.uv ?? (7 + Math.random() * 3).toFixed(2);
      const newTemp = data.temperature ?? data.temp ?? (30 + Math.random() * 4).toFixed(1);
      const newHum = data.humidity ?? data.hum ?? (72 + Math.random() * 10).toFixed(0);
      signalQuality = data.signal ?? signalQuality;
      firebaseUptimeSec = typeof data.uptime === 'number' ? data.uptime : firebaseUptimeSec;
      
      uvData.shift();
      uvData.push(+newUV);
      tempData.shift();
      tempData.push(+newTemp);
      humData.shift();
      humData.push(+newHum);

      const nowLabel = new Date().toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
      labels.shift();
      labels.push(nowLabel);

      renderLiveData();
    }
  }, (error) => {
    console.error('Firebase error:', error);
  });
}

function renderLiveData(){
  const uv = +uvData[uvData.length - 1];
  const temp = +tempData[tempData.length - 1];
  const hum = +humData[humData.length - 1];

  uvChart.data.labels=[...labels];
  uvChart.data.datasets[0].data=[...uvData];
  uvChart.update('none');

  tempChart.data.labels=[...labels];
  tempChart.data.datasets[0].data=[...tempData];
  tempChart.update('none');

  humChart.data.labels=[...labels];
  humChart.data.datasets[0].data=[...humData];
  humChart.update('none');

  scatterChart.data.datasets[0].data=tempData.map((t,i)=>({x:+t,y:+humData[i]}));
  scatterChart.update('none');

  document.getElementById('h-uv').textContent=uv;
  document.getElementById('uv-now').textContent=uv;
  document.getElementById('bar-uv').style.width=(uv/12*100)+'%';

  document.getElementById('h-temp').textContent=temp+'°C';
  document.getElementById('temp-now').textContent=temp+'°C';
  document.getElementById('bar-temp').style.width=((temp-25)/17*100)+'%';

  document.getElementById('h-hum').textContent=hum+'%';
  document.getElementById('hum-now').textContent=hum+'%';
  document.getElementById('bar-hum').style.width=hum+'%';

  updateHeroSubtexts(uv, temp, hum);

  updateAlerts(uv, temp, hum);
}

function signalBars(value){
  const signalSymbols = ['▂', '▂▄', '▂▄▆', '▂▄▆█'];
  if(typeof value === 'number' && value < 0){
    const bars = value >= -60 ? 4 : value >= -70 ? 3 : value >= -80 ? 2 : 1;
    return signalSymbols[bars - 1];
  }
  const normalized = Math.max(1, Math.min(4, Number(value) || 1));
  return signalSymbols[normalized - 1];
}

function mkGrad(ctx,color,alpha1=0.35,alpha2=0.02){
  const g=ctx.createLinearGradient(0,0,0,160);
  g.addColorStop(0,color.replace(')',`,${alpha1})`).replace('rgb','rgba'));
  g.addColorStop(1,color.replace(')',`,${alpha2})`).replace('rgb','rgba'));
  return g;
}

const baseOpts = (color)=>( {
  responsive:true,maintainAspectRatio:false,
  animation:{duration:600,easing:'easeInOutQuart'},
  plugins:{legend:{display:false},tooltip:{
    backgroundColor:'rgba(255,255,255,0.95)',
    titleColor:'#1a1a1a',
    bodyColor:'#1a1a1a',
    borderColor:'rgba(0,0,0,0.1)',
    borderWidth:0.5,
    padding:10,
    titleFont:{family:"'Montserrat', sans-serif",size:10},
    bodyFont:{family:"'Montserrat', sans-serif",size:12},
  }},
  scales:{
    x:{display:false,grid:{display:false}},
    y:{
      display:true,
      grid:{color:'rgba(255,255,255,0.08)',drawBorder:false},
      ticks:{color:'rgba(255,255,255,0.5)',font:{family:"'Montserrat', sans-serif",size:9},maxTicksLimit:4},
      border:{display:false}
    }
  }
});

const uvCtx=document.getElementById('uvChart').getContext('2d');
const uvChart=new Chart(uvCtx,{
  type:'line',
  data:{labels:[...labels],datasets:[{
    data:[...uvData],
    borderColor:'#ff9500',borderWidth:2,
    backgroundColor:mkGrad(uvCtx,'rgb(255,149,0)'),
    fill:true,tension:0.4,pointRadius:0,pointHoverRadius:4,
    pointHoverBackgroundColor:'#ff9500',
  }]},
  options:{...baseOpts('#ff9500'),scales:{...baseOpts().scales,y:{...baseOpts().scales?.y,min:0,max:12}}}
});

const tempCtx=document.getElementById('tempChart').getContext('2d');
const tempChart=new Chart(tempCtx,{
  type:'line',
  data:{labels:[...labels],datasets:[{
    data:[...tempData],
    borderColor:'#ff3b30',borderWidth:2,
    backgroundColor:mkGrad(tempCtx,'rgb(255,59,48)'),
    fill:true,tension:0.4,pointRadius:0,pointHoverRadius:4,
    pointHoverBackgroundColor:'#ff3b30',
  }]},
  options:{...baseOpts('#ff3b30'),scales:{...baseOpts().scales,y:{...baseOpts().scales?.y,min:25,max:42}}}
});

const humCtx=document.getElementById('humChart').getContext('2d');
const humChart=new Chart(humCtx,{
  type:'line',
  data:{labels:[...labels],datasets:[{
    data:[...humData],
    borderColor:'#1e40af',borderWidth:2,
    backgroundColor:mkGrad(humCtx,'rgb(30,64,175)'),
    fill:true,tension:0.4,pointRadius:0,pointHoverRadius:4,
    pointHoverBackgroundColor:'#1e40af',
  }]},
  options:{...baseOpts('#1e40af'),scales:{...baseOpts().scales,y:{...baseOpts().scales?.y,min:50,max:100}}}
});

const scCtx=document.getElementById('scatterChart').getContext('2d');
const scatterChart=new Chart(scCtx,{
  type:'scatter',
  data:{datasets:[{
    data:tempData.map((t,i)=>({x:+t,y:+humData[i]})),
    backgroundColor:'#5d9414',
    pointRadius:4,
    pointHoverRadius:6,
    borderColor:'#3a703a',
    borderWidth:1,
  }]},
  options:{
    responsive:true,maintainAspectRatio:false,
    plugins:{legend:{display:false},tooltip:{
      backgroundColor:'rgba(255,255,255,0.95)',
      bodyColor:'#1a1a1a',borderColor:'rgba(0,0,0,0.1)',borderWidth:0.5,padding:8,
      bodyFont:{family:"'Space Mono',monospace",size:10},
      callbacks:{label:c=>`${c.parsed.x.toFixed(1)}°C · ${c.parsed.y.toFixed(0)}%`}
    }},
    scales:{
      x:{type:'linear',title:{display:true,text:'Temperature (°C)'},ticks:{color:'rgba(255,255,255,0.5)',font:{family:"'Montserrat', sans-serif",size:9}},grid:{color:'rgba(255,255,255,0.08)'},border:{display:false}},
      y:{title:{display:true,text:'Humidity (%)'},ticks:{color:'rgba(255,255,255,0.5)',font:{family:"'Montserrat', sans-serif",size:9}},grid:{color:'rgba(255,255,255,0.08)'},border:{display:false}}
    }
  }
});

function updateAlerts(uv, temp, hum){
  // UV Alert Logic
  let uvStatus, uvMsg;
  if(uv >= 10){ uvStatus = 'UV Very High'; uvMsg = 'Index 10+. Avoid sun exposure. SPF 50+ essential.'; }
  else if(uv >= 8){ uvStatus = 'UV Very High'; uvMsg = 'Index 8–10. Limit midday sun. SPF 50+ recommended.'; }
  else if(uv >= 6){ uvStatus = 'UV High'; uvMsg = 'Index 6–7. Use SPF 30+ sunscreen.'; }
  else if(uv >= 3){ uvStatus = 'UV Moderate'; uvMsg = 'Index 3–5. Some sun protection needed.'; }
  else { uvStatus = 'UV Low'; uvMsg = 'Index 0–2. Sun protection optional.'; }
  
  document.getElementById('alertUVTitle').textContent = uvStatus;
  document.getElementById('alertUVDesc').textContent = uvMsg;

  // Temperature Alert Logic
  let tempStatus, tempMsg;
  if(temp >= 35){ tempStatus = 'Extreme Heat'; tempMsg = 'Feels like ' + temp + '°C+. Stay indoors if possible.'; }
  else if(temp >= 32){ tempStatus = 'Heat Advisory'; tempMsg = 'Feels like ' + temp + '°C. Stay hydrated. Limit outdoor activity.'; }
  else if(temp >= 25){ tempStatus = 'Warm'; tempMsg = 'Temperature ' + temp + '°C. Comfortable conditions.'; }
  else if(temp >= 15){ tempStatus = 'Mild'; tempMsg = 'Temperature ' + temp + '°C. Bring a light jacket.'; }
  else { tempStatus = 'Cold'; tempMsg = 'Temperature ' + temp + '°C. Bundle up!'; }
  
  document.getElementById('alertTempTitle').textContent = tempStatus;
  document.getElementById('alertTempDesc').textContent = tempMsg;

  // Humidity Alert Logic
  let humStatus, humMsg;
  if(hum >= 85){ humStatus = 'Critical Humidity'; humMsg = hum + '% RH. Severe discomfort. Health risk for vulnerable groups.'; }
  else if(hum >= 75){ humStatus = 'High Humidity'; humMsg = hum + '% RH. Reduced cooling. Mold risk elevated.'; }
  else if(hum >= 50){ humStatus = 'Moderate Humidity'; humMsg = hum + '% RH. Comfortable levels. Good air quality.'; }
  else if(hum >= 30){ humStatus = 'Low Humidity'; humMsg = hum + '% RH. Dry conditions. Use moisturizer.'; }
  else { humStatus = 'Very Low Humidity'; humMsg = hum + '% RH. Potential health effects from dryness.'; }
  
  document.getElementById('alertHumTitle').textContent = humStatus;
  document.getElementById('alertHumDesc').textContent = humMsg;
}

function loadDefault(){
  initializePersistentTipAlert();
  renderLiveData();

  // Initialize Firebase listener if enabled
  initializeFirebaseListener();
  
  // Initialize alerts with current data
  updateAlerts(uvData[uvData.length-1], tempData[tempData.length-1], humData[humData.length-1]);

  setInterval(()=>{
    const now=new Date();
    document.getElementById('clk').textContent=now.toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    const strength = (typeof USE_FIREBASE !== 'undefined' && USE_FIREBASE) ? signalQuality : Math.floor(Math.random() * 4) + 1;
    document.getElementById('signalStrength').textContent = signalBars(strength);
    document.getElementById('pollRate').textContent = (pollRate / 1000) + 's';
  },1000);

  setInterval(()=>{
    if(typeof USE_FIREBASE !== 'undefined' && USE_FIREBASE) return;
    const v=+(7+Math.random()*3).toFixed(2);
    uvData.shift();
    uvData.push(v);
    uvChart.data.datasets[0].data=[...uvData];
    uvChart.update('none');
    document.getElementById('h-uv').textContent=v;
    document.getElementById('uv-now').textContent=v;
    document.getElementById('bar-uv').style.width=(v/12*100)+'%';
    updateHeroSubtexts(+uvData[uvData.length-1], +tempData[tempData.length-1], +humData[humData.length-1]);
  },2000);

  setInterval(()=>{
    if(typeof USE_FIREBASE !== 'undefined' && USE_FIREBASE) return;
    const v=+(30+Math.random()*4).toFixed(1);
    tempData.shift();
    tempData.push(v);
    tempChart.data.datasets[0].data=[...tempData];
    tempChart.update('none');
    document.getElementById('h-temp').textContent=v+'°C';
    document.getElementById('temp-now').textContent=v+'°C';
    document.getElementById('bar-temp').style.width=((v-25)/17*100)+'%';
    updateHeroSubtexts(+uvData[uvData.length-1], +tempData[tempData.length-1], +humData[humData.length-1]);
  },2000);

  setInterval(()=>{
    if(typeof USE_FIREBASE !== 'undefined' && USE_FIREBASE) return;
    const v=+(72+Math.random()*10).toFixed(0);
    humData.shift();
    humData.push(v);
    humChart.data.datasets[0].data=[...humData];
    humChart.update('none');
    document.getElementById('h-hum').textContent=v+'%';
    document.getElementById('hum-now').textContent=v+'%';
    document.getElementById('bar-hum').style.width=v+'%';
    updateHeroSubtexts(+uvData[uvData.length-1], +tempData[tempData.length-1], +humData[humData.length-1]);
    scatterChart.data.datasets[0].data=tempData.map((t,i)=>({x:+t,y:+humData[i]}));
    scatterChart.update('none');
    
    updateAlerts(+uvData[uvData.length-1], +tempData[tempData.length-1], +humData[humData.length-1]);
  },2000);

  let uptime=0;
  setInterval(()=>{
    if(typeof USE_FIREBASE !== 'undefined' && USE_FIREBASE && typeof firebaseUptimeSec === 'number'){
      firebaseUptimeSec++;
    }else{
      uptime++;
    }
    const sourceUptime = (typeof USE_FIREBASE !== 'undefined' && USE_FIREBASE && typeof firebaseUptimeSec === 'number') ? firebaseUptimeSec : uptime;
    const h=Math.floor(sourceUptime/3600);
    const m=Math.floor((sourceUptime%3600)/60);
    const s=sourceUptime%60;
    document.getElementById('uptime').textContent=
      String(h).padStart(2,'0')+':'+
      String(m).padStart(2,'0')+':'+
      String(s).padStart(2,'0');
  },1000);
}
