(() => {
  const main = document.querySelector('main');
  if (!main || !document.querySelector('.hero')) return;
  const sections = [...main.children].filter(node => node.tagName === 'SECTION');
  const names = ['Cover', 'Projects', 'Toolkit', 'Contact'];
  const ids = ['home', 'work', 'stack', 'contact'];
  document.body.classList.add('archive-mode');
  const shell = document.createElement('div');
  shell.className = 'archive-shell';
  main.before(shell);
  const tabs = document.createElement('div');
  tabs.className = 'file-index';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', '포트폴리오 파일');
  shell.append(tabs, main);
  const buttons = ids.map((id, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = `index-${id}`;
    button.className = 'index-tab';
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', id);
    button.innerHTML = `<span class="index-number">0${index + 1}</span><span>${names[index]}</span><span class="index-symbol" aria-hidden="true">↗</span>`;
    tabs.append(button);
    const section = sections[index];
    section.id = id;
    section.classList.add('file-page');
    section.setAttribute('role', 'tabpanel');
    section.setAttribute('aria-labelledby', button.id);
    section.tabIndex = 0;
    button.addEventListener('click', () => activate(index, true));
    button.addEventListener('keydown', event => {
      let target;
      if (event.key === 'ArrowRight') target = (index + 1) % ids.length;
      if (event.key === 'ArrowLeft') target = (index + ids.length - 1) % ids.length;
      if (event.key === 'Home') target = 0;
      if (event.key === 'End') target = ids.length - 1;
      if (target !== undefined) { event.preventDefault(); activate(target, true); buttons[target].focus(); }
    });
    return button;
  });
  const status = document.createElement('div');
  status.className = 'archive-status';
  status.innerHTML = '<span class="file-position" aria-live="polite"></span><span>SELECT A FILE TO EXPLORE</span><button type="button" class="replay-intro">인트로 다시 보기 ↺</button>';
  shell.append(status);
  const hero = sections[0];
  hero.querySelector('.circle-link').textContent = '↗';
  hero.querySelector('.hero-index').innerHTML = '<span>01 / INTRODUCTION</span><span>위쪽 파일 탭을 눌러 작업을 살펴보세요.</span>';
  const stamp = document.createElement('div');
  stamp.className = 'file-stamp';
  stamp.setAttribute('aria-hidden', 'true');
  stamp.innerHTML = '<span>PERSONAL ARCHIVE</span><b>M.</b><span>CLOUD / DEVOPS</span>';
  hero.append(stamp);
  function activate(index, updateURL) {
    if (index < 0) index = 0;
    sections.forEach((section, position) => {
      const selected = position === index;
      section.hidden = !selected;
      buttons[position].setAttribute('aria-selected', String(selected));
      buttons[position].tabIndex = selected ? 0 : -1;
    });
    main.scrollTop = 0;
    document.dispatchEvent(new CustomEvent('archive:change')); 
    status.querySelector('.file-position').textContent = `FILE 0${index + 1} / 04 — ${names[index].toUpperCase()}`;
    if (updateURL) history.pushState(null, '', `#${ids[index]}`);
  }
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;
    const index = ids.indexOf(link.hash.slice(1));
    if (index < 0) return;
    event.preventDefault();
    activate(index, true);
    buttons[index].focus({preventScroll: true});
  });
  window.addEventListener('popstate', () => activate(ids.indexOf(location.hash.slice(1)), false));
  window.addEventListener('hashchange', () => activate(ids.indexOf(location.hash.slice(1)), false));
  activate(ids.indexOf(location.hash.slice(1)), false);
  const intro = document.createElement('div');
  intro.className = 'filing-intro';
  intro.hidden = true;
  intro.setAttribute('role', 'dialog');
  intro.setAttribute('aria-modal', 'true');
  intro.setAttribute('aria-label', '포트폴리오 파일을 정리하는 시작 애니메이션');
  intro.innerHTML = `<div class="intro-heading"><span>munju / personal archive</span><span>FILING THE WORK.</span></div><div class="filing-scene" aria-hidden="true">${[3,2,1,0].map((index, order) => `<div class="inserting-file insert-${index}" style="--order:${order};--file:${index}"><div class="insert-tab">0${index+1} / ${names[index]}</div><span class="insert-label">MUNJU — ${names[index].toUpperCase()}</span><span class="insert-title">${['A little<br>about me.', 'Built<br>together.', 'Tools for<br>the work.', 'Let’s<br>connect.'][index]}</span></div>`).join('')}<div class="file-sleeve"><span>MUNJU</span><span>SELECTED WORK / 04 FILES</span></div></div><div class="intro-bottom"><span>기록을 하나씩 꺼내볼 수 있도록.</span><button type="button">건너뛰기 ↗</button></div>`;
  document.body.append(intro);
  const header = document.querySelector('.header');
  const footer = document.querySelector('footer');
  let timer;
  let isReplay = false;
  function finish() {
    clearTimeout(timer);
    intro.hidden = true;
    shell.inert = false;
    header.inert = false;
    footer.inert = false;
    document.body.classList.remove('is-filing');
    if (isReplay) buttons[0].focus({preventScroll: true});
    else if (document.activeElement === intro.querySelector('button')) buttons[0].focus({preventScroll: true});
  }
  function play(replay = false) {
    isReplay = replay;
    activate(0, replay);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { finish(); return; }
    intro.hidden = false;
    shell.inert = true;
    header.inert = true;
    footer.inert = true;
    document.body.classList.add('is-filing');
    intro.querySelector('button').focus({preventScroll: true});
    timer = setTimeout(finish, 3300);
  }
  intro.querySelector('button').addEventListener('click', finish);
  intro.addEventListener('keydown', event => {
    if (event.key === 'Escape') finish();
    if (event.key === 'Tab') { event.preventDefault(); intro.querySelector('button').focus(); }
  });
  status.querySelector('button').addEventListener('click', () => play(true));
  if (!location.hash || location.hash === '#home') play();
})();
