// DOM elements
const loadingEl = document.getElementById('loading');

// Stats elements
const totalQuestionsEl = document.getElementById('total-questions');
const accuracyRateEl = document.getElementById('accuracy-rate');
const currentStreakEl = document.getElementById('current-streak');
const weakestTopicEl = document.getElementById('weakest-topic');

// Sidebar elements
const sidebarAvatar = document.getElementById('sidebar-avatar');
const sidebarUserName = document.getElementById('sidebar-user-name');
const sidebarHeader = document.getElementById('sidebar-header');
const sidebarUserMenu = document.getElementById('sidebar-user-menu');
const menuUserAvatarEl = document.getElementById('menu-user-avatar');
const menuUserNameEl = document.getElementById('menu-user-name');
const menuUserEmailEl = document.getElementById('menu-user-email');

// Card containers
const forYouCardsContainer = document.getElementById('for-you-cards');
const practiceCardsContainer = document.getElementById('practice-cards');
const noWeakTopicsCard = document.getElementById('no-weak-topics-card');

// Gradient classes for cards
const gradientClasses = [
    'gradient-cyan-pink',
    'gradient-purple-pink',
    'gradient-teal',
    'gradient-orange',
    'gradient-blue'
];

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
            updateSidebarProfile({
                name: 'Guest',
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
            
            showGuestPrompt();
            loadPracticeSubjects();
            showNoWeakTopics();
            return;
        }
        
        updateSidebarProfile(currentUser);
        await loadUserStats(currentUser);
        await loadForYouCards(currentUser);
        await loadPracticeSubjects();
        
        if (!currentUser.isGuest) {
            hideGuestPrompt();
        } else {
            showGuestPrompt();
        }
        
    } catch (error) {
        console.error('Error initializing page:', error);
    }
}

// Update sidebar profile display
function updateSidebarProfile(user) {
    const name = user.name || 'User';
    const email = user.email || 'guest@mathbubble.com';
    const avatar = user.avatar || '👤';
    
    // Extract first name and make possessive
    const firstName = name.split(' ')[0];
    const possessiveName = firstName.endsWith('s') ? `${firstName}'` : `${firstName}'s`;
    
    if (sidebarUserName) {
        sidebarUserName.textContent = possessiveName;
    }
    
    // Set avatar initials
    if (sidebarAvatar) {
        if (avatar.startsWith('http')) {
            // If it's a URL, we could show image, but for now show initials
            const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
            sidebarAvatar.textContent = initials || 'NA';
        } else {
            const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
            sidebarAvatar.textContent = initials || 'NA';
        }
    }
    
    // Update menu profile
    if (menuUserAvatarEl) {
        if (avatar.startsWith('http')) {
            menuUserAvatarEl.src = avatar;
            menuUserAvatarEl.style.display = 'block';
        } else {
            menuUserAvatarEl.style.display = 'none';
        }
    }
    
    if (menuUserNameEl) {
        menuUserNameEl.textContent = name;
    }
    
    if (menuUserEmailEl) {
        menuUserEmailEl.textContent = email;
    }
}

// Show/hide guest prompt
function showGuestPrompt() {
    const guestPrompt = document.getElementById('guest-prompt');
    if (guestPrompt) guestPrompt.style.display = 'block';
}

function hideGuestPrompt() {
    const guestPrompt = document.getElementById('guest-prompt');
    if (guestPrompt) guestPrompt.style.display = 'none';
}

// Show no weak topics message
function showNoWeakTopics() {
    if (noWeakTopicsCard) {
        noWeakTopicsCard.style.display = 'block';
    }
}

// Load For You cards (weak topics)
async function loadForYouCards(user) {
    if (!forYouCardsContainer) return;
    
    // Clear existing cards (except the no-weak-topics placeholder)
    const existingCards = forYouCardsContainer.querySelectorAll('.topic-card:not(#no-weak-topics-card)');
    existingCards.forEach(card => card.remove());
    
    if (user.isGuest) {
        showNoWeakTopics();
        return;
    }
    
    try {
        const weakTopicsData = await getWeakestTopicsWithDetails(user);
        
        if (weakTopicsData.length === 0) {
            showNoWeakTopics();
            return;
        }
        
        // Hide no-weak-topics card
        if (noWeakTopicsCard) {
            noWeakTopicsCard.style.display = 'none';
        }
        
        // Create cards for each weak topic
        weakTopicsData.forEach((topicData, index) => {
            // Determine subject from the topic data if available
            const subjectDisplay = topicData.subject ? formatSubjectName(topicData.subject) : 'E. Math';
            const card = createTopicCard(
                topicData.topic,
                'Secondary 4',
                subjectDisplay,
                gradientClasses[index % gradientClasses.length],
                () => startTopicPractice(topicData.topic, topicData.subject)
            );
            forYouCardsContainer.appendChild(card);
        });
        
    } catch (error) {
        console.error('Error loading For You cards:', error);
        showNoWeakTopics();
    }
}

// Load practice subjects from database
async function loadPracticeSubjects() {
    if (!practiceCardsContainer) return;
    
    // Clear existing cards
    practiceCardsContainer.innerHTML = '';
    
    try {
        const supabaseConfig = getSupabaseConfig();
        if (!supabaseConfig?.url || !supabaseConfig?.key) {
            // Add default E. Math card
            addDefaultPracticeCard();
            return;
        }
        
        const supabase = window.supabase.createClient(supabaseConfig.url, supabaseConfig.key);
        
        // Get distinct subjects from questions
        const { data: subjects, error } = await supabase
            .from('questions')
            .select('subject')
            .not('subject', 'is', null);
        
        if (error) {
            console.error('Error fetching subjects:', error);
            addDefaultPracticeCard();
            return;
        }
        
        // Get unique subjects
        const uniqueSubjects = [...new Set(subjects.map(s => s.subject).filter(Boolean))];
        
        if (uniqueSubjects.length === 0) {
            addDefaultPracticeCard();
            return;
        }
        
        // Create cards for each subject
        uniqueSubjects.forEach((subject, index) => {
            const displayName = formatSubjectName(subject);
            const card = createTopicCard(
                displayName,
                'Secondary 4',
                null,
                gradientClasses[index % gradientClasses.length],
                () => startSubjectPractice(subject)
            );
            practiceCardsContainer.appendChild(card);
        });
        
    } catch (error) {
        console.error('Error loading practice subjects:', error);
        addDefaultPracticeCard();
    }
}

// Add default practice card
function addDefaultPracticeCard() {
    const card = createTopicCard(
        'E. Math',
        'Secondary 4',
        null,
        'gradient-teal',
        () => window.location.href = '/quiz'
    );
    practiceCardsContainer.appendChild(card);
}

// Format subject name for display
function formatSubjectName(subject) {
    if (!subject) return 'Math';
    
    // Handle common abbreviations
    const nameMap = {
        'emath': 'E. Math',
        'amath': 'A. Math',
        'e_math': 'E. Math',
        'a_math': 'A. Math',
        'elementary_math': 'E. Math',
        'additional_math': 'A. Math'
    };
    
    const lower = subject.toLowerCase().replace(/\s+/g, '_');
    if (nameMap[lower]) return nameMap[lower];
    
    // Capitalize first letter of each word
    return subject.split(/[\s_]+/).map(word => 
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
}

// Create a topic card element
function createTopicCard(title, subtitle, subject, gradientClass, onClick) {
    const card = document.createElement('div');
    card.className = 'topic-card';
    card.innerHTML = `
        <div class="card-gradient ${gradientClass}"></div>
        <div class="card-info">
            <h3 class="card-title">${title}</h3>
            <p class="card-subtitle">${subtitle}</p>
            ${subject ? `<p class="card-subject">${subject}</p>` : ''}
        </div>
    `;
    card.addEventListener('click', onClick);
    return card;
}

// Start practice for a specific topic (For You section)
async function startTopicPractice(topic, subject = null) {
    loadingEl.style.display = 'flex';
    
    try {
        const currentUser = window.authManager?.getCurrentUser();
        if (!currentUser) {
            window.location.href = '/login';
            return;
        }
        
        const questions = await getQuestionsForTopic(topic, subject);
        
        if (questions.length === 0) {
            alert(`No questions found for ${topic}. Try another topic!`);
            loadingEl.style.display = 'none';
            return;
        }
        
        sessionStorage.setItem('trainingQuestions', JSON.stringify(questions));
        sessionStorage.setItem('quizMode', 'training');
        sessionStorage.setItem('currentTopic', topic);
        
        window.location.href = '/quiz';
        
    } catch (error) {
        console.error('Error starting topic practice:', error);
        alert('Failed to start practice. Please try again.');
        loadingEl.style.display = 'none';
    }
}

// Start practice for a specific subject
function startSubjectPractice(subject) {
    sessionStorage.setItem('practiceSubject', subject);
    sessionStorage.setItem('quizMode', 'practice');
    window.location.href = '/quiz';
}

// Get questions for a specific topic - prioritize unanswered questions
async function getQuestionsForTopic(topic, subject = null) {
    try {
        const supabaseConfig = getSupabaseConfig();
        if (!supabaseConfig?.url || !supabaseConfig?.key) {
            return [];
        }
        
        const supabase = window.supabase.createClient(supabaseConfig.url, supabaseConfig.key);
        const currentUser = window.authManager?.getCurrentUser();
        
        // Get all questions for this topic
        let query = supabase
            .from('questions')
            .select('*')
            .eq('topic', topic);
        
        // Filter by subject if provided
        if (subject) {
            query = query.eq('subject', subject);
        }
        
        const { data: allQuestions, error } = await query;
            
        if (error) {
            throw error;
        }
        
        if (!allQuestions || allQuestions.length === 0) {
            return [];
        }
        
        // Get questions the user has already answered (if logged in)
        let answeredQuestionIds = [];
        if (currentUser && !currentUser.isGuest) {
            const { data: attempts } = await supabase
                .from('user_attempts')
                .select('question_id')
                .eq('user_id', currentUser.id);
            
            if (attempts) {
                answeredQuestionIds = [...new Set(attempts.map(a => a.question_id))];
            }
        }
        
        // Separate into unanswered and answered questions
        const unansweredQuestions = allQuestions.filter(q => !answeredQuestionIds.includes(q.id));
        const answeredQuestions = allQuestions.filter(q => answeredQuestionIds.includes(q.id));
        
        // Prioritize unanswered questions, then fill with answered if needed
        let selectedQuestions = [];
        
        // Shuffle unanswered questions and take up to 5
        const shuffledUnanswered = unansweredQuestions.sort(() => Math.random() - 0.5);
        selectedQuestions = shuffledUnanswered.slice(0, 5);
        
        // If we don't have 5 yet, fill with answered questions
        if (selectedQuestions.length < 5 && answeredQuestions.length > 0) {
            const shuffledAnswered = answeredQuestions.sort(() => Math.random() - 0.5);
            const remaining = 5 - selectedQuestions.length;
            selectedQuestions = [...selectedQuestions, ...shuffledAnswered.slice(0, remaining)];
        }
        
        // Process questions
        const processedQuestions = selectedQuestions.map(q => ({
            id: q.id,
            topic: q.topic,
            subject: q.subject,
            question: q.question,
            options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options,
            correct_index: q.correct_index
        }));
        
        // Final shuffle
        return processedQuestions.sort(() => Math.random() - 0.5);
        
    } catch (error) {
        console.error('Error getting questions for topic:', error);
        return [];
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
    
    // Count unique questions answered (by question_id)
    const uniqueQuestionIds = new Set(attempts.map(a => a.question_id).filter(Boolean));
    const totalQuestions = uniqueQuestionIds.size;
    
    // For accuracy, use unique questions - a question is "correct" if user got it right at least once
    const questionResults = {};
    attempts.forEach(attempt => {
        if (!attempt.question_id) return;
        if (!questionResults[attempt.question_id]) {
            questionResults[attempt.question_id] = false;
        }
        // Mark as correct if any attempt was correct
        if (attempt.is_correct) {
            questionResults[attempt.question_id] = true;
        }
    });
    
    const correctAnswers = Object.values(questionResults).filter(correct => correct).length;
    const accuracyRate = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;
    
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
        if (accuracy < lowestAccuracy && stats.total >= 3) {
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

// Get user's weakest topics with full details including subject
async function getWeakestTopicsWithDetails(user) {
    if (user.isGuest) {
        return [];
    }
    
    try {
        const supabaseConfig = getSupabaseConfig();
        if (!supabaseConfig?.url || !supabaseConfig?.key) {
            return [];
        }
        
        const supabase = window.supabase.createClient(supabaseConfig.url, supabaseConfig.key);
        
        // Get user's attempts with topic info, ordered by time
        const { data: attempts, error: attemptsError } = await supabase
            .from('user_attempts')
            .select('topic, is_correct, question_id, attempt_time')
            .eq('user_id', user.id)
            .order('attempt_time', { ascending: false });
            
        if (attemptsError || !attempts || attempts.length === 0) {
            return [];
        }
        
        // Get questions to map topics to subjects
        const questionIds = [...new Set(attempts.map(a => a.question_id).filter(Boolean))];
        let topicSubjectMap = {};
        
        if (questionIds.length > 0) {
            const { data: questions, error: questionsError } = await supabase
                .from('questions')
                .select('topic, subject')
                .in('id', questionIds);
            
            if (!questionsError && questions) {
                questions.forEach(q => {
                    if (q.topic && !topicSubjectMap[q.topic]) {
                        topicSubjectMap[q.topic] = q.subject;
                    }
                });
            }
        }
        
        // For each unique question, get only the most recent attempt
        // Since attempts are already sorted by attempt_time desc, first occurrence is most recent
        const mostRecentByQuestion = {};
        attempts.forEach(attempt => {
            if (!attempt.question_id || !attempt.topic) return;
            
            // Only keep the first (most recent) attempt for each question
            if (!mostRecentByQuestion[attempt.question_id]) {
                mostRecentByQuestion[attempt.question_id] = {
                    topic: attempt.topic,
                    is_correct: attempt.is_correct
                };
            }
        });
        
        // Calculate topic accuracy based on most recent attempts per unique question
        const topicStats = {};
        Object.values(mostRecentByQuestion).forEach(attempt => {
            if (!topicStats[attempt.topic]) {
                topicStats[attempt.topic] = { 
                    correct: 0, 
                    total: 0,
                    subject: topicSubjectMap[attempt.topic] || null
                };
            }
            topicStats[attempt.topic].total++;
            if (attempt.is_correct) {
                topicStats[attempt.topic].correct++;
            }
        });
        
        // Sort topics by accuracy (lowest first) - include topics with any attempts
        const weakTopics = Object.entries(topicStats)
            .filter(([_, stats]) => stats.total >= 1) // Show topics with at least 1 unique question
            .map(([topic, stats]) => ({
                topic,
                accuracy: (stats.correct / stats.total) * 100,
                uniqueQuestions: stats.total,
                subject: stats.subject
            }))
            .filter(item => item.accuracy < 70) // Topics with less than 70% accuracy
            .sort((a, b) => a.accuracy - b.accuracy) // Sort by accuracy, lowest first
            .slice(0, 5); // Top 5 weakest topics
            
        return weakTopics;
        
    } catch (error) {
        console.error('Error getting weakest topics:', error);
        return [];
    }
}

// Get user's weakest topics for training mode (returns topic names only)
async function getWeakestTopics(user) {
    const topicsWithDetails = await getWeakestTopicsWithDetails(user);
    return topicsWithDetails.map(item => item.topic);
}

// Setup tab navigation
function setupTabNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const tabContents = document.querySelectorAll('.tab-content');
    
    navItems.forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Skip if disabled
            if (this.classList.contains('disabled')) {
                return;
            }
            
            const targetTab = this.dataset.tab;
            
            // Update active nav item
            navItems.forEach(nav => nav.classList.remove('active'));
            this.classList.add('active');
            
            // Update active tab content
            tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === `${targetTab}-tab`) {
                    content.classList.add('active');
                }
            });
        });
    });
}

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
    // Wait for auth manager to be ready
    setTimeout(initializePage, 500);
    
    // Setup tab navigation
    setupTabNavigation();
    
    // Sidebar header click (user menu toggle)
    if (sidebarHeader && sidebarUserMenu) {
        sidebarHeader.addEventListener('click', function(e) {
            e.stopPropagation();
            sidebarUserMenu.classList.toggle('show');
        });

        document.addEventListener('click', function() {
            sidebarUserMenu.classList.remove('show');
        });
        
        sidebarUserMenu.addEventListener('click', function(e) {
            e.stopPropagation();
        });
    }
    
    // Sign out button
    const signOutBtn = document.getElementById('sign-out-btn');
    if (signOutBtn) {
        signOutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            if (window.authManager && window.authManager.signOut) {
                window.authManager.signOut();
            }
        });
    }
    
    // Home sign-in button (guest prompt)
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
});