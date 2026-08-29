function openLoginModal(action) {
    pendingAction = action || null;
    const modal = document.getElementById('loginModal');
    const error = document.getElementById('loginError');
    const username = document.getElementById('loginUsername');
    const password = document.getElementById('loginPassword');
    modal.style.display = 'flex';
    error.textContent = '';
    username.value = '';
    password.value = '';
    username.focus();
}

function closeLoginModal() {
    document.getElementById('loginModal').style.display = 'none';
    pendingAction = null;
}

function initAuth() {
    const cancelBtn = document.getElementById('loginCancelBtn');
    const modal = document.getElementById('loginModal');
    const confirmBtn = document.getElementById('loginConfirmBtn');
    const password = document.getElementById('loginPassword');

    if (cancelBtn) cancelBtn.addEventListener('click', closeLoginModal);
    if (modal) modal.addEventListener('click', function(e) { if (e.target === this) closeLoginModal(); });
    if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
            const username = document.getElementById('loginUsername').value.trim();
            const password = document.getElementById('loginPassword').value.trim();
            if (!username || !password) {
                document.getElementById('loginError').textContent = '请输入用户名和密码';
                return;
            }
            try {
                const formData = new FormData();
                formData.append('username', username);
                formData.append('password', password);
                const res = await fetch('/api/login', { method: 'POST', body: formData });
                if (res.ok) {
                    const data = await res.json();
                    token = data.access_token;
                    localStorage.setItem('token', token);
                    modal.style.display = 'none';
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
                    document.getElementById('loginError').textContent = err.detail || '登录失败';
                }
            } catch (e) {
                document.getElementById('loginError').textContent = '网络错误';
            }
        });
    }
    if (password) password.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmBtn.click(); });
}

window.openLoginModal = openLoginModal;
window.closeLoginModal = closeLoginModal;
window.initAuth = initAuth;