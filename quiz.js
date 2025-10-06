// Quiz configuration
const QUIZ_CONFIG = {
    questionsPerQuiz: 5,
    maxLives: 5,
    timePerQuestion: 30000, // 30 seconds (optional)
};

// Quiz state
let currentQuestions = [];
let currentQuestionIndex = 0;
let userAnswers = [];
let livesRemaining = QUIZ_CONFIG.maxLives;
let quizStartTime = null;
let questionStartTime = null;
let isAnswering = false;
let currentAttempts = 0;
let maxAttemptsPerQuestion = 3;

// DOM elements
const loadingEl = document.getElementById('loading');
const quizContainerEl = document.getElementById('quiz-container');
const resultsContainerEl = document.getElementById('results-container');
const gameOverContainerEl = document.getElementById('game-over-container');
const errorContainerEl = document.getElementById('error-container');
const progressFillEl = document.getElementById('progress-fill');
const progressTextEl = document.getElementById('progress-text');
const heartsEl = document.getElementById('hearts');
const topicChipEl = document.getElementById('topic-chip');
const questionTextEl = document.getElementById('question-text');
const optionsContainerEl = document.getElementById('options-container');
const checkBtnEl = document.getElementById('check-btn');

const finalScoreEl = document.getElementById('final-score');
const finalPercentageEl = document.getElementById('final-percentage');
const livesRemainingEl = document.getElementById('lives-remaining');
const resultsBreakdownEl = document.getElementById('results-breakdown');
const restartBtnEl = document.getElementById('restart-btn');

const gameOverScoreEl = document.getElementById('game-over-score');
const restartGameBtnEl = document.getElementById('restart-game-btn');

const retryBtnEl = document.getElementById('retry-btn');
const errorMessageEl = document.getElementById('error-message');

// User profile elements
const userAvatarEl = document.getElementById('user-avatar');
const userNameEl = document.getElementById('user-name');
const userEmailEl = document.getElementById('user-email');
const signOutBtnEl = document.getElementById('sign-out-btn');

// Get Supabase config from auth.js
function getSupabaseConfig() {
    if (window.authManager && window.authManager.getSupabaseConfig) {
        return window.authManager.getSupabaseConfig();
    }
    // Fallback
    return {
        url: 'https://tmgssumdikxtgcdaykyu.supabase.co',
        key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRtZ3NzdW1kaWt4dGdjZGF5a3l1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2NjMwNDcsImV4cCI6MjA3NTIzOTA0N30.e3T1XokoA5Nb0quLEHsS9VXixgVK6SdMUYojBEvs0ug'
    };
}

// Fetch questions from Supabase
async function fetchQuestions() {
    try {
        // Check if we're in training mode with pre-loaded questions
        const quizMode = sessionStorage.getItem('quizMode');
        const trainingQuestions = sessionStorage.getItem('trainingQuestions');
        
        if (quizMode === 'training' && trainingQuestions) {
            console.log('🎯 Loading training mode questions...');
            const questions = JSON.parse(trainingQuestions);
            
            // Clear sessionStorage after loading
            sessionStorage.removeItem('trainingQuestions');
            sessionStorage.removeItem('quizMode');
            
            // Training questions already have parsed options, no need to parse again
            return questions.map(q => ({
                ...q,
                options: Array.isArray(q.options) ? q.options : JSON.parse(q.options)
            }));
        }
        
        // Regular practice mode - fetch smart randomized questions
        console.log('🏃‍♂️ Loading practice mode questions...');
        const config = getSupabaseConfig();
        const currentUser = window.authManager?.getCurrentUser();
        
        let questions;
        
        if (currentUser && !currentUser.isGuest) {
            // For authenticated users - use smart question selection
            console.log('🧠 Using smart question selection for authenticated user');
            
            const response = await fetch(`${config.url}/rest/v1/rpc/get_practice_questions`, {
                method: 'POST',
                headers: {
                    'apikey': config.key,
                    'Authorization': `Bearer ${config.key}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    user_uuid: currentUser.id,
                    question_limit: QUIZ_CONFIG.questionsPerQuiz
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            questions = await response.json();
            
        } else {
            // For guest users - use random selection
            console.log('👤 Using random selection for guest user');
            
            // Get total count first
            const countResponse = await fetch(`${config.url}/rest/v1/questions?select=count`, {
                headers: {
                    'apikey': config.key,
                    'Authorization': `Bearer ${config.key}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'count=exact'
                }
            });
            
            const countData = await countResponse.json();
            const totalQuestions = countData.length || 0;
            
            // Generate random offset
            const maxOffset = Math.max(0, totalQuestions - QUIZ_CONFIG.questionsPerQuiz);
            const randomOffset = Math.floor(Math.random() * (maxOffset + 1));
            
            const response = await fetch(`${config.url}/rest/v1/questions?select=*&limit=${QUIZ_CONFIG.questionsPerQuiz}&offset=${randomOffset}`, {
                headers: {
                    'apikey': config.key,
                    'Authorization': `Bearer ${config.key}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            questions = await response.json();
        }
        
        if (!questions || questions.length === 0) {
            throw new Error('No questions available for practice');
        }

        console.log(`🎯 Selected ${questions.length} questions for practice mode`);

        // Parse options (they're stored as JSON strings)
        return questions.map(q => ({
            ...q,
            options: JSON.parse(q.options)
        }));
    } catch (error) {
        console.error('Error fetching questions:', error);
        throw error;
    }
}

// Initialize quiz
async function initQuiz() {
    try {
        showLoading();
        currentQuestions = await fetchQuestions();
        userAnswers = new Array(currentQuestions.length).fill(null);
        currentQuestionIndex = 0;
        livesRemaining = QUIZ_CONFIG.maxLives;
        quizStartTime = Date.now();
        isAnswering = false;
        
        // Add training mode indicator if applicable
        const isTrainingMode = sessionStorage.getItem('quizMode') === 'training';
        if (isTrainingMode) {
            console.log('🎯 Training Mode: Focusing on weak topics');
            addTrainingModeIndicator();
        }
        
        showQuiz();
        displayQuestion();
        updateProgress();
        updateLives();
    } catch (error) {
        showError(error.message);
    }
}

// Add visual indicator for training mode
function addTrainingModeIndicator() {
    const headerContent = document.querySelector('.header-content');
    if (headerContent && !document.getElementById('training-indicator')) {
        const indicator = document.createElement('div');
        indicator.id = 'training-indicator';
        indicator.className = 'training-indicator';
        indicator.innerHTML = '<span class="training-icon">🎯</span><span>Training Mode</span>';
        headerContent.appendChild(indicator);
    }
}

// Display current question
function displayQuestion() {
    const question = currentQuestions[currentQuestionIndex];
    
    // Reset attempts for new question
    currentAttempts = 0;
    
    // Start timing for this question
    questionStartTime = Date.now();
    
    // Update topic chip
    topicChipEl.textContent = question.topic;
    
    // Update question text
    questionTextEl.innerHTML = question.question;
    
    // Clear and populate options
    optionsContainerEl.innerHTML = '';
    question.options.forEach((option, index) => {
        const optionEl = createOptionElement(option, index);
        optionsContainerEl.appendChild(optionEl);
    });
    
    // Reset check button
    checkBtnEl.disabled = true;
    checkBtnEl.textContent = 'CHECK';
    isAnswering = false;
    
    // Re-render MathJax for new content
    if (window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([questionTextEl, optionsContainerEl]).catch((err) => {
            console.warn('MathJax rendering error:', err);
        });
    }
}

// Create option element
function createOptionElement(optionText, index) {
    const optionEl = document.createElement('div');
    optionEl.className = 'option';
    optionEl.dataset.index = index;
    
    const contentEl = document.createElement('div');
    contentEl.className = 'option-content';
    
    const letterEl = document.createElement('div');
    letterEl.className = 'option-letter';
    letterEl.textContent = String.fromCharCode(65 + index); // A, B, C, D
    
    const textEl = document.createElement('div');
    textEl.className = 'option-text';
    textEl.innerHTML = optionText;
    
    contentEl.appendChild(letterEl);
    contentEl.appendChild(textEl);
    optionEl.appendChild(contentEl);
    
    // Add click handler
    optionEl.addEventListener('click', () => selectOption(index));
    
    return optionEl;
}

// Handle option selection
function selectOption(selectedIndex) {
    if (isAnswering) return;
    
    // Remove previous selection
    document.querySelectorAll('.option').forEach(opt => {
        opt.classList.remove('selected');
    });
    
    // Add selection to clicked option
    document.querySelector(`[data-index="${selectedIndex}"]`).classList.add('selected');
    
    // Store answer and enable check button
    userAnswers[currentQuestionIndex] = selectedIndex;
    checkBtnEl.disabled = false;
}

// Update progress bar
function updateProgress() {
    const progress = ((currentQuestionIndex + 1) / currentQuestions.length) * 100;
    progressFillEl.style.width = `${progress}%`;
    progressTextEl.textContent = `${currentQuestionIndex + 1}/${currentQuestions.length}`;
}

// Update lives display
function updateLives() {
    const hearts = heartsEl.children;
    for (let i = 0; i < hearts.length; i++) {
        if (i < livesRemaining) {
            hearts[i].classList.add('filled');
            hearts[i].classList.remove('empty');
        } else {
            hearts[i].classList.remove('filled');
            hearts[i].classList.add('empty');
        }
    }
}

// Track user attempt in database
async function trackUserAttempt(questionId, topic, selectedIndex, isCorrect, timeTaken) {
    try {
        const currentUser = window.authManager.getCurrentUser();
        if (!currentUser || currentUser.isGuest) {
            console.log('📊 Skipping attempt tracking for guest user');
            return;
        }

        const supabaseConfig = getSupabaseConfig();
        if (!supabaseConfig.url || !supabaseConfig.key) {
            console.warn('⚠️ Supabase config not available for attempt tracking');
            return;
        }

        const supabase = window.supabase.createClient(supabaseConfig.url, supabaseConfig.key);
        
        // Always track the attempt in user_attempts table
        const { data, error } = await supabase
            .from('user_attempts')
            .insert({
                user_id: currentUser.id,
                question_id: questionId,
                topic: topic,
                selected_index: selectedIndex,
                is_correct: isCorrect,
                time_taken_seconds: timeTaken
            });

        if (error) {
            console.error('❌ Error tracking user attempt:', error);
            return;
        } else {
            console.log('📊 User attempt tracked successfully');
        }

        // Handle question mastery tracking for practice mode only
        const isTrainingMode = sessionStorage.getItem('trainingMode') === 'true';
        if (!isTrainingMode) {
            console.log('🎯 Updating question mastery for practice mode');
            
            if (isCorrect) {
                // Question answered correctly - mark as mastered
                const { error: masteryError } = await supabase
                    .from('user_mastered_questions')
                    .upsert({
                        user_id: currentUser.id,
                        question_id: questionId,
                        mastered_at: new Date().toISOString(),
                        wrong_attempts: 0
                    }, {
                        onConflict: 'user_id,question_id'
                    });

                if (masteryError) {
                    console.error('❌ Error marking question as mastered:', masteryError);
                } else {
                    console.log('✅ Question marked as mastered');
                }
            } else {
                // Question answered incorrectly - increment wrong attempts
                const { data: existing, error: fetchError } = await supabase
                    .from('user_mastered_questions')
                    .select('wrong_attempts')
                    .eq('user_id', currentUser.id)
                    .eq('question_id', questionId)
                    .single();

                if (fetchError && fetchError.code !== 'PGRST116') {
                    console.error('❌ Error fetching mastery data:', fetchError);
                    return;
                }

                const wrongAttempts = existing ? existing.wrong_attempts + 1 : 1;
                
                const { error: masteryError } = await supabase
                    .from('user_mastered_questions')
                    .upsert({
                        user_id: currentUser.id,
                        question_id: questionId,
                        wrong_attempts: wrongAttempts
                    }, {
                        onConflict: 'user_id,question_id'
                    });

                if (masteryError) {
                    console.error('❌ Error updating wrong attempts:', masteryError);
                } else {
                    console.log(`📊 Wrong attempts updated: ${wrongAttempts}`);
                }
            }
        }
    } catch (error) {
        console.error('❌ Error in trackUserAttempt:', error);
    }
}

// Check answer with new logic
function checkAnswer() {
    if (isAnswering || userAnswers[currentQuestionIndex] === null) return;
    
    const question = currentQuestions[currentQuestionIndex];
    const selectedAnswer = userAnswers[currentQuestionIndex];
    const isCorrect = selectedAnswer === question.correct_index;
    const selectedOption = document.querySelector(`[data-index="${selectedAnswer}"]`);
    
    // Calculate time taken for this question
    const timeTaken = questionStartTime ? Math.round((Date.now() - questionStartTime) / 1000) : 0;
    
    // Track this attempt in the database
    trackUserAttempt(question.id, question.topic, selectedAnswer, isCorrect, timeTaken);
    
    if (isCorrect) {
        // Correct answer - show success and move to next question
        selectedOption.classList.add('correct');
        
        // Brief pause then move to next question
        setTimeout(() => {
            moveToNextQuestion();
        }, 800);
        
    } else {
        // Wrong answer - immediately lose a heart and increment attempts
        livesRemaining--;
        updateLives();
        currentAttempts++;
        
        // Visual feedback for wrong answer
        selectedOption.classList.add('incorrect');
        shakeButton(checkBtnEl);
        flashBackground('#ff4b4b');
        
        // Check if game over (no hearts left)
        if (livesRemaining <= 0) {
            setTimeout(() => {
                showGameOver();
            }, 1000);
            return;
        }
        
        // Remove incorrect styling after animation
        setTimeout(() => {
            selectedOption.classList.remove('incorrect');
            selectedOption.classList.remove('selected');
            userAnswers[currentQuestionIndex] = null;
            checkBtnEl.disabled = true;
        }, 600);
        
        // After 3 wrong attempts, show correct answer and move to next question
        if (currentAttempts >= maxAttemptsPerQuestion) {
            const correctOption = document.querySelector(`[data-index="${question.correct_index}"]`);
            correctOption.classList.add('correct');
            
            // Move to next question after showing correct answer
            setTimeout(() => {
                moveToNextQuestion();
            }, 1500);
        }
    }
}

// Move to next question or end quiz
function moveToNextQuestion() {
    if (currentQuestionIndex < currentQuestions.length - 1) {
        currentQuestionIndex++;
        displayQuestion();
        updateProgress();
    } else {
        showResults();
    }
}

// Shake animation for button
function shakeButton(element) {
    element.style.animation = 'shake 0.6s ease-in-out';
    setTimeout(() => {
        element.style.animation = '';
    }, 600);
}

// Flash background color
function flashBackground(color) {
    const originalBg = document.body.style.backgroundColor;
    document.body.style.backgroundColor = color;
    document.body.style.transition = 'background-color 0.1s ease';
    
    setTimeout(() => {
        document.body.style.backgroundColor = originalBg || '#ffffff';
        setTimeout(() => {
            document.body.style.transition = '';
        }, 300);
    }, 300);
}

// Calculate current score
function calculateCurrentScore() {
    let correct = 0;
    for (let i = 0; i <= currentQuestionIndex && i < userAnswers.length; i++) {
        if (userAnswers[i] !== null && userAnswers[i] === currentQuestions[i].correct_index) {
            correct++;
        }
    }
    return correct;
}

// Show results screen
function showResults() {
    const totalQuestions = currentQuestions.length;
    const correctAnswers = calculateCurrentScore();
    const percentage = Math.round((correctAnswers / totalQuestions) * 100);
    const timeTaken = Math.round((Date.now() - quizStartTime) / 1000);
    
    // Update results display
    finalScoreEl.textContent = `${correctAnswers}/${totalQuestions}`;
    finalPercentageEl.textContent = `${percentage}%`;
    livesRemainingEl.textContent = livesRemaining.toString();
    
    // Create detailed breakdown
    resultsBreakdownEl.innerHTML = `
        <div class="result-item">
            <span>Questions Answered:</span>
            <span>${totalQuestions}</span>
        </div>
        <div class="result-item">
            <span>Correct Answers:</span>
            <span style="color: #58cc02;">${correctAnswers}</span>
        </div>
        <div class="result-item">
            <span>Wrong Answers:</span>
            <span style="color: #ff4b4b;">${totalQuestions - correctAnswers}</span>
        </div>
        <div class="result-item">
            <span>Time Taken:</span>
            <span>${Math.floor(timeTaken / 60)}:${(timeTaken % 60).toString().padStart(2, '0')}</span>
        </div>
        <div class="result-item">
            <span>Lives Remaining:</span>
            <span style="color: #ffa800;">${livesRemaining}/5</span>
        </div>
    `;
    
    // Show appropriate screen
    showResultsScreen();
}

// Show game over screen
function showGameOver() {
    const questionsAnswered = currentQuestionIndex + 1;
    const correctAnswers = calculateCurrentScore();
    
    gameOverScoreEl.textContent = `${correctAnswers}/${questionsAnswered}`;
    showGameOverScreen();
}

// Show different screens
function showLoading() {
    loadingEl.style.display = 'flex';
    quizContainerEl.style.display = 'none';
    resultsContainerEl.style.display = 'none';
    gameOverContainerEl.style.display = 'none';
    errorContainerEl.style.display = 'none';
}

function showQuiz() {
    loadingEl.style.display = 'none';
    quizContainerEl.style.display = 'flex';
    resultsContainerEl.style.display = 'none';
    gameOverContainerEl.style.display = 'none';
    errorContainerEl.style.display = 'none';
}

function showResultsScreen() {
    loadingEl.style.display = 'none';
    quizContainerEl.style.display = 'none';
    resultsContainerEl.style.display = 'flex';
    gameOverContainerEl.style.display = 'none';
    errorContainerEl.style.display = 'none';
}

function showGameOverScreen() {
    loadingEl.style.display = 'none';
    quizContainerEl.style.display = 'none';
    resultsContainerEl.style.display = 'none';
    gameOverContainerEl.style.display = 'flex';
    errorContainerEl.style.display = 'none';
}

function showError(message) {
    errorMessageEl.textContent = message;
    loadingEl.style.display = 'none';
    quizContainerEl.style.display = 'none';
    resultsContainerEl.style.display = 'none';
    gameOverContainerEl.style.display = 'none';
    errorContainerEl.style.display = 'flex';
}

// Event listeners
checkBtnEl.addEventListener('click', checkAnswer);
restartBtnEl.addEventListener('click', initQuiz);
restartGameBtnEl.addEventListener('click', initQuiz);
retryBtnEl.addEventListener('click', initQuiz);

// Authentication functions
async function checkAuthAndInitialize() {
    // Wait for auth to be ready
    if (window.authManager) {
        const user = await window.authManager.initializeAuth();
        if (user) {
            updateUserProfile(user);
        }
    }
    initQuiz();
}

function updateUserProfile(user) {
    if (!user) return;
    
    if (user.isGuest) {
        userNameEl.textContent = 'Guest User';
        userEmailEl.textContent = 'Playing as Guest';
        userAvatarEl.textContent = '👤';
    } else {
        userNameEl.textContent = user.name || 'User';
        userEmailEl.textContent = user.email || '';
        
        // Use Google profile picture if available
        if (user.avatar && user.avatar.startsWith('http')) {
            userAvatarEl.innerHTML = `<img src="${user.avatar}" alt="Profile" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
        } else {
            userAvatarEl.textContent = user.avatar || '👤';
        }
    }
}

async function handleSignOut() {
    if (window.authManager && window.authManager.signOut) {
        await window.authManager.signOut();
    }
}

// Set up sign out button
signOutBtnEl.addEventListener('click', handleSignOut);

// Initialize quiz on page load
document.addEventListener('DOMContentLoaded', function() {
    // Small delay to ensure auth.js is loaded
    setTimeout(checkAuthAndInitialize, 100);
});