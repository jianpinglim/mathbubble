// DOM elements
const trainingModeBtn = document.getElementById('training-mode-btn');
const practiceModeBtn = document.getElementById('practice-mode-btn');
const loadingEl = document.getElementById('loading');

// User elements
const userAvatarEl = document.getElementById('user-avatar');
const userNameEl = document.getElementById('user-name');
const menuUserAvatarEl = document.getElementById('menu-user-avatar');
const menuUserNameEl = document.getElementById('menu-user-name');
const menuUserEmailEl = document.getElementById('menu-user-email');

// Stats elements
const totalQuestionsEl = document.getElementById('total-questions');
const accuracyRateEl = document.getElementById('accuracy-rate');
const currentStreakEl = document.getElementById('current-streak');
const weakestTopicEl = document.getElementById('weakest-topic');

// Get Supabase config from auth.js
function getSupabaseConfig() {
    if (window.authManager && window.authManager.getSupabaseConfig) {
        return window.authManager.getSupabaseConfig();
    }
    return null;
}

// Track last rendered identity so we can re-render when auth state changes
let lastRenderedUserKey = null;

// Initialize page
async function initializePage() {
    try {
        if (window.authManager?.initializeAuth) {
            await Promise.race([
                window.authManager.initializeAuth(),
                new Promise(resolve => setTimeout(resolve, 4000))
            ]);
        }

        const currentUser = window.authManager?.getCurrentUser();

        const userKey = currentUser
            ? (currentUser.isGuest ? 'guest' : `user:${currentUser.id}`)
            : 'none';

        if (userKey === lastRenderedUserKey) {
            return;
        }
        lastRenderedUserKey = userKey;
        
        if (!currentUser) {
            updateUserProfile({
                name: 'Guest User',
                email: 'guest@mathbubble.com',
                avatar: '👤',
                isGuest: true
            });
            
            updateStatsDisplay({
                totalQuestions: 0,
                accuracyRate: 0,
                currentStreak: 0,
                weakestTopic: 'Sign in to track progress!'
            });
            return;
        }
        
        updateUserProfile(currentUser);
        await loadUserStats(currentUser);
        
    } catch (error) {
        // Silent fail
    }
}

// Update user profile display
function updateUserProfile(user) {
    const avatar = user.avatar || '👤';
    const name = user.name || 'User';
    const email = user.email || 'guest@mathbubble.com';
    
    const guestSection = document.getElementById('guest-section');
    const userProfile = document.getElementById('user-profile');
    
    if (user.isGuest && name === 'Guest User') {
        // Show guest sign-in button
        if (guestSection) guestSection.style.display = 'flex';
        if (userProfile) userProfile.style.display = 'none';
        return;
    }
    
    // Show authenticated user profile
    if (guestSection) guestSection.style.display = 'none';
    if (userProfile) userProfile.style.display = 'flex';
    
    // Update header profile
    if (userAvatarEl) {
        if (avatar.startsWith('http')) {
            userAvatarEl.src = avatar;
            userAvatarEl.style.display = 'block';
        } else {
            userAvatarEl.style.display = 'none';
            userAvatarEl.insertAdjacentHTML('afterend', `<span class="avatar-emoji">${avatar}</span>`);
        }
    }
    
    if (userNameEl) {
        userNameEl.textContent = name;
    }
    
    // Update menu profile
    if (menuUserAvatarEl) {
        if (avatar.startsWith('http')) {
            menuUserAvatarEl.src = avatar;
            menuUserAvatarEl.style.display = 'block';
        } else {
            menuUserAvatarEl.style.display = 'none';
            menuUserAvatarEl.insertAdjacentHTML('afterend', `<span class="avatar-emoji">${avatar}</span>`);
        }
    }
    
    if (menuUserNameEl) {
        menuUserNameEl.textContent = name;
    }
    
    if (menuUserEmailEl) {
        menuUserEmailEl.textContent = email;
    }
}

// Load user statistics
async function loadUserStats(user) {
    if (user.isGuest) {
        updateStatsDisplay({
            totalQuestions: 0,
            accuracyRate: 0,
            currentStreak: 0,
            weakestTopic: 'Start playing to see stats!'
        });
        return;
    }
    
    try {
        if (!window.supabaseClient) {
            return;
        }
        
        const supabase = window.supabaseClient;
        
        const { data: attempts, error: attemptsError } = await supabase
            .from('user_attempts')
            .select('*')
            .eq('user_id', user.id);
            
        if (attemptsError) {
            return;
        }
        
        const stats = calculateUserStats(attempts || []);
        
        const { data: userData } = await supabase
            .from('users')
            .select('streak')
            .eq('id', user.id)
            .single();
        
        if (userData) {
            stats.currentStreak = Math.max(userData.streak || 0, stats.currentStreak);
        }
        
        updateStatsDisplay(stats);
        
    } catch (error) {
        // Stats loading failed silently
    }
}

// Calculate statistics from attempts data
function calculateUserStats(attempts) {
    if (!attempts || attempts.length === 0) {
        return {
            totalQuestions: 0,
            accuracyRate: 0,
            currentStreak: 0,
            weakestTopic: 'No data yet'
        };
    }
    
    const totalQuestions = attempts.length;
    const correctAnswers = attempts.filter(attempt => attempt.is_correct).length;
    const accuracyRate = Math.round((correctAnswers / totalQuestions) * 100);
    
    // Calculate topic accuracy
    const topicStats = {};
    attempts.forEach(attempt => {
        if (!topicStats[attempt.topic]) {
            topicStats[attempt.topic] = { correct: 0, total: 0 };
        }
        topicStats[attempt.topic].total++;
        if (attempt.is_correct) {
            topicStats[attempt.topic].correct++;
        }
    });
    
    // Find weakest topic
    let weakestTopic = 'No data yet';
    let lowestAccuracy = 100;
    
    Object.entries(topicStats).forEach(([topic, stats]) => {
        const accuracy = (stats.correct / stats.total) * 100;
        if (accuracy < lowestAccuracy && stats.total >= 3) { // Need at least 3 attempts to be considered
            lowestAccuracy = accuracy;
            weakestTopic = topic;
        }
    });
    
    return {
        totalQuestions,
        accuracyRate,
        currentStreak: calculateStreakFromAttempts(attempts),
        weakestTopic
    };
}

// Calculate current streak from attempts (consecutive correct answers, most recent first)
function calculateStreakFromAttempts(attempts) {
    if (!attempts || attempts.length === 0) return 0;
    
    // Sort by attempt_time descending (most recent first)
    const sorted = [...attempts].sort((a, b) => 
        new Date(b.attempt_time) - new Date(a.attempt_time)
    );
    
    let streak = 0;
    for (const attempt of sorted) {
        if (attempt.is_correct) {
            streak++;
        } else {
            break; // Streak broken
        }
    }
    return streak;
}

// Update stats display
function updateStatsDisplay(stats) {
    if (totalQuestionsEl) {
        totalQuestionsEl.textContent = stats.totalQuestions.toLocaleString();
    }
    
    if (accuracyRateEl) {
        accuracyRateEl.textContent = `${stats.accuracyRate}%`;
    }
    
    if (currentStreakEl) {
        currentStreakEl.textContent = stats.currentStreak.toString();
    }
    
    if (weakestTopicEl) {
        weakestTopicEl.textContent = stats.weakestTopic;
    }
}

// Get questions from user's weakest topics
async function getWeakTopicQuestions(userId) {
    try {
        // First, get the user's weakest topics
        const user = { id: userId, isGuest: false };
        const weakTopics = await getWeakestTopics(user);
        
        if (weakTopics.length === 0) {
            return [];
        }
        
        // Now fetch randomized questions from database for these weak topics
        const supabaseConfig = getSupabaseConfig();
        if (!supabaseConfig?.url || !supabaseConfig?.key) {
            throw new Error('Supabase config not available');
        }
        
        const supabase = window.supabase.createClient(supabaseConfig.url, supabaseConfig.key);
        
        // Get all questions from weak topics with proper randomization
        const { data: questions, error } = await supabase
            .from('questions')
            .select('*')
            .in('topic', weakTopics)
            .order('id', { ascending: false })  // Add some ordering for randomization base
            .limit(50);  // Get more questions to choose from
            
        if (error) {
            throw error;
        }
        
        if (!questions || questions.length === 0) {
            return [];
        }
        
        // Process questions to ensure correct format
        const processedQuestions = questions.map(q => ({
            id: q.id,
            topic: q.topic,
            question: q.question,
            options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options,
            correct_index: q.correct_index
        }));
        
        // Apply multiple levels of randomization
        const doubleShuffled = processedQuestions
            .sort(() => Math.random() - 0.5)  // First shuffle
            .sort(() => Math.random() - 0.5)  // Second shuffle for extra randomness
            .slice(0, 5);  // Take 5 random questions
        
        // Shuffle and return final selection
        const finalSelection = doubleShuffled.sort(() => Math.random() - 0.5);
        
        return finalSelection;
        
    } catch (error) {
        return [];
    }
}

// Get user's weakest topics for training mode
async function getWeakestTopics(user) {
    if (user.isGuest) {
        return [];
    }
    
    try {
        const supabaseConfig = getSupabaseConfig();
        if (!supabaseConfig?.url || !supabaseConfig?.key) {
            return [];
        }
        
        const supabase = window.supabase.createClient(supabaseConfig.url, supabaseConfig.key);
        
        const { data: attempts, error } = await supabase
            .from('user_attempts')
            .select('topic, is_correct')
            .eq('user_id', user.id);
            
        if (error || !attempts) {
            return [];
        }
        
        // Calculate topic accuracy
        const topicStats = {};
        attempts.forEach(attempt => {
            if (!topicStats[attempt.topic]) {
                topicStats[attempt.topic] = { correct: 0, total: 0 };
            }
            topicStats[attempt.topic].total++;
            if (attempt.is_correct) {
                topicStats[attempt.topic].correct++;
            }
        });
        
        // Sort topics by accuracy (lowest first) and filter those with enough attempts
        const weakTopics = Object.entries(topicStats)
            .filter(([_, stats]) => stats.total >= 2) // Need at least 2 attempts (more inclusive)
            .map(([topic, stats]) => ({
                topic,
                accuracy: (stats.correct / stats.total) * 100,
                attempts: stats.total
            }))
            .filter(item => item.accuracy < 80) // Only topics with less than 80% accuracy
            .sort((a, b) => a.accuracy - b.accuracy)
            .slice(0, 5) // Top 5 weakest topics
            .map(item => item.topic);
            
        return weakTopics;
        
    } catch (error) {
        return [];
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
    // Wait for auth manager to be ready
    setTimeout(initializePage, 500);
    
    // Training mode button
    if (trainingModeBtn) {
        trainingModeBtn.addEventListener('click', async function() {
            loadingEl.style.display = 'flex';
            
            try {
                const currentUser = window.authManager?.getCurrentUser();
                if (!currentUser) {
                    window.location.href = '/login';
                    return;
                }
                
                if (currentUser.isGuest) {
                    alert('Training mode requires an account to track your weak areas. Try Practice Mode or sign in with Google!');
                    loadingEl.style.display = 'none';
                    return;
                }
                
                const weakQuestions = await getWeakTopicQuestions(currentUser.id);
                
                if (weakQuestions.length === 0) {
                    alert('No weak areas found yet! Try Practice Mode first to build your learning profile.');
                    loadingEl.style.display = 'none';
                    return;
                }
                
                sessionStorage.setItem('trainingQuestions', JSON.stringify(weakQuestions));
                sessionStorage.setItem('quizMode', 'training');
                
                window.location.href = '/quiz';
                
            } catch (error) {
                alert('Failed to start training mode. Please try again.');
                loadingEl.style.display = 'none';
            }
        });
    }
    
    // Practice mode button
    if (practiceModeBtn) {
        practiceModeBtn.addEventListener('click', function() {
            window.location.href = '/quiz';
        });
    }
    
    // Home sign-in button
    const homeSignInBtn = document.getElementById('home-signin-btn');
    if (homeSignInBtn) {
        homeSignInBtn.addEventListener('click', function() {
            localStorage.removeItem('guestUser');
            
            if (window.authManager) {
                window.authManager.getCurrentUser = () => null;
            }
            
            window.location.href = '/login';
        });
    }
    
    // Set up user profile menu toggle and sign-out (similar to quiz page)
    const userProfile = document.getElementById('user-profile');
    const userMenu = document.getElementById('user-menu');
    const signOutBtn = document.getElementById('sign-out-btn');
    
    if (userProfile && userMenu) {
        userProfile.addEventListener('click', function(e) {
            e.stopPropagation();
            userMenu.classList.toggle('show');
        });

        document.addEventListener('click', function() {
            userMenu.classList.remove('show');
        });
    }
    
    if (signOutBtn) {
        signOutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            if (window.authManager && window.authManager.signOut) {
                window.authManager.signOut();
            }
        });
    }
});