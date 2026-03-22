'use strict';

let db;
let viewer;    // logged-in teacher
let myClass;   // teacher's class data

// ── bootstrap ────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);

async function init() {
    // ── 1. Auth ──
    try {
        await initializeSupabase();
        db = window.supabaseClient;
        if (!db) return debugFail('Supabase client not initialized');

        // Handle OAuth callback (?code=…)
        const code = new URL(location.href).searchParams.get('code');
        if (code) {
            const { error: codeErr } = await db.auth.exchangeCodeForSession(code);
            if (codeErr) console.warn('[teacher] code exchange error (may be auto-consumed):', codeErr.message);
            window.history.replaceState(null, '', location.pathname);
        }

        const { data: { session } } = await db.auth.getSession();
        if (!session) return debugFail('No session found — you are not logged in');

        const { data: user, error } = await db
            .from('users')
            .select('id, email, full_name, avatar_url, role')
            .eq('id', session.user.id)
            .single();

        console.log('[teacher] user query result:', { user, error, sessionUserId: session.user.id });

        if (error) return debugFail('Could not read user from database: ' + error.message);
        if (!user) return debugFail('No user row found for id: ' + session.user.id);
        if (user.role !== 'teacher') return debugFail('User role is "' + user.role + '", not "teacher". Update your role in Supabase → users table.');

        viewer = user;
    } catch (err) {
        console.error('[teacher] auth error:', err);
        return debugFail('Auth error: ' + err.message);
    }

    // ── 2. UI — always runs if auth passes ──
    renderSidebar(viewer);
    bindUI();
    showNoClass(); // default state while data loads

    // ── 3. Data — show empty state on failure, never redirect ──
    try {
        await loadDashboard();
    } catch (err) {
        console.error('[teacher] dashboard load error:', err);
        showNoClass();
    }

    db.auth.onAuthStateChange((_, s) => { if (!s) go('/teacher/login'); });
}

function go(url) { window.location.href = url; }
function el(id) { return document.getElementById(id); }

function debugFail(msg) {
    console.error('[teacher] AUTH BLOCKED:', msg);
    document.body.innerHTML = `
        <div style="max-width:600px;margin:80px auto;font-family:Nunito,sans-serif;text-align:center;">
            <h2 style="color:#e74c3c;">Teacher Auth Failed</h2>
            <p style="background:#fff3cd;border:1px solid #ffc107;padding:1rem;border-radius:8px;color:#856404;">${msg}</p>
            <p style="margin-top:1rem;color:#6b7280;">Check the browser console (F12) for more details.</p>
            <a href="/teacher/login" style="display:inline-block;margin-top:1rem;padding:0.5rem 1.5rem;background:#F5B000;color:#fff;text-decoration:none;border-radius:8px;">Go to Teacher Login</a>
        </div>`;
}

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
    // User menu toggle
    el('sidebar-header').addEventListener('click', e => {
        e.stopPropagation();
        el('sidebar-user-menu').classList.toggle('show');
    });
    document.addEventListener('click', () => el('sidebar-user-menu').classList.remove('show'));

    // Sign out
    el('sign-out-btn').addEventListener('click', async () => {
        await db.auth.signOut();
        go('/teacher/login');
    });

    // Tab navigation
    document.querySelectorAll('[data-tab]').forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            if (link.classList.contains('disabled')) return;
            switchTab(link.dataset.tab);
            closeSidebar();
        });
    });

    // Copy join link
    const copyBtn = el('copy-code-btn');
    if (copyBtn) copyBtn.addEventListener('click', copyJoinLink);

    // Edit class button
    const editBtn = el('edit-class-btn');
    if (editBtn) editBtn.addEventListener('click', openEditModal);

    // Create class button → open modal
    el('create-class-btn').addEventListener('click', openModal);

    // Modal controls
    el('modal-close').addEventListener('click', closeModal);
    el('modal-cancel').addEventListener('click', closeModal);
    el('modal-overlay').addEventListener('click', e => { if (e.target === el('modal-overlay')) closeModal(); });
    el('modal-submit').onclick = createClass;

    // Mobile sidebar
    el('hamburger-btn').addEventListener('click', () => {
        el('sidebar').classList.toggle('open');
        el('sidebar-overlay').classList.toggle('open');
    });
    el('sidebar-overlay').addEventListener('click', closeSidebar);
}

function switchTab(name) {
    document.querySelectorAll('[data-tab]').forEach(l => l.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelector(`[data-tab="${name}"]`).classList.add('active');
    el(`${name}-tab`).classList.add('active');
}

function closeSidebar() {
    el('sidebar').classList.remove('open');
    el('sidebar-overlay').classList.remove('open');
}

// ── data loading ──────────────────────────────────────────────────────────────

async function loadDashboard() {
    // 1. Fetch teacher's class
    const { data: classRows, error: classErr } = await db
        .from('classes')
        .select('*')
        .eq('teacher_id', viewer.id)
        .order('created_at', { ascending: false })
        .limit(1);

    const classData = classRows?.[0] || null;

    console.log('[teacher] class query:', { classData, classErr, viewerId: viewer.id });

    if (classErr || !classData) {
        showNoClass();
        return;
    }

    myClass = classData;
    showClassCard(classData);

    // 2. Fetch class members
    const { data: members } = await db
        .from('class_members')
        .select('student_id')
        .eq('class_id', classData.id);

    const ids = (members || []).map(m => m.student_id);
    el('count-value').textContent = ids.length;

    if (ids.length === 0) {
        renderStats([], []);
        renderWeakTopics([]);
        renderStudentList([], 'students-list-container');
        renderStudentList([], 'all-students-list');
        return;
    }

    // 3. Parallel fetch — students + attempts
    const [studRes, attRes] = await Promise.all([
        db.from('users').select('id, full_name, email').in('id', ids),
        db.from('user_attempts')
            .select('user_id, topic, is_correct, attempt_time')
            .in('user_id', ids)
    ]);

    const students = studRes.data || [];
    const attempts = attRes.data || [];

    renderStats(attempts, ids);
    renderWeakTopics(attempts);

    const enriched = enrichStudents(students, attempts);
    renderStudentList(enriched, 'students-list-container');
    renderStudentList(enriched, 'all-students-list');
}

function showNoClass() {
    el('class-card').style.display = 'none';
    el('no-class-message').style.display = 'block';
    el('dashboard-grid').style.display = 'none';
    renderStats([], []);
}

function showClassCard(classData) {
    el('no-class-message').style.display = 'none';
    el('class-card').style.display = 'block';
    el('dashboard-grid').style.display = 'grid';
    el('class-name').textContent = classData.name || 'My Class';
    el('class-subject').textContent = classData.subject || 'Mathematics';
    el('join-code').textContent = classData.join_code || '—';
}

// ── stat helpers ──────────────────────────────────────────────────────────────

function renderStats(attempts) {
    const total = attempts.length;
    const correct = attempts.filter(a => a.is_correct).length;
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : null;
    const today = new Date().toISOString().split('T')[0];
    const active = new Set(
        attempts.filter(a => a.attempt_time?.startsWith(today)).map(a => a.user_id)
    ).size;

    el('total-questions').textContent = total.toLocaleString();
    el('class-accuracy').textContent = accuracy !== null ? accuracy + '%' : '—';
    el('active-today').textContent = active;
}

function topicAccuracy(attempts) {
    const map = {};
    for (const a of attempts) {
        if (!a.topic) continue;
        if (!map[a.topic]) map[a.topic] = { c: 0, t: 0 };
        map[a.topic].t++;
        if (a.is_correct) map[a.topic].c++;
    }
    return Object.entries(map).map(([topic, { c, t }]) => ({
        topic,
        pct: Math.round((c / t) * 100)
    }));
}

function enrichStudents(students, attempts) {
    const map = {};
    for (const a of attempts) {
        if (!map[a.user_id]) map[a.user_id] = { c: 0, t: 0 };
        map[a.user_id].t++;
        if (a.is_correct) map[a.user_id].c++;
    }
    return students
        .map(s => ({
            ...s,
            total: map[s.id]?.t || 0,
            pct: map[s.id]?.t > 0
                ? Math.round((map[s.id].c / map[s.id].t) * 100)
                : null
        }))
        .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
}

// ── renderers ─────────────────────────────────────────────────────────────────

function renderWeakTopics(attempts) {
    const topics = topicAccuracy(attempts)
        .sort((a, b) => a.pct - b.pct)
        .slice(0, 5);

    const container = el('weak-topics-container');
    if (!topics.length) {
        container.innerHTML = '<p class="empty-text">No data yet</p>';
        return;
    }
    container.innerHTML = topics.map(t => barItem(t.topic, t.pct)).join('');
}

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

function renderStudentList(students, containerId) {
    const container = el(containerId);
    if (!students.length) {
        container.innerHTML = '<p class="empty-text" style="padding:2rem 1rem;text-align:center">No students yet</p>';
        return;
    }
    container.innerHTML = students.map(studentRow).join('');
    container.querySelectorAll('.student-row').forEach(row =>
        row.addEventListener('click', () => go(`/teacher/student/${row.dataset.id}`))
    );
}

function studentRow(s) {
    const name = s.full_name || 'Unknown';
    const letter = name.charAt(0).toUpperCase();
    const cls = s.pct === null ? 'neutral' : s.pct < 50 ? 'red' : s.pct < 70 ? 'amber' : 'green';
    const pctText = s.pct !== null ? s.pct + '%' : '—';
    return `
        <div class="student-row" data-id="${esc(s.id)}">
            <div class="student-avatar ${avatarClass(letter)}">${esc(letter)}</div>
            <div class="student-info">
                <div class="student-name">${esc(name)}</div>
                <div class="student-meta">${s.total} question${s.total !== 1 ? 's' : ''}</div>
            </div>
            <span class="accuracy-badge ${cls}">${pctText}</span>
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

// ── Modal ─────────────────────────────────────────────────────────────────────

function openModal() {
    el('class-name-input').value = '';
    el('class-subject-input').selectedIndex = 0;
    el('modal-error').style.display = 'none';
    el('modal-title').textContent = 'Create a New Class';
    el('modal-submit').textContent = 'Create Class';
    el('modal-submit').disabled = false;
    el('modal-submit').onclick = createClass;
    el('modal-overlay').classList.add('open');
    el('class-name-input').focus();
}

function closeModal() {
    el('modal-overlay').classList.remove('open');
}

async function createClass() {
    const name = el('class-name-input').value.trim();
    const subject = el('class-subject-input').value;

    if (!name) {
        showModalError('Please enter a class name.');
        return;
    }

    const btn = el('modal-submit');
    btn.textContent = 'Creating…';
    btn.disabled = true;
    el('modal-error').style.display = 'none';

    try {
        const joinCode = generateJoinCode();

        const { data, error } = await db
            .from('classes')
            .insert({ teacher_id: viewer.id, name, subject, join_code: joinCode })
            .select()
            .single();

        if (error) throw error;

        closeModal();
        myClass = data;
        showClassCard(data);
        renderStats([]);
        renderWeakTopics([]);
        renderStudentList([], 'students-list-container');
        renderStudentList([], 'all-students-list');
        el('count-value').textContent = 0;

    } catch (err) {
        console.error('Create class error:', err);
        showModalError('Failed to create class. Please try again.');
        btn.textContent = 'Create Class';
        btn.disabled = false;
    }
}

function showModalError(msg) {
    const el_ = el('modal-error');
    el_.textContent = msg;
    el_.style.display = 'block';
}

function openEditModal() {
    if (!myClass) return;
    el('class-name-input').value = myClass.name || '';
    el('class-subject-input').value = myClass.subject || 'Mathematics';
    el('modal-error').style.display = 'none';
    el('modal-title').textContent = 'Edit Class';
    el('modal-submit').textContent = 'Save Changes';
    el('modal-submit').disabled = false;
    el('modal-submit').onclick = saveEditClass;
    el('modal-overlay').classList.add('open');
    el('class-name-input').focus();
}

async function saveEditClass() {
    const name = el('class-name-input').value.trim();
    const subject = el('class-subject-input').value;

    if (!name) {
        showModalError('Please enter a class name.');
        return;
    }

    const btn = el('modal-submit');
    btn.textContent = 'Saving…';
    btn.disabled = true;
    el('modal-error').style.display = 'none';

    try {
        const { data, error } = await db
            .from('classes')
            .update({ name, subject })
            .eq('id', myClass.id)
            .select()
            .single();

        if (error) throw error;

        myClass = data;
        showClassCard(data);
        closeModal();
    } catch (err) {
        console.error('Edit class error:', err);
        showModalError('Failed to save changes. Please try again.');
        btn.textContent = 'Save Changes';
        btn.disabled = false;
    }
}

function generateJoinCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'SK-';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
}

// ── Copy join link ─────────────────────────────────────────────────────────────

async function copyJoinLink() {
    if (!myClass?.join_code) return;
    const link = `${location.origin}/join/${myClass.join_code}`;
    try {
        await navigator.clipboard.writeText(link);
        const btn = el('copy-code-btn');
        const orig = btn.innerHTML;
        btn.textContent = '✓ Copied!';
        btn.style.background = '#34d399';
        setTimeout(() => { btn.innerHTML = orig; btn.style.background = ''; }, 2000);
    } catch (_) {
        prompt('Copy this link:', link);
    }
}
