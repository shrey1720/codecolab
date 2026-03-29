const API_BASE_URL =
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 'http://localhost:8080/api'
        : 'https://ajt-be-3.onrender.com/api';

// State Management
let currentUser = JSON.parse(localStorage.getItem('user'));
let authToken = localStorage.getItem('token');
let currentFilter = 'home';
/** @type {Set<number>} */
let myQuestionUpvotes = new Set();
/** @type {Set<number>} */
let myAnswerUpvotes = new Set();

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    updateAuthUI();
    if (window.location.pathname.endsWith('index.html') || window.location.pathname === '/' || window.location.pathname.endsWith('/')) {
        fetchQuestions();
        fetchTopContributors();
    }
});

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
        const response = await fetch(`${API_BASE_URL}/votes/me`, { headers: getAuthHeaders() });
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

        const detail = document.getElementById('questionDetail');
        const tagsHtml = q.tags ? q.tags.split(',').map(t => `<span class="tag">${t.trim()}</span>`).join('') : '';
        const codeHtml = q.code ? `<div class="code-block"><pre><code>${escapeHtml(q.code)}</code></pre></div>` : '';
        const qid = Number(q.id);
        const votedQ = currentUser && myQuestionUpvotes.has(qid);

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
                    ${q.bounty > 0 ? `<span class="bounty-tag">Bounty: ${q.bounty}</span>` : ''}
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
            card.innerHTML = `
                <div class="card-meta card-meta-answer">
                    <span>Active Contributor: <strong>${escapeHtml(a.username)}</strong></span>
                    <span class="meta-dateline">
                        <span class="meta-date"><i class="far fa-calendar"></i> ${new Date(a.createdAt).toLocaleDateString()}</span>
                        ${answerVoteChipHtml(a, upVoted)}
                    </span>
                </div>
                <p style="line-height:1.6;">${escapeHtml(a.answerText)}</p>
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
        const response = await fetch(`${API_BASE_URL}/comment`, {
            method: 'POST',
            headers: getAuthHeaders(),
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
        const response = await fetch(`${API_BASE_URL}/question`, {
            method: 'POST',
            headers: getAuthHeaders(),
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
        const response = await fetch(`${API_BASE_URL}/answer`, {
            method: 'POST',
            headers: getAuthHeaders(),
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
        const response = await fetch(`${API_BASE_URL}/vote`, {
            method: 'POST',
            headers: getAuthHeaders(),
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
            localStorage.setItem('user', JSON.stringify(currentUser));
            localStorage.setItem('token', authToken);
            await loadMyVotes();
            window.location.href = 'index.html';
        } else alert("Invalid credentials");
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
            localStorage.setItem('user', JSON.stringify(currentUser));
            localStorage.setItem('token', authToken);
            await loadMyVotes();
            window.location.href = 'index.html';
        } else if (response.status === 409) {
            const err = await response.json().catch(() => ({}));
            alert(err.error || 'Username already exists');
        }
    } catch (err) { console.error(err); }
}

function logout() {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    currentUser = null;
    authToken = null;
    window.location.reload();
}

function toggleAuth() {
    const loginF = document.getElementById('loginForm');
    const registerF = document.getElementById('registerForm');
    if (loginF.style.display === 'none') {
        loginF.style.display = 'block';
        registerF.style.display = 'none';
    } else {
        loginF.style.display = 'none';
        registerF.style.display = 'block';
    }
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
