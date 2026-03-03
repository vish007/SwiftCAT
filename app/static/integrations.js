async function render() {
  const res = await fetch('/integrations/connectors');
  const data = await res.json();
  const tbody = document.querySelector('#connectors tbody');
  tbody.innerHTML = '';
  data.forEach(c => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${c.name}</td><td>${c.connector_type}</td><td>${c.status}</td><td>${c.last_sync_at || ''}</td><td>${c.retry_count}</td><td>${c.last_error || ''}</td>`;
    const actionTd = document.createElement('td');
    const btn = document.createElement('button');
    btn.innerText = 'Retry';
    btn.onclick = async () => {
      await fetch(`/integrations/${c.id}/retry`, { method: 'POST' });
      await render();
    };
    actionTd.appendChild(btn);
    tr.appendChild(actionTd);
    tbody.appendChild(tr);
  });
}
render();
