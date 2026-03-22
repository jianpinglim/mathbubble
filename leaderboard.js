// Leaderboard page logic
(async function () {
    // Wait for auth to be ready
    while (!window.authManager) {
        await new Promise(r => setTimeout(r, 50));
    }
    await window.authManager.initializeAuth();

    const currentUser = window.authManager.getCurrentUser();
    const supabase = window.supabaseClient;

    // --- Sidebar UI (same pattern as index.js) ---
    if (currentUser) {
        var nameEl = document.getElementById('sidebar-user-name');
        var avatarEl = document.getElementById('sidebar-avatar');
        if (nameEl) nameEl.textContent = (currentUser.name || 'User').split(' ')[0] + "'s";
        if (avatarEl) {
            var initials = (currentUser.name || 'U').split(' ').map(function (w) { return w[0]; }).join('').substring(0, 2).toUpperCase();
            avatarEl.textContent = initials;
        }
        // Menu user details
        var menuName = document.getElementById('menu-user-name');
        var menuEmail = document.getElementById('menu-user-email');
        var menuAvatar = document.getElementById('menu-user-avatar');
        if (menuName) menuName.textContent = currentUser.name || 'User';
        if (menuEmail) menuEmail.textContent = currentUser.email || '';
        if (menuAvatar) {
            if (currentUser.avatar && currentUser.avatar !== '👤') {
                menuAvatar.src = currentUser.avatar;
            } else {
                menuAvatar.style.display = 'none';
            }
        }
    }

    // Sidebar header toggle
    var sidebarHeader = document.getElementById('sidebar-header');
    var userMenu = document.getElementById('sidebar-user-menu');
    if (sidebarHeader && userMenu) {
        sidebarHeader.addEventListener('click', function () {
            userMenu.classList.toggle('show');
        });
        document.addEventListener('click', function (e) {
            if (!sidebarHeader.contains(e.target) && !userMenu.contains(e.target)) {
                userMenu.classList.remove('show');
            }
        });
    }

    // Sign out
    var signOutBtn = document.getElementById('sign-out-btn');
    if (signOutBtn) {
        signOutBtn.addEventListener('click', function () {
            window.authManager.signOut();
        });
    }

    // Mobile hamburger
    var hamburger = document.getElementById('hamburger-btn');
    var sidebar = document.getElementById('sidebar');
    var overlay = document.getElementById('sidebar-overlay');
    if (hamburger && sidebar) {
        hamburger.addEventListener('click', function () {
            sidebar.classList.toggle('open');
            hamburger.classList.toggle('active');
            if (overlay) overlay.classList.toggle('show');
        });
        if (overlay) {
            overlay.addEventListener('click', function () {
                sidebar.classList.remove('open');
                hamburger.classList.remove('active');
                overlay.classList.remove('show');
            });
        }
    }

    // --- Tab switching ---
    var tabs = document.querySelectorAll('.lb-tab');
    var globalPanel = document.getElementById('lb-global');
    var classPanel = document.getElementById('lb-class');
    var classLoaded = false;

    tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
            tabs.forEach(function (t) { t.classList.remove('active'); });
            tab.classList.add('active');
            var target = tab.dataset.lbTab;
            if (target === 'global') {
                globalPanel.classList.add('active');
                classPanel.classList.remove('active');
            } else {
                classPanel.classList.add('active');
                globalPanel.classList.remove('active');
                if (!classLoaded) {
                    classLoaded = true;
                    loadClassLeaderboard();
                }
            }
        });
    });

    // --- Helpers ---
    function accuracyClass(acc) {
        if (acc >= 80) return 'lb-acc-green';
        if (acc >= 60) return 'lb-acc-amber';
        return 'lb-acc-red';
    }

    function rankDisplay(rank) {
        if (rank === 1) return '<span class="lb-medal">&#129351;</span><span class="lb-rank lb-rank-1">#1</span>';
        if (rank === 2) return '<span class="lb-medal">&#129352;</span><span class="lb-rank lb-rank-2">#2</span>';
        if (rank === 3) return '<span class="lb-medal">&#129353;</span><span class="lb-rank lb-rank-3">#3</span>';
        return '<span class="lb-rank">#' + rank + '</span>';
    }

    function streakDisplay(streak) {
        if (!streak || streak === 0) {
            return '<span class="lb-streak lb-streak-zero"><span class="lb-streak-icon">&#128293;</span>0</span>';
        }
        return '<span class="lb-streak"><span class="lb-streak-icon">&#128293;</span>' + streak + '</span>';
    }

    function truncateName(name, max) {
        if (!name) return '—';
        return name.length > max ? name.substring(0, max) + '...' : name;
    }

    function buildRow(entry, rank, isCurrentUser) {
        var tr = document.createElement('tr');
        if (isCurrentUser) tr.classList.add('lb-current-user');

        var nameText = truncateName(entry.full_name, 20);
        var youBadge = isCurrentUser ? '<span class="lb-you-badge">YOU</span>' : '';
        var acc = entry.accuracy != null ? entry.accuracy : 0;

        tr.innerHTML =
            '<td>' + rankDisplay(rank) + '</td>' +
            '<td><span class="lb-name">' + escapeHtml(nameText) + '</span>' + youBadge + '</td>' +
            '<td class="' + accuracyClass(acc) + '">' + acc + '%</td>' +
            '<td>' + (entry.total_attempts || 0) + '</td>' +
            '<td>' + streakDisplay(entry.streak) + '</td>';
        return tr;
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // --- Load Global Leaderboard ---
    async function loadGlobalLeaderboard() {
        var loading = document.getElementById('global-loading');
        var empty = document.getElementById('global-empty');
        var table = document.getElementById('global-table');
        var tbody = document.getElementById('global-tbody');
        var pinned = document.getElementById('global-pinned');
        var pinnedTbody = document.getElementById('global-pinned-tbody');
        var rankDiv = document.getElementById('global-user-rank');

        try {
            var { data, error } = await supabase.rpc('get_global_leaderboard', { lim: 50 });
            if (error) throw error;

            loading.style.display = 'none';

            if (!data || data.length === 0) {
                empty.style.display = 'flex';
                return;
            }

            table.style.display = 'table';
            tbody.innerHTML = '';

            var userInList = false;
            data.forEach(function (entry, i) {
                var rank = i + 1;
                var isMe = currentUser && !currentUser.isGuest && entry.id === currentUser.id;
                if (isMe) userInList = true;
                tbody.appendChild(buildRow(entry, rank, isMe));
            });

            // If user not in top 50, fetch their rank and pin it
            if (currentUser && !currentUser.isGuest && !userInList) {
                var { data: rankData, error: rankErr } = await supabase.rpc('get_current_user_rank', { p_user_id: currentUser.id });
                if (!rankErr && rankData && rankData.length > 0) {
                    var r = rankData[0];
                    pinned.style.display = 'block';
                    pinnedTbody.innerHTML = '';
                    pinnedTbody.appendChild(buildRow({
                        id: currentUser.id,
                        full_name: currentUser.name,
                        total_attempts: r.total_attempts,
                        correct: r.correct,
                        accuracy: r.accuracy,
                        streak: 0
                    }, Number(r.rank), true));

                    rankDiv.style.display = 'block';
                    rankDiv.innerHTML = 'Your rank: <strong>#' + r.rank + '</strong> of <strong>' + r.total_students + '</strong> students';
                }
            } else if (currentUser && !currentUser.isGuest && userInList) {
                // Show rank info even if in list
                var userIdx = data.findIndex(function (e) { return e.id === currentUser.id; });
                if (userIdx !== -1) {
                    rankDiv.style.display = 'block';
                    rankDiv.innerHTML = 'Your rank: <strong>#' + (userIdx + 1) + '</strong> of <strong>' + data.length + '+</strong> students';
                }
            }
        } catch (err) {
            console.error('Leaderboard error:', err);
            loading.style.display = 'none';
            empty.style.display = 'flex';
            empty.querySelector('p').textContent = 'Failed to load leaderboard. Please try again later.';
        }
    }

    // --- Load Class Leaderboard ---
    async function loadClassLeaderboard() {
        var loading = document.getElementById('class-loading');
        var empty = document.getElementById('class-empty');
        var table = document.getElementById('class-table');
        var tbody = document.getElementById('class-tbody');
        var classNameHeader = document.getElementById('class-name-header');

        loading.style.display = 'flex';
        empty.style.display = 'none';
        table.style.display = 'none';

        if (!currentUser || currentUser.isGuest) {
            loading.style.display = 'none';
            empty.style.display = 'flex';
            empty.querySelector('p').textContent = "Sign in to see your class leaderboard.";
            return;
        }

        try {
            // Get user's class
            var { data: membership, error: memErr } = await supabase
                .from('class_members')
                .select('class_id, classes(id, name)')
                .eq('student_id', currentUser.id)
                .limit(1)
                .single();

            if (memErr || !membership) {
                loading.style.display = 'none';
                empty.style.display = 'flex';
                return;
            }

            var classId = membership.class_id;
            var className = membership.classes ? membership.classes.name : 'My Class';

            classNameHeader.style.display = 'block';
            classNameHeader.textContent = className;

            var { data, error } = await supabase.rpc('get_class_leaderboard', { p_class_id: classId });
            if (error) throw error;

            loading.style.display = 'none';

            if (!data || data.length === 0) {
                empty.style.display = 'flex';
                empty.querySelector('p').textContent = 'No students in this class yet.';
                return;
            }

            table.style.display = 'table';
            tbody.innerHTML = '';

            data.forEach(function (entry, i) {
                var rank = i + 1;
                var isMe = entry.id === currentUser.id;
                tbody.appendChild(buildRow(entry, rank, isMe));
            });
        } catch (err) {
            console.error('Class leaderboard error:', err);
            loading.style.display = 'none';
            empty.style.display = 'flex';
            empty.querySelector('p').textContent = 'Failed to load class leaderboard.';
        }
    }

    // --- Init ---
    loadGlobalLeaderboard();
})();
