(function () {
  function mountWidget(pageName, chips) {
    const host = document.createElement('aside');
    host.className = 'ai-widget';
    host.innerHTML = `
      <button class="ai-toggle">AI Assistant</button>
      <div class="ai-drawer hidden">
        <h3>SwiftCAT AI</h3>
        <div class="chips"></div>
        <textarea id="aiPrompt" rows="3" placeholder="Ask AI for suggestions..."></textarea>
        <button id="aiSend">Send</button>
        <pre id="aiLog"></pre>
      </div>`;
    document.body.appendChild(host);
    const drawer = host.querySelector('.ai-drawer');
    host.querySelector('.ai-toggle').onclick = () => drawer.classList.toggle('hidden');

    const chipsRoot = host.querySelector('.chips');
    chips.forEach((chip) => {
      const btn = document.createElement('button');
      btn.textContent = chip;
      btn.className = 'chip';
      btn.onclick = () => document.getElementById('aiPrompt').value = chip;
      chipsRoot.appendChild(btn);
    });

    host.querySelector('#aiSend').onclick = async () => {
      const prompt = document.getElementById('aiPrompt').value;
      document.getElementById('aiLog').textContent = `[${pageName}] ${prompt}\nUse page actions to run audited API calls.`;
    };
  }

  window.SwiftAIDrawer = { mountWidget };
})();
