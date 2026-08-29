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
    if (grid) {
        grid.addEventListener('click', function(e) {
            const nameEl = e.target.closest('.tag-card-name');
            if (nameEl) {
                e.stopPropagation();
                const tagName = nameEl.dataset.tagName;
                if (tagName) {
                    searchInput.value = tagName;
                    isTagClickJump = true;
                    switchView('waterfall');
                }
            }
        });
    }

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
    if (view === 'tagcloud' && isTagClickJump) {
        searchInput.value = '';
        isTagClickJump = false;
    }
    if (currentView === 'waterfall') waterfallScrollY = window.scrollY;
    else if (currentView === 'tagcloud') tagCloudScrollY = window.scrollY;

    currentView = view;
    const pagination = document.getElementById('tagPagination');
    const dToggle = document.getElementById('draftToggleBtn');
    const lToggle = document.getElementById('listToggleBtn');
    const dDrawer = document.getElementById('draftDrawer');
    const lDrawer = document.getElementById('listDrawer');

    if (view === 'waterfall') {
        grid.classList.remove('tagcloud-mode');
        document.getElementById('waterfallBtn').classList.add('active');
        document.getElementById('tagcloudBtn').classList.remove('active');
        if (pagination) pagination.style.display = 'none';
        if (dToggle) dToggle.style.display = 'none';
        if (lToggle) lToggle.style.display = 'none';
        if (dDrawer && dDrawer.classList.contains('open')) closeDraftDrawer();
        if (lDrawer && lDrawer.classList.contains('open')) closeListDrawer();
        loadCards();
    } else if (view === 'tagcloud') {
        grid.classList.add('tagcloud-mode');
        document.getElementById('tagcloudBtn').classList.add('active');
        document.getElementById('waterfallBtn').classList.remove('active');
        if (pagination) pagination.style.display = 'block';
        if (dToggle) dToggle.style.display = 'flex';
        if (lToggle) lToggle.style.display = 'flex';
        loadTagCloud(currentTagPage);
    }
}

window.switchView = switchView;