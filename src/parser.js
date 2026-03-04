export function parseSwiftMessage(rawMessage, fallbackMt) {
  const mt = fallbackMt || (rawMessage.match(/\{2:I(\d{3})/)?.[1] ? `MT${rawMessage.match(/\{2:I(\d{3})/)?.[1]}` : null);
  const ref = rawMessage.match(/:20:([^\r\n]+)/)?.[1]?.trim() || null;
  const sender = rawMessage.match(/\{1:F01([A-Z0-9]{12})/)?.[1] || null;
  const receiver = rawMessage.match(/\{2:I\d{3}([A-Z0-9]{12})/)?.[1] || null;
  const valueDateAmount = rawMessage.match(/:32A:(\d{6})([A-Z]{3})([0-9,\.]+)/);
  const orderingParty = rawMessage.match(/:50[AFK]?:([\s\S]*?)(?=\n:\d{2}[A-Z]?:|\r\n:\d{2}[A-Z]?:|$)/)?.[1]?.trim() || null;
  const beneficiary = rawMessage.match(/:59[AF]?:([\s\S]*?)(?=\n:\d{2}[A-Z]?:|\r\n:\d{2}[A-Z]?:|$)/)?.[1]?.trim() || null;

  return {
    ref,
    mt,
    parties: {
      sender,
      receiver,
      ordering_party: orderingParty,
      beneficiary
    },
    amount: valueDateAmount
      ? {
          currency: valueDateAmount[2],
          value: Number(valueDateAmount[3].replace(',', '.'))
        }
      : null,
    dates: {
      value_date: valueDateAmount ? `20${valueDateAmount[1].slice(0, 2)}-${valueDateAmount[1].slice(2, 4)}-${valueDateAmount[1].slice(4, 6)}` : null
    }
  };
}
