from swiftcat.service import (
    ai_explain_unmatched,
    business_apply_tolerance,
    business_close_case,
    get_message_api,
)
from swiftcat.store import reset_store


def test_e2e_unmatched_explain_tolerance_close_case():
    reset_store()

    message, _ = get_message_api('msg-100')
    explain = ai_explain_unmatched({'message': message})
    assert 'explanation' in explain

    tolerance, _ = business_apply_tolerance({'message_id': 'msg-100', 'tolerance': 5})
    assert tolerance['message']['status'] == 'ready_to_close'

    close, _ = business_close_case({'message_id': 'msg-100'})
    assert close['message']['status'] == 'closed'
