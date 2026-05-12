/**
 * app.js — CES Collaborative Editor
 * Logic chính: auth, document list, Yjs editor, socket, bạn bè
 *
 * Yêu cầu: file này được load dưới dạng ES Module (type="module")
 * Các thư viện cần load trước: bootstrap.bundle.min.js, socket.io
 */

import * as Y from 'https://esm.sh/yjs@13.6.15';
import { QuillBinding } from 'https://esm.sh/y-quill@0.1.5?deps=yjs@13.6.15';
import Quill from 'https://esm.sh/quill@1.3.7';

const API_BASE = 'http://localhost:5000';


// 1. AUTH & THÔNG TIN NGƯỜI DÙNG
const token     = localStorage.getItem('ces_token');
const userEmail = localStorage.getItem('ces_email');

if (!token) {
    window.location.href = 'login.html';
}

const myUserId = token
    ? JSON.parse(atob(token.split('.')[1])).userId
    : null;

// Lấy document ID từ URL (phải là UUID hợp lệ)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const rawDocId   = new URLSearchParams(window.location.search).get('id');
const docId      = (rawDocId && UUID_REGEX.test(rawDocId)) ? rawDocId : null;
if (rawDocId && !docId) window.location.search = '';


// 2. UTILS DÙNG CHUNG
/** Hiện toast thông báo */
function showToast(msg, isError = false) {
    const el = document.getElementById('ces-toast');
    el.textContent = msg;
    el.className = `ces-toast ${isError ? 'err' : 'ok'} show`;
    clearTimeout(window._tt);
    window._tt = setTimeout(() => el.classList.remove('show'), 3200);
}

/** Fetch API với Bearer token, tự redirect khi 401 */
async function apiFetch(url, opts = {}) {
    const res = await fetch(`${API_BASE}${url}`, {
        ...opts,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...(opts.headers || {})
        }
    });
    if (res.status === 401) {
        localStorage.clear();
        window.location.href = 'login.html';
    }
    return res;
}

/** Cập nhật thanh trạng thái phía dưới */
function setStatus(msg, icon = 'bi-check2-circle') {
    document.getElementById('save-status').innerHTML =
        `<i class="bi ${icon} me-1"></i>${msg}`;
}


// 3. DANH SÁCH TÀI LIỆU
async function loadDocumentList() {
    try {
        const res  = await apiFetch('/api/documents');
        if (!res.ok) return;
        const docs = await res.json();
        const ul   = document.getElementById('doc-list');

        if (!docs.length) {
            ul.innerHTML = `<li class="friend-empty ps-1 pt-2">Chưa có tài liệu nào</li>`;
            return;
        }

        ul.innerHTML = docs.map(doc => {
            const isOwner  = doc.owner_id === myUserId;
            const isActive = doc.id === docId;
            return `
            <li class="doc-item${isActive ? ' active' : ''}" data-doc-id="${doc.id}">
                <div class="doc-item-row">
                    <i class="bi bi-file-earmark-text text-primary" style="font-size:14px;flex-shrink:0;"></i>
                    <span class="doc-item-name">${doc.title || 'Tài liệu không tên'}</span>
                    <span class="doc-item-badge ${isOwner
                        ? 'bg-success-subtle text-success'
                        : 'bg-primary-subtle text-primary'}">
                        ${isOwner ? 'Owner' : 'Shared'}
                    </span>
                    <div class="doc-item-actions">
                        ${isOwner
                            ? `<button onclick="event.stopPropagation();startRename('${doc.id}',this)"
                                    data-title="${doc.title||''}" title="Đổi tên">
                                    <i class="bi bi-pencil"></i></button>
                               <button data-action="leave-doc" data-doc-id="${doc.id}"
                                    title="Xóa tài liệu" style="color:#dc3545;">
                                    <i class="bi bi-trash"></i></button>`
                            : `<button data-action="leave-doc" data-doc-id="${doc.id}"
                                    title="Rời tài liệu" style="color:#dc3545;">
                                    <i class="bi bi-box-arrow-right"></i></button>`
                        }
                    </div>
                </div>
                ${isOwner ? `
                <div class="doc-invite-code">
                    <i class="bi bi-key text-secondary" style="font-size:11px;"></i>
                    <span class="invite-code-text">${doc.invite_code || '---'}</span>
                    <button onclick="event.stopPropagation();copyCode('${doc.invite_code}')"
                        class="btn btn-link btn-sm p-0" style="font-size:11px;" title="Sao chép">
                        <i class="bi bi-clipboard"></i></button>
                </div>` : ''}
            </li>`;
        }).join('');
    } catch (e) { console.error(e); }
}

// Xử lý click trên doc-list (rời tài liệu / mở tài liệu)
document.getElementById('doc-list').addEventListener('click', async (e) => {
    const leaveBtn = e.target.closest('[data-action="leave-doc"]');
    if (leaveBtn) {
        e.stopPropagation();
        const id = leaveBtn.dataset.docId;
        if (!confirm('Rời tài liệu này? Bạn sẽ mất quyền truy cập.')) return;
        const res  = await apiFetch(`/api/documents/${id}/leave`, { method: 'DELETE' });
        const data = await res.json();
        if (res.ok) {
            showToast('Đã rời tài liệu');
            id === docId
                ? (window.location.href = 'index.html')
                : loadDocumentList();
        } else {
            showToast(data.error || 'Không thể rời tài liệu', true);
        }
        return;
    }
    if (e.target.closest('[onclick]')) return;
    const li = e.target.closest('.doc-item[data-doc-id]');
    if (li) window.location.href = `?id=${li.dataset.docId}`;
});

// Đổi tên tài liệu
async function startRename(id, btn) {
    const t = prompt('Nhập tên mới:', btn.getAttribute('data-title'));
    if (!t || t.trim() === btn.getAttribute('data-title')) return;
    const res = await apiFetch(`/api/documents/${id}/rename`, {
        method: 'PATCH',
        body: JSON.stringify({ title: t.trim() })
    });
    const d = await res.json();
    res.ok ? loadDocumentList() : showToast(d.error || 'Lỗi', true);
}

// Sao chép mã mời vào clipboard
function copyCode(code) {
    if (!code || code === 'undefined') return;
    navigator.clipboard.writeText(code)
        .then(() => showToast(`Đã sao chép: ${code}`));
}

// Expose ra window cho các inline onclick trong HTML template
window.startRename = startRename;
window.copyCode    = copyCode;

loadDocumentList();

// 4. QUILL EDITOR (Yjs)
const ydoc    = new Y.Doc();
const ytext   = ydoc.getText('content');
const quill   = new Quill('#editor', {
    theme: 'snow',
    placeholder: 'Bắt đầu soạn thảo cùng đồng nghiệp...'
});
let binding = null;
quill.disable();


// 5. SOCKET.IO
const socket = io(API_BASE, { auth: { token } });

socket.on('connect', () => {
    setStatus('Đã kết nối', 'bi-wifi');
    if (docId) {
        socket.emit('join-document', docId, userEmail);
        quill.enable();
    } else {
        setStatus('Chọn hoặc tạo tài liệu', 'bi-arrow-left-circle');
    }
    loadFriendList();
    loadPendingRequests();
});

socket.on('disconnect',    () => { setStatus('Mất kết nối...', 'bi-wifi-off'); quill.disable(); });
socket.on('connect_error', (e) => {
    if (e.message === 'Unauthorized') {
        localStorage.clear();
        window.location.href = 'login.html';
    }
    setStatus('Lỗi kết nối', 'bi-exclamation-circle');
});


// 6. ĐỒNG BỘ YJS QUA SOCKET
ydoc.on('update', (u, origin) => {
    if (origin !== socket && docId) {
        socket.emit('yjs-update', docId, Array.from(u));
        setStatus('Đang lưu...', 'bi-arrow-repeat');
    }
});

socket.on('yjs-update', (u) => Y.applyUpdate(ydoc, new Uint8Array(u), socket));

socket.on('load-document', (c) => {
    try {
        if (c?.length) Y.applyUpdate(ydoc, new Uint8Array(c));
        if (!binding) binding = new QuillBinding(ytext, quill);
        setStatus('Đã tải tài liệu', 'bi-check2-circle');
    } catch (e) { console.error(e); }
});

// Debounce hiển thị "Đã lưu"
let saveTimer;
ydoc.on('update', (u, origin) => {
    if (origin !== socket) {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => setStatus('Đã lưu', 'bi-check-all'), 2500);
    }
});


// 7. DANH SÁCH NGƯỜI DÙNG ONLINE
socket.on('update-users', (users) => {
    document.getElementById('user-list').innerHTML = users.map(e =>
        `<div class="online-user-item">
            <span class="online-dot"></span>
            <span>${e === userEmail ? `<strong>${e} (Bạn)</strong>` : e}</span>
         </div>`
    ).join('') || `<span class="friend-empty">Không có ai</span>`;
});


// 8. HỆ THỐNG BẠN BÈ
// Socket events
socket.on('friend:request',  ({ senderEmail })   => { showToast(`${senderEmail} muốn kết bạn!`); loadPendingRequests(); });
socket.on('friend:accepted', ({ accepterEmail }) => { showToast(`${accepterEmail} đã chấp nhận!`); loadFriendList(); });
socket.on('friend:presence', ({ userId, isOnline }) => {
    document.querySelectorAll(`.friend-status[data-uid="${userId}"]`).forEach(el => {
        el.textContent = isOnline ? '● Online' : '○ Offline';
        el.className   = `friend-status ${isOnline ? 'status-online' : 'status-offline'}`;
    });
    loadFriendList();
});

// Tìm kiếm người dùng
document.getElementById('btn-friend-search').onclick = searchUsers;
document.getElementById('friend-search-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') searchUsers();
});

async function searchUsers() {
    const q  = document.getElementById('friend-search-input').value.trim();
    const ul = document.getElementById('search-results');
    if (!q) { ul.innerHTML = ''; return; }

    const res = await apiFetch(`/api/users/search?q=${encodeURIComponent(q)}`);
    if (!res.ok) { const d = await res.json(); showToast(d.error || 'Lỗi', true); return; }

    const users = await res.json();
    ul.innerHTML = '';
    if (!users.length) { ul.innerHTML = `<li class="friend-empty">Không tìm thấy</li>`; return; }

    users.forEach(u => {
        let action;
        if (u.friendship_status === 'accepted')
            action = `<span class="friend-tag tag-friend">Bạn bè</span>`;
        else if (u.friendship_status === 'pending' && u.requester_id === myUserId)
            action = `<span class="friend-tag tag-sent">Đã gửi</span>`;
        else if (u.friendship_status === 'pending' && u.requester_id !== myUserId)
            action = `<button class="btn-fa-accept" onclick="acceptFriend(${u.friendship_id},this)">✓</button>`;
        else
            action = `<button class="btn-fa-add" onclick="sendFriendRequest('${u.id}',this)">+ Kết bạn</button>`;

        const li = document.createElement('li');
        li.className = 'friend-item';
        li.innerHTML = `
            <div class="friend-avatar">${u.email[0].toUpperCase()}</div>
            <div class="friend-info"><span class="friend-email" title="${u.email}">${u.email}</span></div>
            <div class="friend-actions">${action}</div>`;
        ul.appendChild(li);
    });
}

// Gửi lời mời kết bạn
window.sendFriendRequest = async (receiverId, btn) => {
    btn.disabled = true; btn.textContent = '…';
    const res = await apiFetch('/api/friends/request', {
        method: 'POST',
        body: JSON.stringify({ receiverId })
    });
    const d = await res.json();
    if (res.ok) {
        btn.textContent = 'Đã gửi';
        btn.className   = 'friend-tag tag-sent';
        showToast('✉️ Đã gửi lời mời!');
    } else {
        btn.disabled    = false;
        btn.textContent = '+ Kết bạn';
        showToast(d.error || 'Lỗi', true);
    }
};

// Chấp nhận lời mời kết bạn
window.acceptFriend = async (id, btn) => {
    btn.disabled = true;
    const res = await apiFetch(`/api/friends/${id}/accept`, { method: 'PATCH' });
    if (res.ok) {
        showToast('🎉 Đã kết bạn!');
        loadPendingRequests();
        loadFriendList();
        document.getElementById('search-results').innerHTML = '';
        document.getElementById('friend-search-input').value = '';
    } else {
        btn.disabled = false;
        showToast('Lỗi', true);
    }
};

// Từ chối lời mời
window.declineFriend = async (id, li) => {
    const res = await apiFetch(`/api/friends/${id}/decline`, { method: 'PATCH' });
    if (res.ok) { li.remove(); loadPendingRequests(); }
};

// Tải danh sách lời mời đang chờ
async function loadPendingRequests() {
    const res = await apiFetch('/api/friends/pending');
    if (!res.ok) return;
    const p     = await res.json();
    const badge = document.getElementById('pending-badge');
    const label = document.getElementById('pending-label');

    badge.textContent = p.length;
    badge.classList.toggle('hidden', p.length === 0);
    label.style.display = p.length ? 'block' : 'none';

    const ul = document.getElementById('pending-list');
    ul.innerHTML = '';
    p.forEach(x => {
        const li = document.createElement('li');
        li.className = 'friend-item';
        li.innerHTML = `
            <div class="friend-avatar">${x.requester_email[0].toUpperCase()}</div>
            <div class="friend-info"><span class="friend-email">${x.requester_email}</span></div>
            <div class="friend-actions">
                <button class="btn-fa-accept"  onclick="acceptFriend(${x.friendship_id},this)">✓</button>
                <button class="btn-fa-decline" onclick="declineFriend(${x.friendship_id},this.closest('li'))">✕</button>
            </div>`;
        ul.appendChild(li);
    });
}

// Tải danh sách bạn bè
async function loadFriendList() {
    const res = await apiFetch('/api/friends');
    if (!res.ok) return;
    const friends = await res.json();
    const ul      = document.getElementById('friend-list');
    ul.innerHTML  = '';

    if (!friends.length) {
        ul.innerHTML = `<li class="friend-empty">Chưa có bạn bè nào</li>`;
        return;
    }

    friends.forEach(f => {
        const invBtn = (f.is_online && docId)
            ? `<button class="btn-fa-invite" data-action="invite-to-doc" data-friend-id="${f.friend_id}" title="Mời vào tài liệu">
                   <i class="bi bi-envelope-plus"></i></button>`
            : '';
        const li = document.createElement('li');
        li.className   = 'friend-item';
        li.dataset.friendId = f.friend_id;
        li.innerHTML   = `
            <div class="friend-avatar">${f.friend_email[0].toUpperCase()}</div>
            <div class="friend-info">
                <span class="friend-email" title="${f.friend_email}">${f.friend_email}</span>
                <span class="friend-status ${f.is_online ? 'status-online' : 'status-offline'}" data-uid="${f.friend_id}">
                    ${f.is_online ? '● Online' : '○ Offline'}
                </span>
            </div>
            <div class="friend-actions">
                ${invBtn}
                <button class="btn-fa-unfriend" data-action="unfriend" data-friendship-id="${f.friendship_id}" title="Hủy kết bạn">
                    <i class="bi bi-x-lg"></i></button>
            </div>`;
        ul.appendChild(li);
    });
}

// Xử lý click trên friend-list (mời vào doc / hủy kết bạn)
document.getElementById('friend-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    if (btn.dataset.action === 'invite-to-doc') {
        const friendId = btn.dataset.friendId;
        if (!docId) { showToast('Bạn chưa mở tài liệu nào', true); return; }
        btn.disabled = true;
        btn.innerHTML = '<i class="bi bi-hourglass-split"></i>';
        socket.emit('doc:invite-friend', { docId, friendId });
        setTimeout(() => {
            btn.disabled  = false;
            btn.innerHTML = '<i class="bi bi-envelope-plus"></i>';
        }, 3000);
    }

    if (btn.dataset.action === 'unfriend') {
        const li = btn.closest('li');
        if (!confirm('Hủy kết bạn?')) return;
        const res = await apiFetch(`/api/friends/${btn.dataset.friendshipId}`, { method: 'DELETE' });
        if (res.ok) { li.remove(); showToast('Đã hủy kết bạn'); }
    }
});


// 9. MỜI VÀO TÀI LIỆU QUA SOCKET
socket.on('doc:invite-sent',     ({ docTitle })                    => {
    showToast(`📨 Đã gửi lời mời vào "${docTitle}"`);
    document.querySelectorAll('[data-action="invite-to-doc"]').forEach(b => {
        b.disabled = false;
        b.innerHTML = '<i class="bi bi-envelope-plus"></i>';
    });
});
socket.on('doc:invite-error',    (msg)                              => {
    showToast(msg, true);
    document.querySelectorAll('[data-action="invite-to-doc"]').forEach(b => {
        b.disabled = false;
        b.innerHTML = '<i class="bi bi-envelope-plus"></i>';
    });
});
socket.on('doc:invite-accepted', ({ accepterEmail })               => showToast(`${accepterEmail} đã tham gia!`));
socket.on('doc:invite-received', ({ docId: id, docTitle, inviterEmail, inviterId }) =>
    showDocInvitePopup({ docId: id, docTitle, inviterEmail, inviterId })
);
socket.on('doc:invite-join',     ({ docId: id })                   => { window.location.href = `?id=${id}`; });

function showDocInvitePopup({ docId: invDocId, docTitle, inviterEmail, inviterId }) {
    document.getElementById('doc-invite-popup')?.remove();

    const popup = document.createElement('div');
    popup.id        = 'doc-invite-popup';
    popup.className = 'doc-invite-popup';
    popup.innerHTML = `
        <div class="doc-invite-card">
            <div class="d-flex align-items-center gap-2 mb-2">
                <i class="bi bi-envelope-open-fill text-primary fs-5"></i>
                <strong style="font-size:13px;">Lời mời cộng tác</strong>
            </div>
            <p style="font-size:12px;color:#495057;margin-bottom:12px;">
                <strong>${inviterEmail}</strong> mời bạn vào:<br>
                <em class="text-primary">"${docTitle}"</em>
            </p>
            <div class="d-flex gap-2">
                <button id="doc-invite-accept"  class="btn btn-success btn-sm flex-fill">
                    <i class="bi bi-check-lg me-1"></i>Tham gia</button>
                <button id="doc-invite-decline" class="btn btn-outline-secondary btn-sm flex-fill">Từ chối</button>
            </div>
        </div>`;

    document.body.appendChild(popup);
    document.getElementById('doc-invite-accept').onclick  = () => {
        socket.emit('doc:invite-accept', { docId: invDocId, inviterId });
        popup.remove();
    };
    document.getElementById('doc-invite-decline').onclick = () => popup.remove();
    setTimeout(() => popup.remove(), 30000);
}


// 10. CHUYỂN ĐỔI TABS PHẢI (Online / Bạn bè)
document.querySelectorAll('.rp-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.rp-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const target = tab.dataset.tab;
        document.getElementById('tab-online').classList.toggle('hidden',   target !== 'online');
        document.getElementById('tab-friends').classList.toggle('hidden',  target !== 'friends');
        if (target === 'friends') { loadFriendList(); loadPendingRequests(); }
    });
});


// 11. CÁC NÚT HEADER
// Tạo tài liệu mới
document.getElementById('btn-create-doc').onclick = async () => {
    const title = prompt('Đặt tên tài liệu mới:', 'Tài liệu mới');
    if (title === null) return;
    const res = await apiFetch('/api/documents', {
        method: 'POST',
        body: JSON.stringify({ title: title.trim() || 'Tài liệu mới' })
    });
    const doc = await res.json();
    if (!res.ok) { showToast(doc.error || 'Lỗi', true); return; }
    alert(`Tạo thành công!\nMã mời: ${doc.invite_code}`);
    window.location.search = `?id=${doc.id}`;
};

// Tham gia tài liệu bằng mã mời
document.getElementById('btn-join-doc').onclick = async () => {
    const code = prompt('Nhập mã mời:');
    if (!code?.trim()) return;
    const res  = await apiFetch('/api/documents/join', {
        method: 'POST',
        body: JSON.stringify({ inviteCode: code.trim() })
    });
    const data = await res.json();
    res.ok
        ? (window.location.search = `?id=${data.id}`)
        : showToast(data.error || 'Mã không hợp lệ', true);
};


// 12. HEADER - hiển thị email + nút đăng xuất
document.getElementById('auth-section').innerHTML = `
    <div class="d-flex align-items-center gap-2">
        <span class="badge bg-secondary" style="font-size:11px;font-weight:500;">
            <i class="bi bi-person-fill me-1"></i>${userEmail || ''}
        </span>
        <button id="btn-logout" class="btn btn-sm btn-outline-danger">
            <i class="bi bi-box-arrow-right me-1"></i>Thoát
        </button>
    </div>`;

document.getElementById('btn-logout').onclick = () => {
    localStorage.clear();
    window.location.href = 'login.html';
};