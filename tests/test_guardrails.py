from swiftcat.service import ai_draft_action, business_confirm_match, get_message_api, message_actions_api
from swiftcat.store import reset_store


def test_ai_draft_does_not_mutate_message_status():
    reset_store()
    message_before, _ = get_message_api('msg-100')
    ai_draft_action({'message': message_before, 'action': 'confirm_match'})
    message_after, _ = get_message_api('msg-100')
    assert message_after['status'] == 'unmatched'


def test_ai_rationale_audited_on_confirm():
    reset_store()
    message, _ = get_message_api('msg-100')
    draft = ai_draft_action({'message': message, 'action': 'confirm_match'})
    result, _ = business_confirm_match({**draft['payload'], 'ai_rationale': draft['rationale'], 'user_id': 'analyst_1'})
    assert result['message']['status'] == 'matched'
    actions, _ = message_actions_api()
    assert any(a['user_id'] == 'swiftcat_ai' and a['action_type'] == 'ai_rationale' for a in actions)
