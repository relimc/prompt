// ---------- 大模型列表 ----------
async function handleModels(cardId) {
    try {
        const res = await fetch(`/api/cards/${cardId}`);
        if (!res.ok) throw new Error('获取卡片失败');
        const card = await res.json();
        let models = card.models ? JSON.parse(card.models) : [];
        if (!models || models.length === 0) {
            window.showToast('该卡片暂无模型信息');
            return;
        }

        // 规范化数据（确保纯文件名）
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
                if (!window.token) {
                    window.showToast('请先登录');
                    return;
                }
                const formData = new FormData();
                formData.append('model_name', modelName);
                try {
                    const res = await fetch(`/api/cards/${cardId}/models`, {
                        method: 'DELETE',
                        headers: { 'Authorization': `Bearer ${window.token}` },
                        body: formData
                    });
                    if (res.ok) {
                        window.showToast('删除成功');
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
                        window.showToast('删除失败: ' + (err.detail || ''));
                    }
                } catch (e) {
                    window.showToast('网络错误');
                }
            });

            // 确定
            popup.querySelector('.btn-popup-save').addEventListener('click', async function() {
                const newLink = linkInput.value.trim();
                if (!newLink) {
                    window.showToast('请输入链接');
                    return;
                }
                if (!window.token) {
                    window.showToast('请先登录');
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

                    window.showToast('更新成功');
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
                    window.showToast('更新失败: ' + e.message);
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
                        window.showToast('类型更新成功');
                        tag.textContent = newType;
                        typeMap[modelName] = newType;
                        popup.remove();
                    } else {
                        window.showToast('类型更新失败');
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
        window.showToast('获取模型信息失败');
        console.error(e);
    }
}

// 暴露全局
window.handleModels = handleModels;