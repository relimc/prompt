// ---------- 全局状态 ----------
let token = localStorage.getItem('token') || null;
let currentView = 'waterfall';
let currentTagPage = 1;
let totalTagPages = 1;
let waterfallScrollY = 0;
let tagCloudScrollY = 0;
let isTagClickJump = false;
let draftTags = [];
let selectedPositive = null;
let selectedNegative = null;
let currentCardId = null;
let currentWorkflowMenu = null;

// ---------- DOM 引用（在 app.js 中赋值） ----------
let grid = null;
let searchInput = null;
let draftDrawer = null;
let draftToggleBtn = null;
let listDrawer = null;
let listToggleBtn = null;

// ---------- 工具函数 ----------
let _toastTimer = null;
let _toastElement = null;

function showToast(msg) {
    // 如果已有 toast，直接更新内容和计时器
    if (_toastElement) {
        _toastElement.textContent = msg;
        // 重置计时器
        clearTimeout(_toastTimer);
        _toastTimer = setTimeout(() => {
            _toastElement.style.opacity = '0';
            setTimeout(() => {
                if (_toastElement && _toastElement.parentNode) {
                    _toastElement.parentNode.removeChild(_toastElement);
                    _toastElement = null;
                }
            }, 300);
        }, 4000);
        return;
    }

    // 创建新 toast
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%);
        background: #0f172a; color: white; padding: 10px 28px;
        border-radius: 40px; font-size: 0.9rem; font-weight: 500;
        box-shadow: 0 8px 24px rgba(0,0,0,0.2); z-index: 1000;
        transition: opacity 0.3s; opacity: 0;
    `;
    toast.textContent = msg;
    document.body.appendChild(toast);
    _toastElement = toast;
    requestAnimationFrame(() => toast.style.opacity = '1');
    _toastTimer = setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
                _toastElement = null;
            }
        }, 300);
    }, 4000);
}

function copyText(text) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => showToast('✅ 已复制到剪贴板')).catch(() => fallbackCopy(text));
    } else {
        fallbackCopy(text);
    }
}
function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    showToast('✅ 已复制到剪贴板');
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ---------- 暴露全局变量/函数 ----------
window.showToast = showToast;
window.copyText = copyText;
window.escapeHtml = escapeHtml;