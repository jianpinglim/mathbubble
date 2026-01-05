// Settings Page JavaScript

// DOM Elements
const settingsSidebarAvatar = document.getElementById('sidebar-avatar');
const settingsSidebarUserName = document.getElementById('sidebar-user-name');
const settingsSidebarHeader = document.getElementById('sidebar-header');
const settingsSidebarUserMenu = document.getElementById('sidebar-user-menu');
const settingsMenuUserAvatarEl = document.getElementById('menu-user-avatar');
const settingsMenuUserNameEl = document.getElementById('menu-user-name');
const settingsMenuUserEmailEl = document.getElementById('menu-user-email');

// Form elements
const firstNameInput = document.getElementById('first-name');
const lastNameInput = document.getElementById('last-name');
const saveBtn = document.getElementById('save-settings-btn');

// Delete modal elements
const deleteAccountBtn = document.getElementById('delete-account-btn');
const deleteModal = document.getElementById('delete-modal');
const confirmInput = document.getElementById('confirm-input');
const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
const confirmDeleteBtn = document.getElementById('confirm-delete-btn');

let settingsCurrentUser = null;

// Initialize page
async function initializeSettingsPage() {
    try {
        // Wait for auth to be ready
        if (!window.authManager) {
            setTimeout(initializeSettingsPage, 100);
            return;
        }
        
        // Wait for auth to initialize
        if (window.authManager.initializeAuth) {
            await window.authManager.initializeAuth();
        }
        
        settingsCurrentUser = window.authManager.getCurrentUser();
        
        if (!settingsCurrentUser) {
            // Not logged in - redirect to login
            window.location.href = '/login';
            return;
        }
        
        if (settingsCurrentUser.isGuest) {
            // Guests should sign in to access settings
            window.location.href = '/login';
            return;
        }
        
        updateSidebarProfile(settingsCurrentUser);
        populateProfileForm(settingsCurrentUser);
        
    } catch (error) {
        console.error('Error initializing settings page:', error);
    }
}

// Update sidebar profile display
function updateSidebarProfile(user) {
    const name = user.name || 'User';
    const email = user.email || '';
    const avatar = user.avatar || '👤';
    
    // Extract first name and make possessive
    const firstName = name.split(' ')[0];
    const possessiveName = firstName.endsWith('s') ? `${firstName}'` : `${firstName}'s`;
    
    if (settingsSidebarUserName) {
        settingsSidebarUserName.textContent = possessiveName;
    }
    
    // Set avatar initials
    if (settingsSidebarAvatar) {
        const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        settingsSidebarAvatar.textContent = initials || 'NA';
    }
    
    // Update menu profile
    if (settingsMenuUserAvatarEl) {
        if (avatar.startsWith('http')) {
            settingsMenuUserAvatarEl.src = avatar;
            settingsMenuUserAvatarEl.style.display = 'block';
        } else {
            settingsMenuUserAvatarEl.style.display = 'none';
        }
    }
    
    if (settingsMenuUserNameEl) {
        settingsMenuUserNameEl.textContent = name;
    }
    
    if (settingsMenuUserEmailEl) {
        settingsMenuUserEmailEl.textContent = email;
    }
}

// Populate profile form with user data
function populateProfileForm(user) {
    const fullName = user.name || '';
    const nameParts = fullName.split(' ');
    
    if (firstNameInput) {
        firstNameInput.value = nameParts[0] || '';
    }
    
    if (lastNameInput) {
        lastNameInput.value = nameParts.slice(1).join(' ') || '';
    }
}

// Save profile changes
async function saveProfile() {
    if (!settingsCurrentUser) return;
    
    const firstName = firstNameInput.value.trim();
    const lastName = lastNameInput.value.trim();
    const fullName = `${firstName} ${lastName}`.trim();
    
    if (!fullName) {
        alert('Please enter at least a first name.');
        return;
    }
    
    try {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
        
        // Get Supabase config
        const supabaseConfig = getSupabaseConfig();
        if (!supabaseConfig?.url || !supabaseConfig?.key) {
            throw new Error('Supabase not configured');
        }
        
        const supabase = window.supabase.createClient(supabaseConfig.url, supabaseConfig.key);
        
        // Update user in database
        const { error } = await supabase
            .from('users')
            .update({ full_name: fullName })
            .eq('id', settingsCurrentUser.id);
        
        if (error) throw error;
        
        // Update local user data
        settingsCurrentUser.name = fullName;
        updateSidebarProfile(settingsCurrentUser);
        
        saveBtn.textContent = 'Saved!';
        setTimeout(() => {
            saveBtn.textContent = 'Save';
            saveBtn.disabled = false;
        }, 2000);
        
    } catch (error) {
        console.error('Error saving profile:', error);
        alert('Failed to save profile. Please try again.');
        saveBtn.textContent = 'Save';
        saveBtn.disabled = false;
    }
}

// Get Supabase config from auth.js
function getSupabaseConfig() {
    if (window.supabaseClient) {
        return {
            url: window.supabaseClient.supabaseUrl,
            key: window.supabaseClient.supabaseKey
        };
    }
    
    // Fallback - try to get from window or environment
    const url = window.SUPABASE_URL || 'https://dfbwpgqjpvcgsvvatlbq.supabase.co';
    const key = window.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmYndwZ3FqcHZjZ3N2dmF0bGJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzU0NTY2NTgsImV4cCI6MjA1MTAzMjY1OH0.oTE-k6hu3x1P2rDfkF_4GTfnpPU0WKI_Tqlt2GqMqHk';
    
    return { url, key };
}

// Show delete modal
function showDeleteModal() {
    deleteModal.style.display = 'flex';
    confirmInput.value = '';
    confirmDeleteBtn.disabled = true;
}

// Hide delete modal
function hideDeleteModal() {
    deleteModal.style.display = 'none';
    confirmInput.value = '';
    confirmDeleteBtn.disabled = true;
}

// Check confirm input
function checkConfirmInput() {
    const value = confirmInput.value.trim();
    confirmDeleteBtn.disabled = value !== 'CONFIRM';
}

// Delete account
async function deleteAccount() {
    if (!settingsCurrentUser || confirmInput.value.trim() !== 'CONFIRM') return;
    
    try {
        confirmDeleteBtn.disabled = true;
        confirmDeleteBtn.textContent = 'Deleting...';
        
        // Use the existing supabase client from auth.js
        const supabase = window.supabaseClient;
        if (!supabase) {
            throw new Error('Supabase not configured');
        }
        
        const userId = settingsCurrentUser.id;
        console.log('Deleting account for user:', userId);
        
        // Call the delete_user function which deletes from auth.users
        // This will cascade to public.users and related tables
        const { error: deleteError } = await supabase.rpc('delete_user');
        
        if (deleteError) {
            console.error('Error deleting user:', deleteError);
            throw deleteError;
        }
        
        console.log('User deleted successfully');
        
        // Clear local storage
        localStorage.clear();
        sessionStorage.clear();
        
        // Redirect to login with success message
        window.location.href = '/login?deleted=true';
        
    } catch (error) {
        console.error('Error deleting account:', error);
        alert('Failed to delete account: ' + (error.message || 'Unknown error'));
        confirmDeleteBtn.textContent = 'Delete Account';
        confirmDeleteBtn.disabled = false;
    }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', function() {
    // Wait for auth manager to be ready
    setTimeout(initializeSettingsPage, 500);
    
    // Sidebar header click (user menu toggle)
    if (settingsSidebarHeader && settingsSidebarUserMenu) {
        settingsSidebarHeader.addEventListener('click', function(e) {
            e.stopPropagation();
            settingsSidebarUserMenu.classList.toggle('show');
        });

        document.addEventListener('click', function() {
            settingsSidebarUserMenu.classList.remove('show');
        });
        
        settingsSidebarUserMenu.addEventListener('click', function(e) {
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
    
    // Save button
    if (saveBtn) {
        saveBtn.addEventListener('click', saveProfile);
    }
    
    // Delete account button
    if (deleteAccountBtn) {
        deleteAccountBtn.addEventListener('click', showDeleteModal);
    }
    
    // Cancel delete button
    if (cancelDeleteBtn) {
        cancelDeleteBtn.addEventListener('click', hideDeleteModal);
    }
    
    // Confirm input
    if (confirmInput) {
        confirmInput.addEventListener('input', checkConfirmInput);
    }
    
    // Confirm delete button
    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', deleteAccount);
    }
    
    // Close modal on overlay click
    if (deleteModal) {
        deleteModal.addEventListener('click', function(e) {
            if (e.target === deleteModal) {
                hideDeleteModal();
            }
        });
    }
    
    // Close modal on Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && deleteModal.style.display === 'flex') {
            hideDeleteModal();
        }
    });
});
