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
