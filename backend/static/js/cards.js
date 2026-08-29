// ---------- 卡片 CRUD ----------
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

// ---------- 提示词弹窗 ----------
function openPromptModal(card) {
    const modal = document.getElementById('promptModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    const modalCloseBtn = document.getElementById('modalCloseBtn');

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

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    modalBody.querySelectorAll('.copy-prompt-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            copyText(this.dataset.text);
        });
    });

    const closeHandler = function() {
        closePromptModal();
    };
    modalCloseBtn.removeEventListener('click', closeHandler);
    modalCloseBtn.addEventListener('click', closeHandler);

    modal.removeEventListener('click', backgroundHandler);
    modal.addEventListener('click', backgroundHandler);
    function backgroundHandler(e) {
        if (e.target === modal) {
            closePromptModal();
        }
    }
}

function closePromptModal() {
    const modal = document.getElementById('promptModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }
}

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        const modal = document.getElementById('promptModal');
        if (modal && modal.style.display === 'flex') {
            closePromptModal();
        }
    }
});

// ---------- 大模型列表 ----------
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

        const normalizedModels = models.map(item => {
            if (typeof item === 'string') {
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

        const linkRes = await fetch('/api/model-links');
        const links = await linkRes.json();
        const linkMap = {};
        const typeMap = {};
        links.forEach(link => {
            linkMap[link.model_name] = link.link || '';
            typeMap[link.model_name] = link.type || '';
        });

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
            const token = localStorage.getItem('token');

            const overlay = document.createElement('div');
            overlay.className = 'edit-popup-overlay';
            overlay.style.cssText = `
                position: fixed; inset: 0; background: rgba(0,0,0,0.3); z-index: 99999;
                display: flex; align-items: center; justify-content: center;
            `;
            overlay.addEventListener('click', function(e) {
                if (e.target === overlay) overlay.remove();
            });

            const popup = document.createElement('div');
            popup.style.cssText = `
                background: white; border-radius: 12px; padding: 24px 28px;
                box-shadow: 0 20px 60px rgba(0,0,0,0.2);
                min-width: 400px; max-width: 500px;
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
                    const linkFormData = new FormData();
                    linkFormData.append('model_name', modelName);
                    linkFormData.append('link', newLink);
                    const linkRes = await fetch('/api/model-links', {
                        method: 'POST',
                        body: linkFormData
                    });
                    if (!linkRes.ok) throw new Error('更新链接失败');

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

        // 模型名称点击（无链接时）
        modal.querySelectorAll('.model-name-link').forEach(el => {
            el.addEventListener('click', function() {
                const modelName = this.dataset.model;
                const currentLink = linkMap[modelName] || '';
                const currentType = getModelType(modelName);
                showEditPopup(modelName, currentLink, currentType);
            });
        });

        // ---------- 类型编辑（修正：选项与编辑弹窗一致） ----------
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
                // 完整选项列表（与编辑弹窗一致）
                const options = ['Checkpoint', 'LoRA', 'VAE', 'CLIP', 'Embedding', 'Upscale', 'ControlNet', '未知'];
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
                    const token = localStorage.getItem('token');
                    if (!token) { showToast('请先登录'); return; }
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

                if (card.image_path) {
                    const filename = card.image_path.split('/').pop();
                    imageFileNameSpan.textContent = filename;
                    editImagePreview.innerHTML = `<button type="button" onclick="window.open('${card.image_path}', '_blank')" style="background:none; border:1px solid #6366f1; color:#6366f1; padding:4px 12px; border-radius:12px; cursor:pointer; font-size:0.9rem; height:100%; box-sizing:border-box; display:flex; align-items:center;">查看文件</button>`;
                } else {
                    imageFileNameSpan.textContent = '选择文件';
                    editImagePreview.innerHTML = `<span style="border:1px solid #d1d5db; color:#d1d5db; padding:4px 12px; border-radius:12px; font-size:0.9rem; background:none; cursor:not-allowed; height:100%; box-sizing:border-box; display:flex; align-items:center;">查看文件</span>`;
                }

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

// ---------- 候选提示词模态框 ----------
function showCandidateModal(candidates) {
    selectedPositive = null;
    selectedNegative = null;
    const modal = document.getElementById('candidateModal');
    const list = document.getElementById('candidateList');
    if (!modal || !list) return;
    list.innerHTML = '';

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

    const existingAction = document.getElementById('candidateActions');
    if (existingAction) existingAction.remove();

    const actionDiv = document.createElement('div');
    actionDiv.id = 'candidateActions';
    actionDiv.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-top:16px;padding-top:16px;border-top:1px solid #e2e8f0;';

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

    list.parentNode.insertBefore(actionDiv, list.nextSibling);

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

    cancelBtn.addEventListener('click', closeCandidateModal);

    updateCandidateButtons();
    modal.style.display = 'flex';
}

function closeCandidateModal() {
    const modal = document.getElementById('candidateModal');
    if (modal) modal.style.display = 'none';
    selectedPositive = null;
    selectedNegative = null;
}

// ---------- 图片上传提取 ----------
function initImageUpload() {
    const editImageInput = document.getElementById('editImage');
    if (!editImageInput) return;
    let lastFile = null;
    editImageInput.addEventListener('change', async function(e) {
        const file = this.files[0];
        if (!file) return;

        const fileNameSpan = document.getElementById('imageFileName');
        if (file) {
            fileNameSpan.textContent = file.name;
        } else {
            fileNameSpan.textContent = '选择文件';
        }

        if (lastFile && lastFile.name === file.name && lastFile.size === file.size) return;
        lastFile = file;

        console.log('选择文件:', file.name, file.type);

        if (!file.type.startsWith('image/')) {
            showToast('请选择图片文件');
            this.value = '';
            lastFile = null;
            return;
        }

        const positiveInput = document.getElementById('editPositive');
        const negativeInput = document.getElementById('editNegative');
        if (positiveInput.value.trim() || negativeInput.value.trim()) {
            if (!confirm('当前已有提示词，是否覆盖？')) {
                this.value = '';
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
                    showCandidateModal(data.candidates);
                } else {
                    showToast('⚠️ 未能提取到提示词，请手动输入');
                }
            } else {
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

// ---------- 初始化 ----------
function initCards() {
    const cancelBtn = document.getElementById('editCancelBtn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', function() {
            document.getElementById('editModal').style.display = 'none';
            currentCardId = null;
        });
    }

    const form = document.getElementById('editForm');
    if (form) {
        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            if (!token) {
                openLoginModal(() => form.dispatchEvent(new Event('submit', { cancelable: true })));
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
                    token = null;
                    localStorage.removeItem('token');
                    showToast('登录已过期，请重新登录');
                    openLoginModal(() => {});
                    document.getElementById('editModal').style.display = 'none';
                    currentCardId = null;
                    return;
                }
                if (res.ok) {
                    showToast(currentCardId ? '更新成功' : '创建成功');
                    document.getElementById('editModal').style.display = 'none';
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

    const deleteBtn = document.getElementById('editDeleteBtn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', async function() {
            if (!currentCardId) return;
            if (!token) {
                openLoginModal(() => deleteBtn.click());
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
                    document.getElementById('editModal').style.display = 'none';
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

    initImageUpload();

    document.addEventListener('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && e.altKey && e.key === 'p') {
            e.preventDefault();
            if (token) openEditModal(null);
            else openLoginModal(() => openEditModal(null));
        }
    });

    if (searchInput) {
        searchInput.addEventListener('input', function() {
            if (currentView === 'waterfall') loadCards();
            else if (currentView === 'tagcloud' && typeof loadTagCloud === 'function') loadTagCloud();
        });
    }

    const candidateModal = document.getElementById('candidateModal');
    if (candidateModal) {
        candidateModal.addEventListener('click', function(e) {
            if (e.target === this) closeCandidateModal();
        });
    }

    console.log('卡片模块初始化完成');
}

// ---------- 暴露全局 ----------
window.loadCards = loadCards;
window.renderCards = renderCards;
window.openEditModal = openEditModal;
window.initCards = initCards;
window.showCandidateModal = showCandidateModal;
window.closeCandidateModal = closeCandidateModal;
window.handleWorkflow = handleWorkflow;
window.handlePrompt = handlePrompt;
window.openPromptModal = openPromptModal;
window.closePromptModal = closePromptModal;
window.handleModels = handleModels;