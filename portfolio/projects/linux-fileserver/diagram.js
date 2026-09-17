const dialog = document.querySelector('.diagram-dialog');
const drawing = dialog.querySelector('img');
let zoom = 1;
let fitWidth = 673;
function fit() {
  const canvas = dialog.querySelector('.diagram-canvas');
  const styles = getComputedStyle(canvas);
  const width = canvas.clientWidth - parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight);
  const height = canvas.clientHeight - parseFloat(styles.paddingTop) - parseFloat(styles.paddingBottom);
  const ratio = drawing.naturalWidth / drawing.naturalHeight || 673 / 614;
  fitWidth = Math.min(width, height * ratio);
  drawing.style.width = `${fitWidth}px`;
  canvas.scrollTop = 0;
  canvas.scrollLeft = 0;
}
document.querySelectorAll('.diagram-open').forEach(button => button.addEventListener('click', () => {
  const source = button.querySelector('img');
  zoom = 1;
  drawing.onload = fit;
  drawing.src = source.src;
  drawing.alt = source.alt;
  dialog.showModal();
  if (drawing.complete) fit();
}));
dialog.querySelector('.diagram-close').addEventListener('click', () => dialog.close());
dialog.querySelectorAll('[data-zoom]').forEach(button => button.addEventListener('click', () => {
  const action = button.dataset.zoom;
  if (action === 'reset') { zoom = 1; fit(); return; }
  zoom = action === 'reset' ? 1 : Math.min(3, Math.max(.5, zoom + (action === 'in' ? .25 : -.25)));
  drawing.style.width = `${zoom * fitWidth}px`;
}));
