// Initialize Socket.IO connection
const socket = io();

window.addEventListener('load', () => {
    socket.emit('user_online', { user_id: CURRENT_USER_ID });
});

window.addEventListener('beforeunload', () => {
    socket.emit('user_offline', { user_id: CURRENT_USER_ID });
});

// Listen for presence updates and update the Online label
socket.on('presence_update', (data) => {
    const statusElem = document.querySelector('.chat-header-info .status');
    if (!statusElem) return;
    if (data.online_users.includes(FRIEND_ID)) {
        statusElem.textContent = 'Online';
    } else {
        statusElem.textContent = '';
    }
});

socket.on('connect', () => {
    if (typeof CURRENT_USER_ID !== 'undefined' && CURRENT_USER_ID) {
        socket.emit('join', { user_id: CURRENT_USER_ID });
    }
});

// File preview handling
const fileInput = document.getElementById('fileInput');
const filePreview = document.getElementById('filePreview');
const messageInput = document.getElementById('messageInput');
const messageForm = document.getElementById('messageForm');
const messagesContainer = document.getElementById('messages');

let selectedFile = null;
const displayedMessageIds = new Set(Array.isArray(INITIAL_MESSAGE_IDS) ? INITIAL_MESSAGE_IDS : []);
let latestTimestamp = INITIAL_LAST_TIMESTAMP || null;

// File selection
if (fileInput) {
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            selectedFile = file;
            showFilePreview(file);
        }
    });
}

function showFilePreview(file) {
    if (!filePreview) {
        return;
    }

    filePreview.classList.add('active');
    
    if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
            filePreview.innerHTML = `
                <img src="${e.target.result}" alt="Preview">
                <button onclick="clearFilePreview()">Remove</button>
            `;
        };
        reader.readAsDataURL(file);
    } else if (file.type.startsWith('video/')) {
        filePreview.innerHTML = `
            <p>📹 ${file.name}</p>
            <button onclick="clearFilePreview()">Remove</button>
        `;
    } else {
        filePreview.innerHTML = `
            <p>📎 ${file.name}</p>
            <button onclick="clearFilePreview()">Remove</button>
        `;
    }
}

function clearFilePreview() {
    if (filePreview) {
        filePreview.classList.remove('active');
        filePreview.innerHTML = '';
    }

    if (fileInput) {
        fileInput.value = '';
    }

    selectedFile = null;
}

// Send message
if (messageForm) {
    messageForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const content = messageInput.value.trim();

        if (!content && !selectedFile) {
            return;
        }

        if (!FRIEND_ID) {
            alert('No recipient selected');
            return;
        }

        const formData = new FormData();
        formData.append('receiver_id', FRIEND_ID);

        if (content) {
            formData.append('content', content);
        }

        if (selectedFile) {
            formData.append('file', selectedFile);
        }

        try {
            const response = await fetch('/api/send_message', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (response.ok && result.success) {
                messageInput.value = '';
                clearFilePreview();
                if (result.message) {
                    displayMessage(result.message);
                }
            } else {
                alert('Failed to send message');
            }
        } catch (error) {
            console.error('Error sending message:', error);
            alert('Error sending message');
        }
    });
}

// Display message in UI
function displayMessage(message) {
    if (!message) {
        return;
    }

    if (message.id && displayedMessageIds.has(message.id)) {
        updateLatestTimestamp(message);
        return;
    }

    if (!messagesContainer) {
        return;
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = message.sender_id === CURRENT_USER_ID ? 'message sent' : 'message received';
    
    let contentHTML = '<div class="message-content">';
    
    if (message.file_url) {
        if (message.file_type && message.file_type.startsWith('image')) {
            contentHTML += `<img src="${message.file_url}" alt="Image" class="message-image">`;
        } else if (message.file_type && message.file_type.startsWith('video')) {
            contentHTML += `<video controls class="message-video"><source src="${message.file_url}" type="${message.file_type}"></video>`;
        } else {
            contentHTML += `<a href="${message.file_url}" target="_blank" class="file-link">📎 File</a>`;
        }
    }
    
    if (message.content) {
        contentHTML += `<p>${escapeHtml(message.content)}</p>`;
    }
    
    const istTime = utcToIST(message.created_at);
    contentHTML += `<span class="timestamp">${istTime}</span>`;
    contentHTML += '</div>';
    
    messageDiv.innerHTML = contentHTML;
    messagesContainer.appendChild(messageDiv);
    scrollToBottom();

    if (message.id) {
        displayedMessageIds.add(message.id);
    }
    updateLatestTimestamp(message);
}

// Utility functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTime(date) {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function updateLatestTimestamp(message) {
    if (!message || !message.created_at) {
        return;
    }

    if (!latestTimestamp) {
        latestTimestamp = message.created_at;
        return;
    }

    const currentLast = new Date(latestTimestamp);
    const candidate = new Date(message.created_at);

    if (candidate > currentLast) {
        latestTimestamp = message.created_at;
    }
}

async function fetchNewMessages() {
    if (!FRIEND_ID) {
        return;
    }

    try {
        const params = new URLSearchParams({ friend_id: FRIEND_ID });
        if (latestTimestamp) {
            params.append('since', latestTimestamp);
        }

        const response = await fetch(`/api/messages?${params.toString()}`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            cache: 'no-store'
        });

        const result = await response.json();

        if (response.ok && result.success && Array.isArray(result.messages)) {
            result.messages.forEach((msg) => displayMessage(msg));
        }
    } catch (error) {
        console.error('Error fetching new messages:', error);
    }
}

// Socket.IO events
socket.on('connect', () => {
    console.log('Connected to server');
    if (typeof CURRENT_USER_ID !== 'undefined' && CURRENT_USER_ID) {
        socket.emit('join', { user_id: CURRENT_USER_ID });
        console.log('Joined room for user:', CURRENT_USER_ID);
    }
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
});

socket.on('new_message', (data) => {
    console.log('📩 New message received from friend:', data);
    displayMessage(data.message);
});

socket.on('message_sent', (data) => {
    console.log('✅ Message sent successfully:', data);
    displayMessage(data.message);
});

// Scroll to bottom on load
window.addEventListener('load', () => {
    scrollToBottom();
    fetchNewMessages();
});

setInterval(fetchNewMessages, 2500);

// --- Theme Switcher Logic ---
document.addEventListener('DOMContentLoaded', () => {
    const themeSwitcher = document.getElementById('themeSwitcher');
    const body = document.body;

    if (themeSwitcher) {
        const themeIconLight = document.getElementById('themeIconLight');
        const themeIconDark = document.getElementById('themeIconDark');

        const applyTheme = (theme) => {
            if (theme === 'dark') {
                body.classList.add('dark-mode');
                if (themeIconLight) themeIconLight.classList.remove('active');
                if (themeIconDark) themeIconDark.classList.add('active');
            } else {
                body.classList.remove('dark-mode');
                if (themeIconDark) themeIconDark.classList.remove('active');
                if (themeIconLight) themeIconLight.classList.add('active');
            }
        };

        themeSwitcher.addEventListener('click', () => {
            const isDarkMode = body.classList.contains('dark-mode');
            const newTheme = isDarkMode ? 'light' : 'dark';
            localStorage.setItem('theme', newTheme);
            applyTheme(newTheme);
        });

        // Apply saved theme or default to system preference
        const savedTheme = localStorage.getItem('theme');
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        const initialTheme = savedTheme || (prefersDark ? 'dark' : 'light');
        applyTheme(initialTheme);
    }
});

function utcToIST(utcString) {
    if (!utcString) return '';
    const utcDate = new Date(utcString);
    // IST is UTC + 5:30
    utcDate.setHours(utcDate.getHours() + 5);
    utcDate.setMinutes(utcDate.getMinutes() + 30);
    // Format: DD-MM-YYYY hh:mm AM/PM
    const options = { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true };
    return utcDate.toLocaleString('en-IN', options);
}