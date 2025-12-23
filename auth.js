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
    return `${window.location.origin}/`;
}

// Load config from server in production
async function loadConfig() {
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        try {
            const response = await fetch('/api/config');
            const config = await response.json();
            SUPABASE_URL = config.supabaseUrl;
            SUPABASE_ANON_KEY = config.supabaseKey;
        } catch (error) {
            console.warn('Failed to load production config, using defaults');
        }
    }
}

// Initialize Supabase client
async function initializeSupabase() {
    await loadConfig();
    try {
        if (window.supabase) {
            // Check if client already exists
            if (window.supabaseClient) {
                return;
            }
            
            // Validate configuration values
            if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
                console.error('Missing Supabase configuration');
                return;
            }
            
            if (!SUPABASE_URL.startsWith('https://') || SUPABASE_ANON_KEY.length < 100) {
                console.error('Invalid Supabase configuration format');
                return;
            }
            
            // Create client with minimal configuration
            window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
                auth: {
                    autoRefreshToken: true,
                    persistSession: true,
                    detectSessionInUrl: true,
                    flowType: 'pkce'
                }
            });
        } else {
            console.error('Supabase library not loaded');
        }
    } catch (error) {
        console.error('Supabase client initialization failed:', error.message);
    }
}

// Authentication state
let currentUser = null;
let authInitialized = false;
let isRedirecting = false;
let authInitPromise = null;
let authListenerAttached = false;

// Ensure a row exists in `users` for the signed-in user (needed for FK constraints)
async function ensureUserRow(sessionUser) {
    try {
        if (!window.supabaseClient || !sessionUser?.id) return;

        const payload = {
            id: sessionUser.id,
            email: sessionUser.email
        };

        await window.supabaseClient
            .from('users')
            .upsert(payload, { onConflict: 'id' });
    } catch (error) {
        // Silent fail - not critical for UI
    }
}

// Check if we're on a login page
function isLoginPage() {
    const path = window.location.pathname;
    return path === '/login' || path === '/login.html';
}

// Check if we're on home page
function isHomePage() {
    const path = window.location.pathname;
    return path === '/' || path === '/index.html';
}

// Check if we're on quiz page
function isQuizPage() {
    const path = window.location.pathname;
    return path === '/quiz' || path === '/quiz_page.html';
}

// Initialize authentication
async function initializeAuth() {
    if (authInitialized || isRedirecting) {
        return currentUser;
    }

    if (authInitPromise) {
        return authInitPromise;
    }
    
    // Check if user just signed out
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('signed_out') === 'true') {
        authInitialized = true;
        return null;
    }

    authInitPromise = (async () => {
        await initializeSupabase();

        try {
        // Check for guest user first
        const guestUser = localStorage.getItem('guestUser');
        if (guestUser) {
            currentUser = JSON.parse(guestUser);
            
            if (isLoginPage()) {
                authInitialized = true;
                return null;
            }
            
            authInitialized = true;
            return currentUser;
        }

        // Check Supabase auth if available
        if (window.supabaseClient) {
            // Set up auth state change listener
            if (!authListenerAttached) {
                authListenerAttached = true;
                window.supabaseClient.auth.onAuthStateChange(async (event, session) => {
                const urlParams = new URLSearchParams(window.location.search);
                if (urlParams.get('signed_out') === 'true' && event === 'SIGNED_IN') {
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

                    ensureUserRow(session.user).catch(() => {});
                    
                    if (window.location.hash && window.location.hash.includes('access_token')) {
                        window.history.replaceState(null, '', window.location.pathname);
                    }
                    
                    if (isHomePage()) {
                        updateAuthUI();
                    }
                    
                } else if (event === 'SIGNED_OUT') {
                    currentUser = null;
                }
                });
            }
            
            // Check if we're in an OAuth callback
            const hasOAuthCallback = (window.location.hash && window.location.hash.includes('access_token')) || 
                                     (window.location.search && window.location.search.includes('code='));
            
            if (hasOAuthCallback) {
                // Exchange OAuth code for session
                try {
                    const url = new URL(window.location.href);
                    const code = url.searchParams.get('code');

                    if (code) {
                        const exchangeTimeoutMs = 30000;
                        const exchangeResult = await Promise.race([
                            window.supabaseClient.auth.exchangeCodeForSession(code),
                            new Promise(resolve => setTimeout(() => resolve({ data: null, error: { message: 'timeout' } }), exchangeTimeoutMs))
                        ]);
                        const { data, error } = exchangeResult || {};

                        if (!error && data?.session?.user) {
                            await ensureUserRow(data.session.user);
                            currentUser = {
                                id: data.session.user.id,
                                email: data.session.user.email,
                                name: data.session.user.user_metadata?.full_name || data.session.user.email?.split('@')[0] || 'User',
                                avatar: data.session.user.user_metadata?.avatar_url || '👤',
                                isGuest: false
                            };

                            window.history.replaceState(null, '', window.location.pathname);

                            if (isHomePage()) {
                                updateAuthUI();
                            }
                            authInitialized = true;
                            return currentUser;
                        }
                    }
                } catch (exchangeError) {
                    // Continue to fallback
                }

                // Fallback: allow the auth listener a moment
                await new Promise(resolve => setTimeout(resolve, 1000));

                if (currentUser) {
                    authInitialized = true;
                    return currentUser;
                }

                try {
                    const sessionTimeoutMs = 20000;
                    const sessionResult = await Promise.race([
                        window.supabaseClient.auth.getSession(),
                        new Promise(resolve => setTimeout(() => resolve({ data: { session: null } }), sessionTimeoutMs))
                    ]);
                    const { data: { session } = {} } = sessionResult || {};

                    if (session?.user) {
                        await ensureUserRow(session.user);
                        currentUser = {
                            id: session.user.id,
                            email: session.user.email,
                            name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'User',
                            avatar: session.user.user_metadata?.avatar_url || '👤',
                            isGuest: false
                        };
                        window.history.replaceState(null, '', window.location.pathname);
                        if (isHomePage()) {
                            updateAuthUI();
                        }
                        authInitialized = true;
                        return currentUser;
                    }

                    // Final fallback
                    const { data: userData } = await window.supabaseClient.auth.getUser();
                    if (userData?.user) {
                        await ensureUserRow(userData.user);
                        currentUser = {
                            id: userData.user.id,
                            email: userData.user.email,
                            name: userData.user.user_metadata?.full_name || userData.user.email?.split('@')[0] || 'User',
                            avatar: userData.user.user_metadata?.avatar_url || '👤',
                            isGuest: false
                        };
                        window.history.replaceState(null, '', window.location.pathname);
                        if (isHomePage()) {
                            updateAuthUI();
                        }
                        authInitialized = true;
                        return currentUser;
                    }
                } catch (sessionAfterExchangeError) {
                    // Continue to unauthenticated
                }
            } else {
                // Normal page load - check session
                try {
                    const { data: { session } } = await window.supabaseClient.auth.getSession();
                    
                    if (session?.user) {
                        await ensureUserRow(session.user);
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
                    console.error('Session retrieval failed:', sessionError.message);
                }
            }
        }

        return handleUnauthenticated();
        } catch (error) {
            return handleUnauthenticated();
        }
    })();

    try {
        return await authInitPromise;
    } finally {
        authInitPromise = null;
    }
}

// Handle unauthenticated users
function handleUnauthenticated() {
    if (isQuizPage() && !isRedirecting) {
        isRedirecting = true;
        window.location.href = '/login';
        return null;
    }
    
    if (isLoginPage()) {
        authInitialized = true;
        return null;
    }
    
    if (isHomePage()) {
        authInitialized = true;
        return null;
    }

    return null;
}

// Sign in with Google
async function signInWithGoogle() {
    if (!window.supabaseClient) {
        await initializeSupabase();
    }
    
    if (!window.supabaseClient) {
        alert('Authentication service unavailable. Please try again later.');
        return;
    }

    try {
        const redirectUrl = getRedirectUrl();
        
        const { error } = await window.supabaseClient.auth.signInWithOAuth({
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
            alert('Failed to sign in with Google: ' + error.message);
        }
    } catch (error) {
        alert('Failed to sign in with Google. Please try again.');
    }
}

// Continue as guest
function continueAsGuest() {
    const guestUser = {
        id: 'guest_' + Date.now(),
        email: 'guest@mathbubble.com',
        name: 'Guest User',
        avatar: '👤',
        isGuest: true
    };

    localStorage.setItem('guestUser', JSON.stringify(guestUser));
    currentUser = guestUser;
    
    isRedirecting = true;
    window.location.href = '/';
}

// Sign out function
async function signOut() {
    try {
        currentUser = null;
        authInitialized = false;
        
        if (window.supabaseClient && !currentUser?.isGuest) {
            await window.supabaseClient.auth.signOut();
        }
        
        localStorage.removeItem('guestUser');
        sessionStorage.clear();
        
        const supabaseKeys = Object.keys(localStorage).filter(key => 
            key.startsWith('sb-') || key.includes('supabase')
        );
        supabaseKeys.forEach(key => localStorage.removeItem(key));
        
        document.cookie.split(";").forEach(cookie => {
            const eqPos = cookie.indexOf("=");
            const name = eqPos > -1 ? cookie.substr(0, eqPos) : cookie;
            document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
        });
        
        isRedirecting = true;
        window.location.href = '/login?signed_out=true';
        
    } catch (error) {
        
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
    if (authInitialized && !isRedirecting) {
        return;
    }
    
    // Wire login-related buttons immediately
    const googleSignInBtn = document.getElementById('google-login-btn');
    const guestSignInBtn = document.getElementById('guest-login-btn');
    const goHomeBtn = document.getElementById('go-home-btn');
    const signOutSwitchBtn = document.getElementById('sign-out-and-switch-btn');

    if (googleSignInBtn) {
        googleSignInBtn.addEventListener('click', function(e) {
            e.preventDefault();
            signInWithGoogle();
        });
    }

    if (guestSignInBtn) {
        guestSignInBtn.addEventListener('click', function(e) {
            e.preventDefault();
            continueAsGuest();
        });
    }

    if (goHomeBtn) {
        goHomeBtn.addEventListener('click', function(e) {
            e.preventDefault();
            window.location.href = '/';
        });
    }

    if (signOutSwitchBtn) {
        signOutSwitchBtn.addEventListener('click', function(e) {
            e.preventDefault();
            signOut();
        });
    }

    await new Promise(resolve => setTimeout(resolve, 100));

    const authInitTimeoutMs = 5000;
    await Promise.race([
        initializeAuth(),
        new Promise(resolve => setTimeout(resolve, authInitTimeoutMs))
    ]);

    if (isLoginPage()) {
        const currentUser = window.authManager?.getCurrentUser();
        if (currentUser && !currentUser.isGuest) {
            showAlreadySignedInState(currentUser);
        } else {
            showLoginForm();
        }
    }

    if (isQuizPage()) {
        const signOutBtn = document.getElementById('sign-out-btn');
        if (signOutBtn) {
            signOutBtn.addEventListener('click', function(e) {
                e.preventDefault();
                signOut();
            });
        }

        const userProfile = document.getElementById('user-profile');
        const userMenu = document.getElementById('user-menu');
        
        if (userProfile && userMenu) {
            userProfile.addEventListener('click', function(e) {
                e.stopPropagation();
                userMenu.classList.toggle('show');
            });

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