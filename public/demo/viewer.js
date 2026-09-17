const viewer = document.querySelector('#viewer');
const canvas = document.querySelector('#canvas');
const frame = document.querySelector('iframe');
let actualSize = false;
function resize() {
  const scale = actualSize ? 1 : Math.min(1, viewer.clientWidth / 1680);
  canvas.style.width = 1680 * scale + 'px';
  canvas.style.height = 1011 * scale + 'px';
  frame.style.transform = 'scale(' + scale + ')';
}
document.querySelector('#size').addEventListener('click', (event) => {
  actualSize = !actualSize;
  event.currentTarget.textContent = actualSize ? '适合窗口' : '原尺寸';
  resize();
});
document.querySelector('#reset').addEventListener('click', () => {
  frame.src = frame.src;
});
new ResizeObserver(resize).observe(viewer);
resize();
