(() => {
  function revealAnchor() {
    const target = document.getElementById(location.hash.slice(1));
    if (!target) return;
    let node = target.parentElement;
    while (node) { if (node.tagName === 'DETAILS') node.open = true; node = node.parentElement; }
    target.scrollIntoView();
  }
  window.addEventListener('hashchange', revealAnchor);
  if (location.hash) requestAnimationFrame(revealAnchor);
})();
