const video=document.querySelector('video'),choices=[...document.querySelectorAll('[data-sound]')],volume=document.querySelector('#music-volume'),status=document.querySelector('#music-status');
let mode='off',ctx,master,timer,voices=[],last=-1;
const chords=[[130.81,164.81,196,246.94],[110,130.81,164.81,196],[87.31,130.81,174.61,220],[98,146.83,196,246.94]];
function stop(){clearInterval(timer);for(const v of voices){try{v.stop()}catch{}}voices=[];last=-1;}
function tone(freq,time,len,amp,type='sine'){
 const osc=ctx.createOscillator(),env=ctx.createGain();osc.type=type;osc.frequency.setValueAtTime(freq,time);env.gain.setValueAtTime(0,time);env.gain.linearRampToValueAtTime(amp,time+.015);env.gain.exponentialRampToValueAtTime(.0001,time+len);osc.connect(env);env.connect(master);osc.start(time);osc.stop(time+len);voices.push(osc);osc.onended=()=>{osc.disconnect();env.disconnect();voices=voices.filter(v=>v!==osc)};
}
function percussion(time,kind){
 if(kind==='kick'){const osc=ctx.createOscillator(),env=ctx.createGain();osc.frequency.setValueAtTime(95,time);osc.frequency.exponentialRampToValueAtTime(42,time+.16);env.gain.setValueAtTime(.18,time);env.gain.exponentialRampToValueAtTime(.0001,time+.24);osc.connect(env);env.connect(master);osc.start(time);osc.stop(time+.25);voices.push(osc);osc.onended=()=>{osc.disconnect();env.disconnect();voices=voices.filter(v=>v!==osc)};return;}
 const length=kind==='snare'?.11:.045,b=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*length),ctx.sampleRate),data=b.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*Math.exp(-i/data.length*5);
 const src=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();src.buffer=b;filter.type='highpass';filter.frequency.value=kind==='snare'?1100:6500;gain.gain.value=kind==='snare'?.075:.028;src.connect(filter);filter.connect(gain);gain.connect(master);src.start(time);voices.push(src);src.onended=()=>{src.disconnect();filter.disconnect();gain.disconnect();voices=voices.filter(v=>v!==src)};
}
async function start(){
 stop();if(mode==='off'||video.paused||video.ended)return;
 try{ctx ||= new(window.AudioContext||window.webkitAudioContext)();if(!master){master=ctx.createGain();master.connect(ctx.destination)}master.gain.value=Number(volume.value);await ctx.resume();
 const tick=()=>{if(video.paused||mode==='off')return;const bpm=mode==='piano'?86:94,step=Math.floor(video.currentTime*bpm/60*2);if(step===last)return;last=step;const beat=step%8,bar=Math.floor(step/8),chord=chords[Math.floor(bar/2)%4],t=ctx.currentTime;
 if(beat===0||beat===4){percussion(t,'kick');tone(chord[0]/2,t,.7,.2)}
 if(beat===2||beat===6)percussion(t,'snare');percussion(t+(mode==='ambient'&&beat%2?.04:0),'hat');
 if(mode==='piano'){
  if(beat===0||beat===3||beat===6)chord.slice(1).forEach((f,i)=>tone(f*2,t+i*.015,.65,.048,'sine'));
  if([1,4,7].includes(beat))tone(chord[(step+bar)%4]*4,t,.45,.045,'sine');
 }else{
  if(beat===0||beat===5)chord.forEach((f,i)=>tone(f*2,t+i*.01,1.4,.043,'sine'));
  if(beat%2===1)tone(chord[(bar+beat)%4]*2,t+.035,.28,.038,'triangle');
 }};tick();timer=setInterval(tick,60);
 }catch{status.textContent='이 브라우저에서는 배경음을 재생할 수 없습니다. 원본 영상은 재생할 수 있습니다.'}
}
choices.forEach(button=>button.addEventListener('click',()=>{mode=button.dataset.sound;choices.forEach(b=>b.setAttribute('aria-pressed',String(b===button)));status.textContent=mode==='off'?'원본 영상 · 배경음 없음':button.textContent+' 선택 · 영상과 함께 재생됩니다.';start()}));
volume.addEventListener('input',()=>{if(master)master.gain.value=Number(volume.value)});
video.addEventListener('play',start);video.addEventListener('pause',stop);video.addEventListener('ended',stop);video.addEventListener('seeking',stop);video.addEventListener('seeked',start);window.addEventListener('pagehide',stop);
