/* src/main.js */
// --- 全局状态变量 ---
let isDrawing = false;
let scrollHandle = null;
let numberPromise = null;

// --- 获取 HTML 元素 ---
const minInput = document.getElementById('min');
const maxInput = document.getElementById('max');
const drawButton = document.getElementById('draw');
const resultDiv = document.getElementById('result');
const confettiCanvas = document.getElementById('confetti-canvas');
// --- 获取弹窗元素 ---
const popupOverlay = document.getElementById('popup-overlay');
const popupContent = document.getElementById('popup-content');

// --- 初始化 Confetti ---
const myConfetti = confetti.create(confettiCanvas, {
  resize: true,
  useWorker: true,
});
// --- 加载庆祝音效 ---
const celebrationSound = new Audio('./music.m4a');

// --- 核心逻辑函数：处理按钮点击 ---
async function handleDrawClick() {
  if (isDrawing) {
    stopDrawing();
  } else {
    startDrawing();
  }
}

// --- 开始滚动的函数 ---
function startDrawing() {
  const min = parseInt(minInput.value, 10);
  const max = parseInt(maxInput.value, 10);

  if (isNaN(min) || isNaN(max)) {
    resultDiv.textContent = '请输入有效的数字！';
    return;
  }
  if (min >= max) {
    resultDiv.textContent = '最小值必须小于最大值！';
    return;
  }

  isDrawing = true;
  drawButton.textContent = '停止';
  resultDiv.textContent = '';
    
  // 清空上一次的弹窗内容（如果存在）
  if(popupContent) popupContent.textContent = '';


  numberPromise = new Promise(resolve => {
    setTimeout(() => {
      resolve(window.__TAURI__.core.invoke('generate_number', { min, max }));
    }, 1000);
  });

  scrollHandle = setInterval(() => {
    window.__TAURI__.core.invoke('seedprinter')
      .then(short_hash => {
        resultDiv.textContent = short_hash;
      })
      .catch(error => {
        console.error("Error from seedprinter:", error);
        resultDiv.textContent = `Error: ${error}`;
      });
  }, 50);
}

// --- 停止滚动的函数 ---
async function stopDrawing() {
  isDrawing = false;
  drawButton.textContent = '抽取';
  drawButton.disabled = true;

  clearInterval(scrollHandle);

  try {
    const randomNumber = await numberPromise;

    // 将最终数字显示在背景 div 中
    resultDiv.textContent = randomNumber;
      
    // --- 新增: 显示弹窗并填入最终数字 ---
    if (popupOverlay && popupContent) {
        popupContent.textContent = randomNumber;
        popupOverlay.style.display = 'flex';
    }

    celebrationSound.currentTime = 0;
    celebrationSound.play();
    // 触发纸屑效果！
    triggerConfetti();

  } catch (error) {
    resultDiv.textContent = `调用后端出错: ${error}`;
    console.error('调用 Tauri 命令失败:', error);
    drawButton.disabled = false;
  }
}


// --- 纸屑效果函数---
function triggerConfetti() {
  confettiCanvas.classList.add('active');
  const duration = 13 * 1000;
  const animationEnd = Date.now() + duration;
  const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 1000 };

  function randomInRange(min, max) {
    return Math.random() * (max - min) + min;
  }

  const interval = setInterval(() => {
    const timeLeft = animationEnd - Date.now();
    if (timeLeft <= 0) {
      return clearInterval(interval);
    }
    const particleCount = 50 * (timeLeft / duration);
    myConfetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.9), y: Math.random() - 0.2 } });
  }, 250);

  setTimeout(() => {
    confettiCanvas.classList.remove('active');
    drawButton.disabled = false;

    // --- 在动画结束时隐藏弹窗 ---
    if (popupOverlay) {
        popupOverlay.style.display = 'none';
    }
  }, duration);
}

// --- 为按钮绑定唯一的点击事件监听器 ---
drawButton.addEventListener('click', handleDrawClick);
