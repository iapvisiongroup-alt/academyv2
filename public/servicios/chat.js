(() => {
  const launcher = document.querySelector('[data-kia-chat-launcher]');
  const panel = document.querySelector('[data-kia-chat-panel]');
  const closeButton = document.querySelector('[data-kia-chat-close]');
  const body = document.querySelector('[data-kia-chat-body]');
  const form = document.querySelector('[data-kia-chat-form]');
  const input = document.querySelector('[data-kia-chat-input]');
  const sendButton = document.querySelector('[data-kia-chat-send]');
  const quickActions = document.querySelector('[data-kia-quick-actions]');
  const quickTitle = document.querySelector('[data-kia-quick-title]');

  if (!launcher || !panel || !closeButton || !body || !form || !input || !sendButton) return;

  const messages = [];
  let sending = false;
  let typingNode = null;

  launcher.addEventListener('click', openChat);
  closeButton.addEventListener('click', closeChat);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && panel.classList.contains('open')) closeChat();
  });

  form.addEventListener('submit', event => {
    event.preventDefault();
    sendUserMessage(input.value);
  });

  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 110) + 'px';
  });

  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  document.querySelectorAll('[data-kia-quick]').forEach(button => {
    button.addEventListener('click', () => {
      sendUserMessage(button.dataset.kiaQuick || button.textContent);
    });
  });

  function openChat() {
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    launcher.setAttribute('aria-expanded', 'true');
    launcher.hidden = true;
    document.body.style.overflow = 'hidden';
    setTimeout(() => input.focus(), 50);
    scrollToBottom();
    track('services_ai_chat_open');
  }

  function closeChat() {
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    launcher.setAttribute('aria-expanded', 'false');
    launcher.hidden = false;
    document.body.style.overflow = '';
    launcher.focus();
  }

  async function sendUserMessage(rawText) {
    const text = String(rawText || '').trim().slice(0, 1200);
    if (!text || sending) return;

    input.value = '';
    input.style.height = 'auto';
    if (quickActions) quickActions.hidden = true;
    if (quickTitle) quickTitle.hidden = true;

    addMessage('user', text, true);
    setSending(true);
    showTyping();

    try {
      const response = await fetch('/api/services/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: messages.slice(-12) }),
      });
      const data = await response.json().catch(() => ({}));
      removeTyping();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'No se pudo consultar el asistente.');
      }

      addMessage('assistant', data.reply || '¿En qué más puedo ayudarte?', true);
      renderAction(data.action);

      if (data.action?.type === 'booking') {
        track('conversion', {
          send_to: 'AW-18195089658/VFp1CNTdqbwcEPqRjORD',
          source: 'services_ai_booking',
        });
      }
    } catch (error) {
      removeTyping();
      addMessage(
        'system',
        error.message || 'No he podido responder. Puedes escribirnos por WhatsApp al 614 403 913.',
        false
      );
    } finally {
      setSending(false);
    }
  }

  function addMessage(role, text, includeInHistory) {
    const row = document.createElement('div');
    row.className = `kia-message-row ${role}`;

    if (role === 'assistant') {
      const avatar = document.createElement('span');
      avatar.className = 'kia-message-dot';
      avatar.textContent = 'K';
      avatar.setAttribute('aria-hidden', 'true');
      row.appendChild(avatar);
    }

    const node = document.createElement('div');
    node.className = `kia-message ${role}`;
    node.textContent = text;
    row.appendChild(node);
    body.appendChild(row);

    if (includeInHistory && (role === 'user' || role === 'assistant')) {
      messages.push({ role, content: text });
      if (messages.length > 12) messages.splice(0, messages.length - 12);
    }

    scrollToBottom();
  }

  function showTyping() {
    removeTyping();
    const row = document.createElement('div');
    row.className = 'kia-message-row assistant';

    const avatar = document.createElement('span');
    avatar.className = 'kia-message-dot';
    avatar.textContent = 'K';
    avatar.setAttribute('aria-hidden', 'true');

    typingNode = document.createElement('div');
    typingNode.className = 'kia-message kia-typing';
    typingNode.setAttribute('aria-label', 'El asistente está escribiendo');
    typingNode.innerHTML = '<i></i><i></i><i></i>';
    row.appendChild(avatar);
    row.appendChild(typingNode);
    typingNode = row;
    body.appendChild(row);
    scrollToBottom();
  }

  function removeTyping() {
    if (typingNode) typingNode.remove();
    typingNode = null;
  }

  function renderAction(action) {
    if (!action || action.type !== 'availability' || !Array.isArray(action.days)) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'kia-slot-list';

    action.days.slice(0, 6).forEach(day => {
      const label = document.createElement('div');
      label.className = 'kia-slot-day';
      label.textContent = day.label || day.date;
      wrapper.appendChild(label);

      (day.slots || []).forEach(slot => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'kia-slot';
        button.textContent = slot.time;
        button.addEventListener('click', () => {
          sendUserMessage(`Me interesa el ${day.date} a las ${slot.time}.`);
        });
        wrapper.appendChild(button);
      });
    });

    body.appendChild(wrapper);
    scrollToBottom();
  }

  function setSending(value) {
    sending = value;
    input.disabled = value;
    sendButton.disabled = value;
  }

  function scrollToBottom() {
    body.scrollTop = body.scrollHeight;
  }

  function track(name, params = {}) {
    if (typeof window.gtag === 'function') {
      window.gtag('event', name, {
        page_location: window.location.href,
        transport_type: 'beacon',
        ...params,
      });
    }
  }
})();
