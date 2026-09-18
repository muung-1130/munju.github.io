(() => {
  const main = document.querySelector('main');
  const work = document.querySelector('#work');
  if (!work) return;
  const key = 'munju-project-position';
  let saved = {};
  let mode = 'page';
  try {
    saved = JSON.parse(sessionStorage.getItem(key) || '{}') || {};
    mode = localStorage.getItem('munju-project-view') === 'popup' ? 'popup' : 'page';
  } catch {}
  const filters = [...work.querySelectorAll('[data-filter]')];
  filters.find(button => button.dataset.filter === saved.filter)?.click();
  const controls = document.createElement('div');
  controls.className = 'project-view-controls';
  controls.innerHTML = '<div><span class="project-view-label">PROJECT VIEW</span><div role="group" aria-label="프로젝트 보기 방식"><button type="button" data-view="page">A · 스크롤 기억</button><button type="button" data-view="popup">B · 팝업으로 보기</button></div></div><p aria-live="polite"></p>';
  const viewOptions = document.createElement('details');
  viewOptions.className = 'focus-view-options';
  viewOptions.innerHTML = '<summary>프로젝트 보기 방식 설정</summary>';
  viewOptions.append(controls);
  work.querySelector('.filters').after(viewOptions);
  const choices = [...controls.querySelectorAll('button')];
  function select(value) {
    mode = value;
    choices.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === mode)));
    controls.querySelector('p').textContent = mode === 'page'
      ? '상세 페이지를 보고 돌아오면 선택한 분류와 읽던 위치가 그대로 이어집니다.'
      : '목록을 유지한 채 팝업으로 살펴보세요. 닫으면 보던 폴더로 돌아옵니다.';
  }
  select(mode);
  choices.forEach(button => button.addEventListener('click', () => {
    select(button.dataset.view);
    try { localStorage.setItem('munju-project-view', mode); } catch {}
  }));
  function remember() {
    if (work.hidden) return;
    saved = {top: main.scrollTop, filter: filters.find(button => button.classList.contains('active'))?.dataset.filter || 'all'};
    try { sessionStorage.setItem(key, JSON.stringify(saved)); } catch {}
  }
  function restore() {
    if (!work.hidden && Number.isFinite(saved.top)) main.scrollTop = saved.top;
  }
  main.addEventListener('scroll', remember, {passive: true});
  window.addEventListener('pagehide', remember);
  window.addEventListener('pageshow', restore);
  document.addEventListener('archive:change', restore);
  filters.forEach(button => button.addEventListener('click', remember));
  requestAnimationFrame(restore);

  const dialog = document.createElement('dialog');
  dialog.className = 'project-preview';
  dialog.setAttribute('aria-labelledby', 'project-preview-title');
  dialog.innerHTML = '<div class="project-preview-bar"><h2 id="project-preview-title"></h2><div><a target="_blank" rel="noopener">새 탭으로 보기 ↗</a><button type="button" autofocus aria-label="프로젝트 팝업 닫기">닫기 ×</button></div></div><iframe title="프로젝트 상세 내용"></iframe>';
  document.body.append(dialog);
  const frame = dialog.querySelector('iframe');
  const close = dialog.querySelector('button');
  let opener;
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target === dialog) {
      const box = dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
    }
  });
  dialog.addEventListener('close', () => {
    frame.src = 'about:blank'; // Unload video and audio when the preview closes.
    opener?.focus({preventScroll: true});
  });
  frame.addEventListener('load', () => {
    const doc = frame.contentDocument;
    if (!doc || frame.getAttribute('src') === 'about:blank') return;
    doc.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !doc.querySelector('dialog[open], .image-lightbox:not([hidden])')) {
        event.preventDefault();
        dialog.close();
      }
    });
    doc.addEventListener('click', event => {
      const link = event.target.closest('a[href]');
      if (!link || event.ctrlKey || event.metaKey || event.shiftKey || link.target === '_blank' || link.hasAttribute('download')) return;
      const url = new URL(link.href);
      if (url.origin === location.origin && url.pathname === location.pathname) {
        event.preventDefault();
        dialog.close();
        if (url.hash && url.hash !== '#work') location.hash = url.hash;
      }
    });
  });
  work.addEventListener('click', event => {
    const link = event.target.closest('a.project');
    if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    remember();
    if (mode !== 'popup') return;
    event.preventDefault();
    opener = link;
    dialog.dataset.palette = link.dataset.palette;
    const title = link.querySelector('h3').textContent;
    dialog.querySelector('h2').textContent = title;
    dialog.querySelector('a').href = link.href;
    frame.title = `${title} 프로젝트 상세 내용`;
    frame.src = link.href;
    dialog.showModal();
    close.focus();
  });
})();
