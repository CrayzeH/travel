(function () {
    const API_URL = '/api';

    function getToken() {
        return localStorage.getItem('token');
    }

    function getSavedUser() {
        try {
            return JSON.parse(localStorage.getItem('user') || 'null');
        } catch (error) {
            return null;
        }
    }

    function showLoginLink(profileLink) {
        profileLink.classList.remove('profile-avatar-link');
        profileLink.textContent = 'ПРОФИЛЬ';
        profileLink.href = 'login.html';
        profileLink.removeAttribute('aria-label');
    }

    function showAvatarLink(profileLink, user) {
        const avatar = user?.avatar_url || 'img/avatar-placeholder.png';
        profileLink.href = 'profile.html';
        profileLink.classList.add('profile-avatar-link');
        profileLink.setAttribute('aria-label', 'Открыть профиль');
        profileLink.innerHTML = `<img src="${avatar}" alt="Профиль">`;
    }

    async function initProfileLink() {
        const profileLink = document.getElementById('profileLink');
        if (!profileLink) return;

        const token = getToken();
        if (!token) {
            showLoginLink(profileLink);
            return;
        }

        const savedUser = getSavedUser();
        if (savedUser) {
            showAvatarLink(profileLink, savedUser);
        } else {
            showAvatarLink(profileLink, {});
        }

        try {
            const response = await fetch(`${API_URL}/users/profile`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await response.json();

            if (!response.ok || !data.user) {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                showLoginLink(profileLink);
                return;
            }

            localStorage.setItem('user', JSON.stringify(data.user));
            showAvatarLink(profileLink, data.user);
        } catch (error) {
            if (!savedUser) showAvatarLink(profileLink, {});
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initProfileLink);
    } else {
        initProfileLink();
    }
})();
