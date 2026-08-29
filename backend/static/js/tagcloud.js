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
            loadTagCloud(data.total_pages);
            return;
        }
        totalTagPages = data.total_pages || 1;
        renderTagCloud(data.tags);
        renderTagPagination(data.page, data.total_pages);
    } catch (e) {
        window.showToast('加载标签云失败');
        console.error(e);
    }
}

function renderTagCloud(tags) {
    if (!tags || tags.length === 0) {
        grid.innerHTML = `<div class="empty-state" style="column-span:all; text-align:center; padding:60px 20px; color:#64748b;">☁️ 暂无标签，请先创建一些卡片</div>`;
        return;
    }

    let html = '';
    tags.forEach(tag => {
        const rotate = (Math.random() - 0.5) * 8;
        const translateY = (Math.random() - 0.5) * 12;
        const size = 0.8 + (tag.usage_count / 20) * 0.4;
        const fontSize = Math.min(size, 1.6);

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

        const isInDraft = draftTags.includes(tag.name);
        const addBtnText = isInDraft ? '➖' : '➕';

        html += `
            <div class="tag-card" style="transform: rotate(${rotate}deg) translateY(${translateY}px); font-size: ${fontSize}rem; width:${cardWidth}px; height:${cardHeight}px; padding:16px; display:inline-flex; flex-direction:column; align-items:center; justify-content:center; position:relative;">
                <div class="tag-card-images" style="display:flex; flex-direction:column; gap:4px; align-items:center; justify-content:center; width:100%; flex:1;">
                    ${imagesHtml}
                </div>
                <div class="tag-card-name" data-tag-id="${tag.id}" data-tag-name="${escapeHtml(tag.name)}">${escapeHtml(tag.name)}</div>
                <div class="card-actions-overlay">
                    <button class="card-action-btn add-btn" data-tag-id="${tag.id}" data-tag-name="${escapeHtml(tag.name)}">${addBtnText}</button>
                    <button class="card-action-btn edit-btn" data-tag-id="${tag.id}" data-tag-name="${escapeHtml(tag.name)}">✏️</button>
                </div>
            </div>
        `;
    });

    grid.innerHTML = html;

    // 绑定 add-btn
    grid.querySelectorAll('.add-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const tagName = this.dataset.tagName;
            const isInDraft = draftTags.includes(tagName);
            if (isInDraft) {
                draftTags = draftTags.filter(t => t !== tagName);
                window.showToast(`已从备件库移除：${tagName}`);
            } else {
                if (!draftTags.includes(tagName)) {
                    draftTags.push(tagName);
                    window.showToast(`已加入备件库：${tagName}`);
                    if (typeof window.openDraftDrawer === 'function') {
                        window.openDraftDrawer();
                    }
                }
            }
            updateDraftTextarea();
            loadTagCloud(currentTagPage);
        });
    });

    // 绑定 edit-btn
    grid.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const tagId = this.dataset.tagId;
            const tagName = this.dataset.tagName;
            if (typeof window.showEditTagPopup === 'function') {
                window.showEditTagPopup(tagId, tagName);
            } else {
                console.error('showEditTagPopup 未定义');
            }
        });
    });

    if (currentView === 'tagcloud') {
        window.scrollTo(0, tagCloudScrollY);
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
    if (currentPage > 1) {
        html += `<button class="page-btn" data-page="${currentPage - 1}" style="padding:6px 14px;border:1px solid #d1d5db;border-radius:8px;background:white;cursor:pointer;">上一页</button>`;
    } else {
        html += `<button class="page-btn" disabled style="padding:6px 14px;border:1px solid #d1d5db;border-radius:8px;background:#f1f4f9;color:#94a3b8;cursor:not-allowed;">上一页</button>`;
    }
    html += `<span style="padding:6px 14px;color:#1e293b;">第 ${currentPage} / ${totalPages} 页</span>`;
    if (currentPage < totalPages) {
        html += `<button class="page-btn" data-page="${currentPage + 1}" style="padding:6px 14px;border:1px solid #d1d5db;border-radius:8px;background:white;cursor:pointer;">下一页</button>`;
    } else {
        html += `<button class="page-btn" disabled style="padding:6px 14px;border:1px solid #d1d5db;border-radius:8px;background:#f1f4f9;color:#94a3b8;cursor:not-allowed;">下一页</button>`;
    }
    html += `</div>`;
    container.innerHTML = html;

    container.querySelectorAll('.page-btn:not([disabled])').forEach(btn => {
        btn.addEventListener('click', function() {
            const page = parseInt(this.dataset.page);
            if (!isNaN(page) && page !== currentTagPage) {
                loadTagCloud(page);
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
    if (currentView === 'tagcloud') {
        tagCloudScrollY = window.scrollY;
    }
    try {
        const res = await fetch(`/api/tags/${tagId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            window.showToast('删除标签成功');
            if (currentView === 'tagcloud') {
                loadTagCloud();
            }
        } else {
            const err = await res.json();
            window.showToast('删除失败: ' + (err.detail || ''));
        }
    } catch (e) {
        window.showToast('网络错误');
        console.error(e);
    }
}

// ---------- 编辑标签弹窗 ----------
function showEditTagPopup(tagId, currentName) {
    Promise.all([
        fetch('/api/tag-lists/whitelist').then(r => r.json()),
        fetch('/api/tag-lists/blacklist').then(r => r.json())
    ]).then(([whitelist, blacklist]) => {
        let isWhite = whitelist.includes(currentName);
        let isBlack = blacklist.includes(currentName);

        const overlay = document.createElement('div');
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

        // 第一行：标签名称输入框 + 确定按钮
        const nameRow = document.createElement('div');
        nameRow.style.cssText = 'display:flex; gap:8px; margin-bottom:12px; align-items:center;';
        nameRow.innerHTML = `
            <label style="font-size:0.9rem;font-weight:500;color:#475569;white-space:nowrap;">标签名称</label>
            <input type="text" id="editTagNameInput" value="${escapeHtml(currentName)}" style="flex:1;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:0.95rem;outline:none;box-sizing:border-box;">
            <button class="btn-popup-save" style="padding:6px 18px;border:none;border-radius:8px;background:#6366f1;color:white;cursor:pointer;font-weight:500;white-space:nowrap;">确定</button>
        `;
        popup.appendChild(nameRow);

        // 第二行：加入白名单、加入黑名单、删除标签、关闭弹窗
        const actionRow = document.createElement('div');
        actionRow.style.cssText = 'display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:0;';
        actionRow.innerHTML = `
            <button class="tag-list-toggle" data-action="whitelist" style="padding:4px 12px;border:1px solid #d1d5db;border-radius:6px;background:${isWhite ? '#059669' : '#fff'};color:${isWhite ? '#fff' : '#1e293b'};cursor:pointer;">加入白名单</button>
            <button class="tag-list-toggle" data-action="blacklist" style="padding:4px 12px;border:1px solid #d1d5db;border-radius:6px;background:${isBlack ? '#dc2626' : '#fff'};color:${isBlack ? '#fff' : '#1e293b'};cursor:pointer;">加入黑名单</button>
            <button class="btn-popup-delete" style="padding:6px 18px;border:none;border-radius:8px;background:#ef4444;color:white;cursor:pointer;font-weight:500;">删除标签</button>
            <button class="btn-popup-cancel" style="padding:6px 18px;border:none;border-radius:8px;background:#e2e8f0;color:#1e293b;cursor:pointer;font-weight:500;">关闭弹窗</button>
        `;
        popup.appendChild(actionRow);

        overlay.appendChild(popup);
        document.body.appendChild(overlay);

        // 获取元素引用
        const input = document.getElementById('editTagNameInput');
        input.focus();
        input.select();

        const whiteBtn = actionRow.querySelector('[data-action="whitelist"]');
        const blackBtn = actionRow.querySelector('[data-action="blacklist"]');
        const cancelBtn = actionRow.querySelector('.btn-popup-cancel');
        const deleteBtn = actionRow.querySelector('.btn-popup-delete');
        const saveBtn = nameRow.querySelector('.btn-popup-save');

        // ---------- 黑白名单互斥切换 ----------
        async function toggleList(action) {
            if (!token) { showToast('请先登录'); return; }
            const keyword = currentName;
            let url, method;
            let currentState = action === 'whitelist' ? isWhite : isBlack;
            if (currentState) {
                url = action === 'whitelist' ? `/api/tag-lists/whitelist/${encodeURIComponent(keyword)}` : `/api/tag-lists/blacklist/${encodeURIComponent(keyword)}`;
                method = 'DELETE';
            } else {
                url = action === 'whitelist' ? '/api/tag-lists/whitelist' : '/api/tag-lists/blacklist';
                method = 'POST';
                if (action === 'whitelist' && isBlack) {
                    await fetch(`/api/tag-lists/blacklist/${encodeURIComponent(keyword)}`, {
                        method: 'DELETE',
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    isBlack = false;
                } else if (action === 'blacklist' && isWhite) {
                    await fetch(`/api/tag-lists/whitelist/${encodeURIComponent(keyword)}`, {
                        method: 'DELETE',
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    isWhite = false;
                }
            }
            const options = {
                method,
                headers: { 'Authorization': `Bearer ${token}` }
            };
            if (method === 'POST') {
                options.headers['Content-Type'] = 'application/json';
                options.body = JSON.stringify({ keyword });
            }
            const res = await fetch(url, options);
            if (res.ok) {
                if (method === 'POST') {
                    if (action === 'whitelist') isWhite = true;
                    else isBlack = true;
                } else {
                    if (action === 'whitelist') isWhite = false;
                    else isBlack = false;
                }
                whiteBtn.style.background = isWhite ? '#059669' : '#fff';
                whiteBtn.style.color = isWhite ? '#fff' : '#1e293b';
                blackBtn.style.background = isBlack ? '#dc2626' : '#fff';
                blackBtn.style.color = isBlack ? '#fff' : '#1e293b';
                showToast('更新成功');
            } else {
                const err = await res.json();
                showToast('操作失败: ' + (err.detail || ''));
            }
        }

        whiteBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            toggleList('whitelist');
        });
        blackBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            toggleList('blacklist');
        });

        // ---------- 删除 ----------
        deleteBtn.addEventListener('click', function() {
            if (!confirm(`确定要删除标签“${currentName}”吗？`)) return;
            if (typeof deleteTag === 'function') {
                deleteTag(tagId);
                overlay.remove();
            } else {
                showToast('deleteTag 未定义');
            }
        });

        // ---------- 关闭弹窗 ----------
        cancelBtn.addEventListener('click', () => overlay.remove());

        // ---------- 确定（修改名称）- 局部刷新 ----------
        saveBtn.addEventListener('click', async function() {
            const newName = input.value.trim();
            if (!newName) { showToast('标签名称不能为空'); return; }
            if (newName === currentName) { overlay.remove(); return; }
            if (!token) { showToast('请先登录'); return; }
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

                    // ===== 局部更新（修正选择器） =====
                    // 1. 更新卡片上的标签名称（通过 data-tag-id 定位）
                    const cardNameEl = document.querySelector(`.tag-card-name[data-tag-id="${tagId}"]`);
                    if (cardNameEl) {
                        cardNameEl.textContent = newName;
                        cardNameEl.dataset.tagName = newName;
                    }

                    // 2. 更新备件库中的标签名（如果存在）
                    const draftIndex = draftTags.indexOf(currentName);
                    if (draftIndex !== -1) {
                        draftTags[draftIndex] = newName;
                        updateDraftTextarea();
                    }

                    // 3. 更新黑白名单（可选，但名单库打开时会重新加载，因此不需要立即更新界面）
                    // 但如果有打开的名单库抽屉，可以刷新，但非必需。
                } else {
                    const err = await res.json();
                    showToast('更新失败: ' + (err.detail || ''));
                }
            } catch (e) {
                showToast('网络错误');
            }
        });

        // 回车保存
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') saveBtn.click();
        });
    }).catch(() => showToast('获取名单状态失败'));
}


// ---------- 暴露全局 ----------
window.loadTagCloud = loadTagCloud;
window.renderTagCloud = renderTagCloud;
window.renderTagPagination = renderTagPagination;
window.deleteTag = deleteTag;
window.showEditTagPopup = showEditTagPopup;