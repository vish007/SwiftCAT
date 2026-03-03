async function loadAgeing() {
  const accountId = document.getElementById('accountId').value;
  const minAmount = document.getElementById('minAmount').value;
  let url = `/nostro/accounts/${accountId}/ageing`;
  if (minAmount) url += `?min_amount=${minAmount}`;
  const res = await fetch(url);
  const data = await res.json();
  document.getElementById('result').textContent = JSON.stringify(data, null, 2);
}

document.getElementById('load').onclick = loadAgeing;
document.getElementById('export').onclick = () => {
  const accountId = document.getElementById('accountId').value;
  const minAmount = document.getElementById('minAmount').value;
  let url = `/nostro/accounts/${accountId}/ageing/export`;
  if (minAmount) url += `?min_amount=${minAmount}`;
  window.location = url;
};

loadAgeing();
