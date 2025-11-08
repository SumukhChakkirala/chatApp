// Multi-User Chat JavaScript
let socket;
let currentChatUserId = null;
let currentChatUserTag = null;
let displayedMessageIds = new Set();
let lastTimestamp = '';
let selectedFile = null;
let conversations = {}; // Store messages per user
let unreadCounts = {}; // Track unread messages per user

// Server chat variables
let currentServerId = null;
let currentServerName = null;
let isServerChat = false; // Flag to track if we're in server chat or DM

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
        
        // Determine the other user ID
        const otherUserId = message.sender_id === CURRENT_USER_ID ? message.receiver_id : message.sender_id;
        
        // Only display if from current chat user
        if (currentChatUserId && 
            (message.sender_id === currentChatUserId || message.receiver_id === currentChatUserId)) {
            displayMessage(message);
            scrollToBottom();
        } else if (message.sender_id !== CURRENT_USER_ID) {
            // Increment unread count for this user
            if (!unreadCounts[otherUserId]) {
                unreadCounts[otherUserId] = 0;
            }
            unreadCounts[otherUserId]++;
            updateContactBadge(otherUserId, unreadCounts[otherUserId]);
        }
        
        // Store in conversations
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
    
    socket.on('new_server_message', (message) => {
        if (isServerChat && currentServerId === message.server_id) {
            displayServerMessage(message);
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
            
            for (const user of data.users) {
                // Check friendship status
                const friendStatus = await checkFriendshipStatus(user.id);
                
                const item = document.createElement('div');
                item.className = 'search-result-item';
                
                let actionButton = '';
                if (friendStatus.is_friend) {
                    actionButton = `<button class="btn-small btn-chat" onclick="openChatFromSearch('${user.id}', '${user.user_tag}', '${user.username}')">Chat</button>`;
                } else if (friendStatus.request_status === 'pending_sent') {
                    actionButton = `<button class="btn-small btn-pending-request">Pending</button>`;
                } else if (friendStatus.request_status === 'pending_received') {
                    // Only show accept button if we have a valid request_id
                    if (friendStatus.request_id) {
                        actionButton = `<button class="btn-small btn-accept" onclick="searchAndAccept('${friendStatus.request_id}')">Accept</button>`;
                    } else {
                        actionButton = `<button class="btn-small btn-pending-request">Check Friends Panel</button>`;
                    }
                } else {
                    actionButton = `<button class="btn-small btn-add-friend" onclick="sendFriendRequest('${user.user_tag}')">Add Friend</button>`;
                }
                
                item.innerHTML = `
                    <div class="search-result-info">
                        <span class="user-tag">${user.user_tag}</span>
                        <span class="username">${user.username}</span>
                    </div>
                    <div class="search-result-actions">
                        ${actionButton}
                    </div>
                `;
                
                searchResults.appendChild(item);
            }
            searchResults.classList.add('show');
        } else {
            searchResults.innerHTML = '<div class="search-result-item">No users found</div>';
            searchResults.classList.add('show');
        }
    } catch (error) {
        console.error('Search error:', error);
    }
}

// Open chat from search results
function openChatFromSearch(userId, userTag, username) {
    const user = {
        id: userId,
        user_tag: userTag,
        username: username
    };
    openChat(user);
    document.getElementById('searchInput').value = '';
    searchResults.classList.remove('show');
}

// Accept request from search
async function searchAndAccept(requestId) {
    if (!requestId || requestId === 'undefined' || requestId === 'null') {
        alert('Invalid request ID. Please use the Friends panel to accept requests.');
        return;
    }
    await acceptFriendRequest(requestId);
    // Refresh search
    const query = document.getElementById('searchInput').value.trim();
    if (query) {
        searchUsers(query);
    }
}


// Open chat with a user
async function openChat(user) {
    // Check if they are friends
    const friendStatus = await checkFriendshipStatus(user.id);
    
    if (!friendStatus.is_friend) {
        alert('You can only chat with friends. Send a friend request first!');
        return;
    }
    
    // Leave server room if in one (before clearing state)
    if (socket && currentServerId) {
        socket.emit('leave_server', { server_id: currentServerId });
    }

    // Reset server chat state
    isServerChat = false;
    currentServerId = null;
    currentServerName = null;

    // Reset root container for DM view
    const messagesRoot = document.getElementById('messages');
    if (messagesRoot) messagesRoot.innerHTML = '';
    
    currentChatUserId = user.id;
    currentChatUserTag = user.user_tag || user.username;
    
    // Update chat header
    const chatHeader = document.getElementById('chatHeader');
    chatHeader.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
            <div class="contact-avatar">${user.username[0].toUpperCase()}</div>
            <div class="chat-header-info">
                <h3>${user.user_tag || user.username}</h3>
                <span class="status">Online</span>
            </div>
        </div>
        <button class="settings-btn" onclick="openDmSettings('${user.id}', '${user.user_tag || user.username}')" title="Chat Settings">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M12 1v6m0 6v6m0-13a9 9 0 0 1 0 18 9 9 0 0 1 0-18z"></path>
                <path d="M12 1v6m0 6v6"></path>
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M12 8v.01M12 12v.01M12 16v.01"></path>
            </svg>
        </button>
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
    let existingContact = contactsList.querySelector(`[data-user-id="${user.id}"]`);
    
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
            <span class="contact-badge" id="badge-${user.id}" style="display: none;">0</span>
        `;
        contact.addEventListener('click', () => openChat(user));
        contactsList.insertBefore(contact, contactsList.firstChild); // Add to top
        existingContact = contact;
    } else {
        // Move existing contact to top
        contactsList.insertBefore(existingContact, contactsList.firstChild);
    }
    
    // Update active state and clear badge for this contact
    document.querySelectorAll('.contact').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.server-item').forEach(s => s.classList.remove('active'));
    if (existingContact) {
        existingContact.classList.add('active');
        // Clear unread count when opening chat
        unreadCounts[user.id] = 0;
        updateContactBadge(user.id, 0);
    }
}

// Update contact notification badge
function updateContactBadge(userId, count) {
    const badge = document.getElementById(`badge-${userId}`);
    if (badge) {
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.style.display = 'block';
        } else {
            badge.style.display = 'none';
        }
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
    messageDiv.className = `message ${message.sender_id === CURRENT_USER_ID ? 'sent' : 'received'} message-hoverable`;
    messageDiv.dataset.messageId = message.id;
    
    let content = '';
    
    // Build reply preview if this message is replying to another
    if (message.replied_to) {
        const repliedContent = escapeHtml(message.replied_to.content || '').substring(0, 50);
        const repliedSender = message.replied_to.sender?.username || 'Unknown';
        content += `
            <div class="reply-preview">
                <div class="reply-preview-sender">${repliedSender}</div>
                <div class="reply-preview-text">${repliedContent}${message.replied_to.content?.length > 50 ? '...' : ''}</div>
            </div>
        `;
    }
    
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
    
    const timestamp = formatToISTTime(message.created_at);
    if (timestamp) {
        content += `<span class="timestamp">${timestamp}</span>`;
    }
    
    const safeContent = message.content ? escapeHtml(message.content).replace(/`/g, '\\`').replace(/'/g, "\\'") : '';
    const isSent = message.sender_id === CURRENT_USER_ID;
    
    messageDiv.innerHTML = `
        ${!isSent ? `
            <div class="message-content">${content}</div>
            <div class="message-actions">
                <button class="message-action-btn reply-btn" onclick="setReplyTo('${message.id}', 'DM', \`${safeContent}\`)" title="Reply">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="9 14 4 9 9 4"></polyline>
                        <path d="M20 20v-7a4 4 0 0 0-4-4H4"></path>
                    </svg>
                </button>
                <button class="message-action-btn emoji-btn" onclick="showEmojiPicker(event)" title="React">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
                        <line x1="9" y1="9" x2="9.01" y2="9"></line>
                        <line x1="15" y1="9" x2="15.01" y2="9"></line>
                    </svg>
                </button>
            </div>
        ` : `
            <div class="message-actions">
                <button class="message-action-btn emoji-btn" onclick="showEmojiPicker(event)" title="React">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
                        <line x1="9" y1="9" x2="9.01" y2="9"></line>
                        <line x1="15" y1="9" x2="15.01" y2="9"></line>
                    </svg>
                </button>
                <button class="message-action-btn reply-btn" onclick="setReplyTo('${message.id}', 'DM', \`${safeContent}\`)" title="Reply">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="9 14 4 9 9 4"></polyline>
                        <path d="M20 20v-7a4 4 0 0 0-4-4H4"></path>
                    </svg>
                </button>
            </div>
            <div class="message-content">${content}</div>
        `}
    `;
    
    messagesContainer.appendChild(messageDiv);
    
    // Update last timestamp
    if (message.created_at && message.created_at > lastTimestamp) {
        lastTimestamp = message.created_at;
    }
}

// Initialize message form
function initMessageForm() {
    const messageForm = document.getElementById('messageForm');
    const messageInput = document.getElementById('messageInput');
    const fileInput = document.getElementById('fileInput');
    const filePreview = document.getElementById('filePreview');

    messageForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const content = messageInput.value.trim();
        
        console.log('Form submitted:', { 
            content, 
            isServerChat, 
            currentServerId, 
            currentChatUserId 
        });
        
        if (!content && !selectedFile) {
            return;
        }
        
        // Handle server messages
        if (isServerChat && currentServerId) {
            if (!content) {
                return;
            }
            
            console.log('Sending server message:', { server_id: currentServerId, content });
            
            // Send via WebSocket
            const messageData = {
                server_id: currentServerId,
                content: content
            };
            
            // Include reply_to_id if replying
            if (replyingTo) {
                messageData.reply_to_id = replyingTo.id;
            }
            
            socket.emit('server_message', messageData);
            
            messageInput.value = '';
            return;
        }
        
        // Handle DM messages
        if (!currentChatUserId) {
            alert('Please select a user to chat with');
            return;
        }
        
        const formData = new FormData();
        formData.append('receiver_id', currentChatUserId);
        formData.append('content', content);
        
        if (selectedFile) {
            formData.append('file', selectedFile);
        }
        
        // Include reply_to_id if replying
        if (replyingTo) {
            formData.append('reply_to_id', replyingTo.id);
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
                
                // Clear reply state
                if (replyingTo) {
                    cancelReply();
                }
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
}

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

// Format timestamps in India Standard Time (24-hour)
function formatToISTTime(dateInput) {
    if (!dateInput) {
        return '';
    }

    const date = new Date(dateInput);
    if (Number.isNaN(date.getTime())) {
        return '';
    }

    return date.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Asia/Kolkata'
    });
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
    initMessageForm();
    initEmojiPicker();
    
    // Load friends list into sidebar
    loadFriendsToSidebar();
    
    // Load servers list
    loadServersToSidebar();
    
    // Start polling
    setInterval(fetchNewMessages, 2500);
    
    // Initialize friends panel
    initFriendsPanel();
    
    // Initialize server functions
    initServerFunctions();
});

// --- Friends Panel Functionality ---

function initFriendsPanel() {
    const friendsBtn = document.getElementById('friendsBtn');
    const friendsModal = document.getElementById('friendsModal');
    const closeFriendsModal = document.getElementById('closeFriendsModal');
    const tabBtns = document.querySelectorAll('.tab-btn');
    
    // Open friends modal
    friendsBtn.addEventListener('click', () => {
        friendsModal.classList.add('active');
        loadFriendRequests();
        loadFriendsList();
        updateNotificationBadge();
    });
    
    // Close friends modal
    closeFriendsModal.addEventListener('click', () => {
        friendsModal.classList.remove('active');
    });
    
    // Close on backdrop click
    friendsModal.addEventListener('click', (e) => {
        if (e.target === friendsModal) {
            friendsModal.classList.remove('active');
        }
    });
    
    // Tab switching
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            
            // Update active tab button
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Update active tab pane
            document.querySelectorAll('.tab-pane').forEach(pane => {
                pane.classList.remove('active');
            });
            document.getElementById(tab + 'Tab').classList.add('active');
        });
    });
    
    // Poll for new friend requests
    setInterval(() => {
        updateNotificationBadge();
    }, 5000);
    
    // Initial badge update
    updateNotificationBadge();
}

// Load friend requests
async function loadFriendRequests() {
    try {
        const response = await fetch('/api/friends/requests/pending');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Friend requests loaded:', data);
        
        if (data.success) {
            // Display incoming requests
            const incomingContainer = document.getElementById('incomingRequests');
            if (data.incoming.length === 0) {
                incomingContainer.innerHTML = '<p class="empty-state">No incoming requests</p>';
            } else {
                incomingContainer.innerHTML = '';
                data.incoming.forEach(request => {
                    const item = createRequestItem(request, 'incoming');
                    incomingContainer.appendChild(item);
                });
            }
            
            // Display outgoing requests
            const outgoingContainer = document.getElementById('outgoingRequests');
            if (data.outgoing.length === 0) {
                outgoingContainer.innerHTML = '<p class="empty-state">No outgoing requests</p>';
            } else {
                outgoingContainer.innerHTML = '';
                data.outgoing.forEach(request => {
                    const item = createRequestItem(request, 'outgoing');
                    outgoingContainer.appendChild(item);
                });
            }
            
            // Update pending count badge
            const pendingCount = data.incoming.length;
            const pendingCountBadge = document.getElementById('pendingCount');
            if (pendingCount > 0) {
                pendingCountBadge.textContent = pendingCount;
                pendingCountBadge.style.display = 'inline';
            } else {
                pendingCountBadge.style.display = 'none';
            }
        } else {
            console.error('Failed to load friend requests:', data.error);
            document.getElementById('incomingRequests').innerHTML = '<p class="empty-state">Error loading requests</p>';
            document.getElementById('outgoingRequests').innerHTML = '<p class="empty-state">Error loading requests</p>';
        }
    } catch (error) {
        console.error('Error loading friend requests:', error);
        document.getElementById('incomingRequests').innerHTML = '<p class="empty-state">Error: ' + error.message + '</p>';
        document.getElementById('outgoingRequests').innerHTML = '<p class="empty-state">Error: ' + error.message + '</p>';
    }
}

// Create request item element
function createRequestItem(request, type) {
    const div = document.createElement('div');
    div.className = 'request-item';
    
    const user = type === 'incoming' ? request.sender : request.receiver;
    const initial = user.username[0].toUpperCase();
    
    div.innerHTML = `
        <div class="request-avatar">${initial}</div>
        <div class="request-info">
            <div class="request-name">${user.user_tag}</div>
            <div class="request-tag">${user.username}</div>
        </div>
        <div class="request-actions">
            ${type === 'incoming' ? `
                <button class="btn-small btn-accept" onclick="acceptFriendRequest('${request.id}')">Accept</button>
                <button class="btn-small btn-reject" onclick="rejectFriendRequest('${request.id}')">Reject</button>
            ` : `
                <button class="btn-small btn-cancel" onclick="cancelFriendRequest('${request.id}')">Cancel</button>
            `}
        </div>
    `;
    
    return div;
}

// Accept friend request
async function acceptFriendRequest(requestId) {
    try {
        const response = await fetch(`/api/friends/accept/${requestId}`, {
            method: 'POST'
        });
        const data = await response.json();
        
        if (data.success) {
            loadFriendRequests();
            loadFriendsList();
            updateNotificationBadge();
        } else {
            alert('Failed to accept request: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error accepting request:', error);
        alert('Failed to accept request');
    }
}

// Reject friend request
async function rejectFriendRequest(requestId) {
    try {
        const response = await fetch(`/api/friends/reject/${requestId}`, {
            method: 'POST'
        });
        const data = await response.json();
        
        if (data.success) {
            loadFriendRequests();
            updateNotificationBadge();
        } else {
            alert('Failed to reject request: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error rejecting request:', error);
        alert('Failed to reject request');
    }
}

// Cancel friend request
async function cancelFriendRequest(requestId) {
    try {
        const response = await fetch(`/api/friends/reject/${requestId}`, {
            method: 'POST'
        });
        const data = await response.json();
        
        if (data.success) {
            loadFriendRequests();
        } else {
            alert('Failed to cancel request: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error cancelling request:', error);
        alert('Failed to cancel request');
    }
}

// Load friends list
async function loadFriendsList() {
    try {
        const response = await fetch('/api/friends/');
        const data = await response.json();
        
        if (data.success) {
            const friendsContainer = document.getElementById('friendsList');
            if (data.friends.length === 0) {
                friendsContainer.innerHTML = '<p class="empty-state">No friends yet. Send a friend request to get started!</p>';
            } else {
                friendsContainer.innerHTML = '';
                data.friends.forEach(friend => {
                    const item = createFriendItem(friend);
                    friendsContainer.appendChild(item);
                });
            }
        }
    } catch (error) {
        console.error('Error loading friends:', error);
    }
}

// Create friend item element
function createFriendItem(friend) {
    const div = document.createElement('div');
    div.className = 'friend-item';
    
    const initial = friend.username[0].toUpperCase();
    
    div.innerHTML = `
        <div class="friend-avatar">${initial}</div>
        <div class="friend-info">
            <div class="friend-name">${friend.user_tag}</div>
            <div class="friend-tag">${friend.username}</div>
        </div>
        <div class="friend-actions">
            <button class="btn-small btn-chat" onclick="openChatFromFriends('${friend.id}', '${friend.user_tag}', '${friend.username}')">Chat</button>
            <button class="btn-small btn-remove" onclick="removeFriend('${friend.id}')">Remove</button>
        </div>
    `;
    
    return div;
}

// Open chat from friends panel
function openChatFromFriends(userId, userTag, username) {
    const user = {
        id: userId,
        user_tag: userTag,
        username: username
    };
    openChat(user);
    document.getElementById('friendsModal').classList.remove('active');
}

// Remove friend
async function removeFriend(userId) {
    if (!confirm('Are you sure you want to remove this friend?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/friends/${userId}`, {
            method: 'DELETE'
        });
        const data = await response.json();
        
        if (data.success) {
            loadFriendsList();
        } else {
            alert('Failed to remove friend: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error removing friend:', error);
        alert('Failed to remove friend');
    }
}

// Update notification badge
async function updateNotificationBadge() {
    try {
        const response = await fetch('/api/friends/requests/pending');
        const data = await response.json();
        
        if (data.success) {
            const badge = document.getElementById('friendRequestBadge');
            const count = data.incoming.length;
            
            if (count > 0) {
                badge.textContent = count;
                badge.style.display = 'block';
            } else {
                badge.style.display = 'none';
            }
        }
    } catch (error) {
        console.error('Error updating notification badge:', error);
    }
}

// Send friend request from search
async function sendFriendRequest(userTag) {
    try {
        const response = await fetch('/api/friends/request', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ receiver_user_tag: userTag })
        });
        const data = await response.json();
        
        if (data.success) {
            alert('Friend request sent!');
            // Refresh search results to update button
            searchUsers(document.getElementById('searchInput').value.trim());
        } else {
            alert('Failed to send request: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error sending friend request:', error);
        alert('Failed to send friend request');
    }
}

// Check friendship status
async function checkFriendshipStatus(userId) {
    try {
        const response = await fetch(`/api/friends/check/${userId}`);
        const data = await response.json();
        
        if (data.success) {
            return {
                is_friend: data.is_friend,
                request_status: data.request_status
            };
        }
        return { is_friend: false, request_status: 'none' };
    } catch (error) {
        console.error('Error checking friendship:', error);
        return { is_friend: false, request_status: 'none' };
    }
}

// Load friends list into sidebar on page load
async function loadFriendsToSidebar() {
    try {
        const response = await fetch('/api/friends/');
        const data = await response.json();
        
        if (data.success && data.friends.length > 0) {
            const contactsList = document.getElementById('contactsList');
            
            // Clear existing contacts
            contactsList.innerHTML = '';
            
            // Add all friends to the sidebar
            data.friends.forEach(friend => {
                const contact = document.createElement('div');
                contact.className = 'contact';
                contact.dataset.userId = friend.id;
                contact.innerHTML = `
                    <div class="contact-avatar">${friend.username[0].toUpperCase()}</div>
                    <div class="contact-info">
                        <h3>${friend.user_tag}</h3>
                        <p class="status">Online</p>
                    </div>
                    <span class="contact-badge" id="badge-${friend.id}" style="display: none;">0</span>
                `;
                contact.addEventListener('click', () => {
                    openChat({
                        id: friend.id,
                        user_tag: friend.user_tag,
                        username: friend.username
                    });
                });
                contactsList.appendChild(contact);
            });
        }
    } catch (error) {
        console.error('Error loading friends to sidebar:', error);
    }
}

// --- Server/Group Functions ---

function initServerFunctions() {
    const createServerBtn = document.getElementById('createServerBtn');
    const createServerModal = document.getElementById('createServerModal');
    const closeCreateServerModal = document.getElementById('closeCreateServerModal');
    const createServerForm = document.getElementById('createServerForm');
    
    const serverInviteModal = document.getElementById('serverInviteModal');
    const closeServerInviteModal = document.getElementById('closeServerInviteModal');
    
    const serverInvitesModal = document.getElementById('serverInvitesModal');
    const closeServerInvitesModal = document.getElementById('closeServerInvitesModal');
    
    const serverSettingsModal = document.getElementById('serverSettingsModal');
    const closeServerSettingsModal = document.getElementById('closeServerSettingsModal');
    
    const dmSettingsModal = document.getElementById('dmSettingsModal');
    const closeDmSettingsModal = document.getElementById('closeDmSettingsModal');
    
    const serverInvitesBtn = document.getElementById('serverInvitesBtn');
    
    // Open create server modal
    createServerBtn.addEventListener('click', () => {
        createServerModal.classList.add('active');
        document.getElementById('serverName').value = '';
        document.getElementById('serverDescription').value = '';
    });
    
    // Open server invites modal
    serverInvitesBtn.addEventListener('click', () => {
        loadServerInvites();
    });
    
    // Close modals
    closeCreateServerModal.addEventListener('click', () => {
        createServerModal.classList.remove('active');
    });
    
    closeServerInviteModal.addEventListener('click', () => {
        serverInviteModal.classList.remove('active');
    });
    
    closeServerInvitesModal.addEventListener('click', () => {
        serverInvitesModal.classList.remove('active');
    });
    
    closeServerSettingsModal.addEventListener('click', () => {
        serverSettingsModal.classList.remove('active');
    });
    
    closeDmSettingsModal.addEventListener('click', () => {
        dmSettingsModal.classList.remove('active');
    });
    
    // Close on backdrop click
    createServerModal.addEventListener('click', (e) => {
        if (e.target === createServerModal) {
            createServerModal.classList.remove('active');
        }
    });
    
    serverInviteModal.addEventListener('click', (e) => {
        if (e.target === serverInviteModal) {
            serverInviteModal.classList.remove('active');
        }
    });
    
    serverInvitesModal.addEventListener('click', (e) => {
        if (e.target === serverInvitesModal) {
            serverInvitesModal.classList.remove('active');
        }
    });
    
    serverSettingsModal.addEventListener('click', (e) => {
        if (e.target === serverSettingsModal) {
            serverSettingsModal.classList.remove('active');
        }
    });
    
    dmSettingsModal.addEventListener('click', (e) => {
        if (e.target === dmSettingsModal) {
            dmSettingsModal.classList.remove('active');
        }
    });
    
    // Create server form submit
    createServerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await createServer();
    });
    
    // Load pending server invites on init
    updateServerInvitesBadge();
    setInterval(updateServerInvitesBadge, 5000); // Check every 5 seconds
}

// Create a new server
async function createServer() {
    const name = document.getElementById('serverName').value.trim();
    const description = document.getElementById('serverDescription').value.trim();
    
    if (!name) {
        alert('Server name is required');
        return;
    }
    
    try {
        const response = await fetch('/api/servers/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, description })
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert('Server created successfully!');
            document.getElementById('createServerModal').classList.remove('active');
            loadServersToSidebar();
        } else {
            alert('Failed to create server: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error creating server:', error);
        alert('Failed to create server');
    }
}

// Load servers into sidebar
async function loadServersToSidebar() {
    try {
        const response = await fetch('/api/servers/');
        const data = await response.json();
        
        if (data.success) {
            const serversList = document.getElementById('serversList');
            
            if (data.servers.length === 0) {
                serversList.innerHTML = '<p class="empty-state-small">No servers yet</p>';
            } else {
                serversList.innerHTML = '';
                data.servers.forEach(server => {
                    const serverItem = document.createElement('div');
                    serverItem.className = 'server-item';
                    serverItem.dataset.serverId = server.id;
                    
                    const initial = server.name[0].toUpperCase();
                    const memberCount = server.member_count || 0;
                    
                    serverItem.innerHTML = `
                        <div class="server-avatar">${initial}</div>
                        <div class="server-info">
                            <h3>${server.name}</h3>
                            <span class="members-count">${memberCount} member${memberCount !== 1 ? 's' : ''}</span>
                        </div>
                    `;
                    
                    serverItem.addEventListener('click', () => {
                        // Remove active class from all server items
                        document.querySelectorAll('.server-item').forEach(item => {
                            item.classList.remove('active');
                        });
                        // Remove active class from all contacts
                        document.querySelectorAll('.contact').forEach(contact => {
                            contact.classList.remove('active');
                        });
                        // Add active class to clicked server
                        serverItem.classList.add('active');
                        openServer(server);
                    });
                    
                    serversList.appendChild(serverItem);
                });
            }
        }
    } catch (error) {
        console.error('Error loading servers:', error);
    }
}

// Open a server (show chat area)
async function openServer(server) {
    // Leave previous server room if we were in one
    if (currentServerId && currentServerId !== server.id) {
        socket.emit('leave_server', { server_id: currentServerId });
    }

    currentServerId = server.id;
    currentServerName = server.name;
    isServerChat = true;
    currentChatUserId = null; // Clear DM state
    currentChatUserTag = null;

    // Rebuild message root to ensure server container exists
    const messagesRoot = document.getElementById('messages');
    if (messagesRoot) {
        messagesRoot.innerHTML = '<div id="chatMessages"></div>';
    }
    displayedMessageIds.clear();

    // Join server room for WebSocket
    socket.emit('join_server', { server_id: server.id });
    
    // Update chat header
    const chatHeader = document.getElementById('chatHeader');
    chatHeader.style.display = 'flex';
    chatHeader.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
            <div class="server-avatar" style="width: 40px; height: 40px; font-size: 18px;">${server.name[0].toUpperCase()}</div>
            <div>
                <div class="header-username">${server.name}</div>
                <div class="header-status">${server.member_count || 0} members</div>
            </div>
        </div>
        <div style="display: flex; gap: 8px;">
            <button class="settings-btn" onclick="openServerSettings('${server.id}')" title="Server Settings">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M12 1v6m0 6v6m0-13a9 9 0 0 1 0 18 9 9 0 0 1 0-18z"></path>
                    <path d="M12 1v6m0 6v6"></path>
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M12 8v.01M12 12v.01M12 16v.01"></path>
                </svg>
            </button>
            <button class="icon-btn" onclick="showServerInviteModal('${server.id}')" title="Invite Friends">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                    <circle cx="9" cy="7" r="4"></circle>
                    <line x1="19" y1="8" x2="19" y2="14"></line>
                    <line x1="22" y1="11" x2="16" y2="11"></line>
                </svg>
            </button>
        </div>
    `;
    
    // Show message input
    const messageInputContainer = document.getElementById('messageInputContainer');
    messageInputContainer.style.display = 'flex';
    
    // Load server messages
    await loadServerMessages(server.id);
    
    // Focus on message input
    document.getElementById('messageInput').focus();
}

// Show server invite modal
function showServerInviteModal(serverId) {
    currentServerId = serverId;
    document.getElementById('serverInviteModal').classList.add('active');
    loadFriendsForInvite(serverId);
}

// Load friends to invite to server
async function loadFriendsForInvite(serverId) {
    try {
        const response = await fetch('/api/friends/');
        const data = await response.json();
        
        if (data.success) {
            const friendsContainer = document.getElementById('friendsToInviteList');
            
            if (data.friends.length === 0) {
                friendsContainer.innerHTML = '<p class="empty-state">No friends to invite</p>';
            } else {
                friendsContainer.innerHTML = '';
                data.friends.forEach(friend => {
                    const friendItem = document.createElement('div');
                    friendItem.className = 'invite-friend-item';
                    
                    const initial = friend.username[0].toUpperCase();
                    
                    friendItem.innerHTML = `
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div class="friend-avatar">${initial}</div>
                            <div>
                                <div class="friend-name">${friend.user_tag}</div>
                                <div class="friend-tag">${friend.username}</div>
                            </div>
                        </div>
                        <button class="btn-small btn-add-friend" onclick="inviteToServer('${serverId}', '${friend.user_tag}')">Invite</button>
                    `;
                    
                    friendsContainer.appendChild(friendItem);
                });
            }
        }
    } catch (error) {
        console.error('Error loading friends for invite:', error);
    }
}

// Invite a friend to server
async function inviteToServer(serverId, userTag) {
    try {
        const response = await fetch(`/api/servers/${serverId}/invite`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ user_tag: userTag })
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert('Invite sent successfully!');
            loadFriendsForInvite(serverId);
        } else {
            alert('Failed to send invite: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error inviting to server:', error);
        alert('Failed to send invite');
    }
}

// Check for pending server invites
async function updateServerInvitesBadge() {
    try {
        const response = await fetch('/api/servers/invites/pending');
        const data = await response.json();
        
        if (data.success && data.invites && data.invites.length > 0) {
            const serverInvitesBtn = document.getElementById('serverInvitesBtn');
            const serverInvitesBadge = document.getElementById('serverInvitesBadge');
            
            // Show button and badge
            serverInvitesBtn.style.display = '';
            serverInvitesBadge.style.display = '';
            serverInvitesBadge.textContent = data.invites.length;
            
            // Auto-open modal on first load if there are invites
            if (!sessionStorage.getItem('serverInvitesChecked')) {
                sessionStorage.setItem('serverInvitesChecked', 'true');
                loadServerInvites();
            }
        } else {
            // Hide button and badge if no invites
            const serverInvitesBtn = document.getElementById('serverInvitesBtn');
            const serverInvitesBadge = document.getElementById('serverInvitesBadge');
            serverInvitesBtn.style.display = 'none';
            serverInvitesBadge.style.display = 'none';
        }
    } catch (error) {
        console.error('Error checking server invites:', error);
    }
}

async function checkServerInvites() {
    try {
        const response = await fetch('/api/servers/invites/pending');
        const data = await response.json();
        
        if (data.success && data.invites.length > 0) {
            // Could show a notification badge here
            console.log(`You have ${data.invites.length} pending server invite(s)`);
        }
    } catch (error) {
        console.error('Error checking server invites:', error);
    }
}

// Load and show server invites
async function loadServerInvites() {
    try {
        const response = await fetch('/api/servers/invites/pending');
        const data = await response.json();
        
        if (data.success) {
            const invitesContainer = document.getElementById('serverInvitesList');
            
            if (data.invites.length === 0) {
                invitesContainer.innerHTML = '<p class="empty-state">No pending invites</p>';
            } else {
                invitesContainer.innerHTML = '';
                data.invites.forEach(invite => {
                    const inviteItem = document.createElement('div');
                    inviteItem.className = 'server-invite-item';
                    
                    inviteItem.innerHTML = `
                        <div class="server-invite-info">
                            <h4>${invite.server.name}</h4>
                            <p>Invited by ${invite.inviter.user_tag}</p>
                        </div>
                        <div class="server-invite-actions">
                            <button class="btn-small btn-accept" onclick="acceptServerInvite('${invite.id}')">Accept</button>
                            <button class="btn-small btn-reject" onclick="rejectServerInvite('${invite.id}')">Reject</button>
                        </div>
                    `;
                    
                    invitesContainer.appendChild(inviteItem);
                });
            }
            
            document.getElementById('serverInvitesModal').classList.add('active');
        }
    } catch (error) {
        console.error('Error loading server invites:', error);
    }
}

// Accept server invite
async function acceptServerInvite(inviteId) {
    try {
        const response = await fetch(`/api/servers/invites/${inviteId}/accept`, {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert('Server invite accepted!');
            loadServerInvites();
            loadServersToSidebar();
        } else {
            alert('Failed to accept invite: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error accepting invite:', error);
        alert('Failed to accept invite');
    }
}

// Reject server invite
async function rejectServerInvite(inviteId) {
    try {
        const response = await fetch(`/api/servers/invites/${inviteId}/reject`, {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert('Server invite rejected');
            loadServerInvites();
        } else {
            alert('Failed to reject invite: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error rejecting invite:', error);
        alert('Failed to reject invite');
    }
}

// Make function accessible globally
window.inviteToServer = inviteToServer;
window.acceptServerInvite = acceptServerInvite;
window.rejectServerInvite = rejectServerInvite;
window.showServerInviteModal = showServerInviteModal;

// --- Settings Functions ---

// Open server settings modal
async function openServerSettings(serverId) {
    try {
        const response = await fetch(`/api/servers/${serverId}`);
        const data = await response.json();
        
        if (data.success) {
            const server = data.server;
            const currentUserRole = server.members.find(m => m.id === CURRENT_USER_ID)?.role;
            
            document.getElementById('serverSettingsTitle').textContent = `${server.name} - Settings`;
            
            const membersList = document.getElementById('serverMembersList');
            membersList.innerHTML = '';
            
            server.members.forEach(member => {
                const memberItem = document.createElement('div');
                memberItem.className = 'member-item';
                
                const initial = member.username[0].toUpperCase();
                const isCurrentUser = member.id === CURRENT_USER_ID;
                const canRemove = (currentUserRole === 'owner' || currentUserRole === 'admin') && 
                                  member.role !== 'owner' && !isCurrentUser;
                
                memberItem.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
                        <div class="member-avatar">${initial}</div>
                        <div class="member-info">
                            <div class="member-name">${member.user_tag}</div>
                            <div class="member-role ${member.role}">${member.role}</div>
                        </div>
                    </div>
                    ${canRemove ? `<button class="btn-remove" onclick="removeMember('${serverId}', '${member.id}', '${member.username}')">Remove</button>` : ''}
                `;
                
                membersList.appendChild(memberItem);
            });
            
            document.getElementById('serverSettingsModal').classList.add('active');
        }
    } catch (error) {
        console.error('Error loading server settings:', error);
        alert('Failed to load server settings');
    }
}

// Remove member from server
async function removeMember(serverId, memberId, memberName) {
    if (!confirm(`Are you sure you want to remove ${memberName} from the server?`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/servers/${serverId}/members/${memberId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert('Member removed successfully');
            openServerSettings(serverId); // Reload
        } else {
            alert('Failed to remove member: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error removing member:', error);
        alert('Failed to remove member');
    }
}

// Open DM settings modal
async function openDmSettings(userId, userTag) {
    try {
        const response = await fetch(`/api/friends/`);
        const data = await response.json();
        
        if (data.success) {
            const friend = data.friends.find(f => f.id === userId);
            
            if (friend) {
                document.getElementById('dmSettingsTitle').textContent = `${userTag} - Settings`;
                
                // Format friendship date
                const friendshipDate = new Date(friend.friendship_created_at);
                const dateString = friendshipDate.toLocaleDateString('en-IN', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
                
                const dmInfo = document.getElementById('dmSettingsInfo');
                dmInfo.innerHTML = `
                    <p><strong>Username:</strong> ${friend.username}</p>
                    <p><strong>User Tag:</strong> ${friend.user_tag}</p>
                    <p><strong>Friends Since:</strong> ${dateString}</p>
                `;
                
                // Store userId for unfriend action
                window.currentDmUserId = userId;
                window.currentDmUserTag = userTag;
                
                document.getElementById('dmSettingsModal').classList.add('active');
            }
        }
    } catch (error) {
        console.error('Error loading DM settings:', error);
        alert('Failed to load chat settings');
    }
}

// Confirm unfriend
async function confirmUnfriend() {
    if (!confirm(`Are you sure you want to unfriend ${window.currentDmUserTag}? This will remove them from your friends list.`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/friends/${window.currentDmUserId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert('Friend removed successfully');
            document.getElementById('dmSettingsModal').classList.remove('active');
            
            // Close chat and reload friends
            const chatHeader = document.getElementById('chatHeader');
            chatHeader.innerHTML = '<div class="empty-chat-placeholder"><h3>Select a user to start chatting</h3></div>';
            document.getElementById('messageInputContainer').style.display = 'none';
            document.getElementById('chatMessages').innerHTML = '<div class="empty-chat-message"><svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg><p>Search for a user to start chatting</p></div>';
            
            currentChatUserId = null;
            currentChatUserTag = null;
            
            loadFriendsToSidebar();
        } else {
            alert('Failed to remove friend: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error removing friend:', error);
        alert('Failed to remove friend');
    }
}

// Make functions globally accessible
window.openServerSettings = openServerSettings;
window.removeMember = removeMember;
window.openDmSettings = openDmSettings;
window.confirmUnfriend = confirmUnfriend;


// --- Server Messaging Functions ---

// Load server messages
async function loadServerMessages(serverId) {
    try {
        const response = await fetch(`/api/servers/${serverId}/messages`);
        const data = await response.json();
        
        if (data.success) {
            const messagesContainer = document.getElementById('chatMessages');
            messagesContainer.innerHTML = '';
            displayedMessageIds.clear();
            
            data.messages.forEach(message => {
                displayServerMessage(message);
            });
            
            scrollToBottom();
        }
    } catch (error) {
        console.error('Error loading server messages:', error);
    }
}

// Track current reply state
let replyingTo = null;

// Display a server message
function displayServerMessage(message) {
    if (displayedMessageIds.has(message.id)) {
        return;
    }
    displayedMessageIds.add(message.id);

    const messagesContainer = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');

    const senderInfo = message.sender || {};
    const senderId = senderInfo.id;
    const isOwnMessage = (senderId && senderId === CURRENT_USER_ID) || message.is_own_message;

    const senderName = senderInfo.username || (isOwnMessage ? CURRENT_USERNAME : 'Unknown');

    messageDiv.className = `message server-message ${isOwnMessage ? 'sent' : 'received'} message-hoverable`;
    messageDiv.dataset.messageId = message.id;

    const timeString = formatToISTTime(message.created_at);
    const safeContent = escapeHtml(message.content || '').replace(/\n/g, '<br>');
    
    // Build reply preview if this message is replying to another
    let replyPreviewHtml = '';
    if (message.replied_to) {
        const repliedContent = escapeHtml(message.replied_to.content || '').substring(0, 50);
        const repliedSender = message.replied_to.sender?.username || 'Unknown';
        replyPreviewHtml = `
            <div class="reply-preview">
                <div class="reply-preview-sender">${repliedSender}</div>
                <div class="reply-preview-text">${repliedContent}${message.replied_to.content?.length > 50 ? '...' : ''}</div>
            </div>
        `;
    }
    
    const escapedContent = safeContent.replace(/`/g, '\\`').replace(/'/g, "\\'");

    if (isOwnMessage) {
        // Sent messages: clean bubble without sender info (WhatsApp style)
        messageDiv.innerHTML = `
            <div class="message-actions">
                <button class="message-action-btn emoji-btn" onclick="showEmojiPicker(event)" title="React">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
                        <line x1="9" y1="9" x2="9.01" y2="9"></line>
                        <line x1="15" y1="9" x2="15.01" y2="9"></line>
                    </svg>
                </button>
                <button class="message-action-btn reply-btn" onclick="setReplyTo('${message.id}', '${senderName}', \`${escapedContent}\`)" title="Reply">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="9 14 4 9 9 4"></polyline>
                        <path d="M20 20v-7a4 4 0 0 0-4-4H4"></path>
                    </svg>
                </button>
            </div>
            <div class="message-content server-message-bubble">
                ${replyPreviewHtml}
                <div class="server-message-text">${safeContent}</div>
                <span class="server-message-time align-right">${timeString}</span>
            </div>
        `;
    } else {
        // Received messages: show sender name only (no avatar)
        messageDiv.innerHTML = `
            <div class="message-content server-message-bubble">
                ${replyPreviewHtml}
                <div class="server-message-header">
                    <span class="server-message-sender">${senderName}</span>
                    <span class="server-message-time">${timeString}</span>
                </div>
                <div class="server-message-text">${safeContent}</div>
            </div>
            <div class="message-actions">
                <button class="message-action-btn reply-btn" onclick="setReplyTo('${message.id}', '${senderName}', \`${escapedContent}\`)" title="Reply">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="9 14 4 9 9 4"></polyline>
                        <path d="M20 20v-7a4 4 0 0 0-4-4H4"></path>
                    </svg>
                </button>
                <button class="message-action-btn emoji-btn" onclick="showEmojiPicker(event)" title="React">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
                        <line x1="9" y1="9" x2="9.01" y2="9"></line>
                        <line x1="15" y1="9" x2="15.01" y2="9"></line>
                    </svg>
                </button>
            </div>
        `;
    }

    messagesContainer.appendChild(messageDiv);
}

// Show reply option on right-click
function showReplyOption(event, messageId, senderName, content) {
    event.preventDefault();
    setReplyTo(messageId, senderName, content);
}

// Set reply target
function setReplyTo(messageId, senderName, content) {
    replyingTo = { id: messageId, sender: senderName, content: content };
    
    // Show reply bar
    const replyBar = document.getElementById('replyBar') || createReplyBar();
    const replyText = content.replace(/<br>/g, ' ').substring(0, 50);
    replyBar.innerHTML = `
        <div class="reply-bar-content">
            <div class="reply-bar-label">Replying to ${senderName}</div>
            <div class="reply-bar-text">${replyText}${content.length > 50 ? '...' : ''}</div>
        </div>
        <button class="reply-bar-close" onclick="cancelReply()">×</button>
    `;
    replyBar.style.display = 'flex';
    document.getElementById('messageInput').focus();
}

// Create reply bar element if it doesn't exist
function createReplyBar() {
    const replyBar = document.createElement('div');
    replyBar.id = 'replyBar';
    replyBar.className = 'reply-bar';
    const inputContainer = document.getElementById('messageInputContainer');
    inputContainer.insertBefore(replyBar, inputContainer.firstChild);
    return replyBar;
}

// Cancel reply
function cancelReply() {
    replyingTo = null;
    const replyBar = document.getElementById('replyBar');
    if (replyBar) {
        replyBar.style.display = 'none';
    }
}

// Emoji picker functionality
const commonEmojis = [
    '😀', '�', '😄', '😁', '😆', '😅', '🤣', '�😂', '�', '🙃',
    '😉', '😊', '😇', '🥰', '�', '🤩', '😘', '😗', '😚', '😙',
    '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔',
    '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥',
    '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮',
    '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '😎', '🤓',
    '🧐', '😕', '😟', '🙁', '☹️', '😮', '😯', '😲', '😳', '�',
    '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣',
    '😞', '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬', '😈',
    '👿', '💀', '☠️', '💩', '🤡', '👹', '👺', '👻', '👽', '👾',
    '🤖', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾',
    '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
    '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️',
    '✝️', '☪️', '🕉️', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐',
    '⛎', '♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐',
    '♑', '♒', '♓', '🆔', '⚛️', '🉑', '☢️', '☣️', '📴', '📳',
    '🈶', '🈚', '🈸', '🈺', '🈷️', '✴️', '🆚', '💮', '🉐', '㊙️',
    '㊗️', '🈴', '🈵', '🈹', '🈲', '🅰️', '🅱️', '🆎', '🆑', '🅾️',
    '🆘', '❌', '⭕', '�', '⛔', '📛', '🚫', '💯', '💢', '♨️',
    '🚷', '🚯', '🚳', '🚱', '🔞', '📵', '🚭', '❗', '❕', '❓',
    '❔', '‼️', '⁉️', '🔅', '🔆', '〽️', '⚠️', '🚸', '🔱', '⚜️',
    '🔰', '♻️', '✅', '🈯', '💹', '❇️', '✳️', '❎', '🌐', '💠',
    '🔷', '🔶', '🔹', '🔸', '🔺', '🔻', '💠', '🔘', '🔲', '🔳',
    '⚪', '⚫', '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '🟤', '⚽',
    '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🪀',
    '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🥅', '⛳', '🪁', '🏹',
    '🎣', '🤿', '🥊', '🥋', '🎽', '🛹', '🛷', '⛸️', '🥌', '🎿',
    '⛷️', '🏂', '🪂', '🏋️', '🤼', '🤸', '🤺', '⛹️', '🤾', '🏌️',
    '🏇', '🧘', '🏊', '🏄', '🏆', '🥇', '🥈', '🥉', '🏅', '🎖️',
    '🎗️', '🏵️', '🎫', '🎟️', '🎪', '🎭', '🎨', '🎬', '🎤', '🎧',
    '🎼', '🎹', '🥁', '🎷', '🎺', '🎸', '🪕', '🎻', '🎲', '♟️',
    '🎯', '🎳', '🎮', '🎰', '🧩', '�👍', '👎', '👊', '✊', '🤛',
    '🤜', '🤞', '✌️', '🤟', '🤘', '👌', '🤌', '🤏', '👈', '👉',
    '👆', '👇', '☝️', '✋', '🤚', '🖐️', '🖖', '👋', '🤙', '💪',
    '🦾', '🖕', '✍️', '🙏', '🦶', '🦵', '🦿', '💄', '💋', '👄',
    '🦷', '👅', '👂', '🦻', '👃', '👣', '👁️', '👀', '🧠', '🫀',
    '🫁', '🦴', '👤', '👥', '🗣️', '👶', '👧', '🧒', '👦', '👩',
    '🧑', '👨', '👩‍🦱', '🧑‍🦱', '👨‍🦱', '👩‍🦰', '🧑‍🦰', '👨‍🦰', '👱‍♀️', '👱',
    '🔥', '✨', '🌟', '💫', '⭐', '🌈', '☀️', '🌤️', '⛅', '🌥️',
    '☁️', '🌦️', '🌧️', '⛈️', '🌩️', '🌨️', '❄️', '☃️', '⛄', '�️',
    '�', '�', '�', '☔', '🌊', '🌫️', '🎉', '🎊', '🎈', '🎀',
    '🎁', '🎄', '🎃', '🎇', '🧨', '✨', '🎆', '🎐', '🎏', '🎎',
    '🎑', '🎍', '🎋', '🎗️', '🥇', '🥈', '🥉', '🏅', '🎖️', '🏆'
];

function initEmojiPicker() {
    const emojiPickerBtn = document.getElementById('emojiPickerBtn');
    const emojiPicker = document.getElementById('emojiPicker');
    const messageInput = document.getElementById('messageInput');
    
    if (!emojiPickerBtn || !emojiPicker) return;
    
    // Build emoji picker
    let emojiHTML = '<div class="emoji-grid">';
    commonEmojis.forEach(emoji => {
        emojiHTML += `<button type="button" class="emoji-item" data-emoji="${emoji}">${emoji}</button>`;
    });
    emojiHTML += '</div>';
    emojiPicker.innerHTML = emojiHTML;
    
    // Toggle emoji picker
    emojiPickerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        emojiPicker.style.display = emojiPicker.style.display === 'none' ? 'block' : 'none';
    });
    
    // Insert emoji on click
    emojiPicker.addEventListener('click', (e) => {
        if (e.target.classList.contains('emoji-item')) {
            const emoji = e.target.dataset.emoji;
            const cursorPos = messageInput.selectionStart;
            const textBefore = messageInput.value.substring(0, cursorPos);
            const textAfter = messageInput.value.substring(cursorPos);
            messageInput.value = textBefore + emoji + textAfter;
            messageInput.focus();
            messageInput.selectionStart = messageInput.selectionEnd = cursorPos + emoji.length;
            emojiPicker.style.display = 'none';
        }
    });
    
    // Close emoji picker when clicking outside
    document.addEventListener('click', (e) => {
        if (!emojiPickerBtn.contains(e.target) && !emojiPicker.contains(e.target)) {
            emojiPicker.style.display = 'none';
        }
    });
}

function showEmojiPicker(event) {
    event.stopPropagation();
    // For message reactions - you can implement this later
    console.log('Emoji reaction button clicked');
}

// Helper function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}


