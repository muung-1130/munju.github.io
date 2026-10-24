import { topics, searchQuestions } from './chatbot-qa.js';
// Local, curated guidance only. No AI service, network requests or conversation storage.
if (window.self === window.top) {
  const base = new URL('./', import.meta.url);
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = new URL('chatbot.css', base);
  document.head.append(stylesheet);
  const launcher = document.createElement('button');
  launcher.type = 'button';
  launcher.className = 'guide-launcher';
  const clipIcon = `<svg viewBox="0 0 64 76" fill="none" aria-hidden="true" focusable="false"><path d="M12 21L54 18L58 69L15 72Z" fill="#ede7dc" stroke="#c9c1b5"/><path d="M7 18H51V68H7Z" fill="#fffdf5" stroke="#a99e91"/><path d="M8 30H50M8 39H50M8 48H50M8 57H50M18 19V67M29 19V67M40 19V67" stroke="#dedbd1" stroke-width=".6"/><rect x="19" y="14" width="23" height="14" rx="2" fill="#29292b"/><path d="M25 23L27 12C22 7 24 3 30 3C36 3 38 7 33 12L35 23" stroke="#77797b" stroke-width="2.2" stroke-linecap="round"/><path d="M25 22L27 12C22 7 24 4 30 4C36 4 37 7 33 12L35 22" stroke="#e3e1de" stroke-width=".8"/><circle cx="21" cy="46" r="2" fill="#484044"/><circle cx="29" cy="46" r="2" fill="#484044"/><circle cx="37" cy="46" r="2" fill="#484044"/></svg>`;
  launcher.innerHTML = `<span class="guide-memo-icon">${clipIcon}</span><span class="guide-launcher-label">포트폴리오 안내</span>`;
  launcher.setAttribute('aria-haspopup','dialog');
  launcher.setAttribute('aria-controls','portfolio-guide');
  const dialog = document.createElement('dialog');
  dialog.id = 'portfolio-guide';
  dialog.className = 'portfolio-guide';
  dialog.setAttribute('aria-labelledby','guide-title');
  dialog.innerHTML = `<header class="guide-header"><div><span>PORTFOLIO GUIDE</span><h2 id="guide-title">어떤 경험이 궁금하세요?</h2></div><button type="button" class="guide-close" aria-label="안내창 닫기">×</button></header><div class="guide-body"><p class="guide-intro">김문주 · 클라우드 시스템 엔지니어 지원자<br>담당 역할, 기술 경험, 자격증을 편하게 물어보세요.</p><form class="guide-search" role="search"><label for="guide-question">궁금한 내용을 입력해 주세요</label><div class="guide-input-row"><input id="guide-question" type="search" maxlength="300" placeholder="예: GitLab으로 어떤 일을 했나요?" autocomplete="off" aria-describedby="guide-search-note"><button type="submit">질문하기</button></div><p id="guide-search-note">포트폴리오에 정리된 답변을 찾아드려요. 질문은 저장·전송하지 않습니다.</p></form><div class="guide-topics" role="group" aria-label="질문 선택"></div><section class="guide-answer" role="status" aria-live="polite" aria-atomic="true"></section></div><footer class="guide-footer"><span>공개 포트폴리오 기반 안내 · AI 생성 아님</span><button type="button" class="guide-reset">처음으로</button></footer>`;
  const answer = dialog.querySelector('.guide-answer');
  const clip = document.createElement('div');
  clip.className = 'guide-paper-clip';
  clip.setAttribute('aria-hidden','true');
  clip.innerHTML = `<svg viewBox="0 0 48 48" fill="none"><rect x="8" y="23" width="32" height="20" rx="3" fill="#29292b"/><path d="M16 36L20 17C9 4 17 2 24 2C31 2 39 4 28 17L32 36" stroke="#77797b" stroke-width="3" stroke-linecap="round"/><path d="M16 35L20 17C9 4 17 3 24 3C31 3 39 4 28 17L32 35" stroke="#dedcd7" stroke-width="1"/></svg>`;
  dialog.querySelector('.guide-header').prepend(clip);
  const miniIcon = `<svg viewBox="0 0 64 76" fill="none" aria-hidden="true"><rect x="8" y="30" width="48" height="36" rx="6" fill="#242426"/><path d="M21 41L25 23C10 7 22 4 32 4C42 4 54 7 39 23L43 41" stroke="#7c7c80" stroke-width="2.5"/><circle cx="23" cy="52" r="2" fill="white"/><circle cx="32" cy="52" r="2" fill="white"/><circle cx="41" cy="52" r="2" fill="white"/></svg>`;
  dialog.dataset.design = launcher.dataset.design = 'minimal';
  launcher.querySelector('.guide-memo-icon').innerHTML = miniIcon;
  const choices = dialog.querySelector('.guide-topics');
  const searchForm = dialog.querySelector('.guide-search');
  dialog.querySelector('.guide-footer').before(searchForm);
  const input = dialog.querySelector('#guide-question');
  function render(topic, question = '') {
    const title = document.createElement('h3'); title.textContent = topic.label;
    const p = document.createElement('p'); p.textContent = topic.text;
    const links = document.createElement('div'); links.className = 'guide-links';
    (topic.links || []).forEach(([label,path])=>{
      const link = document.createElement('a'); link.textContent = label; link.href = new URL(path,base);
      if(path.endsWith('.pdf')) {link.target='_blank';link.rel='noopener noreferrer';}
      link.addEventListener('click',()=>dialog.close()); links.append(link);
    });
    const list = document.createElement('ul'); list.className = 'guide-facts';
    (topic.points || []).forEach(text=>{const li=document.createElement('li');li.textContent=text;list.append(li);});
    const echo=document.createElement('p');echo.className='guide-query';echo.textContent=question ? '질문 · '+question : '';
    answer.replaceChildren(echo,title,p,list,links);
    choices.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.textContent===topic.label)));
  }
  function reset(){input.value='';render(topics[0]);dialog.querySelector('.guide-body').scrollTop=0;}
  function revealAnswer(){
    const body = dialog.querySelector('.guide-body');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const marker = document.createElement('span');
    marker.className = 'guide-new-answer'; marker.textContent = '새 답변';
    answer.prepend(marker);
    answer.getAnimations().forEach(animation=>animation.cancel());
    // Align the start of the response inside the dialog, keeping the input fixed.
    body.scrollTo({top: body.scrollTop + answer.getBoundingClientRect().top - body.getBoundingClientRect().top - 12, behavior: 'instant'});
    if(!reduced) answer.animate([
      {opacity:0,transform:'translateY(28px)'},
      {opacity:1,transform:'translateY(0)'}
    ],{duration:460,easing:'cubic-bezier(.16,1,.3,1)'});
  }
  function pick(topic){render(topic);revealAnswer();}
  [0,1,2,3,7,8].forEach(index=>{
    const topic=topics[index], button=document.createElement('button');button.type='button';button.textContent=topic.label;
    button.addEventListener('click',()=>pick(topic));choices.append(button);
  });
  dialog.querySelector('.guide-search').addEventListener('submit',event=>{
    event.preventDefault();const question=input.value.trim();
    if(!question){input.setCustomValidity('궁금한 내용을 먼저 입력해 주세요.');input.reportValidity();return;}
    const results=searchQuestions(question);
    if(results.length){
      render(results[0],question);
      if(results.length>1){
        const related=document.createElement('div');related.className='guide-related';
        const caption=document.createElement('p');caption.textContent='이 내용도 함께 확인해 보세요';related.append(caption);
        results.slice(1,4).forEach(topic=>{const button=document.createElement('button');button.type='button';button.textContent=topic.label;button.addEventListener('click',()=>pick(topic));related.append(button);});answer.append(related);
      }
    }else render({label:'조금 더 구체적으로 알려주시겠어요?',text:'이 질문에 맞는 답변을 찾지 못했어요. 프로젝트 이름이나 궁금한 경험을 함께 적어주세요. 예를 들어 “데이런에서 맡은 역할”, “배포 오류를 해결한 경험”, “CKA 자격증”처럼 물어보실 수 있어요.',links:[['직접 문의하기','mailto:k22qqaa@gmail.com']]},question);
    input.value='';
    revealAnswer();
  });
  input.addEventListener('input',()=>input.setCustomValidity(''));
  reset();
  launcher.addEventListener('click',()=>dialog.showModal());
  dialog.querySelector('.guide-close').addEventListener('click',()=>dialog.close());
  dialog.querySelector('.guide-reset').addEventListener('click',()=>{reset();choices.querySelector('button').focus();});
  dialog.addEventListener('close',()=>launcher.focus({preventScroll:true}));
  dialog.addEventListener('click',event=>{
    const box = dialog.getBoundingClientRect();
    if(event.target===dialog && (event.clientX<box.left || event.clientX>box.right || event.clientY<box.top || event.clientY>box.bottom)) dialog.close();
  });
  document.body.append(launcher,dialog);
}
