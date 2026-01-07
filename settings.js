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

// Subject and Topics elements
const subjectPillsContainer = document.getElementById('subject-pills');
const topicsPillsContainer = document.getElementById('topics-pills');

// State for subject/topic selection
let selectedSubject = null;
let selectedTopics = {}; // { subject: [topic1, topic2, ...] }
let availableSubjects = [];
let topicsBySubject = {}; // Cache topics by subject

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
        await loadSubjectsAndTopics();
        await loadUserPreferences();
        
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

// Load subjects and topics from database
async function loadSubjectsAndTopics() {
    try {
        const supabaseConfig = getSupabaseConfig();
        if (!supabaseConfig?.url || !supabaseConfig?.key) {
            console.error('Supabase not configured');
            return;
        }
        
        const supabase = window.supabase.createClient(supabaseConfig.url, supabaseConfig.key);
        
        // Fetch all unique subjects and topics from questions table
        const { data: questions, error } = await supabase
            .from('questions')
            .select('subject, topic');
        
        if (error) throw error;
        
        // Extract unique subjects
        const subjectsSet = new Set();
        topicsBySubject = {};
        
        questions.forEach(q => {
            if (q.subject) {
                subjectsSet.add(q.subject);
                if (!topicsBySubject[q.subject]) {
                    topicsBySubject[q.subject] = new Set();
                }
                if (q.topic) {
                    topicsBySubject[q.subject].add(q.topic);
                }
            }
        });
        
        // Convert sets to arrays
        availableSubjects = Array.from(subjectsSet).sort();
        Object.keys(topicsBySubject).forEach(subject => {
            topicsBySubject[subject] = Array.from(topicsBySubject[subject]).sort();
        });
        
        renderSubjectPills();
        
    } catch (error) {
        console.error('Error loading subjects and topics:', error);
        if (subjectPillsContainer) {
            subjectPillsContainer.innerHTML = '<span class="no-topics-text">Failed to load subjects</span>';
        }
    }
}

// Load user's saved preferences
async function loadUserPreferences() {
    if (!settingsCurrentUser) return;
    
    try {
        const supabaseConfig = getSupabaseConfig();
        const supabase = window.supabase.createClient(supabaseConfig.url, supabaseConfig.key);
        
        const { data, error } = await supabase
            .from('users')
            .select('selected_subject, selected_topics')
            .eq('id', settingsCurrentUser.id)
            .single();
        
        if (error && error.code !== 'PGRST116') throw error;
        
        if (data) {
            selectedSubject = data.selected_subject || null;
            selectedTopics = data.selected_topics || {};
            
            // Re-render with saved preferences
            renderSubjectPills();
            if (selectedSubject) {
                renderTopicPills(selectedSubject);
            }
        }
        
    } catch (error) {
        console.error('Error loading user preferences:', error);
    }
}

// Render subject pills
function renderSubjectPills() {
    if (!subjectPillsContainer) return;
    
    if (availableSubjects.length === 0) {
        subjectPillsContainer.innerHTML = '<span class="no-topics-text">No subjects available</span>';
        return;
    }
    
    subjectPillsContainer.innerHTML = availableSubjects.map(subject => {
        const isSelected = selectedSubject === subject;
        const displayName = formatSubjectName(subject);
        return `<button class="subject-pill${isSelected ? ' selected' : ''}" data-subject="${subject}">${displayName}</button>`;
    }).join('');
    
    // Add click handlers
    subjectPillsContainer.querySelectorAll('.subject-pill').forEach(pill => {
        pill.addEventListener('click', () => handleSubjectClick(pill.dataset.subject));
    });
}

// Handle subject selection
function handleSubjectClick(subject) {
    selectedSubject = subject;
    
    // Initialize selected topics for this subject if not exists
    if (!selectedTopics[subject]) {
        // By default, select all topics
        selectedTopics[subject] = [...(topicsBySubject[subject] || [])];
    }
    
    renderSubjectPills();
    renderTopicPills(subject);
}

// Render topic pills for selected subject
function renderTopicPills(subject) {
    if (!topicsPillsContainer) return;
    
    const topics = topicsBySubject[subject] || [];
    
    if (topics.length === 0) {
        topicsPillsContainer.innerHTML = '<span class="no-topics-text">No topics available for this subject</span>';
        return;
    }
    
    const subjectSelectedTopics = selectedTopics[subject] || [];
    
    topicsPillsContainer.innerHTML = topics.map(topic => {
        const isSelected = subjectSelectedTopics.includes(topic);
        return `<button class="topic-pill${isSelected ? ' selected' : ''}" data-topic="${topic}">${topic}</button>`;
    }).join('');
    
    // Add click handlers
    topicsPillsContainer.querySelectorAll('.topic-pill').forEach(pill => {
        pill.addEventListener('click', () => handleTopicClick(subject, pill.dataset.topic));
    });
}

// Handle topic selection/deselection
function handleTopicClick(subject, topic) {
    if (!selectedTopics[subject]) {
        selectedTopics[subject] = [];
    }
    
    const index = selectedTopics[subject].indexOf(topic);
    if (index > -1) {
        // Deselect - remove from array
        selectedTopics[subject].splice(index, 1);
    } else {
        // Select - add to array
        selectedTopics[subject].push(topic);
    }
    
    renderTopicPills(subject);
}

// Format subject name for display
function formatSubjectName(subject) {
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
        
        // Update user in database (profile + preferences)
        const { error } = await supabase
            .from('users')
            .update({ 
                full_name: fullName,
                selected_subject: selectedSubject,
                selected_topics: selectedTopics
            })
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
