/**
 * login.js — CES
 * Xử lý logic đăng nhập và đăng ký tài khoản
 */

const API_BASE = window.location.hostname === 'localhost'
    ? 'http://localhost:5000'
    : 'https://nt208uit.shop';


// Tham chiếu DOM (Document Object Model)
const tabLogin    = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const toggleLink  = document.getElementById('toggle-mode');
const confirmGrp  = document.getElementById('confirm-group');
const confirmInp  = document.getElementById('confirm-password');
const submitBtn   = document.getElementById('submit-btn');
const alertBox    = document.getElementById('alert-box');


// Trạng thái: true = đang ở mode đăng nhập
let isLogin = true;


// Helpers hiển thị / ẩn thông báo
function showAlert(msg, type = 'danger') {
    alertBox.className = `alert alert-${type} py-2 px-3`;
    alertBox.style.display = 'block';
    alertBox.innerHTML = msg;
}

function hideAlert() {
    alertBox.style.display = 'none';
}


// Chuyển đổi giữa chế độ Đăng nhập / Đăng ký
function switchMode(login) {
    isLogin = login;
    hideAlert();

    tabLogin.classList.toggle('active', login);
    tabRegister.classList.toggle('active', !login);

    confirmGrp.style.display = login ? 'none' : 'block';
    confirmInp.required = !login;

    submitBtn.innerHTML = login
        ? '<i class="bi bi-box-arrow-in-right me-1"></i>Vào Trình Soạn Thảo'
        : '<i class="bi bi-person-plus me-1"></i>Tạo Tài Khoản';

    document.getElementById('password').autocomplete = login
        ? 'current-password'
        : 'new-password';
}


// Sự kiện chuyển tab / toggle link
tabLogin.onclick    = () => switchMode(true);
tabRegister.onclick = () => switchMode(false);
toggleLink.onclick  = (e) => { e.preventDefault(); switchMode(!isLogin); };


// Xử lý submit form
document.getElementById('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();

    const email    = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const confirm  = confirmInp.value;

    // Validate phía client
    if (!isLogin && password !== confirm) {
        showAlert('Mật khẩu nhập lại không khớp.');
        return;
    }
    if (!isLogin && password.length < 6) {
        showAlert('Mật khẩu phải có ít nhất 6 ký tự.');
        return;
    }

    // Hiển thị trạng thái loading
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Đang xử lý...';

    try {
        const endpoint = isLogin ? '/auth/login' : '/auth/register';
        const response = await fetch(`${API_BASE}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await response.json();

        if (response.ok) {
            if (isLogin) {
                // Lưu token và chuyển sang trang chính
                localStorage.setItem('ces_token', data.token);
                localStorage.setItem('ces_email', email);
                window.location.href = 'index.html';
            } else {
                // Đăng ký thành công → về tab đăng nhập
                switchMode(true);
                document.getElementById('password').value = '';
                showAlert('<i class="bi bi-check-circle me-1"></i>Đăng ký thành công! Hãy đăng nhập.', 'success');
            }
        } else {
            showAlert(data.error || data.message || 'Đã có lỗi xảy ra.');
        }
    } catch {
        showAlert('<i class="bi bi-wifi-off me-1"></i>Không thể kết nối đến server!');
    } finally {
        // Khôi phục nút submit
        submitBtn.disabled = false;
        submitBtn.innerHTML = isLogin
            ? '<i class="bi bi-box-arrow-in-right me-1"></i>Vào Trình Soạn Thảo'
            : '<i class="bi bi-person-plus me-1"></i>Tạo Tài Khoản';
    }
});