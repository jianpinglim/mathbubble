'use strict';

let db;
let viewer;
let studentId;

// ── bootstrap ────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);

async function init() {
    try {
        const parts = location.pathname.split('/');
        studentId = parts[parts.length - 1];
        if (!studentId) return go('/teacher');

        await initializeSupabase();
        db = window.supabaseClient;
        if (!db) return go('/teacher/login');

        const { data: { session } } = await db.auth.getSession();
        if (!session) return go('/teacher/login');

        const { data: user, error } = await db
            .from('users')
            .select('id, email, full_name, avatar_url, role')
            .eq('id', session.user.id)
            .single();

        if (error || user?.role !== 'teacher') return go('/teacher/login');

        viewer = user;
        renderSidebar(user);
        bindUI();
        await loadStudent();

        db.auth.onAuthStateChange((_, s) => { if (!s) go('/teacher/login'); });
    } catch (_) {
        go('/teacher/login');
    }
}

function go(url) { window.location.href = url; }
function el(id) { return document.getElementById(id); }

// ── sidebar ───────────────────────────────────────────────────────────────────

function renderSidebar(user) {
    const name = user.full_name || 'Teacher';
    el('sidebar-avatar').textContent = name.charAt(0).toUpperCase();
    el('sidebar-user-name').textContent = name.split(' ')[0] + "'s";
    el('menu-user-name').textContent = name;
    el('menu-user-email').textContent = user.email || '';
    if (user.avatar_url) el('menu-user-avatar').src = user.avatar_url;
}

// ── event binding ─────────────────────────────────────────────────────────────

function bindUI() {
    el('sidebar-header').addEventListener('click', e => {
        e.stopPropagation();
        el('sidebar-user-menu').classList.toggle('show');
    });
    document.addEventListener('click', () => el('sidebar-user-menu').classList.remove('show'));

    el('sign-out-btn').addEventListener('click', async () => {
        await db.auth.signOut();
        go('/teacher/login');
    });

    el('back-btn').addEventListener('click', () => go('/teacher'));

    el('hamburger-btn').addEventListener('click', () => {
        el('sidebar').classList.toggle('open');
        el('sidebar-overlay').classList.toggle('open');
    });
    el('sidebar-overlay').addEventListener('click', () => {
        el('sidebar').classList.remove('open');
        el('sidebar-overlay').classList.remove('open');
    });
}

// ── data loading ──────────────────────────────────────────────────────────────

async function loadStudent() {
    const [studentRes, attRes] = await Promise.all([
        db.from('users')
            .select('id, full_name, email, avatar_url')
            .eq('id', studentId)
            .single(),
        db.from('user_attempts')
            .select('topic, is_correct, attempt_time')
            .eq('user_id', studentId)
            .order('attempt_time', { ascending: false })
    ]);

    if (studentRes.error || !studentRes.data) return go('/teacher');

    const student = studentRes.data;
    const attempts = attRes.data || [];

    renderHeader(student);
    renderStats(attempts);

    if (attempts.length > 0) {
        el('student-content').style.display = 'grid';
        renderTopics(attempts);
        renderAttempts(attempts.slice(0, 10));
    }
}

// ── renderers ─────────────────────────────────────────────────────────────────

function renderHeader(student) {
    const name = student.full_name || 'Unknown Student';
    const letter = name.charAt(0).toUpperCase();
    const avatar = el('student-avatar');
    avatar.textContent = letter;
    avatar.className = `student-avatar student-avatar-lg ${avatarClass(letter)}`;
    el('student-name').textContent = name;
    el('student-email').textContent = student.email || '';
}

function renderStats(attempts) {
    const total = attempts.length;
    const correct = attempts.filter(a => a.is_correct).length;
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
    const streak = calcStreak(attempts);

    el('student-total').textContent = total.toLocaleString();
    el('student-accuracy').textContent = total > 0 ? accuracy + '%' : '—';
    el('student-streak').textContent = streak + (streak === 1 ? ' day' : ' days');
}

function calcStreak(attempts) {
    if (!attempts.length) return 0;

    // Unique practice days, most recent first
    const days = [...new Set(
        attempts.map(a => a.attempt_time?.split('T')[0]).filter(Boolean)
    )].sort((a, b) => b.localeCompare(a));

    if (!days.length) return 0;

    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    // Streak only alive if practiced today or yesterday
    if (days[0] !== today && days[0] !== yesterday) return 0;

    let streak = 1;
    for (let i = 1; i < days.length; i++) {
        const diff = Math.round(
            (new Date(days[i - 1]) - new Date(days[i])) / 86400000
        );
        if (diff === 1) streak++;
        else break;
    }
    return streak;
}

function renderTopics(attempts) {
    const map = {};
    for (const a of attempts) {
        if (!a.topic) continue;
        if (!map[a.topic]) map[a.topic] = { c: 0, t: 0 };
        map[a.topic].t++;
        if (a.is_correct) map[a.topic].c++;
    }

    const topics = Object.entries(map)
        .map(([topic, { c, t }]) => ({ topic, pct: Math.round((c / t) * 100) }))
        .sort((a, b) => a.pct - b.pct);

    const container = el('topic-breakdown');
    if (!topics.length) {
        container.innerHTML = '<p class="empty-text">No data yet</p>';
        return;
    }
    container.innerHTML = topics.map(t => barItem(t.topic, t.pct)).join('');
}

function renderAttempts(attempts) {
    const container = el('recent-attempts');
    if (!attempts.length) {
        container.innerHTML = '<p class="empty-text">No attempts yet</p>';
        return;
    }
    container.innerHTML = attempts.map(a => {
        const ok = a.is_correct;
        const colour = ok ? '#34d399' : '#f87171';
        const date = new Date(a.attempt_time).toLocaleString('en-US', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        return `
            <div class="attempt-item${ok ? '' : ' incorrect'}">
                <div class="attempt-icon" style="color:${colour}">${ok ? '✓' : '✗'}</div>
                <div class="attempt-content">
                    <div class="attempt-topic">${esc(a.topic || 'Unknown')}</div>
                    <div class="attempt-time">${date}</div>
                </div>
                <div class="attempt-status" style="color:${colour}">${ok ? 'Correct' : 'Incorrect'}</div>
            </div>`;
    }).join('');
}

// ── bar chart ─────────────────────────────────────────────────────────────────

function barItem(label, pct) {
    const cls = pct < 50 ? 'red' : pct < 70 ? 'amber' : 'green';
    return `
        <div class="bar-item">
            <div class="bar-label" title="${esc(label)}">${esc(label)}</div>
            <div class="bar-track">
                <div class="bar-fill ${cls}" style="width:${pct}%"></div>
            </div>
            <span class="bar-pct ${cls}-text">${pct}%</span>
        </div>`;
}

// ── utilities ─────────────────────────────────────────────────────────────────

function avatarClass(letter) {
    const idx = Math.max(0, letter.charCodeAt(0) - 65) % 13;
    return `avatar-${'abcdefghijklm'[idx]}`;
}

function esc(str) {
    const d = document.createElement('div');
    d.textContent = String(str);
    return d.innerHTML;
}
