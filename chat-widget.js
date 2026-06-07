// ИИ-ассистент Travel & Discover
(function() {
    let isSending = false;
    const botIcon = `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M12 3.25c4.35 0 7.9 3.12 7.9 6.95v4.05c0 3.83-3.55 6.95-7.9 6.95s-7.9-3.12-7.9-6.95V10.2c0-3.83 3.55-6.95 7.9-6.95Zm-3.95 8.7a1.15 1.15 0 1 0 0-2.3 1.15 1.15 0 0 0 0 2.3Zm7.9 0a1.15 1.15 0 1 0 0-2.3 1.15 1.15 0 0 0 0 2.3Zm-6.3 3.15a.75.75 0 0 0 0 1.5h4.7a.75.75 0 0 0 0-1.5h-4.7Z"/>
            <path d="M12 1.75v2.3M3.25 12.2H2.1m19.8 0h-1.15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
    `;
    const userIcon = `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M12 12.2a4.15 4.15 0 1 0 0-8.3 4.15 4.15 0 0 0 0 8.3Zm0 2.05c-4.1 0-7.35 2.15-7.35 4.8 0 .66.54 1.2 1.2 1.2h12.3c.66 0 1.2-.54 1.2-1.2 0-2.65-3.25-4.8-7.35-4.8Z"/>
        </svg>
    `;
    const planeIcon = `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M21 3.8 13.7 21l-3.1-7.6L3 10.3 21 3.8Z"/>
        </svg>
    `;
    const sendIcon = `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M21 3.8 3.5 11.1l7.2 2.2 2.2 7.2L21 3.8Zm-9.5 8.7 4.8-4.8"/>
        </svg>
    `;

    function addMessage(text, isUser) {
        const container = document.getElementById('travelChatMessages');
        if (!container) return;

        const messageDiv = document.createElement('div');
        messageDiv.className = `travel-message ${isUser ? 'travel-user' : 'travel-bot'}`;
        messageDiv.innerHTML = `
            <div class="travel-message-avatar">${isUser ? userIcon : botIcon}</div>
            <div class="travel-message-bubble">
                <div class="travel-message-text">${text.replace(/\n/g, '<br>')}</div>
                <div class="travel-message-time">${new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}</div>
            </div>
        `;
        container.appendChild(messageDiv);
        container.scrollTop = container.scrollHeight;
    }

    async function sendMessage() {
        if (isSending) return;

        const input = document.getElementById('travelChatInput');
        const message = input.value.trim();
        if (!message) return;

        isSending = true;

        const sendBtn = document.getElementById('travelChatSendBtn');
        if (sendBtn) {
            sendBtn.disabled = true;
            sendBtn.style.opacity = '0.5';
        }

        addMessage(message, true);
        input.value = '';

        const container = document.getElementById('travelChatMessages');
        const typingDiv = document.createElement('div');
        typingDiv.className = 'travel-message travel-bot';
        typingDiv.id = 'travelTypingIndicator';
        typingDiv.innerHTML = `
            <div class="travel-message-avatar">${botIcon}</div>
            <div class="travel-message-bubble">
                <div class="travel-message-text">
                    <span class="travel-typing">✈️ ищу ответ</span>
                </div>
            </div>
        `;
        container.appendChild(typingDiv);
        container.scrollTop = container.scrollHeight;

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ message: message })
            });

            const data = await response.json();
            const reply = data.reply || '😔 Извините, не удалось получить ответ. Позвоните нам: +7 (3532) 78-88-88';

            const typingIndicator = document.getElementById('travelTypingIndicator');
            if (typingIndicator) typingIndicator.remove();
            addMessage(reply, false);
        } catch (error) {
            console.error('Ошибка:', error);
            const typingIndicator = document.getElementById('travelTypingIndicator');
            if (typingIndicator) typingIndicator.remove();
            addMessage('😔 Ошибка соединения. Позвоните нам: +7 (3532) 78-88-88', false);
        } finally {
            isSending = false;
            if (sendBtn) {
                sendBtn.disabled = false;
                sendBtn.style.opacity = '1';
            }
        }
    }

    function createWidget() {
        if (document.getElementById('travelChatRoot')) return;

        const styles = document.createElement('style');
        styles.textContent = `
            #travelChatRoot {
                position: fixed !important;
                bottom: 30px !important;
                right: 30px !important;
                z-index: 999999 !important;
                font-family: 'Inter', sans-serif !important;
            }
            .travel-chat-toggle {
                width: 60px !important;
                height: 60px !important;
                background: #ffbd4e !important;
                border: none !important;
                border-radius: 50% !important;
                cursor: pointer !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                box-shadow: 0 4px 15px rgba(255, 189, 78, 0.4) !important;
                transition: all 0.3s ease !important;
            }
            .travel-chat-toggle:hover {
                transform: scale(1.08) !important;
                background: #ffaa2e !important;
                box-shadow: 0 6px 20px rgba(255, 189, 78, 0.5) !important;
            }
            .travel-chat-toggle svg,
            .travel-chat-header-info svg,
            .travel-chat-send svg,
            .travel-message-avatar svg {
                width: 1em !important;
                height: 1em !important;
                display: block !important;
                fill: currentColor !important;
                color: currentColor !important;
            }
            .travel-chat-toggle svg {
                width: 30px !important;
                height: 30px !important;
            }
            .travel-chat-window {
                position: fixed !important;
                bottom: 105px !important;
                right: 30px !important;
                width: 380px !important;
                height: 560px !important;
                background: #29343e !important;
                border-radius: 20px !important;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3) !important;
                flex-direction: column !important;
                overflow: hidden !important;
                border: 1px solid #ffbd4e !important;
                z-index: 999998 !important;
            }
            .travel-chat-header {
                background: #ffbd4e !important;
                padding: 16px 20px !important;
                display: flex !important;
                justify-content: space-between !important;
                align-items: center !important;
                color: #29343e !important;
            }
            .travel-chat-header-info {
                display: flex !important;
                align-items: center !important;
                gap: 10px !important;
                font-weight: 700 !important;
                font-size: 16px !important;
            }
            .travel-chat-header-info svg {
                width: 22px !important;
                height: 22px !important;
            }
            .travel-chat-close {
                background: none !important;
                border: none !important;
                color: #29343e !important;
                font-size: 20px !important;
                cursor: pointer !important;
                opacity: 0.8 !important;
                font-weight: bold !important;
            }
            .travel-chat-close:hover {
                opacity: 1 !important;
            }
            .travel-chat-messages {
                flex: 1 !important;
                overflow-y: auto !important;
                padding: 16px !important;
                background: #1a1e24 !important;
                display: flex !important;
                flex-direction: column !important;
                gap: 12px !important;
            }
            .travel-message {
                display: flex !important;
                gap: 10px !important;
                align-items: flex-start !important;
                animation: travelFadeIn 0.3s ease !important;
            }
            @keyframes travelFadeIn {
                from {
                    opacity: 0;
                    transform: translateY(10px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            .travel-user {
                flex-direction: row-reverse !important;
            }
            .travel-message-avatar {
                width: 34px !important;
                height: 34px !important;
                background: #ffbd4e !important;
                border-radius: 50% !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                font-size: 16px !important;
                flex-shrink: 0 !important;
                color: #29343e !important;
            }
            .travel-user .travel-message-avatar {
                background: #ffbd4e !important;
            }
            .travel-message-bubble {
                max-width: 75% !important;
            }
            .travel-message-text {
                background: #3a4450 !important;
                padding: 10px 16px !important;
                border-radius: 18px !important;
                font-size: 13px !important;
                line-height: 1.5 !important;
                color: #fff !important;
            }
            .travel-user .travel-message-text {
                background: #ffbd4e !important;
                color: #29343e !important;
            }
            .travel-message-time {
                font-size: 10px !important;
                color: #8a9bb0 !important;
                margin-top: 4px !important;
                margin-left: 4px !important;
            }
            .travel-typing {
                display: inline-block !important;
            }
            .travel-typing::after {
                content: '...' !important;
                animation: travelDots 1.5s steps(4, end) infinite !important;
            }
            @keyframes travelDots {
                0%, 20% { content: ''; }
                40% { content: '.'; }
                60% { content: '..'; }
                80%, 100% { content: '...'; }
            }
            .travel-chat-input-area {
                padding: 12px 16px !important;
                background: #1a1e24 !important;
                border-top: 1px solid #ffbd4e !important;
                display: flex !important;
                gap: 10px !important;
            }
            .travel-chat-input {
                flex: 1 !important;
                padding: 12px 16px !important;
                border: 1.5px solid #ffbd4e !important;
                border-radius: 40px !important;
                font-size: 13px !important;
                font-family: 'Inter', sans-serif !important;
                outline: none !important;
                background: #29343e !important;
                color: #fff !important;
            }
            .travel-chat-input::placeholder {
                color: rgba(255, 255, 255, 0.5) !important;
            }
            .travel-chat-input:focus {
                border-color: #ffaa2e !important;
            }
            .travel-chat-send {
                width: 44px !important;
                height: 44px !important;
                background: #ffbd4e !important;
                border: none !important;
                border-radius: 50% !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                cursor: pointer !important;
                transition: all 0.2s !important;
            }
            .travel-chat-send:hover {
                transform: scale(1.05) !important;
                background: #ffaa2e !important;
            }
            .travel-chat-send svg {
                width: 18px !important;
                height: 18px !important;
                color: #29343e !important;
                fill: none !important;
                stroke: currentColor !important;
                stroke-width: 1.8 !important;
                stroke-linecap: round !important;
                stroke-linejoin: round !important;
            }
            @media (max-width: 480px) {
                .travel-chat-window {
                    width: calc(100vw - 40px) !important;
                    height: 500px !important;
                    right: 20px !important;
                    bottom: 80px !important;
                }
                #travelChatRoot {
                    bottom: 20px !important;
                    right: 20px !important;
                }
            }
        `;
        document.head.appendChild(styles);

        const widgetHtml = `
            <div id="travelChatRoot">
                <button class="travel-chat-toggle" id="travelChatToggleBtn">
                    ${botIcon}
                </button>
                <div class="travel-chat-window" id="travelChatWindow">
                    <div class="travel-chat-header">
                        <div class="travel-chat-header-info">
                            ${planeIcon}
                            <span>Travel Assistant</span>
                        </div>
                        <button class="travel-chat-close" id="travelChatCloseBtn">✕</button>
                    </div>
                    <div class="travel-chat-messages" id="travelChatMessages">
                        <div class="travel-message travel-bot">
                            <div class="travel-message-avatar">${botIcon}</div>
                            <div class="travel-message-bubble">
                                <div class="travel-message-text">
                                    ✈️ Привет! Я ваш гид по путешествиям.<br><br>
                                    🌴 **Что я могу:**<br>
                                    • Подобрать идеальный тур<br>
                                    • Рассказать о популярных направлениях<br>
                                    • Показать ближайшие туры<br>
                                    • Ответить на вопросы о ценах<br><br>
                                    💡 Введите <b>/help</b> для списка команд<br><br>
                                    Куда мечтаете отправиться?
                                </div>
                                <div class="travel-message-time">${new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}</div>
                            </div>
                        </div>
                    </div>
                    <div class="travel-chat-input-area">
                        <input type="text" class="travel-chat-input" id="travelChatInput" placeholder="Напишите сообщение..." autocomplete="off">
                        <button class="travel-chat-send" id="travelChatSendBtn">
                            ${sendIcon}
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', widgetHtml);
    }

    function init() {
        createWidget();

        const toggleBtn = document.getElementById('travelChatToggleBtn');
        const closeBtn = document.getElementById('travelChatCloseBtn');
        const chatWindow = document.getElementById('travelChatWindow');
        const sendBtn = document.getElementById('travelChatSendBtn');
        const input = document.getElementById('travelChatInput');

        if (toggleBtn) {
            toggleBtn.onclick = function(e) {
                e.preventDefault();
                if (chatWindow) {
                    chatWindow.style.display = 'flex';
                    this.style.display = 'none';
                }
                return false;
            };
        }

        if (closeBtn) {
            closeBtn.onclick = function(e) {
                e.preventDefault();
                if (chatWindow) {
                    chatWindow.style.display = 'none';
                    if (toggleBtn) toggleBtn.style.display = 'flex';
                }
                return false;
            };
        }

        if (sendBtn) {
            sendBtn.onclick = function(e) {
                e.preventDefault();
                sendMessage();
                return false;
            };
        }

        if (input) {
            input.onkeypress = function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    sendMessage();
                    return false;
                }
            };
        }

        if (chatWindow) chatWindow.style.display = 'none';
        if (toggleBtn) toggleBtn.style.display = 'flex';

        console.log('Travel-ассистент инициализирован');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
