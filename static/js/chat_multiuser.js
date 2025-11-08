// Multi-User Chat JavaScript
let socket;
let currentChatUserId = null;
let currentChatUserTag = null;
let displayedMessageIds = new Set();
let lastTimestamp = '';
let selectedFile = null;
let conversations = {}; // Store messages per user

// Initialize Socket.IO
function initSocket() {
    socket = io({
        transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
        console.log('Connected to server');
        socket.emit('join', { user_id: CURRENT_USER_ID });
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from server');
    });

    socket.on('new_message', (data) => {
        const message = data.message;
        
        // Only display if from current chat user
        if (currentChatUserId && 
            (message.sender_id === currentChatUserId || message.receiver_id === currentChatUserId)) {
            displayMessage(message);
            scrollToBottom();
        }
        
        // Store in conversations
        const otherUserId = message.sender_id === CURRENT_USER_ID ? message.receiver_id : message.sender_id;
        if (!conversations[otherUserId]) {
            conversations[otherUserId] = [];
        }
        conversations[otherUserId].push(message);
    });

    socket.on('message_sent', (data) => {
        const message = data.message;
        if (currentChatUserId && message.receiver_id === currentChatUserId) {
            displayMessage(message);
            scrollToBottom();
        }
    });
}

// Search functionality
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
let searchTimeout;

searchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    
    clearTimeout(searchTimeout);
    
    if (query.length === 0) {
        searchResults.classList.remove('show');
        searchResults.innerHTML = '';
        return;
    }
    
    searchTimeout = setTimeout(() => {
        searchUsers(query);
    }, 300);
});

// Close search results when clicking outside
document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
        searchResults.classList.remove('show');
    }
});

async function searchUsers(query) {
    try {
        const response = await fetch(`/api/search_users?q=${encodeURIComponent(query)}`);
        const data = await response.json();
        
        if (data.success && data.users.length > 0) {
            searchResults.innerHTML = '';
            data.users.forEach(user => {
                const item = document.createElement('div');
                item.className = 'search-result-item';
                item.innerHTML = `
                    <span class="user-tag">${user.user_tag}</span>
                    <span class="username">${user.username}</span>
                `;
                item.addEventListener('click', () => {
                    openChat(user);
                    searchInput.value = '';
                    searchResults.classList.remove('show');
                });
                searchResults.appendChild(item);
            });
            searchResults.classList.add('show');
        } else {
            searchResults.innerHTML = '<div class="search-result-item">No users found</div>';
            searchResults.classList.add('show');
        }
    } catch (error) {
        console.error('Search error:', error);
    }
}

// Open chat with a user
async function openChat(user) {
    currentChatUserId = user.id;
    currentChatUserTag = user.user_tag || user.username;
    
    // Update chat header
    const chatHeader = document.getElementById('chatHeader');
    chatHeader.innerHTML = `
        <div class="contact-avatar">${user.username[0].toUpperCase()}</div>
        <div class="chat-header-info">
            <h3>${user.user_tag || user.username}</h3>
            <span class="status">Online</span>
        </div>
    `;
    
    // Show message input
    document.getElementById('messageInputContainer').style.display = 'flex';
    
    // Load messages for this user
    await loadMessages(user.id);
    
    // Add to contacts list if not already there
    addToContactsList(user);
}

function addToContactsList(user) {
    const contactsList = document.getElementById('contactsList');
    const existingContact = contactsList.querySelector(`[data-user-id="${user.id}"]`);
    
    if (!existingContact) {
        const contact = document.createElement('div');
        contact.className = 'contact';
        contact.dataset.userId = user.id;
        contact.innerHTML = `
            <div class="contact-avatar">${user.username[0].toUpperCase()}</div>
            <div class="contact-info">
                <h3>${user.user_tag || user.username}</h3>
                <p class="status">Online</p>
            </div>
        `;
        contact.addEventListener('click', () => openChat(user));
        contactsList.appendChild(contact);
    }
    
    // Update active state
    document.querySelectorAll('.contact').forEach(c => c.classList.remove('active'));
    const activeContact = contactsList.querySelector(`[data-user-id="${user.id}"]`);
    if (activeContact) {
        activeContact.classList.add('active');
    }
}

// Load messages for a specific user
async function loadMessages(userId) {
    try {
        const response = await fetch(`/api/messages?friend_id=${userId}`);
        const data = await response.json();
        
        if (data.success) {
            const messagesContainer = document.getElementById('messages');
            messagesContainer.innerHTML = '';
            displayedMessageIds.clear();
            
            data.messages.forEach(message => {
                displayMessage(message);
            });
            
            if (data.messages.length > 0) {
                lastTimestamp = data.messages[data.messages.length - 1].created_at;
            }
            
            scrollToBottom();
            
            // Store in conversations
            conversations[userId] = data.messages;
        }
    } catch (error) {
        console.error('Error loading messages:', error);
    }
}

// Display a single message
function displayMessage(message) {
    if (displayedMessageIds.has(message.id)) {
        return;
    }
    displayedMessageIds.add(message.id);
    
    const messagesContainer = document.getElementById('messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${message.sender_id === CURRENT_USER_ID ? 'sent' : 'received'}`;
    
    let content = '';
    
    if (message.file_url) {
        if (message.file_type && message.file_type.startsWith('image')) {
            content += `<img src="${message.file_url}" alt="Image" class="message-image">`;
        } else if (message.file_type && message.file_type.startsWith('video')) {
            content += `<video controls class="message-video"><source src="${message.file_url}" type="${message.file_type}"></video>`;
        } else {
            content += `<a href="${message.file_url}" target="_blank" class="file-link">📎 File</a>`;
        }
    }
    
    if (message.content) {
        content += `<p>${escapeHtml(message.content)}</p>`;
    }
    
    const timestamp = message.created_at ? message.created_at.substring(0, 16).replace('T', ' ') : '';
    content += `<span class="timestamp">${timestamp}</span>`;
    
    messageDiv.innerHTML = `<div class="message-content">${content}</div>`;
    messagesContainer.appendChild(messageDiv);
    
    // Update last timestamp
    if (message.created_at && message.created_at > lastTimestamp) {
        lastTimestamp = message.created_at;
    }
}

// Send message
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');
const fileInput = document.getElementById('fileInput');
const filePreview = document.getElementById('filePreview');

messageForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!currentChatUserId) {
        alert('Please select a user to chat with');
        return;
    }
    
    const content = messageInput.value.trim();
    
    if (!content && !selectedFile) {
        return;
    }
    
    const formData = new FormData();
    formData.append('receiver_id', currentChatUserId);
    formData.append('content', content);
    
    if (selectedFile) {
        formData.append('file', selectedFile);
    }
    
    try {
        const response = await fetch('/api/send_message', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            messageInput.value = '';
            selectedFile = null;
            filePreview.innerHTML = '';
            fileInput.value = '';
        } else {
            alert('Failed to send message: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Send error:', error);
        alert('Failed to send message');
    }
});

// File upload handling
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (file.size > 16 * 1024 * 1024) {
        alert('File size must be less than 16MB');
        fileInput.value = '';
        return;
    }
    
    selectedFile = file;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        filePreview.innerHTML = `
            <div class="file-preview-item">
                ${file.type.startsWith('image') ? 
                    `<img src="${e.target.result}" alt="Preview">` : 
                    `<span>📎 ${file.name}</span>`
                }
                <button onclick="clearFilePreview()" class="clear-file-btn">×</button>
            </div>
        `;
    };
    reader.readAsDataURL(file);
});

function clearFilePreview() {
    selectedFile = null;
    filePreview.innerHTML = '';
    fileInput.value = '';
}

// Polling for new messages
async function fetchNewMessages() {
    if (!currentChatUserId) return;
    
    try {
        let url = `/api/messages?friend_id=${currentChatUserId}`;
        if (lastTimestamp) {
            url += `&since=${encodeURIComponent(lastTimestamp)}`;
        }
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.success && data.messages.length > 0) {
            data.messages.forEach(message => {
                displayMessage(message);
            });
            scrollToBottom();
        }
    } catch (error) {
        console.error('Polling error:', error);
    }
}

// Scroll to bottom
function scrollToBottom() {
    const messagesContainer = document.getElementById('messages');
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Theme switcher
const themeSwitcher = document.getElementById('themeSwitcher');
const body = document.body;

// Load saved theme
const savedTheme = localStorage.getItem('theme') || 'light';
if (savedTheme === 'dark') {
    body.classList.add('dark-mode');
}

themeSwitcher.addEventListener('click', () => {
    body.classList.toggle('dark-mode');
    const currentTheme = body.classList.contains('dark-mode') ? 'dark' : 'light';
    localStorage.setItem('theme', currentTheme);
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initSocket();
    
    // Start polling
    setInterval(fetchNewMessages, 2500);
});
