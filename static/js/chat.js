// Initialize Socket.IO connection
const socket = io();

// File preview handling
const fileInput = document.getElementById('fileInput');
const filePreview = document.getElementById('filePreview');
const messageInput = document.getElementById('messageInput');
const messageForm = document.getElementById('messageForm');
const messagesContainer = document.getElementById('messages');

let selectedFile = null;

// File selection
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        selectedFile = file;
        showFilePreview(file);
    }
});

function showFilePreview(file) {
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
    filePreview.classList.remove('active');
    filePreview.innerHTML = '';
    fileInput.value = '';
    selectedFile = null;
}

// Send message
messageForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const content = messageInput.value.trim();
    
    if (!content && !selectedFile) {
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
        
        if (response.ok) {
            messageInput.value = '';
            clearFilePreview();
        } else {
            alert('Failed to send message');
        }
    } catch (error) {
        console.error('Error sending message:', error);
        alert('Error sending message');
    }
});

// Display message in UI
function displayMessage(message) {
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
    
    const timestamp = new Date(message.created_at);
    contentHTML += `<span class="timestamp">${formatTime(timestamp)}</span>`;
    contentHTML += '</div>';
    
    messageDiv.innerHTML = contentHTML;
    messagesContainer.appendChild(messageDiv);
    scrollToBottom();
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

// Socket.IO events
socket.on('connect', () => {
    console.log('Connected to server');
    socket.emit('join', { user_id: CURRENT_USER_ID });
});

socket.on('new_message', (data) => {
    displayMessage(data.message);
});

socket.on('message_sent', (data) => {
    displayMessage(data.message);
});

// Scroll to bottom on load
window.addEventListener('load', () => {
    scrollToBottom();
});

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