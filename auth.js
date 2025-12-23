// Supabase configuration - will be fetched from server in production
let SUPABASE_URL = 'https://tmgssumdikxtgcdaykyu.supabase.co';
let SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRtZ3NzdW1kaWt4dGdjZGF5a3l1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2NjMwNDcsImV4cCI6MjA3NTIzOTA0N30.e3T1XokoA5Nb0quLEHsS9VXixgVK6SdMUYojBEvs0ug';

// Initialize Supabase client
if (typeof window.supabaseClient === 'undefined') {
    window.supabaseClient = null;
}

// Get the correct redirect URL based on environment
function getRedirectUrl() {
    const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    
    if (isDevelopment) {
        return `http://localhost:3000/`;
    }
    
    // For production, use the current domain (supports Railway, Render, etc.)
    const redirectUrl = `${window.location.origin}/`;
    console.log('🌐 Using redirect URL:', redirectUrl);
    return redirectUrl;
}

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
            // Validate configuration values
            if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
                console.error('❌ Missing Supabase configuration');
                return;
            }
            
            if (!SUPABASE_URL.startsWith('https://') || SUPABASE_ANON_KEY.length < 100) {
                console.error('❌ Invalid Supabase configuration format');
                console.log('URL:', SUPABASE_URL?.substring(0, 30) + '...');
                console.log('Key length:', SUPABASE_ANON_KEY?.length);
                return;
            }
            
            console.log('🔧 Creating Supabase client...');
            console.log('URL:', SUPABASE_URL);
            console.log('Key length:', SUPABASE_ANON_KEY.length);
            
            // Create client with minimal configuration - DO NOT add custom headers
            // The headers issue causes the "Invalid value" error in production
            window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
                auth: {
                    autoRefreshToken: true,
                    persistSession: true,
                    detectSessionInUrl: true,
                    flowType: 'pkce'
                }
                // Do NOT add global.headers - this causes issues with OAuth callback
            });
            console.log('✅ Supabase client initialized');
        } else {
            console.error('❌ Supabase library not loaded');
        }
    } catch (error) {
        console.error('❌ Supabase client initialization failed:', error);
        console.error('Error details:', {
            name: error.name,
            message: error.message,
            stack: error.stack?.substring(0, 500)
        });
    }
}

// Authentication state
let currentUser = null;
let authInitialized = false;
let isRedirecting = false;

// Check if we're on a login page
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
    
    // Check if user just signed out - don't auto-authenticate
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('signed_out') === 'true') {
        console.log('🚪 User just signed out - skipping auto-authentication');
        authInitialized = true;
        return null;
    }
    
    console.log('🔍 Initializing authentication...');
    
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
                console.log('📝 Guest user on login page, allowing login access...');
                authInitialized = true;
                return null;
            }
            
            authInitialized = true;
            return currentUser;
        }

        // Check Supabase auth if available
        if (window.supabaseClient) {
            console.log('🔍 Checking Supabase session...');
            console.log('🔗 Current URL:', window.location.href);
            console.log('🔗 URL hash:', window.location.hash);
            
            // Set up auth state change listener BEFORE getting session
            window.supabaseClient.auth.onAuthStateChange(async (event, session) => {
                console.log('🔄 Auth state changed:', event, session?.user?.email);
                
                // Check if user just signed out - don't re-authenticate
                const urlParams = new URLSearchParams(window.location.search);
                if (urlParams.get('signed_out') === 'true' && event === 'SIGNED_IN') {
                    console.log('🚫 Ignoring sign-in event - user just signed out');
                    return;
                }
                
                if (event === 'SIGNED_IN' && session?.user) {
                    currentUser = {
                        id: session.user.id,
                        email: session.user.email,
                        name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'User',
                        avatar: session.user.user_metadata?.avatar_url || '👤',
                        isGuest: false
                    };
                    
                    console.log('✅ User signed in:', currentUser.email);
                    
                    // Clean up URL hash tokens after successful authentication
                    if (window.location.hash && window.location.hash.includes('access_token')) {
                        console.log('🧹 Cleaning up URL tokens...');
                        window.history.replaceState(null, '', window.location.pathname);
                    }
                    
                    // Update UI if on home page
                    if (isHomePage()) {
                        updateAuthUI();
                    }
                    
                } else if (event === 'SIGNED_OUT') {
                    currentUser = null;
                    console.log('🚪 User signed out');
                }
            });
            
            // Check if we're in an OAuth callback (either hash or code parameter)
            const hasOAuthCallback = (window.location.hash && window.location.hash.includes('access_token')) || 
                                     (window.location.search && window.location.search.includes('code='));
            
            if (hasOAuthCallback) {
                console.log('⏳ OAuth callback detected in URL, waiting for auth state change...');
                // Wait longer for the auth state listener to process the callback
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                // Check if user was set by the listener
                if (currentUser) {
                    console.log('✅ User authenticated via OAuth callback');
                    authInitialized = true;
                    return currentUser;
                } else {
                    console.warn('⚠️ OAuth callback processed but no user set');
                }
            } else {
                // Only call getSession if there's NO hash (normal page load)
                try {
                    console.log('🔍 Attempting to get current session...');
                    const { data: { session }, error } = await window.supabaseClient.auth.getSession();
                    
                    if (error) {
                        console.warn('⚠️ Error getting session:', error.message);
                    } else if (session?.user) {
                        console.log('✅ Found authenticated user:', session.user.email);
                        currentUser = {
                            id: session.user.id,
                            email: session.user.email,
                            name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'User',
                            avatar: session.user.user_metadata?.avatar_url || '👤',
                            isGuest: false
                        };
                        
                        authInitialized = true;
                        return currentUser;
                    }
                } catch (sessionError) {
                    console.error('❌ Session retrieval failed:', sessionError);
                }
            }
        } else {
            console.warn('⚠️ Supabase client not available, continuing with guest mode');
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
        const redirectUrl = getRedirectUrl();
        console.log('🌐 Current origin:', window.location.origin);
        console.log('🎯 Target redirect URL:', redirectUrl);
        
        const { data, error } = await window.supabaseClient.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: redirectUrl,
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
        // Clear current user immediately to prevent re-authentication
        currentUser = null;
        authInitialized = false;
        
        if (window.supabaseClient && !currentUser?.isGuest) {
            // Sign out from Supabase
            await window.supabaseClient.auth.signOut();
        }
        
        // Clear all possible authentication storage
        localStorage.removeItem('guestUser');
        sessionStorage.clear();
        
        // Clear Supabase session storage specifically
        const supabaseKeys = Object.keys(localStorage).filter(key => 
            key.startsWith('sb-') || key.includes('supabase')
        );
        supabaseKeys.forEach(key => localStorage.removeItem(key));
        
        // Clear any cookies (if any)
        document.cookie.split(";").forEach(cookie => {
            const eqPos = cookie.indexOf("=");
            const name = eqPos > -1 ? cookie.substr(0, eqPos) : cookie;
            document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
        });
        
        console.log('✅ Signed out successfully - all data cleared');
        
        // Force redirect to login without allowing re-authentication
        isRedirecting = true;
        window.location.href = '/login?signed_out=true';
        
    } catch (error) {
        console.error('❌ Sign out error:', error);
        
        // Force clear everything even if there's an error
        currentUser = null;
        authInitialized = false;
        localStorage.removeItem('guestUser');
        sessionStorage.clear();
        
        // Clear Supabase storage
        const supabaseKeys = Object.keys(localStorage).filter(key => 
            key.startsWith('sb-') || key.includes('supabase')
        );
        supabaseKeys.forEach(key => localStorage.removeItem(key));
        
        isRedirecting = true;
        window.location.href = '/login?signed_out=true';
    }
}

// Update auth UI helper
function updateAuthUI() {
    if (typeof initializePage === 'function') {
        initializePage();
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

    // Set up login page buttons
    if (isLoginPage()) {
        console.log('📝 Setting up login page event listeners...');
        
        // Check if user is already authenticated (exclude guests)
        setTimeout(() => {
            const currentUser = window.authManager?.getCurrentUser();
            if (currentUser && !currentUser.isGuest) {
                showAlreadySignedInState(currentUser);
            } else {
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