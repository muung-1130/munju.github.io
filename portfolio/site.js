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
  const confirm = document.querySelector('.toolkit-confirm');
  const labels = {cards: 'A · 카드형', list: 'B · 목록형'};
  let savedView;
  try { savedView = localStorage.getItem('munju-toolkit-view'); } catch {}
  function preview(view) {
    toolkit.dataset.view = view;
    switches.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.toolkitView === view)));
    feedback.textContent = savedView === view ? `${labels[view]}을 선택했습니다. 이 브라우저에 저장됩니다.` : `${labels[view]} 미리보기 · 마음에 들면 ‘이 구성 선택’을 눌러주세요.`;
    confirm.textContent = savedView === view ? '선택 취소 ↺' : '이 구성 선택 ↗';
  }
  switches.forEach(button => button.addEventListener('click', () => preview(button.dataset.toolkitView)));
  confirm.addEventListener('click', () => {
    const view = toolkit.dataset.view;
    try {
      if (savedView === view) {
        localStorage.removeItem('munju-toolkit-view');
        savedView = undefined;
        preview(view);
        return;
      }
      localStorage.setItem('munju-toolkit-view', view);
      savedView = view;
      preview(view);
    } catch {
      feedback.textContent = `${labels[view]}을 적용했습니다. 브라우저 저장은 사용할 수 없습니다.`;
    }
  });
  if (Object.hasOwn(labels, savedView)) preview(savedView);
}
