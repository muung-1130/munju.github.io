const projectPalettes = ['lime', 'lavender', 'peach', 'sky', 'mint', 'rose'];
document.querySelectorAll('[data-project]').forEach((project, index) => {
  if (!project.dataset.palette) project.dataset.palette = projectPalettes[index % projectPalettes.length];
});

document.querySelectorAll('[data-filter]').forEach(button => {
  button.addEventListener('click', () => {
    const filter = button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(item => {
      const selected = item === button;
      item.classList.toggle('active', selected);
      item.setAttribute('aria-pressed', String(selected));
    });
    let visible = 0;
    document.querySelectorAll('[data-project]').forEach(project => {
      project.hidden = filter !== 'all' && project.dataset.project !== filter;
      if (!project.hidden) visible++;
    });
    document.querySelectorAll('[data-project-group]').forEach(group => {
      group.hidden = ![...group.querySelectorAll('[data-project]')].some(project => !project.hidden);
    });
    const empty = document.querySelector('.empty-work');
    if (empty) empty.hidden = visible !== 0;
    const foot = document.querySelector('.work-foot');
    if (foot) foot.hidden = visible === 0;
  });
});

const toolkit = document.querySelector('.compact-toolkit');
if (toolkit) {
  const switches = [...document.querySelectorAll('[data-toolkit-view]')];
  const feedback = document.querySelector('.toolkit-feedback');
  const labels = {cards: '카드 보기', list: '목록 보기'};
  let savedView;
  try { savedView = localStorage.getItem('munju-toolkit-view'); } catch {}
  function showView(view) {
    toolkit.dataset.view = view;
    switches.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.toolkitView === view)));
    if (feedback) feedback.textContent = `${labels[view]} · 같은 기술 목록을 표시합니다.`;
  }
  switches.forEach(button => button.addEventListener('click', () => {
    const view = button.dataset.toolkitView;
    showView(view);
    try { localStorage.setItem('munju-toolkit-view', view); } catch {}
  }));
  showView(Object.hasOwn(labels, savedView) ? savedView : 'cards');
}

const copyEmail = document.querySelector('.copy-email');
import('./chatbot.js');
copyEmail?.addEventListener('click', async () => {
  const status = document.querySelector('.copy-status');
  try {
    await navigator.clipboard.writeText('k22qqaa@gmail.com');
    status.textContent = '이메일 주소를 복사했습니다.';
  } catch {
    status.textContent = '아래 이메일 주소를 선택해 복사해주세요.';
  }
});

// Replay the hanging card on Contact entry; cancel pending motion on exit.
const contactRig = document.querySelector('.contact-badge-rig');
if (contactRig) {
  let badgeMotion;
  document.addEventListener('archive:change', () => {
    badgeMotion?.cancel();
    const visible = !document.querySelector('#contact').hidden;
    if (!visible || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    badgeMotion = contactRig.animate([
      {transform:'translateY(-650px) rotate(-12deg)',opacity:0,offset:0},
      {opacity:1,offset:.08},
      {transform:'translateY(12px) rotate(7deg)',opacity:1,offset:.48},
      {transform:'translateY(-9px) rotate(-5deg)',offset:.67},
      {transform:'translateY(3px) rotate(2deg)',offset:.84},
      {transform:'translateY(0) rotate(0)',opacity:1,offset:1}
    ], {delay:500,duration:1250,easing:'cubic-bezier(.22,.6,.36,1)',fill:'both'});
  });
}

const badgeFlip = document.querySelector('.badge-flip-toggle');
badgeFlip?.addEventListener('click', () => {
  badgeFlip.classList.add('is-manual');
  const back = badgeFlip.classList.toggle('show-back');
  badgeFlip.setAttribute('aria-label', back ? '사원증 앞면 보기' : '사원증 영어 뒷면 보기');
});
