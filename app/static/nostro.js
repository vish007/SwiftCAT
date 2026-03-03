async function loadAccounts() {
  const res = await fetch('/nostro/accounts');
  const data = await res.json();
  const tbody = document.querySelector('#accounts tbody');
  tbody.innerHTML = '';
  data.forEach(a => {
    const cls = a.variance < 0 ? 'negative' : 'positive';
    tbody.innerHTML += `<tr><td>${a.account_no}</td><td>${a.currency}</td><td>${a.bank_name}</td><td>${a.expected_balance.toFixed(2)}</td><td>${a.current_balance.toFixed(2)}</td><td class="${cls}">${a.variance.toFixed(2)}</td></tr>`;
  });
}
loadAccounts();
