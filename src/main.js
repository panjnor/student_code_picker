/* src/main.js */

// ============================================================================
// 1. 全局状态与常量
// ============================================================================
let isDrawing = false;      // 是否正在抽奖滚动
let isMuted = false;        // 是否静音
let scrollHandle = null;    // 滚动动画的 setInterval 句柄
let numberPromise = null;   // 用于保存后端生成最终数字的 Promise

// ============================================================================
// 2. DOM 元素获取
// ============================================================================
const minInput = document.getElementById('min');
const maxInput = document.getElementById('max');
const drawButton = document.getElementById('draw');
const resultDiv = document.getElementById('result');
const confettiCanvas = document.getElementById('confetti-canvas');
const popupOverlay = document.getElementById('popup-overlay');
const popupContent = document.getElementById('popup-content');
const muteCanvas = document.getElementById('mute-canvas');
const muteCtx = muteCanvas ? muteCanvas.getContext('2d') : null;

// ============================================================================
// 3. 初始化
// ============================================================================

// 初始化 Confetti 效果
const myConfetti = confetti.create(confettiCanvas, {
  resize: true,
  useWorker: true,
});

// 加载并管理所有音效
const celebrationSounds = [
  new Audio('./music1.m4a'),
  new Audio('./music2.m4a'),
  new Audio('./music3.m4a'),
  new Audio('./music4.m4a'),
  new Audio('./music5.m4a'),
];

// 提示浏览器可以开始加载音频文件，提升播放响应速度
celebrationSounds.forEach(sound => sound.load());


// ============================================================================
// 4. 核心逻辑函数
// ============================================================================

/**
 * 处理 "抽取/停止" 按钮的点击事件，作为程序的主要入口。
 */
function handleDrawClick() {
  // 首次点击时，尝试解锁音频上下文，解决浏览器自动播放限制
  unlockAudioContext(); 
  
  if (isDrawing) {
    stopDrawing();
  } else {
    startDrawing();
  }
}

/**
 * 开始抽奖：验证输入、设置状态、启动滚动动画。
 */
function startDrawing() {
  const min = parseInt(minInput.value, 10);
  const max = parseInt(maxInput.value, 10);

  // --- 输入验证 ---
  if (isNaN(min) || isNaN(max)) {
    resultDiv.textContent = '请输入有效的数字！';
    return;
  }
  if (min >= max) {
    resultDiv.textContent = '最小值必须小于最大值！';
    return;
  }

  // --- 更新状态和 UI ---
  isDrawing = true;
  drawButton.textContent = '停止';
  drawButton.disabled = false; // 确保按钮可点击
  resultDiv.textContent = '';
  if (popupContent) popupContent.textContent = '';
  if (popupOverlay) popupOverlay.style.display = 'none';

  // --- 启动后端数字生成（延迟1秒以确保滚动效果）---
  numberPromise = new Promise(resolve => {
    setTimeout(() => {
      resolve(window.__TAURI__.core.invoke('generate_number', { min, max }));
    }, 100); // 滚动100ms
  });

  // --- 启动前端数字滚动动画 ---
  scrollHandle = setInterval(async () => {
    try {
      // await 会暂停这里的执行，直到 Promise 完成，然后返回结果
      const randomNumber = await window.__TAURI__.core.invoke('random_number_normal', { min, max });
      resultDiv.textContent = randomNumber;
    } catch (error) {
      console.error('滚动动画获取数字失败:', error);
      clearInterval(scrollHandle);
    }
    }, 50);
  }

/**
 * 停止抽奖：停止滚动、获取最终结果、触发庆祝效果。
 */
async function stopDrawing() {
  // --- 更新状态和 UI ---
  isDrawing = false;
  drawButton.textContent = '抽取';
  drawButton.disabled = true; // 在庆祝动画期间禁用按钮

  // --- 清理工作 ---
  clearInterval(scrollHandle);
  scrollHandle = null;

  try {
    // --- 等待并显示最终结果 ---
    const randomNumber = await numberPromise;
    resultDiv.textContent = randomNumber;
    if (popupOverlay && popupContent) {
      popupContent.textContent = randomNumber;
      popupOverlay.style.display = 'flex';
    }

    // --- 触发庆祝效果 ---
  
    const randomIndex = await window.__TAURI__.core.invoke('random_number_normal', { min:0, max: celebrationSounds.length - 1 });
    const selectedSound = celebrationSounds[randomIndex];
    
    triggerCelebration(selectedSound);

  } catch (error) {
    const errorMessage = `调用后端出错: ${error}`;
    resultDiv.textContent = errorMessage;
    console.error('调用 Tauri 命令失败或 Promise 被拒绝:', error);
    drawButton.disabled = false; // 出错时，确保按钮可以再次使用
  }
}

// ============================================================================
// 5. UI/效果 辅助函数
// ============================================================================

/**
 * 触发庆祝效果：同步播放音效和纸屑动画。
 * @param {HTMLAudioElement} sound - 要播放的音效元素。
 */
function triggerCelebration(sound) {
  const playAndAnimate = () => {
    // 确保 duration 是有效数字，提供备用值
    const duration = (sound.duration && isFinite(sound.duration)) 
                     ? sound.duration * 1000 
                     : 5000; // 5秒备用时长

    // 播放音效（如果未静音）
    sound.currentTime = 0;
    sound.play().catch(e => console.error("音频播放失败:", e));

    // --- 纸屑动画逻辑 ---
    confettiCanvas.classList.add('active');
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 1000 };

    const confettiInterval = setInterval(() => {
      const timeLeft = animationEnd - Date.now();
      if (timeLeft <= 0) {
        return clearInterval(confettiInterval);
      }
      const particleCount = 50 * (timeLeft / duration);
      myConfetti({ ...defaults, particleCount, origin: { x: Math.random(), y: Math.random() - 0.2 } });
    }, 250);

    // --- 动画结束时清理并恢复UI ---
    setTimeout(() => {
      confettiCanvas.classList.remove('active');
      drawButton.disabled = false;
      if (popupOverlay) {
        popupOverlay.style.display = 'none';
      }
    }, duration);
  };
  
  // 确保音频元数据已加载，以便获取正确的 duration
  if (sound.readyState >= 2) { // HAVE_CURRENT_DATA or more
    playAndAnimate();
  } else {
    sound.addEventListener('canplaythrough', playAndAnimate, { once: true });
  }
}


/**
 * 切换静音状态。
 */
function toggleMute() {
  isMuted = !isMuted;
  celebrationSounds.forEach(sound => {
    sound.muted = isMuted;
  });

  if (isMuted) {
    muteCanvas.classList.remove('hidden');
    drawMuteIndicator();
  } else {
    muteCanvas.classList.add('hidden');
  }
}

/**
 * 在 Canvas 上绘制 "静音" 指示器。
 */
function drawMuteIndicator() {
  if (!muteCtx) return;
  muteCanvas.width = 100;
  muteCanvas.height = 40;
  muteCtx.clearRect(0, 0, muteCanvas.width, muteCanvas.height);
  muteCtx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  muteCtx.font = 'bold 24px sans-serif';
  muteCtx.textAlign = 'center';
  muteCtx.textBaseline = 'middle';
  muteCtx.fillText('Mute', muteCanvas.width / 2, muteCanvas.height / 2);
}

/**
 * 解决浏览器音频自动播放限制。
 * 在首次用户交互（如点击）时调用此函数。
 */
const unlockAudioContext = (function() {
  let unlocked = false;
  return function() {
    if (unlocked) return;
    celebrationSounds.forEach(sound => {
      // 尝试播放并立即暂停以解锁音频；忽略播放失败的错误
      sound.play().then(() => sound.pause()).catch(() => {});
    });
    unlocked = true;
  };
})();


// ============================================================================
// 6. 事件监听器
// ============================================================================
drawButton.addEventListener('click', handleDrawClick);

window.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() === 'm') {
    toggleMute();
  }
});

// 初始化时隐藏 mute canvas
if (muteCanvas) muteCanvas.classList.add('hidden');
