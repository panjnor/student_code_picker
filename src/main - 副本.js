/* src/main.js */

// 1. 移除了顶部的 import 语句：
// import { invoke } from '@tauri-apps/api/core';

// 2. 获取所有需要操作的 HTML 元素 (这部分不变)
const minInput = document.getElementById('min');
const maxInput = document.getElementById('max');
const drawButton = document.getElementById('draw');
const resultDiv = document.getElementById('result');

// 3. 定义点击按钮时要执行的函数
async function drawRandomNumber() {
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

  try {
    // 4. ***关键改动***：直接使用全局对象调用 invoke
    const randomNumber = await window.__TAURI__.core.invoke('generate_number', { min, max });
    
    resultDiv.textContent = `${randomNumber}`;
  } catch (error) {
    resultDiv.textContent = `调用后端出错: ${error}`;
    console.error('调用 Tauri 命令失败:', error);
  }
}

// 5. 为按钮添加点击事件监听器 (这部分不变)
drawButton.addEventListener('click', drawRandomNumber);
