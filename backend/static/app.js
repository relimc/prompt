document.addEventListener('DOMContentLoaded', function() {

    // ---------- 全局状态 ----------
    let token = localStorage.getItem('token') || null;
    let currentCardId = null;
    let currentWorkflowMenu = null;
    let currentView = 'waterfall';
    let pendingAction = null;
    let waterfallScrollY = 0;
    let tagCloudScrollY = 0;
    let isTagClickJump = false; // 是否由标签卡片点击触发跳转
    let selectedPositive = null;
    let selectedNegative = null;
    let currentTagPage = 1;
    let totalTagPages = 1;

    // ---------- 获取 DOM 元素 ----------
    const grid = document.getElementById('masonryGrid');
    const searchInput = document.getElementById('searchInput');
    const loginModal = document.getElementById('loginModal');
    const loginUsername = document.getElementById('loginUsername');
    const loginPassword = document.getElementById('loginPassword');
    const loginConfirmBtn = document.getElementById('loginConfirmBtn');
    const loginCancelBtn = document.getElementById('loginCancelBtn');
    const loginError = document.getElementById('loginError');
    const editModal = document.getElementById('editModal');
    const editModalTitle = document.getElementById('editModalTitle');
    const editForm = document.getElementById('editForm');
    const editTitle = document.getElementById('editTitle');
    const editPositive = document.getElementById('editPositive');
    const editNegative = document.getElementById('editNegative');
    const editTags = document.getElementById('editTags');
    const editImage = document.getElementById('editImage');
    const editWorkflow = document.getElementById('editWorkflow');
    const editImagePreview = document.getElementById('editImagePreview');
    const editWorkflowPreview = document.getElementById('editWorkflowPreview');
    const editCancelBtn = document.getElementById('editCancelBtn');
    const editDeleteBtn = document.getElementById('editDeleteBtn');
    const promptModal = document.getElementById('promptModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    const modalCloseBtn = document.getElementById('modalCloseBtn');
    const waterfallBtn = document.getElementById('waterfallBtn');
    const tagcloudBtn = document.getElementById('tagcloudBtn');

    // ---------- 提示词备件库 ----------
    let draftTags = [];
    const draftTextarea = document.getElementById('draftTextarea');
    const draftDrawer = document.getElementById('draftDrawer');
    const draftToggleBtn = document.getElementById('draftToggleBtn');
    const draftCloseBtn = document.querySelector('.draft-close');
    const draftClearBtn = document.querySelector('.draft-clear');
    const draftCopyBtn = document.querySelector('.draft-copy');

    // ---------- 辅助函数 ----------
    function showToast(msg) {
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
        requestAnimationFrame(() => toast.style.opacity = '1');
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    function copyText(text) {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text).then(() => {
                showToast('✅ 已复制到剪贴板');
            }).catch(() => fallbackCopy(text));
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

    // ---------- 登录逻辑 ----------
    function openLoginModal(action) {
        pendingAction = action || null;
        loginModal.style.display = 'flex';
        loginError.textContent = '';
        loginUsername.value = '';
        loginPassword.value = '';
        loginUsername.focus();
    }

    function closeLoginModal() {
        loginModal.style.display = 'none';
        pendingAction = null;
    }

    if (loginCancelBtn) {
        loginCancelBtn.addEventListener('click', closeLoginModal);
    }
    if (loginModal) {
        loginModal.addEventListener('click', function(e) {
            if (e.target === this) closeLoginModal();
        });
    }

    if (loginConfirmBtn) {
        loginConfirmBtn.addEventListener('click', async () => {
            const username = loginUsername.value.trim();
            const password = loginPassword.value.trim();
            if (!username || !password) {
                loginError.textContent = '请输入用户名和密码';
                return;
            }
            try {
                const formData = new FormData();
                formData.append('username', username);
                formData.append('password', password);
                const res = await fetch('/api/login', {
                    method: 'POST',
                    body: formData
                });
                if (res.ok) {
                    const data = await res.json();
                    token = data.access_token;
                    localStorage.setItem('token', token);
                    loginModal.style.display = 'none';
                    showToast('登录成功');
                    if (pendingAction) {
                        const action = pendingAction;
                        pendingAction = null;
                        action();
                    } else {
                        loadCards();
                    }
                } else {
                    const err = await res.json();
                    loginError.textContent = err.detail || '登录失败';
                }
            } catch (e) {
                loginError.textContent = '网络错误';
            }
        });
    }

    if (loginPassword) {
        loginPassword.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') loginConfirmBtn.click();
        });
    }

    // ---------- 加载卡片（瀑布流） ----------
    async function loadCards() {
        currentView = 'waterfall';
        const keyword = searchInput.value.trim();
        let url = '/api/cards?';
        const params = new URLSearchParams();
        if (keyword) params.append('keyword', keyword);
        url += params.toString();

        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error('加载失败');
            const cards = await res.json();
            renderCards(cards);
        } catch (e) {
            showToast('加载卡片失败');
            console.error(e);
        }
    }

    async function handleModels(cardId) {
        try {
            const res = await fetch(`/api/cards/${cardId}`);
            if (!res.ok) throw new Error('获取卡片失败');
            const card = await res.json();
            let models = card.models ? JSON.parse(card.models) : [];
            if (!models || models.length === 0) {
                showToast('该卡片暂无模型信息');
                return;
            }

            // 规范化数据（确保纯文件名）
            const normalizedModels = models.map(item => {
                if (typeof item === 'string') {
                    // 再次确保无路径（如果数据库中有残留）
                    const name = item.replace(/\\/g, '/').split('/').pop();
                    let type = '未知';
                    const lower = name.toLowerCase();
                    if (lower.includes('lora') || lower.includes('loras')) type = 'LoRA';
                    else if (lower.includes('vae')) type = 'VAE';
                    else if (lower.includes('clip') || lower.includes('text_encoders')) type = 'CLIP';
                    else if (lower.endsWith('.safetensors') || lower.endsWith('.ckpt') || lower.endsWith('.pt')) type = 'Checkpoint';
                    return { name, type };
                } else if (item && typeof item === 'object') {
                    return {
                        name: (item.name || item.model_name || '未命名').replace(/\\/g, '/').split('/').pop(),
                        type: item.type || '未知'
                    };
                }
                return null;
            }).filter(Boolean);

            // 获取模型链接和类型
            const linkRes = await fetch('/api/model-links');
            const links = await linkRes.json();
            const linkMap = {};
            const typeMap = {};
            links.forEach(link => {
                linkMap[link.model_name] = link.link || '';
                typeMap[link.model_name] = link.type || '';
            });

            // 创建主弹窗
            const modal = document.createElement('div');
            modal.className = 'modal-overlay';
            modal.style.display = 'flex';
            modal.innerHTML = `
                <div class="modal-box" style="max-width:650px;">
                    <h2 style="text-align:center;margin-bottom:16px;">🧠 大模型列表</h2>
                    <div id="modelList" style="max-height:400px;overflow-y:auto;">
                        ${normalizedModels.map(({ name, type }) => {
                            const hasLink = linkMap[name] && linkMap[name].trim() !== '';
                            const savedType = typeMap[name] || type || '未知';
                            return `
                                <div class="model-row" data-model="${name}" style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #f1f4f9;">
                                    <div style="display:flex;align-items:center;gap:6px;flex:1;">
                                        ${hasLink ? `<a href="${linkMap[name]}" target="_blank" class="model-link" style="color:#6366f1;text-decoration:underline;font-weight:500;">${name}</a>` : `<span class="model-name-link" data-model="${name}" style="cursor:pointer;font-weight:500;color:#1e293b;">${name}</span>`}
                                        <span class="model-type-tag" data-model="${name}" style="background:#e9edf2;padding:2px 10px;border-radius:12px;font-size:0.75rem;color:#475569;cursor:pointer;white-space:nowrap;">${savedType}</span>
                                    </div>
                                    <button class="btn-edit-row" data-model="${name}" data-card="${cardId}" style="background:#e2e8f0;color:#1e293b;border:none;padding:4px 12px;border-radius:6px;cursor:pointer;">编辑</button>
                                </div>
                            `;
                        }).join('')}
                    </div>
                    <div style="display:flex;justify-content:flex-end;margin-top:16px;">
                        <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">关闭</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            // ---------- 显示编辑弹窗 ----------
            function showEditPopup(modelName, currentLink = '', currentType = '') {
                const overlay = document.createElement('div');
                overlay.className = 'edit-popup-overlay';
                overlay.style.cssText = `
                    position: fixed;
                    inset: 0;
                    background: rgba(0,0,0,0.3);
                    z-index: 99999;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                `;
                overlay.addEventListener('click', function(e) {
                    if (e.target === overlay) overlay.remove();
                });

                const popup = document.createElement('div');
                popup.style.cssText = `
                    background: white;
                    border-radius: 12px;
                    padding: 24px 28px;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.2);
                    min-width: 400px;
                    max-width: 500px;
                `;
                popup.innerHTML = `
                    <h3 style="margin:0 0 12px 0;font-size:1.1rem;font-weight:600;">编辑模型</h3>
                    <div style="margin-bottom:12px;">
                        <label style="font-size:0.9rem;font-weight:500;color:#475569;">下载链接</label>
                        <input type="text" id="editModelLink" placeholder="输入下载链接" value="${currentLink}" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:0.95rem;outline:none;box-sizing:border-box;">
                    </div>
                    <div style="margin-bottom:12px;">
                        <label style="font-size:0.9rem;font-weight:500;color:#475569;">模型类型</label>
                        <select id="editModelType" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:0.95rem;outline:none;background:white;">
                            <option value="Checkpoint">Checkpoint</option>
                            <option value="LoRA">LoRA</option>
                            <option value="VAE">VAE</option>
                            <option value="CLIP">CLIP</option>
                            <option value="Embedding">Embedding</option>
                            <option value="Upscale">Upscale</option>
                            <option value="ControlNet">ControlNet</option>
                            <option value="未知">未知</option>
                        </select>
                    </div>
                    <div style="display:flex;gap:12px;justify-content:flex-end;margin-top:16px;">
                        <button class="btn-popup-delete" style="padding:6px 18px;border:none;border-radius:8px;background:#ef4444;color:white;cursor:pointer;font-weight:500;">删除</button>
                        <button class="btn-popup-cancel" style="padding:6px 18px;border:none;border-radius:8px;background:#e2e8f0;color:#1e293b;cursor:pointer;font-weight:500;">取消</button>
                        <button class="btn-popup-save" style="padding:6px 18px;border:none;border-radius:8px;background:#6366f1;color:white;cursor:pointer;font-weight:500;">确定</button>
                    </div>
                `;
                overlay.appendChild(popup);
                document.body.appendChild(overlay);

                // 设置当前类型
                const typeSelect = document.getElementById('editModelType');
                if (currentType && currentType !== '') {
                    if (['Checkpoint','LoRA','VAE','CLIP','Embedding','Upscale','ControlNet','未知'].includes(currentType)) {
                        typeSelect.value = currentType;
                    } else {
                        typeSelect.value = '未知';
                    }
                } else {
                    typeSelect.value = '未知';
                }

                const linkInput = document.getElementById('editModelLink');

                // 取消
                popup.querySelector('.btn-popup-cancel').addEventListener('click', () => overlay.remove());

                // 删除
                popup.querySelector('.btn-popup-delete').addEventListener('click', async function() {
                    if (!confirm(`确定要删除模型“${modelName}”吗？此操作不可撤销。`)) return;
                    if (!token) {
                        showToast('请先登录');
                        return;
                    }
                    const formData = new FormData();
                    formData.append('model_name', modelName);
                    try {
                        const res = await fetch(`/api/cards/${cardId}/models`, {
                            method: 'DELETE',
                            headers: { 'Authorization': `Bearer ${token}` },
                            body: formData
                        });
                        if (res.ok) {
                            showToast('删除成功');
                            overlay.remove();
                            // 从主列表中移除该行
                            const row = modal.querySelector(`.model-row[data-model="${modelName}"]`);
                            if (row) {
                                row.remove();
                                delete linkMap[modelName];
                                delete typeMap[modelName];
                                const remaining = modal.querySelectorAll('.model-row');
                                if (remaining.length === 0) {
                                    modal.querySelector('#modelList').innerHTML = '<div style="text-align:center;padding:20px;color:#94a3b8;">暂无模型</div>';
                                }
                            }
                        } else {
                            const err = await res.json();
                            showToast('删除失败: ' + (err.detail || ''));
                        }
                    } catch (e) {
                        showToast('网络错误');
                    }
                });

                // 确定
                popup.querySelector('.btn-popup-save').addEventListener('click', async function() {
                    const newLink = linkInput.value.trim();
                    if (!newLink) {
                        showToast('请输入链接');
                        return;
                    }
                    if (!token) {
                        showToast('请先登录');
                        return;
                    }
                    const newType = typeSelect.value;

                    try {
                        // 更新链接
                        const linkFormData = new FormData();
                        linkFormData.append('model_name', modelName);
                        linkFormData.append('link', newLink);
                        const linkRes = await fetch('/api/model-links', {
                            method: 'POST',
                            body: linkFormData
                        });
                        if (!linkRes.ok) throw new Error('更新链接失败');

                        // 更新类型（若变化）
                        const currentTypeFromMap = typeMap[modelName] || '';
                        if (newType !== currentTypeFromMap) {
                            const typeFormData = new FormData();
                            typeFormData.append('model_type', newType);
                            const typeRes = await fetch(`/api/model-links/${modelName}/type`, {
                                method: 'PUT',
                                body: typeFormData
                            });
                            if (!typeRes.ok) throw new Error('更新类型失败');
                        }

                        showToast('更新成功');
                        overlay.remove();
                        // 局部刷新该行
                        const row = modal.querySelector(`.model-row[data-model="${modelName}"]`);
                        if (row) {
                            const nameEl = row.querySelector('.model-name-link, .model-link');
                            if (nameEl) {
                                if (nameEl.tagName === 'A') {
                                    nameEl.href = newLink;
                                } else {
                                    const newLinkEl = document.createElement('a');
                                    newLinkEl.href = newLink;
                                    newLinkEl.target = '_blank';
                                    newLinkEl.className = 'model-link';
                                    newLinkEl.style.cssText = 'color:#6366f1;text-decoration:underline;font-weight:500;';
                                    newLinkEl.textContent = modelName;
                                    nameEl.replaceWith(newLinkEl);
                                }
                            }
                            const typeTag = row.querySelector('.model-type-tag');
                            if (typeTag) typeTag.textContent = newType;
                            linkMap[modelName] = newLink;
                            typeMap[modelName] = newType;
                        }
                    } catch (e) {
                        showToast('更新失败: ' + e.message);
                    }
                });

                // 回车保存
                linkInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        popup.querySelector('.btn-popup-save').click();
                    }
                });
            }

            // 辅助函数：获取模型类型
            function getModelType(modelName) {
                if (typeMap[modelName] && typeMap[modelName] !== '') {
                    return typeMap[modelName];
                }
                const found = normalizedModels.find(item => item.name === modelName);
                return found ? found.type : '未知';
            }

            // 绑定编辑按钮
            modal.querySelectorAll('.btn-edit-row').forEach(btn => {
                btn.addEventListener('click', function() {
                    const modelName = this.dataset.model;
                    const currentLink = linkMap[modelName] || '';
                    const currentType = getModelType(modelName);
                    showEditPopup(modelName, currentLink, currentType);
                });
            });

            // 绑定模型名称点击（无链接时）
            modal.querySelectorAll('.model-name-link').forEach(el => {
                el.addEventListener('click', function() {
                    const modelName = this.dataset.model;
                    const currentLink = linkMap[modelName] || '';
                    const currentType = getModelType(modelName);
                    showEditPopup(modelName, currentLink, currentType);
                });
            });

            // ---------- 类型编辑 ----------
            modal.querySelectorAll('.model-type-tag').forEach(tag => {
                tag.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const modelName = this.dataset.model;
                    const currentType = this.textContent;
                    const popup = document.createElement('div');
                    popup.style.cssText = `
                        position: absolute;
                        background: white;
                        border: 1px solid #d1d5db;
                        border-radius: 8px;
                        padding: 8px;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                        z-index: 10000;
                        min-width: 140px;
                    `;
                    const select = document.createElement('select');
                    const options = ['Checkpoint', 'LoRA', 'VAE', 'CLIP', '未知'];
                    options.forEach(opt => {
                        const option = document.createElement('option');
                        option.value = opt;
                        option.textContent = opt;
                        if (opt === currentType) option.selected = true;
                        select.appendChild(option);
                    });
                    const confirmBtn = document.createElement('button');
                    confirmBtn.textContent = '确定';
                    confirmBtn.style.cssText = 'margin-left:8px;padding:4px 12px;background:#6366f1;color:white;border:none;border-radius:4px;cursor:pointer;';
                    const cancelBtn = document.createElement('button');
                    cancelBtn.textContent = '取消';
                    cancelBtn.style.cssText = 'margin-left:4px;padding:4px 12px;background:#e2e8f0;color:#1e293b;border:none;border-radius:4px;cursor:pointer;';
                    const div = document.createElement('div');
                    div.style.cssText = 'display:flex;align-items:center;gap:4px;';
                    div.appendChild(select);
                    div.appendChild(confirmBtn);
                    div.appendChild(cancelBtn);
                    popup.appendChild(div);
                    const rect = this.getBoundingClientRect();
                    popup.style.top = (rect.bottom + window.scrollY + 4) + 'px';
                    popup.style.left = (rect.left + window.scrollX) + 'px';
                    document.body.appendChild(popup);

                    confirmBtn.addEventListener('click', async function() {
                        const newType = select.value;
                        if (newType === currentType) {
                            popup.remove();
                            return;
                        }
                        const formData = new FormData();
                        formData.append('model_type', newType);
                        const res = await fetch(`/api/model-links/${modelName}/type`, {
                            method: 'PUT',
                            body: formData
                        });
                        if (res.ok) {
                            showToast('类型更新成功');
                            tag.textContent = newType;
                            typeMap[modelName] = newType;
                            popup.remove();
                        } else {
                            showToast('类型更新失败');
                        }
                    });
                    cancelBtn.addEventListener('click', () => popup.remove());
                    const closePopup = (e) => {
                        if (!popup.contains(e.target) && e.target !== tag) {
                            popup.remove();
                            document.removeEventListener('click', closePopup);
                        }
                    };
                    setTimeout(() => document.addEventListener('click', closePopup), 10);
                });
            });

        } catch (e) {
            showToast('获取模型信息失败');
            console.error(e);
        }
    }

    function showEditTagNamePopup(tagId, currentName) {
        console.log('showEditTagNamePopup 被调用', tagId, currentName); // 调试
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.3);
            z-index: 99999;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) overlay.remove();
        });

        const popup = document.createElement('div');
        popup.style.cssText = `
            background: white;
            border-radius: 12px;
            padding: 24px 28px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.2);
            min-width: 320px;
            max-width: 400px;
        `;
        popup.innerHTML = `
            <h3 style="margin:0 0 12px 0;font-size:1.1rem;font-weight:600;">修改标签名称</h3>
            <input type="text" id="editTagNameInput" value="${escapeHtml(currentName)}" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:0.95rem;outline:none;box-sizing:border-box;">
            <div style="display:flex;gap:12px;justify-content:flex-end;margin-top:16px;">
                <button class="btn-popup-cancel" style="padding:6px 18px;border:none;border-radius:8px;background:#e2e8f0;color:#1e293b;cursor:pointer;font-weight:500;">取消</button>
                <button class="btn-popup-save" style="padding:6px 18px;border:none;border-radius:8px;background:#6366f1;color:white;cursor:pointer;font-weight:500;">确定</button>
            </div>
        `;
        overlay.appendChild(popup);
        document.body.appendChild(overlay);

        const input = document.getElementById('editTagNameInput');
        input.focus();
        input.select();

        const cancelBtn = popup.querySelector('.btn-popup-cancel');
        const saveBtn = popup.querySelector('.btn-popup-save');

        cancelBtn.addEventListener('click', () => overlay.remove());

        saveBtn.addEventListener('click', async function() {
            const newName = input.value.trim();
            if (!newName) {
                showToast('标签名称不能为空');
                return;
            }
            if (newName === currentName) {
                overlay.remove();
                return;
            }
            if (!token) {
                showToast('请先登录');
                return;
            }
            const formData = new FormData();
            formData.append('new_name', newName);
            try {
                const res = await fetch(`/api/tags/${tagId}/name`, {
                    method: 'PUT',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formData
                });
                if (res.ok) {
                    showToast('标签名称更新成功');
                    overlay.remove();
                    loadTagCloud(currentTagPage);
                } else {
                    const err = await res.json();
                    showToast('更新失败: ' + (err.detail || ''));
                }
            } catch (e) {
                showToast('网络错误');
            }
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') saveBtn.click();
        });
    }

    window.showEditTagNamePopup = showEditTagNamePopup;

    function renderCards(cards) {
        if (!cards || !cards.length) {
            grid.innerHTML = `<div class="empty-state" style="column-span:all; text-align:center; padding:60px 20px; color:#64748b;">🧐 没有找到卡片</div>`;
            return;
        }
        let html = '';
        cards.forEach(card => {
            const imgUrl = card.image_path || `https://picsum.photos/seed/${card.id}/400/300`;
            html += `
                <div class="card" data-id="${card.id}">
                    <div class="card-image">
                        <img src="${imgUrl}" alt="${card.title || '未命名'}" loading="lazy" onerror="this.src='https://picsum.photos/seed/${card.id}/400/300'" />
                    </div>
                    <div class="card-overlay">
                        <div class="card-actions">
                            <button class="btn-action btn-workflow" data-id="${card.id}">⚙️ 工作流</button>
                            <button class="btn-action btn-prompt" data-id="${card.id}">📝 提示词</button>
                            <button class="btn-action btn-models" data-id="${card.id}">🧠 大模型</button>
                        </div>
                    </div>
                </div>
            `;
        });
        grid.innerHTML = html;

        // 恢复瀑布流滚动位置（确保当前视图是瀑布流）    
        if (currentView === 'waterfall') {        
            window.scrollTo(0, waterfallScrollY);    
        }

        grid.querySelectorAll('.btn-models').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const id = parseInt(this.dataset.id);
                handleModels(id);
            });
        });

    }

    // ---------- 事件委托（卡片交互） ----------
    if (grid) {
        grid.addEventListener('click', function(e) {
            const target = e.target;
            const cardEl = target.closest('.card');
            if (!cardEl) return;

            const cardId = parseInt(cardEl.dataset.id);
            if (isNaN(cardId)) return;

            const isWorkflowBtn = target.closest('.btn-workflow');
            const isPromptBtn = target.closest('.btn-prompt');

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
            openEditModal(cardId);
        });
    }

    // ---------- 工作流 & 提示词 ----------
    async function handleWorkflow(id, triggerEl) {
        try {
            const res = await fetch(`/api/cards/${id}`);
            if (!res.ok) throw new Error('获取失败');
            const card = await res.json();
            const hasJson = !!card.workflow_path;
            const hasImage = !!card.image_path;

            if (hasJson && hasImage) {
                showWorkflowMenu(card, triggerEl);
            } else if (hasImage) {
                const a = document.createElement('a');
                a.href = card.image_path;
                const ext = card.image_path.split('.').pop() || 'png';
                a.download = `workflow_${card.id}.${ext}`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                showToast('🖼️ 图片下载成功，将图片拖进 ComfyUI 即可重现工作流');
            } else if (hasJson) {
                const a = document.createElement('a');
                a.href = card.workflow_path;
                a.download = `workflow_${card.id}.json`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                showToast('📄 下载工作流 JSON 文件');
            } else {
                showToast('该卡片无工作流文件或图片');
            }
        } catch (e) {
            showToast('获取工作流失败');
            console.error(e);
        }
    }

    function showWorkflowMenu(card, triggerEl) {
        if (currentWorkflowMenu) {
            currentWorkflowMenu.remove();
            currentWorkflowMenu = null;
            document.removeEventListener('click', outsideClickListener);
        }

        const rect = triggerEl.getBoundingClientRect();
        const menuWidth = 220;
        const menuHeight = 150;
        let left = rect.left + rect.width / 2 - menuWidth / 2;
        if (left < 20) left = 20;
        if (left + menuWidth > window.innerWidth - 20) left = window.innerWidth - menuWidth - 20;
        let top = rect.bottom + 10;
        if (top + menuHeight > window.innerHeight - 20) {
            top = rect.top - menuHeight - 10;
        }

        const menu = document.createElement('div');
        menu.style.cssText = `
            position: fixed; top: ${top}px; left: ${left}px;
            background: white; padding: 20px 24px; border-radius: 12px;
            box-shadow: 0 8px 30px rgba(0,0,0,0.15); z-index: 1000;
            min-width: ${menuWidth}px; text-align: center;
            border: 1px solid #e2e8f0;
        `;
        menu.innerHTML = `
            <h3 style="margin:0 0 16px 0; font-size:1rem; font-weight:600;">选择下载格式</h3>
            <div style="display:flex; gap:12px; justify-content:center;">
                <button class="btn-dl-json" style="padding:8px 24px; border:none; border-radius:8px; background:#6366f1; color:white; cursor:pointer;">📄 JSON</button>
                <button class="btn-dl-png" style="padding:8px 24px; border:none; border-radius:8px; background:#10b981; color:white; cursor:pointer;">🖼️ PNG</button>
            </div>
            <button class="btn-dl-cancel" style="margin-top:16px; background:none; border:none; color:#94a3b8; cursor:pointer;">取消</button>
        `;
        document.body.appendChild(menu);
        currentWorkflowMenu = menu;

        function closeMenu() {
            if (currentWorkflowMenu) {
                currentWorkflowMenu.remove();
                currentWorkflowMenu = null;
                document.removeEventListener('click', outsideClickListener);
            }
        }

        function outsideClickListener(e) {
            if (currentWorkflowMenu && !currentWorkflowMenu.contains(e.target)) {
                closeMenu();
            }
        }
        setTimeout(() => document.addEventListener('click', outsideClickListener), 10);

        menu.querySelector('.btn-dl-json').addEventListener('click', (e) => {
            e.stopPropagation();
            if (card.workflow_path) {
                const a = document.createElement('a');
                a.href = card.workflow_path;
                a.download = `workflow_${card.id}.json`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                showToast('📄 下载工作流 JSON 文件');
            } else showToast('无 JSON 文件');
            closeMenu();
        });
        menu.querySelector('.btn-dl-png').addEventListener('click', (e) => {
            e.stopPropagation();
            if (card.image_path) {
                const a = document.createElement('a');
                a.href = card.image_path;
                const ext = card.image_path.split('.').pop() || 'png';
                a.download = `workflow_${card.id}.${ext}`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                showToast('🖼️ 图片下载成功，将图片拖进 ComfyUI 即可重现工作流');
            } else showToast('无图片文件');
            closeMenu();
        });
        menu.querySelector('.btn-dl-cancel').addEventListener('click', (e) => { e.stopPropagation(); closeMenu(); });
        menu.addEventListener('click', (e) => { if (e.target === menu) closeMenu(); });
    }

    function handlePrompt(id) {
        fetch(`/api/cards/${id}`)
            .then(res => {
                if (!res.ok) throw new Error('获取卡片失败');
                return res.json();
            })
            .then(card => openPromptModal(card))
            .catch(err => { showToast('获取提示词失败'); console.error(err); });
    }

    function openPromptModal(card) {
        const titleText = card.title ? card.title.trim() : '';
        if (titleText === '') {
            modalTitle.style.display = 'none';
        } else {
            modalTitle.style.display = 'block';
            modalTitle.textContent = `📋 ${titleText}`;
        }
        const positive = card.positive_prompt || '';
        const negative = card.negative_prompt || '';
        const positiveDisplay = escapeHtml(positive);
        const negativeDisplay = escapeHtml(negative || '（无）');
        const positiveAttr = positive.replace(/"/g, '&quot;');
        const negativeAttr = (negative || '').replace(/"/g, '&quot;');

        modalBody.innerHTML = `
            <div class="prompt-block">
                <div class="label positive">✅ 正向提示词</div>
                <div class="content">${positiveDisplay}</div>
                <button class="copy-prompt-btn" data-text="${positiveAttr}">复制正向词</button>
            </div>
            <div class="prompt-block">
                <div class="label negative">🚫 反向提示词</div>
                <div class="content">${negativeDisplay}</div>
                <button class="copy-prompt-btn" data-text="${negativeAttr}">复制反向词</button>
            </div>
            <div style="margin-top:12px; display:flex; gap:10px; justify-content:flex-end;">
                <button class="copy-prompt-btn" data-text="正向提示词：\n${positiveAttr}\n\n反向提示词：\n${negativeAttr}" style="background:#6366f1; color:white; border:none; padding:6px 18px;">📄 复制全部</button>
            </div>
        `;
        promptModal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        modalBody.querySelectorAll('.copy-prompt-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                copyText(this.dataset.text);
            });
        });
    }

    function closePromptModal() {
        promptModal.style.display = 'none';
        document.body.style.overflow = '';
    }
    if (modalCloseBtn) modalCloseBtn.addEventListener('click', closePromptModal);
    if (promptModal) promptModal.addEventListener('click', function(e) { if (e.target === this) closePromptModal(); });
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && promptModal.style.display === 'flex') closePromptModal();
    });

    // ---------- 编辑弹窗 ----------
    function openEditModal(cardId) {
        if (!token) {
            openLoginModal(() => openEditModal(cardId));
            return;
        }
        currentCardId = cardId;
        editImagePreview.innerHTML = '';
        editWorkflowPreview.innerHTML = '';

        const imageFileNameSpan = document.getElementById('imageFileName');
        const workflowFileNameSpan = document.getElementById('workflowFileName');

        if (cardId) {
            editModalTitle.textContent = '编辑卡片';
            editDeleteBtn.style.display = 'inline-block';
            fetch(`/api/cards/${cardId}`)
                .then(res => res.json())
                .then(card => {
                    editTitle.value = card.title || '';
                    editPositive.value = card.positive_prompt;
                    editNegative.value = card.negative_prompt || '';
                    editTags.value = card.tags || '';

                    // PNG 格式工作流
                    if (card.image_path) {
                        const filename = card.image_path.split('/').pop();
                        imageFileNameSpan.textContent = filename;
                        editImagePreview.innerHTML = `<button type="button" onclick="window.open('${card.image_path}', '_blank')" style="background:none; border:1px solid #6366f1; color:#6366f1; padding:4px 12px; border-radius:12px; cursor:pointer; font-size:0.9rem; height:100%; box-sizing:border-box; display:flex; align-items:center;">查看文件</button>`;
                    } else {
                        imageFileNameSpan.textContent = '选择文件';
                        editImagePreview.innerHTML = `<span style="border:1px solid #d1d5db; color:#d1d5db; padding:4px 12px; border-radius:12px; font-size:0.9rem; background:none; cursor:not-allowed; height:100%; box-sizing:border-box; display:flex; align-items:center;">查看文件</span>`;
                    }

                    // JSON 格式工作流
                    if (card.workflow_path) {
                        const filename = card.workflow_path.split('/').pop();
                        workflowFileNameSpan.textContent = filename;
                        editWorkflowPreview.innerHTML = `<button type="button" onclick="window.open('${card.workflow_path}', '_blank')" style="background:none; border:1px solid #6366f1; color:#6366f1; padding:4px 12px; border-radius:12px; cursor:pointer; font-size:0.9rem; height:100%; box-sizing:border-box; display:flex; align-items:center;">查看文件</button>`;
                    } else {
                        workflowFileNameSpan.textContent = '选择文件';
                        editWorkflowPreview.innerHTML = `<span style="border:1px solid #d1d5db; color:#d1d5db; padding:4px 12px; border-radius:12px; font-size:0.9rem; background:none; cursor:not-allowed; height:100%; box-sizing:border-box; display:flex; align-items:center;">查看文件</span>`;
                    }

                    editModal.style.display = 'flex';
                })
                .catch(() => showToast('加载卡片失败'));
        } else {
            editModalTitle.textContent = '新增卡片';
            editDeleteBtn.style.display = 'none';
            editForm.reset();
            imageFileNameSpan.textContent = '选择文件';
            workflowFileNameSpan.textContent = '选择文件';
            editImagePreview.innerHTML = '';
            editWorkflowPreview.innerHTML = '';
            editModal.style.display = 'flex';
        }
    }

    if (editCancelBtn) {
        editCancelBtn.addEventListener('click', () => {
            editModal.style.display = 'none';
            currentCardId = null;
        });
    }

    if (editForm) {
        editForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            if (!token) {
                openLoginModal(() => {
                    // 登录成功后重新触发表单提交
                    editForm.dispatchEvent(new Event('submit', { cancelable: true }));
                });
                return;
            }
            const formData = new FormData(this);
            const url = currentCardId ? `/api/cards/${currentCardId}` : '/api/cards';
            const method = currentCardId ? 'PUT' : 'POST';
            try {
                const res = await fetch(url, {
                    method,
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formData
                });
                if (res.status === 401) {
                    // token 无效或过期
                    token = null;
                    localStorage.removeItem('token');
                    showToast('登录已过期，请重新登录');
                    openLoginModal(() => {
                        // 登录成功后用户需重新打开编辑弹窗
                    });
                    // 关闭当前弹窗
                    editModal.style.display = 'none';
                    currentCardId = null;
                    return;
                }
                if (res.ok) {
                    showToast(currentCardId ? '更新成功' : '创建成功');
                    editModal.style.display = 'none';
                    currentCardId = null;
                    loadCards();
                } else {
                    const err = await res.json();
                    showToast('操作失败: ' + (err.detail || ''));
                }
            } catch (e) {
                showToast('网络错误');
            }
        });
    }

    if (editDeleteBtn) {
        editDeleteBtn.addEventListener('click', async function() {
            if (!currentCardId) return;
            if (!token) {
                openLoginModal(() => {
                    editDeleteBtn.click(); // 递归触发
                });
                return;
            }
            if (!confirm('确定要删除这张卡片吗？')) return;
            try {
                const res = await fetch(`/api/cards/${currentCardId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    showToast('删除成功');
                    editModal.style.display = 'none';
                    currentCardId = null;
                    loadCards();
                } else {
                    showToast('删除失败');
                }
            } catch (e) {
                showToast('网络错误');
            }
        });
    }

    // ---------- 快捷键 ----------
    document.addEventListener('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && e.altKey && e.key === 'p') {
            e.preventDefault();
            if (token) {
                openEditModal(null);
            } else {
                openLoginModal(() => {
                    openEditModal(null);
                });
            }
        }
    });

    // ---------- 搜索 ----------
    if (searchInput) {
        searchInput.addEventListener('input', function() {    
            if (currentView === 'waterfall') {        
                loadCards();    
            } else if (currentView === 'tagcloud') {      
                loadTagCloud(); // 重新加载并过滤    
            }
        });
    }

    // ---------- 标签云 ----------
    async function loadTagCloud(page = 1) {
        currentTagPage = page;
        const keyword = searchInput.value.trim();
        let url = `/api/tags?page=${page}&per_page=72`;
        if (keyword) url += `&keyword=${encodeURIComponent(keyword)}`;
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error('获取标签失败');
            const data = await res.json();
            if (data.total_pages > 0 && page > data.total_pages) {
                // 如果当前页超出总页数，自动跳转到最后一页
                loadTagCloud(data.total_pages);
                return;
            }
            totalTagPages = data.total_pages || 1;
            renderTagCloud(data.tags);
            renderTagPagination(data.page, data.total_pages);
        } catch (e) {
            showToast('加载标签云失败');
            console.error(e);
        }
    }

    function renderTagPagination(currentPage, totalPages) {
        const container = document.getElementById('tagPagination');
        if (!container) return;
        if (totalPages <= 1) {
            container.style.display = 'none';
            container.innerHTML = '';
            return;
        }
        container.style.display = 'block';
        let html = `<div style="display:flex;gap:8px;justify-content:center;align-items:center;flex-wrap:wrap;">`;
        // 上一页
        if (currentPage > 1) {
            html += `<button class="page-btn" data-page="${currentPage - 1}" style="padding:6px 14px;border:1px solid #d1d5db;border-radius:8px;background:white;cursor:pointer;">上一页</button>`;
        } else {
            html += `<button class="page-btn" disabled style="padding:6px 14px;border:1px solid #d1d5db;border-radius:8px;background:#f1f4f9;color:#94a3b8;cursor:not-allowed;">上一页</button>`;
        }
        // 页码显示
        html += `<span style="padding:6px 14px;color:#1e293b;">第 ${currentPage} / ${totalPages} 页</span>`;
        // 下一页
        if (currentPage < totalPages) {
            html += `<button class="page-btn" data-page="${currentPage + 1}" style="padding:6px 14px;border:1px solid #d1d5db;border-radius:8px;background:white;cursor:pointer;">下一页</button>`;
        } else {
            html += `<button class="page-btn" disabled style="padding:6px 14px;border:1px solid #d1d5db;border-radius:8px;background:#f1f4f9;color:#94a3b8;cursor:not-allowed;">下一页</button>`;
        }
        html += `</div>`;
        container.innerHTML = html;

        // 绑定点击事件
        container.querySelectorAll('.page-btn:not([disabled])').forEach(btn => {
            btn.addEventListener('click', function() {
                const page = parseInt(this.dataset.page);
                if (!isNaN(page) && page !== currentTagPage) {
                    loadTagCloud(page);
                    // 滚动到顶部
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
            });
        });
    }

    async function deleteTag(tagId) {
        if (!token) {
            openLoginModal(() => {
                deleteTag(tagId);
            });
            return;
        }
        // 如果当前在标签云视图，记录滚动位置
        if (currentView === 'tagcloud') {
            tagCloudScrollY = window.scrollY;
        }
        try {
            const res = await fetch(`/api/tags/${tagId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                showToast('删除标签成功');
                if (currentView === 'tagcloud') {
                    loadTagCloud(); // 重新加载，渲染完成后会恢复滚动位置
                }
            } else {
                const err = await res.json();
                showToast('删除失败: ' + (err.detail || ''));
            }
        } catch (e) {
            showToast('网络错误');
            console.error(e);
        }
    }

    function addTagToDraft(tagName) {
        if (!draftTags.includes(tagName)) {
            draftTags.push(tagName);
            updateDraftTextarea();
            showToast(`已添加标签：${tagName}`);
            // 自动打开抽屉
            openDraftDrawer();
        } else {
            showToast(`标签“${tagName}”已在备件库中`);
        }
    }

    function updateDraftTextarea() {
        draftTextarea.value = draftTags.join(', ');
    }

    function openDraftDrawer() {
        draftDrawer.classList.add('open');
    }

    function closeDraftDrawer() {
        draftDrawer.classList.remove('open');
    }

    // 抽屉控制
    draftToggleBtn.addEventListener('click', () => {
        if (draftDrawer.classList.contains('open')) {
            closeDraftDrawer();
        } else {
            openDraftDrawer();
        }
    });
    draftCloseBtn.addEventListener('click', closeDraftDrawer);
    // 点击背景也可关闭（可选）
    document.addEventListener('click', function(e) {
        if (draftDrawer.classList.contains('open') && !draftDrawer.contains(e.target) && e.target !== draftToggleBtn) {
            // 允许点击外部关闭，但不包括触发按钮
            closeDraftDrawer();
        }
    });

    // 清空
    draftClearBtn.addEventListener('click', () => {
        if (draftTags.length === 0) return;
        if (confirm('确定清空备件库吗？')) {
            draftTags = [];
            updateDraftTextarea();
            showToast('已清空');
        }
    });

    // 复制
    draftCopyBtn.addEventListener('click', () => {
        const text = draftTextarea.value;
        if (!text) {
            showToast('备件库为空');
            return;
        }
        copyText(text);
    });

    function renderTagCloud(tags) {
        if (!tags || tags.length === 0) {
            grid.innerHTML = `<div class="empty-state" style="column-span:all; text-align:center; padding:60px 20px; color:#64748b;">☁️ 暂无标签，请先创建一些卡片</div>`;
            return;
        }

        let html = '';
        tags.forEach(tag => {
            // ---------- 随机效果（云朵不规则） ----------
            const rotate = (Math.random() - 0.5) * 8;
            const translateY = (Math.random() - 0.5) * 12;
            const size = 0.8 + (tag.usage_count / 20) * 0.4;
            const fontSize = Math.min(size, 1.6);

            // ---------- 图片处理 ----------
            let images = tag.images || [];
            images = [...new Set(images)];
            const total = images.length;

            let imagesHtml = '';
            const cardWidth = 340;
            const cardHeight = 380;

            if (total === 0) {
                imagesHtml = `<div style="width:300px;height:300px;display:flex;align-items:center;justify-content:center;background:#f1f4f9;border-radius:8px;font-size:3rem;color:#94a3b8;">🎨</div>`;
            } else if (total === 1) {
                imagesHtml = `<img src="${images[0]}" style="width:300px;height:300px;object-fit:cover;border-radius:8px;" />`;
            } else if (total === 2) {
                imagesHtml = `
                    <img src="${images[0]}" style="width:300px;height:150px;object-fit:cover;border-radius:8px;" />
                    <img src="${images[1]}" style="width:300px;height:150px;object-fit:cover;border-radius:8px;" />
                `;
            } else if (total === 3) {
                imagesHtml = `
                    <div style="display:flex;gap:4px;justify-content:center;width:100%;">
                        <img src="${images[0]}" style="width:150px;height:150px;object-fit:cover;border-radius:8px;" />
                        <img src="${images[1]}" style="width:150px;height:150px;object-fit:cover;border-radius:8px;" />
                    </div>
                    <img src="${images[2]}" style="width:300px;height:150px;object-fit:cover;border-radius:8px;" />
                `;
            } else {
                const shuffled = [...images].sort(() => Math.random() - 0.5);
                const selected = shuffled.slice(0, 4);
                imagesHtml = `
                    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:4px;width:304px;margin:0 auto;">
                        ${selected.map(img => `<img src="${img}" style="width:150px;height:150px;object-fit:cover;border-radius:8px;" />`).join('')}
                    </div>
                `;
            }

            // ---------- 备件库状态 ----------
            const isInDraft = draftTags.includes(tag.name);
            const addBtnText = isInDraft ? '➖' : '➕';

            // ---------- 卡片 HTML ----------
            html += `
                <div class="tag-card" style="transform: rotate(${rotate}deg) translateY(${translateY}px); font-size: ${fontSize}rem; width:${cardWidth}px; height:${cardHeight}px; padding:16px; display:inline-flex; flex-direction:column; align-items:center; justify-content:center; position:relative;">
                    <div class="tag-card-images" style="display:flex; flex-direction:column; gap:4px; align-items:center; justify-content:center; width:100%; flex:1;">
                        ${imagesHtml}
                    </div>
                    <div class="tag-card-name" data-tag-id="${tag.id}" data-tag-name="${escapeHtml(tag.name)}">${escapeHtml(tag.name)}</div>
                    <div class="card-actions-overlay">
                        <button class="card-action-btn add-btn" data-tag-id="${tag.id}" data-tag-name="${escapeHtml(tag.name)}">${addBtnText}</button>
                        <button class="card-action-btn delete-btn" data-tag-id="${tag.id}" data-tag-name="${escapeHtml(tag.name)}">🗑️</button>
                    </div>
                </div>
            `;
        });

        grid.innerHTML = html;

        // ---------- 事件绑定 ----------

        // 1. 点击标签名 → 弹出编辑框
        grid.querySelectorAll('.tag-card-name').forEach(el => {
            el.addEventListener('click', function(e) {
                e.stopPropagation();
                const tagId = this.dataset.tagId;
                const currentName = this.dataset.tagName;
                // 调用全局函数（需在 DOMContentLoaded 外部定义）
                if (typeof window.showEditTagNamePopup === 'function') {
                    window.showEditTagNamePopup(tagId, currentName);
                } else {
                    console.error('showEditTagNamePopup 未定义');
                }
            });
        });

        // 2. 添加/移除备件库按钮
        grid.querySelectorAll('.add-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const tagName = this.dataset.tagName;
                const isInDraft = draftTags.includes(tagName);
                if (isInDraft) {
                    // 从备件库移除
                    draftTags = draftTags.filter(t => t !== tagName);
                    showToast(`已从备件库移除：${tagName}`);
                } else {
                    // 加入备件库
                    if (!draftTags.includes(tagName)) {
                        draftTags.push(tagName);
                        showToast(`已加入备件库：${tagName}`);
                        // 打开备件库抽屉
                        if (typeof openDraftDrawer === 'function') {
                            openDraftDrawer();
                        }
                    }
                }
                updateDraftTextarea();
                // 刷新当前标签云（更新按钮状态）
                loadTagCloud(currentTagPage);
            });
        });

        // 3. 删除标签
        grid.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const tagId = this.dataset.tagId;
                const tagName = this.dataset.tagName;
                if (confirm(`确定要删除标签“${tagName}”吗？`)) {
                    deleteTag(tagId);
                }
            });
        });

        // 4. 恢复滚动位置
        if (currentView === 'tagcloud') {
            window.scrollTo(0, tagCloudScrollY);
        }
    }

    // ---------- 视图切换 ----------
    function switchView(view) {
        if (currentView === view) return;

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
            // 隐藏备件库和名单库按钮
            if (draftToggleBtn) draftToggleBtn.style.display = 'none';
            if (listToggleBtn) listToggleBtn.style.display = 'none';
            // 关闭可能打开的抽屉
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
            // 显示备件库和名单库按钮
            if (draftToggleBtn) draftToggleBtn.style.display = 'flex';
            if (listToggleBtn) listToggleBtn.style.display = 'flex';
            loadTagCloud(currentTagPage);
        }
    }

    if (waterfallBtn) {
        waterfallBtn.addEventListener('click', () => switchView('waterfall'));
    }
    if (tagcloudBtn) {
        tagcloudBtn.addEventListener('click', () => switchView('tagcloud'));
    }

    // ---------- 初始化 ----------
    loadCards();

    // 初始状态为瀑布流，隐藏分页控件
    const pagination = document.getElementById('tagPagination');
    if (pagination) pagination.style.display = 'none';    

    function showCandidateModal(candidates) {
        selectedPositive = null;
        selectedNegative = null;
        const modal = document.getElementById('candidateModal');
        const list = document.getElementById('candidateList');
        if (!modal || !list) return;
        list.innerHTML = '';

        // ---------- 构建候选列表 ----------
        candidates.forEach((text) => {
            const item = document.createElement('div');
            item.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-bottom:1px solid #f1f4f9;';

            const textSpan = document.createElement('span');
            const displayText = text.length > 100 ? text.slice(0, 100) + '...' : text;
            textSpan.textContent = displayText;
            textSpan.title = text;
            textSpan.style.cssText = 'flex:1;margin-right:12px;word-break:break-all;font-size:0.9rem;cursor:help;';
            textSpan.addEventListener('mouseenter', function() {
                showToast(this.title);
            });

            const btnGroup = document.createElement('div');
            btnGroup.style.cssText = 'display:flex;gap:6px;flex-shrink:0;';

            const posBtn = document.createElement('button');
            posBtn.className = 'btn-primary';
            posBtn.style.cssText = 'padding:4px 12px;font-size:0.8rem;min-width:80px;';
            posBtn.dataset.text = text;
            posBtn.dataset.type = 'positive';
            posBtn.textContent = '设为正向';

            const negBtn = document.createElement('button');
            negBtn.className = 'btn-secondary';
            negBtn.style.cssText = 'padding:4px 12px;font-size:0.8rem;min-width:80px;';
            negBtn.dataset.text = text;
            negBtn.dataset.type = 'negative';
            negBtn.textContent = '设为反向';

            posBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (selectedPositive === text) {
                    selectedPositive = null;
                } else {
                    if (selectedNegative === text) selectedNegative = null;
                    selectedPositive = text;
                }
                updateCandidateButtons();
            });

            negBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (selectedNegative === text) {
                    selectedNegative = null;
                } else {
                    if (selectedPositive === text) selectedPositive = null;
                    selectedNegative = text;
                }
                updateCandidateButtons();
            });

            btnGroup.appendChild(posBtn);
            btnGroup.appendChild(negBtn);
            item.appendChild(textSpan);
            item.appendChild(btnGroup);
            list.appendChild(item);
        });

        // ---------- 底部操作栏（在列表外部） ----------
        // 检查是否已存在操作栏，若存在则移除
        const existingAction = document.getElementById('candidateActions');
        if (existingAction) existingAction.remove();

        const actionDiv = document.createElement('div');
        actionDiv.id = 'candidateActions';
        actionDiv.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-top:16px;padding-top:16px;border-top:1px solid #e2e8f0;';

        // 下拉框（左侧）
        const typeSelect = document.createElement('select');
        typeSelect.id = 'candidateTypeSelect';
        typeSelect.style.cssText = 'padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:0.9rem;';
        const options = [
            { value: 'auto', label: '默认（自动判断）' },
            { value: 'tags', label: '标签组合' },
            { value: 'nl', label: '自然语言' },
            { value: 'json', label: 'JSON格式' }
        ];
        options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label;
            typeSelect.appendChild(option);
        });
        actionDiv.appendChild(typeSelect);

        // 按钮组（右侧）
        const btnDiv = document.createElement('div');
        btnDiv.style.cssText = 'display:flex;gap:12px;';
        const confirmBtn = document.createElement('button');
        confirmBtn.textContent = '确定';
        confirmBtn.className = 'btn-primary';
        confirmBtn.style.cssText = 'padding:8px 24px;';
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = '取消';
        cancelBtn.className = 'btn-secondary';
        cancelBtn.style.cssText = 'padding:8px 24px;';
        btnDiv.appendChild(confirmBtn);
        btnDiv.appendChild(cancelBtn);
        actionDiv.appendChild(btnDiv);

        // 将操作栏插入到列表之后（作为同级）
        list.parentNode.insertBefore(actionDiv, list.nextSibling);

        // ---------- 更新按钮状态 ----------
        function updateCandidateButtons() {
            const allPosBtns = list.querySelectorAll('[data-type="positive"]');
            const allNegBtns = list.querySelectorAll('[data-type="negative"]');
            allPosBtns.forEach(btn => {
                const text = btn.dataset.text;
                if (selectedPositive === text) {
                    btn.textContent = '已选正向 ✓';
                    btn.style.background = '#10b981';
                    btn.style.borderColor = '#10b981';
                } else {
                    btn.textContent = '设为正向';
                    btn.style.background = '#6366f1';
                    btn.style.borderColor = '#6366f1';
                }
            });
            allNegBtns.forEach(btn => {
                const text = btn.dataset.text;
                if (selectedNegative === text) {
                    btn.textContent = '已选反向 ✓';
                    btn.style.background = '#ef4444';
                    btn.style.borderColor = '#ef4444';
                } else {
                    btn.textContent = '设为反向';
                    btn.style.background = '#e2e8f0';
                    btn.style.borderColor = '#e2e8f0';
                }
            });
        }

        // ---------- 确定按钮事件 ----------
        confirmBtn.addEventListener('click', function() {
            if (!selectedPositive && !selectedNegative) {
                showToast('请至少选择一个提示词');
                return;
            }
            const selectedType = document.getElementById('candidateTypeSelect').value;
            const positiveInput = document.getElementById('editPositive');
            const negativeInput = document.getElementById('editNegative');
            if (selectedPositive) positiveInput.value = selectedPositive;
            if (selectedNegative) negativeInput.value = selectedNegative;
            document.getElementById('editPromptType').value = selectedType;
            closeCandidateModal();
            showToast('已应用提示词');
        });

        // ---------- 取消按钮事件 ----------
        cancelBtn.addEventListener('click', closeCandidateModal);

        // 初始化按钮状态
        updateCandidateButtons();
        modal.style.display = 'flex';
    }

    function closeCandidateModal() {
        const modal = document.getElementById('candidateModal');
        if (modal) modal.style.display = 'none';
        selectedPositive = null;
        selectedNegative = null;
    }

    // 候选模态框点击背景关闭
    const candidateModal = document.getElementById('candidateModal');
    if (candidateModal) {
        candidateModal.addEventListener('click', function(e) {
            if (e.target === this) closeCandidateModal();
        });
    }

    const editWorkflowInput = document.getElementById('editWorkflow');
    if (editWorkflowInput) {
        editWorkflowInput.addEventListener('change', function(e) {
            const file = this.files[0];
            const fileNameSpan = document.getElementById('workflowFileName');
            if (file) {
                fileNameSpan.textContent = file.name;
            } else {
                fileNameSpan.textContent = '选择文件';
            }
        });
    }

    // ---------- 图片上传自动提取提示词（延迟绑定，确保元素已加载） ----------
    setTimeout(() => {
        // ---------- 图片上传自动提取提示词（保留文件名） ----------
        const editImageInput = document.getElementById('editImage');
        if (editImageInput) {
            let lastFile = null; // 记录上次选择的文件，避免重复提取
            editImageInput.addEventListener('change', async function(e) {
                const file = this.files[0];
                if (!file) return;

                const fileNameSpan = document.getElementById('imageFileName');
                if (file) {
                    fileNameSpan.textContent = file.name;
                } else {
                    fileNameSpan.textContent = '选择文件';
                }

                // 如果与上次选择的文件相同，不重复处理
                if (lastFile && lastFile.name === file.name && lastFile.size === file.size) {
                    return;
                }
                lastFile = file;

                console.log('选择文件:', file.name, file.type);

                if (!file.type.startsWith('image/')) {
                    showToast('请选择图片文件');
                    this.value = ''; // 清空错误文件
                    lastFile = null;
                    return;
                }

                const positiveInput = document.getElementById('editPositive');
                const negativeInput = document.getElementById('editNegative');
                if (positiveInput.value.trim() || negativeInput.value.trim()) {
                    if (!confirm('当前已有提示词，是否覆盖？')) {
                        this.value = ''; // 用户取消，清空选择
                        lastFile = null;
                        return;
                    }
                }

                showToast('正在提取提示词...');

                const formData = new FormData();
                formData.append('file', file);

                try {
                    const res = await fetch('/api/extract-prompt-from-image', {
                        method: 'POST',
                        body: formData
                    });

                    console.log('响应状态:', res.status);

                    if (res.ok) {
                        const data = await res.json();
                        console.log('提取结果:', data);

                        if (data.candidates && data.candidates.length > 0) {
                            // 显示候选列表模态框
                            showCandidateModal(data.candidates);
                        } else {
                            showToast('⚠️ 未能提取到提示词，请手动输入');
                        }
                        // 保留文件名，不清空 input
                    } else {
                        // 错误处理：如果是“不包含工作流信息”，则静默忽略（不显示错误）
                        let errMsg = '';
                        let isNoWorkflow = false;
                        try {
                            const err = await res.json();
                            errMsg = err.detail || '';
                            if (errMsg.includes('不包含工作流信息')) {
                                isNoWorkflow = true;
                            }
                        } catch (_) {}
                        if (isNoWorkflow) {
                            // 不显示任何错误提示，用户可继续手动输入
                            console.log('图片不包含工作流信息，已作为示例图上传');
                        } else {
                            showToast('❌ 提取失败: ' + (errMsg || '未知错误'));
                            console.error('后端错误:', res.status, errMsg);
                        }
                    }
                } catch (err) {
                    showToast('网络错误，请稍后重试');
                    console.error('请求异常:', err);
                    this.value = '';
                    lastFile = null;
                }
            });
        }
    }, 200); // 延迟 200ms 确保元素已完全渲染

    // 创建全局 tooltip 元素
    const tooltipEl = document.createElement('div');
    tooltipEl.className = 'global-tooltip';
    document.body.appendChild(tooltipEl);

    // 辅助函数：获取可靠的 DOM 元素
    function getElement(target) {
        if (!target) return null;
        // 如果是元素节点，直接返回
        if (target.nodeType === Node.ELEMENT_NODE) {
            return target;
        }
        // 如果是文本节点，返回其父元素
        if (target.nodeType === Node.TEXT_NODE) {
            return target.parentNode;
        }
        // 其他情况（例如 Document、Window）返回 null
        return null;
    }

    document.addEventListener('mouseenter', function(e) {
        const el = getElement(e.target);
        if (!el) return;
        const icon = el.closest('.info-icon');
        if (!icon) return;
        const text = icon.getAttribute('data-tooltip') || icon.getAttribute('title');
        if (!text) return;
        tooltipEl.textContent = text;
        tooltipEl.classList.add('visible');
        const rect = icon.getBoundingClientRect();
        let top = rect.top - tooltipEl.offsetHeight - 8;
        let left = rect.left + rect.width / 2 - tooltipEl.offsetWidth / 2;
        if (top < 10) {
            top = rect.bottom + 8;
        }
        if (left < 10) {
            left = 10;
        } else if (left + tooltipEl.offsetWidth > window.innerWidth - 10) {
            left = window.innerWidth - tooltipEl.offsetWidth - 10;
        }
        tooltipEl.style.top = top + 'px';
        tooltipEl.style.left = left + 'px';
    }, true);

    document.addEventListener('mouseleave', function(e) {
        const el = getElement(e.target);
        if (!el) return;
        const icon = el.closest('.info-icon');
        if (!icon) return;
        tooltipEl.classList.remove('visible');
    }, true);

    // ---------- 黑白名单抽屉 ----------
    const listDrawer = document.getElementById('listDrawer');
    const listToggleBtn = document.getElementById('listToggleBtn');
    const listCloseBtn = document.querySelector('.list-close');
    const whitelistContainer = document.getElementById('whitelistContainer');
    const blacklistContainer = document.getElementById('blacklistContainer');

    function openListDrawer() {
        listDrawer.classList.add('open');
        loadTagLists();
    }

    function closeListDrawer() {
        listDrawer.classList.remove('open');
    }

    listToggleBtn.addEventListener('click', () => {
        if (listDrawer.classList.contains('open')) {
            closeListDrawer();
        } else {
            openListDrawer();
        }
    });
    listCloseBtn.addEventListener('click', closeListDrawer);

    document.addEventListener('click', function(e) {
        if (listDrawer.classList.contains('open') && !listDrawer.contains(e.target) && e.target !== listToggleBtn) {
            closeListDrawer();
        }
    });

    async function loadTagLists() {
        try {
            const [whiteRes, blackRes] = await Promise.all([
                fetch('/api/tag-lists/whitelist'),
                fetch('/api/tag-lists/blacklist')
            ]);
            const whitelist = await whiteRes.json();
            const blacklist = await blackRes.json();
            renderTagList(whitelistContainer, whitelist, 'whitelist');
            renderTagList(blacklistContainer, blacklist, 'blacklist');
        } catch (e) {
            console.error('加载名单库失败', e);
        }
    }

    function renderTagList(container, keywords, type) {
        container.innerHTML = '';
        if (!keywords || keywords.length === 0) {
            container.innerHTML = '<span style="color:#94a3b8;font-size:0.9rem;">暂无</span>';
        } else {
            keywords.forEach(keyword => {
                const item = document.createElement('span');
                item.className = 'list-item';
                item.innerHTML = `${keyword} <button class="remove-btn" data-keyword="${keyword}" data-type="${type}">✕</button>`;
                container.appendChild(item);
            });
        }
        // 添加 "+" 按钮
        const addBtn = document.createElement('button');
        addBtn.className = 'list-add-btn';
        addBtn.textContent = '+';
        addBtn.style.cssText = `
            display:inline-flex;
            align-items:center;
            justify-content:center;
            width:28px;
            height:28px;
            border-radius:50%;
            background:#e2e8f0;
            border:none;
            color:#1e293b;
            font-size:1.2rem;
            cursor:pointer;
            margin-left:4px;
        `;
        addBtn.title = `添加${type === 'whitelist' ? '白名单' : '黑名单'}`;
        addBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            const keyword = prompt(`请输入要添加的${type === 'whitelist' ? '白名单' : '黑名单'}关键词：`);
            if (keyword && keyword.trim()) {
                addTagList(keyword.trim(), type);
            }
        });
        container.appendChild(addBtn);
    }

    async function addTagList(keyword, type) {
        try {
            const url = type === 'whitelist' ? '/api/tag-lists/whitelist' : '/api/tag-lists/blacklist';
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ keyword })
            });
            if (res.ok) {
                showToast('添加成功');
                loadTagLists();
            } else {
                showToast('添加失败');
            }
        } catch (e) {
            showToast('网络错误');
        }
    }

    // 初始状态为瀑布流，隐藏备件库按钮
    if (draftToggleBtn) draftToggleBtn.style.display = 'none';
    if (listToggleBtn) listToggleBtn.style.display = 'none';

    // ---------- 绑定“+”按钮（快速添加名单） ----------
    document.querySelectorAll('.add-list-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const type = this.dataset.type; // 'whitelist' 或 'blacklist'
            const keyword = prompt(`请输入要添加到${type === 'whitelist' ? '白' : '黑'}名单的关键词：`);
            if (!keyword || keyword.trim() === '') return;
            const trimmed = keyword.trim();
            // 调用 API 添加
            const url = type === 'whitelist' ? '/api/tag-lists/whitelist' : '/api/tag-lists/blacklist';
            const formData = new FormData();
            formData.append('keyword', trimmed);
            fetch(url, {
                method: 'POST',
                body: formData
            }).then(res => {
                if (res.ok) {
                    showToast('添加成功');
                    loadTagLists(); // 刷新名单库
                } else {
                    showToast('添加失败');
                }
            }).catch(() => showToast('网络错误'));
        });
    });    



}); // end DOMContentLoaded