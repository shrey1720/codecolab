const API_BASE_URL = 'https://ajt-be-3.onrender.com/api';

// State Management
let currentUser = JSON.parse(localStorage.getItem('user'));
let currentFilter = 'home';

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

    try {
        const response = await fetch(`${API_BASE_URL}/questions${filter ? '?filter=' + filter : ''}`);
        const data = await response.json();
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
        card.className = 'card';
        card.onclick = () => window.location.href = `question.html?id=${q.id}`;

        const tagsHtml = q.tags ? q.tags.split(',').map(t => `<span class="tag">${t.trim()}</span>`).join('') : '';
        const bountyBadge = q.bounty > 0 ? `<span class="bounty-tag"><i class="fas fa-coins"></i> ${q.bounty} Rep</span>` : '';

        card.innerHTML = `
            <div class="card-header">
                ${bountyBadge}
                <div class="card-meta">
                    <span><i class="far fa-user"></i> ${q.username}</span>
                    <span><i class="far fa-calendar"></i> ${new Date(q.createdAt).toLocaleDateString()}</span>
                </div>
            </div>
            <h2>${escapeHtml(q.title)}</h2>
            <p>${escapeHtml(q.description.substring(0, 150))}${q.description.length > 150 ? '...' : ''}</p>
            <div class="card-header" style="margin-top:1rem; margin-bottom:0;">
                <div class="tags">${tagsHtml}</div>
                <div class="card-meta">
                    <span>${q.votes} votes</span>
                </div>
            </div>
        `;
        list.appendChild(card);
    });
}

// --- Question Detail & Discussion ---

async function loadQuestionDetails(id) {
    try {
        const response = await fetch(`${API_BASE_URL}/question/${id}`);
        const q = await response.json();

        const detail = document.getElementById('questionDetail');
        const tagsHtml = q.tags ? q.tags.split(',').map(t => `<span class="tag">${t.trim()}</span>`).join('') : '';
        const codeHtml = q.code ? `<div class="code-block"><pre><code>${escapeHtml(q.code)}</code></pre></div>` : '';

        detail.innerHTML = `
            <div class="question-hero">
                <div style="display:flex; justify-content:space-between; margin-bottom:1rem;">
                    <div class="card-meta">
                        <span>Asked by <strong>${q.username}</strong></span>
                        <span>${new Date(q.createdAt).toLocaleString()}</span>
                    </div>
                    ${q.bounty > 0 ? `<span class="bounty-tag">Bounty: ${q.bounty}</span>` : ''}
                </div>
                <h1 style="font-size:2rem; margin-bottom:1.5rem;">${escapeHtml(q.title)}</h1>
                <p style="font-size:1.1rem; line-height:1.6; color:var(--text-main);">${escapeHtml(q.description)}</p>
                ${codeHtml}
                <div class="tags">${tagsHtml}</div>
            </div>
            <div id="questionComments" class="comment-section">
                <!-- Comments load here -->
            </div>
            <div style="margin-left:60px; margin-top:1rem;">
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
        answers.forEach(a => {
            const card = document.createElement('div');
            card.className = 'card';
            card.style.cursor = 'default';
            card.innerHTML = `
                <div style="display:flex;">
                    <div class="vote-controls">
                        <button class="vote-btn" onclick="vote(${a.id}, 'answer', 1)"><i class="fas fa-chevron-up"></i></button>
                        <span style="font-weight:700;">${a.votes}</span>
                        <button class="vote-btn" onclick="vote(${a.id}, 'answer', -1)"><i class="fas fa-chevron-down"></i></button>
                    </div>
                    <div style="flex:1;">
                        <div class="card-meta" style="margin-bottom:1rem;">
                            <span>Active Contributor: <strong>${a.username}</strong></span>
                            <span>${new Date(a.createdAt).toLocaleDateString()}</span>
                        </div>
                        <p style="line-height:1.6;">${escapeHtml(a.answerText)}</p>
                        <div id="ansComments-${a.id}" class="comment-section"></div>
                        <div style="margin-top:1rem; margin-left:20px;">
                            <input type="text" id="ansCommentInput-${a.id}" class="form-input" style="width: 250px; font-size:0.8rem;" placeholder="Add a comment...">
                            <button class="btn-primary" style="padding: 0.25rem 0.75rem; font-size:0.8rem;" onclick="addComment(${a.id}, 'answer')">Post</button>
                        </div>
                    </div>
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
            headers: { 'Content-Type': 'application/json' },
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
    const bounty = document.getElementById('qBounty').value;

    const body = { userId: currentUser.id, title, description: desc, code, tags, bounty };

    try {
        const response = await fetch(`${API_BASE_URL}/question`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id, questionId: qId, answerText: text })
        });
        if (response.ok) {
            closeAnswerModal();
            loadAnswers(qId);
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
            currentUser = await response.json();
            localStorage.setItem('user', JSON.stringify(currentUser));
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
            alert("Registered! Please login.");
            toggleAuth();
        }
    } catch (err) { console.error(err); }
}

function logout() {
    localStorage.removeItem('user');
    currentUser = null;
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
