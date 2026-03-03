function dateDistanceDays(a, b) {
  const d1 = new Date(a);
  const d2 = new Date(b);
  return Math.abs((d1 - d2) / (1000 * 60 * 60 * 24));
}

export function buildSuggestions(message, candidates, existingLinks) {
  const linkedIds = new Set(
    existingLinks.flatMap((l) => [l.primary_message_id, l.linked_message_id]),
  );

  return candidates
    .filter((c) => c.id !== message.id && !linkedIds.has(c.id))
    .map((candidate) => {
      const reasons = [];
      let score = 0;

      if (message.parsed.externalRef && message.parsed.externalRef === candidate.parsed.externalRef) {
        score += 0.45;
        reasons.push('shared external reference');
      }

      if (
        Number.isFinite(message.parsed.amount) &&
        Number.isFinite(candidate.parsed.amount) &&
        message.parsed.amount === candidate.parsed.amount
      ) {
        score += 0.25;
        reasons.push('matching amount');
      }

      if (message.parsed.bookingDate && candidate.parsed.bookingDate) {
        const diff = dateDistanceDays(message.parsed.bookingDate, candidate.parsed.bookingDate);
        if (diff <= 2) {
          score += 0.15;
          reasons.push('close booking dates');
        }
      }

      const bicPairMatch =
        message.parsed.senderBic === candidate.parsed.receiverBic &&
        message.parsed.receiverBic === candidate.parsed.senderBic;
      if (bicPairMatch) {
        score += 0.15;
        reasons.push('complementary BIC pair');
      }

      return {
        linked_message_id: candidate.id,
        confidence: Math.min(1, Number(score.toFixed(2))),
        rationale: reasons.join(', '),
      };
    })
    .filter((item) => item.confidence >= 0.3)
    .sort((a, b) => b.confidence - a.confidence);
}
