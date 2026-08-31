/**
 * draft.js - 备件库 + 黑白名单 + 停用词管理（含导入和悬浮提示）
 * 依赖 globals.js（提供 draftTags, showToast, copyText 等）
 */

// ---------- 全局 tooltip ----------
let _infoTooltip = null;

function getInfoTooltip() {
    if (!_infoTooltip) {
        _infoTooltip = document.createElement('div');
        _infoTooltip.className = 'info-tooltip';
        _infoTooltip.style.cssText = `
            position: fixed;
            background: #1e293b;
            color: #f1f5f9;
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 0.85rem;
            max-width: 300px;
            white-space: normal;
            word-wrap: break-word;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 100000;
            pointer-events: none;
            display: none;
            transition: opacity 0.15s;
            line-height: 1.5;
        `;
        document.body.appendChild(_infoTooltip);
    }
    return _infoTooltip;
}

function showInfoTooltip(text, targetEl) {
    const tooltip = getInfoTooltip();
    tooltip.textContent = text;
    const rect = targetEl.getBoundingClientRect();
    let top = rect.bottom + 6;
    let left = rect.left + rect.width / 2 - tooltip.offsetWidth / 2;
    // 防止溢出右边界
    if (left + tooltip.offsetWidth > window.innerWidth - 10) {
        left = window.innerWidth - tooltip.offsetWidth - 10;
    }
    if (left < 10) left = 10;
    // 如果下方空间不足，显示在上方
    if (top + tooltip.offsetHeight > window.innerHeight - 10) {
        top = rect.top - tooltip.offsetHeight - 6;
    }
    tooltip.style.top = top + 'px';
    tooltip.style.left = left + 'px';
    tooltip.style.display = 'block';
    tooltip.style.opacity = '1';
}

function hideInfoTooltip() {
    const tooltip = getInfoTooltip();
    tooltip.style.display = 'none';
}

// ---------- 备件库 ----------
function updateDraftTextarea() {
    const ta = document.getElementById('draftTextarea');
    if (ta) ta.value = draftTags.join(', ');
}

function openDraftDrawer() {
    document.getElementById('draftDrawer').classList.add('open');
}

function closeDraftDrawer() {
    document.getElementById('draftDrawer').classList.remove('open');
}

function addTagToDraft(tagName) {
    if (!draftTags.includes(tagName)) {
        draftTags.push(tagName);
        updateDraftTextarea();
        window.showToast(`已添加标签：${tagName}`);
        openDraftDrawer();
    } else {
        window.showToast(`标签“${tagName}”已在备件库中`);
    }
}

// ---------- 黑白名单 + 停用词 ----------
async function loadTagLists() {
    try {
        const [whiteRes, blackRes, stopRes] = await Promise.all([
            fetch('/api/tag-lists/whitelist'),
            fetch('/api/tag-lists/blacklist'),
            fetch('/api/stopwords')
        ]);
        const whitelist = await whiteRes.json();
        const blacklist = await blackRes.json();
        const stopwords = await stopRes.json();

        renderTagList(document.getElementById('whitelistContainer'), whitelist, 'whitelist');
        renderTagList(document.getElementById('blacklistContainer'), blacklist, 'blacklist');
        renderTagList(document.getElementById('stopwordsContainer'), stopwords, 'stopword');
    } catch (e) {
        console.error('加载名单库失败', e);
    }
}

function renderTagList(container, keywords, type) {
    if (!container) return;
    container.innerHTML = '';

    if (keywords && keywords.length > 0) {
        keywords.forEach(keyword => {
            const item = document.createElement('span');
            item.className = 'list-item';
            item.innerHTML = `${keyword} <button class="remove-btn" data-keyword="${keyword}" data-type="${type}">✕</button>`;
            container.appendChild(item);

            const removeBtn = item.querySelector('.remove-btn');
            removeBtn.addEventListener('click', async function(e) {
                e.stopPropagation();
                const keyword = this.dataset.keyword;
                const type = this.dataset.type;
                let url;
                if (type === 'whitelist') url = `/api/tag-lists/whitelist/${encodeURIComponent(keyword)}`;
                else if (type === 'blacklist') url = `/api/tag-lists/blacklist/${encodeURIComponent(keyword)}`;
                else if (type === 'stopword') url = `/api/stopwords/${encodeURIComponent(keyword)}`;
                else return;
                try {
                    const res = await fetch(url, { method: 'DELETE' });
                    if (res.ok) {
                        window.showToast('移除成功');
                        loadTagLists();
                    } else {
                        window.showToast('移除失败');
                    }
                } catch (e) {
                    window.showToast('网络错误');
                }
            });
        });
    } else {
        const emptyHint = document.createElement('span');
        emptyHint.style.cssText = 'color:#94a3b8;font-size:0.9rem;margin-right:8px;';
        emptyHint.textContent = '暂无';
        container.appendChild(emptyHint);
    }

    // 列表末尾的 "+" 按钮（单个添加）
    const addBtn = document.createElement('button');
    addBtn.className = 'list-add-btn';
    addBtn.textContent = '+';
    addBtn.style.cssText = `
        display:inline-flex; align-items:center; justify-content:center;
        width:28px; height:28px; border-radius:50%; background:#e2e8f0;
        border:none; color:#1e293b; font-size:1.2rem; cursor:pointer; margin-left:4px;
    `;
    let title = type === 'whitelist' ? '白名单' : (type === 'blacklist' ? '黑名单' : '停用词');
    addBtn.title = `添加单个${title}`;
    addBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        const keyword = prompt(`请输入要添加的${title}：`);
        if (keyword && keyword.trim()) {
            addTagList(keyword.trim(), type);
        }
    });
    container.appendChild(addBtn);
}

async function addTagList(keyword, type, refresh = true) {
    let url;
    if (type === 'whitelist') url = '/api/tag-lists/whitelist';
    else if (type === 'blacklist') url = '/api/tag-lists/blacklist';
    else if (type === 'stopword') url = '/api/stopwords';
    else return;

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `keyword=${encodeURIComponent(keyword)}`
        });
        if (res.ok) {
            if (refresh) {
                window.showToast('添加成功');
                loadTagLists();
            }
            return true;
        } else {
            if (refresh) window.showToast('添加失败');
            return false;
        }
    } catch (e) {
        if (refresh) window.showToast('网络错误');
        return false;
    }
}

// ---------- 导入功能 ----------
// ---------- 导入功能（悬停提示改为悬浮于按钮下方，且内容根据类型定制） ----------
function initImportButtons() {
    document.querySelectorAll('.list-import-btn').forEach(btn => {
        // 移除原生 title，避免干扰
        btn.removeAttribute('title');

        // 根据 data-type 确定名称
        const typeMap = {
            whitelist: '白名单',
            blacklist: '黑名单',
            stopword: '停用词'
        };
        const typeName = typeMap[btn.dataset.type] || '词语';

        // 悬停时显示 tooltip（在按钮下方）
        btn.addEventListener('mouseenter', function() {
            const tip = `支持导入以逗号分隔${typeName}的 .txt 文件`;
            showInfoTooltip(tip, this);
        });
        btn.addEventListener('mouseleave', function() {
            hideInfoTooltip();
        });

        // 点击导入（逻辑不变）
        btn.addEventListener('click', function() {
            const type = this.dataset.type;
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = '.txt';
            fileInput.style.display = 'none';
            document.body.appendChild(fileInput);

            fileInput.addEventListener('change', function(e) {
                const file = e.target.files[0];
                if (!file) {
                    document.body.removeChild(fileInput);
                    return;
                }
                const reader = new FileReader();
                reader.onload = async function(ev) {
                    const content = ev.target.result;
                    const separators = /[,，;；\/、\s]+/;
                    const words = content.split(separators)
                        .map(w => w.trim())
                        .filter(w => w.length > 0);
                    if (words.length === 0) {
                        window.showToast('文件中未找到有效词语');
                        document.body.removeChild(fileInput);
                        return;
                    }
                    const uniqueWords = [...new Set(words)];
                    window.showToast(`正在导入 ${uniqueWords.length} 个词语...`);
                    let successCount = 0;
                    let failCount = 0;
                    for (const word of uniqueWords) {
                        try {
                            await addTagList(word, type, false);
                            successCount++;
                        } catch (e) {
                            failCount++;
                        }
                    }
                    loadTagLists();
                    window.showToast(`导入完成：成功 ${successCount} 个，失败 ${failCount} 个`);
                    document.body.removeChild(fileInput);
                };
                reader.readAsText(file, 'UTF-8');
            });

            fileInput.click();
        });
    });
}

// ---------- 小 i 悬浮提示 ----------
function initInfoIcons() {
    document.querySelectorAll('.info-icon').forEach(el => {
        el.removeEventListener('mouseenter', showInfo);
        el.removeEventListener('mouseleave', hideInfo);
        el.addEventListener('mouseenter', showInfo);
        el.addEventListener('mouseleave', hideInfo);
    });

    function showInfo(e) {
        const tip = this.dataset.tip;
        if (tip) {
            showInfoTooltip(tip, this);
        }
    }

    function hideInfo() {
        hideInfoTooltip();
    }
}

// ---------- 初始化 ----------
function initDraft() {
    // 备件库
    const draftToggle = document.getElementById('draftToggleBtn');
    const draftClose = document.querySelector('.draft-close');
    const draftClear = document.querySelector('.draft-clear');
    const draftCopy = document.querySelector('.draft-copy');

    if (draftToggle) {
        draftToggle.addEventListener('click', () => {
            const drawer = document.getElementById('draftDrawer');
            if (drawer.classList.contains('open')) closeDraftDrawer();
            else openDraftDrawer();
        });
    }
    if (draftClose) draftClose.addEventListener('click', closeDraftDrawer);
    if (draftClear) {
        draftClear.addEventListener('click', () => {
            if (draftTags.length === 0) return;
            if (confirm('确定清空备件库吗？')) {
                draftTags = [];
                updateDraftTextarea();
                window.showToast('已清空');
            }
        });
    }
    if (draftCopy) {
        draftCopy.addEventListener('click', () => {
            const text = document.getElementById('draftTextarea').value;
            if (!text) { window.showToast('备件库为空'); return; }
            window.copyText(text);
        });
    }

    // 名单库
    const listToggle = document.getElementById('listToggleBtn');
    const listClose = document.querySelector('.list-close');

    if (listToggle) {
        listToggle.addEventListener('click', () => {
            const drawer = document.getElementById('listDrawer');
            if (drawer.classList.contains('open')) closeListDrawer();
            else openListDrawer();
        });
    }
    if (listClose) listClose.addEventListener('click', closeListDrawer);

    // 点击外部关闭
    document.addEventListener('click', function(e) {
        const dDrawer = document.getElementById('draftDrawer');
        const lDrawer = document.getElementById('listDrawer');
        if (dDrawer.classList.contains('open') && !dDrawer.contains(e.target) && e.target !== draftToggle) {
            closeDraftDrawer();
        }
        if (lDrawer.classList.contains('open') && !lDrawer.contains(e.target) && e.target !== listToggle) {
            closeListDrawer();
        }
    });

    // 初始化导入按钮和小 i 提示
    initImportButtons();
    initInfoIcons();
}

function openListDrawer() {
    document.getElementById('listDrawer').classList.add('open');
    loadTagLists();
}

function closeListDrawer() {
    document.getElementById('listDrawer').classList.remove('open');
}

// ---------- 暴露全局 ----------
window.updateDraftTextarea = updateDraftTextarea;
window.openDraftDrawer = openDraftDrawer;
window.closeDraftDrawer = closeDraftDrawer;
window.addTagToDraft = addTagToDraft;
window.loadTagLists = loadTagLists;
window.renderTagList = renderTagList;
window.addTagList = addTagList;
window.initDraft = initDraft;
window.openListDrawer = openListDrawer;
window.closeListDrawer = closeListDrawer;