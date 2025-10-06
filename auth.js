// Supabase configuration - will be fetched from server in production
let SUPABASE_URL = 'https://tmgssumdikxtgcdaykyu.supabase.co';
let SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRtZ3NzdW1kaWt4dGdjZGF5a3l1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2NjMwNDcsImV4cCI6MjA3NTIzOTA0N30.e3T1XokoA5Nb0quLEHsS9VXixgVK6SdMUYojBEvs0ug';

// Initialize Supabase client
let supabase = null;

// Load config from server in production
async function loadConfig() {
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        try {
            const response = await fetch('/api/config');
            const config = await response.json();
            SUPABASE_URL = config.supabaseUrl;
            SUPABASE_ANON_KEY = config.supabaseKey;
            console.log('✅ Production config loaded from server');
        } catch (error) {
            console.warn('⚠️ Failed to load production config, using defaults');
        }
    }
}

// Initialize Supabase client
async function initializeSupabase() {
    await loadConfig();
    try {
        if (window.supabase) {
            supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            console.log('✅ Supabase client initialized');
        }
    } catch (error) {
        console.warn('❌ Supabase client initialization failed:', error);
    }
}

// Authentication state
let currentUser = null;
let authInitialized = false;
let isRedirecting = false;

// Check if we're on a login page (both / and /login paths)
function isLoginPage() {
    const path = window.location.pathname;
    return path === '/login';
}

// Check if we're on home page
function isHomePage() {
    const path = window.location.pathname;
    return path === '/';
}

// Check if we're on quiz page
function isQuizPage() {
    const path = window.location.pathname;
    return path === '/quiz';
}

// Initialize authentication
async function initializeAuth() {
    if (authInitialized || isRedirecting) {
        console.log('Auth already initialized or redirecting');
        return currentUser;
    }
    
    console.log('🔐 Initializing authentication...');
    
    // Initialize Supabase with config
    await initializeSupabase();
    
    try {
        // Check for guest user first
        const guestUser = localStorage.getItem('guestUser');
        if (guestUser) {
            currentUser = JSON.parse(guestUser);
            console.log('👤 Found guest user:', currentUser.name);
            
            // If on login page, allow access (user wants to switch accounts)
            if (isLoginPage()) {
                console.log('� Guest user on login page, allowing login access...');
                authInitialized = true;
                return null; // Return null so login page can function normally
            }
            
            authInitialized = true;
            return currentUser;
        }

        // Check Supabase auth if available
        if (supabase) {
            console.log('🔍 Checking Supabase session...');
            console.log('🔗 Current URL:', window.location.href);
            console.log('🔗 URL hash:', window.location.hash);
            
            // Set up auth state change listener
            supabase.auth.onAuthStateChange(async (event, session) => {
                console.log('🔄 Auth state changed:', event, session?.user?.email);
                
                if (event === 'SIGNED_IN' && session?.user) {
                    currentUser = {
                        id: session.user.id,
                        email: session.user.email,
                        name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'User',
                        avatar: session.user.user_metadata?.avatar_url || '👤',
                        isGuest: false
                    };
                    
                    console.log('✅ User signed in:', currentUser.email);
                    
                    // Only redirect to home if not explicitly on login page
                    if (isLoginPage() && !isRedirecting && !window.location.search.includes('force')) {
                        console.log('🔄 User is on login page but authenticated, staying on login...');
                        return;
                    }
                } else if (event === 'SIGNED_OUT') {
                    currentUser = null;
                    console.log('🚪 User signed out');
                }
            });
            
            const { data: { session }, error } = await supabase.auth.getSession();
            
            if (error) {
                console.warn('⚠️ Error getting session:', error);
                return handleUnauthenticated();
            }

            if (session?.user) {
                console.log('✅ Found authenticated user:', session.user.email);
                currentUser = {
                    id: session.user.id,
                    email: session.user.email,
                    name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'User',
                    avatar: session.user.user_metadata?.avatar_url || '👤',
                    isGuest: false
                };
                
                // If on login page and we have an authenticated user, allow them to stay
                if (isLoginPage()) {
                    console.log('� Authenticated user on login page, allowing access...');
                    authInitialized = true;
                    return currentUser;
                }
                
                authInitialized = true;
                return currentUser;
            }
        }

        return handleUnauthenticated();
    } catch (error) {
        console.error('❌ Auth initialization error:', error);
        return handleUnauthenticated();
    }
}

// Handle unauthenticated users
function handleUnauthenticated() {
    console.log('🚫 No authenticated user found');
    
    // If on quiz page without authentication, redirect to login
    if (isQuizPage() && !isRedirecting) {
        console.log('🔄 Redirecting unauthenticated user to login...');
        isRedirecting = true;
        window.location.href = '/login';
        return null;
    }
    
    // If on login page, just stay here
    if (isLoginPage()) {
        console.log('📝 Ready for login');
        authInitialized = true;
        return null;
    }
    
    // If on home page, allow access as guest
    if (isHomePage()) {
        console.log('🏠 Allowing home page access without auth');
        authInitialized = true;
        return null;
    }

    return null;
}

// Sign in with Google
async function signInWithGoogle() {
    console.log('🔄 Attempting Google sign in...');
    
    if (!supabase) {
        console.error('❌ Supabase client not available');
        alert('Authentication service unavailable. Please try again later.');
        return;
    }

    try {
        console.log('🌐 Current origin:', window.location.origin);
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${window.location.origin}/`,
                queryParams: {
                    access_type: 'offline',
                    prompt: 'consent'
                }
            }
        });

        if (error) {
            console.error('❌ Google sign in error:', error);
            alert('Failed to sign in with Google: ' + error.message);
        } else {
            console.log('✅ Google sign in initiated', data);
        }
    } catch (error) {
        console.error('❌ Google sign in error:', error);
        alert('Failed to sign in with Google. Please try again.');
    }
}

// Continue as guest
function continueAsGuest() {
    console.log('👤 Continuing as guest...');
    
    const guestUser = {
        id: 'guest_' + Date.now(),
        email: 'guest@mathbubble.com',
        name: 'Guest User',
        avatar: '👤',
        isGuest: true
    };

    localStorage.setItem('guestUser', JSON.stringify(guestUser));
    currentUser = guestUser;
    
    console.log('✅ Guest user created');
    
    // Redirect to home
    isRedirecting = true;
    window.location.href = '/';
}

// Sign out function
async function signOut() {
    console.log('🚪 Signing out...');
    
    try {
        if (supabase && currentUser && !currentUser.isGuest) {
            await supabase.auth.signOut();
        }
        
        // Clear all user data
        localStorage.removeItem('guestUser');
        currentUser = null;
        authInitialized = false;
        
        console.log('✅ Signed out successfully');
        
        // Redirect to login
        isRedirecting = true;
        window.location.href = '/login';
    } catch (error) {
        console.error('❌ Sign out error:', error);
        // Force redirect even if there's an error
        localStorage.removeItem('guestUser');
        isRedirecting = true;
        window.location.href = '/login';
    }
}

// Show already signed in state
function showAlreadySignedInState(user) {
    const alreadySignedIn = document.getElementById('already-signed-in');
    const loginForm = document.getElementById('login-form');
    const currentUserEmail = document.getElementById('current-user-email');
    
    if (alreadySignedIn && loginForm) {
        alreadySignedIn.style.display = 'block';
        loginForm.style.display = 'none';
        
        if (currentUserEmail) {
            currentUserEmail.textContent = user.email || user.name;
        }
    }
}

// Show login form
function showLoginForm() {
    const alreadySignedIn = document.getElementById('already-signed-in');
    const loginForm = document.getElementById('login-form');
    
    if (alreadySignedIn && loginForm) {
        alreadySignedIn.style.display = 'none';
        loginForm.style.display = 'block';
    }
}

// Set up event listeners when DOM is loaded
document.addEventListener('DOMContentLoaded', async function() {
    console.log('📄 DOM loaded, setting up auth...');
    
    // Prevent multiple initializations
    if (authInitialized && !isRedirecting) {
        console.log('⚠️ Auth already initialized');
        return;
    }
    
    // Small delay to ensure everything is ready
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Initialize auth
    await initializeAuth();

    // Set up login page buttons (check for both / and /login paths)
    if (isLoginPage()) {
        console.log('📝 Setting up login page event listeners...');
        
        // Check if user is already authenticated (exclude guests)
        setTimeout(() => {
            const currentUser = window.authManager?.getCurrentUser();
            if (currentUser && !currentUser.isGuest) {
                showAlreadySignedInState(currentUser);
            } else {
                // Show login form for guests or unauthenticated users
                showLoginForm();
            }
        }, 100);
        
        const googleSignInBtn = document.getElementById('google-login-btn');
        const guestSignInBtn = document.getElementById('guest-login-btn');
        const goHomeBtn = document.getElementById('go-home-btn');
        const signOutSwitchBtn = document.getElementById('sign-out-and-switch-btn');

        if (googleSignInBtn) {
            console.log('✅ Found Google sign in button');
            googleSignInBtn.addEventListener('click', function(e) {
                e.preventDefault();
                console.log('🖱️ Google button clicked');
                signInWithGoogle();
            });
        } else {
            console.warn('⚠️ Google sign in button not found');
        }

        if (guestSignInBtn) {
            console.log('✅ Found Guest sign in button');
            guestSignInBtn.addEventListener('click', function(e) {
                e.preventDefault();
                console.log('🖱️ Guest button clicked');
                continueAsGuest();
            });
        } else {
            console.warn('⚠️ Guest sign in button not found');
        }
        
        if (goHomeBtn) {
            goHomeBtn.addEventListener('click', function(e) {
                e.preventDefault();
                console.log('🏠 Go home clicked');
                window.location.href = '/';
            });
        }
        
        if (signOutSwitchBtn) {
            signOutSwitchBtn.addEventListener('click', function(e) {
                e.preventDefault();
                console.log('🔄 Sign out and switch clicked');
                signOut();
            });
        }
    }

    // Set up quiz page elements
    if (isQuizPage()) {
        console.log('🎯 Setting up quiz page event listeners...');
        
        const signOutBtn = document.getElementById('sign-out-btn');
        if (signOutBtn) {
            signOutBtn.addEventListener('click', function(e) {
                e.preventDefault();
                signOut();
            });
        }

        // Set up user profile menu toggle
        const userProfile = document.getElementById('user-profile');
        const userMenu = document.getElementById('user-menu');
        
        if (userProfile && userMenu) {
            userProfile.addEventListener('click', function(e) {
                e.stopPropagation();
                userMenu.classList.toggle('show');
            });

            // Close menu when clicking outside
            document.addEventListener('click', function() {
                userMenu.classList.remove('show');
            });
        }
    }
});

// Export functions for use in other scripts
window.authManager = {
    initializeAuth,
    signOut,
    signInWithGoogle,
    continueAsGuest,
    getCurrentUser: () => currentUser,
    getSupabaseConfig: () => ({ url: SUPABASE_URL, key: SUPABASE_ANON_KEY })
};

console.log('🔐 Auth manager loaded and ready!');