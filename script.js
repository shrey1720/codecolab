const API_BASE_URL =
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 'http://localhost:8080/api'
        : 'https://ajt-be-3.onrender.com/api';

// State Management
let currentUser = JSON.parse(localStorage.getItem('user'));
let authToken = localStorage.getItem('token');
let refreshToken = localStorage.getItem('refreshToken');
let currentFilter = 'home';
let notificationStream = null;
let notifications = [];
let unreadNotificationCount = 0;
let currentQuestion = null;
/** @type {Set<number>} */
let myQuestionUpvotes = new Set();
/** @type {Set<number>} */
let myAnswerUpvotes = new Set();

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    loadOAuthPayloadFromUrl();
    updateAuthUI();
    initNotificationStream();
    if (window.location.pathname.endsWith('index.html') || window.location.pathname === '/' || window.location.pathname.endsWith('/')) {
        fetchQuestions();
        fetchTopContributors();
    }
});

function loadOAuthPayloadFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const payload = params.get('payload');
    if (!payload) return;

    try {
        const auth = JSON.parse(decodeURIComponent(payload));
        if (auth.token) {
            authToken = auth.token;
            refreshToken = auth.refreshToken;
            currentUser = auth.user;
            localStorage.setItem('token', authToken);
            localStorage.setItem('refreshToken', refreshToken);
            localStorage.setItem('user', JSON.stringify(currentUser));
            updateAuthUI();
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    } catch (err) {
        console.error('Failed to parse OAuth payload', err);
    }
}

async function fetchWithAuth(url, options = {}) {
    const merged = {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {}),
            ...getAuthHeaders()
        }
    };

    let response = await fetch(url, merged);
    if (response.status === 401 && refreshToken) {
        const refreshed = await refreshAuthToken();
        if (refreshed) {
            merged.headers = { ...merged.headers, ...getAuthHeaders() };
            response = await fetch(url, merged);
        }
    }
    return response;
}

async function refreshAuthToken() {
    if (!refreshToken) return false;
    try {
        const response = await fetch(`${API_BASE_URL}/refresh-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken })
        });
        if (!response.ok) {
            logout();
            return false;
        }
        const data = await response.json();
        authToken = data.token;
        refreshToken = data.refreshToken;
        currentUser = data.user;
        localStorage.setItem('token', authToken);
        localStorage.setItem('refreshToken', refreshToken);
        localStorage.setItem('user', JSON.stringify(currentUser));
        updateAuthUI();
        return true;
    } catch (err) {
        console.error('Refresh token failed', err);
        logout();
        return false;
    }
}

function initNotificationStream() {
    createNotificationPanel();
    if (!currentUser || !window.EventSource) return;
    try {
        notificationStream = new EventSource(`${API_BASE_URL}/notifications/stream`);
        notificationStream.onmessage = (event) => {
            const payload = JSON.parse(event.data);
            if (payload.type && payload.message) {
                addNotification(payload);
            }
        };
        notificationStream.onerror = () => {
            console.warn('Notification stream disconnected, retrying...');
            if (notificationStream) {
                notificationStream.close();
                setTimeout(initNotificationStream, 3000);
            }
        };
    } catch (err) {
        console.error('Failed to open notification stream', err);
    }
}

function createNotificationPanel() {
    const header = document.querySelector('.header-row');
    if (!header || document.getElementById('notificationToggle')) return;

    const notificationContainer = document.createElement('div');
    notificationContainer.className = 'notification-container';
    notificationContainer.innerHTML = `
        <button id="notificationToggle" class="notification-button" onclick="toggleNotificationPanel()">
            <i class="fas fa-bell"></i>
            <span id="notificationBadge" class="notification-badge" style="display:none;">0</span>
        </button>
        <div id="notificationPanel" class="notification-panel" style="display:none;"></div>
    `;
    header.insertBefore(notificationContainer, header.firstChild);
}

function toggleNotificationPanel() {
    const panel = document.getElementById('notificationPanel');
    if (!panel) return;
    panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
    if (panel.style.display === 'block') {
        unreadNotificationCount = 0;
        renderNotificationBadge();
    }
}

function addNotification(payload) {
    notifications.unshift(payload);
    if (notifications.length > 20) notifications.pop();
    unreadNotificationCount += 1;
    renderNotificationBadge();
    renderNotificationPanel();
    toast(payload.message);
}

function renderNotificationBadge() {
    const badge = document.getElementById('notificationBadge');
    if (!badge) return;
    if (unreadNotificationCount > 0) {
        badge.style.display = 'block';
        badge.textContent = unreadNotificationCount > 9 ? '9+' : String(unreadNotificationCount);
    } else {
        badge.style.display = 'none';
    }
}

function renderNotificationPanel() {
    const panel = document.getElementById('notificationPanel');
    if (!panel) return;
    if (notifications.length === 0) {
        panel.innerHTML = '<div class="notification-empty">No notifications yet.</div>';
        return;
    }
    panel.innerHTML = notifications.map(n => `
        <div class="notification-item">
            <div class="notification-type">${escapeHtml(n.type || 'update')}</div>
            <div class="notification-message">${escapeHtml(n.message)}</div>
            <div class="notification-meta">${new Date(n.timestamp).toLocaleTimeString()}</div>
        </div>
    `).join('');
}

function toast(message) {
    const toastEl = document.createElement('div');
    toastEl.className = 'toast-message';
    toastEl.innerText = message;
    document.body.appendChild(toastEl);
    setTimeout(() => toastEl.remove(), 3000);
}

function updateAuthUI() {
    const authLink = document.getElementById('authLink');
    const logoutBtn = document.getElementById('logoutBtn');
    const userProfile = document.getElementById('userProfile');
    const welcomeMsg = document.getElementById('welcomeMsg');
    const userRep = document.getElementById('userRep');

    if (currentUser) {
        if (authLink) authLink.style.display = 'none';
        if (logoutBtn) logoutBtn.style.display = 'flex';
        if (userProfile) {
            userProfile.style.display = 'block';
            welcomeMsg.innerText = `Hi, ${currentUser.username}!`;
            userRep.innerText = currentUser.reputation || 0;
        }
    } else {
        if (authLink) authLink.style.display = 'flex';
        if (logoutBtn) logoutBtn.style.display = 'none';
        if (userProfile) userProfile.style.display = 'none';
    }
}

function getAuthHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
    }
    return headers;
}

async function loadMyVotes() {
    myQuestionUpvotes = new Set();
    myAnswerUpvotes = new Set();
    if (!authToken) return;
    try {
        const response = await fetchWithAuth(`${API_BASE_URL}/votes/me`);
        if (!response.ok) return;
        const data = await response.json();
        (data.questionUpvotes || []).forEach((id) => myQuestionUpvotes.add(Number(id)));
        (data.answerUpvotes || []).forEach((id) => myAnswerUpvotes.add(Number(id)));
    } catch (err) {
        console.error(err);
    }
}

function questionVoteChipHtml(q, voted) {
    const cls = `vote-btn vote-btn-inline${voted ? ' voted' : ''}`;
    const title = currentUser ? (voted ? 'Remove your upvote' : 'Upvote') : 'Log in to upvote';
    return `<span class="inline-vote-chip" onclick="event.stopPropagation();" role="group" aria-label="Question score">
        <button type="button" class="${cls}" data-question-vote="${q.id}" title="${title}" onclick="event.stopPropagation(); handleQuestionUpvote(${q.id});"><i class="fas fa-arrow-up" aria-hidden="true"></i></button>
        <span class="vote-count-inline" id="vote-count-q-${q.id}">${q.votes != null ? q.votes : 0}</span>
    </span>`;
}

function answerVoteChipHtml(a, voted) {
    const cls = `vote-btn vote-btn-inline${voted ? ' voted' : ''}`;
    const title = currentUser ? (voted ? 'Remove your upvote' : 'Upvote') : 'Log in to upvote';
    return `<span class="inline-vote-chip" role="group" aria-label="Answer score">
        <button type="button" class="${cls}" data-answer-vote="${a.id}" title="${title}" onclick="handleAnswerUpvote(${a.id});"><i class="fas fa-arrow-up" aria-hidden="true"></i></button>
        <span class="vote-count-inline" id="vote-count-a-${a.id}">${a.votes != null ? a.votes : 0}</span>
    </span>`;
}

function handleQuestionUpvote(questionId) {
    if (!currentUser) return alert('Login required to vote');
    if (!authToken) return alert('Session expired — please log in again');
    vote(questionId, 'question', 1);
}

function handleAnswerUpvote(answerId) {
    if (!currentUser) return alert('Login required to vote');
    if (!authToken) return alert('Session expired — please log in again');
    vote(answerId, 'answer', 1);
}

// --- Question Management ---

async function fetchQuestions(filter = '') {
    const list = document.getElementById('questionsList');
    const title = document.getElementById('feedTitle');

    // Update active UI state
    document.querySelectorAll('.sidebar nav a').forEach(a => a.classList.remove('active'));
    if (filter) {
        const activeLink = document.querySelector(`a[onclick*="'${filter}'"]`);
        if (activeLink) activeLink.classList.add('active');
        title.innerText = filter.charAt(0).toUpperCase() + filter.slice(1) + " Feed";
    } else {
        document.querySelector('a[onclick*="fetchQuestions()"]').classList.add('active');
        title.innerText = "Recent Questions";
    }

    currentFilter = filter === '' ? 'home' : filter;
    try {
        const response = await fetch(`${API_BASE_URL}/questions${filter ? '?filter=' + filter : ''}`);
        const data = await response.json();
        await loadMyVotes();
        renderQuestions(data);
    } catch (err) {
        console.error("Failed to fetch questions", err);
        list.innerHTML = `<div class="card">Error loading feed. Is the backend running?</div>`;
    }
}

function renderQuestions(questions) {
    const list = document.getElementById('questionsList');
    list.innerHTML = '';

    if (questions.length === 0) {
        list.innerHTML = '<div class="card">No questions found in this category. Be the first to ask!</div>';
        return;
    }

    questions.forEach(q => {
        const card = document.createElement('div');
        card.className = 'card feed-question-card';
        card.onclick = () => { window.location.href = `question.html?id=${q.id}`; };

        const tagsHtml = q.tags ? q.tags.split(',').map(t => `<span class="tag">${t.trim()}</span>`).join('') : '';
        const bountyBadge = q.bounty > 0 ? `<span class="bounty-tag"><i class="fas fa-coins"></i> ${q.bounty} Rep</span>` : '';
        const desc = q.description || '';
        const descPreview = desc.length > 150 ? desc.substring(0, 150) + '...' : desc;
        const qid = Number(q.id);
        const voted = currentUser && myQuestionUpvotes.has(qid);

        card.innerHTML = `
            <div class="card-header">
                ${bountyBadge}
                <div class="card-meta card-meta-top">
                    <span><i class="far fa-user"></i> ${escapeHtml(q.username)}</span>
                    <span class="meta-dateline">
                        <span class="meta-date"><i class="far fa-calendar"></i> ${new Date(q.createdAt).toLocaleDateString()}</span>
                        ${questionVoteChipHtml(q, voted)}
                    </span>
                </div>
            </div>
            <h2>${escapeHtml(q.title)}</h2>
            <p>${escapeHtml(descPreview)}</p>
            <div class="card-footer-tags">
                <div class="tags">${tagsHtml}</div>
            </div>
        `;
        list.appendChild(card);
    });
}

// --- Question Detail & Discussion ---

async function loadQuestionDetails(id) {
    try {
        await loadMyVotes();
        const response = await fetch(`${API_BASE_URL}/question/${id}`);
        const q = await response.json();
        currentQuestion = q;

        const detail = document.getElementById('questionDetail');
        const tagsHtml = q.tags ? q.tags.split(',').map(t => `<span class="tag">${t.trim()}</span>`).join('') : '';
        const codeHtml = q.code ? `<div class="code-block"><pre><code>${escapeHtml(q.code)}</code></pre></div>` : '';
        const qid = Number(q.id);
        const votedQ = currentUser && myQuestionUpvotes.has(qid);
        const acceptedLabel = q.acceptedAnswerId ? `<span class="accepted-badge">Accepted answer #${q.acceptedAnswerId}</span>` : '';
        const canAccept = currentUser && currentUser.id === q.userId && q.acceptedAnswerId == null;

        detail.innerHTML = `
            <div class="question-hero">
                <div class="question-meta-bar">
                    <div class="card-meta card-meta-detail">
                        <span>Asked by <strong>${escapeHtml(q.username)}</strong></span>
                        <span class="meta-dateline">
                            <span class="meta-date"><i class="far fa-calendar"></i> ${new Date(q.createdAt).toLocaleString()}</span>
                            ${questionVoteChipHtml(q, votedQ)}
                        </span>
                    </div>
                    <div>
                        ${q.bounty > 0 ? `<span class="bounty-tag">Bounty: ${q.bounty}</span>` : ''}
                        ${acceptedLabel}
                    </div>
                </div>
                <h1 style="font-size:2rem; margin-bottom:1.5rem;">${escapeHtml(q.title)}</h1>
                <p style="font-size:1.1rem; line-height:1.6; color:var(--text-main);">${escapeHtml(q.description || '')}</p>
                ${codeHtml}
                <div class="tags">${tagsHtml}</div>
            </div>
            <div id="questionComments" class="comment-section">
                <!-- Comments load here -->
            </div>
            <div style="margin-top:1rem;">
                <input type="text" id="qCommentInput" class="form-input" style="width: 300px; display:inline-block;" placeholder="Add a comment...">
                <button class="btn-primary" style="padding: 0.5rem 1rem;" onclick="addComment(${q.id}, 'question')">Post</button>
            </div>
        `;

        loadAnswers(id);
        loadComments(id, 'question', 'questionComments');
    } catch (err) {
        console.error(err);
    }
}

async function loadAnswers(qId) {
    const list = document.getElementById('answersList');
    try {
        const response = await fetch(`${API_BASE_URL}/answers/${qId}`);
        const answers = await response.json();
        document.getElementById('answerCount').innerText = `${answers.length} Solutions`;

        list.innerHTML = '';
        await loadMyVotes();
        answers.forEach(a => {
            const aid = Number(a.id);
            const upVoted = currentUser && myAnswerUpvotes.has(aid);
            const card = document.createElement('div');
            card.className = 'card answer-card';
            card.style.cursor = 'default';
            const isAccepted = currentQuestion && currentQuestion.acceptedAnswerId === a.id;
        const canAcceptAnswer = currentQuestion && currentUser && currentQuestion.userId === currentUser.id && !currentQuestion.acceptedAnswerId;
        const canAwardBounty = currentQuestion && currentQuestion.bounty > 0 && currentUser && currentQuestion.userId === currentUser.id && a.userId !== currentUser.id;
        card.innerHTML = `
                <div class="card-meta card-meta-answer">
                    <span>Active Contributor: <strong>${escapeHtml(a.username)}</strong></span>
                    <span class="meta-dateline">
                        <span class="meta-date"><i class="far fa-calendar"></i> ${new Date(a.createdAt).toLocaleDateString()}</span>
                        ${answerVoteChipHtml(a, upVoted)}
                    </span>
                </div>
                <p style="line-height:1.6;">${escapeHtml(a.answerText)}</p>
                ${isAccepted ? '<div class="accepted-badge" style="margin-bottom:0.75rem;">Accepted answer</div>' : ''}
                <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
                    ${canAcceptAnswer ? `<button class="btn-secondary" style="margin-bottom:1rem;" onclick="acceptAnswer(${a.id})">Accept this answer</button>` : ''}
                    ${canAwardBounty ? `<button class="btn-primary" style="margin-bottom:1rem; background:var(--accent-gold); color:#111; font-weight:700;" onclick="awardBounty(${a.id})"><i class="fas fa-coins"></i> Award Bounty (${currentQuestion.bounty} Rep)</button>` : ''}
                </div>
                <div id="ansComments-${a.id}" class="comment-section"></div>
                <div style="margin-top:1rem; margin-left:20px;">
                    <input type="text" id="ansCommentInput-${a.id}" class="form-input" style="width: 250px; font-size:0.8rem;" placeholder="Add a comment...">
                    <button class="btn-primary" style="padding: 0.25rem 0.75rem; font-size:0.8rem;" onclick="addComment(${a.id}, 'answer')">Post</button>
                </div>
            `;
            list.appendChild(card);
            loadComments(a.id, 'answer', `ansComments-${a.id}`);
        });
    } catch (err) { console.error(err); }
}

async function loadComments(id, type, containerId) {
    const container = document.getElementById(containerId);
    try {
        const response = await fetch(`${API_BASE_URL}/comments/${id}?type=${type}`);
        const comments = await response.json();
        container.innerHTML = comments.map(c => `
            <div class="comment">
                ${escapeHtml(c.commentText)} — <span class="comment-meta"><strong>${c.username}</strong> on ${new Date(c.createdAt).toLocaleDateString()}</span>
            </div>
        `).join('');
    } catch (err) { console.error(err); }
}

async function addComment(parentId, type) {
    if (!currentUser) return alert("Login required to comment");

    const inputId = type === 'question' ? 'qCommentInput' : `ansCommentInput-${parentId}`;
    const input = document.getElementById(inputId);
    const text = input.value.trim();
    if (!text) return;

    const body = {
        userId: currentUser.id,
        commentText: text
    };
    if (type === 'question') body.questionId = parentId;
    else body.answerId = parentId;

    try {
        const response = await fetchWithAuth(`${API_BASE_URL}/comment`, {
            method: 'POST',
            body: JSON.stringify(body)
        });
        if (response.ok) {
            input.value = '';
            const containerId = type === 'question' ? 'questionComments' : `ansComments-${parentId}`;
            loadComments(parentId, type, containerId);
        }
    } catch (err) { console.error(err); }
}

// --- Modals & Actions ---

function showAskModal() {
    if (!currentUser) return alert("Login to ask a question");
    document.getElementById('askModal').style.display = 'flex';
}

function closeAskModal() {
    document.getElementById('askModal').style.display = 'none';
}

async function submitQuestion() {
    const title = document.getElementById('qTitle').value;
    const desc = document.getElementById('qDesc').value;
    const code = document.getElementById('qCode').value;
    const tags = document.getElementById('qTags').value;
    const bountyRaw = document.getElementById('qBounty').value;
    const bounty = bountyRaw === '' ? 0 : parseInt(bountyRaw, 10);
    if (Number.isNaN(bounty)) {
        alert('Bounty must be a number');
        return;
    }

    const body = { userId: currentUser.id, title, description: desc, code, tags, bounty };

    try {
        const response = await fetchWithAuth(`${API_BASE_URL}/question`, {
            method: 'POST',
            body: JSON.stringify(body)
        });
        if (response.ok) {
            closeAskModal();
            fetchQuestions();
        }
    } catch (err) { console.error(err); }
}

function showAnswerBox() {
    if (!currentUser) return alert("Login to provide solution");
    document.getElementById('answerModal').style.display = 'flex';
}

function closeAnswerModal() {
    document.getElementById('answerModal').style.display = 'none';
}

async function submitAnswer() {
    const text = document.getElementById('ansText').value;
    const qId = new URLSearchParams(window.location.search).get('id');

    try {
        const response = await fetchWithAuth(`${API_BASE_URL}/answer`, {
            method: 'POST',
            body: JSON.stringify({ userId: currentUser.id, questionId: qId, answerText: text })
        });
        if (response.ok) {
            closeAnswerModal();
            loadAnswers(qId);
        }
    } catch (err) { console.error(err); }
}

async function vote(targetId, type, voteType) {
    if (!currentUser) return alert('Login required to vote');
    if (!authToken) return alert('Session expired — please log in again');

    const body = { userId: currentUser.id, voteType };
    if (type === 'answer') body.answerId = targetId;
    else body.questionId = targetId;

    try {
        const response = await fetchWithAuth(`${API_BASE_URL}/vote`, {
            method: 'POST',
            body: JSON.stringify(body)
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            alert(data.error || 'Vote failed');
            return;
        }
        await loadMyVotes();
        if (type === 'question') {
            if (data.votes !== undefined) {
                const el = document.getElementById(`vote-count-q-${targetId}`);
                if (el) el.textContent = data.votes;
            }
            const up = data.upvoted === true;
            document.querySelectorAll(`[data-question-vote="${targetId}"]`).forEach((b) => {
                b.classList.toggle('voted', up);
                b.title = currentUser ? (up ? 'Remove your upvote' : 'Upvote') : 'Log in to upvote';
            });
        } else {
            const qId = new URLSearchParams(window.location.search).get('id');
            if (qId) loadAnswers(qId);
        }
    } catch (err) { console.error(err); }
}

async function acceptAnswer(answerId) {
    if (!currentUser) return alert('Login required to accept answers');
    const questionId = currentQuestion ? currentQuestion.id : new URLSearchParams(window.location.search).get('id');
    if (!questionId || !answerId) return;
    try {
        const response = await fetchWithAuth(`${API_BASE_URL}/question/${questionId}/accept/${answerId}`, {
            method: 'POST'
        });
        if (response.ok) {
            toast('Answer accepted');
            loadQuestionDetails(questionId);
        } else {
            const data = await response.json().catch(() => ({}));
            alert(data.error || 'Could not accept answer');
        }
    } catch (err) {
        console.error(err);
    }
}

async function awardBounty(answerId) {
    if (!currentUser) return alert('Login required to award bounty');
    const questionId = currentQuestion ? currentQuestion.id : new URLSearchParams(window.location.search).get('id');
    if (!questionId || !answerId) return;

    const bountyAmount = currentQuestion ? currentQuestion.bounty : 0;
    if (bountyAmount <= 0) return alert('This question has no bounty to award');

    if (!confirm(`Are you sure you want to award ${bountyAmount} reputation points to this answer\'s author? This action cannot be undone.`)) return;

    try {
        const response = await fetchWithAuth(`${API_BASE_URL}/question/${questionId}/award-bounty/${answerId}`, {
            method: 'POST'
        });
        const data = await response.json().catch(() => ({}));
        if (response.ok) {
            toast(`Bounty of ${bountyAmount} reputation points awarded!`);
            loadQuestionDetails(questionId);
        } else {
            alert(data.error || 'Could not award bounty');
        }
    } catch (err) {
        console.error(err);
        alert('Failed to award bounty. Please try again.');
    }
}

// --- Auth ---

async function login() {
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;

    try {
        const response = await fetch(`${API_BASE_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        if (response.ok) {
            const data = await response.json();
            currentUser = data.user;
            authToken = data.token;
            refreshToken = data.refreshToken || localStorage.getItem('refreshToken');
            localStorage.setItem('user', JSON.stringify(currentUser));
            localStorage.setItem('token', authToken);
            if (refreshToken) {
                localStorage.setItem('refreshToken', refreshToken);
            }
            await loadMyVotes();
            window.location.href = 'index.html';
        } else {
            const body = await response.json().catch(() => ({}));
            alert(body.error || "Invalid credentials");
        }
    } catch (err) { console.error(err); }
}

async function register() {
    const username = document.getElementById('regUsername').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;

    try {
        const response = await fetch(`${API_BASE_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password })
        });
        if (response.ok) {
            const data = await response.json();
            currentUser = data.user;
            authToken = data.token;
            refreshToken = data.refreshToken || localStorage.getItem('refreshToken');
            localStorage.setItem('user', JSON.stringify(currentUser));
            localStorage.setItem('token', authToken);
            if (refreshToken) {
                localStorage.setItem('refreshToken', refreshToken);
            }
            await loadMyVotes();
            window.location.href = 'index.html';
        } else {
            const err = await response.json().catch(() => ({}));
            alert(err.error || 'Registration failed');
        }
    } catch (err) { console.error(err); }
}

function logout() {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    currentUser = null;
    authToken = null;
    refreshToken = null;
    window.location.reload();
}

function continueWithGoogle() {
    window.location.href = `${API_BASE_URL}/oauth2/authorize/google`;
}

function showPasswordResetForm() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'none';
    document.getElementById('passwordResetForm').style.display = 'block';
}

function hidePasswordResetForm() {
    document.getElementById('passwordResetForm').style.display = 'none';
    document.getElementById('loginForm').style.display = 'block';
}

async function requestPasswordReset() {
    const email = document.getElementById('resetEmail').value;
    if (!email) return alert('Please enter your email');

    try {
        const response = await fetch(`${API_BASE_URL}/request-password-reset`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const data = await response.json();
        alert(data.message || 'If this email exists, a reset token has been sent.');
    } catch (err) {
        console.error(err);
        alert('Unable to request password reset right now.');
    }
}

async function submitPasswordReset() {
    const token = document.getElementById('resetToken').value;
    const password = document.getElementById('newPassword').value;
    if (!token || !password) return alert('Token and new password are required');

    try {
        const response = await fetch(`${API_BASE_URL}/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, password })
        });
        const data = await response.json();
        if (response.ok) {
            alert(data.message || 'Password reset complete. You can now login with the new password.');
            hidePasswordResetForm();
        } else {
            alert(data.error || 'Password reset failed');
        }
    } catch (err) {
        console.error(err);
        alert('Unable to reset password right now.');
    }
}

function toggleAuth() {
    const loginF = document.getElementById('loginForm');
    const registerF = document.getElementById('registerForm');
    const resetF = document.getElementById('passwordResetForm');
    if (resetF) {
        resetF.style.display = 'none';
    }
    if (loginF.style.display === 'none') {
        loginF.style.display = 'block';
        registerF.style.display = 'none';
    } else {
        loginF.style.display = 'none';
        registerF.style.display = 'block';
    }
}

function showPasswordResetForm() {
    const loginF = document.getElementById('loginForm');
    const registerF = document.getElementById('registerForm');
    const resetF = document.getElementById('passwordResetForm');
    if (loginF) loginF.style.display = 'none';
    if (registerF) registerF.style.display = 'none';
    if (resetF) resetF.style.display = 'block';
}

function hidePasswordResetForm() {
    const loginF = document.getElementById('loginForm');
    const registerF = document.getElementById('registerForm');
    const resetF = document.getElementById('passwordResetForm');
    if (resetF) resetF.style.display = 'none';
    if (loginF) loginF.style.display = 'block';
    if (registerF) registerF.style.display = 'none';
}

async function fetchTopContributors() {
    const list = document.getElementById('collaboratorsList');
    if (!list) return;
    try {
        const response = await fetch(`${API_BASE_URL}/users/top`);
        const users = await response.json();
        list.innerHTML = users.map(u => `
            <div class="leaderboard-item">
                <span class="leaderboard-name">${u.username}</span>
                <span class="leaderboard-rep">${u.reputation} Rep</span>
            </div>
        `).join('');
    } catch (err) { console.error(err); }
}

function escapeHtml(text) {
    if (!text) return "";
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
