document.addEventListener('DOMContentLoaded', function() {
    // ---------- 赋值全局 DOM 引用 ----------
    grid = document.getElementById('masonryGrid');
    searchInput = document.getElementById('searchInput');
    draftDrawer = document.getElementById('draftDrawer');
    draftToggleBtn = document.getElementById('draftToggleBtn');
    listDrawer = document.getElementById('listDrawer');
    listToggleBtn = document.getElementById('listToggleBtn');

    // ---------- 初始化模块 ----------
    if (typeof initAuth === 'function') initAuth();
    if (typeof initDraft === 'function') initDraft();
    if (typeof initCards === 'function') initCards();

    // ---------- 视图切换按钮 ----------
    const waterfallBtn = document.getElementById('waterfallBtn');
    const tagcloudBtn = document.getElementById('tagcloudBtn');
    if (waterfallBtn) waterfallBtn.addEventListener('click', () => switchView('waterfall'));
    if (tagcloudBtn) tagcloudBtn.addEventListener('click', () => switchView('tagcloud'));

    // ---------- 标签名称跳转 ----------
    // 事件委托：点击标签卡片（非按钮区域）跳转瀑布流
    grid.addEventListener('click', function(e) {
        const tagCard = e.target.closest('.tag-card');
        if (!tagCard) return;
        // 如果点击的是按钮，忽略
        if (e.target.closest('.add-btn') || e.target.closest('.edit-btn')) {
            return;
        }
        const nameEl = tagCard.querySelector('.tag-card-name');
        if (nameEl) {
            const tagName = nameEl.dataset.tagName;
            if (tagName) {
                searchInput.value = tagName;
                isTagClickJump = true;
                switchView('waterfall');
            }
        }
    });

    // ---------- 卡片交互（工作流、提示词等） ----------
    if (grid) {
        grid.addEventListener('click', function(e) {
            const target = e.target;
            const cardEl = target.closest('.card');
            if (!cardEl) return;
            const cardId = parseInt(cardEl.dataset.id);
            if (isNaN(cardId)) return;

            const isWorkflowBtn = target.closest('.btn-workflow');
            const isPromptBtn = target.closest('.btn-prompt');
            const isModelsBtn = target.closest('.btn-models');

            if (isWorkflowBtn) {
                e.stopPropagation();
                handleWorkflow(cardId, cardEl);
                return;
            }
            if (isPromptBtn) {
                e.stopPropagation();
                handlePrompt(cardId);
                return;
            }
            if (isModelsBtn) {
                e.stopPropagation();
                handleModels(cardId);
                return;
            }
            openEditModal(cardId);
        });
    }

    // ---------- 加载瀑布流 ----------
    if (typeof loadCards === 'function') loadCards();

    // ---------- 初始隐藏 ----------
    const pagination = document.getElementById('tagPagination');
    if (pagination) pagination.style.display = 'none';
    if (draftToggleBtn) draftToggleBtn.style.display = 'none';
    if (listToggleBtn) listToggleBtn.style.display = 'none';

    console.log('应用初始化完成');
});

// ---------- 全局函数 ----------
function switchView(view) {
    if (currentView === view) return;

    // 更新搜索框提示文字
    if (view === 'waterfall') {
        searchInput.placeholder = '输入模型名/标题/提示词/标签来搜索图片';
    } else if (view === 'tagcloud') {
        searchInput.placeholder = '输入标签名来搜索标签';
    }

    // 如果切换到标签云，且之前是标签点击跳转，则清空搜索框
    if (view === 'tagcloud' && isTagClickJump) {
        searchInput.value = '';
        isTagClickJump = false;
    }

    // 记录当前视图滚动位置（切换前）
    if (currentView === 'waterfall') {
        waterfallScrollY = window.scrollY;
    } else if (currentView === 'tagcloud') {
        tagCloudScrollY = window.scrollY;
    }

    currentView = view;
    const pagination = document.getElementById('tagPagination');
    const draftToggleBtn = document.getElementById('draftToggleBtn');
    const listToggleBtn = document.getElementById('listToggleBtn');
    const draftDrawer = document.getElementById('draftDrawer');
    const listDrawer = document.getElementById('listDrawer');

    if (view === 'waterfall') {
        grid.classList.remove('tagcloud-mode');
        waterfallBtn.classList.add('active');
        tagcloudBtn.classList.remove('active');
        if (pagination) pagination.style.display = 'none';
        if (draftToggleBtn) draftToggleBtn.style.display = 'none';
        if (listToggleBtn) listToggleBtn.style.display = 'none';
        if (draftDrawer && draftDrawer.classList.contains('open')) {
            closeDraftDrawer();
        }
        if (listDrawer && listDrawer.classList.contains('open')) {
            closeListDrawer();
        }
        loadCards();
    } else if (view === 'tagcloud') {
        grid.classList.add('tagcloud-mode');
        tagcloudBtn.classList.add('active');
        waterfallBtn.classList.remove('active');
        if (pagination) pagination.style.display = 'block';
        if (draftToggleBtn) draftToggleBtn.style.display = 'flex';
        if (listToggleBtn) listToggleBtn.style.display = 'flex';
        loadTagCloud(currentTagPage);
    }
}

window.switchView = switchView;